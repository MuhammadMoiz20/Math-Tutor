import { describe, it, expect } from "vitest";
import { getSystemPrompt, MODES, NO_SOLUTION_RULE } from "./prompts";

describe("system prompts", () => {
  it("exposes all four phase-6 modes", () => {
    expect(Object.keys(MODES).sort()).toEqual([
      "exam",
      "hints",
      "rigor",
      "socratic",
    ]);
  });

  it("every mode embeds NO_SOLUTION_RULE", () => {
    const head = NO_SOLUTION_RULE.split("\n")[0];
    for (const m of ["socratic", "hints", "rigor", "exam"] as const) {
      expect(getSystemPrompt(m)).toContain(head);
    }
  });

  it("every mode mentions KaTeX-compatible math", () => {
    for (const m of ["socratic", "hints", "rigor", "exam"] as const) {
      expect(getSystemPrompt(m)).toMatch(/KaTeX/);
    }
  });

  it("socratic forbids assertions and asks one question", () => {
    const p = getSystemPrompt("socratic");
    expect(p).toMatch(/Socratic/);
    expect(p).toMatch(/one question per turn/i);
  });

  it("hints describes the three-rung ladder", () => {
    const p = getSystemPrompt("hints");
    expect(p).toMatch(/\(1\)/);
    expect(p).toMatch(/\(2\)/);
    expect(p).toMatch(/\(3\)/);
  });

  it("rigor mentions quantifiers and notation", () => {
    const p = getSystemPrompt("rigor");
    expect(p).toMatch(/quantifiers/i);
    expect(p).toMatch(/notation/i);
  });

  it("exam refuses hints and solutions", () => {
    const p = getSystemPrompt("exam");
    expect(p).toMatch(/exam/i);
    expect(p).toMatch(/NEVER/);
  });

  it("locks the socratic prompt content", () => {
    expect(getSystemPrompt("socratic")).toMatchSnapshot();
  });
  it("locks the hints prompt content", () => {
    expect(getSystemPrompt("hints")).toMatchSnapshot();
  });
  it("locks the rigor prompt content", () => {
    expect(getSystemPrompt("rigor")).toMatchSnapshot();
  });
  it("locks the exam prompt content", () => {
    expect(getSystemPrompt("exam")).toMatchSnapshot();
  });
});
