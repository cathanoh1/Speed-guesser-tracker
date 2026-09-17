import path from 'path';
import express, { Router } from 'express';
import { formatFriendlyDate, todayKeyIn } from '../domain/dateUtil';
import { buildStandings, computeDailyStatus } from '../domain/leaderboard';
import type { ScoreStore } from '../domain/store';
import { GAME_LABELS, GAMES } from '../domain/types';
import { config } from '../config';

function pickConversationId(store: ScoreStore, requested: string | undefined): string | null {
  if (requested) return requested;
  const [first] = store.listConversations();
  return first ? first.conversationId : null;
}

/** Builds the Express router serving the JSON leaderboard API and the static dashboard page. */
export function buildWebRouter(store: ScoreStore): Router {
  const router = Router();

  router.get('/api/conversations', (_req, res) => {
    const conversations = store.listConversations().map((c) => ({
      conversationId: c.conversationId,
      label: c.displayName || `Group ${c.conversationId.slice(-6)}`,
      activePlayers: store.listActivePlayers(c.conversationId).length,
    }));
    res.json({ conversations });
  });

  router.get('/api/leaderboard', (req, res) => {
    const conversationId = pickConversationId(store, req.query.conversationId as string | undefined);
    if (!conversationId) {
      res.json({ conversationId: null, standings: [] });
      return;
    }
    const results = store.listDailyResults(conversationId);
    const slams = store.listGrandSlams(conversationId);
    res.json({ conversationId, standings: buildStandings(results, slams) });
  });

  router.get('/api/status', (req, res) => {
    const conversationId = pickConversationId(store, req.query.conversationId as string | undefined);
    if (!conversationId) {
      res.json({ conversationId: null, playDate: null, friendlyDate: null, games: {} });
      return;
    }
    const playDate = todayKeyIn(config.timezone);
    const activePlayers = store.listActivePlayers(conversationId);
    const scores = store.getScoresForDate(conversationId, playDate);
    const status = computeDailyStatus(activePlayers, scores, playDate);

    const games: Record<string, unknown> = {};
    for (const game of GAMES) {
      games[game] = {
        ...status.games[game],
        finalized: store.getDailyResult(conversationId, playDate, game),
      };
    }

    res.json({
      conversationId,
      playDate,
      friendlyDate: formatFriendlyDate(playDate, config.timezone),
      games,
    });
  });

  router.get('/api/history', (req, res) => {
    const conversationId = pickConversationId(store, req.query.conversationId as string | undefined);
    if (!conversationId) {
      res.json({ conversationId: null, days: [] });
      return;
    }
    const limitParam = Number(req.query.limit);
    const limit = Number.isFinite(limitParam) && limitParam > 0 ? Math.min(limitParam, 90) : 30;

    const resultsByDate = new Map<string, Record<string, { winners: string; score: number } | undefined>>();
    for (const game of GAMES) {
      for (const result of store.listDailyResults(conversationId, { game, limit })) {
        const entry = resultsByDate.get(result.playDate) ?? {};
        entry[game] = {
          winners: result.winners.map((w) => w.displayName).join(' & '),
          score: result.winningScore,
        };
        resultsByDate.set(result.playDate, entry);
      }
    }
    const grandSlamDates = new Set(
      store.listGrandSlams(conversationId).map((slam) => `${slam.playDate}:${slam.userId}`),
    );

    const days = [...resultsByDate.entries()]
      .sort((a, b) => b[0].localeCompare(a[0]))
      .slice(0, limit)
      .map(([playDate, games]) => ({
        playDate,
        friendlyDate: formatFriendlyDate(playDate, config.timezone),
        timeguesser: games.timeguesser ?? null,
        speedquiz: games.speedquiz ?? null,
        isGrandSlam: [...grandSlamDates].some((key) => key.startsWith(`${playDate}:`)),
      }));

    res.json({ conversationId, gameLabels: GAME_LABELS, days });
  });

  router.use(express.static(path.join(__dirname, 'public')));

  router.get('/leaderboard', (_req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
  });

  router.get('/', (_req, res) => {
    res.redirect('/leaderboard');
  });

  return router;
}
