import { describe, expect, it } from 'vitest';
import { formatDeadline, formatLongDate, formatTime } from '../src/lib/format';

describe('deadline with a time on the card', () => {
  it('formats HH:MM in the locale, and refuses anything else', () => {
    expect(formatTime('09:30', 'fr')).toBe('09:30');
    expect(formatTime('14:05', 'en-GB')).toBe('14:05');
    for (const bad of ['9h30', '25:00', '', '09:3']) expect(formatTime(bad, 'fr')).toBe('');
  });
  it('adds the time after the long date only when there is one', () => {
    expect(formatDeadline('2026-11-22', '09:00', 'fr')).toBe(`${formatLongDate('2026-11-22', 'fr')}, 09:00`);
    expect(formatDeadline('2026-11-22', undefined, 'fr')).toBe(formatLongDate('2026-11-22', 'fr'));
    expect(formatDeadline('2026-11-22', 'nonsense', 'fr')).toBe(formatLongDate('2026-11-22', 'fr'));
  });
});
