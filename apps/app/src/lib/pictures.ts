/**
 * Picture card helpers: the card's facts as things a person can see without reading words or hearing speech
 * (money as notes and coins, the deadline as a calendar page with days left as dots).
 */

/** Central African CFA franc notes and coins, largest first. */
const NOTES = [10000, 5000, 2000, 1000, 500] as const;
const COINS = [100, 50, 25, 10, 5, 2, 1] as const;

export interface MoneyPiece { value: number; coin: boolean }

/**
 * The fewest notes and coins that make the amount, largest first. Shows at most `max` pieces: a larger total is
 * shown as its biggest pieces plus `more` (how many pieces are not drawn), so a picture never claims less money.
 */
export function moneyPieces(amount: number, max = 8): { pieces: MoneyPiece[]; more: number } {
  const all: MoneyPiece[] = [];
  let left = Math.round(Math.abs(amount));
  for (const v of NOTES) while (left >= v) { all.push({ value: v, coin: false }); left -= v; }
  for (const v of COINS) while (left >= v) { all.push({ value: v, coin: true }); left -= v; }
  return { pieces: all.slice(0, max), more: Math.max(0, all.length - max) };
}

/** Whole days from today to the deadline (both yyyy-mm-dd); negative when it has passed. */
export function daysLeft(deadline: string, today: string): number | undefined {
  const d = Date.parse(`${deadline.slice(0, 10)}T00:00:00Z`);
  const t = Date.parse(`${today.slice(0, 10)}T00:00:00Z`);
  if (Number.isNaN(d) || Number.isNaN(t)) return undefined;
  return Math.round((d - t) / 86_400_000);
}

/** A vibration pattern a deaf person can tell apart: three long pulses for a likely scam, one for a caution. */
export function scamVibration(level: string): number[] | undefined {
  if (level === 'likely_scam') return [400, 200, 400, 200, 400];
  if (level === 'caution') return [250];
  return undefined;
}
