import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getLatestRubricForEvent } from "@/lib/db/queries";
import { db } from "@/lib/db/client";
import { runs } from "@/lib/db/schema";

export async function POST(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await request.json().catch(() => null);
  const eventSlug = body?.eventSlug;
  if (typeof eventSlug !== "string" || !eventSlug) {
    return NextResponse.json({ error: "eventSlug is required" }, { status: 400 });
  }

  const rubric = await getLatestRubricForEvent(eventSlug);
  if (!rubric) {
    return NextResponse.json({ error: `Unknown event "${eventSlug}"` }, { status: 404 });
  }

  const [run] = await db
    .insert(runs)
    .values({
      userId: user.id,
      eventSlug,
      rubricId: rubric.id,
      status: "recording",
    })
    .returning();

  return NextResponse.json({
    runId: run.id,
    rubric: {
      name: rubric.name,
      timeLimitMs: rubric.timeLimitMs,
    },
  });
}
