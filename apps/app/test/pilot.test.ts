import { describe, expect, it } from 'vitest';
import { band, createPilot, isoWeek, pilotEnabled, pilotSummary, pilotTotals, PILOT_KEY, type KeyValueStore } from '../src/lib/pilot';

const memory = (): KeyValueStore & { data: Map<string, string> } => {
  const data = new Map<string, string>();
  return { data, getItem: (k) => data.get(k) ?? null, setItem: (k, v) => void data.set(k, v), removeItem: (k) => void data.delete(k) };
};

describe('pilot counters', () => {
  it('is off unless the build says VITE_PILOT=1', () => {
    expect(pilotEnabled({})).toBe(false);
    expect(pilotEnabled({ VITE_PILOT: '0' })).toBe(false);
    expect(pilotEnabled({ VITE_PILOT: ' 1 ' })).toBe(true);
    const off = createPilot(null);
    off.record({ type: 'listened' });
    expect(off.read()).toBeNull();
  });

  it('counts by ISO week and source, without any message content', () => {
    const store = memory();
    let now = new Date(2026, 10, 17, 10); // Tue 17 Nov 2026, ISO week 47
    const p = createPilot(store, () => now);
    p.record({ type: 'explained', source: 'photo', mode: 'full', scam: 'no_signs' });
    p.record({ type: 'explained', source: 'paste', mode: 'facts_only', scam: 'likely_scam' });
    p.record({ type: 'explained', source: 'example', mode: 'full', scam: 'likely_scam' });
    p.record({ type: 'listened' });
    now = new Date(2026, 10, 24, 10); // next week
    p.record({ type: 'explained', source: 'share', mode: 'full', scam: 'caution' });
    p.record({ type: 'reminder' });

    const d = p.read()!;
    expect(d.since).toBe('2026-11-17');
    expect(d.weeks.map((w) => w.week)).toEqual(['2026-W47', '2026-W48']);
    expect(d.weeks[0]).toMatchObject({ explained: 2, fromPhoto: 1, fromPaste: 1, factsOnly: 1, scamWarnings: 1, practice: 1, listened: 1 });
    expect(d.weeks[1]).toMatchObject({ explained: 1, fromShare: 1, cautionWarnings: 1, reminders: 1 });
    expect(pilotTotals(d)).toMatchObject({ explained: 3, scamWarnings: 1, cautionWarnings: 1, practice: 1 });
    // only counts and dates are stored
    expect(Object.keys(JSON.parse(store.data.get(PILOT_KEY)!))).toEqual(['version', 'since', 'weeks']);
  });

  it('summary is plain counts the participant can read before sharing', () => {
    const store = memory();
    const p = createPilot(store, () => new Date(2026, 10, 17));
    expect(pilotSummary(p.read(), '1.0.0')).toContain('No messages yet.');
    p.record({ type: 'explained', source: 'photo', mode: 'full', scam: 'no_signs' });
    const s = pilotSummary(p.read(), '1.0.0');
    expect(s).toContain('2026-W47 | 1 (1/0/0) | 0 | 0 | 0 | 0 | 0 | 0');
    expect(s).toContain('Counting since 2026-11-17');
  });

  it('survives broken or tampered storage and can be reset', () => {
    const store = memory();
    store.setItem(PILOT_KEY, '{"version":1,"since":"x","weeks":[{"week":"w","explained":-3}]}');
    const p = createPilot(store, () => new Date(2026, 0, 1));
    expect(p.read()).toBeNull();
    p.record({ type: 'listened' });
    expect(p.read()!.weeks).toHaveLength(1);
    p.reset();
    expect(p.read()).toBeNull();
    const throwing: KeyValueStore = { getItem: () => { throw new Error('blocked'); }, setItem: () => { throw new Error('full'); }, removeItem: () => { throw new Error('x'); } };
    const q = createPilot(throwing);
    expect(() => q.record({ type: 'reminder' })).not.toThrow();
    expect(() => q.reset()).not.toThrow();
    expect(q.read()).toBeNull();
  });

  it('ISO weeks across a year boundary', () => {
    expect(isoWeek(new Date(2026, 0, 1))).toBe('2026-W01');
    expect(isoWeek(new Date(2027, 0, 1))).toBe('2026-W53');
    expect(isoWeek(new Date(2026, 11, 28))).toBe('2026-W53');
  });

  it('keeps how long things took as counts per time band, never the times themselves', () => {
    expect([band('photoSec', 0), band('photoSec', 4999), band('photoSec', 5000), band('photoSec', 39_999), band('photoSec', 40_000)]).toEqual([0, 0, 1, 3, 4]);
    expect([band('textSec', 300), band('textSec', 1500), band('textSec', 9000)]).toEqual([0, 1, 3]);
    const store = memory();
    const p = createPilot(store, () => new Date(2026, 10, 17));
    p.record({ type: 'explained', source: 'photo', mode: 'full', scam: 'no_signs', ms: 12_000 });
    p.record({ type: 'explained', source: 'paste', mode: 'full', scam: 'no_signs', ms: 400 });
    p.record({ type: 'explained', source: 'share', mode: 'full', scam: 'no_signs', ms: 2500 });
    p.record({ type: 'explained', source: 'example', mode: 'full', scam: 'no_signs', ms: 100 }); // practice: not timed
    p.record({ type: 'explained', source: 'paste', mode: 'full', scam: 'no_signs', ms: Number.NaN }); // ignored
    p.record({ type: 'first_audio', ms: 1500 });
    const w = p.read()!.weeks[0]!;
    expect(w.photoSec).toEqual([0, 0, 1, 0, 0]);
    expect(w.textSec).toEqual([1, 0, 1, 0]);
    expect(w.audioSec).toEqual([0, 1, 0, 0]);
    const s = pilotSummary(p.read(), '1.0.0');
    expect(s).toContain('photo to card | <5s: 0, 5-10s: 0, 10-20s: 1, 20-40s: 0, 40+s: 0');
    expect(s).toContain('Listen to first sound | <1s: 0, 1-2s: 1, 2-5s: 0, 5+s: 0');
    expect(store.data.get(PILOT_KEY)).not.toMatch(/12000|400|2500/);
  });

  it('counts kept before timing existed still load, with empty bands', () => {
    const store = memory();
    store.setItem(PILOT_KEY, JSON.stringify({ version: 1, since: '2026-11-10', weeks: [{ week: '2026-W46', explained: 2, fromPhoto: 1, fromShare: 0, fromPaste: 1, practice: 0, factsOnly: 0, scamWarnings: 0, cautionWarnings: 0, listened: 1, reminders: 0 }] }));
    const p = createPilot(store, () => new Date(2026, 10, 17));
    expect(p.read()!.weeks[0]!.photoSec).toEqual([0, 0, 0, 0, 0]);
    p.record({ type: 'first_audio', ms: 300 });
    expect(pilotTotals(p.read())).toMatchObject({ explained: 2, audioSec: [1, 0, 0, 0] });
    store.setItem(PILOT_KEY, JSON.stringify({ version: 1, since: 'x', weeks: [{ ...p.read()!.weeks[0], photoSec: [1, -1] }] }));
    expect(p.read()).toBeNull();
  });
});
