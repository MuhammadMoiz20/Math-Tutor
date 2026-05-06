import { describe, it, expect } from "vitest";
import { openDb } from "../db";
import { upsertOpened, getOpenedAt } from "./timers";

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
     VALUES ('p1','m1','Test','computational',1)`,
  ).run();
  return db;
}

describe("problem_timers repo", () => {
  it("getOpenedAt returns null when absent", () => {
    const db = setup();
    expect(getOpenedAt(db, 1, "p1")).toBeNull();
  });

  it("upsertOpened inserts and returns the value", () => {
    const db = setup();
    const t = upsertOpened(db, 1, "p1", 1000);
    expect(t).toBe(1000);
    expect(getOpenedAt(db, 1, "p1")).toBe(1000);
  });

  it("upsertOpened does NOT reset on revisit", () => {
    const db = setup();
    upsertOpened(db, 1, "p1", 1000);
    const second = upsertOpened(db, 1, "p1", 9999);
    expect(second).toBe(1000);
    expect(getOpenedAt(db, 1, "p1")).toBe(1000);
  });
});
