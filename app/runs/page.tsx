import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { listRunsForUser } from "@/lib/db/queries";

export const dynamic = "force-dynamic";

const STATUS_LABEL: Record<string, string> = {
  recording: "Recording",
  uploaded: "Processing…",
  transcribing: "Transcribing…",
  scoring: "Scoring…",
  done: "Done",
  failed: "Failed",
};

export default async function RunsPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return null;

  const runs = await listRunsForUser(user.id);

  return (
    <main className="mx-auto w-full max-w-2xl px-6 py-12">
      <div className="mb-8 flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Your runs</h1>
        <Link href="/events" className="text-sm underline">
          New run
        </Link>
      </div>

      {runs.length === 0 ? (
        <p className="text-sm text-gray-500">No runs yet — pick an event to get started.</p>
      ) : (
        <ul className="flex flex-col gap-3">
          {runs.map((run) => (
            <li key={run.id}>
              <Link
                href={`/runs/${run.id}`}
                className="flex items-center justify-between rounded border border-gray-200 px-4 py-3 hover:border-black"
              >
                <div>
                  <div className="font-medium">{run.eventSlug}</div>
                  <div className="text-xs text-gray-400">
                    {new Date(run.createdAt).toLocaleDateString()}
                  </div>
                </div>
                <div className="text-right">
                  {run.overallLow !== null && run.overallHigh !== null ? (
                    <div className="text-sm font-medium">
                      {Math.round(run.overallLow)}–{Math.round(run.overallHigh)}
                    </div>
                  ) : (
                    <div className="text-sm text-gray-400">
                      {STATUS_LABEL[run.status] ?? run.status}
                    </div>
                  )}
                </div>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}
