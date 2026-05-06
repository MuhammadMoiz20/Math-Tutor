import type { Database as DB } from "better-sqlite3";
import { getProblem } from "../problems/repo";
import { loadProblemMdx } from "../content/problems";
import { listAttempts } from "../attempts/repo";
import { listMessages, type ChatMode } from "../chat/repo";

export interface ProblemMeta {
  id: string;
  module_id: string;
  title: string;
  type: string;
  statement_excerpt: string;
}

export interface HistoryItem {
  kind: "attempt" | "message";
  created_at: number;
  // attempt fields
  verdict?: string;
  user_answer?: string | null;
  // message fields
  role?: string;
  content?: string;
}

export function getProblemMeta(db: DB, problemId: string): ProblemMeta | null {
  const p = getProblem(db, problemId);
  if (!p) return null;
  let excerpt = "";
  const mdx = loadProblemMdx(p.module_id, p.id);
  if (mdx) {
    // Strip the canonical solution, if present, so the agent never sees it
    // through this tool.
    const stripped = mdx.source.replace(
      /##\s*Solution[\s\S]*$/i,
      "",
    );
    excerpt = stripped.trim().slice(0, 800);
  }
  return {
    id: p.id,
    module_id: p.module_id,
    title: p.title,
    type: p.type,
    statement_excerpt: excerpt,
  };
}

export function getUserHistory(
  db: DB,
  userId: number,
  problemId: string,
  limit: number = 10,
): HistoryItem[] {
  const attempts = listAttempts(db, userId, problemId)
    .slice(0, limit)
    .map<HistoryItem>((a) => ({
      kind: "attempt",
      created_at: a.created_at,
      verdict: a.verdict,
      user_answer: a.user_answer,
    }));
  // Recent chat messages across modes for context.
  const allModes: ChatMode[] = ["socratic", "hints", "rigor", "exam"];
  const msgs: HistoryItem[] = [];
  for (const m of allModes) {
    for (const x of listMessages(db, userId, problemId, m)) {
      msgs.push({
        kind: "message",
        created_at: x.created_at,
        role: x.role,
        content: x.content.slice(0, 200),
      });
    }
  }
  const combined = [...attempts, ...msgs].sort(
    (a, b) => b.created_at - a.created_at,
  );
  return combined.slice(0, limit);
}
