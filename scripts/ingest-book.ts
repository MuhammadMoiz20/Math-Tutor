#!/usr/bin/env -S npx tsx
/**
 * scripts/ingest-book.ts
 *
 * Offline ingestion of a textbook PDF into MDX content for a curriculum
 * module. Sends the PDF to Claude with a strict tool-use schema, validates
 * the response, runs SymPy verification for computational problems, and
 * writes idempotent MDX output under `content/<module>/`.
 *
 * Usage:
 *   npx tsx scripts/ingest-book.ts --module linalg-1 \
 *     --book "books/Mathematics_For_Machine_Learning.pdf" --chapters 2,3
 *
 * Flags:
 *   --module <id>      (required)
 *   --book <path>      (optional override)
 *   --chapters <csv>   (optional override, e.g. 2,3)
 *   --model <id>       (optional, default: claude-sonnet-4-5)
 *   --dry-run          plan only; do not call API or write files
 *   --force            overwrite even when source hash matches
 */

import path from "node:path";
import fs from "node:fs";
import {
  loadCurriculum,
  resolveSource,
  parseChapters,
} from "@/lib/ingest/resolver";
import { callAnthropicForModule, type AnthropicLike } from "@/lib/ingest/client";
import { writeModule, hashFile, hashString } from "@/lib/ingest/writer";
import { verifyAll } from "@/lib/ingest/verify";

interface Args {
  module?: string;
  book?: string;
  chapters?: string;
  model: string;
  dryRun: boolean;
  force: boolean;
}

function parseArgs(argv: string[]): Args {
  const out: Args = { model: "claude-sonnet-4-5", dryRun: false, force: false };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    const next = () => argv[++i];
    switch (a) {
      case "--module":
        out.module = next();
        break;
      case "--book":
        out.book = next();
        break;
      case "--chapters":
        out.chapters = next();
        break;
      case "--model":
        out.model = next();
        break;
      case "--dry-run":
        out.dryRun = true;
        break;
      case "--force":
        out.force = true;
        break;
      case "-h":
      case "--help":
        printHelp();
        process.exit(0);
        break;
      default:
        if (a.startsWith("--")) throw new Error(`unknown flag: ${a}`);
    }
  }
  return out;
}

function printHelp(): void {
  process.stdout.write(
    `Usage: npx tsx scripts/ingest-book.ts --module <id> [--book <path>] [--chapters 2,3] [--model <id>] [--dry-run] [--force]\n`,
  );
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  if (!args.module) {
    printHelp();
    throw new Error("--module is required");
  }

  const root = process.cwd();
  const curriculum = loadCurriculum(path.join(root, "curriculum.yaml"));
  const resolved = resolveSource({
    moduleId: args.module,
    bookOverride: args.book,
    chaptersOverride: args.chapters ? parseChapters(args.chapters) : undefined,
    curriculum,
    booksDir: path.join(root, "books"),
  });

  process.stdout.write(
    `[ingest] module=${resolved.module.id} book=${resolved.bookPath} chapters=${resolved.chapters.join(",")}\n`,
  );

  const sourceHash = hashString(
    `${hashFile(resolved.bookPath)}::${resolved.chapters.join(",")}`,
  );
  const contentRoot = path.join(root, "content");

  if (args.dryRun) {
    process.stdout.write(
      `[ingest] --dry-run set; planned outputs under ${path.join(contentRoot, resolved.module.id)}/ (concept.mdx, worked/*.mdx, problems/*.mdx)\n`,
    );
    process.stdout.write(`[ingest] source_hash=${sourceHash}\n`);
    process.stdout.write(`[ingest] model=${args.model}\n`);
    return;
  }

  if (!process.env.ANTHROPIC_API_KEY) {
    throw new Error(
      "ANTHROPIC_API_KEY is not set; either export it or pass --dry-run",
    );
  }

  const Anthropic = (await import("@anthropic-ai/sdk")).default;
  const client = new Anthropic() as unknown as AnthropicLike;

  const { payload } = await callAnthropicForModule(client, {
    bookPath: resolved.bookPath,
    bookTitle: resolved.bookTitle,
    moduleId: resolved.module.id,
    moduleTitle: resolved.module.title,
    chapters: resolved.chapters,
    model: args.model,
  });

  const provMap = verifyAll(payload.problems);
  const result = writeModule({
    moduleId: resolved.module.id,
    contentRoot,
    payload,
    sourceHash,
    model: args.model,
    problemProvenance: provMap,
    force: args.force,
  });

  process.stdout.write(
    `[ingest] wrote ${result.written.length} files, skipped ${result.skipped.length}\n`,
  );
  for (const f of result.written) process.stdout.write(`  + ${path.relative(root, f)}\n`);
  for (const f of result.skipped) process.stdout.write(`  = ${path.relative(root, f)}\n`);

  // simple sanity: verify the written content dir exists
  if (!fs.existsSync(path.join(contentRoot, resolved.module.id))) {
    throw new Error("post-write check failed: module dir not created");
  }
}

main().catch((e) => {
  process.stderr.write(`[ingest] error: ${(e as Error).message}\n`);
  process.exit(1);
});
