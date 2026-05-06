# Math-Tutor Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Ship Linear Algebra I end-to-end as a vertical slice of the Math-Tutor app — concept page, problems, all five coach modes, SymPy answer checking, Solution mode, photo upload, spaced review, book ingestion. Then expand module by module.

**Architecture:** Next.js 16 App Router monolith. SQLite (better-sqlite3) single-user store. NextAuth credentials. MDX content authored by an offline ingestion script that consumes user-provided textbook PDFs via the raw Anthropic SDK. Runtime coach via `@anthropic-ai/claude-agent-sdk` with an MCP tool server exposing problem metadata, user history, and a SymPy tool surface. Computational answer checking runs in-browser via Pyodide for instant feedback; that verdict is then piped to Claude so the next response is targeted analysis. Derivation problems use an LLM-judge with a stored rubric.

**Tech Stack:** Next.js 16 (App Router) · TypeScript · Tailwind 4 · NextAuth v5 · better-sqlite3 · Pyodide · `@anthropic-ai/claude-agent-sdk` · `@anthropic-ai/sdk` · MDX (`@next/mdx`, `next-mdx-remote/rsc`) · KaTeX + `remark-math` + `rehype-katex` · CodeMirror 6 · shadcn/ui · Vitest · Playwright.

**Source of truth for design decisions:** `docs/plans/2026-05-06-math-tutor-design.md`.

**Git workflow:** Every phase/sub-phase ends in a PR per `CLAUDE.md` → "Git workflow". Tasks within a phase are commits on a feature branch. Squash-merge to main, delete branch.

---

## Granularity contract for this plan

- **Phases 0–3** are written as bite-sized TDD tasks (2–5 min each). These are foundational; writing them in detail prevents drift.
- **Phases 4–9** are written as **structured task outlines** — each task names its files, its key tests, and its acceptance criterion, but doesn't pre-write all code. The reason: Phases 4+ depend heavily on what we learn from 0–3 (Pyodide quirks, MDX edge cases, NextAuth v5 behavior). Writing them in full now would be premature and partially wrong. **Re-plan each Phase 4+ as a fresh writing-plans pass when its predecessor lands.**
- **TDD discipline:** every task that introduces behavior starts with a failing test. Pure scaffolding (config, deps) is exempt.
- **Commit cadence:** one commit per atomic step (failing test, implementation, refactor). Push and PR at phase boundaries.

---

## Phase map

| Phase | Deliverable | Roughly |
|---|---|---|
| 0 | Next.js scaffold, TS strict, Tailwind, ESLint, Vitest, Playwright, CI | foundation |
| 1 | NextAuth v5 credentials + SQLite + `create-user.ts` | auth |
| 2 | MDX + KaTeX content layer; static concept page route | content |
| 3 | Curriculum schema + module index page | navigation |
| 4 | Problem page shell + CodeMirror scratchpad + KaTeX preview | workspace |
| 5 | Pyodide + SymPy fast-path answer checking (computational) | checking |
| 6 | Anthropic Agent SDK coach: MCP tools, prompts, SSE stream, chat UI, four "no-solution" modes | coach |
| 7 | Solution mode + unlock gate + LLM-judge for derivations | solution |
| 8 | Photo upload (multimodal turn) | multimodal |
| 9 | Spaced review queue | retention |
| 10 | `scripts/ingest-book.ts` and ingest LA I from MML | content pipeline |

v1 is "Phases 0–10 working for Linear Algebra I." Phases 11+ (other modules) are pure ingestion repeats.

---

## Phase 0 — Project scaffold

**Branch:** `chore/scaffold`
**PR title:** `chore: scaffold Next.js 16 app with TS, Tailwind, testing`

### Task 0.1 — Initialize Next.js app in place

**Files:**
- Create: `package.json`, `tsconfig.json`, `next.config.ts`, `next-env.d.ts`, `app/layout.tsx`, `app/page.tsx`, `app/globals.css`, `postcss.config.mjs`, `eslint.config.mjs`

**Step 1:** Branch off main.

```bash
git checkout main && git pull
git checkout -b chore/scaffold
```

**Step 2:** Create the Next.js 16 app non-interactively. Because we're scaffolding into an existing dir with `CLAUDE.md` and `docs/`, run `create-next-app` with `--use-npm --ts --tailwind --app --eslint --src-dir=false --import-alias=@/*` into a temp dir, then move generated files in (skipping conflicts).

