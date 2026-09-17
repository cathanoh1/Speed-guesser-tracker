import { createClient } from '@libsql/client';
import { beforeEach, describe, expect, it } from 'vitest';
import { SCHEMA_STATEMENTS } from '../src/db/schema';
import { evaluateAndFinalize } from '../src/domain/finalize';
import { ScoreStore } from '../src/domain/store';

const DATE = '2026-09-17';

let store: ScoreStore;

beforeEach(async () => {
  const client = createClient({ url: ':memory:' });
  await client.migrate(SCHEMA_STATEMENTS);
  store = new ScoreStore(client);
  await store.upsertPlayer('u1', 'Alice');
  await store.upsertPlayer('u2', 'Bob');
  await store.upsertPlayer('u3', 'Cathan');
});

async function submit(userId: string, displayName: string, game: 'timeguesser' | 'speedquiz', score: number) {
  await store.recordScore({
    playDate: DATE,
    game,
    userId,
    displayName,
    score,
    screenshotUrl: 'https://example.com/proof.png',
    submittedAt: `${DATE}T09:00:00Z`,
  });
}

describe('evaluateAndFinalize', () => {
  it('does nothing while submissions are incomplete', async () => {
    await submit('u1', 'Alice', 'timeguesser', 100);
    await submit('u2', 'Bob', 'timeguesser', 200);

    const outcome = await evaluateAndFinalize(store, DATE);
    expect(outcome.newlyFinalized).toEqual([]);
    expect(await store.getDailyResult(DATE, 'timeguesser')).toBeNull();
  });

  it('finalizes a game the moment every active player has submitted', async () => {
    await submit('u1', 'Alice', 'timeguesser', 100);
    await submit('u2', 'Bob', 'timeguesser', 300);
    await submit('u3', 'Cathan', 'timeguesser', 200);

    const outcome = await evaluateAndFinalize(store, DATE);
    expect(outcome.newlyFinalized).toHaveLength(1);
    expect(outcome.newlyFinalized[0].result.winners).toEqual([{ userId: 'u2', displayName: 'Bob' }]);
    expect(outcome.newlyFinalized[0].result.winningScore).toBe(300);
  });

  it('is idempotent - calling again after finalization changes nothing', async () => {
    await submit('u1', 'Alice', 'timeguesser', 100);
    await submit('u2', 'Bob', 'timeguesser', 300);
    await submit('u3', 'Cathan', 'timeguesser', 200);
    await evaluateAndFinalize(store, DATE);

    const second = await evaluateAndFinalize(store, DATE);
    expect(second.newlyFinalized).toEqual([]);
  });

  it('records a Grand Slam only once both games are finalized for the same winner', async () => {
    await submit('u1', 'Alice', 'timeguesser', 100);
    await submit('u2', 'Bob', 'timeguesser', 300);
    await submit('u3', 'Cathan', 'timeguesser', 200);
    let outcome = await evaluateAndFinalize(store, DATE);
    expect(outcome.newGrandSlams).toEqual([]); // speedquiz not finalized yet

    await submit('u1', 'Alice', 'speedquiz', 500);
    await submit('u2', 'Bob', 'speedquiz', 900); // Bob wins both
    await submit('u3', 'Cathan', 'speedquiz', 700);
    outcome = await evaluateAndFinalize(store, DATE);

    expect(outcome.newGrandSlams).toEqual([{ userId: 'u2', displayName: 'Bob' }]);
    expect(await store.listGrandSlams({ playDate: DATE })).toHaveLength(1);
  });

  it('does not grant a Grand Slam when different players win each game', async () => {
    await submit('u1', 'Alice', 'timeguesser', 300);
    await submit('u2', 'Bob', 'timeguesser', 100);
    await submit('u3', 'Cathan', 'timeguesser', 200);
    await submit('u1', 'Alice', 'speedquiz', 100);
    await submit('u2', 'Bob', 'speedquiz', 900);
    await submit('u3', 'Cathan', 'speedquiz', 200);

    const outcome = await evaluateAndFinalize(store, DATE);
    expect(outcome.newGrandSlams).toEqual([]);
  });

  it('force-finalizes a game with forceGame even if players are missing', async () => {
    await submit('u1', 'Alice', 'timeguesser', 100);
    await submit('u2', 'Bob', 'timeguesser', 300);
    // u3 (Cathan) never submits.

    const outcome = await evaluateAndFinalize(store, DATE, 'manual', 'timeguesser');
    expect(outcome.newlyFinalized).toHaveLength(1);
    expect(outcome.newlyFinalized[0].result.finalizedBy).toBe('manual');
    expect(outcome.newlyFinalized[0].result.winners).toEqual([{ userId: 'u2', displayName: 'Bob' }]);
  });

  it('forceGame is a no-op when there are no scores at all', async () => {
    const outcome = await evaluateAndFinalize(store, DATE, 'manual', 'timeguesser');
    expect(outcome.newlyFinalized).toEqual([]);
  });
});
