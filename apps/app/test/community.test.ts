// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest';

const cfg = vi.hoisted(() => ({ community: { url: 'https://c.example' } as { url: string } | null, updates: null, crashReports: null }));
vi.mock('../src/config', () => ({ config: cfg }));

import { deleteAllSent, flushOutbox, newDeleteKey, outboxSize, sentItems, reportsFor, sendScamReport, sendTeaching, taughtItems, teachStreak, wasReported, type PublishedScam } from '../src/lib/community';

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

describe('delete on request (no account: a secret key per item)', () => {
  const bodyOf = (f: { mock: { calls: unknown[][] } }, i: number) => JSON.parse((f.mock.calls[i]![1] as RequestInit).body as string);

  it('sends a fresh url-safe key with each item and keeps only the id and key, not the text', async () => {
    let n = 0;
    const f = vi.spyOn(globalThis, 'fetch').mockImplementation(async () => new Response(JSON.stringify({ id: `0000000${++n}-aaaa-bbbb` }), { status: 201 }));
    await sendScamReport('card-9', REPORT);
    await sendTeaching({ lang: 'dua', meaning: 'Good morning', meaningLang: 'en' });
    const k1 = bodyOf(f, 0).deleteKey, k2 = bodyOf(f, 1).deleteKey;
    expect(k1).toMatch(/^[A-Za-z0-9_-]{28}$/);
    expect(k2).not.toBe(k1);
    expect(sentItems()).toEqual([
      expect.objectContaining({ kind: 'scam', id: '00000001-aaaa-bbbb', key: k1 }),
      expect.objectContaining({ kind: 'teach', id: '00000002-aaaa-bbbb', key: k2 }),
    ]);
    expect(localStorage.getItem('sabitori.sent')).not.toContain('PIN');
  });

  it('a queued item keeps the same key until it is sent', async () => {
    vi.spyOn(globalThis, 'fetch').mockRejectedValueOnce(new TypeError('offline'));
    await sendScamReport('card-10', REPORT);
    const queued = JSON.parse(localStorage.getItem('sabitori.outbox')!)[0].key;
    const f = vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(new Response('{"id":"00000003-aaaa-bbbb"}', { status: 201 }));
    await flushOutbox();
    expect(bodyOf(f, 0).deleteKey).toBe(queued);
  });

  it('deletes everything sent, empties the outbox, and keeps for later what it could not reach', async () => {
    let n = 0;
    vi.spyOn(globalThis, 'fetch').mockImplementation(async () => new Response(JSON.stringify({ id: `0000000${++n}-aaaa-bbbb` }), { status: 201 }));
    await sendScamReport('a', REPORT);
    await sendScamReport('b', REPORT);
    await sendScamReport('c', REPORT);
    vi.spyOn(globalThis, 'fetch').mockRejectedValueOnce(new TypeError('offline'));
    await sendTeaching({ lang: 'dua', meaning: 'Hello', meaningLang: 'en' }); // waits in the outbox
    expect(outboxSize()).toBe(1);
    const f = vi.spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(new Response('{"ok":true}', { status: 200 }))
      .mockResolvedValueOnce(new Response('{"error":"not_found"}', { status: 404 })) // already gone (90 days, or by email)
      .mockRejectedValueOnce(new TypeError('offline'));
    expect(await deleteAllSent()).toEqual({ left: 1 });
    expect(outboxSize()).toBe(0);
    expect(f).toHaveBeenCalledTimes(3);
    expect(f.mock.calls[0]![0]).toBe('https://c.example/v1/delete');
    expect(bodyOf(f, 0)).toMatchObject({ kind: 'scam', id: '00000001-aaaa-bbbb' });
    expect(sentItems().map((s) => s.id)).toEqual(['00000003-aaaa-bbbb']);
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(new Response('{"ok":true}', { status: 200 }));
    expect(await deleteAllSent()).toEqual({ left: 0 });
    expect(sentItems()).toEqual([]);
  });

  it('forgets items older than the 90 days the service keeps them', () => {
    localStorage.setItem('sabitori.sent', JSON.stringify([
      { kind: 'scam', id: 'old', key: newDeleteKey(), at: '2026-08-01T00:00:00Z' },
      { kind: 'scam', id: 'new', key: newDeleteKey(), at: '2026-11-01T00:00:00Z' },
    ]));
    expect(sentItems(new Date('2026-11-20T00:00:00Z')).map((s) => s.id)).toEqual(['new']);
  });
});

describe('outbox under concurrency', () => {
  it('an item added while a send is running is neither lost nor reported as sent before it is', async () => {
    let release!: () => void;
    const gate = new Promise<void>((r) => { release = r; });
    let n = 0;
    const f = vi.spyOn(globalThis, 'fetch').mockImplementation(async () => {
      if (++n === 1) await gate; // the first send hangs on a slow network
      return new Response(JSON.stringify({ id: `0000000${n}-aaaa-bbbb` }), { status: 201 });
    });
    const first = sendScamReport('slow', REPORT);
    await Promise.resolve();
    const second = sendTeaching({ lang: 'dua', meaning: 'Hello', meaningLang: 'en' });
    await new Promise((r) => setTimeout(r, 0));
    release();
    expect(await first).toBe('sent');
    expect(await second).toBe('sent');
    expect(f).toHaveBeenCalledTimes(2);
    expect(f.mock.calls.map((c) => c[0])).toEqual(['https://c.example/v1/scams', 'https://c.example/v1/teach']);
    expect(outboxSize()).toBe(0);
    expect(sentItems()).toHaveLength(2);
  });
});

describe('when the phone cannot keep an item (storage full)', () => {
  const full = () => {
    const real = Storage.prototype.setItem;
    return vi.spyOn(Storage.prototype, 'setItem').mockImplementation(function (this: Storage, k: string, v: string) {
      if (k === 'sabitori.outbox' && v.length > 2) throw new DOMException('quota', 'QuotaExceededError');
      return real.call(this, k, v);
    });
  };

  it('offline: says it failed, and does not mark the card reported or list the teaching', async () => {
    full();
    vi.spyOn(globalThis, 'fetch').mockRejectedValue(new TypeError('offline'));
    expect(await sendScamReport('card-full', REPORT)).toBe('failed');
    expect(wasReported('card-full')).toBe(false);
    expect(await sendTeaching({ lang: 'dua', meaning: 'Hello', meaningLang: 'en', audio: { base64: 'AAAA', type: 'audio/webm' } })).toBe('failed');
    expect(taughtItems()).toEqual([]);
  });

  it('online: sends it directly, without the outbox, and it can still be deleted later', async () => {
    full();
    const f = vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response('{"id":"00000009-aaaa-bbbb"}', { status: 201 }));
    expect(await sendScamReport('card-full2', REPORT)).toBe('sent');
    expect(JSON.parse((f.mock.calls[0]![1] as RequestInit).body as string).deleteKey).toMatch(/^[A-Za-z0-9_-]{28}$/);
    expect(wasReported('card-full2')).toBe(true);
    expect(sentItems().map((s) => s.id)).toEqual(['00000009-aaaa-bbbb']);
  });
});
