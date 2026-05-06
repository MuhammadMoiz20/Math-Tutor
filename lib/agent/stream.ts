import { query, tool, createSdkMcpServer } from "@anthropic-ai/claude-agent-sdk";
import Anthropic from "@anthropic-ai/sdk";
import { z } from "zod";
import type { ChatMessage, ChatMode } from "../chat/repo";
import { getDb } from "../db";
import { getProblemMeta, getUserHistory } from "./tools";
import { getSystemPrompt } from "./prompts";
import { looksLikeFullSolution } from "./filter";
import * as sympy from "../sympy/server";

export type CoachEvent =
  | { type: "delta"; text: string }
  | { type: "blocked"; reason: string; text: string }
  | { type: "done" };

export interface StreamCoachInput {
  mode: ChatMode;
  problemId: string;
  userId: number;
  scratch: string;
  lastVerdict: string | null;
  history: ChatMessage[];
  userMessage: string;
  /** Canonical solution body (only injected when mode === "solution"). */
  canonicalSolution?: string;
  /** Optional opt-in photo for this turn (base64 + mime). */
  photoBase64?: string;
  photoMime?: "image/jpeg" | "image/png" | "image/webp";
}

const BLOCKED_MESSAGE =
  "I can't reveal the full solution in this mode. Switch to Solution mode (once unlocked) or ask for the next-level hint.";

function buildContextHeader(input: StreamCoachInput): string {
  const parts = [
    `Problem id: ${input.problemId}. Use the get_problem_meta tool for the title, type, and statement excerpt.`,
    `User scratchpad (markdown + KaTeX):\n\`\`\`\n${input.scratch || "(empty)"}\n\`\`\``,
  ];
  if (input.lastVerdict) {
    parts.push(`Last SymPy verdict on submitted answer: ${input.lastVerdict}`);
  }
  if (input.mode === "solution" && input.canonicalSolution) {
    parts.push(
      `Canonical solution (reveal this verbatim on first turn, then chat about it):\n${input.canonicalSolution}`,
    );
  }
  if (input.history.length > 0) {
    const recent = input.history
      .slice(-8)
      .map((m) => `${m.role}: ${m.content}`)
      .join("\n");
    parts.push(`Recent conversation in this mode:\n${recent}`);
  }
  return parts.join("\n\n");
}

