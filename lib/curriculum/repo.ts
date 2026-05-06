import type { Database as DB } from "better-sqlite3";
import type { Curriculum } from "@/lib/curriculum/schema";

export interface ModuleRow {
  id: string;
  title: string;
  ord: number;
}

export function seedModules(db: DB, curriculum: Curriculum): void {
  const stmt = db.prepare(
    `INSERT INTO modules (id, title, ord) VALUES (?, ?, ?)
     ON CONFLICT(id) DO UPDATE SET title = excluded.title, ord = excluded.ord`,
  );
  const tx = db.transaction((mods: Curriculum["modules"]) => {
    for (const m of mods) stmt.run(m.id, m.title, m.ord);
  });
  tx(curriculum.modules);
}

export function listModules(db: DB): ModuleRow[] {
  return db
    .prepare("SELECT id, title, ord FROM modules ORDER BY ord ASC, id ASC")
    .all() as ModuleRow[];
}
