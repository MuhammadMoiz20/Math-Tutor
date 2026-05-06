import { describe, it, expect } from "vitest";
import { parseCurriculumYaml, Curriculum } from "@/lib/curriculum/schema";

const VALID = `
modules:
  - id: linalg-1
    title: Linear Algebra I
    ord: 1
    sources:
      - book: Mathematics for Machine Learning
        chapters: [2, 3]
        primary: true
        role: primary
  - id: calc-1
    title: Calculus I
    ord: 2
`;

const INVALID_MISSING_ID = `
modules:
  - title: Missing Id
    ord: 1
`;

describe("curriculum schema", () => {
  it("parses a valid YAML string and returns module ids", () => {
    const c = parseCurriculumYaml(VALID);
    expect(c.modules.map((m) => m.id)).toEqual(["linalg-1", "calc-1"]);
    expect(c.modules[0].sources[0].book).toBe(
      "Mathematics for Machine Learning",
    );
    expect(c.modules[1].sources).toEqual([]);
  });

  it("rejects YAML missing a module id", () => {
    expect(() => parseCurriculumYaml(INVALID_MISSING_ID)).toThrow();
  });

  it("Curriculum schema validates objects directly", () => {
    const parsed = Curriculum.parse({
      modules: [{ id: "m", title: "M", ord: 1 }],
    });
    expect(parsed.modules[0].sources).toEqual([]);
  });
});
