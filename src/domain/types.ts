export type Game = 'timeguesser' | 'speedquiz';

export const GAMES: Game[] = ['timeguesser', 'speedquiz'];

export const GAME_LABELS: Record<Game, string> = {
  timeguesser: 'TimeGuesser',
  speedquiz: 'Speed Quiz',
};

export type FinalizedBy = 'auto' | 'manual';

export interface Player {
  userId: string;
  displayName: string;
  active: boolean;
  joinedAt: string;
}

export interface ScoreEntry {
  playDate: string;
  game: Game;
  userId: string;
  displayName: string;
  score: number;
  /** URL of the screenshot submitted as proof - every score requires one. */
  screenshotUrl: string;
  submittedAt: string;
}

export interface PlayerRef {
  userId: string;
  displayName: string;
}

export interface DailyResult {
  playDate: string;
  game: Game;
  winners: PlayerRef[];
  winningScore: number;
  finalizedAt: string;
  finalizedBy: FinalizedBy;
}

export interface GrandSlam {
  playDate: string;
  userId: string;
  displayName: string;
  recordedAt: string;
}
