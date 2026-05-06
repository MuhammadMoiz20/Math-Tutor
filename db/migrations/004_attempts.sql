CREATE TABLE IF NOT EXISTS attempts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL REFERENCES users(id),
  problem_id TEXT NOT NULL REFERENCES problems(id),
  user_answer TEXT,
  user_work TEXT,
  verdict TEXT NOT NULL,
  sympy_diff TEXT,
  judge_json TEXT,
  created_at INTEGER NOT NULL DEFAULT (unixepoch())
);
CREATE INDEX IF NOT EXISTS idx_attempts_user_problem ON attempts(user_id, problem_id, created_at DESC);
