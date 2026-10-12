/**
 * SQLite persistence layer (better-sqlite3).
 * Schema initialisation is idempotent: existing databases are NEVER dropped.
 */
import fs from 'node:fs';
import path from 'node:path';
import Database from 'better-sqlite3';
import { config } from './config.js';

const SCHEMA = `
CREATE TABLE IF NOT EXISTS users (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  name          TEXT    NOT NULL,
  email         TEXT    NOT NULL UNIQUE,          -- stored lower-cased/normalised
  password_hash TEXT    NOT NULL,
  created_at    TEXT    NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS preferences (
  user_id        INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  mood           TEXT,
  categories     TEXT,                            -- JSON array of category ids
  budget_inr     INTEGER,
  time_minutes   INTEGER,
  radius_m       INTEGER,
  indoor_outdoor TEXT,
  purpose        TEXT,
  accessibility  TEXT,
  last_lat       REAL,                            -- only stored when the user opts in
  last_lon       REAL,
  updated_at     TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS feedback (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  osm_key    TEXT    NOT NULL,                    -- stable id: "node/12345"
  name       TEXT,
  category   TEXT,
  vote       TEXT    CHECK (vote IN ('like','dislike')),
  rating     INTEGER CHECK (rating IS NULL OR (rating BETWEEN 1 AND 5)),
  comment    TEXT,
  created_at TEXT    NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT    NOT NULL DEFAULT (datetime('now')),
  UNIQUE (user_id, osm_key)
);

CREATE TABLE IF NOT EXISTS sessions (
  sid        TEXT    PRIMARY KEY,
  sess       TEXT    NOT NULL,
  expires_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_feedback_osm_key ON feedback (osm_key);
CREATE INDEX IF NOT EXISTS idx_feedback_user    ON feedback (user_id);
CREATE INDEX IF NOT EXISTS idx_sessions_expires ON sessions (expires_at);
`;

let instance = null;

/** Open (or create) the database and ensure the schema exists. */
export function createDb(databasePath = config.DATABASE_PATH) {
  const isMemory = databasePath === ':memory:';
  if (!isMemory) {
    const dir = path.dirname(databasePath);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  }
  const db = new Database(databasePath);
  db.pragma('foreign_keys = ON');
  if (!isMemory) db.pragma('journal_mode = WAL');
  db.exec(SCHEMA);
  return db;
}

/** Process-wide singleton used by the HTTP server. */
export function getDb() {
  if (!instance) instance = createDb();
  return instance;
}

export function closeDb() {
  if (instance) {
    try { instance.close(); } catch { /* ignore */ }
    instance = null;
  }
}

export function healthCheck(db) {
  try {
    db.prepare('SELECT 1 AS ok').get();
    return { ok: true };
  } catch (err) {
    return { ok: false, message: err.message };
  }
}
