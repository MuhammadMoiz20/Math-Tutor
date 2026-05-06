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

