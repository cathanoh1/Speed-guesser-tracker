import type Database from 'better-sqlite3';
import type {
  ConversationInfo,
  DailyResult,
  FinalizedBy,
  Game,
  GrandSlam,
  Player,
  PlayerRef,
  ScoreEntry,
} from './types';

interface PlayerRow {
  conversation_id: string;
  user_id: string;
  display_name: string;
  active: number;
  joined_at: string;
}

interface ScoreRow {
  conversation_id: string;
  play_date: string;
  game: Game;
  user_id: string;
  display_name: string;
  score: number;
  source: 'screenshot' | 'manual';
  raw_confidence: string | null;
  submitted_at: string;
}

interface DailyResultRow {
  conversation_id: string;
  play_date: string;
  game: Game;
  winners_json: string;
  winning_score: number;
  finalized_at: string;
  finalized_by: FinalizedBy;
}

interface GrandSlamRow {
  conversation_id: string;
  play_date: string;
  user_id: string;
  display_name: string;
  recorded_at: string;
}

interface ConversationRow {
  conversation_id: string;
  display_name: string | null;
  last_seen_at: string;
}

function rowToPlayer(row: PlayerRow): Player {
  return {
    conversationId: row.conversation_id,
    userId: row.user_id,
    displayName: row.display_name,
    active: Boolean(row.active),
    joinedAt: row.joined_at,
  };
}

function rowToScore(row: ScoreRow): ScoreEntry {
  return {
    conversationId: row.conversation_id,
    playDate: row.play_date,
    game: row.game,
    userId: row.user_id,
    displayName: row.display_name,
    score: row.score,
    source: row.source,
    rawConfidence: (row.raw_confidence as ScoreEntry['rawConfidence']) ?? null,
    submittedAt: row.submitted_at,
  };
}

function rowToDailyResult(row: DailyResultRow): DailyResult {
  return {
    conversationId: row.conversation_id,
    playDate: row.play_date,
    game: row.game,
    winners: JSON.parse(row.winners_json) as PlayerRef[],
    winningScore: row.winning_score,
    finalizedAt: row.finalized_at,
    finalizedBy: row.finalized_by,
  };
}

function rowToGrandSlam(row: GrandSlamRow): GrandSlam {
  return {
    conversationId: row.conversation_id,
    playDate: row.play_date,
    userId: row.user_id,
    displayName: row.display_name,
    recordedAt: row.recorded_at,
  };
}

function rowToConversation(row: ConversationRow): ConversationInfo {
  return {
    conversationId: row.conversation_id,
    displayName: row.display_name,
    lastSeenAt: row.last_seen_at,
  };
}

/**
 * Thin, typed wrapper around the SQLite tables. Takes a `Database.Database`
 * instance rather than opening its own connection, so tests can pass an
 * in-memory database and the app can pass the shared file-backed one.
 */
export class ScoreStore {
  constructor(private readonly db: Database.Database) {}

  // ---- players -----------------------------------------------------------

  /** Inserts a new player as active, or refreshes an existing player's display name. */
  upsertPlayer(conversationId: string, userId: string, displayName: string): Player {
    const now = new Date().toISOString();
    this.db
      .prepare(
        `INSERT INTO players (conversation_id, user_id, display_name, active, joined_at)
         VALUES (@conversationId, @userId, @displayName, 1, @now)
         ON CONFLICT(conversation_id, user_id) DO UPDATE SET
           display_name = excluded.display_name`,
      )
      .run({ conversationId, userId, displayName, now });
    return this.getPlayer(conversationId, userId)!;
  }

  setPlayerActive(conversationId: string, userId: string, active: boolean): void {
    this.db
      .prepare(`UPDATE players SET active = ? WHERE conversation_id = ? AND user_id = ?`)
      .run(active ? 1 : 0, conversationId, userId);
  }

