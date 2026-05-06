import { z } from "zod";

export const WorkedExample = z.object({
  id: z.string().min(1),
  mdx: z.string().min(1),
});

export const IngestProblem = z.object({
  id: z.string().min(1),
  title: z.string().min(1),
  type: z.enum(["computational", "derivation", "proof"]),
  expected_answer: z.string().optional(),
  rubric: z.array(z.string()).optional(),
  source: z
    .object({
      book: z.string(),
      chapter: z.union([z.number(), z.string()]).optional(),
      page: z.union([z.number(), z.string()]).optional(),
    })
    .passthrough(),
  mdx: z.string().min(1),
  /** Whether the answer was lifted from the book's appendix. */
  from_book_appendix: z.boolean().optional(),
});

export const IngestPayload = z.object({
  concept_mdx: z.string().min(1),
  worked_examples: z.array(WorkedExample),
  problems: z.array(IngestProblem),
});

export type WorkedExample = z.infer<typeof WorkedExample>;
export type IngestProblem = z.infer<typeof IngestProblem>;
export type IngestPayload = z.infer<typeof IngestPayload>;

/**
 * Anthropic tool definition the model must use to emit results.
 * Strict shape — we then re-validate with zod after the call.
 */
export const EMIT_TOOL = {
  name: "emit_module_content",
  description:
    "Emit MDX content for a curriculum module. Call exactly once with the full payload; do not stream multiple calls.",
  input_schema: {
    type: "object" as const,
    properties: {
      concept_mdx: {
        type: "string",
        description:
          "Full MDX body (no frontmatter) for the module concept page. Use KaTeX (`$...$` and `$$...$$`). Include a 'Where this shows up in ML' sidebar.",
      },
      worked_examples: {
        type: "array",
        items: {
          type: "object",
          properties: {
            id: { type: "string", description: "Slug like '1', '2', etc." },
            mdx: { type: "string" },
          },
          required: ["id", "mdx"],
        },
      },
      problems: {
        type: "array",
        items: {
          type: "object",
          properties: {
            id: { type: "string", description: "kebab-case id, e.g. 'linalg-1-rank-1'" },
            title: { type: "string" },
            type: {
              type: "string",
              enum: ["computational", "derivation", "proof"],
            },
            expected_answer: {
              type: "string",
              description:
                "SymPy-parseable expression for computational problems (e.g. '{1, 3}', 'x**2 + 1').",
            },
            rubric: {
              type: "array",
              items: { type: "string" },
              description: "List of required claims for derivation/proof problems.",
            },
            source: {
              type: "object",
              properties: {
                book: { type: "string" },
                chapter: {},
                page: {},
              },
              required: ["book"],
            },
            mdx: {
              type: "string",
              description:
                "Problem MDX body. Statement, blank line, '---SOLUTION---', blank line, canonical worked solution.",
            },
            from_book_appendix: {
              type: "boolean",
              description: "True if expected_answer/solution is from the book's official appendix.",
            },
          },
          required: ["id", "title", "type", "source", "mdx"],
        },
      },
    },
    required: ["concept_mdx", "worked_examples", "problems"],
  },
} as const;
