import { describe, expect, it } from 'vitest';
import { laplacianVariance, toGrey, isSharp } from '../src/lib/sharpness';
import { buildIcs, fold } from '../src/lib/ics';
import { expiredIds } from '../src/lib/retention';
import { sanitize, DEFAULTS } from '../src/lib/settings';
import { formatPhone, formatSize } from '../src/lib/format';
import { parseHash } from '../src/lib/router';
import { pickInitialLanguage } from '../src/app-context';
import { frDate } from '../src/lib/examples';

function checker(w: number, h: number, cell: number): Float32Array {
  const g = new Float32Array(w * h);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) g[y * w + x] = ((Math.floor(x / cell) + Math.floor(y / cell)) % 2) * 255;
  return g;
}
function boxBlur(g: Float32Array, w: number, h: number, r: number): Float32Array {
  const out = new Float32Array(g.length);
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      let s = 0, n = 0;
      for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) {
        const yy = y + dy, xx = x + dx;
        if (yy >= 0 && yy < h && xx >= 0 && xx < w) { s += g[yy * w + xx]!; n++; }
      }
      out[y * w + x] = s / n;
    }
  return out;
}

describe('sharpness (variance of Laplacian)', () => {
  it('is high for a sharp pattern and collapses when blurred', () => {
    const sharp = checker(96, 96, 4);
    const blurred = boxBlur(sharp, 96, 96, 4);
    const vs = laplacianVariance(sharp, 96, 96);
    const vb = laplacianVariance(blurred, 96, 96);
    expect(vs).toBeGreaterThan(1000);
    expect(vb).toBeLessThan(vs / 20);
    expect(isSharp(vs)).toBe(true);
    expect(isSharp(vb)).toBe(false);
  });
  it('is zero for a flat image and for degenerate sizes', () => {
    expect(laplacianVariance(new Float32Array(100).fill(120), 10, 10)).toBe(0);
    expect(laplacianVariance(new Float32Array(4), 2, 2)).toBe(0);
  });
  it('converts RGBA to grey with luma weights', () => {
    const g = toGrey(new Uint8ClampedArray([255, 0, 0, 255, 0, 255, 0, 255]), 2, 1);
    expect(g[0]).toBeCloseTo(76.2, 0);
    expect(g[1]).toBeCloseTo(149.7, 0);
  });
});

describe('ics', () => {
  const ics = buildIcs({ uid: 'abc', date: '2026-11-12', title: 'ENEO, facture; à payer', description: 'ligne 1\nligne 2', now: new Date('2026-10-31T10:00:00Z') });
  it('is an all-day event on the deadline with CRLF line ends', () => {
    expect(ics).toContain('BEGIN:VCALENDAR\r\n');
    expect(ics).toContain('DTSTART;VALUE=DATE:20261112\r\n');
    expect(ics).toContain('DTEND;VALUE=DATE:20261113\r\n');
    expect(ics).toContain('DTSTAMP:20261031T100000Z\r\n');
    expect(ics.endsWith('END:VCALENDAR\r\n')).toBe(true);
    expect(ics).not.toMatch(/[^\r]\n/);
  });
  it('escapes text and rolls over month ends', () => {
    expect(ics).toContain('SUMMARY:ENEO\\, facture\; à payer');
    expect(ics).toContain('DESCRIPTION:ligne 1\\nligne 2');
    expect(buildIcs({ uid: 'x', date: '2026-12-31', title: 't' })).toContain('DTEND;VALUE=DATE:20270101');
  });
  it('folds long lines at 75 octets', () => {
    const lines = fold('X:' + 'é'.repeat(100)).split('\r\n');
    expect(lines.length).toBeGreaterThan(1);
    for (const l of lines) expect(new TextEncoder().encode(l).length).toBeLessThanOrEqual(75);
  });
});

describe('retention', () => {
  const now = Date.parse('2026-10-31T00:00:00Z');
  const day = 86400000;
  const recs = [
    { id: 'new', createdAt: new Date(now - 2 * day).toISOString() },
    { id: 'mid', createdAt: new Date(now - 10 * day).toISOString() },
    { id: 'old', createdAt: new Date(now - 40 * day).toISOString() },
  ];
  it('removes what is older than the window', () => {
    expect(expiredIds(recs, 30, now)).toEqual(['old']);
    expect(expiredIds(recs, 7, now)).toEqual(['mid', 'old']);
  });
  it('keeps nothing when set to do not keep', () => {
    expect(expiredIds(recs, 0, now)).toEqual(['new', 'mid', 'old']);
  });
});

describe('settings and helpers', () => {
  it('sanitizes stored settings', () => {
    expect(sanitize(null)).toEqual(DEFAULTS);
    expect(sanitize({ speed: 2, retention: 7, listenFirst: true, lang: 'ewo', onboarded: true })).toMatchObject({ speed: 2, retention: 7, listenFirst: true, lang: 'ewo', onboarded: true });
    expect(sanitize({ speed: 9, retention: 3, lang: 5 })).toMatchObject({ speed: 0, retention: 30, lang: 'fr' });
  });
  it('formats phones, sizes and hashes', () => {
    expect(formatPhone('+237677001234')).toBe('677 00 12 34');
    expect(formatSize(1_000_000_000, 'en')).toBe('1 GB');
    const r = parseHash('#/card/a%20b?x=1');
    expect(r.path).toEqual(['card', 'a b']);
    expect(r.query.get('x')).toBe('1');
  });
  it('picks the first-run language from the phone', () => {
    expect(pickInitialLanguage(['fr', 'en'], 'en-GB', 'fr')).toBe('en');
    expect(pickInitialLanguage(['fr', 'en'], 'de', 'fr')).toBe('fr');
  });
  it('writes example dates in the future', () => {
    expect(frDate(new Date(Date.UTC(2026, 9, 31)), 9)).toBe('9 novembre 2026');
  });
});
