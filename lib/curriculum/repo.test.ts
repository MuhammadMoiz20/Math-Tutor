import { describe, it, expect } from "vitest";
import { openDb } from "@/lib/db";
import { seedModules, listModules } from "@/lib/curriculum/repo";
import type { Curriculum } from "@/lib/curriculum/schema";

const sample: Curriculum = {
  modules: [
    { id: "linalg-1", title: "Linear Algebra I", ord: 1, sources: [] },
    { id: "calc-1", title: "Calculus I", ord: 2, sources: [] },
  ],
};

describe("seedModules", () => {
  it("upserts rows from a curriculum", () => {
    const db = openDb(":memory:");
    seedModules(db, sample);
    const rows = listModules(db);
    expect(rows.map((r) => r.id)).toEqual(["linalg-1", "calc-1"]);
    expect(rows[0].title).toBe("Linear Algebra I");
  });

  it("is idempotent when called twice with same data", () => {
    const db = openDb(":memory:");
    seedModules(db, sample);
    seedModules(db, sample);
    const rows = listModules(db);
    expect(rows.length).toBe(2);
  });

  it("overwrites title and ord on re-seed", () => {
    const db = openDb(":memory:");
    seedModules(db, sample);
    seedModules(db, {
      modules: [
        { id: "linalg-1", title: "Linear Algebra (updated)", ord: 5, sources: [] },
        { id: "calc-1", title: "Calculus I", ord: 2, sources: [] },
      ],
    });
    const rows = listModules(db);
    const la = rows.find((r) => r.id === "linalg-1")!;
    expect(la.title).toBe("Linear Algebra (updated)");
    expect(la.ord).toBe(5);
    // ord ordering should now place calc-1 first
    expect(rows[0].id).toBe("calc-1");
  });
});
