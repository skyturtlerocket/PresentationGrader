-- Row-level security: every user can only see/write their own data.
-- rubrics is intentionally readable by all authenticated users (shared
-- reference data, not user-owned); only runs and its children are scoped
-- to auth.uid().

ALTER TABLE "users" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "rubrics" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "runs" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "transcripts" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "metrics" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "scores" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "score_ranges" ENABLE ROW LEVEL SECURITY;

-- users: a user can read/update only their own row
CREATE POLICY "users_select_own" ON "users"
  FOR SELECT USING (auth.uid() = id);
CREATE POLICY "users_update_own" ON "users"
  FOR UPDATE USING (auth.uid() = id);

-- rubrics: readable by any authenticated user, writable only by the
-- service role (server-side seeding), never by end users.
CREATE POLICY "rubrics_select_authenticated" ON "rubrics"
  FOR SELECT TO authenticated USING (true);

-- runs: fully scoped to the owning user
CREATE POLICY "runs_select_own" ON "runs"
  FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "runs_insert_own" ON "runs"
  FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "runs_update_own" ON "runs"
  FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "runs_delete_own" ON "runs"
  FOR DELETE USING (auth.uid() = user_id);

-- transcripts / metrics / scores / score_ranges: scoped via the parent run's
-- user_id. Client reads go through these policies; all writes happen via
-- the service-role client from Inngest functions (which bypasses RLS), so
-- no INSERT/UPDATE policies are needed for the authenticated role.
CREATE POLICY "transcripts_select_own" ON "transcripts"
  FOR SELECT USING (
    EXISTS (SELECT 1 FROM "runs" WHERE "runs".id = "transcripts".run_id AND "runs".user_id = auth.uid())
  );

CREATE POLICY "metrics_select_own" ON "metrics"
  FOR SELECT USING (
    EXISTS (SELECT 1 FROM "runs" WHERE "runs".id = "metrics".run_id AND "runs".user_id = auth.uid())
  );

CREATE POLICY "scores_select_own" ON "scores"
  FOR SELECT USING (
    EXISTS (SELECT 1 FROM "runs" WHERE "runs".id = "scores".run_id AND "runs".user_id = auth.uid())
  );

CREATE POLICY "score_ranges_select_own" ON "score_ranges"
  FOR SELECT USING (
    EXISTS (SELECT 1 FROM "runs" WHERE "runs".id = "score_ranges".run_id AND "runs".user_id = auth.uid())
  );
