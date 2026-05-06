import { describe, it, expect, beforeEach, afterEach } from "vitest";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { writeModule, hashString } from "./writer";
import { parseProblemMdx } from "@/lib/content/problems";
import { loadMdx } from "@/lib/content/loader";
import type { IngestPayload } from "./schema";

const PAYLOAD: IngestPayload = {
  concept_mdx: "# Generated concept\n\nA scalar is $s$.",
  worked_examples: [{ id: "1", mdx: "Example body." }],
  problems: [
    {
      id: "ingest-fixture-1",
      title: "Generated computational",
      type: "computational",
      expected_answer: "{1, 2}",
      source: { book: "MML", chapter: 2 },
      mdx: "Find the set.\n\n---SOLUTION---\n\nThe set is $\\{1,2\\}$.",
    },
  ],
};

describe("ingest output is consumable by the existing loaders", () => {
  let tmp: string;
  beforeEach(() => {
    tmp = fs.mkdtempSync(path.join(os.tmpdir(), "ingest-loader-"));
  });
  afterEach(() => fs.rmSync(tmp, { recursive: true, force: true }));

  it("written problem MDX parses through parseProblemMdx with proper frontmatter and SOLUTION split", () => {
    writeModule({
      moduleId: "ingested",
      contentRoot: tmp,
      payload: PAYLOAD,
      sourceHash: hashString("h"),
      model: "test",
      problemProvenance: { "ingest-fixture-1": "generated+verified" },
    });

    const probPath = path.join(tmp, "ingested", "problems", "ingest-fixture-1.mdx");
    const raw = fs.readFileSync(probPath, "utf8");
    const parsed = parseProblemMdx(raw);
    expect(parsed.frontmatter.id).toBe("ingest-fixture-1");
    expect(parsed.frontmatter.module_id).toBe("ingested");
    expect(parsed.frontmatter.type).toBe("computational");
    expect(parsed.frontmatter.expected_answer).toBe("{1, 2}");
    expect(parsed.source).toContain("Find the set.");
    expect(parsed.solution).toContain("The set is");

    const conceptPath = path.join(tmp, "ingested", "concept.mdx");
    const c = loadMdx(conceptPath);
    expect(c.source).toContain("Generated concept");
  });
});