```bash
npx create-next-app@latest /tmp/math-tutor-scaffold --ts --tailwind --app --eslint --no-src-dir --import-alias="@/*" --use-npm --yes
rsync -a --ignore-existing /tmp/math-tutor-scaffold/ ./
rm -rf /tmp/math-tutor-scaffold
```

**Step 3:** Verify Next.js version is 16.x and TS is strict.

```bash
npx next --version          # expect 16.x
grep '"strict": true' tsconfig.json   # must be present
```

**Step 4:** Read `node_modules/next/dist/docs/` for any breaking changes since the last training cutoff (per the AGENTS-style header in `CLAUDE.md`). Note anything relevant in commit body.

**Step 5:** First sanity build.

Run: `npm run build`
Expected: clean build, no errors.

**Step 6:** Commit.

```bash
git add -A
git commit -m "chore: scaffold next.js 16 app router with ts and tailwind"
```

### Task 0.2 — Add Vitest

**Files:**
- Create: `vitest.config.ts`, `tests/smoke.test.ts`
- Modify: `package.json` (add `test` script, dev deps)

**Step 1:** Install Vitest.

```bash
npm install -D vitest @vitest/ui jsdom @testing-library/react @testing-library/jest-dom
```

**Step 2:** Write `vitest.config.ts`:

```ts
import { defineConfig } from "vitest/config";
import path from "node:path";

export default defineConfig({
  test: {
    environment: "node",
    include: ["tests/**/*.test.ts", "lib/**/*.test.ts"],
    setupFiles: [],
  },
  resolve: { alias: { "@": path.resolve(__dirname) } },
});
```

**Step 3:** Failing test: `tests/smoke.test.ts`

```ts
import { describe, it, expect } from "vitest";

describe("smoke", () => {
  it("vitest is wired up", () => {
    expect(1 + 1).toBe(2);
  });
});
```

**Step 4:** Add npm script in `package.json`:

```json
"test": "vitest run",
"test:watch": "vitest"
```

**Step 5:** Run tests.

Run: `npm test`
Expected: 1 passed.

**Step 6:** Commit.

```bash
git add -A && git commit -m "chore: add vitest with a smoke test"
```

### Task 0.3 — Add Playwright

**Files:**
- Create: `playwright.config.ts`, `tests/e2e/smoke.spec.ts`
- Modify: `package.json` (add `e2e` script)
- Modify: `.gitignore` (add `playwright-report/`, `test-results/` — already present)

**Step 1:** Install Playwright.

```bash
npm install -D @playwright/test
npx playwright install --with-deps chromium
```

**Step 2:** `playwright.config.ts`:

```ts
import { defineConfig } from "@playwright/test";
export default defineConfig({
  testDir: "tests/e2e",
  use: { baseURL: "http://localhost:3000" },
  webServer: {
    command: "npm run dev",
    url: "http://localhost:3000",
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
});
```

**Step 3:** `tests/e2e/smoke.spec.ts`:

```ts
import { test, expect } from "@playwright/test";

test("home page renders", async ({ page }) => {
  await page.goto("/");
  await expect(page).toHaveTitle(/Math/i);
});
```

