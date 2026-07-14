import Anthropic from "@anthropic-ai/sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import type { Rubric } from "@/lib/rubrics/schema";
import { judgeResponseSchema, type CriterionScore, type JudgeResponse } from "./schema";
import { buildJudgeSystemPrompt, buildJudgeUserPrompt, type JudgeMetrics } from "./prompt";

const client = new Anthropic();

const JUDGE_PASSES = 3;

type RunJudgeParams = {
  rubric: Rubric;
  transcriptFullText: string;
  words: Array<{ word: string; start_ms: number; end_ms: number; confidence: number; filler: boolean }>;
  metrics: JudgeMetrics;
  durationMs: number;
};

async function runSinglePass(params: RunJudgeParams): Promise<JudgeResponse> {
  const message = await client.messages.parse({
    model: params.rubric.model,
    max_tokens: 8000,
    thinking: { type: "adaptive" },
    system: buildJudgeSystemPrompt(),
    output_config: { format: zodOutputFormat(judgeResponseSchema) },
    messages: [
      {
        role: "user",
        content: buildJudgeUserPrompt({
          rubric: params.rubric,
          transcriptFullText: params.transcriptFullText,
          words: params.words,
          metrics: params.metrics,
          durationMs: params.durationMs,
        }),
      },
    ],
  });

  if (!message.parsed_output) {
    throw new Error("Judge response did not parse against the expected schema");
  }

  return message.parsed_output;
}

/**
 * Drops evidence items whose timestamps fall outside the clip, or whose
 * span is inverted. If a criterion loses all its evidence this way, the
 * whole criterion score is dropped for this pass — "no citation, no claim"
 * applies to the pipeline's own validation, not just the prompt.
 */
function validateAndFilterEvidence(response: JudgeResponse, durationMs: number): CriterionScore[] {
  const validated: CriterionScore[] = [];

  for (const criterion of response.scores) {
    const validEvidence = criterion.evidence.filter(
      (e) =>
        e.start_ms >= 0 &&
        e.end_ms >= e.start_ms &&
        e.end_ms <= durationMs &&
        e.transcript_span.trim().length > 0
    );

    if (validEvidence.length === 0) {
      console.warn(
        `[judge] dropping criterion "${criterion.criterion_id}" — all evidence failed timestamp/content validation`
      );
      continue;
    }

    validated.push({ ...criterion, evidence: validEvidence });
  }

  return validated;
}

export type JudgePassResult = {
  runIndex: number;
  scores: CriterionScore[];
  modelUsed: string;
};

export async function runJudgePasses(params: RunJudgeParams): Promise<JudgePassResult[]> {
  const passes = await Promise.all(
    Array.from({ length: JUDGE_PASSES }, () => runSinglePass(params))
  );

  return passes.map((response, runIndex) => ({
    runIndex,
    scores: validateAndFilterEvidence(response, params.durationMs),
    modelUsed: params.rubric.model,
  }));
}

export type ScoreRangeResult = {
  overallLow: number;
  overallHigh: number;
  perCriterion: Record<string, { low: number; high: number; max: number }>;
};

/**
 * Aggregates the 3 validated passes into a reported range rather than a
 * single point score — a single LLM judge pass is noisy; the range is
 * honest about that noise instead of hiding it behind a fake-precise number.
 */
export function aggregateScoreRange(passes: JudgePassResult[], rubric: Rubric): ScoreRangeResult {
  const criterionMax = new Map(
    rubric.criteria.map((c) => [c.id, Math.max(...c.levels.map((l) => l.score))])
  );
  const criterionWeight = new Map(rubric.criteria.map((c) => [c.id, c.weight]));

  const perCriterionScores = new Map<string, number[]>();
  const overallPercentByPass: number[] = [];

  for (const pass of passes) {
    let weightedSum = 0;
    let weightCovered = 0;

    for (const criterion of pass.scores) {
      const max = criterionMax.get(criterion.criterion_id);
      const weight = criterionWeight.get(criterion.criterion_id);
      if (max === undefined || weight === undefined) continue; // unknown criterion id from the model — ignore

      if (!perCriterionScores.has(criterion.criterion_id)) {
        perCriterionScores.set(criterion.criterion_id, []);
      }
      perCriterionScores.get(criterion.criterion_id)!.push(criterion.score);

      weightedSum += (criterion.score / max) * weight;
      weightCovered += weight;
    }

    if (weightCovered > 0) {
      // Re-normalize by the weight actually covered, so a pass that dropped
      // one criterion (bad evidence) doesn't get an artificially low overall.
      overallPercentByPass.push((weightedSum / weightCovered) * 100);
    }
  }

  if (overallPercentByPass.length === 0) {
    throw new Error("No judge pass produced any valid, evidence-backed score");
  }

  const perCriterion: ScoreRangeResult["perCriterion"] = {};
  for (const [criterionId, scores] of perCriterionScores) {
    perCriterion[criterionId] = {
      low: Math.min(...scores),
      high: Math.max(...scores),
      max: criterionMax.get(criterionId)!,
    };
  }

  return {
    overallLow: Math.min(...overallPercentByPass),
    overallHigh: Math.max(...overallPercentByPass),
    perCriterion,
  };
}
