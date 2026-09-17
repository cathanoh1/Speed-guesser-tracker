import { TeamsActivityHandler, TurnContext, type Attachment } from 'botbuilder';
import { config } from '../config';
import { formatFriendlyDate, todayKeyIn } from '../domain/dateUtil';
import { evaluateAndFinalize } from '../domain/finalize';
import { buildStandings, computeDailyStatus } from '../domain/leaderboard';
import type { ScoreStore } from '../domain/store';
import { GAME_LABELS, type Game, type ScoreEntry } from '../domain/types';
import { parseScoreFromScreenshot, VisionDisabledError } from '../vision/scoreVisionParser';
import { buildGrandSlamCard, buildLeaderboardCard, buildStatusCard, buildWinnerCard } from './cards';
import { downloadAttachment, extractImageAttachments } from './attachments';
import { parseCommand, type Command } from './commands';

const HELP_HINT = 'Type "help" to see everything I can do.';

const HELP_TEXT = [
  '**Speed Guesser Tracker** - here’s what I understand:',
  '- Paste a screenshot of your TimeGuesser or Speed Quiz result and I’ll read the score automatically.',
  '- `score timeguesser 42150` / `score speedquiz 1200` - enter a score by hand.',
  '- `status` - who’s still got a score to submit today.',
  '- `leaderboard` - the all-time standings and Grand Slam count.',
  '- `join` / `leave` - opt in or out of today’s roster.',
  '- `players` - see who’s currently on the roster.',
  '- `undo timeguesser` / `undo speedquiz` - remove your own score for today (before it’s finalized).',
  '- `finalize timeguesser` / `finalize speedquiz` - close today’s result with whatever scores are in so far (e.g. if someone’s away).',
].join('\n');

function today(): string {
  return todayKeyIn(config.timezone);
}

export class SpeedGuesserBot extends TeamsActivityHandler {
  constructor(private readonly store: ScoreStore) {
    super();

    this.onMessage(async (context, next) => {
      await this.handleMessage(context);
      await next();
    });

    this.onMembersAdded(async (context, next) => {
      for (const member of context.activity.membersAdded ?? []) {
        if (member.id === context.activity.recipient?.id) {
          await context.sendActivity(
            '👋 Hi! I track daily TimeGuesser and Speed Quiz scores for this group.\n\n' +
              'In a group chat, remember to **@mention me** when you post a screenshot or a command ' +
              '(e.g. "@Speed Guesser Tracker" plus your screenshot) - Teams only forwards messages to ' +
              'me that way by default.\n\n' +
              HELP_TEXT,
          );
        }
      }
      await next();
    });
  }

  private async handleMessage(context: TurnContext): Promise<void> {
    const conversationId = context.activity.conversation.id;
    const userId = context.activity.from.id;
    const displayName = context.activity.from.name || 'Someone';
    const text = (TurnContext.removeRecipientMention(context.activity) ?? context.activity.text ?? '').trim();

    this.store.touchConversation(conversationId, context.activity.conversation.name ?? null);

    const images = extractImageAttachments(context.activity.attachments);
    if (images.length > 0) {
      this.store.upsertPlayer(conversationId, userId, displayName);
      await this.handleScreenshot(context, conversationId, userId, displayName, images[0]);
      return;
    }

    const command = parseCommand(text);
    if (command.type === 'join' || command.type === 'score') {
      this.store.upsertPlayer(conversationId, userId, displayName);
    }
    await this.handleCommand(context, conversationId, userId, displayName, command);
  }

  private async handleScreenshot(
    context: TurnContext,
    conversationId: string,
    userId: string,
    displayName: string,
    attachment: Attachment,
  ): Promise<void> {
    await context.sendActivity(`🔍 Got your screenshot, ${displayName} - reading the score...`);

    let downloaded;
    try {
      downloaded = await downloadAttachment(attachment);
    } catch (err) {
      await context.sendActivity(
        `I couldn’t download that image (${(err as Error).message}). Try re-sending it, or enter it ` +
          `by hand, e.g. "score timeguesser 42150".`,
      );
      return;
    }

    let result;
    try {
      result = await parseScoreFromScreenshot(downloaded.base64, downloaded.mediaType);
    } catch (err) {
      if (err instanceof VisionDisabledError) {
        await context.sendActivity(
          'Screenshot reading isn’t set up on this bot yet. Please enter your score by hand, e.g. ' +
            '"score timeguesser 42150".',
        );
      } else {
        await context.sendActivity(
          `I had trouble reading that screenshot (${(err as Error).message}). Please enter it by hand, ` +
            `e.g. "score timeguesser 42150".`,
        );
      }
      return;
    }

    if (result.game === 'unknown' || result.score === null || result.confidence === 'low') {
      const gameHint = result.game !== 'unknown' ? ` (looked like ${GAME_LABELS[result.game as Game]})` : '';
      await context.sendActivity(
        `I couldn’t confidently read a score from that screenshot${gameHint}. Please double check and ` +
          `enter it by hand, e.g. "score timeguesser 42150" or "score speedquiz 1200".`,
      );
      return;
    }

    await this.recordAndAnnounce(
      context,
      conversationId,
      userId,
      displayName,
      result.game,
      result.score,
      'screenshot',
      result.confidence,
    );
  }

