rep# Math-Tutor

Personal, single-user web app that teaches the math underlying ML/AI from A-level prerequisites up through what's needed to read modern ML papers. Forks LC-Neet's coach architecture (Anthropic Agent SDK + MCP tools + SSE streaming + mode-based system prompts) and adds: lessons, SymPy-based answer checking, multimodal photo upload, and a new **Solution mode** that reveals the worked solution and then chats about it.

Authoritative design: `docs/plans/2026-05-06-math-tutor-design.md`. Read it before changing structural behavior.

<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

## Stack

- Next.js 16 (App Router) + TypeScript + Tailwind 4
- NextAuth v5 (credentials)
- SQLite via better-sqlite3
- Pyodide (in-browser SymPy for instant answer checking)
- `@anthropic-ai/claude-agent-sdk` — runtime coach
- `@anthropic-ai/sdk` — offline book-ingestion script (raw SDK, supports PDF input)
- MDX (`@next/mdx`, `next-mdx-remote/rsc`) for concept pages with embedded interactive widgets
- KaTeX + `remark-math` + `rehype-katex`
- CodeMirror 6 — markdown + KaTeX scratchpad (the "code editor" analog)
- shadcn/ui
- Vitest + Playwright

Skipped intentionally: vector DB, job queue, deployment infra. Single-user, local-first.

## Coach modes

System-prompted personas keyed to `(user_id, problem_id, mode)`. Each chat thread is per-mode.

- **Socratic** — questions only, one per turn.
- **Hints** — laddered: name technique → state invariant → 2–3 line sketch. Refuses further escalation.
- **Rigor** — critiques mathematical writing (quantifiers, unjustified equalities, notation). Replaces LC-Neet's "Style" mode.
- **Exam** — time-pressure mode. No hints, no solutions. Renames LC-Neet's "Interview".
- **Solution** — reveals canonical solution, then chats about it. Locked behind an unlock gate (≥1 attempt OR ≥N min on the problem).

Socratic / Hints / Rigor / Exam carry a `NO_SOLUTION_RULE`. Solution mode replaces it with a `STAY_GROUNDED_RULE`: every computational claim must be verified through the SymPy tool surface before being asserted.

System prompts live in `lib/agent/prompts.ts`. Treat them as load-bearing config — changes affect tutor behavior at scale. Snapshot tests guard against drift.

## Answer checking

Two paths picked per problem `type`:

- **Computational** → SymPy via Pyodide checks `user_expr ≡ expected_expr`. Verdict ships back instantly and is then piped to the next coach turn so the response is targeted ("right answer, but step 3 has a sign error that canceled with step 5").
- **Derivation/proof** → LLM-judge with a stored rubric (`rubric: string[]` per problem). Returns `{verdict, missing_claims, errors, comments}`.

The agent also has SymPy as a **tool surface** (not just a checker), so it uses SymPy mid-conversation rather than bluffing arithmetic — particularly important in Solution mode when the user proposes alternative approaches.

