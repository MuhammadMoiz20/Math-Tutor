import fs from "node:fs";
import { IngestPayload } from "./schema";

export interface IngestRequest {
  bookPath: string;
  bookTitle: string;
  moduleId: string;
  moduleTitle: string;
  chapters: number[];
  model: string;
}

export interface CallResult {
  payload: IngestPayload;
  rawText: string;
}

/**
 * Loose shape over the agent SDK's `query` function. The real return type is
 * `Query` (an AsyncGenerator with extra methods), but for ingestion we only
 * iterate it. Tests can pass a fake matching this signature.
 */
export type AgentQueryFn = (args: {
  prompt: AsyncIterable<unknown> | string;
  options?: Record<string, unknown>;
}) => AsyncIterable<{
  type: string;
  message?: { content?: Array<{ type: string; text?: string }> };
  [k: string]: unknown;
}>;

export const SYSTEM_PROMPT = `You are an expert math content author for a single-user ML/AI tutoring app. \
Your job is to ingest specific chapters of a math textbook and emit MDX content: \
a concept page, worked examples, and problems with canonical solutions.

Style rules:
- Use KaTeX (\`$...$\` for inline, \`$$...$$\` for display). Never use \\( \\) or \\[ \\].
- Concept pages MUST include a short "Where this shows up in ML" sidebar at the end.
- Problem ids are kebab-case and prefixed by the module id.
- For computational problems, set \`expected_answer\` to a SymPy-parseable expression (e.g. \`x**2 + 1\`, \`{1, 3}\`, \`Matrix([[1,0],[0,1]])\`).
- For derivation/proof problems, set \`rubric\` to a list of required claims and OMIT \`expected_answer\`.
- Each problem mdx body is: statement, blank line, the literal line \`---SOLUTION---\`, blank line, then the canonical worked solution.
- When the book's appendix gives the answer/solution, set \`from_book_appendix: true\`. Otherwise set it false (or omit) and we'll verify via SymPy.

OUTPUT FORMAT — STRICT:
Respond with ONE fenced JSON block and nothing else. No prose before or after. The JSON must conform to:

\`\`\`json
{
  "concept_mdx": "string (full MDX body, KaTeX preserved)",
  "worked_examples": [{ "id": "1", "mdx": "..." }],
  "problems": [
    {
      "id": "module-id-slug",
      "title": "...",
      "type": "computational" | "derivation" | "proof",
      "expected_answer": "SymPy-parseable string (computational only)",
      "rubric": ["required claim", "..."],
      "source": { "book": "...", "chapter": 2, "page": 47 },
      "mdx": "statement\\n\\n---SOLUTION---\\n\\ncanonical solution",
      "from_book_appendix": true
    }
  ]
}
\`\`\`

Required fields per problem: id, title, type, source.book, mdx. Use \`expected_answer\` for computational, \`rubric\` for derivation/proof.`;

export function buildUserMessage(req: IngestRequest): string {
  return `Module id: ${req.moduleId}
Module title: ${req.moduleTitle}
Book: ${req.bookTitle}
Chapters to ingest: ${req.chapters.join(", ")}

Read the attached PDF, focus on the listed chapters, and emit the module content. Aim for one concept page (1-2 KaTeX-rich sections), 2-4 worked examples, and 6-12 problems mixing computational and derivation types. Respond with the single fenced JSON block as specified.`;
}

/**
 * Extract a JSON object from the assistant's text output. Prefers a fenced
 * \`\`\`json ... \`\`\` block; falls back to any fenced block; falls back to
 * raw text if it starts with \`{\`.
 */
export function extractJsonBlock(text: string): string | null {
  const fencedJson = text.match(/```json\s*\n?([\s\S]*?)\n?```/);
  if (fencedJson) return fencedJson[1].trim();
  const fenced = text.match(/```\s*\n?([\s\S]*?)\n?```/);
  if (fenced) return fenced[1].trim();
  const trimmed = text.trim();
  if (trimmed.startsWith("{") && trimmed.endsWith("}")) return trimmed;
  return null;
}

export async function callAgentForModule(
  req: IngestRequest,
  opts: { queryFn?: AgentQueryFn } = {},
): Promise<CallResult> {
  const queryFn =
    opts.queryFn ??
    ((await import("@anthropic-ai/claude-agent-sdk")).query as unknown as AgentQueryFn);

  const pdfBuf = fs.readFileSync(req.bookPath);
  const pdfB64 = pdfBuf.toString("base64");

  async function* promptStream() {
    yield {
      type: "user" as const,
      parent_tool_use_id: null,
      message: {
        role: "user" as const,
        content: [
          {
            type: "document" as const,
            source: {
              type: "base64" as const,
              media_type: "application/pdf" as const,
              data: pdfB64,
            },
          },
          { type: "text" as const, text: buildUserMessage(req) },
        ],
      },
    };
  }

  const it = queryFn({
    prompt: promptStream(),
    options: {
      model: req.model,
      systemPrompt: SYSTEM_PROMPT,
      allowedTools: [],
      maxTurns: 1,
    },
  });

  let assistantText = "";
  for await (const msg of it) {
    if (msg.type === "assistant" && msg.message?.content) {
      for (const b of msg.message.content) {
        if (b.type === "text" && typeof b.text === "string") {
          assistantText += b.text;
        }
      }
    } else if (msg.type === "result") {
      break;
    }
  }

  const json = extractJsonBlock(assistantText);
  if (!json) {
    throw new Error(
      `model did not return a JSON block; got ${assistantText.slice(0, 200)}`,
    );
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(json);
  } catch (e) {
    throw new Error(
      `could not parse JSON block: ${(e as Error).message}; head=${json.slice(0, 200)}`,
    );
  }
  const payload = IngestPayload.parse(parsed);
  return { payload, rawText: assistantText };
}
