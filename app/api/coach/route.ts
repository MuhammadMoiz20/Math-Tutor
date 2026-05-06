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
import {
  saveAttachment,
  listAttachmentsForMessages,
} from "@/lib/chat/attachments";
import { streamCoach } from "@/lib/agent/stream";
import { getProblem } from "@/lib/problems/repo";
import { loadProblemMdx } from "@/lib/content/problems";
import { listAttempts } from "@/lib/attempts/repo";
import { getOpenedAt } from "@/lib/progress/timers";
import { canUnlockSolution } from "@/lib/progress/unlock";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const ModeSchema = z.enum(CHAT_MODES as [ChatMode, ...ChatMode[]]);

const PHOTO_MIMES = ["image/jpeg", "image/png", "image/webp"] as const;
const PHOTO_MAX_BYTES = 5 * 1024 * 1024;

const PostBodySchema = z.object({
  problemId: z.string().min(1),
  mode: ModeSchema,
  userMessage: z.string().min(1),
  scratch: z.string().optional().default(""),
  lastVerdict: z.string().nullable().optional().default(null),
  photoBase64: z.string().optional(),
  photoMime: z.enum(PHOTO_MIMES).optional(),
});

function decodedBase64Bytes(b64: string): number {
  // Cheap byte-length estimate for a base64 string without allocating a Buffer.
  const len = b64.length;
  if (len === 0) return 0;
  let padding = 0;
  if (b64.endsWith("==")) padding = 2;
  else if (b64.endsWith("=")) padding = 1;
  return Math.floor((len * 3) / 4) - padding;
}

export async function GET(req: NextRequest) {
  const userId = await requireUserId();
  const problemId = req.nextUrl.searchParams.get("problemId");
  const modeParam = req.nextUrl.searchParams.get("mode");
  const parsed = ModeSchema.safeParse(modeParam);
  if (!problemId || !parsed.success) {
    return new Response("bad request", { status: 400 });
  }
  const db = getDb();
  const messages = listMessages(db, userId, problemId, parsed.data);
  const ids = messages.map((m) => m.id);
  const attMap = listAttachmentsForMessages(db, ids);
  const withAtt = messages.map((m) => ({
    ...m,
    attachments: (attMap.get(m.id) ?? []).map((a) => ({
      id: a.id,
      mime: a.mime,
      data_base64: a.data_base64,
    })),
  }));
  return Response.json({ messages: withAtt });
}

export async function POST(req: NextRequest) {
  const userId = await requireUserId();
  const raw = await req.json().catch(() => null);
  const parsed = PostBodySchema.safeParse(raw);
  if (!parsed.success) {
    return new Response("bad request", { status: 400 });
  }
  const {
    problemId,
    mode,
    userMessage,
    scratch,
    lastVerdict,
    photoBase64,
    photoMime,
  } = parsed.data;

  // If a photo is attached, both fields must be present and the decoded
  // payload must respect the 5 MB cap.
  if ((photoBase64 && !photoMime) || (!photoBase64 && photoMime)) {
    return new Response("bad request: photo fields", { status: 400 });
  }
  if (photoBase64 && decodedBase64Bytes(photoBase64) > PHOTO_MAX_BYTES) {
    return new Response("photo too large", { status: 413 });
  }

  const db = getDb();
  const userMsg = saveMessage(db, {
    userId,
    problemId,
    mode,
    role: "user",
    content: userMessage,
  });
  if (photoBase64 && photoMime) {
    saveAttachment(db, {
      messageId: userMsg.id,
      mime: photoMime,
      dataBase64: photoBase64,
    });
  }

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
          photoBase64,
          photoMime,
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
