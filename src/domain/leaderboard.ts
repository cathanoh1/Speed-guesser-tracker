import { GAMES, type DailyResult, type Game, type GrandSlam, type Player, type PlayerRef, type ScoreEntry } from './types';

/**
 * Pure scoring/standings logic, deliberately free of any database or bot
 * dependency so it can be unit tested directly against plain objects.
 */

export interface GameStatus {
  game: Game;
  /** Submitted entries, highest score first. */
  submitted: { userId: string; displayName: string; score: number }[];
  /** Active players who have not yet submitted a score for this game today. */
  missing: PlayerRef[];
  /** True once every active player has submitted and there is at least one score. */
  readyToFinalize: boolean;
}

export interface DailyStatus {
  playDate: string;
  games: Record<Game, GameStatus>;
}

/** Builds today's per-game submission status from the active roster and today's scores. */
export function computeDailyStatus(
  activePlayers: Player[],
  scoresToday: ScoreEntry[],
  playDate: string,
): DailyStatus {
  const games = {} as Record<Game, GameStatus>;

  for (const game of GAMES) {
    const submittedEntries = scoresToday.filter((s) => s.game === game);
    const submittedIds = new Set(submittedEntries.map((s) => s.userId));
    const missing = activePlayers
      .filter((p) => !submittedIds.has(p.userId))
      .map((p) => ({ userId: p.userId, displayName: p.displayName }));

    games[game] = {
      game,
      submitted: submittedEntries
        .map((s) => ({ userId: s.userId, displayName: s.displayName, score: s.score }))
        .sort((a, b) => b.score - a.score),
      missing,
      readyToFinalize: activePlayers.length > 0 && missing.length === 0 && submittedEntries.length > 0,
    };
  }

  return { playDate, games };
}

export interface WinnerResult {
  winners: PlayerRef[];
  winningScore: number;
}

/** Highest score wins; ties produce multiple joint winners. Null when nobody has scored. */
export function computeWinners(scoresForGame: ScoreEntry[]): WinnerResult | null {
  if (scoresForGame.length === 0) return null;
  const winningScore = Math.max(...scoresForGame.map((s) => s.score));
  const winners = scoresForGame
    .filter((s) => s.score === winningScore)
    .map((s) => ({ userId: s.userId, displayName: s.displayName }));
  return { winners, winningScore };
}

/** A player is a Grand Slam winner if they're a winner of both finalized games on the same day. */
export function computeGrandSlamWinners(
  timeguesserResult: DailyResult | null,
  speedQuizResult: DailyResult | null,
): PlayerRef[] {
  if (!timeguesserResult || !speedQuizResult) return [];
  const speedQuizWinnerIds = new Set(speedQuizResult.winners.map((w) => w.userId));
  return timeguesserResult.winners.filter((w) => speedQuizWinnerIds.has(w.userId));
}

export interface StandingsRow {
  userId: string;
  displayName: string;
  timeguesserWins: number;
  speedquizWins: number;
  grandSlams: number;
  totalWins: number;
}

/** Aggregates all-time wins and Grand Slams per player, sorted best first. */
export function buildStandings(dailyResults: DailyResult[], grandSlams: GrandSlam[]): StandingsRow[] {
  const rows = new Map<string, StandingsRow>();

  const ensure = (userId: string, displayName: string): StandingsRow => {
    let row = rows.get(userId);
    if (!row) {
      row = { userId, displayName, timeguesserWins: 0, speedquizWins: 0, grandSlams: 0, totalWins: 0 };
      rows.set(userId, row);
    } else {
      row.displayName = displayName;
    }
    return row;
  };

  // Walk oldest-to-newest so the *most recent* display name wins any rename.
  const sortedResults = [...dailyResults].sort((a, b) => a.finalizedAt.localeCompare(b.finalizedAt));
  for (const result of sortedResults) {
    for (const winner of result.winners) {
      const row = ensure(winner.userId, winner.displayName);
      if (result.game === 'timeguesser') row.timeguesserWins += 1;
      else row.speedquizWins += 1;
      row.totalWins += 1;
    }
  }

  const sortedSlams = [...grandSlams].sort((a, b) => a.recordedAt.localeCompare(b.recordedAt));
  for (const slam of sortedSlams) {
    const row = ensure(slam.userId, slam.displayName);
    row.grandSlams += 1;
  }

  return [...rows.values()].sort(
    (a, b) => b.grandSlams - a.grandSlams || b.totalWins - a.totalWins || a.displayName.localeCompare(b.displayName),
  );
}
