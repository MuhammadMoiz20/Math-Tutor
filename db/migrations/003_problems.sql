CREATE TABLE IF NOT EXISTS problems (
  id TEXT PRIMARY KEY,
  module_id TEXT NOT NULL REFERENCES modules(id),
  title TEXT NOT NULL,
  type TEXT NOT NULL CHECK (type IN ('computational','derivation')),
  expected_answer TEXT,
  rubric_json TEXT,
  source_json TEXT,
  ord INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS idx_problems_module ON problems(module_id, ord);
