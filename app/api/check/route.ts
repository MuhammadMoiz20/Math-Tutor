import { NextResponse } from "next/server";
import { z } from "zod";
import { getDb } from "@/lib/db";
import { getProblem } from "@/lib/problems/repo";
import { recordAttempt, type Verdict } from "@/lib/attempts/repo";
import { requireUserId } from "@/lib/auth/current-user";
import { loadProblemMdx } from "@/lib/content/problems";
import { judgeDerivation, type JudgeVerdict } from "@/lib/agent/judge";
import { gradeFromAttempt } from "@/lib/progress/grade";
import { upsertReviewAfterAttempt } from "@/lib/progress/review";

const BodySchema = z.object({
  problemId: z.string().min(1),
  userAnswer: z.string().nullable().optional(),
  userWork: z.string().nullable().optional(),
  sympyVerdict: z
    .object({
      equivalent: z.boolean(),
      simplified_diff: z.string().optional(),
      error: z.string().optional(),
    })
    .optional(),
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

  // ---- Derivation problems: LLM-judge path ----
  if (problem.type === "derivation") {
    const mdx = loadProblemMdx(problem.module_id, problem.id);
    if (!mdx) {
      return NextResponse.json({ error: "mdx missing" }, { status: 500 });
    }
    let judgeVerdict: JudgeVerdict;
    try {
      judgeVerdict = await judgeDerivation({
        problemStatement: mdx.source,
        rubric: problem.rubric ?? [],
        userWork: body.userWork ?? body.userAnswer ?? "",
        canonicalSolution: mdx.solution,
      });
    } catch (e) {
      return NextResponse.json(
        { error: "judge failed", details: String((e as Error).message) },
        { status: 502 },
      );
    }
    const v: Verdict =
      judgeVerdict.verdict === "correct" ? "correct" : "incorrect";
    const attempt = recordAttempt(db, {
      user_id: userId,
      problem_id: body.problemId,
      user_answer: body.userAnswer ?? null,
      user_work: body.userWork ?? null,
      verdict: v,
      sympy_diff: null,
      judge_json: JSON.stringify(judgeVerdict),
    });
    const grade = gradeFromAttempt({ verdict: v, judgeJson: judgeVerdict });
    upsertReviewAfterAttempt(
      db,
      userId,
      body.problemId,
      grade,
      (Date.now() / 1000) | 0,
    );
    return NextResponse.json({
      ok: true,
      attemptId: attempt.id,
      verdict: v,
      judge: judgeVerdict,
    });
  }

  // ---- Computational problems: SymPy verdict path ----
  if (!body.sympyVerdict) {
    return NextResponse.json(
      { error: "sympyVerdict required for computational problems" },
      { status: 400 },
    );
  }
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

  const grade = gradeFromAttempt({ verdict });
  upsertReviewAfterAttempt(
    db,
    userId,
    body.problemId,
    grade,
    (Date.now() / 1000) | 0,
  );

  return NextResponse.json({
    ok: true,
    attemptId: attempt.id,
    verdict,
  });
}
