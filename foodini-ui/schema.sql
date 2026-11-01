-- Foodini persistence schema for Cloudflare D1 (SQLite)

CREATE TABLE IF NOT EXISTS household_state (
  household_id TEXT PRIMARY KEY,
  state_json TEXT NOT NULL,
  version INTEGER NOT NULL DEFAULT 1,
  updated_at INTEGER NOT NULL
);
