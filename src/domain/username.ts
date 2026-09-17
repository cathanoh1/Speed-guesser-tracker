/**
 * There are no accounts in this app - a player is identified purely by the
 * name they type. This normalizes that name into a stable key (so "Cathan",
 * "cathan", and " Cathan " are the same player), while the original,
 * as-typed casing is kept separately as the display name.
 */
export function normalizeUsername(raw: string): string {
  return raw.trim().toLowerCase().replace(/\s+/g, ' ');
}
