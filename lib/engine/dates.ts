// ISO date helpers (YYYY-MM-DD), all computed in UTC so results never depend on the host time zone.

const MS_PER_DAY = 86_400_000;
const ISO_RE = /^\d{4}-\d{2}-\d{2}$/;

/** Parse an ISO date (YYYY-MM-DD) to a UTC Date at midnight. */
export function parseISO(iso: string): Date {
  if (!ISO_RE.test(iso)) throw new Error(`Invalid ISO date: ${iso}`);
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d));
}

/** Format a Date as an ISO date (YYYY-MM-DD) using its UTC fields. */
export function toISO(date: Date): string {
  return date.toISOString().slice(0, 10);
}

/** iso + n days (n may be negative). */
export function addDays(iso: string, n: number): string {
  return toISO(new Date(parseISO(iso).getTime() + n * MS_PER_DAY));
}

/** Whole days from a to b (b − a). */
export function daysBetween(a: string, b: string): number {
  return Math.round((parseISO(b).getTime() - parseISO(a).getTime()) / MS_PER_DAY);
}

/** 0 = Sunday … 6 = Saturday. */
export function dayOfWeek(iso: string): number {
  return parseISO(iso).getUTCDay();
}

export function isMonday(iso: string): boolean {
  return dayOfWeek(iso) === 1;
}

export function isThursday(iso: string): boolean {
  return dayOfWeek(iso) === 4;
}

/** Every date from start to end inclusive. */
export function eachDay(start: string, end: string): string[] {
  const out: string[] = [];
  const n = daysBetween(start, end);
  for (let i = 0; i <= n; i++) out.push(addDays(start, i));
  return out;
}

/** Every Monday from start to end inclusive. */
export function mondaysBetween(start: string, end: string): string[] {
  return eachDay(start, end).filter(isMonday);
}

/** Most recent Monday on or before iso. */
export function mondayOnOrBefore(iso: string): string {
  const dow = dayOfWeek(iso);
  return addDays(iso, -((dow + 6) % 7));
}

/** Lexicographic comparison works for ISO dates. */
export function minDate(a: string, b: string): string {
  return a <= b ? a : b;
}

export function maxDate(a: string, b: string): string {
  return a >= b ? a : b;
}

/** Weeks from a to b, rounded to the nearest whole week. */
export function weeksBetween(a: string, b: string): number {
  return Math.round(daysBetween(a, b) / 7);
}
