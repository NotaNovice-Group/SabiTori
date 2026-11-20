import { describe, expect, it } from 'vitest';
import { handle, purgeOld, RETENTION_DAYS, type Deps } from '../src/handler';
import type { PublishedScam, Store } from '../src/store';
import { base64Bytes, checkScamReport, checkTeaching } from '../src/validate';

function memory() {
  const scams: Array<Record<string, any>> = [];
  const teach: Array<Record<string, any>> = [];
  const rate = new Map<string, number>();
  const blobs = new Map<string, { data: Uint8Array; type: string }>();
  const store: Store = {
    async addScam(id, at, r, deleteHash) { scams.push({ id, at, ...r, status: 'pending', deleteHash }); },
    async published(region, limit) {
      return scams.filter((s) => s.region === region && s.status === 'published').slice(-limit).reverse().map((s): PublishedScam => ({
        id: s.id, createdAt: s.at, level: s.level, text: s.text, senderKind: s.sender.kind, senderValue: s.sender.value ?? null, claimed: s.claimed ?? null, signals: s.signals,
        reports: scams.filter((t) => t.status === 'published' && t.sender.value && t.sender.value === s.sender.value).length || 1,
      }));
    },
    async pending() { return scams.filter((s) => s.status === 'pending').map((s) => ({ ...s, createdAt: s.at } as any)); },
    async review(id, status) { const s = scams.find((x) => x.id === id); if (!s) return false; s.status = status; return true; },
    async addTeaching(id, at, t, deleteHash) { teach.push({ id, at, ...t, deleteHash }); },
    async remove(kind, id, hash) {
      const list = kind === 'scam' ? scams : teach;
      const i = list.findIndex((x) => x.id === id && x.deleteHash && x.deleteHash === hash);
      if (i < 0) return false;
      const [x] = list.splice(i, 1);
      return { audioKey: x!.audioKey ?? null };
    },
    async purge(before) {
      const keys = teach.filter((t) => t.at < before && t.audioKey).map((t) => t.audioKey as string);
      for (const list of [scams, teach]) for (let i = list.length - 1; i >= 0; i--) if (list[i]!.at < before) list.splice(i, 1);
      return keys;
    },
    async teachings() { return teach; },
    async bump(b) { const n = (rate.get(b) ?? 0) + 1; rate.set(b, n); return n; },
  };
  return { store, scams, teach, blobs: { put: async (k: string, data: Uint8Array, type: string) => void blobs.set(k, { data, type }), delete: async (k: string) => void blobs.delete(k) }, blobMap: blobs };
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

describe('retention (90 days) and deletion on request', () => {
  const KEY = 'k'.repeat(10) + 'Abc_-0123456789xyz'; // 28 url-safe characters, as the app sends
  const del = (b: unknown) => post('/v1/delete', b, { 'cf-connecting-ip': '9.9.9.9' });

  it('keeps only a hash of the delete key, and the phone that sent an item can delete it', async () => {
    const d = deps();
    const r = await (await handle(post('/v1/scams', { ...REPORT, deleteKey: KEY }), d)).json();
    expect(JSON.stringify(d.m.scams)).not.toContain(KEY);
    expect(d.m.scams[0]!.deleteHash).toMatch(/^[0-9a-f]{64}$/);
    expect(d.m.scams[0]).not.toHaveProperty('deleteKey');
    expect((await handle(del({ kind: 'scam', id: r.id, key: 'x'.repeat(28) }), d)).status).toBe(404); // wrong key
    expect((await handle(del({ kind: 'teach', id: r.id, key: KEY }), d)).status).toBe(404); // wrong kind
    const ok = await handle(del({ kind: 'scam', id: r.id, key: KEY }), d);
    expect(ok.status).toBe(200);
    expect(ok.headers.get('access-control-allow-origin')).toBe('capacitor://localhost');
    expect(d.m.scams).toHaveLength(0);
    expect((await handle(del({ kind: 'scam', id: r.id, key: KEY }), d)).status).toBe(404); // already gone
  });

  it('deleting a teaching deletes its recording too', async () => {
    const d = deps();
    const audio = { type: 'audio/webm', base64: btoa('x'.repeat(2000)) };
    const r = await handle(post('/v1/teach', { lang: 'pcm', phrase: 'Wetin dey happen', meaning: 'What is happening', meaningLang: 'en', audio, deleteKey: KEY }), d);
    if (r.status !== 201) return expect(await r.text()).toBe(''); // shows the validator's reason if the fixture drifts
    const { id } = await r.json();
    expect(d.m.blobMap.size).toBe(1);
    expect((await handle(del({ kind: 'teach', id, key: KEY }), d)).status).toBe(200);
    expect(d.m.teach).toHaveLength(0);
    expect(d.m.blobMap.size).toBe(0);
  });

  it('an item sent without a key cannot be deleted by anyone through the API (only by the owner, on email request)', async () => {
    const d = deps();
    const { id } = await (await handle(post('/v1/scams', REPORT), d)).json();
    expect(d.m.scams[0]!.deleteHash).toBeUndefined();
    expect((await handle(del({ kind: 'scam', id, key: KEY }), d)).status).toBe(404);
    expect(d.m.scams).toHaveLength(1);
  });

  it('refuses malformed delete requests and drops a malformed key from a post', async () => {
    const d = deps();
    for (const b of [null, {}, { kind: 'scam', id: 'x', key: KEY }, { kind: 'other', id: '00000001-aaaa-bbbb', key: KEY }, { kind: 'scam', id: '00000001-aaaa-bbbb', key: 'short' }]) {
      expect((await handle(del(b), d)).status).toBe(400);
    }
    expect((await handle(post('/v1/scams', { ...REPORT, deleteKey: 'has spaces and ; quotes' }), d)).status).toBe(201);
    expect(d.m.scams[0]!.deleteHash).toBeUndefined();
  });

  it('deletes reports, teachings and recordings older than 90 days, keeps newer ones', async () => {
    const m = memory();
    const at = (daysAgo: number) => new Date(Date.parse('2026-11-20T10:00:00Z') - daysAgo * 86_400_000).toISOString();
    await m.store.addScam('old-scam', at(91), REPORT as any);
    await m.store.addScam('new-scam', at(89), REPORT as any);
    await m.store.addTeaching('old-teach', at(120), { lang: 'pcm', meaning: 'm', meaningLang: 'en', audioKey: 'teach/pcm/old.webm', audioType: 'audio/webm' } as any);
    await m.store.addTeaching('new-teach', at(1), { lang: 'pcm', meaning: 'm', meaningLang: 'en', audioKey: 'teach/pcm/new.webm', audioType: 'audio/webm' } as any);
    await m.blobs.put('teach/pcm/old.webm', new Uint8Array(1), 'audio/webm');
    await m.blobs.put('teach/pcm/new.webm', new Uint8Array(1), 'audio/webm');
    expect(RETENTION_DAYS).toBe(90);
    expect(await purgeOld(m.store, m.blobs, new Date('2026-11-20T10:00:00Z'))).toBe(1);
    expect(m.scams.map((s) => s.id)).toEqual(['new-scam']);
    expect(m.teach.map((t) => t.id)).toEqual(['new-teach']);
    expect([...m.blobMap.keys()]).toEqual(['teach/pcm/new.webm']);
  });
});

describe('the deployed worker', () => {
  it('runs the 90-day clean-up every day and the schema has what deletion needs', async () => {
    const { readFileSync } = await import('node:fs');
    const toml = readFileSync(new URL('../wrangler.toml', import.meta.url), 'utf8');
    expect(toml).toMatch(/\[triggers\]\s*\ncrons = \["\d+ \d+ \* \* \*"\]/);
    const worker = readFileSync(new URL('../src/worker.ts', import.meta.url), 'utf8');
    expect(worker).toContain('scheduled(');
    expect(worker).toContain('purgeOld(');
    const schema = readFileSync(new URL('../schema.sql', import.meta.url), 'utf8');
    const migration = readFileSync(new URL('../migrations/0002_retention_and_deletion.sql', import.meta.url), 'utf8');
    for (const t of ['scam_reports', 'teachings']) {
      const table = schema.slice(schema.indexOf(`CREATE TABLE IF NOT EXISTS ${t} (`)).split('\n);')[0]!;
      expect(table).toContain('delete_hash TEXT');
      expect(migration).toContain(`ALTER TABLE ${t} ADD COLUMN delete_hash TEXT`);
    }
  });
});

describe('delete requests are bounded', () => {
  it('refuses a large body and limits deletes per address per day, apart from the post limit', async () => {
    const d = deps(); // maxPostsPerDay 3, so 30 deletes a day
    const big = post('/v1/delete', { kind: 'scam', id: '00000001-aaaa-bbbb', key: 'k'.repeat(28), pad: 'x'.repeat(2000) });
    expect((await handle(big, d)).status).toBe(413);
    const del = () => post('/v1/delete', { kind: 'scam', id: '00000001-aaaa-bbbb', key: 'k'.repeat(28) }, { 'cf-connecting-ip': '5.5.5.5' });
    for (let i = 0; i < 30; i++) expect((await handle(del(), d)).status).toBe(404);
    expect((await handle(del(), d)).status).toBe(429);
    // posting from that address is not affected
    expect((await handle(post('/v1/scams', REPORT, { 'cf-connecting-ip': '5.5.5.5' }), d)).status).toBe(201);
  });
});
