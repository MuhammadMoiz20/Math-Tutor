import { describe, it, expect } from "vitest";
import { gradeFromAttempt } from "./grade";

describe("gradeFromAttempt", () => {
  it("computational correct → 5", () => {
    expect(gradeFromAttempt({ verdict: "correct" })).toBe(5);
  });

  it("computational incorrect → 1", () => {
    expect(gradeFromAttempt({ verdict: "incorrect" })).toBe(1);
  });

  it("derivation correct → 5", () => {
    expect(
      gradeFromAttempt({
        verdict: "correct",
        judgeJson: { verdict: "correct" },
      }),
    ).toBe(5);
  });

  it("derivation incorrect → 1", () => {
    expect(
      gradeFromAttempt({
        verdict: "incorrect",
        judgeJson: { verdict: "incorrect" },
      }),
    ).toBe(1);
  });

  it("derivation partial, no missing claims → 3", () => {
    expect(
      gradeFromAttempt({
        verdict: "incorrect",
        judgeJson: { verdict: "partial", missing_claims: [] },
      }),
    ).toBe(3);
  });

  it("derivation partial, one missing claim → 2", () => {
    expect(
      gradeFromAttempt({
        verdict: "incorrect",
        judgeJson: { verdict: "partial", missing_claims: ["x"] },
      }),
    ).toBe(2);
  });

  it("derivation partial, three missing claims → floor 0", () => {
    expect(
      gradeFromAttempt({
        verdict: "incorrect",
        judgeJson: {
          verdict: "partial",
          missing_claims: ["a", "b", "c", "d"],
        },
      }),
    ).toBe(0);
  });

  it("accepts judgeJson as a string", () => {
    expect(
      gradeFromAttempt({
        verdict: "incorrect",
        judgeJson: JSON.stringify({ verdict: "partial", missing_claims: [] }),
      }),
    ).toBe(3);
  });

  it("falls back to verdict when judge json is malformed", () => {
    expect(
      gradeFromAttempt({ verdict: "correct", judgeJson: "not json" }),
    ).toBe(5);
  });
});
