import Anthropic from "@anthropic-ai/sdk";
import { z } from "zod";

export const JudgeVerdictSchema = z.object({
  verdict: z.enum(["correct", "partial", "incorrect"]),
  missing_claims: z.array(z.string()),
  errors: z.array(z.string()),
  comments: z.string(),
});
export type JudgeVerdict = z.infer<typeof JudgeVerdictSchema>;

export interface JudgeInput {
  problemStatement: string;
  rubric: string[];
  userWork: string;
  canonicalSolution: string;
}

export interface JudgeClient {
  messages: {
    create: (req: unknown) => Promise<{
      content: Array<{ type: string; text?: string }>;
    }>;
  };
}

const JUDGE_SYSTEM = `You are a strict but fair grader of mathematical
derivations. Compare the user's work against a rubric and a canonical
solution. Output ONLY a JSON object matching this schema, with no prose
outside the JSON:

{
  "verdict": "correct" | "partial" | "incorrect",
  "missing_claims": string[],   // rubric items the user did not satisfy
  "errors": string[],           // mathematical mistakes in the user's work
  "comments": string             // 1-3 sentence summary
}`.trim();

function buildPrompt(input: JudgeInput): string {
  return [
    `Problem:\n${input.problemStatement}`,
    `Rubric (each item is a required claim):\n${input.rubric
      .map((r, i) => `  ${i + 1}. ${r}`)
      .join("\n")}`,
    `Canonical solution:\n${input.canonicalSolution}`,
    `User's work:\n${input.userWork}`,
  ].join("\n\n");
}

function extractJson(text: string): unknown {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  const candidate = (fenced ? fenced[1] : text).trim();
  // Find first { and last } to be lenient about surrounding prose.
  const first = candidate.indexOf("{");
  const last = candidate.lastIndexOf("}");
  if (first === -1 || last === -1) throw new Error("no JSON object found");
  return JSON.parse(candidate.slice(first, last + 1));
}

export async function judgeDerivation(
  input: JudgeInput,
  client?: JudgeClient,
): Promise<JudgeVerdict> {
  const c: JudgeClient =
    client ?? (new Anthropic() as unknown as JudgeClient);
  const res = await c.messages.create({
    model: "claude-haiku-4-5",
    max_tokens: 1024,
    system: JUDGE_SYSTEM,
    messages: [{ role: "user", content: buildPrompt(input) }],
  });
  const block = res.content.find((b) => b.type === "text");
  if (!block || !block.text) throw new Error("judge: empty response");
  const obj = extractJson(block.text);
  return JudgeVerdictSchema.parse(obj);
}
