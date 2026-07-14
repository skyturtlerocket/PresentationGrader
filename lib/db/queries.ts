import { db } from "./client";
import { rubrics, runs, scoreRanges, metrics, transcripts, scores } from "./schema";
import { desc, eq } from "drizzle-orm";

/** One row per distinct event, using each event's most recently seeded rubric version. */
export async function listLatestRubrics() {
  const all = await db.select().from(rubrics).orderBy(desc(rubrics.createdAt));
  const seen = new Set<string>();
  const latest = [];
  for (const r of all) {
    if (!seen.has(r.eventSlug)) {
      seen.add(r.eventSlug);
      latest.push(r);
    }
  }
  return latest;
}

export async function getRubricById(rubricId: string) {
  const [rubric] = await db.select().from(rubrics).where(eq(rubrics.id, rubricId)).limit(1);
  return rubric ?? null;
}

export async function getLatestRubricForEvent(eventSlug: string) {
  const [rubric] = await db
    .select()
    .from(rubrics)
    .where(eq(rubrics.eventSlug, eventSlug))
    .orderBy(desc(rubrics.createdAt))
    .limit(1);
  return rubric ?? null;
}

export async function listRunsForUser(userId: string) {
  return db
    .select({
      id: runs.id,
      eventSlug: runs.eventSlug,
      status: runs.status,
      durationMs: runs.durationMs,
      createdAt: runs.createdAt,
      overallLow: scoreRanges.overallLow,
      overallHigh: scoreRanges.overallHigh,
    })
    .from(runs)
    .leftJoin(scoreRanges, eq(scoreRanges.runId, runs.id))
    .where(eq(runs.userId, userId))
    .orderBy(desc(runs.createdAt));
}

export async function getRunForUser(runId: string, userId: string) {
  const [run] = await db
    .select()
    .from(runs)
    .where(eq(runs.id, runId))
    .limit(1);
  if (!run || run.userId !== userId) return null;
  return run;
}

export async function getMetricsForRun(runId: string) {
  const [row] = await db.select().from(metrics).where(eq(metrics.runId, runId)).limit(1);
  return row ?? null;
}

export async function getTranscriptForRun(runId: string) {
  const [row] = await db.select().from(transcripts).where(eq(transcripts.runId, runId)).limit(1);
  return row ?? null;
}

/** All persisted judge-pass scores for a run (3 passes x N criteria). */
export async function getScoresForRun(runId: string) {
  return db.select().from(scores).where(eq(scores.runId, runId));
}

export async function getScoreRangeForRun(runId: string) {
  const [row] = await db.select().from(scoreRanges).where(eq(scoreRanges.runId, runId)).limit(1);
  return row ?? null;
}
