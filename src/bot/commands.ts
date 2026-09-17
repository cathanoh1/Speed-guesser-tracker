import type { Game } from '../domain/types';

const GAME_ALIASES: Record<string, Game> = {
  timeguesser: 'timeguesser',
  timeguessr: 'timeguesser',
  tg: 'timeguesser',
  'time-guesser': 'timeguesser',
  'time guesser': 'timeguesser',
  speedquiz: 'speedquiz',
  sq: 'speedquiz',
  'speed-quiz': 'speedquiz',
  'speed quiz': 'speedquiz',
};

export function normalizeGameName(input: string): Game | null {
  return GAME_ALIASES[input.trim().toLowerCase()] ?? null;
}

/** Parses "42,150" / "42150" / "42150.0" into a non-negative integer, or null if invalid. */
export function parseScoreNumber(raw: string): number | null {
  const cleaned = raw.replace(/,/g, '').trim();
  if (!/^\d+(\.\d+)?$/.test(cleaned)) return null;
  const value = Number(cleaned);
  if (!Number.isFinite(value) || value < 0) return null;
  return Math.round(value);
}

export type Command =
  | { type: 'help' }
  | { type: 'join' }
  | { type: 'leave' }
  | { type: 'players' }
  | { type: 'status' }
  | { type: 'leaderboard' }
  | { type: 'score'; game: Game; score: number }
  | { type: 'undo'; game: Game }
  | { type: 'finalize'; game: Game }
  | { type: 'unknown'; raw: string };

/** Parses one line of chat text (with any @mention already stripped) into a Command. */
export function parseCommand(text: string): Command {
  const cleaned = text.trim();
  if (!cleaned) return { type: 'unknown', raw: text };

  const parts = cleaned.split(/\s+/);
  const head = parts[0].toLowerCase();

  switch (head) {
    case 'help':
    case '?':
      return { type: 'help' };
    case 'join':
    case 'in':
      return { type: 'join' };
    case 'leave':
    case 'out':
      return { type: 'leave' };
    case 'players':
    case 'roster':
      return { type: 'players' };
    case 'status':
      return { type: 'status' };
    case 'leaderboard':
    case 'standings':
      return { type: 'leaderboard' };
    case 'score':
    case 'submit': {
      if (parts.length < 3) return { type: 'unknown', raw: text };
      const game = normalizeGameName(parts[1]);
      const score = parseScoreNumber(parts[2]);
      if (!game || score === null) return { type: 'unknown', raw: text };
      return { type: 'score', game, score };
    }
    case 'undo':
    case 'remove': {
      if (parts.length < 2) return { type: 'unknown', raw: text };
      const game = normalizeGameName(parts[1]);
      if (!game) return { type: 'unknown', raw: text };
      return { type: 'undo', game };
    }
    case 'finalize':
    case 'close': {
      if (parts.length < 2) return { type: 'unknown', raw: text };
      const game = normalizeGameName(parts[1]);
      if (!game) return { type: 'unknown', raw: text };
      return { type: 'finalize', game };
    }
    default: {
      // Allow the bare shorthand "timeguesser 42150" without a leading "score".
      if (parts.length === 2) {
        const game = normalizeGameName(parts[0]);
        const score = parseScoreNumber(parts[1]);
        if (game && score !== null) return { type: 'score', game, score };
      }
      return { type: 'unknown', raw: text };
    }
  }
}
