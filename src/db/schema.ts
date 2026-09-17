/**
 * Schema statements, applied with `client.migrate(...)` (idempotent -
 * `CREATE TABLE IF NOT EXISTS`) the first time the DB client is created in
 * this process. A single global roster/leaderboard - no per-group scoping.
 */
export const SCHEMA_STATEMENTS: string[] = [
  `CREATE TABLE IF NOT EXISTS players (
    user_id      TEXT PRIMARY KEY,
    display_name TEXT NOT NULL,
    active       INTEGER NOT NULL DEFAULT 1,
    joined_at    TEXT NOT NULL
  )`,
  `CREATE TABLE IF NOT EXISTS scores (
    play_date       TEXT NOT NULL,
    game            TEXT NOT NULL,
    user_id         TEXT NOT NULL,
    display_name    TEXT NOT NULL,
    score           INTEGER NOT NULL,
    screenshot_url  TEXT NOT NULL,
    submitted_at    TEXT NOT NULL,
    PRIMARY KEY (play_date, game, user_id)
  )`,
  `CREATE INDEX IF NOT EXISTS idx_scores_by_date ON scores (play_date, game)`,
  `CREATE TABLE IF NOT EXISTS daily_results (
    play_date     TEXT NOT NULL,
    game          TEXT NOT NULL,
    winners_json  TEXT NOT NULL,
    winning_score INTEGER NOT NULL,
    finalized_at  TEXT NOT NULL,
    finalized_by  TEXT NOT NULL,
    PRIMARY KEY (play_date, game)
  )`,
  `CREATE TABLE IF NOT EXISTS grand_slams (
    play_date    TEXT NOT NULL,
    user_id      TEXT NOT NULL,
    display_name TEXT NOT NULL,
    recorded_at  TEXT NOT NULL,
    PRIMARY KEY (play_date, user_id)
  )`,
];
