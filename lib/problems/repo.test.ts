import { describe, it, expect, beforeEach } from "vitest";
import { openDb } from "@/lib/db";
import { seedModules } from "@/lib/curriculum/repo";
import {
  upsertProblem,
  getProblem,
  listProblemsByModule,
  type Problem,
} from "./repo";

function freshDb() {
  const db = openDb(":memory:");
  seedModules(db, {
    modules: [
      { id: "linalg-1", title: "Linear Algebra I", ord: 1, sources: [] },
      { id: "linalg-2", title: "Linear Algebra II", ord: 2, sources: [] },
    ],
  });
  return db;
}

describe("problems repo", () => {
  let db: ReturnType<typeof freshDb>;

  beforeEach(() => {
    db = freshDb();
  });

  it("upserts and reads a problem", () => {
    const p: Problem = {
      id: "linalg-1-eigen-1",
      module_id: "linalg-1",
      title: "Eigenvalues",
      type: "computational",
      expected_answer: "{1, 3}",
      rubric: null,
      source: { book: "MML", chapter: 4 },
      ord: 1,
    };
    upsertProblem(db, p);
    const got = getProblem(db, "linalg-1-eigen-1");
    expect(got).not.toBeNull();
    expect(got!.title).toBe("Eigenvalues");
    expect(got!.type).toBe("computational");
    expect(got!.expected_answer).toBe("{1, 3}");
    expect(got!.source).toEqual({ book: "MML", chapter: 4 });
    expect(got!.ord).toBe(1);
  });

  it("upsert is idempotent and updates fields", () => {
    const p: Problem = {
      id: "p1",
      module_id: "linalg-1",
      title: "A",
      type: "computational",
      expected_answer: null,
      rubric: null,
      source: null,
      ord: 1,
    };
    upsertProblem(db, p);
    upsertProblem(db, { ...p, title: "B" });
    expect(getProblem(db, "p1")!.title).toBe("B");
  });

  it("lists problems by module ordered by ord", () => {
    const base: Omit<Problem, "id" | "ord"> = {
      module_id: "linalg-1",
      title: "x",
      type: "computational",
      expected_answer: null,
      rubric: null,
      source: null,
    };
    upsertProblem(db, { ...base, id: "b", ord: 2 });
    upsertProblem(db, { ...base, id: "a", ord: 1 });
    upsertProblem(db, { ...base, id: "c", module_id: "linalg-2", ord: 1 });
    const rows = listProblemsByModule(db, "linalg-1");
    expect(rows.map((r) => r.id)).toEqual(["a", "b"]);
  });

  it("getProblem returns null for unknown id", () => {
    expect(getProblem(db, "nope")).toBeNull();
  });
});
