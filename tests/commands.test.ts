import { describe, expect, it } from 'vitest';
import { normalizeGameName, parseCommand, parseScoreNumber } from '../src/bot/commands';

describe('normalizeGameName', () => {
  it.each([
    ['timeguesser', 'timeguesser'],
    ['TimeGuessr', 'timeguesser'],
    ['tg', 'timeguesser'],
    ['time guesser', 'timeguesser'],
    ['speedquiz', 'speedquiz'],
    ['SQ', 'speedquiz'],
    ['speed-quiz', 'speedquiz'],
  ])('maps %s -> %s', (input, expected) => {
    expect(normalizeGameName(input)).toBe(expected);
  });

  it('returns null for anything else', () => {
    expect(normalizeGameName('chess')).toBeNull();
  });
});

describe('parseScoreNumber', () => {
  it('parses plain integers', () => {
    expect(parseScoreNumber('42150')).toBe(42150);
  });

  it('strips thousands separators', () => {
    expect(parseScoreNumber('42,150')).toBe(42150);
  });

  it('rounds decimal input', () => {
    expect(parseScoreNumber('1200.0')).toBe(1200);
  });

  it('rejects negative numbers, garbage, and empty strings', () => {
    expect(parseScoreNumber('-5')).toBeNull();
    expect(parseScoreNumber('abc')).toBeNull();
    expect(parseScoreNumber('')).toBeNull();
  });
});

describe('parseCommand', () => {
  it('parses simple keyword commands', () => {
    expect(parseCommand('help')).toEqual({ type: 'help' });
    expect(parseCommand('?')).toEqual({ type: 'help' });
    expect(parseCommand('join')).toEqual({ type: 'join' });
    expect(parseCommand('in')).toEqual({ type: 'join' });
    expect(parseCommand('leave')).toEqual({ type: 'leave' });
    expect(parseCommand('players')).toEqual({ type: 'players' });
    expect(parseCommand('status')).toEqual({ type: 'status' });
    expect(parseCommand('leaderboard')).toEqual({ type: 'leaderboard' });
  });

  it('is case-insensitive on the command word', () => {
    expect(parseCommand('HELP')).toEqual({ type: 'help' });
    expect(parseCommand('Status')).toEqual({ type: 'status' });
  });

  it('parses "score <game> <points>"', () => {
    expect(parseCommand('score timeguesser 42150')).toEqual({
      type: 'score',
      game: 'timeguesser',
      score: 42150,
    });
    expect(parseCommand('submit sq 1,200')).toEqual({ type: 'score', game: 'speedquiz', score: 1200 });
  });

  it('parses the bare "<game> <points>" shorthand', () => {
    expect(parseCommand('tg 42150')).toEqual({ type: 'score', game: 'timeguesser', score: 42150 });
  });

  it('parses "undo <game>" and "finalize <game>"', () => {
    expect(parseCommand('undo timeguesser')).toEqual({ type: 'undo', game: 'timeguesser' });
    expect(parseCommand('remove sq')).toEqual({ type: 'undo', game: 'speedquiz' });
    expect(parseCommand('finalize speedquiz')).toEqual({ type: 'finalize', game: 'speedquiz' });
    expect(parseCommand('close tg')).toEqual({ type: 'finalize', game: 'timeguesser' });
  });

  it('falls back to unknown for unparseable input', () => {
    expect(parseCommand('')).toEqual({ type: 'unknown', raw: '' });
    expect(parseCommand('score timeguesser')).toMatchObject({ type: 'unknown' });
    expect(parseCommand('score chess 100')).toMatchObject({ type: 'unknown' });
    expect(parseCommand('what is my score')).toMatchObject({ type: 'unknown' });
  });
});
