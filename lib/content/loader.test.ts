import { describe, it, expect } from "vitest";
import path from "node:path";
import { loadMdx } from "./loader";

describe("loadMdx", () => {
  it("parses frontmatter and body from sample fixture", () => {
    const abs = path.resolve(__dirname, "../../content/_fixtures/sample.mdx");
    const { frontmatter, source } = loadMdx(abs);
    expect(frontmatter.title).toBe("Sample");
    expect(source).toContain("$x^2$");
  });
});
