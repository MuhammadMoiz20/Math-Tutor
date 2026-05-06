import fs from "node:fs";
import path from "node:path";
import matter from "gray-matter";

export interface LoadedMdx {
  frontmatter: Record<string, unknown>;
  source: string;
}

export function loadMdx(absPath: string): LoadedMdx {
  const raw = fs.readFileSync(absPath, "utf8");
  const parsed = matter(raw);
  return {
    frontmatter: parsed.data as Record<string, unknown>,
    source: parsed.content,
  };
}

export function loadModuleConcept(moduleId: string): LoadedMdx {
  const abs = path.resolve(
    process.cwd(),
    "content",
    moduleId,
    "concept.mdx",
  );
  return loadMdx(abs);
}
