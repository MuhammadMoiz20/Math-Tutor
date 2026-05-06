import { describe, it, expect } from "vitest";
import { looksLikeFullSolution } from "./filter";

describe("looksLikeFullSolution (math)", () => {
  it("flags a long display-math derivation ending with 'therefore'", () => {
    const longBody = "A".repeat(220);
    const text = `Here is the derivation:\n$$${longBody}$$\nTherefore, the eigenvalues are 1 and 3.`;
    expect(looksLikeFullSolution(text)).toBe(true);
  });

  it("flags accumulated inline math with a Q.E.D.", () => {
    const inline = Array.from({ length: 12 }, (_, i) => `$x_{${i}} = a_{${i}} + b_{${i}}$`).join(" ");
    const text = `${inline}\nQ.E.D.`;
    expect(looksLikeFullSolution(text)).toBe(true);
  });

  it("flags 'we conclude' with a long display block", () => {
    const longBody = "x = 1 + 2 + 3 + 4 + 5 ".repeat(15);
    const text = `$$${longBody}$$\nWe conclude that the sum is finite.`;
    expect(looksLikeFullSolution(text)).toBe(true);
  });

  it("does NOT flag a short hint with no closing phrase", () => {
    const text = `Try writing $A v = \\lambda v$ and see what factors out.`;
    expect(looksLikeFullSolution(text)).toBe(false);
  });

  it("does NOT flag a sentence with 'therefore' but no math", () => {
    const text = "Therefore you should think about the determinant.";
    expect(looksLikeFullSolution(text)).toBe(false);
  });

  it("does NOT flag a question that mentions 'hence'", () => {
    const text = "What follows from $\\det(A) = 0$, hence what about invertibility?";
    expect(looksLikeFullSolution(text)).toBe(false);
  });

  it("does NOT flag short math even with 'the answer is'", () => {
    const text = "The answer is $\\lambda = 2$.";
    expect(looksLikeFullSolution(text)).toBe(false);
  });

  it("flags Unicode tombstone with substantial display block", () => {
    const longBody = "y_n = c_1 r_1^n + c_2 r_2^n + ".repeat(10);
    const text = `$$${longBody}$$\n∎`;
    expect(looksLikeFullSolution(text)).toBe(true);
  });
});
