import Database, { type Database as DB } from "better-sqlite3";
import fs from "node:fs";
import path from "node:path";

const MIGRATIONS_DIR = path.join(process.cwd(), "db", "migrations");

export function openDb(file?: string): DB {
  const target = file ?? process.env.DB_PATH ?? "math-tutor.db";
  const db = new Database(target);
  db.pragma("journal_mode = WAL");
  db.pragma("foreign_keys = ON");
  runMigrations(db);
  return db;
}

function runMigrations(db: DB): void {
  if (!fs.existsSync(MIGRATIONS_DIR)) return;
  const files = fs
    .readdirSync(MIGRATIONS_DIR)
    .filter((f) => f.endsWith(".sql"))
    .sort();
  for (const f of files) {
    const sql = fs.readFileSync(path.join(MIGRATIONS_DIR, f), "utf8");
    db.exec(sql);
  }
}

let cached: DB | null = null;
export function getDb(): DB {
  if (!cached) {
    cached = openDb(process.env.DB_PATH ?? "math-tutor.db");
  }
  return cached;
}
