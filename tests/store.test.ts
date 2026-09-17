import Database from 'better-sqlite3';
import { beforeEach, describe, expect, it } from 'vitest';
import { SCHEMA_SQL } from '../src/db/schema';
import { ScoreStore } from '../src/domain/store';
import type { ScoreEntry } from '../src/domain/types';

const CONV = 'conv-1';

function makeStore(): ScoreStore {
  const db = new Database(':memory:');
  db.exec(SCHEMA_SQL);
  return new ScoreStore(db);
}

function entry(overrides: Partial<ScoreEntry> = {}): ScoreEntry {
  return {
    conversationId: CONV,
    playDate: '2026-09-17',
    game: 'timeguesser',
    userId: 'u1',
    displayName: 'Alice',
    score: 100,
    source: 'manual',
    rawConfidence: null,
    submittedAt: '2026-09-17T09:00:00Z',
    ...overrides,
  };
}

let store: ScoreStore;

beforeEach(() => {
  store = makeStore();
});

describe('players', () => {
  it('creates a new player as active', () => {
    const player = store.upsertPlayer(CONV, 'u1', 'Alice');
    expect(player).toMatchObject({ userId: 'u1', displayName: 'Alice', active: true });
  });

  it('refreshes display name without resetting an inactive player back to active', () => {
    store.upsertPlayer(CONV, 'u1', 'Alice');
    store.setPlayerActive(CONV, 'u1', false);

    const refreshed = store.upsertPlayer(CONV, 'u1', 'Alice Smith');
    expect(refreshed.displayName).toBe('Alice Smith');
    expect(refreshed.active).toBe(false);
  });

  it('lists only active players, alphabetically', () => {
    store.upsertPlayer(CONV, 'u2', 'Bob');
    store.upsertPlayer(CONV, 'u1', 'Alice');
    store.upsertPlayer(CONV, 'u3', 'Cathan');
    store.setPlayerActive(CONV, 'u2', false);

    const active = store.listActivePlayers(CONV);
    expect(active.map((p) => p.displayName)).toEqual(['Alice', 'Cathan']);
  });

  it('scopes players per conversation', () => {
    store.upsertPlayer(CONV, 'u1', 'Alice');
    store.upsertPlayer('conv-2', 'u1', 'Alice-in-other-group');
    expect(store.listActivePlayers(CONV)).toHaveLength(1);
    expect(store.listActivePlayers('conv-2')).toHaveLength(1);
  });
});

describe('scores', () => {
  it('records a score and returns null previous on first submission', () => {
    const { previous } = store.recordScore(entry());
    expect(previous).toBeNull();
    expect(store.getScore(CONV, '2026-09-17', 'timeguesser', 'u1')?.score).toBe(100);
  });

  it('returns the prior entry when overwriting a score', () => {
    store.recordScore(entry({ score: 100 }));
    const { previous } = store.recordScore(entry({ score: 150 }));
    expect(previous?.score).toBe(100);
    expect(store.getScore(CONV, '2026-09-17', 'timeguesser', 'u1')?.score).toBe(150);
  });

  it('keeps timeguesser and speedquiz scores independent for the same player+day', () => {
    store.recordScore(entry({ game: 'timeguesser', score: 100 }));
    store.recordScore(entry({ game: 'speedquiz', score: 900 }));
    const scores = store.getScoresForDate(CONV, '2026-09-17');
    expect(scores).toHaveLength(2);
  });

  it('removes a score and reports whether one existed', () => {
    store.recordScore(entry());
    expect(store.removeScore(CONV, '2026-09-17', 'timeguesser', 'u1')).toBe(true);
    expect(store.removeScore(CONV, '2026-09-17', 'timeguesser', 'u1')).toBe(false);
    expect(store.getScore(CONV, '2026-09-17', 'timeguesser', 'u1')).toBeNull();
  });

  it('filters getScoresForDate by game when asked', () => {
    store.recordScore(entry({ game: 'timeguesser' }));
    store.recordScore(entry({ game: 'speedquiz', userId: 'u2', displayName: 'Bob' }));
    expect(store.getScoresForDate(CONV, '2026-09-17', 'timeguesser')).toHaveLength(1);
  });
});

describe('daily results and grand slams', () => {
  it('saves and retrieves a finalized result with its winners', () => {
    store.saveDailyResult({
      conversationId: CONV,
      playDate: '2026-09-17',
      game: 'timeguesser',
      winners: [{ userId: 'u1', displayName: 'Alice' }],
      winningScore: 500,
      finalizedAt: '2026-09-17T12:00:00Z',
      finalizedBy: 'auto',
    });
    const result = store.getDailyResult(CONV, '2026-09-17', 'timeguesser');
    expect(result?.winners).toEqual([{ userId: 'u1', displayName: 'Alice' }]);
    expect(store.getDailyResult(CONV, '2026-09-17', 'speedquiz')).toBeNull();
  });

  it('deleteDailyResult reopens a finalized day', () => {
    store.saveDailyResult({
      conversationId: CONV,
      playDate: '2026-09-17',
      game: 'timeguesser',
      winners: [{ userId: 'u1', displayName: 'Alice' }],
      winningScore: 500,
      finalizedAt: '2026-09-17T12:00:00Z',
      finalizedBy: 'auto',
    });
    expect(store.deleteDailyResult(CONV, '2026-09-17', 'timeguesser')).toBe(true);
    expect(store.getDailyResult(CONV, '2026-09-17', 'timeguesser')).toBeNull();
  });

  it('records and lists grand slams, optionally filtered by date', () => {
    store.saveGrandSlam({ conversationId: CONV, playDate: '2026-09-16', userId: 'u1', displayName: 'Alice', recordedAt: 'x' });
    store.saveGrandSlam({ conversationId: CONV, playDate: '2026-09-17', userId: 'u2', displayName: 'Bob', recordedAt: 'y' });
    expect(store.listGrandSlams(CONV)).toHaveLength(2);
    expect(store.listGrandSlams(CONV, { playDate: '2026-09-17' })).toHaveLength(1);
  });
});

describe('conversations', () => {
  it('tracks last-seen conversations and keeps the latest known display name', () => {
    store.touchConversation(CONV, 'Office Banter');
    store.touchConversation(CONV, null);
    const [conversation] = store.listConversations();
    expect(conversation.displayName).toBe('Office Banter');
  });
});
