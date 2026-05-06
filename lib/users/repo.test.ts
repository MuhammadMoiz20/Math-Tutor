import { describe, it, expect, beforeEach } from "vitest";
import { openDb } from "@/lib/db";
import { createUser, verifyUser } from "@/lib/users/repo";
import type { Database } from "better-sqlite3";

describe("users repo", () => {
  let db: Database;
  beforeEach(() => {
    db = openDb(":memory:");
  });

  it("creates a user and returns numeric id", () => {
    const id = createUser(db, "a@b.com", "password123");
    expect(typeof id).toBe("number");
    expect(id).toBeGreaterThan(0);
  });

  it("verifies a user with the correct password", () => {
    createUser(db, "a@b.com", "password123");
    const u = verifyUser(db, "a@b.com", "password123");
    expect(u).toMatchObject({ email: "a@b.com" });
    expect(typeof u?.id).toBe("number");
  });

  it("returns null for wrong password", () => {
    createUser(db, "a@b.com", "password123");
    expect(verifyUser(db, "a@b.com", "wrong")).toBeNull();
  });

  it("returns null for missing user", () => {
    expect(verifyUser(db, "nope@b.com", "password123")).toBeNull();
  });
});
