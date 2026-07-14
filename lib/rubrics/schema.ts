import { z } from "zod";

export const evidenceTypeSchema = z.enum(["transcript", "audio_metric", "slide"]);

export const rubricAnchorSchema = z.object({
  score: z.number().int(),
  example_span: z.string().min(1),
  rationale: z.string().min(1),
});

export const rubricLevelSchema = z.object({
  score: z.number().int(),
  descriptor: z.string().min(1),
});

export const rubricCriterionSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  weight: z.number().min(0).max(1),
  evidence_type: evidenceTypeSchema,
  levels: z.array(rubricLevelSchema).min(2),
  // 2-3 human-scored anchor examples per criterion — without them scores
  // drift between runs. Not hard-required by the schema (so a first draft
  // can be validated before anchors are written) but the judge prompt
  // builder will warn loudly if a criterion has zero anchors.
  anchors: z.array(rubricAnchorSchema).default([]),
});

export const rubricSchema = z.object({
  event: z.string().min(1),
  version: z.string().min(1),
  name: z.string().min(1),
  model: z.string().min(1).default("claude-sonnet-5"),
  time_limit_ms: z.number().int().positive(),
  criteria: z.array(rubricCriterionSchema).min(1),
});

export type RubricAnchor = z.infer<typeof rubricAnchorSchema>;
export type RubricCriterion = z.infer<typeof rubricCriterionSchema>;
export type Rubric = z.infer<typeof rubricSchema>;

/** Parses and validates a rubric JSON file. Throws with a readable message on failure. */
export function parseRubric(raw: unknown): Rubric {
  const result = rubricSchema.safeParse(raw);
  if (!result.success) {
    throw new Error(
      `Invalid rubric: ${result.error.issues
        .map((i) => `${i.path.join(".")}: ${i.message}`)
        .join("; ")}`
    );
  }

  const weightSum = result.data.criteria.reduce((sum, c) => sum + c.weight, 0);
  if (Math.abs(weightSum - 1) > 0.01) {
    throw new Error(
      `Invalid rubric: criteria weights must sum to 1.0 (got ${weightSum.toFixed(2)})`
    );
  }

  for (const c of result.data.criteria) {
    if (c.anchors.length === 0) {
      console.warn(
        `[rubric ${result.data.event}] criterion "${c.id}" has no anchor examples — scores will drift between runs`
      );
    }
  }

  return result.data;
}
