/**
 * SQLite schema, inlined as a string (rather than a loose .sql asset) so it
 * ships with the compiled output with no extra copy step. Applied with
 * `CREATE TABLE IF NOT EXISTS`, so it is safe to run on every startup.
 */
export const SCHEMA_SQL = `
CREATE TABLE IF NOT EXISTS conversations (
  conversation_id TEXT PRIMARY KEY,
  display_name    TEXT,
  last_seen_at    TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS players (
  conversation_id TEXT NOT NULL,
  user_id         TEXT NOT NULL,
  display_name    TEXT NOT NULL,
  active          INTEGER NOT NULL DEFAULT 1,
  joined_at       TEXT NOT NULL,
  PRIMARY KEY (conversation_id, user_id)
);

CREATE TABLE IF NOT EXISTS scores (
  conversation_id TEXT NOT NULL,
  play_date       TEXT NOT NULL, -- YYYY-MM-DD in the configured timezone
  game            TEXT NOT NULL, -- 'timeguesser' | 'speedquiz'
  user_id         TEXT NOT NULL,
  display_name    TEXT NOT NULL,
  score           INTEGER NOT NULL,
  source          TEXT NOT NULL, -- 'screenshot' | 'manual'
  raw_confidence  TEXT,          -- vision confidence, when source = 'screenshot'
  submitted_at    TEXT NOT NULL,
  PRIMARY KEY (conversation_id, play_date, game, user_id)
);

CREATE INDEX IF NOT EXISTS idx_scores_by_date
  ON scores (conversation_id, play_date, game);

CREATE TABLE IF NOT EXISTS daily_results (
  conversation_id TEXT NOT NULL,
  play_date       TEXT NOT NULL,
  game            TEXT NOT NULL,
  winners_json    TEXT NOT NULL, -- JSON array of {userId, displayName} - supports ties
  winning_score   INTEGER NOT NULL,
  finalized_at    TEXT NOT NULL,
  finalized_by    TEXT NOT NULL, -- 'auto' | 'manual'
  PRIMARY KEY (conversation_id, play_date, game)
);

CREATE TABLE IF NOT EXISTS grand_slams (
  conversation_id TEXT NOT NULL,
  play_date       TEXT NOT NULL,
  user_id         TEXT NOT NULL,
  display_name    TEXT NOT NULL,
  recorded_at     TEXT NOT NULL,
  PRIMARY KEY (conversation_id, play_date, user_id)
);
`;
