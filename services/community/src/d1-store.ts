import type { Blobs, PendingScam, PublishedScam, Store } from './store';

/** Minimal shapes of the Cloudflare bindings used here (no runtime dependency on workers-types). */
export interface D1Like {
  prepare(sql: string): { bind(...v: unknown[]): { run(): Promise<{ meta?: { changes?: number } }>; all<T>(): Promise<{ results: T[] }>; first<T>(): Promise<T | null> } };
}
export interface R2Like {
  put(key: string, value: Uint8Array, opts?: { httpMetadata?: { contentType?: string } }): Promise<unknown>;
  delete(key: string): Promise<unknown>;
}

/** The UTC day before `day` (YYYY-MM-DD). Rate rows from before it are deleted. */
const yesterday = (day: string): string => new Date(Date.parse(day) - 86_400_000).toISOString().slice(0, 10);

export function d1Store(db: D1Like): Store {
  return {
    async addScam(id, at, r, deleteHash) {
      await db
        .prepare('INSERT INTO scam_reports (id, created_at, region, lang, level, text, sender_kind, sender_value, claimed, signals, app_version, delete_hash) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)')
        .bind(id, at, r.region, r.lang, r.level, r.text, r.sender.kind, r.sender.value ?? null, r.claimed ?? null, JSON.stringify(r.signals), r.appVersion ?? null, deleteHash ?? null)
        .run();
    },
    async published(region, limit) {
      const { results } = await db
        .prepare(
          `SELECT s.id, s.created_at, s.level, s.text, s.sender_kind, s.sender_value, s.claimed, s.signals,
             (SELECT COUNT(*) FROM scam_reports t WHERE t.status = 'published' AND t.sender_value IS NOT NULL AND t.sender_value = s.sender_value) AS reports
           FROM scam_reports s WHERE s.region = ? AND s.status = 'published' ORDER BY s.created_at DESC LIMIT ?`,
        )
        .bind(region, limit)
        .all<Record<string, unknown>>();
      return results.map(
        (x): PublishedScam => ({
          id: String(x.id), createdAt: String(x.created_at), level: x.level as PublishedScam['level'], text: String(x.text),
          senderKind: x.sender_kind as PublishedScam['senderKind'], senderValue: (x.sender_value as string | null) ?? null,
          claimed: (x.claimed as string | null) ?? null, signals: JSON.parse(String(x.signals ?? '[]')), reports: Math.max(1, Number(x.reports ?? 1)),
        }),
      );
    },
    async pending(limit) {
      const { results } = await db.prepare("SELECT * FROM scam_reports WHERE status = 'pending' ORDER BY created_at LIMIT ?").bind(limit).all<Record<string, unknown>>();
      return results.map(
        (x): PendingScam => ({
          id: String(x.id), createdAt: String(x.created_at), region: String(x.region), lang: String(x.lang), level: x.level as PendingScam['level'], text: String(x.text),
          sender: x.sender_value ? { kind: x.sender_kind as 'number' | 'name', value: String(x.sender_value) } : { kind: 'unknown' },
          signals: JSON.parse(String(x.signals ?? '[]')), ...(x.claimed ? { claimed: String(x.claimed) } : {}),
        }),
      );
    },
    async review(id, status, at) {
      const r = await db.prepare('UPDATE scam_reports SET status = ?, reviewed_at = ? WHERE id = ?').bind(status, at, id).run();
      return (r.meta?.changes ?? 0) > 0;
    },
    async addTeaching(id, at, t, deleteHash) {
      await db
        .prepare('INSERT INTO teachings (id, created_at, lang, dialect, phrase, meaning, meaning_lang, prompt_id, audio_key, audio_type, app_version, delete_hash) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)')
        .bind(id, at, t.lang, t.dialect ?? null, t.phrase ?? null, t.meaning, t.meaningLang, t.promptId ?? null, t.audioKey ?? null, t.audioType ?? null, t.appVersion ?? null, deleteHash ?? null)
        .run();
    },
    async teachings(since, limit) {
      const { results } = await db.prepare('SELECT * FROM teachings WHERE created_at >= ? ORDER BY created_at LIMIT ?').bind(since, limit).all<Record<string, unknown>>();
      return results;
    },
    async remove(kind, id, deleteHash) {
      const table = kind === 'scam' ? 'scam_reports' : 'teachings';
      const row = await db.prepare(`SELECT ${kind === 'teach' ? 'audio_key' : 'NULL AS audio_key'} FROM ${table} WHERE id = ? AND delete_hash = ?`).bind(id, deleteHash).first<{ audio_key: string | null }>();
      if (!row) return false;
      await db.prepare(`DELETE FROM ${table} WHERE id = ? AND delete_hash = ?`).bind(id, deleteHash).run();
      return { audioKey: row.audio_key ?? null };
    },
    async purge(before) {
      const { results } = await db.prepare('SELECT audio_key FROM teachings WHERE created_at < ? AND audio_key IS NOT NULL').bind(before).all<{ audio_key: string }>();
      await db.prepare('DELETE FROM teachings WHERE created_at < ?').bind(before).run();
      await db.prepare('DELETE FROM scam_reports WHERE created_at < ?').bind(before).run();
      // Rate counters too, even on a day with no post: only today's count matters.
      await db.prepare('DELETE FROM rate WHERE day < ?').bind(yesterday(new Date().toISOString().slice(0, 10))).run();
      return results.map((r) => r.audio_key);
    },
    async bump(bucket, day) {
      await db.prepare('DELETE FROM rate WHERE day < ?').bind(yesterday(day)).run();
      const row = await db
        .prepare('INSERT INTO rate (bucket, day, n) VALUES (?, ?, 1) ON CONFLICT(bucket) DO UPDATE SET n = n + 1 RETURNING n')
        .bind(bucket, day)
        .first<{ n: number }>();
      return row?.n ?? 1;
    },
  };
}

export function r2Blobs(bucket: R2Like): Blobs {
  return {
    put: async (key, data, type) => void (await bucket.put(key, data, { httpMetadata: { contentType: type } })),
    delete: async (key) => void (await bucket.delete(key)),
  };
}
