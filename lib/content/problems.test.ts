import { describe, it, expect } from "vitest";
import path from "node:path";
import { parseProblemMdx, loadAllProblems } from "./problems";
import fs from "node:fs";

describe("parseProblemMdx", () => {
  it("parses frontmatter and body", () => {
    const abs = path.resolve(
      __dirname,
      "../../content/_fixtures/sample-problem.mdx",
    );
    const raw = fs.readFileSync(abs, "utf8");
    const parsed = parseProblemMdx(raw);
    expect(parsed.frontmatter.id).toBe("fixture-prob-1");
    expect(parsed.frontmatter.type).toBe("computational");
    expect(parsed.frontmatter.expected_answer).toBe("42");
    expect(parsed.frontmatter.source).toEqual({ book: "Test", chapter: 1 });
    expect(parsed.source).toContain("$6 \\cdot 7$");
  });
});

describe("loadAllProblems", () => {
  it("returns problems for the linalg-1 module", () => {
    const probs = loadAllProblems("linalg-1");
    const ids = probs.map((p) => p.frontmatter.id);
    expect(ids).toContain("linalg-1-eigen-1");
  });

  it("returns [] for unknown module", () => {
    expect(loadAllProblems("does-not-exist")).toEqual([]);
  });
});
