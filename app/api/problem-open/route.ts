import { NextResponse } from "next/server";
import { z } from "zod";
import { getDb } from "@/lib/db";
import { requireUserId } from "@/lib/auth/current-user";
import { upsertOpened } from "@/lib/progress/timers";

const BodySchema = z.object({ problemId: z.string().min(1) });

export async function POST(req: Request) {
  let userId: number;
  try {
    userId = await requireUserId();
  } catch {
    return NextResponse.json({ error: "unauthenticated" }, { status: 401 });
  }
  let body: z.infer<typeof BodySchema>;
  try {
    body = BodySchema.parse(await req.json());
  } catch {
    return NextResponse.json({ error: "invalid body" }, { status: 400 });
  }
  const now = Date.now();
  const openedAt = upsertOpened(getDb(), userId, body.problemId, now);
  return NextResponse.json({ openedAt });
}
