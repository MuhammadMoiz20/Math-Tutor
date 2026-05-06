import type { Grade } from "./sm2";
import type { Verdict } from "@/lib/attempts/repo";

/**
 * Translates an attempt outcome into a SM-2 grade in [0..5].
 *
 * - Computational `correct`   → 5
 * - Computational `incorrect` → 1
 * - Derivation judge:
 *     "correct"   → 5
 *     "partial"   → 3 minus number of missing claims (floor 0)
 *     "incorrect" → 1
 */

export interface JudgeJsonShape {
  verdict?: "correct" | "partial" | "incorrect";
  missing_claims?: unknown[];
}

export interface AttemptForGrading {
  verdict: Verdict;
  judgeJson?: JudgeJsonShape | string | null;
}

function parseJudge(j: AttemptForGrading["judgeJson"]): JudgeJsonShape | null {
  if (!j) return null;
  if (typeof j === "string") {
    try {
      return JSON.parse(j) as JudgeJsonShape;
    } catch {
      return null;
    }
  }
  return j;
}

function clampGrade(n: number): Grade {
  const v = Math.max(0, Math.min(5, Math.round(n)));
  return v as Grade;
}

export function gradeFromAttempt(attempt: AttemptForGrading): Grade {
  const judge = parseJudge(attempt.judgeJson);
  if (judge && judge.verdict) {
    if (judge.verdict === "correct") return 5;
    if (judge.verdict === "incorrect") return 1;
    if (judge.verdict === "partial") {
      const missing = Array.isArray(judge.missing_claims)
        ? judge.missing_claims.length
        : 0;
      return clampGrade(3 - missing);
    }
  }
  if (attempt.verdict === "correct") return 5;
  if (attempt.verdict === "incorrect") return 1;
  return 1;
}
