import { describe, it, expect, vi } from "vitest";
import { judgeDerivation } from "./judge";

function fakeClient(text: string) {
  return {
    messages: {
      create: vi.fn(async () => ({
        content: [{ type: "text", text }],
      })),
    },
  };
}

describe("judgeDerivation", () => {
  it("parses a clean JSON response", async () => {
    const c = fakeClient(
      JSON.stringify({
        verdict: "partial",
        missing_claims: ["base case"],
        errors: ["sign error in step 3"],
        comments: "Close.",
      }),
    );
    const out = await judgeDerivation(
      {
        problemStatement: "Prove ...",
        rubric: ["base case", "inductive step"],
        userWork: "...",
        canonicalSolution: "...",
      },
      c,
    );
    expect(out.verdict).toBe("partial");
    expect(out.missing_claims).toEqual(["base case"]);
    expect(c.messages.create).toHaveBeenCalledOnce();
  });

  it("extracts JSON from a fenced code block surrounded by prose", async () => {
    const c = fakeClient(
      "Sure, here you go:\n```json\n" +
        JSON.stringify({
          verdict: "correct",
          missing_claims: [],
          errors: [],
          comments: "Solid.",
        }) +
        "\n```\nLet me know if you need more.",
    );
    const out = await judgeDerivation(
      {
        problemStatement: "p",
        rubric: ["a"],
        userWork: "u",
        canonicalSolution: "c",
      },
      c,
    );
    expect(out.verdict).toBe("correct");
  });

  it("throws on response with no JSON", async () => {
    const c = fakeClient("nope");
    await expect(
      judgeDerivation(
        {
          problemStatement: "p",
          rubric: [],
          userWork: "",
          canonicalSolution: "",
        },
        c,
      ),
    ).rejects.toThrow();
  });

  it("throws on schema mismatch", async () => {
    const c = fakeClient(JSON.stringify({ verdict: "bogus" }));
    await expect(
      judgeDerivation(
        {
          problemStatement: "p",
          rubric: [],
          userWork: "",
          canonicalSolution: "",
        },
        c,
      ),
    ).rejects.toThrow();
  });
});
