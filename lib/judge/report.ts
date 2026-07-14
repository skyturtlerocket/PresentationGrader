import type { EvidenceItem } from "./schema";

type ScoreRow = {
  criterionId: string;
  score: number;
  max: number;
  runIndex: number;
  evidence: unknown;
};

export type CriterionReport = {
  criterionId: string;
  score: number;
  max: number;
  evidence: EvidenceItem[];
};

/**
 * We run the judge 3x and report a score *range* (see aggregateScoreRange),
 * but a report needs one evidence list per criterion to show, not three.
 * Pick the pass whose score for that criterion is the median of the three
 * — the "middle" judgment — rather than always defaulting to pass 0.
 */
export function selectRepresentativeEvidence(rows: ScoreRow[]): CriterionReport[] {
  const byCriterion = new Map<string, ScoreRow[]>();
  for (const row of rows) {
    if (!byCriterion.has(row.criterionId)) byCriterion.set(row.criterionId, []);
    byCriterion.get(row.criterionId)!.push(row);
  }

  const result: CriterionReport[] = [];
  for (const [criterionId, passes] of byCriterion) {
    const sorted = [...passes].sort((a, b) => a.score - b.score);
    const median = sorted[Math.floor((sorted.length - 1) / 2)];
    result.push({
      criterionId,
      score: median.score,
      max: median.max,
      evidence: median.evidence as EvidenceItem[],
    });
  }

  return result;
}
