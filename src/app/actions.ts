'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { config } from '@/config';
import { getDb } from '@/db/client';
import { todayKeyIn } from '@/domain/dateUtil';
import { evaluateAndFinalize } from '@/domain/finalize';
import { ScoreStore } from '@/domain/store';
import { GAMES, GAME_LABELS, type Game, type ScoreEntry } from '@/domain/types';
import { normalizeUsername } from '@/domain/username';
import { ScreenshotTooLargeError, uploadScoreScreenshot } from '@/lib/blob';

function isGame(value: FormDataEntryValue | null): value is Game {
  return typeof value === 'string' && (GAMES as string[]).includes(value);
}

async function getStore(): Promise<ScoreStore> {
  const db = await getDb();
  return new ScoreStore(db);
}

function toSubmitError(message: string): never {
  redirect(`/submit?error=${encodeURIComponent(message)}`);
}

async function runFinalization(store: ScoreStore, playDate: string, forceGame?: Game): Promise<void> {
  await evaluateAndFinalize(store, playDate, forceGame ? 'manual' : 'auto', forceGame);
}

/** The main action: record a score, with its screenshot as proof. */
export async function submitScore(formData: FormData): Promise<void> {
  const rawName = String(formData.get('displayName') || '').trim();
  const game = formData.get('game');
  const rawScore = String(formData.get('score') || '').trim();
  const screenshot = formData.get('screenshot');

  if (!rawName) toSubmitError('Please enter your name.');
  if (!isGame(game)) toSubmitError('Please choose a game.');

  const scoreValue = Number(rawScore.replace(/,/g, ''));
  if (!Number.isFinite(scoreValue) || scoreValue < 0) {
    toSubmitError('Please enter a valid, non-negative score.');
  }
  if (!(screenshot instanceof File) || screenshot.size === 0) {
    toSubmitError('Please attach a screenshot of your result as proof.');
  }

  const userId = normalizeUsername(rawName);
  const store = await getStore();
  const playDate = todayKeyIn(config.timezone);

  const existingResult = await store.getDailyResult(playDate, game);
  if (existingResult) {
    toSubmitError(`${GAME_LABELS[game]} for today is already finalized - this score can't be counted.`);
  }

  let screenshotUrl: string;
  try {
    screenshotUrl = await uploadScoreScreenshot(screenshot, { playDate, game, userId });
  } catch (err) {
    if (err instanceof ScreenshotTooLargeError) {
      toSubmitError(err.message);
    }
    console.error('Screenshot upload failed:', err);
    toSubmitError('Could not upload that screenshot - please try again.');
  }

  await store.upsertPlayer(userId, rawName);

  const entry: ScoreEntry = {
    playDate,
    game,
    userId,
    displayName: rawName,
    score: Math.round(scoreValue),
    screenshotUrl,
    submittedAt: new Date().toISOString(),
  };
  await store.recordScore(entry);
  await runFinalization(store, playDate);

  revalidatePath('/');
  redirect(`/?submitted=${encodeURIComponent(rawName)}`);
}

/** Lets someone join today's active roster before they've submitted a score. */
export async function joinRoster(formData: FormData): Promise<void> {
  const rawName = String(formData.get('displayName') || '').trim();
  if (!rawName) redirect('/');

  const userId = normalizeUsername(rawName);
  const store = await getStore();
  await store.upsertPlayer(userId, rawName);
  await store.setPlayerActive(userId, true);

  revalidatePath('/');
  redirect('/');
}

export async function leaveRoster(formData: FormData): Promise<void> {
  const userId = String(formData.get('userId') || '').trim();
  if (userId) {
    const store = await getStore();
    await store.setPlayerActive(userId, false);
    revalidatePath('/');
  }
  redirect('/');
}

/**
 * Removes one of today's score submissions (e.g. a mistaken entry). There's
 * no login here, so this isn't restricted to "your own" submission - anyone
 * can remove any of today's entries, same trust model as the rest of the
 * app. Blocked once that game is finalized, so it can't undo a result that's
 * already been decided - re-submit instead if a correction is still needed.
 */
export async function removeSubmission(formData: FormData): Promise<void> {
  const game = formData.get('game');
  const userId = String(formData.get('userId') || '').trim();

  if (isGame(game) && userId) {
    const store = await getStore();
    const playDate = todayKeyIn(config.timezone);

    if (await store.getDailyResult(playDate, game)) {
      redirect(
        `/?error=${encodeURIComponent(`${GAME_LABELS[game]} for today is already finalized, so this can't be removed.`)}`,
      );
    }

    await store.removeScore(playDate, game, userId);
    revalidatePath('/');
  }

  redirect('/');
}

/** Closes today's result for a game right now, with whatever scores are in so far. */
export async function forceFinalize(formData: FormData): Promise<void> {
  const game = formData.get('game');
  if (isGame(game)) {
    const store = await getStore();
    const playDate = todayKeyIn(config.timezone);
    const scores = await store.getScoresForDate(playDate, game);
    if (scores.length > 0) {
      await runFinalization(store, playDate, game);
      revalidatePath('/');
    }
  }
  redirect('/');
}
