import type { Client, Row } from '@libsql/client';
import type { DailyResult, FinalizedBy, Game, GrandSlam, Player, PlayerRef, ScoreEntry } from './types';

function rowToPlayer(row: Row): Player {
  return {
    userId: String(row.user_id),
    displayName: String(row.display_name),
    active: Number(row.active) === 1,
    joinedAt: String(row.joined_at),
  };
}

function rowToScore(row: Row): ScoreEntry {
  return {
    playDate: String(row.play_date),
    game: row.game as Game,
    userId: String(row.user_id),
    displayName: String(row.display_name),
    score: Number(row.score),
    screenshotUrl: String(row.screenshot_url),
    submittedAt: String(row.submitted_at),
  };
}

function rowToDailyResult(row: Row): DailyResult {
  return {
    playDate: String(row.play_date),
    game: row.game as Game,
    winners: JSON.parse(String(row.winners_json)) as PlayerRef[],
    winningScore: Number(row.winning_score),
    finalizedAt: String(row.finalized_at),
    finalizedBy: row.finalized_by as FinalizedBy,
  };
}

function rowToGrandSlam(row: Row): GrandSlam {
  return {
    playDate: String(row.play_date),
    userId: String(row.user_id),
    displayName: String(row.display_name),
    recordedAt: String(row.recorded_at),
  };
}

/**
 * Thin, typed wrapper around the libsql tables. Takes a `Client` instance
 * rather than opening its own connection, so tests can pass a throwaway
 * local database and the app can pass the shared Turso client.
 */
export class ScoreStore {
  constructor(private readonly db: Client) {}

  // ---- players -----------------------------------------------------------

  /** Inserts a new player as active, or refreshes an existing player's display name. */
  async upsertPlayer(userId: string, displayName: string): Promise<Player> {
    const now = new Date().toISOString();
    await this.db.execute({
      sql: `INSERT INTO players (user_id, display_name, active, joined_at)
            VALUES ($userId, $displayName, 1, $now)
            ON CONFLICT(user_id) DO UPDATE SET display_name = excluded.display_name`,
      args: { userId, displayName, now },
    });
    return (await this.getPlayer(userId))!;
  }

  async setPlayerActive(userId: string, active: boolean): Promise<void> {
    await this.db.execute({
      sql: `UPDATE players SET active = $active WHERE user_id = $userId`,
      args: { active: active ? 1 : 0, userId },
    });
  }

  async getPlayer(userId: string): Promise<Player | null> {
    const result = await this.db.execute({
      sql: `SELECT * FROM players WHERE user_id = $userId`,
      args: { userId },
    });
    return result.rows[0] ? rowToPlayer(result.rows[0]) : null;
  }

  async listActivePlayers(): Promise<Player[]> {
    const result = await this.db.execute(
      `SELECT * FROM players WHERE active = 1 ORDER BY display_name COLLATE NOCASE`,
    );
    return result.rows.map(rowToPlayer);
  }

  async listAllPlayers(): Promise<Player[]> {
    const result = await this.db.execute(`SELECT * FROM players ORDER BY display_name COLLATE NOCASE`);
    return result.rows.map(rowToPlayer);
  }

  // ---- scores -------------------------------------------------------------

  /** Upserts today's score for this player+game. Returns the prior entry, if any. */
  async recordScore(entry: ScoreEntry): Promise<{ previous: ScoreEntry | null }> {
    const previous = await this.getScore(entry.playDate, entry.game, entry.userId);
    await this.db.execute({
      sql: `INSERT INTO scores (play_date, game, user_id, display_name, score, screenshot_url, submitted_at)
            VALUES ($playDate, $game, $userId, $displayName, $score, $screenshotUrl, $submittedAt)
            ON CONFLICT(play_date, game, user_id) DO UPDATE SET
              display_name   = excluded.display_name,
              score          = excluded.score,
              screenshot_url = excluded.screenshot_url,
              submitted_at   = excluded.submitted_at`,
      args: {
        playDate: entry.playDate,
        game: entry.game,
        userId: entry.userId,
        displayName: entry.displayName,
        score: entry.score,
        screenshotUrl: entry.screenshotUrl,
        submittedAt: entry.submittedAt,
      },
    });
    return { previous };
  }

