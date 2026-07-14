import { Inngest, eventType } from "inngest";
import { z } from "zod";

export const runUploaded = eventType("run/uploaded", {
  schema: z.object({ runId: z.string() }),
});

export const inngest = new Inngest({ id: "presentation-grader" });
