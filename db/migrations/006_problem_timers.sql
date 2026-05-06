CREATE TABLE IF NOT EXISTS problem_timers (
  user_id INTEGER NOT NULL REFERENCES users(id),
  problem_id TEXT NOT NULL REFERENCES problems(id),
  opened_at INTEGER NOT NULL,
  PRIMARY KEY (user_id, problem_id)
);
