import { z } from "zod";

/**
 * Every evidence item must cite a timestamp span and the exact transcript
 * text (or metric reading) at that moment. This is the hard constraint: if
 * the model can't point to one, it can't make the claim — enforced by
 * making all four fields required, non-empty, in the structured output
 * schema sent to the API.
 */
export const evidenceItemSchema = z.object({
  start_ms: z.number().int().nonnegative(),
  end_ms: z.number().int().nonnegative(),
  transcript_span: z.string().min(1),
  observation: z.string().min(1),
  why: z.string().min(1),
});

export const criterionScoreSchema = z.object({
  criterion_id: z.string().min(1),
  score: z.number().int(),
  evidence: z.array(evidenceItemSchema).min(1),
});

export const judgeResponseSchema = z.object({
  scores: z.array(criterionScoreSchema).min(1),
});

export type EvidenceItem = z.infer<typeof evidenceItemSchema>;
export type CriterionScore = z.infer<typeof criterionScoreSchema>;
export type JudgeResponse = z.infer<typeof judgeResponseSchema>;
