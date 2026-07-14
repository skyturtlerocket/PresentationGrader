import { serve } from "inngest/next";
import { inngest } from "@/lib/inngest/client";
import { scoreRun } from "@/lib/inngest/score-run";

export const { GET, POST, PUT } = serve({
  client: inngest,
  functions: [scoreRun],
});
