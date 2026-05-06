import { query, tool, createSdkMcpServer } from "@anthropic-ai/claude-agent-sdk";
import { z } from "zod";
import type { ChatMessage, ChatMode } from "../chat/repo";
import { getDb } from "../db";
import { getProblemMeta, getUserHistory } from "./tools";
import { getSystemPrompt } from "./prompts";
import { looksLikeFullSolution } from "./filter";

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
        if (looksLikeFullSolution(buffer)) {
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
