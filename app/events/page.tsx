import Link from "next/link";
import { listLatestRubrics } from "@/lib/db/queries";

// User-scoped auth check runs via middleware on every request; the rubric
// list itself can change server-side (seeding), so don't prerender this.
export const dynamic = "force-dynamic";

export default async function EventsPage() {
  const events = await listLatestRubrics();

  return (
    <main className="mx-auto w-full max-w-2xl px-6 py-12">
      <h1 className="mb-2 text-2xl font-semibold">Choose your event</h1>
      <p className="mb-8 text-sm text-gray-600">
        Each event scores against its own rubric, with a hard time limit that matches
        the real competition round.
      </p>

      {events.length === 0 ? (
        <p className="text-sm text-gray-500">
          No rubrics seeded yet. Run <code className="rounded bg-gray-100 px-1">npm run db:seed-rubrics</code>.
        </p>
      ) : (
        <ul className="flex flex-col gap-3">
          {events.map((event) => (
            <li key={event.eventSlug}>
              <Link
                href={`/record/${event.eventSlug}`}
                className="block rounded border border-gray-200 px-4 py-3 hover:border-black"
              >
                <div className="flex items-center justify-between">
                  <span className="font-medium">{event.name}</span>
                  <span className="text-xs text-gray-400">
                    {Math.round(event.timeLimitMs / 60000)} min
                  </span>
                </div>
                <span className="text-xs text-gray-400">v{event.version}</span>
              </Link>
            </li>
          ))}
        </ul>
      )}

      <div className="mt-8">
        <Link href="/runs" className="text-sm text-gray-500 underline">
          View past runs
        </Link>
      </div>
    </main>
  );
}
