# Math-Tutor — Design

**Date:** 2026-05-06
**Status:** Approved, ready for implementation planning
**Predecessor:** Forked in spirit from LC-Neet's AI coach architecture (`@anthropic-ai/claude-agent-sdk`, SSE streaming, mode-based system prompts, MCP tool server).

## Goal

A personal, single-user web app that teaches the math underlying ML/AI from A-level prerequisites up through what's needed to read modern ML papers. Style: textbook spine + interactive AI tutor + active practice with computer-checked answers.

Mastery, not completion, is the success criterion.

## Curriculum spine

~12–15 modules, sequenced. Each module has a primary textbook source mapped via `curriculum.yaml`. Working order:

1. Linear algebra I — vectors, matrices, linear systems
2. Multivariable calculus — partials, gradients, chain rule
3. Linear algebra II — eigendecomposition, SVD, projections, quadratic forms
4. Probability I — distributions, expectation, conditional probability, Bayes
5. Optimization — convexity, gradient descent, Lagrangians, KKT
6. Probability II — MLE/MAP, sampling, CLT, concentration
7. Information theory — entropy, KL, cross-entropy, mutual information
8. Matrix calculus — Jacobians, Hessians, backprop math
9. Statistics for ML — estimators, bias-variance, hypothesis testing
10. Numerical methods — conditioning, stability, floating point
11. *(optional capstones)* variational inference, basic differential geometry, measure-theoretic probability

## Per-topic learning loop

1. **Concept page** (MDX, ~5–10 min) — definitions, key theorems, geometric intuition, and a "Where this shows up in ML" sidebar. Skimmable on return.
2. **Worked examples** — one or two problems solved in full, with reasoning surfaced.
3. **Problem set** — graded easy → hard. Coach modes available for active struggle. Solution mode unlocks per the gating rule.
4. **Concept-check chat** — open-ended tutor session on the topic.
5. **Spaced review** — past problems resurface via a `due_for_review` queue.

## Coach modes

System-prompted personas, same architectural pattern as LC-Neet (`lib/agent/prompts.ts`). Each chat is keyed to `(user_id, problem_id, mode)`.

| Mode | Behavior |
|---|---|
| **Socratic** | Questions only, one per turn. No proposals, no pseudocode, no derivations. |
| **Hints** | Smallest-hint-first laddering: (1) name the technique, (2) state the key sub-result or invariant, (3) 2–3 line sketch. Refuses further escalation. |
| **Rigor** | *Replaces LC-Neet's Style mode.* Critiques the user's mathematical writing — missing quantifiers, "WLOG" misuse, unjustified equalities, notation hygiene, scope of variables. |
| **Exam** | *Renamed from Interview.* Time-pressure mode. No hints, no solutions. Only clarifying questions, like a proctor. |
| **Solution** | *New.* Reveals canonical worked solution, then chats about it. Locked behind the unlock gate. No no-solution rule. |

Socratic, Hints, Rigor, and Exam all carry a `NO_SOLUTION_RULE` analogous to LC-Neet's. Solution mode replaces it with a `STAY_GROUNDED_RULE`: every computational claim must be verified through the SymPy tool surface before being asserted.

### Solution-mode unlock gate

Unlocked when **either**:
- the user has submitted ≥ 1 attempt (right or wrong), **or**
- the user has spent ≥ N minutes on the problem (timer starts on problem open; N configurable, default 15).

Rationale: forces engagement when engagement is possible, but doesn't punish the case where the user genuinely doesn't know how to start.

## Workspace (the "code editor" analog)

- **Default:** Markdown + inline KaTeX scratchpad in CodeMirror 6, with a live KaTeX preview pane.
- **Photo upload:** opt-in `<input type="file">` per problem. Image is sent to Claude (vision) as part of the next coach turn. Used when the user worked on paper.
- The coach sees: scratchpad text *and* any uploaded images for the current turn.

## Answer checking — hybrid path

Two paths picked per problem `type`:

**Computational** (e.g., "find the eigenvalues of A"):
- Pyodide loads SymPy in-browser.
- On submit: `check_equivalent(user_expr, expected_expr)` — symbolic equality (handles `1/2` ≡ `0.5` ≡ `\frac{1}{2}`).
- Verdict ships back instantly: ✅/❌ + the simplified `user - expected` if not equivalent.
- Verdict is then piped to Claude as part of the next turn's context, so the response is targeted analysis ("right answer but step 3 has a sign error that canceled with another sign error in step 5").

