import fs from "node:fs";
import { IngestPayload, EMIT_TOOL } from "./schema";

/**
 * Minimal interface over `@anthropic-ai/sdk`'s messages.create — accepting any
 * shape so tests can pass a fake. We only need the tool_use block from the
 * response.
 */
export interface AnthropicLike {
  messages: {
    create: (req: unknown) => Promise<{
      content: Array<
        | { type: "text"; text: string }
        | { type: "tool_use"; name: string; input: unknown; id?: string }
        | { type: string; [k: string]: unknown }
      >;
      stop_reason?: string;
    }>;
  };
}

export interface IngestRequest {
  bookPath: string;
  bookTitle: string;
  moduleId: string;
  moduleTitle: string;
  chapters: number[];
  model: string;
}

export const SYSTEM_PROMPT = `You are an expert math content author for a single-user ML/AI tutoring app. \
Your job is to ingest specific chapters of a math textbook and emit MDX content: \
a concept page, worked examples, and problems with canonical solutions. \
\
Style rules: \
- Use KaTeX (\`$...$\` for inline, \`$$...$$\` for display). Never use \\( \\) or \\[ \\]. \
- Concept pages MUST include a short "Where this shows up in ML" sidebar at the end. \
- Problem ids are kebab-case and prefixed by the module id. \
- For computational problems, set \`expected_answer\` to a SymPy-parseable expression (e.g. \`x**2 + 1\`, \`{1, 3}\`, \`Matrix([[1,0],[0,1]])\`). \
- For derivation/proof problems, set \`rubric\` to a list of required claims and OMIT \`expected_answer\`. \
- Each problem mdx body is: statement, blank line, the literal line \`---SOLUTION---\`, blank line, then the canonical worked solution. \
- When the book's appendix gives the answer/solution, set \`from_book_appendix: true\`. Otherwise set it false (or omit) and we'll verify via SymPy. \
- Emit your entire response by calling the \`emit_module_content\` tool exactly once. Do not produce any text content.`;

export function buildUserMessage(req: IngestRequest): string {
  return `Module id: ${req.moduleId}\nModule title: ${req.moduleTitle}\nBook: ${req.bookTitle}\nChapters to ingest: ${req.chapters.join(", ")}\n\nRead the attached PDF, focus on the listed chapters, and emit the module content. Aim for one concept page (1-2 KaTeX-rich sections), 2-4 worked examples, and 6-12 problems mixing computational and derivation types.`;
}

export interface CallResult {
  payload: IngestPayload;
  rawToolInput: unknown;
}

export async function callAnthropicForModule(
  client: AnthropicLike,
  req: IngestRequest,
): Promise<CallResult> {
  const pdfBuf = fs.readFileSync(req.bookPath);
  const pdfB64 = pdfBuf.toString("base64");

  const response = await client.messages.create({
    model: req.model,
    max_tokens: 16_000,
    system: SYSTEM_PROMPT,
    tools: [EMIT_TOOL],
    tool_choice: { type: "tool", name: EMIT_TOOL.name },
    messages: [
      {
        role: "user",
        content: [
          {
            type: "document",
            source: {
              type: "base64",
              media_type: "application/pdf",
              data: pdfB64,
            },
          },
          { type: "text", text: buildUserMessage(req) },
        ],
      },
    ],
  });

  const toolBlock = response.content.find(
    (b): b is { type: "tool_use"; name: string; input: unknown } =>
      (b as { type?: string }).type === "tool_use",
  );
  if (!toolBlock) {
    throw new Error(
      `model did not call emit_module_content (stop_reason=${response.stop_reason ?? "?"})`,
    );
  }
  const payload = IngestPayload.parse(toolBlock.input);
  return { payload, rawToolInput: toolBlock.input };
}