(Make sure `app/layout.tsx`'s metadata title contains "Math".)

**Step 4:** `package.json` script: `"e2e": "playwright test"`

**Step 5:** Run.

Run: `npm run e2e`
Expected: 1 passed.

**Step 6:** Commit.

```bash
git add -A && git commit -m "chore: add playwright with a smoke spec"
```

### Task 0.4 — Push, open PR, merge

```bash
git push -u origin chore/scaffold
gh pr create --title "chore: scaffold next.js 16 app with ts, tailwind, testing" --body "$(cat <<EOF
## Summary
- Next.js 16 App Router + TS strict + Tailwind 4
- Vitest for unit, Playwright for E2E
- Smoke tests for both

## Verification
- [x] \`npm run build\` clean
- [x] \`npm test\` 1 passed
- [x] \`npm run e2e\` 1 passed

## Design doc reference
\`docs/plans/2026-05-06-math-tutor-design.md\` → Stack.
EOF
)"
gh pr merge --squash --delete-branch
git checkout main && git pull
```

---

## Phase 1 — Auth + SQLite

**Branch:** `feat/auth-and-db`
**PR title:** `feat: nextauth credentials + sqlite + create-user script`

### Task 1.1 — Install deps and DB layer

**Files:**
- Create: `lib/db.ts`, `lib/db.test.ts`, `db/migrations/001_init.sql`

**Step 1:** Install.

```bash
npm install better-sqlite3
npm install -D @types/better-sqlite3 tsx
```

**Step 2:** `db/migrations/001_init.sql`:

```sql
CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  email TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  created_at INTEGER NOT NULL DEFAULT (unixepoch())
);
```

**Step 3:** Write failing test `lib/db.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { openDb } from "./db";

describe("openDb", () => {
  it("creates users table on first open", () => {
    const db = openDb(":memory:");
    const row = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='users'").get();
    expect(row).toBeTruthy();
  });
});
```

Run: `npm test` → FAIL (`openDb` not exported).

**Step 4:** Implement `lib/db.ts`:

```ts
import Database from "better-sqlite3";
import fs from "node:fs";
import path from "node:path";

let _db: Database.Database | null = null;

export function openDb(file: string = process.env.DB_PATH ?? "math-tutor.db"): Database.Database {
  const db = new Database(file);
  db.pragma("journal_mode = WAL");
  db.pragma("foreign_keys = ON");
  const migrationsDir = path.join(process.cwd(), "db/migrations");
  for (const f of fs.readdirSync(migrationsDir).sort()) {
    db.exec(fs.readFileSync(path.join(migrationsDir, f), "utf8"));
  }
  return db;
}

export function getDb(): Database.Database {
  if (!_db) _db = openDb();
  return _db;
}
```

Run: `npm test` → PASS.

**Step 5:** Commit.

```bash
git add -A && git commit -m "feat(db): sqlite open + migration runner"
```

### Task 1.2 — User repo + password hashing

**Files:**
- Create: `lib/users/repo.ts`, `lib/users/repo.test.ts`

**Step 1:** Install.

```bash
npm install bcryptjs
npm install -D @types/bcryptjs
```

**Step 2:** Failing test:

```ts
import { describe, it, expect } from "vitest";
import { openDb } from "../db";
import { createUser, verifyUser } from "./repo";

describe("user repo", () => {
  it("creates and verifies a user", async () => {
    const db = openDb(":memory:");
    const id = await createUser(db, "a@b.com", "pw12345678");
    expect(id).toBeGreaterThan(0);
    const verified = await verifyUser(db, "a@b.com", "pw12345678");
    expect(verified?.id).toBe(id);
    expect(await verifyUser(db, "a@b.com", "wrong")).toBeNull();
  });
});
```

Run → FAIL.

**Step 3:** Implement `lib/users/repo.ts`:

```ts
import type Database from "better-sqlite3";
import bcrypt from "bcryptjs";

export async function createUser(db: Database.Database, email: string, password: string): Promise<number> {
  const hash = await bcrypt.hash(password, 10);
  const info = db.prepare("INSERT INTO users (email, password_hash) VALUES (?, ?)").run(email, hash);
  return info.lastInsertRowid as number;
}

export async function verifyUser(db: Database.Database, email: string, password: string): Promise<{ id: number; email: string } | null> {
  const row = db.prepare("SELECT id, email, password_hash FROM users WHERE email = ?").get(email) as
    | { id: number; email: string; password_hash: string }
    | undefined;
  if (!row) return null;
  const ok = await bcrypt.compare(password, row.password_hash);
  return ok ? { id: row.id, email: row.email } : null;
}
```

Run → PASS.

**Step 4:** Commit. `feat(users): create + verify with bcrypt`

### Task 1.3 — `scripts/create-user.ts`

**Files:** Create `scripts/create-user.ts`

```ts
import { openDb } from "../lib/db";
import { createUser } from "../lib/users/repo";

const [, , email, password] = process.argv;
if (!email || !password) {
  console.error("Usage: npx tsx scripts/create-user.ts <email> <password>");
  process.exit(1);
}
const db = openDb();
createUser(db, email, password).then((id) => {
  console.log(`Created user ${id} (${email})`);
  process.exit(0);
});
```

Manual verification:

```bash
DB_PATH=/tmp/test.db npx tsx scripts/create-user.ts test@example.com pw12345678
# expect: Created user 1 (test@example.com)
rm /tmp/test.db
```

Commit. `chore: add create-user script`

### Task 1.4 — NextAuth v5 credentials

**Files:**
- Create: `auth.ts`, `auth.config.ts`, `middleware.ts`, `app/api/auth/[...nextauth]/route.ts`, `app/(auth)/signin/page.tsx`, `lib/auth/current-user.ts`, `lib/auth/current-user.test.ts`
- Modify: `.env.local.example` (already has AUTH_SECRET)

**Important:** NextAuth v5 differs significantly from v4. Read `node_modules/next-auth/README.md` and `node_modules/@auth/core/` exports before writing the config. Common gotcha: `NextAuth()` returns `{ handlers, auth, signIn, signOut }`; use `handlers.GET/POST` from the route file.

**Step 1:** Install.

```bash
npm install next-auth@beta
```

**Step 2:** Write `auth.config.ts`, `auth.ts`, route, signin page (see NextAuth v5 docs). Credentials provider calls `verifyUser` from Task 1.2.

**Step 3:** Failing test for `requireUserId`:

```ts
import { describe, it, expect, vi } from "vitest";
import { requireUserId } from "./current-user";

vi.mock("../../auth", () => ({ auth: vi.fn() }));

describe("requireUserId", () => {
  it("throws when no session", async () => {
    const { auth } = await import("../../auth");
    (auth as any).mockResolvedValue(null);
    await expect(requireUserId()).rejects.toThrow();
  });
  it("returns id when session exists", async () => {
    const { auth } = await import("../../auth");
    (auth as any).mockResolvedValue({ user: { id: "42" } });
    expect(await requireUserId()).toBe(42);
  });
});
```

**Step 4:** Implement `lib/auth/current-user.ts` to satisfy.

**Step 5:** E2E spec `tests/e2e/signin.spec.ts`: create user via script, visit `/signin`, sign in, redirect to `/`. Run, expect PASS.

**Step 6:** Commit. `feat(auth): nextauth v5 credentials with bcrypt verify`

### Task 1.5 — PR

```bash
git push -u origin feat/auth-and-db
gh pr create --title "feat: nextauth credentials + sqlite + create-user" --body "..."
gh pr merge --squash --delete-branch
```

---

## Phase 2 — MDX + KaTeX content layer

**Branch:** `feat/mdx-content`
**PR title:** `feat: mdx + katex pipeline and concept page route`

### Task 2.1 — Install MDX + math plugins

```bash
npm install @next/mdx @mdx-js/loader @mdx-js/react remark-math rehype-katex katex
npm install -D @types/mdx
```

### Task 2.2 — Configure `next.config.ts` for MDX with `remark-math` and `rehype-katex`

Code (full):

```ts
import type { NextConfig } from "next";
import createMDX from "@next/mdx";
import remarkMath from "remark-math";
import rehypeKatex from "rehype-katex";

const withMDX = createMDX({
  options: {
    remarkPlugins: [remarkMath],
    rehypePlugins: [[rehypeKatex, { strict: false }]],
  },
});

const nextConfig: NextConfig = {
  pageExtensions: ["ts", "tsx", "md", "mdx"],
};

export default withMDX(nextConfig);
```

Add KaTeX CSS import to `app/layout.tsx`:
`import "katex/dist/katex.min.css";`

Commit. `chore(mdx): wire remark-math + rehype-katex`

### Task 2.3 — Content loader

**Files:** `lib/content/loader.ts`, `lib/content/loader.test.ts`, `content/_fixtures/sample.mdx`

**Test (failing first):** Reads a fixture MDX file with frontmatter, returns `{ frontmatter, source }`. Use `gray-matter` or hand-rolled.

```bash
npm install gray-matter
```

Write the test, watch it fail, implement loader using `gray-matter` + `fs.readFileSync`, watch it pass.

Commit. `feat(content): mdx loader with frontmatter`

### Task 2.4 — `app/modules/[id]/page.tsx` renders concept MDX

**Files:** `app/modules/[id]/page.tsx`, `content/linalg-1/concept.mdx` (placeholder), E2E test.

E2E: visit `/modules/linalg-1`, expect a heading and rendered KaTeX (`<span class="katex">`).

Commit. `feat(content): render concept page with mdx + katex`

### Task 2.5 — PR

---

## Phase 3 — Curriculum schema + module index

**Branch:** `feat/curriculum-index`
**PR title:** `feat: curriculum.yaml schema and home/module index`

### Task 3.1 — `curriculum.yaml` + Zod schema

**Files:** `curriculum.yaml`, `lib/curriculum/schema.ts`, `lib/curriculum/schema.test.ts`

```bash
npm install yaml zod
```

Schema validates the YAML shape from the design doc:

```ts
const ModuleSource = z.object({
  book: z.string(),
  chapters: z.array(z.number().int()),
  primary: z.boolean().optional(),
  role: z.string().optional(),
});
const Module = z.object({
  id: z.string(),
  title: z.string(),
  ord: z.number().int(),
  sources: z.array(ModuleSource).default([]),
});
export const Curriculum = z.object({ modules: z.array(Module) });
```

TDD: write failing test that loads a sample YAML, parses it, asserts module ids.

### Task 3.2 — DB migration: `modules` table

`db/migrations/002_modules.sql` per design doc schema. Failing test in `lib/curriculum/repo.test.ts` for `seedModules(db, curriculum)`.

### Task 3.3 — `scripts/seed-curriculum.ts`

Reads `curriculum.yaml`, validates, upserts into `modules` table.

### Task 3.4 — `app/page.tsx` lists modules; `app/modules/[id]/page.tsx` shows title + concept page

E2E: visit `/`, see module list, click LA I, land on concept page.

### Task 3.5 — PR

---

## Phase 4 — Workspace (problem page + scratchpad)

**Branch:** `feat/workspace`
**PR title:** `feat: problem page with codemirror scratchpad and katex preview`

**Tasks:**

1. **DB migration `003_problems.sql`** per design doc — `problems` table.
2. **Problem repo** — `lib/problems/repo.ts` with `getProblem(id)`, `listProblemsByModule(moduleId)`. TDD.
3. **MDX problem loader** — extends content loader; parses frontmatter into the `Problem` shape; one MDX file per problem under `content/<module>/problems/`.
4. **One handwritten LA I problem** — `content/linalg-1/problems/linalg-1-eigen-1.mdx` with `type: computational`, an `expected_answer` SymPy string, no rubric. Just enough to drive the UI.
5. **Module page lists problems** — `app/modules/[id]/page.tsx` adds a problem index below the concept content.
6. **Problem page route** — `app/problems/[id]/page.tsx`. Renders the problem statement (MDX), a `<Workspace>` client component (CodeMirror + preview pane), and a placeholder for chat.
7. **CodeMirror scratchpad** — `components/workspace/Scratchpad.tsx`. Markdown mode. Live KaTeX preview pane via `react-katex` or direct KaTeX render of `$...$` blocks. Install: `@uiw/react-codemirror @codemirror/lang-markdown`.
8. **Persist scratchpad locally** — `localStorage` keyed by problem id. Restore on mount.
9. **E2E test** — open problem page, type into scratchpad, see preview update.
10. **PR.**

**Acceptance:** can open `/problems/linalg-1-eigen-1`, see statement, type `$x^2$`, see rendered math in preview.

---

## Phase 5 — Pyodide + SymPy fast-path checking

**Branch:** `feat/sympy-checking`
**PR title:** `feat: pyodide-based sympy answer checking with verdict surfacing`

**Tasks:**

1. **Bundle Pyodide** — pin a version; load lazily (only when user clicks Submit). Worker-based to keep main thread free.
2. **`lib/sympy/client.ts`** — wraps the worker. Methods: `loadSympy()`, `checkEquivalent(userExpr, expected)`. Returns `{equivalent: boolean, simplified_diff?: string, error?: string}`. TDD via worker mock.
3. **Submit button on problem page** — sends the user's "final answer" cell value to the SymPy client, displays verdict inline.
4. **DB migration `004_attempts.sql`** — `attempts` table.
5. **`/api/check` route** — POST `{problemId, userAnswer, userWork, sympyVerdict}` → persists an `attempt` row. Server trusts the client SymPy verdict for this fast path; the agent will re-verify with its own SymPy tool when reasoning.
6. **Verdict UI** — green/red banner with the simplified diff if wrong.
7. **E2E** — submit a wrong answer for the LA I problem, see red verdict; submit correct, see green.
8. **PR.**

**Acceptance:** fast pass/fail feedback on the LA I problem with simplified diff for wrong answers.

---

## Phase 6 — Coach (four no-solution modes)

**Branch:** `feat/coach-modes`
**PR title:** `feat: anthropic agent coach with socratic, hints, rigor, exam`

This phase mirrors LC-Neet's `lib/agent/*` and `app/api/coach/route.ts` very closely. Read `/Users/moiz/Desktop/Projects/Personal/LC-Neet/lib/agent/` and the route file before starting; copy patterns where they apply, adapt where they don't.

**Tasks:**

1. **Install** `@anthropic-ai/claude-agent-sdk zod`.
2. **Schema migration `005_chat.sql`** — `chat_messages` table; `mode` column; `problem_id TEXT`.
3. **`lib/chat/repo.ts`** — `saveMessage`, `listMessages`, types. TDD against `:memory:` DB.
4. **`lib/agent/prompts.ts`** — `SOCRATIC`, `HINTS`, `RIGOR`, `EXAM` strings + `NO_SOLUTION_RULE` constant. Snapshot tests in `prompts.test.ts` to guard accidental drift.
5. **`lib/agent/tools.ts`** — `getProblemMeta(db, id)`, `getUserHistory(db, userId, topic, limit)`. TDD.
6. **`lib/agent/filter.ts`** — `looksLikeFullSolution(text)` heuristic adapted from LC-Neet but tuned for math (long contiguous LaTeX block + final-answer phrase). Snapshot/golden tests.
7. **`lib/agent/stream.ts`** — `streamCoach(input)` async generator. Sets up MCP server with `get_problem_meta`, `get_user_history`. Emits `delta | blocked | done`. Mirrors LC-Neet structure.
8. **`app/api/coach/route.ts`** — SSE POST handler. Mirrors LC-Neet exactly (validation, save user msg, stream, save assistant buffer on close).
9. **`components/chat/Chat.tsx`** — mode tabs (Socratic, Hints, Rigor, Exam), message list with KaTeX rendering, input box. Streams via `EventSource`-like `fetch` + reader.
10. **Wire chat into problem page** — replace placeholder.
11. **E2E** — open problem, switch to Hints, send "I'm stuck", see streamed reply.
12. **PR.**

**Acceptance:** all four modes work, streaming end-to-end, chat persists per `(user, problem, mode)`.

---

## Phase 7 — Solution mode + LLM-judge

**Branch:** `feat/solution-mode-and-judge`
**PR title:** `feat: solution mode with unlock gate and llm-judge for derivations`

**Tasks:**

1. **DB migration `006_problem_timers.sql`** — `problem_timers(user_id, problem_id, opened_at)`.
2. **`lib/progress/unlock.ts`** — pure function `canUnlockSolution({attempts, openedAt, now, minMinutes = 15})`. TDD heavily (boundary cases: 0 attempts + 14:59 min, 0 attempts + 15:00 min, 1 attempt + 0 min, etc.).
3. **`/api/problem-open` route** — upserts `problem_timers` on problem page mount.
4. **Solution-mode prompt** — add `SOLUTION` to `prompts.ts` with `STAY_GROUNDED_RULE` (every computational claim verified via SymPy tool before assertion).
5. **SymPy tool surface in MCP server** — extend `lib/agent/tools.ts` and the MCP server in `stream.ts` with `check_equivalent`, `simplify`, `diff`, `integrate`, `solve`, `evaluate_at`. These execute via a server-side Python subprocess (`lib/sympy/server.ts`) — see Task 7.6.
6. **`lib/sympy/server.ts`** — Python subprocess wrapper using `python3 -c` or a long-lived Python child process. Returns JSON. Timeout per call. TDD with mocked child_process.
7. **Disable `looksLikeFullSolution` filter when `mode === "solution"`** — single conditional in `stream.ts`.
8. **Solution-mode tab in `Chat.tsx`** — disabled until unlock condition met. Polls / re-checks on attempt submit and at the 15-min mark.
9. **LLM-judge** — `lib/agent/judge.ts`. For derivation-type problems on submit: separate one-shot Claude call with `{problem, rubric, user_work, canonical_solution}` → returns `{verdict, missing_claims[], errors[], comments}`. Persist to `attempts.judge_json`. TDD with a mocked Anthropic client.
10. **One handwritten derivation problem** — e.g., `content/linalg-1/problems/linalg-1-proof-1.mdx` with `type: derivation`, a `rubric`, and a canonical solution body.
11. **E2E** — submit wrong answer → wait simulated time / submit second attempt → Solution tab unlocks → click → see canonical solution → ask follow-up question, see SymPy tool used in trace.
12. **PR.**

**Acceptance:** Solution mode unlock works both ways (attempts and timer); LLM-judge returns structured verdict for the derivation problem; SymPy tools demonstrably called by Claude in Solution mode.

---

## Phase 8 — Photo upload (multimodal turn)

**Branch:** `feat/photo-upload`
**PR title:** `feat: opt-in photo upload per coach turn`

**Tasks:**

1. **Client-side resize** — install `browser-image-compression`. Compress to max 1600px / 80% quality before upload.
2. **Upload UI** — paperclip button next to chat input; preview thumbnail; remove button.
3. **POST `/api/coach` accepts `photoBase64?: string`** — validate size cap (5 MB after b64).
4. **Pass image to Claude** — extend the agent SDK call to include an `image` content block when provided. Verify the agent SDK supports passing additional content blocks; if not, drop down to raw `@anthropic-ai/sdk` for that single turn (acceptable; document in code comment why).
5. **Persist image reference in `chat_messages`** — store as a separate `attachments` table or `chat_messages.attachments_json` column. Migration `007_attachments.sql`.
6. **E2E** — upload a small image of a solved equation, ask "did I get this right?", see assistant reference the image.
7. **PR.**

**Acceptance:** can submit a photo with a coach turn; Claude responds referencing the image content.

---

## Phase 9 — Spaced review queue

**Branch:** `feat/spaced-review`
**PR title:** `feat: spaced review queue with sm-2 lite scheduling`

**Tasks:**

1. **Migration `008_review_queue.sql`** — `review_queue(user_id, problem_id, due_at, ease, interval_days, last_reviewed_at)`.
2. **`lib/progress/sm2.ts`** — minimal SM-2-style scheduler. Inputs: previous state + grade (0–5 derived from verdict + judge). Output: next `due_at`, `ease`, `interval_days`. Heavy TDD on the math.
3. **Hook into attempt submission** — after every `attempts` insert, upsert the corresponding `review_queue` row.
4. **`/review` page** — lists due problems, click-through to problem page, "review" mode adds a banner so the user knows it's a review.
5. **E2E** — submit correct, advance time (mock `Date.now`), confirm next due date increases; submit wrong, confirm next due date is today.
6. **PR.**

**Acceptance:** correct answers space out review intervals; wrong answers schedule reviews same-day.

---

## Phase 10 — Book ingestion script

**Branch:** `feat/ingest-book`
**PR title:** `feat: ingest-book script with sympy-verified solutions`

**Tasks:**

1. **Install** `@anthropic-ai/sdk` (raw, alongside the agent SDK).
2. **`scripts/ingest-book.ts` skeleton** — CLI: `--module <id>`, `--book <path>`, `--chapters 2,3`. Reads `curriculum.yaml`, finds the module's source mapping, reads PDF, sends to Claude with a structured prompt requesting `{concept_mdx, worked_examples[], problems[]}` JSON.
3. **PDF input** — Use the Files API or inline base64 per Anthropic SDK PDF docs. Read those docs first; this is the part most likely to drift from training-data assumptions.
4. **Output writer** — writes MDX files under `content/<module>/` with the structure from the design doc. Idempotent: hash-based skip if file exists and source page hasn't changed.
5. **Solution verification step** — for each generated solution where the book has no canonical answer: re-prompt Claude with the SymPy tool surface, ask it to verify or correct; mark `provenance: book+verified` or `generated`.
6. **Run for LA I** — `npx tsx scripts/ingest-book.ts --module linalg-1 --book books/mml.pdf --chapters 2,3`. Manually review a sample of generated MDX. Iterate prompt until quality is acceptable.
7. **Wire ingested content into the app** — verify problems show up on the LA I module page; verify a sample problem renders correctly; verify the Solution mode discussion makes sense.
8. **PR.**

**Acceptance:** running the script produces committable MDX content for LA I; the existing UI works against it without further changes.

---

## After Phase 10

Phases 11+ are pure ingestion repeats: drop the next book, update `curriculum.yaml`, run the script, review.

When v1 (LA I end-to-end) ships, run a retrospective and re-plan any module-specific gaps before tackling Multivariable Calculus.

## Cross-cutting reminders

- **Read NextAuth v5, Next.js 16, and Anthropic SDK docs in `node_modules/` before writing code in their domains.** Training data may be out of date.
- **System prompts are load-bearing.** Snapshot tests guard them. Do not edit casually.
- **Solution mode skips the no-solution filter.** Hard rule.
- **The fast-path SymPy verdict (Pyodide) and the agent's SymPy tool calls (server subprocess) are two different surfaces.** Don't conflate them.
- **Commits are cheap. PRs are cheap. Use them.**
