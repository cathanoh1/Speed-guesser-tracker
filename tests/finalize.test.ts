import Database from 'better-sqlite3';
import { beforeEach, describe, expect, it } from 'vitest';
import { SCHEMA_SQL } from '../src/db/schema';
import { evaluateAndFinalize } from '../src/domain/finalize';
import { ScoreStore } from '../src/domain/store';

const CONV = 'conv-1';
const DATE = '2026-09-17';

let store: ScoreStore;

beforeEach(() => {
  const db = new Database(':memory:');
  db.exec(SCHEMA_SQL);
  store = new ScoreStore(db);
  store.upsertPlayer(CONV, 'u1', 'Alice');
  store.upsertPlayer(CONV, 'u2', 'Bob');
  store.upsertPlayer(CONV, 'u3', 'Cathan');
});

function submit(userId: string, displayName: string, game: 'timeguesser' | 'speedquiz', score: number): void {
  store.recordScore({
    conversationId: CONV,
    playDate: DATE,
    game,
    userId,
    displayName,
    score,
    source: 'manual',
    rawConfidence: null,
    submittedAt: `${DATE}T09:00:00Z`,
  });
}

describe('evaluateAndFinalize', () => {
  it('does nothing while submissions are incomplete', () => {
    submit('u1', 'Alice', 'timeguesser', 100);
    submit('u2', 'Bob', 'timeguesser', 200);

    const outcome = evaluateAndFinalize(store, CONV, DATE);
    expect(outcome.newlyFinalized).toEqual([]);
    expect(store.getDailyResult(CONV, DATE, 'timeguesser')).toBeNull();
  });

  it('finalizes a game the moment every active player has submitted', () => {
    submit('u1', 'Alice', 'timeguesser', 100);
    submit('u2', 'Bob', 'timeguesser', 300);
    submit('u3', 'Cathan', 'timeguesser', 200);

    const outcome = evaluateAndFinalize(store, CONV, DATE);
    expect(outcome.newlyFinalized).toHaveLength(1);
    expect(outcome.newlyFinalized[0].result.winners).toEqual([{ userId: 'u2', displayName: 'Bob' }]);
    expect(outcome.newlyFinalized[0].result.winningScore).toBe(300);
  });

  it('is idempotent - calling again after finalization changes nothing', () => {
    submit('u1', 'Alice', 'timeguesser', 100);
    submit('u2', 'Bob', 'timeguesser', 300);
    submit('u3', 'Cathan', 'timeguesser', 200);
    evaluateAndFinalize(store, CONV, DATE);

    const second = evaluateAndFinalize(store, CONV, DATE);
    expect(second.newlyFinalized).toEqual([]);
  });

  it('records a Grand Slam only once both games are finalized for the same winner', () => {
    submit('u1', 'Alice', 'timeguesser', 100);
    submit('u2', 'Bob', 'timeguesser', 300);
    submit('u3', 'Cathan', 'timeguesser', 200);
    let outcome = evaluateAndFinalize(store, CONV, DATE);
    expect(outcome.newGrandSlams).toEqual([]); // speedquiz not finalized yet

    submit('u1', 'Alice', 'speedquiz', 500);
    submit('u2', 'Bob', 'speedquiz', 900); // Bob wins both
    submit('u3', 'Cathan', 'speedquiz', 700);
    outcome = evaluateAndFinalize(store, CONV, DATE);

    expect(outcome.newGrandSlams).toEqual([{ userId: 'u2', displayName: 'Bob' }]);
    expect(store.listGrandSlams(CONV, { playDate: DATE })).toHaveLength(1);
  });

  it('does not grant a Grand Slam when different players win each game', () => {
    submit('u1', 'Alice', 'timeguesser', 300);
    submit('u2', 'Bob', 'timeguesser', 100);
    submit('u3', 'Cathan', 'timeguesser', 200);
    submit('u1', 'Alice', 'speedquiz', 100);
    submit('u2', 'Bob', 'speedquiz', 900);
    submit('u3', 'Cathan', 'speedquiz', 200);

    const outcome = evaluateAndFinalize(store, CONV, DATE);
    expect(outcome.newGrandSlams).toEqual([]);
  });

  it('force-finalizes a game with forceGame even if players are missing', () => {
    submit('u1', 'Alice', 'timeguesser', 100);
    submit('u2', 'Bob', 'timeguesser', 300);
    // u3 (Cathan) never submits.

    const outcome = evaluateAndFinalize(store, CONV, DATE, 'manual', 'timeguesser');
    expect(outcome.newlyFinalized).toHaveLength(1);
    expect(outcome.newlyFinalized[0].result.finalizedBy).toBe('manual');
    expect(outcome.newlyFinalized[0].result.winners).toEqual([{ userId: 'u2', displayName: 'Bob' }]);
  });

  it('forceGame is a no-op when there are no scores at all', () => {
    const outcome = evaluateAndFinalize(store, CONV, DATE, 'manual', 'timeguesser');
    expect(outcome.newlyFinalized).toEqual([]);
  });
});
