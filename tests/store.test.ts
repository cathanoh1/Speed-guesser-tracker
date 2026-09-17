import { createClient } from '@libsql/client';
import { beforeEach, describe, expect, it } from 'vitest';
import { SCHEMA_STATEMENTS } from '../src/db/schema';
import { ScoreStore } from '../src/domain/store';
import type { ScoreEntry } from '../src/domain/types';

function entry(overrides: Partial<ScoreEntry> = {}): ScoreEntry {
  return {
    playDate: '2026-09-17',
    game: 'timeguesser',
    userId: 'u1',
    displayName: 'Alice',
    score: 100,
    screenshotUrl: 'https://example.com/proof.png',
    submittedAt: '2026-09-17T09:00:00Z',
    ...overrides,
  };
}

let store: ScoreStore;

beforeEach(async () => {
  const client = createClient({ url: ':memory:' });
  await client.migrate(SCHEMA_STATEMENTS);
  store = new ScoreStore(client);
});

describe('players', () => {
  it('creates a new player as active', async () => {
    const player = await store.upsertPlayer('u1', 'Alice');
    expect(player).toMatchObject({ userId: 'u1', displayName: 'Alice', active: true });
  });

  it('refreshes display name without resetting an inactive player back to active', async () => {
    await store.upsertPlayer('u1', 'Alice');
    await store.setPlayerActive('u1', false);

    const refreshed = await store.upsertPlayer('u1', 'Alice Smith');
    expect(refreshed.displayName).toBe('Alice Smith');
    expect(refreshed.active).toBe(false);
  });

  it('lists only active players, alphabetically', async () => {
    await store.upsertPlayer('u2', 'Bob');
    await store.upsertPlayer('u1', 'Alice');
    await store.upsertPlayer('u3', 'Cathan');
    await store.setPlayerActive('u2', false);

    const active = await store.listActivePlayers();
    expect(active.map((p) => p.displayName)).toEqual(['Alice', 'Cathan']);
  });
});

describe('scores', () => {
  it('records a score and returns null previous on first submission', async () => {
    const { previous } = await store.recordScore(entry());
    expect(previous).toBeNull();
    expect((await store.getScore('2026-09-17', 'timeguesser', 'u1'))?.score).toBe(100);
  });

  it('returns the prior entry when overwriting a score', async () => {
    await store.recordScore(entry({ score: 100 }));
    const { previous } = await store.recordScore(entry({ score: 150 }));
    expect(previous?.score).toBe(100);
    expect((await store.getScore('2026-09-17', 'timeguesser', 'u1'))?.score).toBe(150);
  });

  it('keeps timeguesser and speedquiz scores independent for the same player+day', async () => {
    await store.recordScore(entry({ game: 'timeguesser', score: 100 }));
    await store.recordScore(entry({ game: 'speedquiz', score: 900 }));
    const scores = await store.getScoresForDate('2026-09-17');
    expect(scores).toHaveLength(2);
  });

  it('removes a score and reports whether one existed', async () => {
    await store.recordScore(entry());
    expect(await store.removeScore('2026-09-17', 'timeguesser', 'u1')).toBe(true);
    expect(await store.removeScore('2026-09-17', 'timeguesser', 'u1')).toBe(false);
    expect(await store.getScore('2026-09-17', 'timeguesser', 'u1')).toBeNull();
  });

  it('filters getScoresForDate by game when asked', async () => {
    await store.recordScore(entry({ game: 'timeguesser' }));
    await store.recordScore(entry({ game: 'speedquiz', userId: 'u2', displayName: 'Bob' }));
    expect(await store.getScoresForDate('2026-09-17', 'timeguesser')).toHaveLength(1);
  });
});

describe('daily results and grand slams', () => {
  it('saves and retrieves a finalized result with its winners', async () => {
    await store.saveDailyResult({
      playDate: '2026-09-17',
      game: 'timeguesser',
      winners: [{ userId: 'u1', displayName: 'Alice' }],
      winningScore: 500,
      finalizedAt: '2026-09-17T12:00:00Z',
      finalizedBy: 'auto',
    });
    const result = await store.getDailyResult('2026-09-17', 'timeguesser');
    expect(result?.winners).toEqual([{ userId: 'u1', displayName: 'Alice' }]);
    expect(await store.getDailyResult('2026-09-17', 'speedquiz')).toBeNull();
  });

  it('deleteDailyResult reopens a finalized day', async () => {
    await store.saveDailyResult({
      playDate: '2026-09-17',
      game: 'timeguesser',
      winners: [{ userId: 'u1', displayName: 'Alice' }],
      winningScore: 500,
      finalizedAt: '2026-09-17T12:00:00Z',
      finalizedBy: 'auto',
    });
    expect(await store.deleteDailyResult('2026-09-17', 'timeguesser')).toBe(true);
    expect(await store.getDailyResult('2026-09-17', 'timeguesser')).toBeNull();
  });

  it('records and lists grand slams, optionally filtered by date', async () => {
    await store.saveGrandSlam({ playDate: '2026-09-16', userId: 'u1', displayName: 'Alice', recordedAt: 'x' });
    await store.saveGrandSlam({ playDate: '2026-09-17', userId: 'u2', displayName: 'Bob', recordedAt: 'y' });
    expect(await store.listGrandSlams()).toHaveLength(2);
    expect(await store.listGrandSlams({ playDate: '2026-09-17' })).toHaveLength(1);
  });
});
