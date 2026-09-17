/**
 * All "which day did this score belong to" logic funnels through here, so a
 * group in one timezone doesn't see scores flip days at the wrong moment.
 */

/** Returns the YYYY-MM-DD date key for `date` as seen in `timeZone`. */
export function dateKeyInTimeZone(date: Date, timeZone: string): string {
  // en-CA formats as YYYY-MM-DD, which happens to match SQLite's sortable
  // date-key convention exactly - no manual re-assembly needed.
  const formatter = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  });
  return formatter.format(date);
}

/** Today's date key in `timeZone` (defaults to now). */
export function todayKeyIn(timeZone: string, now: Date = new Date()): string {
  return dateKeyInTimeZone(now, timeZone);
}

/** Renders a `YYYY-MM-DD` play date as a friendly string, e.g. "Wednesday 17 September". */
export function formatFriendlyDate(playDate: string, timeZone: string): string {
  const [year, month, day] = playDate.split('-').map(Number);
  // Use noon UTC as the anchor instant so formatting in any reasonable
  // timezone still lands on the intended calendar day.
  const anchor = new Date(Date.UTC(year, month - 1, day, 12));
  return new Intl.DateTimeFormat('en-GB', {
    timeZone,
    weekday: 'long',
    day: 'numeric',
    month: 'long',
  }).format(anchor);
}
