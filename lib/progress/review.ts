import type { Database as DB } from "better-sqlite3";
import { schedule, type Grade, type ReviewState } from "./sm2";

export interface ReviewRow extends ReviewState {
  user_id: number;
  problem_id: string;
}

interface DueRow extends ReviewRow {
  title: string;
  module_id: string;
}

export function getReviewState(
  db: DB,
  userId: number,
  problemId: string,
): ReviewState | null {
  const row = db
    .prepare(
      `SELECT due_at, ease, interval_days, reps, last_reviewed_at
       FROM review_queue WHERE user_id = ? AND problem_id = ?`,
    )
    .get(userId, problemId) as
    | {
        due_at: number;
        ease: number;
        interval_days: number;
        reps: number;
        last_reviewed_at: number | null;
      }
    | undefined;
  if (!row) return null;
  return {
    due_at: row.due_at,
    ease: row.ease,
    interval_days: row.interval_days,
    reps: row.reps,
    last_reviewed_at: row.last_reviewed_at ?? 0,
  };
}

export function upsertReviewAfterAttempt(
  db: DB,
  userId: number,
  problemId: string,
  grade: Grade,
  now: number,
): ReviewState {
  const prev = getReviewState(db, userId, problemId);
  const next = schedule(prev, grade, now);
  db.prepare(
    `INSERT INTO review_queue
       (user_id, problem_id, due_at, ease, interval_days, reps, last_reviewed_at)
     VALUES (?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(user_id, problem_id) DO UPDATE SET
       due_at = excluded.due_at,
       ease = excluded.ease,
       interval_days = excluded.interval_days,
       reps = excluded.reps,
       last_reviewed_at = excluded.last_reviewed_at`,
  ).run(
    userId,
    problemId,
    next.due_at,
    next.ease,
    next.interval_days,
    next.reps,
    next.last_reviewed_at,
  );
  return next;
}

export interface DueReviewItem {
  problem_id: string;
  title: string;
  module_id: string;
  due_at: number;
  interval_days: number;
  reps: number;
}

export function listDueReviews(
  db: DB,
  userId: number,
  now: number,
): DueReviewItem[] {
  const rows = db
    .prepare(
      `SELECT r.problem_id, r.due_at, r.interval_days, r.reps,
              p.title, p.module_id
       FROM review_queue r
       JOIN problems p ON p.id = r.problem_id
       WHERE r.user_id = ? AND r.due_at <= ?
       ORDER BY r.due_at ASC, r.problem_id ASC`,
    )
    .all(userId, now) as DueRow[];
  return rows.map((r) => ({
    problem_id: r.problem_id,
    title: r.title,
    module_id: r.module_id,
    due_at: r.due_at,
    interval_days: r.interval_days,
    reps: r.reps,
  }));
}
