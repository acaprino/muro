/** The few ways the window says a number, a time or an amount, in its own words. Pure: no React, no toolkit. */

/** "1 input", "3 inputs", "2 entries". */
export const plural = (n: number, one: string, many = one + 's'): string => `${n} ${n === 1 ? one : many}`;
/** An amount in dollars: cents, or four places for less than a cent. */
export const money = (n: number): string => '$' + (n > 0 && n < 0.01 ? n.toFixed(4) : n.toFixed(2));
/** How long a run took: "4.2 s", "2 min 5 s". */
export function took(ms: number): string {
  const s = ms / 1000;
  if (s < 60) return `${s.toFixed(1)} s`;
  const t = Math.round(s);
  return `${Math.floor(t / 60)} min ${t % 60} s`;
}
/** An ISO time as a date and an hour ("18 Nov 2026, 12:00"); anything that is no time, as it came. */
export function at(iso: string): string {
  const ms = Date.parse(iso);
  return Number.isNaN(ms) ? iso : new Date(ms).toLocaleString('en-GB', { dateStyle: 'medium', timeStyle: 'short' });
}
/** The date part of an ISO time ("2026-11-10"). */
export const day = (iso: string): string => /^\d{4}-\d{2}-\d{2}/.exec(iso)?.[0] ?? iso;
/** The words of an error, whatever was thrown. */
export const message = (e: unknown): string => String(e instanceof Error ? e.message : e);
