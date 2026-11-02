// Review 3 (R3/R4/R5 app items): libraries and start-up. UI pieces are in review3-ui.test.ts, OCR in review3-ocr.test.ts.
import 'fake-indexeddb/auto';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createHash } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { createMemoryStore, createOverlayFetch, quarantineActive } from '@sabitori/connect';
import { createEngine, isRegionConfig } from '../src/engine/packages-engine';
import { startEngine } from '../src/engine';
import type { Engine } from '../src/engine';
import { expiredIds, isCardRecord } from '../src/lib/retention';
import { applyRetention, clearCards, deleteCard, getCard, listCards, putCard } from '../src/lib/db';
import { formatAgo, formatLongDate, todayIso } from '../src/lib/format';
import { buildIcs, esc } from '../src/lib/ics';
import { buildInput, uniqueCard } from '../src/lib/open';
import { capText, MAX_TEXT_CHARS, session } from '../src/lib/session';
import { routeShare, type ShareDeps } from '../src/lib/share';
import { noteName, scrubEvent, scrubNames, forgetMessageTexts } from '../src/lib/scrub';
import { parseMarkdown, voiceCredit } from '../src/lib/markdown';
import { registerServiceWorker } from '../src/lib/sw';
import { checkGgufHeader, storeModelSafely } from '../src/engine/model';
import { EXTRA } from '../src/engine/extra';

