import { CardFactory, type Attachment } from 'botbuilder';
import type { DailyStatus } from '../domain/leaderboard';
import type { StandingsRow } from '../domain/leaderboard';
import { GAME_LABELS, type DailyResult, type Game, type PlayerRef } from '../domain/types';

/** Minimal Adaptive Card body element - typed loosely since the schema is large and JSON-shaped. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type CardElement = Record<string, any>;

function adaptiveCard(body: CardElement[], actions?: CardElement[]): CardElement {
  const card: CardElement = {
    $schema: 'http://adaptivecards.io/schemas/adaptive-card.json',
    type: 'AdaptiveCard',
    version: '1.4',
    body,
  };
  if (actions && actions.length > 0) card.actions = actions;
  return card;
}

function textBlock(text: string, opts: CardElement = {}): CardElement {
  return { type: 'TextBlock', wrap: true, text, ...opts };
}

export function buildStatusCard(status: DailyStatus, friendlyDate: string): Attachment {
  const body: CardElement[] = [textBlock(`Status for ${friendlyDate}`, { size: 'Medium', weight: 'Bolder' })];

  for (const gameStatus of Object.values(status.games)) {
    body.push(textBlock(GAME_LABELS[gameStatus.game], { weight: 'Bolder', spacing: 'Medium' }));

    if (gameStatus.submitted.length > 0) {
      const line = gameStatus.submitted
        .map((s) => `${s.displayName} (${s.score.toLocaleString()})`)
        .join(', ');
      body.push(textBlock(`✅ In: ${line}`));
    }

    if (gameStatus.missing.length > 0) {
      body.push(
        textBlock(`⏳ Still needed: ${gameStatus.missing.map((m) => m.displayName).join(', ')}`, {
          color: 'Attention',
        }),
      );
    } else if (gameStatus.submitted.length > 0) {
      body.push(textBlock(`Everyone's in - ready to finalize!`, { color: 'Good' }));
    } else {
      body.push(textBlock('No scores yet.', { isSubtle: true }));
    }
  }

  return CardFactory.adaptiveCard(adaptiveCard(body));
}

export function buildWinnerCard(game: Game, result: DailyResult, friendlyDate: string): Attachment {
  const isTie = result.winners.length > 1;
  const names = result.winners.map((w) => w.displayName).join(' & ');
  const body: CardElement[] = [
    textBlock(`🏆 ${GAME_LABELS[game]} winner${isTie ? 's' : ''} - ${friendlyDate}`, {
      size: 'Large',
      weight: 'Bolder',
    }),
    textBlock(`${names} with ${result.winningScore.toLocaleString()} points!`, { size: 'Medium' }),
  ];
  return CardFactory.adaptiveCard(adaptiveCard(body));
}

export function buildGrandSlamCard(winners: PlayerRef[], friendlyDate: string): Attachment {
  const names = winners.map((w) => w.displayName).join(' & ');
  const body: CardElement[] = [
    textBlock('🎉 GRAND SLAM! 🎉', { size: 'Large', weight: 'Bolder' }),
    textBlock(`${names} won both TimeGuesser and Speed Quiz on ${friendlyDate}!`, { size: 'Medium' }),
  ];
  return CardFactory.adaptiveCard(adaptiveCard(body));
}

export function buildLeaderboardCard(standings: StandingsRow[], publicBaseUrl: string): Attachment {
  const body: CardElement[] = [textBlock('🏆 All-time leaderboard', { size: 'Medium', weight: 'Bolder' })];

  if (standings.length === 0) {
    body.push(textBlock('No results yet - get playing!', { isSubtle: true }));
  } else {
    body.push({
      type: 'ColumnSet',
      spacing: 'Medium',
      columns: [
        { type: 'Column', width: 'auto', items: [textBlock('', {})] },
        { type: 'Column', width: 'stretch', items: [textBlock('Player', { weight: 'Bolder', isSubtle: true })] },
        { type: 'Column', width: 'auto', items: [textBlock('TG', { weight: 'Bolder', isSubtle: true })] },
        { type: 'Column', width: 'auto', items: [textBlock('SQ', { weight: 'Bolder', isSubtle: true })] },
        { type: 'Column', width: 'auto', items: [textBlock('Slams', { weight: 'Bolder', isSubtle: true })] },
      ],
    });
    standings.slice(0, 15).forEach((row, index) => {
      body.push({
        type: 'ColumnSet',
        columns: [
          { type: 'Column', width: 'auto', items: [textBlock(`${index + 1}.`)] },
          { type: 'Column', width: 'stretch', items: [textBlock(row.displayName)] },
          { type: 'Column', width: 'auto', items: [textBlock(String(row.timeguesserWins))] },
          { type: 'Column', width: 'auto', items: [textBlock(String(row.speedquizWins))] },
          { type: 'Column', width: 'auto', items: [textBlock(row.grandSlams > 0 ? `🎉 ${row.grandSlams}` : '0')] },
        ],
      });
    });
  }

  const actions: CardElement[] = [
    { type: 'Action.OpenUrl', title: 'Open full leaderboard', url: `${publicBaseUrl}/leaderboard` },
  ];
  return CardFactory.adaptiveCard(adaptiveCard(body, actions));
}
