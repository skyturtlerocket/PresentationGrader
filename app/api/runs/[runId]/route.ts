import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getRunForUser } from "@/lib/db/queries";
import { db } from "@/lib/db/client";
import { runs } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { inngest, runUploaded } from "@/lib/inngest/client";
import { presignGetUrl } from "@/lib/r2/presign";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ runId: string }> }
) {
  const { runId } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const run = await getRunForUser(runId, user.id);
  if (!run) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const videoUrl = run.videoKey ? await presignGetUrl(run.videoKey) : null;

  return NextResponse.json({ run, videoUrl });
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ runId: string }> }
) {
  const { runId } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const run = await getRunForUser(runId, user.id);
  if (!run) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const body = await request.json().catch(() => null);
  const { videoKey, durationMs } = body ?? {};

  if (typeof videoKey !== "string" || typeof durationMs !== "number") {
    return NextResponse.json(
      { error: "videoKey and durationMs are required" },
      { status: 400 }
    );
  }

  await db
    .update(runs)
    .set({ videoKey, durationMs, status: "uploaded" })
    .where(eq(runs.id, runId));

  // Kick off the scoring pipeline (transcription -> metrics -> judge).
  await inngest.send(runUploaded.create({ runId }));

  return NextResponse.json({ ok: true });
}
