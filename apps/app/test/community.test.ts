// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest';

const cfg = vi.hoisted(() => ({ community: { url: 'https://c.example' } as { url: string } | null, updates: null, crashReports: null }));
vi.mock('../src/config', () => ({ config: cfg }));

import { flushOutbox, outboxSize, reportsFor, sendScamReport, sendTeaching, taughtItems, teachStreak, wasReported, type PublishedScam } from '../src/lib/community';

const REPORT = { region: 'CM', lang: 'fr', level: 'likely_scam' as const, text: 'Envoyez votre code PIN maintenant.', sender: { kind: 'number' as const, value: '+237699001122' }, signals: ['asks_pin'] };

beforeEach(() => {
  localStorage.clear();
  cfg.community = { url: 'https://c.example' };
  vi.restoreAllMocks();
});

describe('outbox', () => {
  it('sends at once when online and remembers the card was reported', async () => {
    const f = vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response('{"id":"x"}', { status: 201 }));
    expect(await sendScamReport('card-1', REPORT)).toBe('sent');
    expect(f).toHaveBeenCalledWith('https://c.example/v1/scams', expect.objectContaining({ method: 'POST' }));
    expect(wasReported('card-1')).toBe(true);
    expect(outboxSize()).toBe(0);
  });
  it('keeps the item when offline or rate-limited, and sends it later', async () => {
    vi.spyOn(globalThis, 'fetch').mockRejectedValueOnce(new TypeError('offline'));
    expect(await sendTeaching({ lang: 'dua', phrase: 'Wa ma bia bwam?', meaning: 'Good morning', meaningLang: 'en' })).toBe('queued');
    expect(outboxSize()).toBe(1);
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(new Response('', { status: 429 }));
    await flushOutbox();
    expect(outboxSize()).toBe(1);
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(new Response('{}', { status: 201 }));
    await flushOutbox();
    expect(outboxSize()).toBe(0);
    expect(taughtItems()[0]).toMatchObject({ lang: 'dua', meaning: 'Good morning', withAudio: false });
  });
  it('drops an item the service refuses for good (400), instead of retrying forever', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response('{"error":"text"}', { status: 400 }));
    await sendScamReport('card-2', REPORT);
    expect(outboxSize()).toBe(0);
  });
  it('keeps everything on the phone when no service is configured', async () => {
    cfg.community = null;
    const f = vi.spyOn(globalThis, 'fetch');
    expect(await sendScamReport('card-3', REPORT)).toBe('queued');
    expect(f).not.toHaveBeenCalled();
  });
});

describe('streak and lookup', () => {
  it('counts days in a row ending today or yesterday', () => {
    const at = (d: string) => ({ at: `${d}T10:00:00Z`, lang: 'dua', meaning: 'x', withAudio: false });
    const today = new Date('2026-11-20T12:00:00Z');
    expect(teachStreak([at('2026-11-20'), at('2026-11-19'), at('2026-11-18'), at('2026-11-15')], today)).toBe(3);
    expect(teachStreak([at('2026-11-19'), at('2026-11-18')], today)).toBe(2);
    expect(teachStreak([at('2026-11-17')], today)).toBe(0);
  });
  it('finds published reports for a number however it is written', () => {
    const s = (v: string | null): PublishedScam => ({ id: v ?? 'n', createdAt: '', level: 'likely_scam', text: '', senderKind: 'number', senderValue: v, claimed: null, signals: [], reports: 2 });
    const items = [s('+237699001122'), s(null), s('+237677000000')];
    expect(reportsFor('+237 699 00 11 22', items)).toHaveLength(1);
    expect(reportsFor('+237690000000', items)).toHaveLength(0);
  });
});
