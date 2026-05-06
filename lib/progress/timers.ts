import type { Database as DB } from "better-sqlite3";

/**
 * Insert the row only if absent. Repeated visits do NOT reset the timer —
 * that would defeat the Solution-mode unlock gate.
 */
export function upsertOpened(
  db: DB,
  userId: number,
  problemId: string,
  now: number,
): number {
  db.prepare(
    `INSERT INTO problem_timers (user_id, problem_id, opened_at)
     VALUES (?, ?, ?)
     ON CONFLICT(user_id, problem_id) DO NOTHING`,
  ).run(userId, problemId, now);
  return getOpenedAt(db, userId, problemId)!;
}

export function getOpenedAt(
  db: DB,
  userId: number,
  problemId: string,
): number | null {
  const row = db
    .prepare(
      `SELECT opened_at FROM problem_timers WHERE user_id = ? AND problem_id = ?`,
    )
    .get(userId, problemId) as { opened_at: number } | undefined;
  return row ? row.opened_at : null;
}
