# Presentation Grader

Unofficial FBLA presentation practice tool: pick an event, record a timed run under
judge-round pressure, and get scored against that event's rubric with every claim
linked to a clickable timestamp.

Not affiliated with or endorsed by FBLA-PBL.

## Stack

Next.js (App Router) + Drizzle/Postgres (Supabase) + Supabase Auth + Cloudflare R2 +
Deepgram Nova-3 + Claude (`@anthropic-ai/sdk`) + Inngest + Modal (Python audio worker).

See `/Users/timothyha/.claude/plans/cheeky-sniffing-zebra.md` (or ask for a recap) for
the full architecture writeup.

## One-time setup

1. **Supabase** — create a project. Copy the project URL, anon key, and service role
   key into `.env.local`. Enable the Google OAuth provider if you want "Continue with
   Google" to work (Auth → Providers). Grab the **direct** Postgres connection string
   (not the pooled one) for `DATABASE_URL` — `drizzle-kit migrate` needs a direct
   connection; the app itself can use the pooled (pgbouncer) URL at runtime.

2. **Cloudflare R2** — create a bucket and an API token (Account → R2 → Manage API
   tokens) with read/write access. Fill in `R2_ACCOUNT_ID`, `R2_ACCESS_KEY_ID`,
   `R2_SECRET_ACCESS_KEY`, `R2_BUCKET`.

3. **Deepgram** — create an API key, set `DEEPGRAM_API_KEY`.

4. **Anthropic** — set `ANTHROPIC_API_KEY`.

5. **Inngest** — for local dev, `npx inngest-cli@latest dev` and point it at
   `http://localhost:3000/api/inngest`; no keys needed locally. For production, create
   an Inngest app and set `INNGEST_EVENT_KEY` / `INNGEST_SIGNING_KEY`.

6. **Modal** (audio-signal worker — pitch variance + volume consistency) —
   ```bash
   pip install modal
   modal setup
   modal deploy modal/worker.py
   ```
   Copy the deployed endpoint URL into `MODAL_WORKER_URL`.

7. **Database migrations + rubric seed:**
   ```bash
   npm run db:migrate       # applies drizzle/0000 (schema), 0001 (RLS), 0002 (auth sync)
   npm run db:seed-rubrics  # loads /rubrics/*.json into the rubrics table
   ```

## Development

```bash
npm run dev
```

## Rubrics

Rubrics are versioned JSON files in `/rubrics/*.json`, validated against
`lib/rubrics/schema.ts` (zod). The JSON file is the source of truth — the `rubrics`
DB row is a pinned snapshot used for FK references. Adding a new event is data entry:
drop a new JSON file with the same shape (criteria, levels, 2-3 anchor examples per
criterion), then `npm run db:seed-rubrics`.

## Scoring pipeline

Triggered by an Inngest `run/uploaded` event (`lib/inngest/score-run.ts`) once a
recording finishes uploading:

1. Transcribe via Deepgram Nova-3 (word-level timestamps).
2. Deterministic metrics: WPM, fillers, pauses, time compliance computed in plain
   TypeScript from the transcript (`lib/metrics/deterministic.ts`); pitch variance and
   volume consistency computed from decoded audio via the Modal worker
   (`lib/modal/client.ts` → `modal/worker.py`).
3. LLM judge (`lib/judge/client.ts`) runs 3x in parallel against the rubric, using
   Claude structured outputs to force every criterion score to cite a timestamp span
   and transcript text — no citation, no claim.
4. Scores are aggregated into a range (not a point score) across the 3 passes and
   persisted to `score_ranges`.

## Known gaps (by design, for this MVP)

- Slide deck upload/vision scoring isn't wired into the record flow yet.
- Live Q&A scoring is out of scope (v2).
- Only 3 rubrics are seeded (`fbla_visual_design`, `fbla_public_speaking`,
  `fbla_sales_presentation`) — adding more is a rubric JSON file, not code.
