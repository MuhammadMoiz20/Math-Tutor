import { NextResponse } from "next/server";
import { z } from "zod";
import { getDb } from "@/lib/db";
import { getProblem } from "@/lib/problems/repo";
import { recordAttempt, type Verdict } from "@/lib/attempts/repo";
import { requireUserId } from "@/lib/auth/current-user";

const BodySchema = z.object({
  problemId: z.string().min(1),
  userAnswer: z.string().nullable().optional(),
  userWork: z.string().nullable().optional(),
  sympyVerdict: z.object({
    equivalent: z.boolean(),
    simplified_diff: z.string().optional(),
    error: z.string().optional(),
  }),
});

export async function POST(req: Request) {
  let userId: number;
  try {
    userId = await requireUserId();
  } catch {
    return NextResponse.json({ error: "unauthenticated" }, { status: 401 });
  }

  let body: z.infer<typeof BodySchema>;
  try {
    body = BodySchema.parse(await req.json());
  } catch (e) {
    return NextResponse.json(
      { error: "invalid body", details: String(e) },
      { status: 400 },
    );
  }

  const db = getDb();
  const problem = getProblem(db, body.problemId);
  if (!problem) {
    return NextResponse.json({ error: "problem not found" }, { status: 404 });
  }

  // Lightweight server-side sanity check: if there's no expected answer,
  // we cannot trust an "equivalent: true" client verdict.
  if (!problem.expected_answer && body.sympyVerdict.equivalent) {
    return NextResponse.json(
      { error: "problem has no expected_answer; cannot verify" },
      { status: 422 },
    );
  }

  const verdict: Verdict = body.sympyVerdict.equivalent
    ? "correct"
    : "incorrect";

  const attempt = recordAttempt(db, {
    user_id: userId,
    problem_id: body.problemId,
    user_answer: body.userAnswer ?? null,
    user_work: body.userWork ?? null,
    verdict,
    sympy_diff:
      body.sympyVerdict.simplified_diff ?? body.sympyVerdict.error ?? null,
    judge_json: null,
  });

  return NextResponse.json({
    ok: true,
    attemptId: attempt.id,
    verdict,
  });
}
