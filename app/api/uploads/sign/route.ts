import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getRunForUser } from "@/lib/db/queries";
import { presignPutUrl, videoKeyFor } from "@/lib/r2/presign";

const ALLOWED_EXT_BY_TYPE: Record<string, string> = {
  "video/webm": "webm",
  "video/mp4": "mp4",
  "video/quicktime": "mov",
};

export async function POST(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await request.json().catch(() => null);
  const { runId, contentType } = body ?? {};

  if (typeof runId !== "string" || typeof contentType !== "string") {
    return NextResponse.json(
      { error: "runId and contentType are required" },
      { status: 400 }
    );
  }

  const ext = ALLOWED_EXT_BY_TYPE[contentType];
  if (!ext) {
    return NextResponse.json({ error: `Unsupported contentType "${contentType}"` }, { status: 400 });
  }

  const run = await getRunForUser(runId, user.id);
  if (!run) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const key = videoKeyFor(user.id, runId, ext);
  const uploadUrl = await presignPutUrl(key, contentType);

  return NextResponse.json({ uploadUrl, key });
}
