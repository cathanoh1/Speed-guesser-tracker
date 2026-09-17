import { describe, expect, it } from 'vitest';
import { dateKeyInTimeZone, formatFriendlyDate, todayKeyIn } from '../src/domain/dateUtil';

describe('dateKeyInTimeZone', () => {
  it('formats as YYYY-MM-DD', () => {
    const date = new Date('2026-01-05T12:00:00Z');
    expect(dateKeyInTimeZone(date, 'UTC')).toBe('2026-01-05');
  });

  it('gives a different day near midnight depending on timezone', () => {
    // 01:00 UTC on Jan 5th is still 17:00 Jan 4th in US/Pacific (UTC-8 in January).
    const date = new Date('2026-01-05T01:00:00Z');
    expect(dateKeyInTimeZone(date, 'UTC')).toBe('2026-01-05');
    expect(dateKeyInTimeZone(date, 'America/Los_Angeles')).toBe('2026-01-04');
  });
});

describe('todayKeyIn', () => {
  it('delegates to dateKeyInTimeZone using the given instant', () => {
    const date = new Date('2026-06-01T10:00:00Z');
    expect(todayKeyIn('UTC', date)).toBe(dateKeyInTimeZone(date, 'UTC'));
  });
});

describe('formatFriendlyDate', () => {
  it('renders a readable weekday + day + month string', () => {
    // 2026-09-17 is a Thursday.
    expect(formatFriendlyDate('2026-09-17', 'UTC')).toBe('Thursday 17 September');
  });

  it('is stable across timezones for the same calendar day (noon UTC anchor)', () => {
    expect(formatFriendlyDate('2026-09-17', 'Europe/London')).toBe('Thursday 17 September');
    expect(formatFriendlyDate('2026-09-17', 'America/Los_Angeles')).toBe('Thursday 17 September');
  });
});
