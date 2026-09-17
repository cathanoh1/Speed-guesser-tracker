import { GAMES, type DailyResult, type Game, type PlayerRef } from './types';
import { computeDailyStatus, computeGrandSlamWinners, computeWinners } from './leaderboard';
import type { ScoreStore } from './store';

export interface FinalizationOutcome {
  newlyFinalized: { game: Game; result: DailyResult }[];
  newGrandSlams: PlayerRef[];
}

/**
 * Checks whether either game is ready to close for `playDate` and, if so,
 * persists the winner(s) and any newly-earned Grand Slam. Safe to call after
 * every score submission - it is a no-op once a game is already finalized.
 *
 * `forceGame` finalizes that game immediately with whatever scores exist so
 * far, regardless of whether every active player has submitted.
 */
export async function evaluateAndFinalize(
  store: ScoreStore,
  playDate: string,
  finalizedBy: 'auto' | 'manual' = 'auto',
  forceGame?: Game,
): Promise<FinalizationOutcome> {
  const outcome: FinalizationOutcome = { newlyFinalized: [], newGrandSlams: [] };
  const activePlayers = await store.listActivePlayers();

  for (const game of GAMES) {
    if (await store.getDailyResult(playDate, game)) continue;

    const scores = await store.getScoresForDate(playDate, game);
    const status = computeDailyStatus(activePlayers, scores, playDate).games[game];
    const shouldFinalize = forceGame === game ? scores.length > 0 : status.readyToFinalize;
    if (!shouldFinalize) continue;

    const winnerResult = computeWinners(scores);
    if (!winnerResult) continue;

    const result: DailyResult = {
      playDate,
      game,
      winners: winnerResult.winners,
      winningScore: winnerResult.winningScore,
      finalizedAt: new Date().toISOString(),
      finalizedBy: forceGame === game ? finalizedBy : 'auto',
    };
    await store.saveDailyResult(result);
    outcome.newlyFinalized.push({ game, result });
  }

  // A Grand Slam only exists once both games are finalized for the same day.
  const timeguesserResult = await store.getDailyResult(playDate, 'timeguesser');
  const speedQuizResult = await store.getDailyResult(playDate, 'speedquiz');
  if (timeguesserResult && speedQuizResult) {
    const existingSlams = await store.listGrandSlams({ playDate });
    const alreadyRecorded = new Set(existingSlams.map((slam) => slam.userId));
    for (const candidate of computeGrandSlamWinners(timeguesserResult, speedQuizResult)) {
      if (alreadyRecorded.has(candidate.userId)) continue;
      await store.saveGrandSlam({
        playDate,
        userId: candidate.userId,
        displayName: candidate.displayName,
        recordedAt: new Date().toISOString(),
      });
      outcome.newGrandSlams.push(candidate);
    }
  }

  return outcome;
}
