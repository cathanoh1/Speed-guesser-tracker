export type Game = 'timeguesser' | 'speedquiz';

export const GAMES: Game[] = ['timeguesser', 'speedquiz'];

export const GAME_LABELS: Record<Game, string> = {
  timeguesser: 'TimeGuesser',
  speedquiz: 'Speed Quiz',
};

export type ScoreSource = 'screenshot' | 'manual';
export type Confidence = 'high' | 'medium' | 'low';
export type FinalizedBy = 'auto' | 'manual';

export interface Player {
  conversationId: string;
  userId: string;
  displayName: string;
  active: boolean;
  joinedAt: string;
}

export interface ScoreEntry {
  conversationId: string;
  playDate: string;
  game: Game;
  userId: string;
  displayName: string;
  score: number;
  source: ScoreSource;
  rawConfidence: Confidence | null;
  submittedAt: string;
}

export interface PlayerRef {
  userId: string;
  displayName: string;
}

export interface DailyResult {
  conversationId: string;
  playDate: string;
  game: Game;
  winners: PlayerRef[];
  winningScore: number;
  finalizedAt: string;
  finalizedBy: FinalizedBy;
}

export interface GrandSlam {
  conversationId: string;
  playDate: string;
  userId: string;
  displayName: string;
  recordedAt: string;
}

export interface ConversationInfo {
  conversationId: string;
  displayName: string | null;
  lastSeenAt: string;
}
