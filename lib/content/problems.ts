import fs from "node:fs";
import path from "node:path";
import matter from "gray-matter";
import type { Problem, ProblemType } from "@/lib/problems/repo";

export interface ProblemFrontmatter {
  id: string;
  module_id: string;
  title: string;
  type: ProblemType;
  expected_answer?: string;
  rubric?: string[];
  source?: Record<string, unknown>;
  ord?: number;
}

export interface LoadedProblemMdx {
  frontmatter: ProblemFrontmatter;
  /**
   * Statement body. Everything before the `---SOLUTION---` divider, if
   * present; otherwise the full body.
   */
  source: string;
  /**
   * Canonical solution body. The text after the `---SOLUTION---` divider.
   * Empty string when no divider is present (the problem has no canonical
   * solution authored yet).
   */
  solution: string;
}

const SOLUTION_DIVIDER = /^---SOLUTION---\s*$/m;

export function parseProblemMdx(raw: string): LoadedProblemMdx {
  const parsed = matter(raw);
  const body = parsed.content;
  const m = body.match(SOLUTION_DIVIDER);
  let source = body;
  let solution = "";
  if (m && m.index !== undefined) {
    source = body.slice(0, m.index).trimEnd();
    solution = body.slice(m.index + m[0].length).trimStart();
  }
  return {
    frontmatter: parsed.data as ProblemFrontmatter,
    source,
    solution,
  };
}

function problemsDir(moduleId: string): string {
  return path.resolve(process.cwd(), "content", moduleId, "problems");
}

export function loadProblemMdx(
  moduleId: string,
  problemId: string,
): LoadedProblemMdx | null {
  const abs = path.join(problemsDir(moduleId), `${problemId}.mdx`);
  if (!fs.existsSync(abs)) return null;
  return parseProblemMdx(fs.readFileSync(abs, "utf8"));
}

export function loadAllProblems(moduleId: string): LoadedProblemMdx[] {
  const dir = problemsDir(moduleId);
  if (!fs.existsSync(dir)) return [];
  return fs
    .readdirSync(dir)
    .filter((f) => f.endsWith(".mdx"))
    .sort()
    .map((f) => parseProblemMdx(fs.readFileSync(path.join(dir, f), "utf8")));
}

export function frontmatterToProblem(fm: ProblemFrontmatter): Problem {
  return {
    id: fm.id,
    module_id: fm.module_id,
    title: fm.title,
    type: fm.type,
    expected_answer: fm.expected_answer ?? null,
    rubric: fm.rubric ?? null,
    source: fm.source ?? null,
    ord: fm.ord ?? 0,
  };
}