export async function* streamCoach(
  input: StreamCoachInput,
): AsyncGenerator<CoachEvent> {
  // When the user attaches a photo for this turn, drop down to the raw
  // Anthropic SDK so we can pass an `image` content block. Trade-off: this
  // path forgoes the agent SDK's MCP tool surface (SymPy, get_problem_meta)
  // for the single image-aware turn — acceptable per the Phase 8 plan since
  // image-bearing turns are rare and the no-photo path (below) keeps the
  // full tool-using agent identical to Phase 6/7.
  if (input.photoBase64 && input.photoMime) {
    yield* streamCoachWithImage(input);
    return;
  }

  const mcpServer = createSdkMcpServer({
    name: "math-tutor",
    version: "1.0.0",
    tools: [
      tool(
        "get_problem_meta",
        "Return id, module, title, type, and a statement excerpt for the current problem. Never returns the canonical solution.",
        { problemId: z.string() },
        async (args: { problemId: string }) => {
          const meta = getProblemMeta(getDb(), args.problemId);
          return {
            content: [{ type: "text" as const, text: JSON.stringify(meta) }],
          };
        },
      ),
      tool(
        "get_user_history",
        "Return the user's recent attempts and chat messages on this problem (newest first).",
        {
          problemId: z.string(),
          limit: z.number().int().min(1).max(50).default(10),
        },
        async (args: { problemId: string; limit: number }) => {
          const hist = getUserHistory(
            getDb(),
            input.userId,
            args.problemId,
            args.limit,
          );
          return {
            content: [{ type: "text" as const, text: JSON.stringify(hist) }],
          };
        },
      ),
      tool(
        "check_equivalent",
        "Check whether two SymPy-parseable expressions are equivalent. Returns {equivalent, simplified_diff} or {error}.",
        { a: z.string(), b: z.string() },
        async (args: { a: string; b: string }) => ({
          content: [
            {
              type: "text" as const,
              text: JSON.stringify(sympy.check_equivalent(args.a, args.b)),
            },
          ],
        }),
      ),
      tool(
        "simplify",
        "Simplify a SymPy expression. Returns {result} or {error}.",
        { expr: z.string() },
        async (args: { expr: string }) => ({
          content: [
            {
              type: "text" as const,
              text: JSON.stringify(sympy.simplify(args.expr)),
            },
          ],
        }),
      ),
      tool(
        "diff",
        "Differentiate a SymPy expression with respect to a variable.",
        { expr: z.string(), variable: z.string() },
        async (args: { expr: string; variable: string }) => ({
          content: [
            {
              type: "text" as const,
              text: JSON.stringify(sympy.diff(args.expr, args.variable)),
            },
          ],
        }),
      ),
      tool(
        "integrate",
        "Indefinite integral of a SymPy expression with respect to a variable.",
        { expr: z.string(), variable: z.string() },
        async (args: { expr: string; variable: string }) => ({
          content: [
            {
              type: "text" as const,
              text: JSON.stringify(sympy.integrate(args.expr, args.variable)),
            },
          ],
        }),
      ),
      tool(
        "solve",
        "Solve an equation/expression for a variable. Returns {result: string[]} or {error}.",
        { expr: z.string(), variable: z.string() },
        async (args: { expr: string; variable: string }) => ({
          content: [
            {
              type: "text" as const,
              text: JSON.stringify(sympy.solve(args.expr, args.variable)),
            },
          ],
        }),
      ),
      tool(
        "evaluate_at",
        "Substitute a variable with a value and return the resulting expression.",
        {
          expr: z.string(),
          variable: z.string(),
          value: z.string(),
        },
        async (args: {
          expr: string;
          variable: string;
          value: string;
        }) => ({
          content: [
            {
              type: "text" as const,
              text: JSON.stringify(
                sympy.evaluate_at(args.expr, args.variable, args.value),
              ),
            },
          ],
        }),
      ),
    ],
  });

  const fullPrompt = `${buildContextHeader(input)}\n\nUser: ${input.userMessage}`;

  let buffer = "";
  let blocked = false;
  const it = query({
    prompt: fullPrompt,
    options: {
      model: "claude-haiku-4-5",
      systemPrompt: getSystemPrompt(input.mode),
      mcpServers: { "math-tutor": mcpServer },
      allowedTools: [
        "mcp__math-tutor__get_problem_meta",
        "mcp__math-tutor__get_user_history",
        "mcp__math-tutor__check_equivalent",
        "mcp__math-tutor__simplify",
        "mcp__math-tutor__diff",
        "mcp__math-tutor__integrate",
        "mcp__math-tutor__solve",
        "mcp__math-tutor__evaluate_at",
      ],
      includePartialMessages: true,
      maxTurns: 4,
    },
  });

  for await (const msg of it) {
    if (blocked) continue;
    if (msg.type === "stream_event") {
      const ev = msg.event as {
        type?: string;
        delta?: { type?: string; text?: string };
      };
      if (
        ev?.type === "content_block_delta" &&
        ev.delta?.type === "text_delta" &&
        typeof ev.delta.text === "string"
      ) {
        const text = ev.delta.text;
        buffer += text;
        if (input.mode !== "solution" && looksLikeFullSolution(buffer)) {
          blocked = true;
          yield {
            type: "blocked",
            reason: "no_solution_rule",
            text: BLOCKED_MESSAGE,
          };
          continue;
        }
        yield { type: "delta", text };
      }
    } else if (msg.type === "result") {
      break;
    }
  }
  if (!blocked) yield { type: "done" };
}

async function* streamCoachWithImage(
  input: StreamCoachInput,
): AsyncGenerator<CoachEvent> {
  const client = new Anthropic();
  const header = buildContextHeader(input);
  const stream = client.messages.stream({
    model: "claude-haiku-4-5",
    max_tokens: 1024,
    system: getSystemPrompt(input.mode),
    messages: [
      {
        role: "user",
        content: [
          {
            type: "image",
            source: {
              type: "base64",
              media_type: input.photoMime!,
              data: input.photoBase64!,
            },
          },
          {
            type: "text",
            text: `${header}\n\nUser: ${input.userMessage}`,
          },
        ],
      },
    ],
  });

  let buffer = "";
  let blocked = false;
  for await (const ev of stream) {
    if (blocked) continue;
    if (
      ev.type === "content_block_delta" &&
      ev.delta.type === "text_delta" &&
      typeof ev.delta.text === "string"
    ) {
      const text = ev.delta.text;
      buffer += text;
      if (input.mode !== "solution" && looksLikeFullSolution(buffer)) {
        blocked = true;
        yield {
          type: "blocked",
          reason: "no_solution_rule",
          text: BLOCKED_MESSAGE,
        };
        continue;
      }
      yield { type: "delta", text };
    }
  }
  if (!blocked) yield { type: "done" };
}
