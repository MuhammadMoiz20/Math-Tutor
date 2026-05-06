import { describe, it, expect, beforeEach, afterEach } from "vitest";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { parseCurriculumYaml } from "@/lib/curriculum/schema";
import {
  resolveBookPath,
  resolveSource,
  parseChapters,
} from "./resolver";

const YAML = `
modules:
  - id: linalg-1
    title: Linear Algebra I
    ord: 1
    sources:
      - book: Mathematics for Machine Learning
        chapters: [2, 3]
        primary: true
        role: primary
  - id: empty-mod
    title: Empty
    ord: 2
    sources: []
`;

describe("ingest/resolver", () => {
  let tmp: string;

  beforeEach(() => {
    tmp = fs.mkdtempSync(path.join(os.tmpdir(), "ingest-"));
    fs.mkdirSync(path.join(tmp, "books"));
    fs.writeFileSync(path.join(tmp, "books", "Mathematics_For_Machine_Learning.pdf"), "x");
    fs.writeFileSync(path.join(tmp, "books", "All of Statistics.pdf"), "y");
  });

  afterEach(() => fs.rmSync(tmp, { recursive: true, force: true }));

  it("parseChapters parses csv ints", () => {
    expect(parseChapters("2,3, 5")).toEqual([2, 3, 5]);
    expect(() => parseChapters("a,b")).toThrow();
  });

  it("resolveBookPath fuzzy-matches by token overlap", () => {
    const p = resolveBookPath(
      "Mathematics for Machine Learning",
      path.join(tmp, "books"),
    );
    expect(p).toContain("Mathematics_For_Machine_Learning.pdf");
  });

  it("resolveBookPath returns null when no overlap", () => {
    expect(resolveBookPath("Nonexistent Book", path.join(tmp, "books"))).toBeNull();
  });

  it("resolveSource picks the primary curriculum source", () => {
    const c = parseCurriculumYaml(YAML);
    const r = resolveSource({
      moduleId: "linalg-1",
      curriculum: c,
      booksDir: path.join(tmp, "books"),
    });
    expect(r.module.id).toBe("linalg-1");
    expect(r.chapters).toEqual([2, 3]);
    expect(r.bookPath).toContain("Mathematics_For_Machine_Learning");
  });

  it("resolveSource honors --chapters override", () => {
    const c = parseCurriculumYaml(YAML);
    const r = resolveSource({
      moduleId: "linalg-1",
      chaptersOverride: [4],
      curriculum: c,
      booksDir: path.join(tmp, "books"),
    });
    expect(r.chapters).toEqual([4]);
  });

  it("resolveSource throws on unknown module", () => {
    const c = parseCurriculumYaml(YAML);
    expect(() =>
      resolveSource({
        moduleId: "nope",
        curriculum: c,
        booksDir: path.join(tmp, "books"),
      }),
    ).toThrow(/module not found/);
  });

  it("resolveSource throws when module has no sources and no --book override", () => {
    const c = parseCurriculumYaml(YAML);
    expect(() =>
      resolveSource({
        moduleId: "empty-mod",
        curriculum: c,
        booksDir: path.join(tmp, "books"),
      }),
    ).toThrow(/no sources/);
  });
});
