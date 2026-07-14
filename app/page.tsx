import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export default async function Home() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (user) {
    redirect("/events");
  }

  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col items-center justify-center gap-6 px-6 text-center">
      <h1 className="text-3xl font-semibold">Presentation Grader</h1>
      <p className="text-gray-600">
        Pick your FBLA event, record a timed practice run, and get scored against the
        real rubric — every claim linked to a timestamp you can click.
      </p>
      <Link
        href="/login"
        className="rounded bg-black px-5 py-2 text-sm font-medium text-white"
      >
        Get started
      </Link>
    </main>
  );
}