  async removeScore(playDate: string, game: Game, userId: string): Promise<boolean> {
    const result = await this.db.execute({
      sql: `DELETE FROM scores WHERE play_date = $playDate AND game = $game AND user_id = $userId`,
      args: { playDate, game, userId },
    });
    return result.rowsAffected > 0;
  }

  async getScore(playDate: string, game: Game, userId: string): Promise<ScoreEntry | null> {
    const result = await this.db.execute({
      sql: `SELECT * FROM scores WHERE play_date = $playDate AND game = $game AND user_id = $userId`,
      args: { playDate, game, userId },
    });
    return result.rows[0] ? rowToScore(result.rows[0]) : null;
  }

  /** All scores for a date, optionally narrowed to one game. */
  async getScoresForDate(playDate: string, game?: Game): Promise<ScoreEntry[]> {
    const result = game
      ? await this.db.execute({
          sql: `SELECT * FROM scores WHERE play_date = $playDate AND game = $game`,
          args: { playDate, game },
        })
      : await this.db.execute({
          sql: `SELECT * FROM scores WHERE play_date = $playDate`,
          args: { playDate },
        });
    return result.rows.map(rowToScore);
  }

  // ---- daily results (finalized winners) -----------------------------------

  async saveDailyResult(result: DailyResult): Promise<void> {
    await this.db.execute({
      sql: `INSERT INTO daily_results (play_date, game, winners_json, winning_score, finalized_at, finalized_by)
            VALUES ($playDate, $game, $winnersJson, $winningScore, $finalizedAt, $finalizedBy)
            ON CONFLICT(play_date, game) DO UPDATE SET
              winners_json  = excluded.winners_json,
              winning_score = excluded.winning_score,
              finalized_at  = excluded.finalized_at,
              finalized_by  = excluded.finalized_by`,
      args: {
        playDate: result.playDate,
        game: result.game,
        winnersJson: JSON.stringify(result.winners),
        winningScore: result.winningScore,
        finalizedAt: result.finalizedAt,
        finalizedBy: result.finalizedBy,
      },
    });
  }

  async getDailyResult(playDate: string, game: Game): Promise<DailyResult | null> {
    const result = await this.db.execute({
      sql: `SELECT * FROM daily_results WHERE play_date = $playDate AND game = $game`,
      args: { playDate, game },
    });
    return result.rows[0] ? rowToDailyResult(result.rows[0]) : null;
  }

  /** Deletes a finalized result so the day can be reopened (admin escape hatch). */
  async deleteDailyResult(playDate: string, game: Game): Promise<boolean> {
    const result = await this.db.execute({
      sql: `DELETE FROM daily_results WHERE play_date = $playDate AND game = $game`,
      args: { playDate, game },
    });
    return result.rowsAffected > 0;
  }

  async listDailyResults(opts: { game?: Game; limit?: number } = {}): Promise<DailyResult[]> {
    let sql = `SELECT * FROM daily_results`;
    const conditions: string[] = [];
    const args: Record<string, string | number> = {};
    if (opts.game) {
      conditions.push(`game = $game`);
      args.game = opts.game;
    }
    if (conditions.length) sql += ` WHERE ${conditions.join(' AND ')}`;
    sql += ` ORDER BY play_date DESC`;
    if (opts.limit) {
      sql += ` LIMIT $limit`;
      args.limit = opts.limit;
    }
    const result = await this.db.execute({ sql, args });
    return result.rows.map(rowToDailyResult);
  }

  // ---- grand slams ----------------------------------------------------------

  async saveGrandSlam(slam: GrandSlam): Promise<void> {
    await this.db.execute({
      sql: `INSERT INTO grand_slams (play_date, user_id, display_name, recorded_at)
            VALUES ($playDate, $userId, $displayName, $recordedAt)
            ON CONFLICT(play_date, user_id) DO UPDATE SET
              display_name = excluded.display_name,
              recorded_at  = excluded.recorded_at`,
      args: {
        playDate: slam.playDate,
        userId: slam.userId,
        displayName: slam.displayName,
        recordedAt: slam.recordedAt,
      },
    });
  }

  async listGrandSlams(opts: { playDate?: string } = {}): Promise<GrandSlam[]> {
    const result = opts.playDate
      ? await this.db.execute({
          sql: `SELECT * FROM grand_slams WHERE play_date = $playDate`,
          args: { playDate: opts.playDate },
        })
      : await this.db.execute(`SELECT * FROM grand_slams`);
    return result.rows.map(rowToGrandSlam);
  }
}