  private async handleCommand(
    context: TurnContext,
    conversationId: string,
    userId: string,
    displayName: string,
    command: Command,
  ): Promise<void> {
    switch (command.type) {
      case 'help':
        await context.sendActivity(HELP_TEXT);
        return;

      case 'join': {
        this.store.setPlayerActive(conversationId, userId, true);
        await context.sendActivity(`Welcome in, ${displayName}! You’re on today’s roster.`);
        return;
      }

      case 'leave': {
        this.store.setPlayerActive(conversationId, userId, false);
        await context.sendActivity(
          `No worries, ${displayName} - you’re marked inactive and won’t show up as "still needed". ` +
            `Type "join" any time to jump back in.`,
        );
        return;
      }

      case 'players': {
        const players = this.store.listActivePlayers(conversationId);
        await context.sendActivity(
          players.length > 0
            ? `Active players: ${players.map((p) => p.displayName).join(', ')}`
            : 'Nobody’s joined yet - send a screenshot or type "join" to get started!',
        );
        return;
      }

      case 'status': {
        const playDate = today();
        const activePlayers = this.store.listActivePlayers(conversationId);
        const scores = this.store.getScoresForDate(conversationId, playDate);
        const status = computeDailyStatus(activePlayers, scores, playDate);
        const friendlyDate = formatFriendlyDate(playDate, config.timezone);
        await context.sendActivity({ attachments: [buildStatusCard(status, friendlyDate)] });
        return;
      }

      case 'leaderboard': {
        const results = this.store.listDailyResults(conversationId);
        const slams = this.store.listGrandSlams(conversationId);
        const standings = buildStandings(results, slams);
        await context.sendActivity({ attachments: [buildLeaderboardCard(standings, config.publicBaseUrl)] });
        return;
      }

      case 'score': {
        await this.recordAndAnnounce(
          context,
          conversationId,
          userId,
          displayName,
          command.game,
          command.score,
          'manual',
        );
        return;
      }

      case 'undo': {
        const playDate = today();
        if (this.store.getDailyResult(conversationId, playDate, command.game)) {
          await context.sendActivity(
            `Today’s ${GAME_LABELS[command.game]} result is already finalized, so it can’t be undone here.`,
          );
          return;
        }
        const removed = this.store.removeScore(conversationId, playDate, command.game, userId);
        await context.sendActivity(
          removed
            ? `Removed your ${GAME_LABELS[command.game]} score for today.`
            : `You didn’t have a ${GAME_LABELS[command.game]} score recorded for today.`,
        );
        return;
      }

      case 'finalize': {
        const playDate = today();
        if (this.store.getDailyResult(conversationId, playDate, command.game)) {
          await context.sendActivity(`Today’s ${GAME_LABELS[command.game]} result is already finalized.`);
          return;
        }
        const scores = this.store.getScoresForDate(conversationId, playDate, command.game);
        if (scores.length === 0) {
          await context.sendActivity(
            `Nobody’s submitted a ${GAME_LABELS[command.game]} score today yet, so there’s nothing to finalize.`,
          );
          return;
        }
        await context.sendActivity(
          `Finalizing ${GAME_LABELS[command.game]} for today with the ${scores.length} score(s) in so far...`,
        );
        await this.finalizeAndAnnounce(context, conversationId, playDate, command.game);
        return;
      }

      case 'unknown':
      default:
        await context.sendActivity(`Sorry, I didn’t understand that. ${HELP_HINT}`);
    }
  }

  private async recordAndAnnounce(
    context: TurnContext,
    conversationId: string,
    userId: string,
    displayName: string,
    game: Game,
    score: number,
    source: ScoreEntry['source'],
    confidence?: 'high' | 'medium' | 'low',
  ): Promise<void> {
    const playDate = today();

    if (this.store.getDailyResult(conversationId, playDate, game)) {
      await context.sendActivity(
        `${GAME_LABELS[game]} for today is already finalized, so this score won’t count. Ask whoever ` +
          `runs the bot to "finalize ${game}" was a mistake before re-submitting.`,
      );
      return;
    }

    const entry: ScoreEntry = {
      conversationId,
      playDate,
      game,
      userId,
      displayName,
      score,
      source,
      rawConfidence: confidence ?? null,
      submittedAt: new Date().toISOString(),
    };
    const { previous } = this.store.recordScore(entry);

    const confidenceNote =
      confidence === 'medium'
        ? ' (I’m only fairly confident I read that right - let me know if it’s wrong.)'
        : '';

    if (previous && previous.score !== score) {
      await context.sendActivity(
        `Updated your ${GAME_LABELS[game]} score from ${previous.score.toLocaleString()} to ` +
          `${score.toLocaleString()}.${confidenceNote}`,
      );
    } else {
      await context.sendActivity(
        `✅ Recorded ${displayName}’s ${GAME_LABELS[game]} score: ${score.toLocaleString()}.${confidenceNote}`,
      );
    }

    await this.finalizeAndAnnounce(context, conversationId, playDate);
  }

  private async finalizeAndAnnounce(
    context: TurnContext,
    conversationId: string,
    playDate: string,
    forceGame?: Game,
  ): Promise<void> {
    const outcome = evaluateAndFinalize(this.store, conversationId, playDate, forceGame ? 'manual' : 'auto', forceGame);
    const friendlyDate = formatFriendlyDate(playDate, config.timezone);

    for (const { game, result } of outcome.newlyFinalized) {
      await context.sendActivity({ attachments: [buildWinnerCard(game, result, friendlyDate)] });
    }
    if (outcome.newGrandSlams.length > 0) {
      await context.sendActivity({ attachments: [buildGrandSlamCard(outcome.newGrandSlams, friendlyDate)] });
    }
  }
}
