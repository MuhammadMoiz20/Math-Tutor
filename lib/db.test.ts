import { describe, it, expect } from "vitest";
import { openDb } from "@/lib/db";

describe("openDb", () => {
  it("creates users table from migrations", () => {
    const db = openDb(":memory:");
    const row = db
      .prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='users'")
      .get() as { name?: string } | undefined;
    expect(row?.name).toBe("users");
  });

  it("users table has expected columns", () => {
    const db = openDb(":memory:");
    const cols = db.prepare("PRAGMA table_info(users)").all() as Array<{ name: string }>;
    const names = cols.map((c) => c.name).sort();
    expect(names).toEqual(["created_at", "email", "id", "password_hash"]);
  });
});
