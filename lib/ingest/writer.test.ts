import { describe, it, expect, beforeEach, afterEach } from "vitest";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import matter from "gray-matter";
import {
  writeModule,
  hashString,
  renderProblemMdx,
  renderConceptMdx,
} from "./writer";
import type { IngestPayload } from "./schema";

const PAYLOAD: IngestPayload = {
  concept_mdx: "# Vectors\n\nA vector is $\\vec{v}$.",
  worked_examples: [{ id: "1", mdx: "Compute $1+1=2$." }],
  problems: [
    {
      id: "test-comp-1",
      title: "Compute",
      type: "computational",
      expected_answer: "x**2 + 1",
      source: { book: "MML", chapter: 2 },
      mdx: "Find $f(x)$ such that... \n\n---SOLUTION---\n\n$f(x) = x^2+1$.",
    },
    {
      id: "test-proof-1",
      title: "Prove",
      type: "proof",
      rubric: ["state hypothesis", "apply induction"],
      source: { book: "MML", chapter: 2 },
      mdx: "Prove that $n^2 \\ge 0$.\n\n---SOLUTION---\n\nObvious.",
    },
  ],
};

describe("ingest/writer", () => {
  let tmp: string;
  beforeEach(() => {
    tmp = fs.mkdtempSync(path.join(os.tmpdir(), "writer-"));
  });
  afterEach(() => fs.rmSync(tmp, { recursive: true, force: true }));

  it("writes concept, worked, and problem files with sidecars", () => {
    const r = writeModule({
      moduleId: "test-mod",
      contentRoot: tmp,
      payload: PAYLOAD,
      sourceHash: hashString("hash-1"),
      model: "claude-sonnet-4-5",
      problemProvenance: {
        "test-comp-1": "generated+verified",
        "test-proof-1": "generated",
      },
    });
    expect(r.written.length).toBe(4);
    expect(r.skipped.length).toBe(0);

    const concept = fs.readFileSync(path.join(tmp, "test-mod", "concept.mdx"), "utf8");
    expect(concept).toContain("Vectors");

    const probPath = path.join(tmp, "test-mod", "problems", "test-comp-1.mdx");
    const probRaw = fs.readFileSync(probPath, "utf8");
    const fm = matter(probRaw).data;
    expect(fm.id).toBe("test-comp-1");
    expect(fm.module_id).toBe("test-mod");
    expect(fm.type).toBe("computational");
    expect(fm.expected_answer).toBe("x**2 + 1");
    expect(fm.provenance).toBe("generated+verified");
    expect(fm.ord).toBe(1);

    expect(fs.existsSync(probPath + ".ingest.json")).toBe(true);
    const sidecar = JSON.parse(fs.readFileSync(probPath + ".ingest.json", "utf8"));
    expect(sidecar.source_hash).toBe(hashString("hash-1"));
    expect(sidecar.provenance).toBe("generated+verified");
  });

  it("is idempotent: same source_hash skips on second write", () => {
    const args = {
      moduleId: "test-mod",
      contentRoot: tmp,
      payload: PAYLOAD,
      sourceHash: hashString("h"),
      model: "m",
    };
    const r1 = writeModule(args);
    expect(r1.written.length).toBe(4);
    const r2 = writeModule(args);
    expect(r2.written.length).toBe(0);
    expect(r2.skipped.length).toBe(4);
  });

  it("--force overwrites even with same source_hash", () => {
    const args = {
      moduleId: "test-mod",
      contentRoot: tmp,
      payload: PAYLOAD,
      sourceHash: hashString("h"),
      model: "m",
    };
    writeModule(args);
    const r2 = writeModule({ ...args, force: true });
    expect(r2.written.length).toBe(4);
  });

  it("different source_hash triggers rewrite", () => {
    writeModule({
      moduleId: "test-mod",
      contentRoot: tmp,
      payload: PAYLOAD,
      sourceHash: hashString("a"),
      model: "m",
    });
    const r2 = writeModule({
      moduleId: "test-mod",
      contentRoot: tmp,
      payload: PAYLOAD,
      sourceHash: hashString("b"),
      model: "m",
    });
    expect(r2.written.length).toBe(4);
  });

  it("dryRun writes nothing to disk", () => {
    const r = writeModule({
      moduleId: "test-mod",
      contentRoot: tmp,
      payload: PAYLOAD,
      sourceHash: "h",
      model: "m",
      dryRun: true,
    });
    expect(r.written.length).toBe(4);
    expect(fs.existsSync(path.join(tmp, "test-mod"))).toBe(false);
  });

  it("renderProblemMdx adds TODO comment for unverified generated problems", () => {
    const out = renderProblemMdx(PAYLOAD.problems[0], "test-mod", 1, "generated");
    expect(out).toContain("TODO");
    expect(out).toContain("---SOLUTION---");
  });

  it("renderConceptMdx emits frontmatter and body", () => {
    const out = renderConceptMdx(PAYLOAD);
    expect(out.startsWith("---\n")).toBe(true);
    expect(out).toContain("Vectors");
  });
});
