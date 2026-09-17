import { describe, expect, it } from 'vitest';
import {
  buildStandings,
  computeDailyStatus,
  computeGrandSlamWinners,
  computeWinners,
} from '../src/domain/leaderboard';
import type { DailyResult, GrandSlam, Player, ScoreEntry } from '../src/domain/types';

const CONV = 'conv-1';

function player(userId: string, displayName: string, active = true): Player {
  return { conversationId: CONV, userId, displayName, active, joinedAt: '2026-01-01T00:00:00Z' };
}

function score(
  userId: string,
  displayName: string,
  game: ScoreEntry['game'],
  scoreValue: number,
): ScoreEntry {
  return {
    conversationId: CONV,
    playDate: '2026-09-17',
    game,
    userId,
    displayName,
    score: scoreValue,
    source: 'manual',
    rawConfidence: null,
    submittedAt: '2026-09-17T09:00:00Z',
  };
}

describe('computeDailyStatus', () => {
  it('lists who has submitted and who is missing, per game', () => {
    const players = [player('u1', 'Alice'), player('u2', 'Bob'), player('u3', 'Cathan')];
    const scores = [score('u1', 'Alice', 'timeguesser', 100), score('u2', 'Bob', 'timeguesser', 200)];

    const status = computeDailyStatus(players, scores, '2026-09-17');

    expect(status.games.timeguesser.submitted.map((s) => s.userId)).toEqual(['u2', 'u1']); // sorted by score desc
    expect(status.games.timeguesser.missing.map((m) => m.userId)).toEqual(['u3']);
    expect(status.games.timeguesser.readyToFinalize).toBe(false);

    expect(status.games.speedquiz.submitted).toEqual([]);
    expect(status.games.speedquiz.missing.map((m) => m.userId)).toEqual(['u1', 'u2', 'u3']);
  });

  it('is ready to finalize once every active player has submitted', () => {
    const players = [player('u1', 'Alice'), player('u2', 'Bob')];
    const scores = [score('u1', 'Alice', 'timeguesser', 100), score('u2', 'Bob', 'timeguesser', 200)];

    const status = computeDailyStatus(players, scores, '2026-09-17');
    expect(status.games.timeguesser.readyToFinalize).toBe(true);
  });

  it('is never ready to finalize with zero active players, even with zero missing', () => {
    const status = computeDailyStatus([], [], '2026-09-17');
    expect(status.games.timeguesser.readyToFinalize).toBe(false);
    expect(status.games.speedquiz.readyToFinalize).toBe(false);
  });

  it('relies on the caller to have already filtered to active players', () => {
    // computeDailyStatus trusts its `activePlayers` argument as-is - it does
    // not re-check `.active` itself. Excluding inactive Bob here mirrors what
    // store.listActivePlayers() (tested separately) does at the call site.
    const players = [player('u1', 'Alice')];
    const scores = [score('u1', 'Alice', 'timeguesser', 100)];

    const status = computeDailyStatus(players, scores, '2026-09-17');
    expect(status.games.timeguesser.readyToFinalize).toBe(true);
    expect(status.games.timeguesser.missing).toEqual([]);
  });
});

describe('computeWinners', () => {
  it('returns null when nobody has scored', () => {
    expect(computeWinners([])).toBeNull();
  });

  it('picks the single highest score', () => {
    const scores = [score('u1', 'Alice', 'timeguesser', 100), score('u2', 'Bob', 'timeguesser', 200)];
    expect(computeWinners(scores)).toEqual({ winners: [{ userId: 'u2', displayName: 'Bob' }], winningScore: 200 });
  });

  it('produces joint winners on a tie', () => {
    const scores = [
      score('u1', 'Alice', 'timeguesser', 200),
      score('u2', 'Bob', 'timeguesser', 200),
      score('u3', 'Cathan', 'timeguesser', 150),
    ];
    const result = computeWinners(scores);
    expect(result?.winningScore).toBe(200);
    expect(result?.winners.map((w) => w.userId).sort()).toEqual(['u1', 'u2']);
  });
});