const root = resolve(__dirname, '../../..');
const disk = async (url: string) => {
  const f = resolve(root, url.replace(/^\.?\//, ''));
  return existsSync(f) ? new Response(readFileSync(f)) : new Response('', { status: 404 });
};
const DAY = 86_400_000;

/* ---------------------------------------------------------------- 2. a bad update never bricks the app */

describe('start-up with a malformed signed update (R4 #2)', () => {
  async function badStore() {
    const store = createMemoryStore();
    const bytes = new TextEncoder().encode('{"formatVersion":1,"code":"CM","languages":["fr"'); // cut off: not JSON
    await store.stage('regions/CM/region.json', bytes);
    await store.commit({ sequence: 3, updatedAt: '', files: { 'regions/CM/region.json': { sha256: 'x', size: bytes.length } } });
    return store;
  }
  const bundled = { fetch: (u: string) => disk(u), resolveClip: async () => null };

  it('createEngine refuses a region that is not JSON or not a region (instead of a blank app)', async () => {
    const store = await badStore();
    const overlay = createOverlayFetch(store, (u) => disk(u));
    await expect(createEngine('./', 'CM', { fetch: (u) => overlay(u), resolveClip: async () => null })).rejects.toThrow();
    expect(isRegionConfig({ code: 'CM' })).toBe(false);
    expect(isRegionConfig(JSON.parse(readFileSync(resolve(root, 'regions/CM/region.json'), 'utf8')))).toBe(true);
  });

  it('retries with the built-in files only, and sets the update aside with the reason', async () => {
    const store = await badStore();
    const overlay = createOverlayFetch(store, (u) => disk(u));
    const reasons: string[] = [];
    const engine = await startEngine('./', 'CM', {
      assets: () => ({ fetch: (u) => overlay(u), resolveClip: async () => null }),
      create: (b, r, a) => createEngine(b, r, a ?? bundled),
      quarantine: async (why) => {
        reasons.push(why);
        await quarantineActive(store, why);
      },
    });
    expect((await engine.languages()).map((l) => l.tag)).toContain('fr');
    expect(reasons).toHaveLength(1);
    expect(reasons[0]).toMatch(/JSON|region/i);
    // quarantined: the store no longer serves the broken file, so the next start is clean too
    expect(await store.getFile('regions/CM/region.json')).toBeNull();
    const again = await createEngine('./', 'CM', { fetch: (u) => overlay(u), resolveClip: async () => null });
    expect(again.region.code).toBe('CM');
  });

  it('a start with downloaded files that hangs falls back to the built-in files (no quarantine)', async () => {
    const quarantine = vi.fn(async () => undefined);
    const ok = { region: { code: 'CM' } } as unknown as Engine;
    const e = await startEngine('./', 'CM', {
      assets: () => bundled,
      create: (_b, _r, a) => (a ? new Promise<Engine>(() => undefined) : Promise.resolve(ok)),
      quarantine,
      timeoutMs: 20,
    });
    expect(e).toBe(ok);
    expect(quarantine).not.toHaveBeenCalled();
  });

  it('the downloaded files are re-checked before they are used (verifyActiveUpdates, once per update)', async () => {
    const order: string[] = [];
    const ok = { region: { code: 'CM' } } as unknown as Engine;
    await startEngine('./', 'CM', {
      assets: () => bundled,
      verify: async () => void order.push('verify'),
      create: async (_b, _r, a) => (order.push(a ? 'create+updates' : 'create'), ok),
      quarantine: async () => undefined,
    });
    expect(order).toEqual(['verify', 'create+updates']);
  });

  it('without the update channel, a failing start is reported (the app shows its error screen)', async () => {
    await expect(startEngine('./', 'CM', { assets: () => null, create: async () => { throw new Error('broken build'); }, quarantine: async () => undefined })).rejects.toThrow('broken build');
  });
});

/* ---------------------------------------------------------------- 3. model file */

describe('model file checks (R4 #3)', () => {
  const header = (version: number, tensors: bigint, kvs: bigint, size = 2 * 1024 * 1024) => {
    const b = new Uint8Array(size);
    const v = new DataView(b.buffer);
    b.set([0x47, 0x47, 0x55, 0x46]);
    v.setUint32(4, version, true);
    v.setBigUint64(8, tensors, true);
    v.setBigUint64(16, kvs, true);
    return new Blob([b]);
  };
  it('accepts a sane GGUF header and refuses the reviewer fake (magic only), wrong versions, empty counts and tiny files', async () => {
    expect(await checkGgufHeader(header(3, 291n, 24n))).toBe(true);
    expect(await checkGgufHeader(header(2, 291n, 24n))).toBe(true);
    expect(await checkGgufHeader(header(3, 0n, 0n))).toBe(false); // img/fake.gguf: "GGUF", version 3, then zeros
    expect(await checkGgufHeader(header(9, 291n, 24n))).toBe(false);
    expect(await checkGgufHeader(header(3, 10n ** 9n, 24n))).toBe(false);
    expect(await checkGgufHeader(header(3, 291n, 24n, 4096))).toBe(false);
    expect(await checkGgufHeader(new Blob(['%PDF-1.4\n%fake\n']))).toBe(false);
  });

  /** A tiny in-memory OPFS directory. */
  function fakeDir(opts: { failWrite?: boolean; move?: boolean } = {}) {
    const files = new Map<string, string>([['sabitori-model.gguf', 'OLD']]);
    const dir = {
      files,
      async getFileHandle(name: string) {
        const h = {
          async createWritable() {
            let buf = '';
            return new WritableStream<Uint8Array>({
              write(c) {
                if (opts.failWrite) throw new Error('QuotaExceededError');
                buf += new TextDecoder().decode(c);
              },
              close() {
                files.set(name, buf);
              },
            });
          },
          ...(opts.move ? { async move(to: string) { files.set(to, files.get(name)!); files.delete(name); } } : {}),
        };
        return h;
      },
      async removeEntry(name: string) {
        files.delete(name);
      },
    };
    return dir;
  }
  /** jsdom's Blob has no stream(). */
  const blob = (text: string) => Object.assign(new Blob([text]), {
    stream: () => new ReadableStream<Uint8Array>({ start(c) { c.enqueue(new TextEncoder().encode(text)); c.close(); } }),
  });
  it('a failed write keeps the previous model', async () => {
    const d = fakeDir({ failWrite: true });
    await expect(storeModelSafely(blob('NEW'), { dir: async () => d as never })).rejects.toMatchObject({ code: 'write_failed' });
    expect(d.files.get('sabitori-model.gguf')).toBe('OLD');
    expect(d.files.has('sabitori-model.gguf.new')).toBe(false);
  });
  it('a good write replaces it (rename when the WebView can, otherwise a second write)', async () => {
    const d = fakeDir({ move: true });
    await storeModelSafely(blob('NEW'), { dir: async () => d as never });
    expect([...d.files.entries()]).toEqual([['sabitori-model.gguf', 'NEW']]);
    const e = fakeDir();
    const fallbackSave = vi.fn(async () => { e.files.set('sabitori-model.gguf', 'NEW'); });
    await storeModelSafely(blob('NEW'), { dir: async () => e as never, fallbackSave });
    expect(fallbackSave).toHaveBeenCalled();
    expect([...e.files.entries()]).toEqual([['sabitori-model.gguf', 'NEW']]);
  });
});

/* ---------------------------------------------------------------- 5 + 7. history, retention, reminders */

const card = (id: string, createdAt: unknown, extra: Record<string, unknown> = {}) => ({
  id, createdAt, mode: 'full',
  input: { text: 'Bonjour ' + id, source: 'paste', receivedAt: '2026-11-01', region: 'CM' },
  facts: { lang: 'fr', dates: [], amounts: [], phones: [], references: [], urls: [], ussdCodes: [] },
  sender: { kind: 'unknown', verified: false },
  understanding: { kind: 'other', urgency: 'info', action: 'none', confidence: 0.9 },
  scam: { level: 'no_signs', signals: [] },
  ...extra,
});

describe('retention and broken records (R4 #5, #7)', () => {
  const now = Date.parse('2026-11-02T12:00:00Z');
  it('expires invalid and future-dated records; a reminder keeps a card until its day is over', () => {
    const recs = [
      { id: 'ok', createdAt: new Date(now - DAY).toISOString() },
      { id: 'nodate', createdAt: 'not-a-date' },
      { id: 'missing', createdAt: undefined },
      { id: 'future', createdAt: new Date(now + 3 * DAY).toISOString() },
      { id: 'kept', createdAt: new Date(now - 60 * DAY).toISOString(), keepUntil: '2026-11-05' },
      { id: 'over', createdAt: new Date(now - 60 * DAY).toISOString(), keepUntil: '2026-10-01' },
    ];
    expect(expiredIds(recs, 30, now)).toEqual(['nodate', 'missing', 'future', 'over']);
    // "Do not keep": everything goes except the card that waits for its reminder
    expect(expiredIds(recs, 0, now)).toEqual(['ok', 'nodate', 'missing', 'future', 'over']);
  });
  it('isCardRecord rejects records the list cannot draw', () => {
    expect(isCardRecord(card('a', '2026-11-01T10:00:00Z'))).toBe(true);
    expect(isCardRecord({ id: 'x', createdAt: '2026-11-01T10:00:00Z' })).toBe(false);
    expect(isCardRecord(null)).toBe(false);
  });
  it('formatAgo and dates never throw on a damaged record', () => {
    expect(formatAgo('not-a-date', 'fr')).toBe('');
    expect(formatAgo(undefined as never, 'fr')).toBe('');
    expect(formatLongDate('2026-13-45', 'fr')).toBe('2026-13-45');
  });

  afterEach(async () => {
    await clearCards(async () => undefined);
  });
  it('applyRetention deletes bad records and cancels the reminders of every deleted card', async () => {
    const cancel = vi.fn(async (_id: string) => undefined);
    await putCard(card('good', new Date(now - DAY).toISOString()) as never);
    await putCard(card('old', new Date(now - 40 * DAY).toISOString()) as never);
    await putCard({ id: 'junk', createdAt: 'not-a-date' } as never);
    await putCard(card('wait', new Date(now - 40 * DAY).toISOString(), { keepUntil: '2026-11-04' }) as never);
    const left = await applyRetention(30, now, cancel);
    expect(left.map((c) => c.id).sort()).toEqual(['good', 'wait']);
    expect(cancel.mock.calls.map((c) => c[0]).sort()).toEqual(['junk', 'old']);
    expect((await listCards()).map((c) => c.id).sort()).toEqual(['good', 'wait']);
  });
  it('deleting one card, or all, cancels their reminders', async () => {
    const cancel = vi.fn(async (_id: string) => undefined);
    await putCard(card('a', new Date(now).toISOString()) as never);
    await putCard(card('b', new Date(now).toISOString()) as never);
    await deleteCard('a', cancel);
    expect(cancel).toHaveBeenCalledWith('a');
    expect(await getCard('a')).toBeUndefined();
    await clearCards(cancel);
    expect(cancel).toHaveBeenCalledWith('b');
    expect(await listCards()).toEqual([]);
  });
  it('putCard says whether the card was kept', async () => {
    expect(await putCard(card('c', new Date(now).toISOString()) as never)).toBe(true);
  });
});

/* ---------------------------------------------------------------- 6 + 11. dates, ids, ics */

describe('dates, ids and calendar files (R4 #6, #11)', () => {
  it('receivedAt is the region day: 00:30 in Douala is the next day in UTC terms', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-11-02T23:30:00Z')); // 00:30 on 3 November in Douala (UTC+1)
    try {
      expect(todayIso('Africa/Douala')).toBe('2026-11-03');
      expect(buildInput('x', 'paste', 'CM', undefined, todayIso('Africa/Douala')).receivedAt).toBe('2026-11-03');
    } finally {
      vi.useRealTimers();
    }
  });
  it('the same text read twice gets two cards (two ids)', () => {
    let t = 1000;
    const c = { id: 'card-abc', createdAt: 'x' };
    const a = uniqueCard(c, () => t++);
    const b = uniqueCard(c, () => t++);
    expect(a.id).not.toBe(b.id);
    expect(a.id.startsWith('card-abc-')).toBe(true);
  });
  it('ics escapes ; , \\ and newlines as RFC 5545 says', () => {
    expect(esc('a;b,c\\d\ne')).toBe('a\\;b\\,c\\\\d\\ne');
    expect(buildIcs({ uid: 'u', date: '2026-11-12', title: 'Payer; vite' })).toContain('SUMMARY:Payer\\; vite');
  });
});

/* ---------------------------------------------------------------- 9. share intake */

describe('share intake (R4 #9)', () => {
  const deps = (over: Partial<ShareDeps> = {}) => ({
    setPhoto: vi.fn(), setSharedText: vi.fn(), setNotice: vi.fn(), navigate: vi.fn(),
    loadImage: vi.fn(async (f: { name: string; mimeType: string }) => new File(['x'], f.name, { type: f.mimeType })),
    done: vi.fn(), stamp: () => 5, ...over,
  });
  const img = (n: string) => ({ uri: n, name: n + '.jpg', mimeType: 'image/jpeg' });
  it('several photos: the first is read, and the screen says so', async () => {
    const d = deps();
    expect(await routeShare({ files: [img('a'), img('b'), img('c')] }, d)).toBe('photo');
    expect(d.loadImage).toHaveBeenCalledTimes(1);
    expect(d.setNotice).toHaveBeenCalledWith('app.share.first_only');
    expect(d.done).toHaveBeenCalledTimes(1);
  });
  it('the Android side kept only one of several photos: same message', async () => {
    const d = deps({ notes: async () => ({ tooBig: 0, notImage: 0, more: 2 }) });
    await routeShare({ files: [img('a')] }, d);
    expect(d.setNotice).toHaveBeenCalledWith('app.share.first_only');
  });
  it('a photo too big for the phone, with nothing else: a plain message, and the cache is cleaned', async () => {
    const d = deps({ notes: async () => ({ tooBig: 1, notImage: 0 }) });
    expect(await routeShare({ files: [] }, d)).toBe('unsupported');
    expect(d.setNotice).toHaveBeenCalledWith('app.share.too_big');
    expect(d.navigate).toHaveBeenCalledWith('/?s=5');
    expect(d.done).toHaveBeenCalled();
  });
  it('a huge text is cut, with a message', async () => {
    const d = deps();
    await routeShare({ texts: ['é'.repeat(MAX_TEXT_CHARS + 500)] }, d);
    expect(((d.setSharedText as ReturnType<typeof vi.fn>).mock.calls[0]![0] as string).length).toBe(MAX_TEXT_CHARS);
    expect(d.setNotice).toHaveBeenCalledWith('app.share.too_long');
    expect(capText('😀'.repeat(3), 3)).toEqual({ text: '😀', cut: true }); // never half an emoji
  });
  it('done() runs on every path, even when nothing could be used or loading throws', async () => {
    const d = deps({ loadImage: vi.fn(async () => { throw new Error('gone'); }) });
    expect(await routeShare({ files: [img('a')] }, d)).toBe('unsupported');
    expect(d.done).toHaveBeenCalledTimes(1);
    const e = deps();
    expect(await routeShare({ texts: [' '] }, e)).toBe('ignored');
    expect(e.done).toHaveBeenCalledTimes(1);
  });
  it('a share on first run is kept for after the language choice (session resume)', () => {
    session.setResume('/paste?s=1');
    expect(session.takeResume()).toBe('/paste?s=1');
    expect(session.takeResume()).toBeNull();
  });
  it('a deleted card cannot be reopened from the session', () => {
    session.putCard(card('gone', '2026-11-01T00:00:00Z') as never);
    session.dropCard('gone');
    expect(session.getCard('gone')).toBeUndefined();
  });
});

/* ---------------------------------------------------------------- 11. crash scrubber: names */

describe('crash reports never carry sender names (R4 #11)', () => {
  afterEach(() => forgetMessageTexts());
  it('scrubs remembered names as whole words, case-insensitive', () => {
    noteName('E'); noteName('EN'); noteName('ENEO'); // typed letter by letter
    noteName('Jean Paul');
    expect(scrubNames('TypeError at ENEO row; jean  paul; ENEOX')).toBe('TypeError at [name] row; [name]; ENEOX');
    const ev = scrubEvent({ exception: { values: [{ type: 'Error', value: 'cannot read Jean Paul of undefined' }] } }, { appVersion: '1', packVersions: {} });
    expect(JSON.stringify(ev)).not.toMatch(/jean/i);
  });
  it('scrubs runs of capitalised words (a name nobody typed), not code identifiers', async () => {
    const { scrubString } = await import('../src/lib/scrub');
    expect(scrubString('facture disponible pour Jean Paul Mbarga demain')).toBe('facture disponible pour [name] demain');
    expect(scrubString('Uncaught TypeError: Cannot read properties of undefined')).toBe('Uncaught TypeError: Cannot read properties of undefined');
  });
});

/* ---------------------------------------------------------------- 8. service worker */

describe('service worker (R4 #8)', () => {
  it('is never registered inside the Android app', () => {
    const register = vi.fn(async () => undefined);
    expect(registerServiceWorker({ native: () => true, register })).toBe(false);
    expect(register).not.toHaveBeenCalled();
  });
  it('the web build waits for every page to close before a new version takes over', () => {
    const cfg = readFileSync(resolve(__dirname, '../vite.config.ts'), 'utf8');
    expect(cfg).toMatch(/registerType: 'prompt'/);
    expect(cfg).toMatch(/injectRegister: false/);
  });
});

/* ---------------------------------------------------------------- 14 + 15. licences, voices, fonts */

describe('about, licences and fonts (R5, R3 #10)', () => {
  it('every voice card gives a title, a licence and an attribution line', () => {
    for (const tag of ['fr', 'en']) {
      const v = voiceCredit(readFileSync(resolve(root, `packs/${tag}/voice/VOICE.md`), 'utf8'));
      expect(v?.title).toBeTruthy();
      expect(v?.licence).toMatch(/CC.?BY/i);
      expect(v?.attribution).toBeTruthy();
    }
  });
  it('the notices parse into headings and table rows', () => {
    const blocks = parseMarkdown(readFileSync(resolve(root, 'THIRD_PARTY_NOTICES.md'), 'utf8'));
    expect(blocks.some((b) => b.kind === 'table' && b.rows.some((r) => /Andika/.test(r[0] ?? '')))).toBe(true);
  });
  it('the app ships SIL Andika 7.000 unmodified (pinned sha256), with its licence', () => {
    const sha = (f: string) => createHash('sha256').update(readFileSync(resolve(__dirname, '../src/fonts', f))).digest('hex');
    expect(sha('Andika-Regular.woff2')).toBe('bd46cba17fb1ee30023f88376810cee1787c918d34933e0d761485375e2c1bcb');
    expect(sha('Andika-Bold.woff2')).toBe('d42a45070e8e85ed4122a56c826fd3e894ba5ea205fcda6c6bcd000efabff208');
    expect(sha('Andika-OFL.txt')).toBe('fd0f044f061aa463fa1675a71fa0c229a067e2062c321c89e5f20965883f23b2');
    expect(readFileSync(resolve(__dirname, '../src/main.tsx'), 'utf8')).not.toMatch(/@fontsource/);
  });
  it('every new interface string has English and French', () => {
    for (const k of ['app.fatal.title', 'app.fatal.restart', 'app.fatal.remove_updates', 'app.settings.about', 'app.about.voices', 'app.capture.no_ocr', 'app.share.first_only', 'app.share.unsupported', 'app.settings.clear_confirm', 'app.remind.kept', 'app.remind.passed', 'app.card.not_saved'] as const) {
      expect(EXTRA[k].en).toBeTruthy();
      expect(EXTRA[k].fr).toBeTruthy();
      expect(EXTRA[k].en).not.toMatch(/\bAI\b|\bsafe\b/i);
    }
  });
});
