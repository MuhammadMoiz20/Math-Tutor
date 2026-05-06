import { check_equivalent } from "@/lib/sympy/server";
import type { IngestProblem } from "./schema";
import type { Provenance } from "./writer";

export interface VerifyResult {
  provenance: Provenance;
  detail?: string;
}

/**
 * Decide provenance for a single problem. Computational problems with an
 * expected_answer are run through SymPy `check_equivalent(answer, answer)`
 * as a parse smoke-test (the answer must at least be a valid SymPy
 * expression). When `from_book_appendix` is true, mark as `book` /
 * `book+verified` accordingly.
 */
export function verifyProblem(
  p: IngestProblem,
  checker: (a: string, b: string) => { equivalent?: boolean; error?: string } = check_equivalent,
): VerifyResult {
  const fromBook = p.from_book_appendix === true;
  if (p.type !== "computational") {
    return { provenance: fromBook ? "book" : "generated" };
  }
  if (!p.expected_answer) {
    return { provenance: fromBook ? "book" : "generated" };
  }
  const r = checker(p.expected_answer, p.expected_answer);
  const parsable = r.equivalent === true && !r.error;
  if (parsable) {
    return {
      provenance: fromBook ? "book+verified" : "generated+verified",
    };
  }
  return {
    provenance: fromBook ? "book" : "generated",
    detail: r.error ?? "sympy check failed",
  };
}

export function verifyAll(
  problems: IngestProblem[],
  checker?: (a: string, b: string) => { equivalent?: boolean; error?: string },
): Record<string, Provenance> {
  const out: Record<string, Provenance> = {};
  for (const p of problems) {
    out[p.id] = verifyProblem(p, checker).provenance;
  }
  return out;
}
