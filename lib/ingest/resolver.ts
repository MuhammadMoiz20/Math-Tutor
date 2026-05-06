import fs from "node:fs";
import path from "node:path";
import { parseCurriculumYaml, type Curriculum, type Module } from "@/lib/curriculum/schema";

export interface ResolvedSource {
  module: Module;
  bookPath: string;
  bookTitle: string;
  chapters: number[];
}

/**
 * Map fuzzy curriculum book names to actual files in books/.
 * Matches by case-insensitive token overlap on the basename.
 */
export function resolveBookPath(
  bookTitle: string,
  booksDir: string,
): string | null {
  if (!fs.existsSync(booksDir)) return null;
  const files = fs.readdirSync(booksDir).filter((f) => f.toLowerCase().endsWith(".pdf"));
  const norm = (s: string) =>
    s.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim().split(/\s+/).filter(Boolean);
  const wanted = new Set(norm(bookTitle));
  let best: { file: string; score: number } | null = null;
  for (const f of files) {
    const toks = new Set(norm(f.replace(/\.pdf$/i, "")));
    let score = 0;
    for (const t of wanted) if (toks.has(t)) score++;
    if (!best || score > best.score) best = { file: f, score };
  }
  if (!best || best.score === 0) return null;
  return path.join(booksDir, best.file);
}

export function loadCurriculum(yamlPath: string): Curriculum {
  return parseCurriculumYaml(fs.readFileSync(yamlPath, "utf8"));
}

export interface ResolveOptions {
  moduleId: string;
  bookOverride?: string;
  chaptersOverride?: number[];
  curriculum: Curriculum;
  booksDir: string;
}

export function resolveSource(opts: ResolveOptions): ResolvedSource {
  const { moduleId, bookOverride, chaptersOverride, curriculum, booksDir } = opts;
  const mod = curriculum.modules.find((m) => m.id === moduleId);
  if (!mod) throw new Error(`module not found in curriculum: ${moduleId}`);

  // primary source from curriculum (or first)
  const primary = mod.sources.find((s) => s.primary) ?? mod.sources[0];
  if (!primary && !bookOverride) {
    throw new Error(`module ${moduleId} has no sources and no --book override`);
  }
  const bookTitle = primary?.book ?? path.basename(bookOverride!);
  const chapters =
    chaptersOverride && chaptersOverride.length > 0
      ? chaptersOverride
      : primary?.chapters ?? [];
  if (chapters.length === 0) {
    throw new Error(`no chapters specified for ${moduleId}`);
  }

  let bookPath: string | null = null;
  if (bookOverride) {
    bookPath = path.isAbsolute(bookOverride)
      ? bookOverride
      : path.resolve(booksDir, "..", bookOverride);
    if (!fs.existsSync(bookPath)) {
      // try as direct relative
      const alt = path.resolve(bookOverride);
      if (fs.existsSync(alt)) bookPath = alt;
      else throw new Error(`book file not found: ${bookOverride}`);
    }
  } else {
    bookPath = resolveBookPath(bookTitle, booksDir);
    if (!bookPath) {
      throw new Error(
        `could not resolve book "${bookTitle}" in ${booksDir}; use --book to override`,
      );
    }
  }

  return { module: mod, bookPath, bookTitle, chapters };
}

export function parseChapters(csv: string): number[] {
  return csv
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean)
    .map((s) => {
      const n = Number(s);
      if (!Number.isInteger(n)) throw new Error(`bad chapter: ${s}`);
      return n;
    });
}
