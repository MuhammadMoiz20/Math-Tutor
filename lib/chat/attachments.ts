import type { Database as DB } from "better-sqlite3";

export interface Attachment {
  id: number;
  message_id: number;
  mime: string;
  data_base64: string;
  created_at: number;
}

export interface SaveAttachmentInput {
  messageId: number;
  mime: string;
  dataBase64: string;
}

export function saveAttachment(db: DB, input: SaveAttachmentInput): Attachment {
  const info = db
    .prepare(
      `INSERT INTO attachments (message_id, mime, data_base64) VALUES (?, ?, ?)`,
    )
    .run(input.messageId, input.mime, input.dataBase64);
  return db
    .prepare(`SELECT * FROM attachments WHERE id = ?`)
    .get(info.lastInsertRowid) as Attachment;
}

export function listAttachmentsForMessage(
  db: DB,
  messageId: number,
): Attachment[] {
  return db
    .prepare(
      `SELECT * FROM attachments WHERE message_id = ? ORDER BY id ASC`,
    )
    .all(messageId) as Attachment[];
}

export function listAttachmentsForMessages(
  db: DB,
  messageIds: number[],
): Map<number, Attachment[]> {
  const out = new Map<number, Attachment[]>();
  if (messageIds.length === 0) return out;
  const placeholders = messageIds.map(() => "?").join(",");
  const rows = db
    .prepare(
      `SELECT * FROM attachments WHERE message_id IN (${placeholders}) ORDER BY id ASC`,
    )
    .all(...messageIds) as Attachment[];
  for (const r of rows) {
    const arr = out.get(r.message_id) ?? [];
    arr.push(r);
    out.set(r.message_id, arr);
  }
  return out;
}