  getPlayer(conversationId: string, userId: string): Player | null {
    const row = this.db
      .prepare(`SELECT * FROM players WHERE conversation_id = ? AND user_id = ?`)
      .get(conversationId, userId) as PlayerRow | undefined;
    return row ? rowToPlayer(row) : null;
  }

  listActivePlayers(conversationId: string): Player[] {
    const rows = this.db
      .prepare(
        `SELECT * FROM players WHERE conversation_id = ? AND active = 1 ORDER BY display_name COLLATE NOCASE`,
      )
      .all(conversationId) as PlayerRow[];
    return rows.map(rowToPlayer);
  }

  listAllPlayers(conversationId: string): Player[] {
    const rows = this.db
      .prepare(`SELECT * FROM players WHERE conversation_id = ? ORDER BY display_name COLLATE NOCASE`)
      .all(conversationId) as PlayerRow[];
    return rows.map(rowToPlayer);
  }

  // ---- scores -------------------------------------------------------------

  /** Upserts today's score for this player+game. Returns the prior entry, if any. */
  recordScore(entry: ScoreEntry): { previous: ScoreEntry | null } {
    const previous = this.getScore(entry.conversationId, entry.playDate, entry.game, entry.userId);
    this.db
      .prepare(
        `INSERT INTO scores (conversation_id, play_date, game, user_id, display_name, score, source, raw_confidence, submitted_at)
         VALUES (@conversationId, @playDate, @game, @userId, @displayName, @score, @source, @rawConfidence, @submittedAt)
         ON CONFLICT(conversation_id, play_date, game, user_id) DO UPDATE SET
           display_name   = excluded.display_name,
           score          = excluded.score,
           source         = excluded.source,
           raw_confidence = excluded.raw_confidence,
           submitted_at   = excluded.submitted_at`,
      )
      .run({
        conversationId: entry.conversationId,
        playDate: entry.playDate,
        game: entry.game,
        userId: entry.userId,
        displayName: entry.displayName,
        score: entry.score,
        source: entry.source,
        rawConfidence: entry.rawConfidence,
        submittedAt: entry.submittedAt,
      });
    return { previous };
  }

  /** Removes a player's score for one date+game. Returns true if a row was deleted. */
  removeScore(conversationId: string, playDate: string, game: Game, userId: string): boolean {
    const result = this.db
      .prepare(
        `DELETE FROM scores WHERE conversation_id = ? AND play_date = ? AND game = ? AND user_id = ?`,
      )
      .run(conversationId, playDate, game, userId);
    return result.changes > 0;
  }

  getScore(conversationId: string, playDate: string, game: Game, userId: string): ScoreEntry | null {
    const row = this.db
      .prepare(
        `SELECT * FROM scores WHERE conversation_id = ? AND play_date = ? AND game = ? AND user_id = ?`,
      )
      .get(conversationId, playDate, game, userId) as ScoreRow | undefined;
    return row ? rowToScore(row) : null;
  }

  /** All scores for a date, optionally narrowed to one game. */
  getScoresForDate(conversationId: string, playDate: string, game?: Game): ScoreEntry[] {
    const rows = game
      ? (this.db
          .prepare(`SELECT * FROM scores WHERE conversation_id = ? AND play_date = ? AND game = ?`)
          .all(conversationId, playDate, game) as ScoreRow[])
      : (this.db
          .prepare(`SELECT * FROM scores WHERE conversation_id = ? AND play_date = ?`)
          .all(conversationId, playDate) as ScoreRow[]);
    return rows.map(rowToScore);
  }

  // ---- daily results (finalized winners) -----------------------------------

