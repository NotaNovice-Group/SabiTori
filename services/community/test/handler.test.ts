import { describe, expect, it } from 'vitest';
import { handle, type Deps } from '../src/handler';
import type { PublishedScam, Store } from '../src/store';
import { base64Bytes, checkScamReport, checkTeaching } from '../src/validate';

function memory() {
  const scams: Array<Record<string, any>> = [];
  const teach: Array<Record<string, any>> = [];
  const rate = new Map<string, number>();
  const blobs = new Map<string, { data: Uint8Array; type: string }>();
  const store: Store = {
    async addScam(id, at, r) { scams.push({ id, at, ...r, status: 'pending' }); },
    async published(region, limit) {
      return scams.filter((s) => s.region === region && s.status === 'published').slice(-limit).reverse().map((s): PublishedScam => ({
        id: s.id, createdAt: s.at, level: s.level, text: s.text, senderKind: s.sender.kind, senderValue: s.sender.value ?? null, claimed: s.claimed ?? null, signals: s.signals,
        reports: scams.filter((t) => t.status === 'published' && t.sender.value && t.sender.value === s.sender.value).length || 1,
      }));
    },
    async pending() { return scams.filter((s) => s.status === 'pending').map((s) => ({ ...s, createdAt: s.at } as any)); },
    async review(id, status) { const s = scams.find((x) => x.id === id); if (!s) return false; s.status = status; return true; },
    async addTeaching(id, at, t) { teach.push({ id, at, ...t }); },
    async teachings() { return teach; },
    async bump(b) { const n = (rate.get(b) ?? 0) + 1; rate.set(b, n); return n; },
  };
  return { store, scams, teach, blobs: { put: async (k: string, data: Uint8Array, type: string) => void blobs.set(k, { data, type }) }, blobMap: blobs };
}

let n = 0;
const deps = (m = memory(), extra: Partial<Deps['env']> = {}): Deps & { m: ReturnType<typeof memory> } => ({
  m, store: m.store, blobs: m.blobs, now: () => new Date('2026-11-20T10:00:00Z'), newId: () => `0000000${++n}-aaaa-bbbb`,
  env: { allowedOrigins: ['capacitor://localhost'], maxPostsPerDay: 3, adminToken: 'tok', rateSalt: 's', ...extra },
});
const post = (path: string, body: unknown, headers: Record<string, string> = {}) =>
  new Request(`https://x.test${path}`, { method: 'POST', body: JSON.stringify(body), headers: { 'content-type': 'application/json', origin: 'capacitor://localhost', 'cf-connecting-ip': '1.2.3.4', ...headers } });
const REPORT = { region: 'CM', lang: 'fr', level: 'likely_scam', text: 'Envoyez votre code PIN pour débloquer votre compte MoMo.', sender: { kind: 'number', value: '+237699001122' }, signals: ['asks_pin', 'sender_mismatch'] };

describe('scam reports', () => {
  it('are stored as pending and never shown until a person publishes them', async () => {
    const d = deps();
    const r = await handle(post('/v1/scams', REPORT), d);
    expect(r.status).toBe(201);
    expect(r.headers.get('access-control-allow-origin')).toBe('capacitor://localhost');
    const list = await (await handle(new Request('https://x.test/v1/scams?region=CM'), d)).json();
    expect(list.items).toEqual([]);
    const id = d.m.scams[0]!.id;
    expect((await handle(new Request(`https://x.test/v1/admin/scams/${id}`, { method: 'POST', body: '{"status":"published"}' }), d)).status).toBe(401);
    const ok = await handle(new Request(`https://x.test/v1/admin/scams/${id}`, { method: 'POST', body: '{"status":"published"}', headers: { authorization: 'Bearer tok' } }), d);
    expect(ok.status).toBe(200);
    const after = await (await handle(new Request('https://x.test/v1/scams?region=CM'), d)).json();
    expect(after.items).toHaveLength(1);
    expect(after.items[0]).toMatchObject({ senderValue: '+237699001122', reports: 1, signals: ['asks_pin', 'sender_mismatch'] });
  });
  it('refuses bad input and limits posts per address per day without storing the address', async () => {
    const d = deps();
    expect((await handle(post('/v1/scams', { ...REPORT, text: 'short' }), d)).status).toBe(400);
    expect((await handle(post('/v1/scams', { ...REPORT, sender: { kind: 'number', value: 'call me' } }), d)).status).toBe(400);
    expect((await handle(post('/v1/scams', REPORT), d)).status).toBe(201); // 3rd post today
    expect((await handle(post('/v1/scams', REPORT), d)).status).toBe(429);
    expect(JSON.stringify(d.m.scams)).not.toContain('1.2.3.4');
  });
  it('gives no CORS headers to an unknown origin', async () => {
    const r = await handle(post('/v1/scams', REPORT, { origin: 'https://evil.example' }), deps());
    expect(r.headers.get('access-control-allow-origin')).toBeNull();
  });
});

describe('teachings', () => {
  it('store the phrase, its meaning and the recording', async () => {
    const d = deps();
    const audio = btoa('fake-m4a-bytes');
    const r = await handle(post('/v1/teach', { lang: 'dua', phrase: 'Wa ma bia bwam?', meaning: 'Good morning, how are you?', meaningLang: 'en', audio: { base64: audio, type: 'audio/mp4' } }), d);
    expect(r.status).toBe(201);
    expect(d.m.teach[0]).toMatchObject({ lang: 'dua', phrase: 'Wa ma bia bwam?', meaning: 'Good morning, how are you?', audioType: 'audio/mp4' });
    expect([...d.m.blobMap.keys()][0]).toMatch(/^teach\/dua\/2026-11-20\/.+\.m4a$/);
  });
  it('need something in the language and an English or French meaning', () => {
    expect(checkTeaching({ lang: 'dua', meaning: 'Hello' })).toEqual({ ok: false, error: 'phrase' });
    expect(checkTeaching({ lang: 'dua', phrase: 'x' })).toEqual({ ok: false, error: 'meaning' });
    expect(checkTeaching({ lang: 'DUA!', phrase: 'x', meaning: 'y' })).toEqual({ ok: false, error: 'lang' });
    expect(checkTeaching({ lang: 'dua', meaning: 'y', audio: { base64: 'AAAA', type: 'video/mp4' } })).toEqual({ ok: false, error: 'audio_type' });
  });
});

describe('validation helpers', () => {
  it('measures base64 size without decoding', () => {
    expect(base64Bytes(btoa('abcd'))).toBe(4);
    expect(base64Bytes(btoa('abcde'))).toBe(5);
  });
  it('drops unknown signal names and control characters', () => {
    const c = checkScamReport({ ...REPORT, text: 'Envoyez\u0007 votre code PIN maintenant', signals: ['asks_pin', 'DROP TABLE', 3] });
    expect(c.ok && c.value.signals).toEqual(['asks_pin']);
    expect(c.ok && c.value.text).toBe('Envoyez votre code PIN maintenant');
  });
});
