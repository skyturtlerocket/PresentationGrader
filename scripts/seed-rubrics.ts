import "dotenv/config";
import { db } from "../lib/db/client";
import { rubrics } from "../lib/db/schema";
import { loadAllRubrics } from "../lib/rubrics/loader";
import { eq } from "drizzle-orm";

async function main() {
  const parsed = loadAllRubrics();
  console.log(`Loaded ${parsed.length} rubric file(s): ${parsed.map((r) => r.event).join(", ")}`);

  for (const rubric of parsed) {
    const existing = await db.query.rubrics.findFirst({
      where: (r, { and }) => and(eq(r.eventSlug, rubric.event), eq(r.version, rubric.version)),
    });

    if (existing) {
      await db
        .update(rubrics)
        .set({
          name: rubric.name,
          model: rubric.model,
          timeLimitMs: rubric.time_limit_ms,
          criteria: rubric.criteria,
        })
        .where(eq(rubrics.id, existing.id));
      console.log(`Updated rubric: ${rubric.event}@${rubric.version}`);
    } else {
      await db.insert(rubrics).values({
        eventSlug: rubric.event,
        version: rubric.version,
        name: rubric.name,
        model: rubric.model,
        timeLimitMs: rubric.time_limit_ms,
        criteria: rubric.criteria,
      });
      console.log(`Inserted rubric: ${rubric.event}@${rubric.version}`);
    }
  }

  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
