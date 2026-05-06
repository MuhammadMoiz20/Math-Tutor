import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import type { IngestPayload, IngestProblem, WorkedExample } from "./schema";

export type Provenance =
  | "book"
  | "book+verified"
  | "generated"
  | "generated+verified";

export interface SidecarMeta {
  source_hash: string;
  generated_at: string;
  model: string;
  provenance: Provenance;
}

export interface WriteOptions {
  moduleId: string;
  contentRoot: string;
  payload: IngestPayload;
  /** Hash of source PDF + chapter selection — drives idempotency. */
  sourceHash: string;
  model: string;
  /** Per-problem provenance map (id -> provenance). Defaults to "generated". */
  problemProvenance?: Record<string, Provenance>;
  force?: boolean;
  dryRun?: boolean;
}

export interface WriteResult {
  written: string[];
  skipped: string[];
}

export function hashString(s: string): string {
  return crypto.createHash("sha256").update(s).digest("hex");
}

export function hashFile(p: string): string {
  const buf = fs.readFileSync(p);
  return crypto.createHash("sha256").update(buf).digest("hex");
}

function readSidecar(absMdxPath: string): SidecarMeta | null {
  const sidecar = absMdxPath + ".ingest.json";
  if (!fs.existsSync(sidecar)) return null;
  try {
    return JSON.parse(fs.readFileSync(sidecar, "utf8")) as SidecarMeta;
  } catch {
    return null;
  }
}

function writeFileWithSidecar(
  absMdxPath: string,
  body: string,
  meta: SidecarMeta,
  force: boolean,
  dryRun: boolean,
): "written" | "skipped" {
  const existing = readSidecar(absMdxPath);
  if (
    !force &&
    existing &&
    existing.source_hash === meta.source_hash &&
    fs.existsSync(absMdxPath)
  ) {
    return "skipped";
  }
  if (dryRun) return "written";
  fs.mkdirSync(path.dirname(absMdxPath), { recursive: true });
  fs.writeFileSync(absMdxPath, body);
  fs.writeFileSync(absMdxPath + ".ingest.json", JSON.stringify(meta, null, 2));
  return "written";
}

function frontmatter(obj: Record<string, unknown>): string {
  const lines: string[] = ["---"];
  for (const [k, v] of Object.entries(obj)) {
    if (v === undefined) continue;
    if (Array.isArray(v)) {
      lines.push(`${k}:`);
      for (const item of v) lines.push(`  - ${JSON.stringify(item)}`);
    } else if (typeof v === "object" && v !== null) {
      lines.push(`${k}: ${JSON.stringify(v)}`);
    } else if (typeof v === "string") {
      lines.push(`${k}: ${JSON.stringify(v)}`);
    } else {
      lines.push(`${k}: ${String(v)}`);
    }
  }
  lines.push("---", "");
  return lines.join("\n");
}

export function renderConceptMdx(payload: IngestPayload): string {
  return frontmatter({ title: "Concept" }) + payload.concept_mdx.trim() + "\n";
}

export function renderWorkedMdx(w: WorkedExample): string {
  return (
    frontmatter({ id: w.id, title: `Worked example ${w.id}` }) +
    w.mdx.trim() +
    "\n"
  );
}

export function renderProblemMdx(
  p: IngestProblem,
  moduleId: string,
  ord: number,
  provenance: Provenance,
): string {
  const fm: Record<string, unknown> = {
    id: p.id,
    module_id: moduleId,
    title: p.title,
    type: p.type,
    ord,
    source: p.source,
    provenance,
  };
  if (p.expected_answer !== undefined) fm.expected_answer = p.expected_answer;
  if (p.rubric !== undefined) fm.rubric = p.rubric;
  let body = p.mdx.trim();
  if (provenance === "generated") {
    body =
      body +
      "\n\n{/* TODO: SymPy verification did not confirm this answer; review manually. */}\n";
  }
  return frontmatter(fm) + body + "\n";
}

export function writeModule(opts: WriteOptions): WriteResult {
  const { moduleId, contentRoot, payload, sourceHash, model, force = false, dryRun = false } = opts;
  const provMap = opts.problemProvenance ?? {};
  const moduleDir = path.join(contentRoot, moduleId);
  const written: string[] = [];
  const skipped: string[] = [];
  const now = new Date().toISOString();

  const conceptPath = path.join(moduleDir, "concept.mdx");
  const conceptResult = writeFileWithSidecar(
    conceptPath,
    renderConceptMdx(payload),
    { source_hash: sourceHash, generated_at: now, model, provenance: "generated" },
    force,
    dryRun,
  );
  (conceptResult === "written" ? written : skipped).push(conceptPath);

  for (const w of payload.worked_examples) {
    const p = path.join(moduleDir, "worked", `${w.id}.mdx`);
    const r = writeFileWithSidecar(
      p,
      renderWorkedMdx(w),
      { source_hash: sourceHash, generated_at: now, model, provenance: "generated" },
      force,
      dryRun,
    );
    (r === "written" ? written : skipped).push(p);
  }

  payload.problems.forEach((prob, idx) => {
    const prov: Provenance = provMap[prob.id] ?? "generated";
    const p = path.join(moduleDir, "problems", `${prob.id}.mdx`);
    const r = writeFileWithSidecar(
      p,
      renderProblemMdx(prob, moduleId, idx + 1, prov),
      { source_hash: sourceHash, generated_at: now, model, provenance: prov },
      force,
      dryRun,
    );
    (r === "written" ? written : skipped).push(p);
  });

  return { written, skipped };
}
