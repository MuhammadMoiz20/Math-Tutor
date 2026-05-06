import { describe, it, expect } from "vitest";
import { verifyProblem, verifyAll } from "./verify";
import type { IngestProblem } from "./schema";

const okChecker = () => ({ equivalent: true });
const failChecker = () => ({ error: "parse" });

const computational = (overrides: Partial<IngestProblem> = {}): IngestProblem => ({
  id: "p",
  title: "p",
  type: "computational",
  expected_answer: "x**2",
  source: { book: "B" },
  mdx: "...",
  ...overrides,
});

describe("ingest/verify", () => {
  it("computational + parsable + not from book → generated+verified", () => {
    expect(verifyProblem(computational(), okChecker).provenance).toBe(
      "generated+verified",
    );
  });

  it("computational + parsable + from_book_appendix → book+verified", () => {
    expect(
      verifyProblem(computational({ from_book_appendix: true }), okChecker)
        .provenance,
    ).toBe("book+verified");
  });

  it("computational + sympy fails → generated", () => {
    expect(verifyProblem(computational(), failChecker).provenance).toBe(
      "generated",
    );
  });

  it("derivation/proof always falls back to generated/book", () => {
    const p: IngestProblem = {
      id: "q",
      title: "q",
      type: "proof",
      source: { book: "B" },
      mdx: "...",
      rubric: ["x"],
    };
    expect(verifyProblem(p, okChecker).provenance).toBe("generated");
    expect(verifyProblem({ ...p, from_book_appendix: true }, okChecker).provenance).toBe("book");
  });

  it("missing expected_answer falls back", () => {
    const p = computational({ expected_answer: undefined });
    expect(verifyProblem(p, okChecker).provenance).toBe("generated");
  });

  it("verifyAll maps over problems", () => {
    const map = verifyAll([computational({ id: "a" })], okChecker);
    expect(map["a"]).toBe("generated+verified");
  });
});
