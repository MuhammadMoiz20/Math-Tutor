import { describe, it, expect } from "vitest";
import { openDb } from "../db";
import { saveMessage, listMessages } from "./repo";

function setup() {
  const db = openDb(":memory:");
  db.prepare(
    "INSERT INTO users (email, password_hash) VALUES ('a@b.com','x')",
  ).run();
  db.prepare(
    "INSERT INTO modules (id, title, ord) VALUES ('m1','M1', 1)",
  ).run();
  db.prepare(
    "INSERT INTO problems (id, module_id, title, type, ord) VALUES ('p1','m1','P1','computational',1)",
  ).run();
  return db;
}

describe("chat repo", () => {
  it("saves and lists messages by mode", () => {
    const db = setup();
    saveMessage(db, {
      userId: 1,
      problemId: "p1",
      mode: "socratic",
      role: "user",
      content: "hi",
    });
    saveMessage(db, {
      userId: 1,
      problemId: "p1",
      mode: "socratic",
      role: "assistant",
      content: "what's the goal?",
    });
    saveMessage(db, {
      userId: 1,
      problemId: "p1",
      mode: "hints",
      role: "user",
      content: "stuck",
    });
    const socratic = listMessages(db, 1, "p1", "socratic");
    expect(socratic.length).toBe(2);
    expect(socratic[0].role).toBe("user");
    expect(socratic[1].role).toBe("assistant");
    const hints = listMessages(db, 1, "p1", "hints");
    expect(hints.length).toBe(1);
  });

  it("scopes to user/problem/mode", () => {
    const db = setup();
    saveMessage(db, {
      userId: 1,
      problemId: "p1",
      mode: "rigor",
      role: "user",
      content: "review this",
    });
    expect(listMessages(db, 1, "p1", "exam").length).toBe(0);
    expect(listMessages(db, 2, "p1", "rigor").length).toBe(0);
  });
});
