import { describe, it, expect } from "vitest";
import { execSync } from "node:child_process";
import path from "node:path";

const ROOT = path.resolve(__dirname, "..");

function run(args: string): { code: number; out: string; err: string } {
  try {
    const out = execSync(`npx tsx scripts/ingest-book.ts ${args}`, {
      cwd: ROOT,
      env: { ...process.env, ANTHROPIC_API_KEY: "" },
      stdio: ["ignore", "pipe", "pipe"],
    }).toString();
    return { code: 0, out, err: "" };
  } catch (e) {
    const err = e as { status?: number; stdout?: Buffer; stderr?: Buffer };
    return {
      code: err.status ?? 1,
      out: err.stdout?.toString() ?? "",
      err: err.stderr?.toString() ?? "",
    };
  }
}

describe("ingest-book script (dry-run smoke)", () => {
  it("prints a plan when --dry-run is set", { timeout: 60_000 }, () => {
    const r = run("--module linalg-1 --dry-run");
    expect(r.code).toBe(0);
    expect(r.out).toContain("module=linalg-1");
    expect(r.out).toContain("--dry-run set");
    expect(r.out).toContain("source_hash=");
  });

  it("errors without --module", { timeout: 60_000 }, () => {
    const r = run("--dry-run");
    expect(r.code).not.toBe(0);
    expect(r.err).toContain("--module is required");
  });

  it("errors on unknown module", { timeout: 60_000 }, () => {
    const r = run("--module no-such-module --dry-run");
    expect(r.code).not.toBe(0);
    expect(r.err).toContain("module not found");
  });
});
