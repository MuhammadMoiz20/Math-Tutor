import { describe, it, expect } from "vitest";
import { openDb } from "../db";
import { upsertProblem } from "../problems/repo";
import { recordAttempt } from "../attempts/repo";
import { saveMessage } from "../chat/repo";
import { getProblemMeta, getUserHistory } from "./tools";

function setup() {
  const db = openDb(":memory:");
  db.prepare(
    "INSERT INTO users (email, password_hash) VALUES ('a@b.com','x')",
  ).run();
  db.prepare(
    "INSERT INTO modules (id, title, ord) VALUES ('linalg-1','Linalg', 1)",
  ).run();
  upsertProblem(db, {
    id: "p1",
    module_id: "linalg-1",
    title: "Test",
    type: "computational",
    expected_answer: "1",
    rubric: null,
    source: null,
    ord: 1,
  });
  return db;
}

describe("agent tools", () => {
  it("getProblemMeta returns title/module/type and an excerpt", () => {
    const db = setup();
    const meta = getProblemMeta(db, "p1");
    expect(meta).not.toBeNull();
    expect(meta!.title).toBe("Test");
    expect(meta!.module_id).toBe("linalg-1");
    expect(meta!.type).toBe("computational");
    expect(typeof meta!.statement_excerpt).toBe("string");
  });

  it("getProblemMeta returns null for unknown id", () => {
    const db = setup();
    expect(getProblemMeta(db, "nope")).toBeNull();
  });

  it("getUserHistory returns combined attempts + messages newest-first", () => {
    const db = setup();
    recordAttempt(db, {
      user_id: 1,
      problem_id: "p1",
      user_answer: "0",
      user_work: null,
      verdict: "incorrect",
      sympy_diff: null,
      judge_json: null,
    });
    saveMessage(db, {
      userId: 1,
      problemId: "p1",
      mode: "socratic",
      role: "user",
      content: "I'm stuck",
    });
    const hist = getUserHistory(db, 1, "p1", 10);
    expect(hist.length).toBeGreaterThanOrEqual(2);
    const kinds = new Set(hist.map((h) => h.kind));
    expect(kinds.has("attempt")).toBe(true);
    expect(kinds.has("message")).toBe(true);
  });

  it("getUserHistory respects the limit", () => {
    const db = setup();
    for (let i = 0; i < 5; i++) {
      saveMessage(db, {
        userId: 1,
        problemId: "p1",
        mode: "hints",
        role: "user",
        content: `m${i}`,
      });
    }
    expect(getUserHistory(db, 1, "p1", 3).length).toBe(3);
  });
});
