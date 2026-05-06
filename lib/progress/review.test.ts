import { describe, it, expect } from "vitest";
import { openDb } from "../db";
import {
  getReviewState,
  listDueReviews,
  upsertReviewAfterAttempt,
} from "./review";

const NOW = 1_700_000_000;
const DAY = 86400;

function setup() {
  const db = openDb(":memory:");
  db.prepare(
    "INSERT INTO users (email, password_hash) VALUES ('a@b.com','x')",
  ).run();
  db.prepare(
    "INSERT INTO modules (id, title, ord) VALUES ('m1','M', 1)",
  ).run();
  db.prepare(
    `INSERT INTO problems (id, module_id, title, type, ord)
     VALUES ('p1','m1','Test1','computational',1),
            ('p2','m1','Test2','computational',2)`,
  ).run();
  return db;
}

describe("review repo", () => {
  it("returns null state when absent", () => {
    const db = setup();
    expect(getReviewState(db, 1, "p1")).toBeNull();
  });

  it("upserts a fresh review on first correct attempt", () => {
    const db = setup();
    const next = upsertReviewAfterAttempt(db, 1, "p1", 5, NOW);
    expect(next.reps).toBe(1);
    expect(next.interval_days).toBe(1);

    const persisted = getReviewState(db, 1, "p1");
    expect(persisted?.reps).toBe(1);
    expect(persisted?.due_at).toBe(NOW + DAY);
  });

  it("wrong attempt schedules same-day review", () => {
    const db = setup();
    upsertReviewAfterAttempt(db, 1, "p1", 5, NOW);
    upsertReviewAfterAttempt(db, 1, "p1", 1, NOW + DAY + 100);
    const persisted = getReviewState(db, 1, "p1");
    expect(persisted?.reps).toBe(0);
    expect(persisted?.interval_days).toBe(0);
    expect(persisted?.due_at).toBe(NOW + DAY + 100);
  });

  it("listDueReviews returns rows whose due_at <= now", () => {
    const db = setup();
    upsertReviewAfterAttempt(db, 1, "p1", 1, NOW); // due now
    upsertReviewAfterAttempt(db, 1, "p2", 5, NOW); // due in 1 day
    const due = listDueReviews(db, 1, NOW + 60);
    expect(due.map((r) => r.problem_id)).toEqual(["p1"]);

    const dueLater = listDueReviews(db, 1, NOW + DAY + 60);
    expect(dueLater.map((r) => r.problem_id).sort()).toEqual(["p1", "p2"]);
  });
});
