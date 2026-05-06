import bcrypt from "bcryptjs";
import type { Database } from "better-sqlite3";

export function createUser(db: Database, email: string, password: string): number {
  const hash = bcrypt.hashSync(password, 10);
  const info = db
    .prepare("INSERT INTO users (email, password_hash) VALUES (?, ?)")
    .run(email, hash);
  return Number(info.lastInsertRowid);
}

export function verifyUser(
  db: Database,
  email: string,
  password: string,
): { id: number; email: string } | null {
  const row = db
    .prepare("SELECT id, email, password_hash FROM users WHERE email = ?")
    .get(email) as { id: number; email: string; password_hash: string } | undefined;
  if (!row) return null;
  if (!bcrypt.compareSync(password, row.password_hash)) return null;
  return { id: row.id, email: row.email };
}
