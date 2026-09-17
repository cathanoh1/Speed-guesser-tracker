import { config, isWebhookConfigured } from '../config';
import { GAME_LABELS, type DailyResult, type Game, type PlayerRef } from '../domain/types';

/**
 * Posts an announcement card to `TEAMS_WEBHOOK_URL`. This works with either
 * a native Teams Incoming Webhook (added to a Team channel) or a Power
 * Automate flow's "When an HTTP request is received" trigger relaying into a
 * plain group chat - both are just "a URL that accepts a POST of JSON," so
 * nothing else in this app needs to know which one is actually configured.
 * See "Getting announcements into Teams" in docs/DEPLOYMENT.md.
 *
 * Failures here are logged, never thrown - a broken webhook must not break
 * score submission, which is the feature that actually matters.
 */
async function postCard(title: string, text: string, themeColor = '2A78D6'): Promise<void> {
  if (!isWebhookConfigured()) return;

  try {
    const response = await fetch(config.teamsWebhookUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      // The classic Office 365 "MessageCard" shape - understood natively by
      // Incoming Webhooks, and simple enough that a Power Automate flow can
      // just read the top-level `text` field if it isn't parsing the card.
      body: JSON.stringify({
        '@type': 'MessageCard',
        '@context': 'http://schema.org/extensions',
        themeColor,
        title,
        text,
      }),
    });
    if (!response.ok) {
      console.error(`Teams webhook POST failed: ${response.status} ${await response.text()}`);
    }
  } catch (err) {
    console.error('Teams webhook POST threw:', err);
  }
}

export async function announceWinner(game: Game, result: DailyResult, friendlyDate: string): Promise<void> {
  const isTie = result.winners.length > 1;
  const names = result.winners.map((w) => w.displayName).join(' & ');
  await postCard(
    `🏆 ${GAME_LABELS[game]} winner${isTie ? 's' : ''} - ${friendlyDate}`,
    `${names} with ${result.winningScore.toLocaleString()} points!`,
  );
}

export async function announceGrandSlam(winners: PlayerRef[], friendlyDate: string): Promise<void> {
  const names = winners.map((w) => w.displayName).join(' & ');
  await postCard(
    '🎉 GRAND SLAM! 🎉',
    `${names} won both TimeGuesser and Speed Quiz on ${friendlyDate}!`,
    'EDA100',
  );
}
