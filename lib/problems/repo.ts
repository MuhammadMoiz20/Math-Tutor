import type { Database as DB } from "better-sqlite3";

export type ProblemType = "computational" | "derivation";

export interface Problem {
  id: string;
  module_id: string;
  title: string;
  type: ProblemType;
  expected_answer: string | null;
  rubric: string[] | null;
  source: Record<string, unknown> | null;
  ord: number;
}

interface ProblemRow {
  id: string;
  module_id: string;
  title: string;
  type: ProblemType;
  expected_answer: string | null;
  rubric_json: string | null;
  source_json: string | null;
  ord: number;
}

function rowToProblem(row: ProblemRow): Problem {
  return {
    id: row.id,
    module_id: row.module_id,
    title: row.title,
    type: row.type,
    expected_answer: row.expected_answer,
    rubric: row.rubric_json ? (JSON.parse(row.rubric_json) as string[]) : null,
    source: row.source_json
      ? (JSON.parse(row.source_json) as Record<string, unknown>)
      : null,
    ord: row.ord,
  };
}

export function upsertProblem(db: DB, p: Problem): void {
  db.prepare(
    `INSERT INTO problems (id, module_id, title, type, expected_answer, rubric_json, source_json, ord)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(id) DO UPDATE SET
       module_id = excluded.module_id,
       title = excluded.title,
       type = excluded.type,
       expected_answer = excluded.expected_answer,
       rubric_json = excluded.rubric_json,
       source_json = excluded.source_json,
       ord = excluded.ord`,
  ).run(
    p.id,
    p.module_id,
    p.title,
    p.type,
    p.expected_answer,
    p.rubric ? JSON.stringify(p.rubric) : null,
    p.source ? JSON.stringify(p.source) : null,
    p.ord,
  );
}

export function getProblem(db: DB, id: string): Problem | null {
  const row = db
    .prepare(
      `SELECT id, module_id, title, type, expected_answer, rubric_json, source_json, ord
       FROM problems WHERE id = ?`,
    )
    .get(id) as ProblemRow | undefined;
  return row ? rowToProblem(row) : null;
}

export function listProblemsByModule(db: DB, moduleId: string): Problem[] {
  const rows = db
    .prepare(
      `SELECT id, module_id, title, type, expected_answer, rubric_json, source_json, ord
       FROM problems WHERE module_id = ? ORDER BY ord ASC, id ASC`,
    )
    .all(moduleId) as ProblemRow[];
  return rows.map(rowToProblem);
}
