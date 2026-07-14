import {
  pgTable,
  uuid,
  text,
  timestamp,
  integer,
  jsonb,
  real,
  pgEnum,
} from "drizzle-orm/pg-core";

export const runStatusEnum = pgEnum("run_status", [
  "recording",
  "uploaded",
  "transcribing",
  "scoring",
  "done",
  "failed",
]);

/**
 * Mirrors Supabase auth.users — RLS policies reference auth.uid() directly,
 * this table just gives us an FK target + a place for app-specific profile fields.
 */
export const users = pgTable("users", {
  id: uuid("id").primaryKey(), // matches auth.users.id
  email: text("email").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const rubrics = pgTable("rubrics", {
  id: uuid("id").primaryKey().defaultRandom(),
  eventSlug: text("event_slug").notNull(),
  version: text("version").notNull(),
  name: text("name").notNull(),
  model: text("model").notNull().default("claude-sonnet-5"),
  timeLimitMs: integer("time_limit_ms").notNull(),
  // Full rubric JSON (criteria + levels + anchors) — DB row is a pinned
  // snapshot of the /rubrics/*.json source file at seed time.
  criteria: jsonb("criteria").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const runs = pgTable("runs", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  eventSlug: text("event_slug").notNull(),
  rubricId: uuid("rubric_id").notNull().references(() => rubrics.id),
  status: runStatusEnum("status").notNull().default("recording"),
  durationMs: integer("duration_ms"),
  videoKey: text("video_key"), // R2 object key
  slidesKey: text("slides_key"), // R2 object key, nullable
  failureReason: text("failure_reason"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const transcripts = pgTable("transcripts", {
  id: uuid("id").primaryKey().defaultRandom(),
  runId: uuid("run_id").notNull().references(() => runs.id, { onDelete: "cascade" }),
  // Array of { word, start_ms, end_ms, confidence } — everything downstream
  // anchors to these timestamps.
  words: jsonb("words").notNull(),
  fullText: text("full_text").notNull(),
  providerMeta: jsonb("provider_meta"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const metrics = pgTable("metrics", {
  id: uuid("id").primaryKey().defaultRandom(),
  runId: uuid("run_id").notNull().references(() => runs.id, { onDelete: "cascade" }),
  wpm: real("wpm").notNull(),
  fillerCount: integer("filler_count").notNull(),
  fillerLocations: jsonb("filler_locations").notNull(), // [{ word, start_ms, end_ms }]
  pauseDistribution: jsonb("pause_distribution").notNull(), // [{ start_ms, end_ms, duration_ms }]
  pitchVarianceHz: real("pitch_variance_hz").notNull(),
  volumeConsistency: real("volume_consistency").notNull(), // 0-1, higher = more consistent
  timeCompliance: jsonb("time_compliance").notNull(), // { limit_ms, actual_ms, within_limit }
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const scores = pgTable("scores", {
  id: uuid("id").primaryKey().defaultRandom(),
  runId: uuid("run_id").notNull().references(() => runs.id, { onDelete: "cascade" }),
  criterionId: text("criterion_id").notNull(),
  score: integer("score").notNull(),
  max: integer("max").notNull(),
  runIndex: integer("run_index").notNull(), // 0, 1, or 2 — which of the 3 judge passes
  // Array of evidence items: { start_ms, end_ms, transcript_span, observation, why, evidence_type }
  evidence: jsonb("evidence").notNull(),
  modelUsed: text("model_used").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const scoreRanges = pgTable("score_ranges", {
  id: uuid("id").primaryKey().defaultRandom(),
  runId: uuid("run_id").notNull().references(() => runs.id, { onDelete: "cascade" }),
  overallLow: real("overall_low").notNull(),
  overallHigh: real("overall_high").notNull(),
  perCriterion: jsonb("per_criterion").notNull(), // { [criterionId]: { low, high } }
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});
