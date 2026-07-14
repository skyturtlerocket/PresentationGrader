import { notFound } from "next/navigation";
import { getLatestRubricForEvent } from "@/lib/db/queries";
import { RecordSession } from "./RecordSession";

export const dynamic = "force-dynamic";

export default async function RecordPage({
  params,
}: {
  params: Promise<{ eventId: string }>;
}) {
  const { eventId } = await params;
  const rubric = await getLatestRubricForEvent(eventId);

  if (!rubric) {
    notFound();
  }

  return (
    <RecordSession
      eventSlug={eventId}
      eventName={rubric.name}
      timeLimitMs={rubric.timeLimitMs}
    />
  );
}