**Derivation/proof** (e.g., "show that the gradient of softmax is..."):
- Each problem has a stored `rubric: string[]` — key claims that must appear.
- LLM-judge: Claude is prompted with the rubric, the user's submitted derivation, and the canonical proof. Returns `{verdict, missing_claims, errors, comments}`.
- Solution mode is always reachable so the user can sanity-check the verdict against the canonical solution.

### SymPy as a tool surface, not just a checker

The agent gets a SymPy tool surface via the MCP server. This means Claude *uses* SymPy mid-conversation rather than bluffing arithmetic — including in Solution mode when the user proposes alternative approaches.

Tool surface (extending LC-Neet's two tools):

- `get_problem_meta(id)` — title, topic, difficulty, statement, rubric (LC-Neet pattern)
- `get_user_history(topic, limit)` — past attempts (LC-Neet pattern)
- `check_equivalent(user_expr, expected_expr)` — symbolic equality
- `simplify(expr)` — canonical form
- `diff(expr, var)` — symbolic differentiation
- `integrate(expr, var)` — symbolic integration
- `solve(eq, var)` — equation solving
- `evaluate_at(expr, vars)` — numeric sanity check at a point

SymPy tools execute in a server-side Python subprocess (or Pyodide via a worker, TBD in the implementation plan). The agent calls them as MCP tools; results are JSON.

## Content pipeline — book ingestion

Single-user, copyright is not a concern. Real textbooks are higher signal than LLM-generated content.

### Inputs

- `books/` — user drops PDF (or EPUB) files.
- `curriculum.yaml` — maps each module to source chapters across one or more books. Example:

```yaml
modules:
  - id: linalg-1
    title: Linear Algebra I
    sources:
      - book: mml.pdf
        chapters: [2, 3]
        primary: true
      - book: axler.pdf
        chapters: [1, 2]
        role: supplementary
```

### `scripts/ingest-book.ts`

For each module:

1. Sends the relevant PDF pages directly to the Anthropic API via `@anthropic-ai/sdk` (PDFs are first-class input — far better formula preservation than `pdftotext`).
2. Claude emits structured output per section:
   - **Concept page** — MDX with KaTeX preserved, rewritten in the project's house style, with a "Where this shows up in ML" sidebar. Saved to `content/<module>/concept.mdx`.
   - **Worked examples** — saved to `content/<module>/worked/<n>.mdx`.
   - **Problems** — one file per problem, frontmatter + body:
     ```yaml
     ---
     id: linalg-1-eigen-7
     module: linalg-1
     type: computational | derivation
     statement: "..."
     expected_answer: "Matrix(...)"   # SymPy expr string, computational only
     rubric:                           # derivation only
       - "introduces eigenvector definition"
       - "uses characteristic polynomial"
     source: { book: mml, page: 87 }
     provenance: book | book+verified | generated
     ---
     ## Canonical solution
     ...
     ```
3. Solutions:
   - If the book includes solutions in an appendix, extract them.
   - Otherwise Claude generates the solution **and runs SymPy via tool-use to verify** before saving. Provenance is flagged.

The script is **idempotent and re-runnable**. Output is committed to git. Generation is offline; nothing about the ingestion script touches the runtime app.

### Recommended source books

- *Mathematics for Machine Learning* (Deisenroth, Faisal, Ong) — primary spine.
- *Linear Algebra Done Right* (Axler) — depth on LA II.
- *Convex Optimization* (Boyd & Vandenberghe) — optimization, has solutions.
- *All of Statistics* (Wasserman) — probability + stats.
- *Pattern Recognition and Machine Learning* (Bishop) — ML connection points.
- *Deep Learning* (Goodfellow et al.) ch. 2–4 — matrix calc + info theory.

## Architecture

### Stack

- **Next.js 16** (App Router) + **TypeScript** + **Tailwind 4**
- **NextAuth v5** (credentials) — kept lightweight, single user
- **SQLite** via **better-sqlite3** — single-user, local-first, zero ops
- **Pyodide** — SymPy in-browser for instant computational checking
- **`@anthropic-ai/claude-agent-sdk`** — runtime coach (tool use + MCP + streaming)
- **`@anthropic-ai/sdk`** — offline ingestion script (raw, with PDF input)
- **MDX** via `@next/mdx` + `next-mdx-remote/rsc` — concept pages with embedded React widgets
- **KaTeX** + `remark-math` + `rehype-katex` — math rendering everywhere
- **CodeMirror 6** — markdown+math scratchpad
- **shadcn/ui** — component primitives
- **Vitest** + **Playwright** — unit and E2E tests

Skipped: vector DB, job queue, deployment infra. None justified for v1.

### Directory layout

```
math-tutor/
├── app/
│   ├── (auth)/                  # signin
│   ├── modules/[id]/            # concept page + worked examples + problem index
│   ├── problems/[id]/           # workspace + chat
│   ├── api/coach/route.ts       # SSE coach stream (mirrors LC-Neet)
│   ├── api/sympy/route.ts       # server-side SymPy tool execution
│   └── api/check/route.ts       # answer checking (delegates to client Pyodide for fast path)
├── components/
│   ├── workspace/               # CodeMirror scratchpad + KaTeX preview + photo upload
│   ├── chat/                    # mode tabs + streaming chat UI
│   └── widgets/                 # interactive MDX widgets (eigen vis, dist sliders)
├── content/
│   └── <module>/                # ingested concept.mdx, worked/, problems/
├── books/                       # source PDFs (gitignored or LFS, TBD)
├── curriculum.yaml
├── lib/
│   ├── agent/                   # prompts.ts, stream.ts, tools.ts, filter.ts, judge.ts
│   ├── chat/                    # repo.ts (per-problem-mode messages)
│   ├── content/                 # MDX loader + frontmatter parser
│   ├── progress/                # attempts, mastery, due_for_review
│   ├── sympy/                   # subprocess wrapper for server-side SymPy
│   └── db.ts
├── scripts/
│   ├── ingest-book.ts
│   ├── create-user.ts
│   └── seed-curriculum.ts
└── docs/plans/
```

### Database schema (additions over LC-Neet)

```
modules(id TEXT PK, title, ord INTEGER, status)
problems(
  id TEXT PK, module_id, type, statement, expected_answer,
  rubric_json, source_json, provenance, ord INTEGER
)
attempts(
  id, user_id, problem_id, submitted_at,
  user_work TEXT, verdict, sympy_diff, judge_json
)
mastery(user_id, module_id, score, last_updated)
chat_messages(...)         -- as in LC-Neet, but problem_id is TEXT
problem_timers(user_id, problem_id, opened_at)  -- for solution unlock gate
review_queue(user_id, problem_id, due_at)
```

### Streaming coach (mirrors LC-Neet `app/api/coach/route.ts`)

- POST `/api/coach` with `{problemId, mode, userMessage, scratchpad, photoBase64?, lastVerdict?}`.
- Server saves user message, opens an SSE stream, calls `streamCoach(...)` from the agent SDK with the right system prompt + tool surface, persists assistant buffer on close.
- Solution mode skips the `looksLikeFullSolution` filter; all other modes apply it.

### Error handling

- SymPy tool failures surface as `{ok: false, error}` JSON to the agent — the agent is instructed to retry with simpler input or fall back to a non-symbolic explanation.
- Coach stream errors propagate as SSE `error` events (LC-Neet pattern).
- Photo upload failures: client-side resize + size cap (~5 MB) before send; server rejects oversize.
- Ingestion script: each section is a separate transaction; partial failures don't poison the rest.

### Testing

- **Unit (Vitest):** SymPy wrapper, content loader, judge prompt, prompt builder per mode, solution-unlock gate logic.
- **E2E (Playwright):** signin → open problem → submit wrong answer → see SymPy verdict → open Hints mode → escalate → unlock Solution → chat about it.
- **Snapshot:** mode system prompts, to catch accidental drift.

## Scope of v1

To avoid building everything before any of it works:

1. **One module end-to-end first** — Linear Algebra I. Ingest MML chapters 2–3, all five modes working, SymPy checking, Solution mode, photo upload, spaced review queue (even if empty).
2. **Then expand** — module by module, ingest + verify + ship.

The implementation plan (next step) will turn this into ordered tasks.

## Open questions deferred to implementation

- Does SymPy run in Pyodide (browser) or as a server-side subprocess called via MCP? Browser is faster feedback; server is simpler tool-use plumbing. Likely: Pyodide for the fast-path verdict on submit, server-side subprocess for the agent's mid-conversation tool calls.
- Photo OCR quality — verify with a few real samples from your handwriting before committing the multimodal path.
- MDX widget catalog — defer until the LA I concept page is being authored; build widgets on demand.
