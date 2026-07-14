import type { Rubric } from "@/lib/rubrics/schema";
import type { TranscriptWord } from "@/lib/deepgram/client";

export type JudgeMetrics = {
  wpm: number;
  fillerCount: number;
  fillerLocations: Array<{ word: string; start_ms: number; end_ms: number }>;
  pauseDistribution: Array<{ start_ms: number; end_ms: number; duration_ms: number }>;
  pitchVarianceHz: number;
  volumeConsistency: number;
  timeCompliance: { limit_ms: number; actual_ms: number; within_limit: boolean };
};

function formatWords(words: TranscriptWord[]): string {
  // Compact "start_ms  word" lines — precise enough to cite exact timestamps
  // without paying full JSON overhead per word.
  return words.map((w) => `${w.start_ms}\t${w.word}`).join("\n");
}

function formatRubric(rubric: Rubric): string {
  return rubric.criteria
    .map((c) => {
      const levels = c.levels.map((l) => `  - ${l.score}: ${l.descriptor}`).join("\n");
      const anchors = c.anchors
        .map((a) => `  - [score ${a.score}] "${a.example_span}" — ${a.rationale}`)
        .join("\n");
      return [
        `### ${c.id} — ${c.name} (weight ${c.weight}, evidence_type: ${c.evidence_type})`,
        `Levels:`,
        levels,
        anchors ? `Anchor examples:\n${anchors}` : "",
      ]
        .filter(Boolean)
        .join("\n");
    })
    .join("\n\n");
}

export function buildJudgeSystemPrompt(): string {
  return [
    "You are grading a student's practice run for an FBLA competitive event against the",
    "rubric provided. You will be given the full word-level transcript (with timestamps",
    "in milliseconds), deterministic delivery metrics computed from the audio, and the",
    "rubric's scoring criteria with anchor examples.",
    "",
    "Hard rule: every criterion score must be backed by at least one evidence item, and",
    "every evidence item MUST cite a start_ms/end_ms timestamp pair that appears in the",
    "provided transcript or metrics data, plus the exact transcript_span text (or metric",
    "reading) at that moment. Never invent a timestamp, a quote, or a metric value that",
    "isn't in the data given to you. If you cannot find real evidence for a score, lower",
    "the score to one you CAN support with real evidence — do not make an uncited claim.",
    "",
    "Score each criterion using only the integer levels defined in its rubric — do not",
    "invent intermediate scores. Use the anchor examples to calibrate what each score",
    "level actually looks like.",
  ].join(" ");
}

export function buildJudgeUserPrompt(params: {
  rubric: Rubric;
  transcriptFullText: string;
  words: TranscriptWord[];
  metrics: JudgeMetrics;
  durationMs: number;
}): string {
  const { rubric, transcriptFullText, words, metrics, durationMs } = params;

  return [
    `# Event: ${rubric.name} (time limit ${rubric.time_limit_ms}ms, actual duration ${durationMs}ms)`,
    "",
    "## Rubric",
    formatRubric(rubric),
    "",
    "## Deterministic delivery metrics (computed from audio — treat as ground truth)",
    JSON.stringify(
      {
        wpm: metrics.wpm,
        filler_count: metrics.fillerCount,
        filler_locations: metrics.fillerLocations,
        pause_distribution: metrics.pauseDistribution,
        pitch_variance_hz: metrics.pitchVarianceHz,
        volume_consistency: metrics.volumeConsistency,
        time_compliance: metrics.timeCompliance,
      },
      null,
      2
    ),
    "",
    "## Full transcript (plain text)",
    transcriptFullText,
    "",
    "## Word-level timestamps (start_ms<TAB>word) — cite exact values from this list",
    formatWords(words),
  ].join("\n");
}
