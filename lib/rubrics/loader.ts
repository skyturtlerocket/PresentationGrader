import fs from "node:fs";
import path from "node:path";
import { parseRubric, type Rubric } from "./schema";

const RUBRICS_DIR = path.join(process.cwd(), "rubrics");

export function listRubricFiles(): string[] {
  return fs
    .readdirSync(RUBRICS_DIR)
    .filter((f) => f.endsWith(".json"))
    .map((f) => path.join(RUBRICS_DIR, f));
}

export function loadRubricFile(filePath: string): Rubric {
  const raw = JSON.parse(fs.readFileSync(filePath, "utf-8"));
  return parseRubric(raw);
}

export function loadAllRubrics(): Rubric[] {
  return listRubricFiles().map(loadRubricFile);
}

export function loadRubricBySlug(eventSlug: string): Rubric {
  const filePath = path.join(RUBRICS_DIR, `${eventSlug}.json`);
  if (!fs.existsSync(filePath)) {
    throw new Error(`No rubric found for event "${eventSlug}"`);
  }
  return loadRubricFile(filePath);
}
