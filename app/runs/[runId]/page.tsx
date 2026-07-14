import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import {
  getRunForUser,
  getMetricsForRun,
  getScoresForRun,
  getScoreRangeForRun,
} from "@/lib/db/queries";
import { presignGetUrl } from "@/lib/r2/presign";
import { loadRubricBySlug } from "@/lib/rubrics/loader";
import { selectRepresentativeEvidence } from "@/lib/judge/report";
import { VideoPlayer } from "@/app/components/VideoPlayer";
import { ReportView } from "./ReportView";

export const dynamic = "force-dynamic";

const STATUS_LABEL: Record<string, string> = {
  recording: "Recording in progress",
  uploaded: "Upload complete — queued for processing",
  transcribing: "Transcribing…",
  scoring: "Scoring…",
  done: "Done",
  failed: "Something went wrong processing this run",
};

export default async function RunDetailPage({
  params,
}: {
  params: Promise<{ runId: string }>;
}) {
  const { runId } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const run = await getRunForUser(runId, user.id);
  if (!run) notFound();

  const [videoUrl, runMetrics] = await Promise.all([
    run.videoKey ? presignGetUrl(run.videoKey) : null,
    getMetricsForRun(runId),
  ]);

  return (
    <main className="mx-auto w-full max-w-3xl px-6 py-12">
      <h1 className="mb-1 text-2xl font-semibold">{run.eventSlug}</h1>
      <p className="mb-6 text-sm text-gray-500">
        {run.status === "failed" && run.failureReason
          ? `${STATUS_LABEL.failed}: ${run.failureReason}`
          : STATUS_LABEL[run.status] ?? run.status}
      </p>

      {run.status === "done" && videoUrl ? (
        <DoneReport runId={runId} videoUrl={videoUrl} durationMs={run.durationMs ?? 0} eventSlug={run.eventSlug} />
      ) : (
        <>
          {videoUrl ? (
            <VideoPlayer src={videoUrl} className="mb-8" />
          ) : (
            <div className="mb-8 rounded border border-dashed border-gray-300 px-6 py-16 text-center text-sm text-gray-400">
              Video not yet available.
            </div>
          )}

          {runMetrics && (
            <section className="mb-8">
              <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-gray-400">
                Delivery metrics
              </h2>
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                <MetricTile label="WPM" value={runMetrics.wpm.toFixed(0)} />
                <MetricTile label="Fillers" value={String(runMetrics.fillerCount)} />
                <MetricTile
                  label="Pitch variance"
                  value={`${runMetrics.pitchVarianceHz.toFixed(0)} Hz`}
                />
                <MetricTile
                  label="Volume consistency"
                  value={runMetrics.volumeConsistency.toFixed(2)}
                />
              </div>
            </section>
          )}

          <p className="text-sm text-gray-500">
            Evidence-linked scoring will appear here once processing completes.
          </p>
        </>
      )}
    </main>
  );
}

async function DoneReport({
  runId,
  videoUrl,
  durationMs,
  eventSlug,
}: {
  runId: string;
  videoUrl: string;
  durationMs: number;
  eventSlug: string;
}) {
  const [scoreRows, range] = await Promise.all([getScoresForRun(runId), getScoreRangeForRun(runId)]);

  if (!range || scoreRows.length === 0) {
    return (
      <p className="text-sm text-gray-500">
        This run finished processing but no scores were recorded — check the pipeline logs.
      </p>
    );
  }

  const rubric = loadRubricBySlug(eventSlug);
  const nameById = new Map(rubric.criteria.map((c) => [c.id, c.name]));
  const perCriterion = range.perCriterion as Record<
    string,
    { low: number; high: number; max: number }
  >;

  const representative = selectRepresentativeEvidence(
    scoreRows.map((r) => ({
      criterionId: r.criterionId,
      score: r.score,
      max: r.max,
      runIndex: r.runIndex,
      evidence: r.evidence,
    }))
  );

  const criteria = representative
    .map((r) => {
      const rangeForCriterion = perCriterion[r.criterionId];
      return {
        criterionId: r.criterionId,
        name: nameById.get(r.criterionId) ?? r.criterionId,
        score: r.score,
        max: r.max,
        low: rangeForCriterion?.low ?? r.score,
        high: rangeForCriterion?.high ?? r.score,
        evidence: r.evidence,
      };
    })
    // Keep report order aligned with the rubric's own criteria order.
    .sort(
      (a, b) =>
        rubric.criteria.findIndex((c) => c.id === a.criterionId) -
        rubric.criteria.findIndex((c) => c.id === b.criterionId)
    );

  return (
    <ReportView
      videoUrl={videoUrl}
      durationMs={durationMs}
      overallLow={range.overallLow}
      overallHigh={range.overallHigh}
      criteria={criteria}
    />
  );
}

function MetricTile({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded border border-gray-200 px-3 py-2">
      <div className="text-lg font-semibold">{value}</div>
      <div className="text-xs text-gray-400">{label}</div>
    </div>
  );
}
