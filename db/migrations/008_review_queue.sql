CREATE TABLE IF NOT EXISTS review_queue (
  user_id INTEGER NOT NULL REFERENCES users(id),
  problem_id TEXT NOT NULL REFERENCES problems(id),
  due_at INTEGER NOT NULL,
  ease REAL NOT NULL DEFAULT 2.5,
  interval_days INTEGER NOT NULL DEFAULT 0,
  reps INTEGER NOT NULL DEFAULT 0,
  last_reviewed_at INTEGER,
  PRIMARY KEY (user_id, problem_id)
);
CREATE INDEX IF NOT EXISTS idx_review_due ON review_queue(user_id, due_at);
