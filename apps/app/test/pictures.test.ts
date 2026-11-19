import { describe, expect, it } from 'vitest';
import { daysLeft, moneyPieces, scamVibration } from '../src/lib/pictures';

describe('picture card helpers', () => {
  it('shows an amount as the fewest CFA notes and coins', () => {
    expect(moneyPieces(18450).pieces.map((p) => p.value)).toEqual([10000, 5000, 2000, 1000, 100, 100, 100, 100]);
    expect(moneyPieces(18450).more).toBe(1); // the 50 coin is the 9th piece: counted, not dropped
    expect(moneyPieces(30000).pieces.map((p) => p.value)).toEqual([10000, 10000, 10000]);
    expect(moneyPieces(250).pieces).toEqual([{ value: 100, coin: true }, { value: 100, coin: true }, { value: 50, coin: true }]);
  });
  it('a large sum shows its biggest notes and how many more', () => {
    const m = moneyPieces(500000);
    expect(m.pieces).toHaveLength(8);
    expect(m.more).toBe(42);
  });
  it('counts whole days to the deadline', () => {
    expect(daysLeft('2026-11-28', '2026-11-19')).toBe(9);
    expect(daysLeft('2026-11-19', '2026-11-19')).toBe(0);
    expect(daysLeft('2026-11-12', '2026-11-19')).toBe(-7);
    expect(daysLeft('nonsense', '2026-11-19')).toBeUndefined();
  });
  it('vibrates three long pulses for a likely scam, one for a caution, none otherwise', () => {
    expect(scamVibration('likely_scam')).toEqual([400, 200, 400, 200, 400]);
    expect(scamVibration('caution')).toEqual([250]);
    expect(scamVibration('no_signs')).toBeUndefined();
  });
});
