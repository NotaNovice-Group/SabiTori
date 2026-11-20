import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { d1Store, type D1Like } from '../src/d1-store';

// The real SQL of the D1 store, run on SQLite (D1 is SQLite) with the real schema.sql.
const { DatabaseSync } = createRequire(import.meta.url)('node:sqlite') as typeof import('node:sqlite');

function d1(): { db: D1Like; raw: InstanceType<typeof DatabaseSync> } {
  const raw = new DatabaseSync(':memory:');
  raw.exec(readFileSync(new URL('../schema.sql', import.meta.url), 'utf8'));
  const db: D1Like = {
    prepare: (sql) => ({
      bind: (...v) => {
        const st = () => raw.prepare(sql);
        const args = v as Array<string | number | null>;
        return {
          run: async () => ({ meta: { changes: Number(st().run(...args).changes) } }),
          all: async <T>() => ({ results: st().all(...args) as T[] }),
          first: async <T>() => (st().get(...args) as T) ?? null,
        };
      },
    }),
  };
  return { db, raw };
}

const REPORT = { region: 'CM', lang: 'fr', level: 'likely_scam' as const, text: 'Envoyez votre code PIN maintenant.', sender: { kind: 'number' as const, value: '+237699001122' }, signals: ['asks_pin'] };
const count = (raw: InstanceType<typeof DatabaseSync>, t: string) => Number((raw.prepare(`SELECT COUNT(*) AS n FROM ${t}`).get() as { n: number }).n);

describe('D1 store (real SQL on SQLite)', () => {
  it('deletes an item only with its delete hash, and returns its recording', async () => {
    const { db, raw } = d1();
    const s = d1Store(db);
    await s.addScam('s1', '2026-11-20T10:00:00Z', REPORT, 'h1');
    await s.addScam('s2', '2026-11-20T10:00:00Z', REPORT); // sent without a key
    await s.addTeaching('t1', '2026-11-20T10:00:00Z', { lang: 'dua', meaning: 'Hello', meaningLang: 'en', audioKey: 'teach/dua/x.webm', audioType: 'audio/webm' }, 'h2');
    expect(await s.remove('scam', 's1', 'wrong')).toBe(false);
    expect(await s.remove('teach', 's1', 'h1')).toBe(false);
    expect(await s.remove('scam', 's2', '')).toBe(false); // no hash stored: never deletable this way
    expect(await s.remove('scam', 's1', 'h1')).toEqual({ audioKey: null });
    expect(await s.remove('teach', 't1', 'h2')).toEqual({ audioKey: 'teach/dua/x.webm' });
    expect(count(raw, 'scam_reports')).toBe(1);
    expect(count(raw, 'teachings')).toBe(0);
  });

  it('purges what is older than the cut-off, with recordings, and old rate rows', async () => {
    const { db, raw } = d1();
    const s = d1Store(db);
    await s.addScam('old', '2026-08-01T00:00:00Z', REPORT);
    await s.addScam('new', '2026-11-19T00:00:00Z', REPORT);
    await s.addTeaching('t-old', '2026-08-01T00:00:00Z', { lang: 'dua', meaning: 'm', meaningLang: 'en', audioKey: 'a/old.webm', audioType: 'audio/webm' });
    await s.addTeaching('t-new', '2026-11-19T00:00:00Z', { lang: 'dua', meaning: 'm', meaningLang: 'en' });
    raw.prepare("INSERT INTO rate (bucket, day, n) VALUES ('b-old', '2020-01-01', 3)").run();
    expect(await s.purge('2026-08-22T00:00:00Z')).toEqual(['a/old.webm']);
    expect((raw.prepare('SELECT id FROM scam_reports').all() as Array<{ id: string }>).map((r) => r.id)).toEqual(['new']);
    expect((raw.prepare('SELECT id FROM teachings').all() as Array<{ id: string }>).map((r) => r.id)).toEqual(['t-new']);
    expect(count(raw, 'rate')).toBe(0);
  });

  it('counts posts per bucket per day and keeps rate rows from yesterday and today only', async () => {
    const { db, raw } = d1();
    const s = d1Store(db);
    for (const d of ['2026-11-17', '2026-11-18', '2026-11-19']) raw.prepare('INSERT INTO rate (bucket, day, n) VALUES (?, ?, 1)').run(`b-${d}`, d);
    expect(await s.bump('b-today', '2026-11-20')).toBe(1);
    expect(await s.bump('b-today', '2026-11-20')).toBe(2);
    expect((raw.prepare('SELECT day FROM rate ORDER BY day').all() as Array<{ day: string }>).map((r) => r.day)).toEqual(['2026-11-19', '2026-11-20']);
  });

  it('the migration adds what an older database lacks', () => {
    const raw = new DatabaseSync(':memory:');
    const schema = readFileSync(new URL('../schema.sql', import.meta.url), 'utf8').replace(/,\s*(--[^\n]*\n\s*)*delete_hash TEXT/g, '');
    raw.exec(schema.replace(/CREATE INDEX IF NOT EXISTS (scam_reports|teachings)_created[^;]*;/g, ''));
    raw.exec(readFileSync(new URL('../migrations/0002_retention_and_deletion.sql', import.meta.url), 'utf8'));
    for (const t of ['scam_reports', 'teachings']) {
      expect((raw.prepare(`PRAGMA table_info(${t})`).all() as Array<{ name: string }>).map((c) => c.name)).toContain('delete_hash');
    }
  });
});
