import { NextRequest } from "next/server";
import { z } from "zod";
import { getDb } from "@/lib/db";
import { requireUserId } from "@/lib/auth/current-user";
import {
  saveMessage,
  listMessages,
  CHAT_MODES,
  type ChatMode,
} from "@/lib/chat/repo";
import { streamCoach } from "@/lib/agent/stream";
import { getProblem } from "@/lib/problems/repo";
import { loadProblemMdx } from "@/lib/content/problems";
import { listAttempts } from "@/lib/attempts/repo";
import { getOpenedAt } from "@/lib/progress/timers";
import { canUnlockSolution } from "@/lib/progress/unlock";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const ModeSchema = z.enum(CHAT_MODES as [ChatMode, ...ChatMode[]]);

const PostBodySchema = z.object({
  problemId: z.string().min(1),
  mode: ModeSchema,
  userMessage: z.string().min(1),
  scratch: z.string().optional().default(""),
  lastVerdict: z.string().nullable().optional().default(null),
});

export async function GET(req: NextRequest) {
  const userId = await requireUserId();
  const problemId = req.nextUrl.searchParams.get("problemId");
  const modeParam = req.nextUrl.searchParams.get("mode");
  const parsed = ModeSchema.safeParse(modeParam);
  if (!problemId || !parsed.success) {
    return new Response("bad request", { status: 400 });
  }
  const messages = listMessages(getDb(), userId, problemId, parsed.data);
  return Response.json({ messages });
}

export async function POST(req: NextRequest) {
  const userId = await requireUserId();
  const raw = await req.json().catch(() => null);
  const parsed = PostBodySchema.safeParse(raw);
  if (!parsed.success) {
    return new Response("bad request", { status: 400 });
  }
  const { problemId, mode, userMessage, scratch, lastVerdict } = parsed.data;

  const db = getDb();
  saveMessage(db, {
    userId,
    problemId,
    mode,
    role: "user",
    content: userMessage,
  });

  const history = listMessages(db, userId, problemId, mode);

  let canonicalSolution: string | undefined;
  if (mode === "solution") {
    // Server-enforced unlock gate: refuse to stream Solution-mode replies
    // until the user has earned access (≥1 attempt OR ≥15 minutes on the
    // problem). This is independent of the client tab being disabled.
    const attempts = listAttempts(db, userId, problemId).length;
    const openedAt = getOpenedAt(db, userId, problemId);
    if (
      !canUnlockSolution({
        attempts,
        openedAt,
        now: Date.now(),
      })
    ) {
      return new Response("solution mode locked", { status: 403 });
    }
    const problem = getProblem(db, problemId);
    if (problem) {
      const mdx = loadProblemMdx(problem.module_id, problem.id);
      canonicalSolution = mdx?.solution || undefined;
    }
  }

  const encoder = new TextEncoder();
  let assistantBuffer = "";

  const stream = new ReadableStream({
    async start(controller) {
      try {
        for await (const ev of streamCoach({
          mode,
          problemId,
          userId,
          scratch,
          lastVerdict,
          history,
          userMessage,
          canonicalSolution,
        })) {
          controller.enqueue(encoder.encode(`data: ${JSON.stringify(ev)}\n\n`));
          if (ev.type === "delta") assistantBuffer += ev.text;
          if (ev.type === "blocked") assistantBuffer = ev.text;
        }
      } catch (err) {
        const message = err instanceof Error ? err.message : "stream error";
        controller.enqueue(
          encoder.encode(
            `data: ${JSON.stringify({ type: "error", text: message })}\n\n`,
          ),
        );
      } finally {
        if (assistantBuffer.length > 0) {
          saveMessage(db, {
            userId,
            problemId,
            mode,
            role: "assistant",
            content: assistantBuffer,
          });
        }
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
    },
  });
}
