## Math-Tutor

A personal AI math tutor for ML/AI mastery, built on the Anthropic Agent SDK with SymPy-checked answers and book-ingested content.

Single-user and local-first. Forks LC-Neet's coach architecture (Agent SDK + MCP tools + SSE streaming + mode-based system prompts) and adds lessons, SymPy answer checking, photo upload, and a Solution mode gated behind an attempt/time threshold.

## Canonical sources

- `CLAUDE.md` — project guide and conventions (read first).
- `docs/plans/2026-05-06-math-tutor-design.md` — authoritative design.
- `docs/plans/2026-05-06-math-tutor-implementation-plan.md` — phased implementation plan.

## Stack

Next.js 16, TypeScript, Tailwind, SQLite, Pyodide, Anthropic Agent SDK, MDX + KaTeX.

## Setup

```bash
npm install
cp .env.local.example .env.local   # AUTH_SECRET, ANTHROPIC_API_KEY
npx tsx scripts/create-user.ts you@example.com yourpassword
npx tsx scripts/ingest-book.ts --module linalg-1
npm run dev
```

Some scripts above are placeholders for future phases; the implementation plan tracks when each lands.

## Status

Under active construction. v1 scope: Linear Algebra I end-to-end. See the implementation plan.
