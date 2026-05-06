import type { Database as DB } from "better-sqlite3";
import { loadAllProblems, frontmatterToProblem } from "@/lib/content/problems";
import { upsertProblem } from "./repo";

/**
 * Idempotently sync problems found in `content/<moduleId>/problems/*.mdx`
 * into the `problems` table. Safe to call on every page load.
 */
export function seedProblemsForModule(db: DB, moduleId: string): number {
  const loaded = loadAllProblems(moduleId);
  for (const { frontmatter } of loaded) {
    upsertProblem(db, frontmatterToProblem(frontmatter));
  }
  return loaded.length;
}