describe('computeGrandSlamWinners', () => {
  const tgResult = (winners: string[], score = 500): DailyResult => ({
    conversationId: CONV,
    playDate: '2026-09-17',
    game: 'timeguesser',
    winners: winners.map((id) => ({ userId: id, displayName: id })),
    winningScore: score,
    finalizedAt: '2026-09-17T12:00:00Z',
    finalizedBy: 'auto',
  });
  const sqResult = (winners: string[], score = 500): DailyResult => ({ ...tgResult(winners, score), game: 'speedquiz' });

  it('is empty when either game is not yet finalized', () => {
    expect(computeGrandSlamWinners(null, sqResult(['u1']))).toEqual([]);
    expect(computeGrandSlamWinners(tgResult(['u1']), null)).toEqual([]);
  });

  it('is empty when the two games have different winners', () => {
    expect(computeGrandSlamWinners(tgResult(['u1']), sqResult(['u2']))).toEqual([]);
  });

  it('returns the player who won both games', () => {
    expect(computeGrandSlamWinners(tgResult(['u1']), sqResult(['u1']))).toEqual([
      { userId: 'u1', displayName: 'u1' },
    ]);
  });

  it('supports multiple simultaneous grand slams when both games tie the same way', () => {
    const result = computeGrandSlamWinners(tgResult(['u1', 'u2']), sqResult(['u1', 'u2']));
    expect(result.map((w) => w.userId).sort()).toEqual(['u1', 'u2']);
  });

  it('only credits players who won both, not the union', () => {
    const result = computeGrandSlamWinners(tgResult(['u1', 'u2']), sqResult(['u2', 'u3']));
    expect(result.map((w) => w.userId)).toEqual(['u2']);
  });
});

describe('buildStandings', () => {
  function dailyResult(
    playDate: string,
    game: DailyResult['game'],
    winners: { userId: string; displayName: string }[],
    finalizedAt: string,
  ): DailyResult {
    return { conversationId: CONV, playDate, game, winners, winningScore: 1000, finalizedAt, finalizedBy: 'auto' };
  }
  function grandSlam(playDate: string, userId: string, displayName: string, recordedAt: string): GrandSlam {
    return { conversationId: CONV, playDate, userId, displayName, recordedAt };
  }

  it('tallies wins per game and total wins', () => {
    const results = [
      dailyResult('2026-09-15', 'timeguesser', [{ userId: 'u1', displayName: 'Alice' }], '2026-09-15T12:00:00Z'),
      dailyResult('2026-09-16', 'speedquiz', [{ userId: 'u1', displayName: 'Alice' }], '2026-09-16T12:00:00Z'),
      dailyResult('2026-09-16', 'timeguesser', [{ userId: 'u2', displayName: 'Bob' }], '2026-09-16T12:00:00Z'),
    ];
    const standings = buildStandings(results, []);
    const alice = standings.find((s) => s.userId === 'u1')!;
    const bob = standings.find((s) => s.userId === 'u2')!;
    expect(alice).toMatchObject({ timeguesserWins: 1, speedquizWins: 1, totalWins: 2, grandSlams: 0 });
    expect(bob).toMatchObject({ timeguesserWins: 1, speedquizWins: 0, totalWins: 1, grandSlams: 0 });
  });

  it('sorts by grand slams first, then total wins, then name', () => {
    const results = [
      dailyResult('2026-09-15', 'timeguesser', [{ userId: 'u2', displayName: 'Bob' }], '2026-09-15T12:00:00Z'),
      dailyResult('2026-09-15', 'speedquiz', [{ userId: 'u2', displayName: 'Bob' }], '2026-09-15T12:00:00Z'),
      dailyResult('2026-09-16', 'timeguesser', [{ userId: 'u1', displayName: 'Alice' }], '2026-09-16T12:00:00Z'),
      dailyResult('2026-09-16', 'speedquiz', [{ userId: 'u1', displayName: 'Alice' }], '2026-09-16T12:00:00Z'),
      dailyResult('2026-09-16', 'timeguesser', [{ userId: 'u3', displayName: 'Cathan' }], '2026-09-16T13:00:00Z'),
    ];
    const slams = [grandSlam('2026-09-15', 'u2', 'Bob', '2026-09-15T12:00:00Z')];

    const standings = buildStandings(results, slams);
    expect(standings.map((s) => s.userId)).toEqual(['u2', 'u1', 'u3']);
  });

  it('keeps the most recently seen display name for a renamed player', () => {
    const results = [
      dailyResult('2026-09-15', 'timeguesser', [{ userId: 'u1', displayName: 'Cat' }], '2026-09-15T12:00:00Z'),
      dailyResult('2026-09-16', 'timeguesser', [{ userId: 'u1', displayName: 'Cathan' }], '2026-09-16T12:00:00Z'),
    ];
    const standings = buildStandings(results, []);
    expect(standings[0].displayName).toBe('Cathan');
  });

  it('returns an empty list when there is no history', () => {
    expect(buildStandings([], [])).toEqual([]);
  });
});
