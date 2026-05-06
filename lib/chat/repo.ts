import type { Database as DB } from "better-sqlite3";

export type ChatMode = "socratic" | "hints" | "rigor" | "exam" | "solution";
export type ChatRole = "user" | "assistant";

export const CHAT_MODES: ChatMode[] = [
  "socratic",
  "hints",
  "rigor",
  "exam",
  "solution",
];

export interface ChatMessage {
  id: number;
  user_id: number;
  problem_id: string;
  mode: ChatMode;
  role: ChatRole;
  content: string;
  created_at: number;
}

export interface SaveMessageInput {
  userId: number;
  problemId: string;
  mode: ChatMode;
  role: ChatRole;
  content: string;
}

export function saveMessage(db: DB, input: SaveMessageInput): ChatMessage {
  const info = db
    .prepare(
      `INSERT INTO chat_messages (user_id, problem_id, mode, role, content)
       VALUES (?, ?, ?, ?, ?)`,
    )
    .run(input.userId, input.problemId, input.mode, input.role, input.content);
  return db
    .prepare(`SELECT * FROM chat_messages WHERE id = ?`)
    .get(info.lastInsertRowid) as ChatMessage;
}

export function listMessages(
  db: DB,
  userId: number,
  problemId: string,
  mode: ChatMode,
): ChatMessage[] {
  return db
    .prepare(
      `SELECT * FROM chat_messages
       WHERE user_id = ? AND problem_id = ? AND mode = ?
       ORDER BY created_at ASC, id ASC`,
    )
    .all(userId, problemId, mode) as ChatMessage[];
}