Tool surface (extends LC-Neet's `get_problem_meta` / `get_user_history`):
`check_equivalent`, `simplify`, `diff`, `integrate`, `solve`, `evaluate_at`.

## Workspace

CodeMirror 6 scratchpad with markdown + inline KaTeX, live preview pane. Photo upload (`<input type="file">`) is opt-in per problem turn — used when the user worked on paper. The coach sees scratchpad text *and* any uploaded images for the current turn.

## Content pipeline

Curriculum spine is human-authored (`curriculum.yaml`); content is ingested from real textbooks the user provides in `books/`. Single-user, copyright is not a concern.

`scripts/ingest-book.ts` reads PDFs, sends pages directly to the Anthropic API (PDFs are first-class input), and emits:

- `content/<module>/concept.mdx` — concept page (KaTeX preserved, project house style, "Where this shows up in ML" sidebar).
- `content/<module>/worked/<n>.mdx` — worked examples.
- `content/<module>/problems/<id>.mdx` — problems with frontmatter (`type`, `expected_answer`, `rubric`, `source`, `provenance`) and a canonical solution body.

Solutions come from the book's appendix when present, otherwise generated and **verified via SymPy tool-use before saving**. Provenance is flagged either way.

The script is offline and idempotent. Output is committed to git. Nothing about it touches the runtime app.

Recommended sources: *Mathematics for Machine Learning* (Deisenroth et al.) as primary, then Axler, Boyd & Vandenberghe, Wasserman, Bishop, Goodfellow.

## Directory layout

```
app/
  modules/[id]/         # concept page + worked examples + problem index
  problems/[id]/        # workspace + chat
  api/coach/route.ts    # SSE coach stream (mirrors LC-Neet)
  api/sympy/route.ts    # server-side SymPy tool execution
  api/check/route.ts    # answer checking
components/
  workspace/  chat/  widgets/
content/<module>/       # ingested MDX
books/                  # source PDFs (gitignored or LFS)
curriculum.yaml
lib/
  agent/    # prompts, stream, tools, filter, judge
  chat/     # per-(user, problem, mode) message repo
  content/  # MDX loader + frontmatter parser
  progress/ # attempts, mastery, due_for_review
  sympy/    # subprocess wrapper
  db.ts
scripts/
  ingest-book.ts  create-user.ts  seed-curriculum.ts
docs/plans/
```

## Database schema (extends LC-Neet)

`modules`, `problems`, `attempts` (with `user_work`, `verdict`, `sympy_diff`, `judge_json`), `mastery`, `chat_messages` (with `problem_id TEXT`, per LC-Neet pattern), `problem_timers` (drives Solution unlock gate), `review_queue`.

## Conventions

- **Mirror LC-Neet patterns** unless there's a math-specific reason not to. Coach streaming, the MCP tool server, mode prompts, the chat repo, and the SSE event format (`{type: "delta" | "blocked" | "done"}`) all follow LC-Neet exactly.
- **System prompts are load-bearing.** Don't edit `lib/agent/prompts.ts` casually. Snapshot tests guard them.
- **The `looksLikeFullSolution` filter** runs in Socratic / Hints / Rigor / Exam — but **NOT** in Solution mode (the whole point of Solution mode is to give the solution).
- **Solution unlock gate logic** lives in `lib/progress/` and is exercised in E2E tests. Don't loosen it without thinking about why it exists (it prevents using Solution as a crutch).
- **Content is ingested, not written by hand.** If you find yourself writing concept pages or problems manually, stop and ask whether the ingest pipeline should handle it.
- **SymPy verdicts feed the next coach turn.** When wiring answer checking, the verdict object must be passed through to the agent context so its analysis is targeted, not generic.

## Scope

Curriculum spans the full ML-prereq stack (12 modules in `curriculum.yaml`, MML as the spine, Axler / Boyd / Wasserman / Bishop / Goodfellow as depth). Ingestion is a batch operation — all books are ingested up front and committed under `content/`. Runtime feature work (modes, SymPy checking, Solution unlock, photo upload, spaced review) still proceeds module-by-module; "done" is measured per module against the design doc.

## Git workflow

Repo: `MuhammadMoiz20/Math-Tutor` (GitHub, public). Even though this is a single-contributor project, treat git history as a first-class artifact — it's the audit trail for a months-long learning system.

**Rules:**

- `main` is the only long-lived branch. Never commit to `main` directly (except the initial bootstrap commit). Pushes to `main` happen exclusively via merged PRs.
- Every change ships through a **feature branch + PR**, even one-line edits. Reviewing your own diff before it lands catches more than you'd expect.
- **Branch naming:** `<type>/<short-slug>` — e.g. `feat/coach-streaming`, `fix/solution-unlock-timer`, `chore/update-deps`, `docs/curriculum-yaml`, `content/linalg-1-ingest`.
- **Commit messages:** Conventional Commits style — `feat:`, `fix:`, `chore:`, `docs:`, `content:`, `refactor:`, `test:`. Subject ≤ 72 chars, imperative mood. Body explains *why* when the *what* isn't obvious from the diff.
- **One logical change per PR.** If you find yourself writing "and also" in the description, split it.
- **PR description** must include: what changed, why, and a checklist of how it was verified (tests, manual flow). Link the design doc section it implements.
- **Squash-merge** PRs into `main`. Keeps history linear and readable; the per-commit detail lives on the PR.
- **Delete the branch** after merge.
- `books/` (source PDFs) and the SQLite DB file are **gitignored**. The ingestion script's *output* (`content/`) is committed.
- Never `--force` push to `main`. Force-push to a feature branch only if it's exclusively yours and you understand what you're rewriting.
- Never `--no-verify` to skip hooks. Fix the underlying issue.

**Standard loop:**

```bash
git checkout main && git pull
git checkout -b feat/<slug>
# ... work, commit in small logical units ...
git push -u origin feat/<slug>
gh pr create --fill   # or with a written description
# self-review the diff in the PR UI
gh pr merge --squash --delete-branch
git checkout main && git pull
```

## Setup

```bash
npm install
python3 -m pip install sympy        # required for Solution-mode SymPy tools
cp .env.local.example .env.local    # AUTH_SECRET (32-byte hex), ANTHROPIC_API_KEY
npx tsx scripts/create-user.ts you@example.com yourpassword
npx tsx scripts/ingest-book.ts --module linalg-1 \
  --book "books/Mathematics_For_Machine_Learning.pdf" --chapters 2,3
npm run dev
```

`python3` with `sympy` installed is required at runtime: the agent's
server-side SymPy tool surface (`lib/sympy/server.ts`) shells out to it.
Override the binary via `MATH_TUTOR_PYTHON=/path/to/python3` if needed.

## Scripts

- `npm run dev` — start app
- `npm run build` — production build
- `npm test` — Vitest unit tests
- `npm run e2e` — Playwright tests
- `npx tsx scripts/ingest-book.ts --module <id> [--book <path>] [--chapters 2,3] [--model <id>] [--dry-run] [--force]` — (re)ingest a module; idempotent via per-file `.ingest.json` sidecars (sha256 of PDF + chapter selection)
- `npx tsx scripts/create-user.ts <email> <password>` — create a user
