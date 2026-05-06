/**
 * Test-only helper: seed or update a row in `review_queue`.
 *
 * Invoked from Playwright via `npx tsx tests/helpers/seed-review.ts <userEmail>
 * <problemId> <dueAtUnixSeconds> [interval_days] [reps] [ease]`.
 */

import { openDb } from "../../lib/db";

function main() {
  const [email, problemId, dueAtArg, intervalArg, repsArg, easeArg] =
    process.argv.slice(2);
  if (!email || !problemId || !dueAtArg) {
    console.error(
      "usage: seed-review.ts <userEmail> <problemId> <dueAt> [interval] [reps] [ease]",
    );
    process.exit(2);
  }
  const dueAt = Number(dueAtArg);
  const interval = intervalArg ? Number(intervalArg) : 1;
  const reps = repsArg ? Number(repsArg) : 1;
  const ease = easeArg ? Number(easeArg) : 2.5;

  const db = openDb(process.env.DB_PATH ?? "math-tutor.db");
  const userRow = db
    .prepare("SELECT id FROM users WHERE email = ?")
    .get(email) as { id: number } | undefined;
  if (!userRow) {
    console.error(`no user with email ${email}`);
    process.exit(3);
  }
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
  ).run(userRow.id, problemId, dueAt, ease, interval, reps, dueAt);
  console.log(`seeded review_queue: user=${userRow.id} problem=${problemId} due_at=${dueAt}`);
}

main();
