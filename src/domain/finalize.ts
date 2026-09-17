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
 * far (the `finalize <game>` admin command), regardless of whether every
 * active player has submitted.
 */
export function evaluateAndFinalize(
  store: ScoreStore,
  conversationId: string,
  playDate: string,
  finalizedBy: 'auto' | 'manual' = 'auto',
  forceGame?: Game,
): FinalizationOutcome {
  const outcome: FinalizationOutcome = { newlyFinalized: [], newGrandSlams: [] };
  const activePlayers = store.listActivePlayers(conversationId);

  for (const game of GAMES) {
    if (store.getDailyResult(conversationId, playDate, game)) continue;

    const scores = store.getScoresForDate(conversationId, playDate, game);
    const status = computeDailyStatus(activePlayers, scores, playDate).games[game];
    const shouldFinalize = forceGame === game ? scores.length > 0 : status.readyToFinalize;
    if (!shouldFinalize) continue;

    const winnerResult = computeWinners(scores);
    if (!winnerResult) continue;

    const result: DailyResult = {
      conversationId,
      playDate,
      game,
      winners: winnerResult.winners,
      winningScore: winnerResult.winningScore,
      finalizedAt: new Date().toISOString(),
      finalizedBy: forceGame === game ? finalizedBy : 'auto',
    };
    store.saveDailyResult(result);
    outcome.newlyFinalized.push({ game, result });
  }

  // A Grand Slam only exists once both games are finalized for the same day.
  const timeguesserResult = store.getDailyResult(conversationId, playDate, 'timeguesser');
  const speedQuizResult = store.getDailyResult(conversationId, playDate, 'speedquiz');
  if (timeguesserResult && speedQuizResult) {
    const alreadyRecorded = new Set(
      store.listGrandSlams(conversationId, { playDate }).map((slam) => slam.userId),
    );
    for (const candidate of computeGrandSlamWinners(timeguesserResult, speedQuizResult)) {
      if (alreadyRecorded.has(candidate.userId)) continue;
      store.saveGrandSlam({
        conversationId,
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
