import { describe, it, expect, beforeEach } from "vitest";
import { openDb } from "@/lib/db";
import { seedModules } from "@/lib/curriculum/repo";
import { upsertProblem } from "@/lib/problems/repo";
import { recordAttempt, listAttempts } from "./repo";

function freshDb() {
  const db = openDb(":memory:");
  seedModules(db, {
    modules: [{ id: "linalg-1", title: "Linear Algebra I", ord: 1, sources: [] }],
  });
  db.prepare(
    `INSERT INTO users (email, password_hash) VALUES (?, ?)`,
  ).run("a@b.c", "x");
  upsertProblem(db, {
    id: "p1",
    module_id: "linalg-1",
    title: "P1",
    type: "computational",
    expected_answer: "{1, 3}",
    rubric: null,
    source: null,
    ord: 1,
  });
  return db;
}

describe("attempts repo", () => {
  let db: ReturnType<typeof freshDb>;
  beforeEach(() => {
    db = freshDb();
  });

  it("records and lists attempts in reverse chronological order", () => {
    const a = recordAttempt(db, {
      user_id: 1,
      problem_id: "p1",
      user_answer: "{1, 2}",
      user_work: "scratch",
      verdict: "incorrect",
      sympy_diff: "1",
      judge_json: null,
    });
    expect(a.id).toBeGreaterThan(0);
    expect(a.verdict).toBe("incorrect");
    const b = recordAttempt(db, {
      user_id: 1,
      problem_id: "p1",
      user_answer: "{1, 3}",
      user_work: null,
      verdict: "correct",
      sympy_diff: null,
      judge_json: null,
    });
    const rows = listAttempts(db, 1, "p1");
    expect(rows).toHaveLength(2);
    expect(rows[0].id).toBe(b.id);
    expect(rows[1].id).toBe(a.id);
  });

  it("scopes by user and problem", () => {
    db.prepare(`INSERT INTO users (email, password_hash) VALUES (?, ?)`).run(
      "c@d.e",
      "x",
    );
    recordAttempt(db, {
      user_id: 1,
      problem_id: "p1",
      user_answer: "x",
      user_work: null,
      verdict: "correct",
      sympy_diff: null,
      judge_json: null,
    });
    recordAttempt(db, {
      user_id: 2,
      problem_id: "p1",
      user_answer: "y",
      user_work: null,
      verdict: "incorrect",
      sympy_diff: null,
      judge_json: null,
    });
    expect(listAttempts(db, 1, "p1")).toHaveLength(1);
    expect(listAttempts(db, 2, "p1")).toHaveLength(1);
    expect(listAttempts(db, 1, "missing")).toHaveLength(0);
  });
});
