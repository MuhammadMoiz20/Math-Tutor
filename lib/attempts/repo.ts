import type { Database as DB } from "better-sqlite3";

export type Verdict = "correct" | "incorrect" | "pending";

export interface AttemptInput {
  user_id: number;
  problem_id: string;
  user_answer: string | null;
  user_work: string | null;
  verdict: Verdict;
  sympy_diff: string | null;
  judge_json: string | null;
}

export interface Attempt extends AttemptInput {
  id: number;
  created_at: number;
}

export function recordAttempt(db: DB, attempt: AttemptInput): Attempt {
  const result = db
    .prepare(
      `INSERT INTO attempts (user_id, problem_id, user_answer, user_work, verdict, sympy_diff, judge_json)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(
      attempt.user_id,
      attempt.problem_id,
      attempt.user_answer,
      attempt.user_work,
      attempt.verdict,
      attempt.sympy_diff,
      attempt.judge_json,
    );
  const row = db
    .prepare(`SELECT * FROM attempts WHERE id = ?`)
    .get(result.lastInsertRowid) as Attempt;
  return row;
}

export function listAttempts(
  db: DB,
  userId: number,
  problemId: string,
): Attempt[] {
  return db
    .prepare(
      `SELECT * FROM attempts WHERE user_id = ? AND problem_id = ?
       ORDER BY created_at DESC, id DESC`,
    )
    .all(userId, problemId) as Attempt[];
}
