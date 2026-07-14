import { NonRetriableError } from "inngest";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { runs, transcripts, metrics, scores, scoreRanges } from "@/lib/db/schema";
import { loadRubricBySlug } from "@/lib/rubrics/loader";
import { presignGetUrl } from "@/lib/r2/presign";
import { transcribeUrl } from "@/lib/deepgram/client";
import { computeTextTimingMetrics } from "@/lib/metrics/deterministic";
import { computeAudioSignalMetrics } from "@/lib/modal/client";
import { runJudgePasses, aggregateScoreRange } from "@/lib/judge/client";
import { inngest, runUploaded } from "./client";

/**
 * Scoring pipeline: transcribe (Deepgram) -> deterministic metrics (text
 * timing in TS + audio signal via Modal) -> LLM judge x3 (forced citations)
 * -> aggregate range. Slide-deck vision scoring is out of scope for this
 * MVP pass (the record flow doesn't collect a slide deck yet).
 */
export const scoreRun = inngest.createFunction(
  {
    id: "score-run",
    retries: 2,
    triggers: { event: runUploaded },
    onFailure: async ({ event, error }) => {
      // `event.data.event` is the original run/uploaded event that triggered this run.
      const runId = event.data.event.data.runId;
      await db
        .update(runs)
        .set({ status: "failed", failureReason: error.message })
        .where(eq(runs.id, runId));
    },
  },
  async ({ event, step }) => {
    const { runId } = event.data;

    const run = await step.run("load-run", async () => {
      const [r] = await db.select().from(runs).where(eq(runs.id, runId)).limit(1);
      if (!r) throw new NonRetriableError(`Run ${runId} not found`);
      if (!r.videoKey) throw new NonRetriableError(`Run ${runId} has no video uploaded`);
      if (!r.durationMs) throw new NonRetriableError(`Run ${runId} is missing duration`);
      return r;
    });

    const rubric = await step.run("load-rubric", async () => {
      try {
        return loadRubricBySlug(run.eventSlug);
      } catch (err) {
        throw new NonRetriableError(err instanceof Error ? err.message : String(err));
      }
    });

    await step.run("mark-transcribing", async () => {
      await db.update(runs).set({ status: "transcribing" }).where(eq(runs.id, runId));
    });

    const videoUrl = await step.run("presign-video-url", () => presignGetUrl(run.videoKey!));

    const transcription = await step.run("transcribe", () => transcribeUrl(videoUrl));

    await step.run("persist-transcript", async () => {
      await db.insert(transcripts).values({
        runId,
        words: transcription.words,
        fullText: transcription.fullText,
        providerMeta: transcription.providerMeta,
      });
    });

    const textTimingMetrics = await step.run("compute-text-timing-metrics", () =>
      computeTextTimingMetrics(transcription.words, run.durationMs!, rubric.time_limit_ms)
    );

    const audioSignalMetrics = await step.run("compute-audio-signal-metrics", () =>
      computeAudioSignalMetrics(videoUrl)
    );

    await step.run("persist-metrics", async () => {
      await db.insert(metrics).values({
        runId,
        wpm: textTimingMetrics.wpm,
        fillerCount: textTimingMetrics.fillerCount,
        fillerLocations: textTimingMetrics.fillerLocations,
        pauseDistribution: textTimingMetrics.pauseDistribution,
        pitchVarianceHz: audioSignalMetrics.pitch_variance_hz,
        volumeConsistency: audioSignalMetrics.volume_consistency,
        timeCompliance: textTimingMetrics.timeCompliance,
      });
    });

    await step.run("mark-scoring", async () => {
      await db.update(runs).set({ status: "scoring" }).where(eq(runs.id, runId));
    });

    const judgeMetrics = {
      wpm: textTimingMetrics.wpm,
      fillerCount: textTimingMetrics.fillerCount,
      fillerLocations: textTimingMetrics.fillerLocations,
      pauseDistribution: textTimingMetrics.pauseDistribution,
      pitchVarianceHz: audioSignalMetrics.pitch_variance_hz,
      volumeConsistency: audioSignalMetrics.volume_consistency,
      timeCompliance: textTimingMetrics.timeCompliance,
    };

    const passes = await step.run("run-judge", () =>
      runJudgePasses({
        rubric,
        transcriptFullText: transcription.fullText,
        words: transcription.words,
        metrics: judgeMetrics,
        durationMs: run.durationMs!,
      })
    );

    const range = await step.run("aggregate-score-range", () => {
      try {
        return aggregateScoreRange(passes, rubric);
      } catch (err) {
        throw new NonRetriableError(err instanceof Error ? err.message : String(err));
      }
    });

    await step.run("persist-scores", async () => {
      const rows = passes.flatMap((pass) =>
        pass.scores.map((criterion) => {
          const max = rubric.criteria.find((c) => c.id === criterion.criterion_id)
            ? Math.max(
                ...rubric.criteria.find((c) => c.id === criterion.criterion_id)!.levels.map((l) => l.score)
              )
            : criterion.score;
          return {
            runId,
            criterionId: criterion.criterion_id,
            score: criterion.score,
            max,
            runIndex: pass.runIndex,
            evidence: criterion.evidence,
            modelUsed: pass.modelUsed,
          };
        })
      );
      if (rows.length > 0) {
        await db.insert(scores).values(rows);
      }
    });

    await step.run("persist-score-range", async () => {
      await db.insert(scoreRanges).values({
        runId,
        overallLow: range.overallLow,
        overallHigh: range.overallHigh,
        perCriterion: range.perCriterion,
      });
    });

    await step.run("mark-done", async () => {
      await db.update(runs).set({ status: "done" }).where(eq(runs.id, runId));
    });

    return { runId, status: "done" };
  }
);