  saveDailyResult(result: DailyResult): void {
    this.db
      .prepare(
        `INSERT INTO daily_results (conversation_id, play_date, game, winners_json, winning_score, finalized_at, finalized_by)
         VALUES (@conversationId, @playDate, @game, @winnersJson, @winningScore, @finalizedAt, @finalizedBy)
         ON CONFLICT(conversation_id, play_date, game) DO UPDATE SET
           winners_json  = excluded.winners_json,
           winning_score = excluded.winning_score,
           finalized_at  = excluded.finalized_at,
           finalized_by  = excluded.finalized_by`,
      )
      .run({
        conversationId: result.conversationId,
        playDate: result.playDate,
        game: result.game,
        winnersJson: JSON.stringify(result.winners),
        winningScore: result.winningScore,
        finalizedAt: result.finalizedAt,
        finalizedBy: result.finalizedBy,
      });
  }

  getDailyResult(conversationId: string, playDate: string, game: Game): DailyResult | null {
    const row = this.db
      .prepare(
        `SELECT * FROM daily_results WHERE conversation_id = ? AND play_date = ? AND game = ?`,
      )
      .get(conversationId, playDate, game) as DailyResultRow | undefined;
    return row ? rowToDailyResult(row) : null;
  }

  /** Deletes a finalized result so the day can be reopened (admin escape hatch). */
  deleteDailyResult(conversationId: string, playDate: string, game: Game): boolean {
    const result = this.db
      .prepare(`DELETE FROM daily_results WHERE conversation_id = ? AND play_date = ? AND game = ?`)
      .run(conversationId, playDate, game);
    return result.changes > 0;
  }

  listDailyResults(conversationId: string, opts: { game?: Game; limit?: number } = {}): DailyResult[] {
    let sql = `SELECT * FROM daily_results WHERE conversation_id = ?`;
    const params: unknown[] = [conversationId];
    if (opts.game) {
      sql += ` AND game = ?`;
      params.push(opts.game);
    }
    sql += ` ORDER BY play_date DESC`;
    if (opts.limit) {
      sql += ` LIMIT ?`;
      params.push(opts.limit);
    }
    const rows = this.db.prepare(sql).all(...params) as DailyResultRow[];
    return rows.map(rowToDailyResult);
  }

  // ---- grand slams ----------------------------------------------------------

  saveGrandSlam(slam: GrandSlam): void {
    this.db
      .prepare(
        `INSERT INTO grand_slams (conversation_id, play_date, user_id, display_name, recorded_at)
         VALUES (@conversationId, @playDate, @userId, @displayName, @recordedAt)
         ON CONFLICT(conversation_id, play_date, user_id) DO UPDATE SET
           display_name = excluded.display_name,
           recorded_at  = excluded.recorded_at`,
      )
      .run(slam);
  }

  listGrandSlams(conversationId: string, opts: { playDate?: string } = {}): GrandSlam[] {
    const rows = opts.playDate
      ? (this.db
          .prepare(`SELECT * FROM grand_slams WHERE conversation_id = ? AND play_date = ?`)
          .all(conversationId, opts.playDate) as GrandSlamRow[])
      : (this.db
          .prepare(`SELECT * FROM grand_slams WHERE conversation_id = ?`)
          .all(conversationId) as GrandSlamRow[]);
    return rows.map(rowToGrandSlam);
  }

  // ---- conversations (for the multi-group web dashboard) ---------------------

  touchConversation(conversationId: string, displayName?: string | null): void {
    const now = new Date().toISOString();
    this.db
      .prepare(
        `INSERT INTO conversations (conversation_id, display_name, last_seen_at)
         VALUES (@conversationId, @displayName, @now)
         ON CONFLICT(conversation_id) DO UPDATE SET
           display_name = COALESCE(excluded.display_name, conversations.display_name),
           last_seen_at = excluded.last_seen_at`,
      )
      .run({ conversationId, displayName: displayName ?? null, now });
  }

  listConversations(): ConversationInfo[] {
    const rows = this.db
      .prepare(`SELECT * FROM conversations ORDER BY last_seen_at DESC`)
      .all() as ConversationRow[];
    return rows.map(rowToConversation);
  }
}
