import type { Card } from '@sabitori/core';
import { config } from '../config';

/**
 * Opt-in sharing with the owner's community service (services/community): scam reports and teachings.
 * Nothing is sent without the person pressing Send on a screen that shows exactly what goes. Without a
 * configured service, or offline, items wait in an outbox on the phone and are sent later.
 */

export interface ScamReport {
  region: string;
  lang: string;
  level: 'likely_scam' | 'caution';
  text: string;
  sender: { kind: 'number' | 'name' | 'unknown'; value?: string };
  claimed?: string;
  signals: string[];
  appVersion?: string;
}

export interface Teaching {
  lang: string;
  dialect?: string;
  phrase?: string;
  meaning: string;
  meaningLang: 'en' | 'fr';
  promptId?: string;
  audio?: { base64: string; type: string };
  appVersion?: string;
}

export interface PublishedScam {
  id: string;
  createdAt: string;
  level: 'likely_scam' | 'caution';
  text: string;
  senderKind: 'number' | 'name' | 'unknown';
  senderValue: string | null;
  claimed: string | null;
  signals: string[];
  reports: number;
}

/** `key`: a random secret sent with the item; the service keeps only its hash, so only this phone can delete the item. */
type Outgoing = ({ kind: 'scam'; body: ScamReport } | { kind: 'teach'; body: Teaching }) & { id: string; at: string; key?: string };

/** An item the service took: its id there and the secret that deletes it. Nothing else (the text stays out). */
export interface SentItem {
  kind: 'scam' | 'teach';
  id: string;
  key: string;
  at: string;
}

const OUTBOX = 'sabitori.outbox';
const REPORTED = 'sabitori.reported';
const LIST = 'sabitori.scamlist';
const TAUGHT = 'sabitori.taught';
const SENT = 'sabitori.sent';

/** The service deletes everything after this many days (services/community, docs/privacy.md 5.4). */
export const SERVICE_RETENTION_DAYS = 90;

/** 21 random bytes as 28 url-safe characters. */
export function newDeleteKey(): string {
  const b = crypto.getRandomValues(new Uint8Array(21));
  return btoa(String.fromCharCode(...b)).replace(/\+/g, '-').replace(/\//g, '_');
}

const read = <T>(k: string, d: T): T => {
  try {
    const v = localStorage.getItem(k);
    return v ? (JSON.parse(v) as T) : d;
  } catch {
    return d;
  }
};
const write = (k: string, v: unknown): void => {
  try {
    localStorage.setItem(k, JSON.stringify(v));
  } catch {
    /* storage full or blocked: the item stays in memory for this session only */
  }
};

export const communityConfigured = (): boolean => config.community !== null;

/** What a report would contain, built from a card. The person edits the text before sending. */
export function reportFromCard(card: Card, lang: string, appVersion?: string): ScamReport {
  const s = card.input.sender;
  return {
    region: card.input.region,
    lang,
    level: card.scam.level === 'caution' ? 'caution' : 'likely_scam',
    text: card.input.text.slice(0, 1500),
    sender: s && s.kind !== 'unknown' && s.value ? { kind: s.kind, value: s.value } : { kind: 'unknown' },
    signals: [...card.scam.signals],
    ...(card.scam.claimedSenderId ? { claimed: card.scam.claimedSenderId } : {}),
    ...(appVersion ? { appVersion } : {}),
  };
}

type Sent = { ok: 'sent'; id?: string } | { ok: 'retry' } | { ok: 'refused'; status: number };
async function post(path: string, body: unknown): Promise<Sent> {
  if (!config.community) return { ok: 'retry' };
  try {
    const r = await fetch(`${config.community.url}${path}`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
    if (r.ok) {
      const j = (await r.json().catch(() => null)) as { id?: unknown } | null;
      return typeof j?.id === 'string' ? { ok: 'sent', id: j.id } : { ok: 'sent' };
    }
    // 4xx other than rate limiting: the service will never take this item; do not retry it forever
    return r.status === 429 || r.status >= 500 ? { ok: 'retry' } : { ok: 'refused', status: r.status };
  } catch {
    return { ok: 'retry' };
  }
}

/** Queue an item and try to send the queue now. Resolves to what happened to this item. */
async function enqueue(item: Outgoing): Promise<'sent' | 'queued'> {
  item = { ...item, key: item.key ?? newDeleteKey() };
  write(OUTBOX, [...read<Outgoing[]>(OUTBOX, []), item]);
  await flushing; // a send already running read the outbox before this item was added
  await flushOutbox();
  return read<Outgoing[]>(OUTBOX, []).some((x) => x.id === item.id) ? 'queued' : 'sent';
}

let flushing: Promise<void> | null = null;
/** Send what waits in the outbox (called on start, when the network comes back, and after each new item). */
export function flushOutbox(): Promise<void> {
  flushing ??= (async () => {
    const box = read<Outgoing[]>(OUTBOX, []);
    const left: Outgoing[] = [];
    for (const item of box) {
      const key = item.key ?? newDeleteKey(); // items queued by an older version had none
      const r = await post(item.kind === 'scam' ? '/v1/scams' : '/v1/teach', { ...item.body, deleteKey: key });
      if (r.ok === 'retry') left.push({ ...item, key });
      else if (r.ok === 'sent' && r.id) write(SENT, [...read<SentItem[]>(SENT, []), { kind: item.kind, id: r.id, key, at: new Date().toISOString() }]);
    }
    // Keep what was added while this pass was sending (it was not in `box`), or it would be lost unsent.
    const tried = new Set(box.map((x) => x.id));
    write(OUTBOX, [...left, ...read<Outgoing[]>(OUTBOX, []).filter((x) => !tried.has(x.id))]);
  })().finally(() => {
    flushing = null;
  });
  return flushing;
}

export const outboxSize = (): number => read<Outgoing[]>(OUTBOX, []).length;

/** What this phone has sent that the service may still keep (younger than 90 days). */
export function sentItems(now = new Date()): SentItem[] {
  const cut = now.getTime() - SERVICE_RETENTION_DAYS * 86_400_000;
  return read<SentItem[]>(SENT, []).filter((s) => Date.parse(s.at) > cut);
}

/**
 * "Delete everything I sent": drops what still waits in the outbox, then asks the service to delete each item
 * this phone sent. An item the service no longer has (404) counts as deleted. What could not be reached (offline)
 * is kept for the next try. Resolves to how many items are still to delete.
 */
export async function deleteAllSent(): Promise<{ left: number }> {
  await flushing; // never race a send in progress
  write(OUTBOX, []);
  const left: SentItem[] = [];
  for (const s of sentItems()) {
    const r = await post('/v1/delete', { kind: s.kind, id: s.id, key: s.key });
    if (r.ok === 'retry' || (r.ok === 'refused' && r.status !== 404 && r.status !== 400)) left.push(s);
  }
  write(SENT, left);
  return { left: left.length };
}

export async function sendScamReport(cardId: string, body: ScamReport): Promise<'sent' | 'queued'> {
  write(REPORTED, { ...read<Record<string, string>>(REPORTED, {}), [cardId]: new Date().toISOString() });
  return enqueue({ kind: 'scam', id: `scam-${cardId}`, at: new Date().toISOString(), body });
}

export const wasReported = (cardId: string): boolean => Boolean(read<Record<string, string>>(REPORTED, {})[cardId]);

export interface TaughtItem {
  at: string;
  lang: string;
  phrase?: string;
  meaning: string;
  withAudio: boolean;
  promptId?: string;
}

export async function sendTeaching(body: Teaching): Promise<'sent' | 'queued'> {
  const at = new Date().toISOString();
  const item: TaughtItem = { at, lang: body.lang, meaning: body.meaning, withAudio: Boolean(body.audio), ...(body.phrase ? { phrase: body.phrase } : {}), ...(body.promptId ? { promptId: body.promptId } : {}) };
  write(TAUGHT, [item, ...read<TaughtItem[]>(TAUGHT, [])].slice(0, 500));
  return enqueue({ kind: 'teach', id: `teach-${at}`, at, body });
}

export const taughtItems = (): TaughtItem[] => read<TaughtItem[]>(TAUGHT, []);

/** Days in a row (ending today or yesterday) with at least one teaching. */
export function teachStreak(items: TaughtItem[] = taughtItems(), today = new Date()): number {
  const days = new Set(items.map((i) => i.at.slice(0, 10)));
  const d = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate()));
  if (!days.has(d.toISOString().slice(0, 10))) d.setUTCDate(d.getUTCDate() - 1);
  let n = 0;
  while (days.has(d.toISOString().slice(0, 10))) {
    n++;
    d.setUTCDate(d.getUTCDate() - 1);
  }
  return n;
}

/** The published list, from the network when possible, else the copy kept from the last time. */
export async function loadScamList(region: string): Promise<{ items: PublishedScam[]; fetchedAt: string | null; online: boolean }> {
  const cached = read<{ items: PublishedScam[]; fetchedAt: string | null; region?: string }>(LIST, { items: [], fetchedAt: null });
  const mine = cached.region === region ? cached : { items: [], fetchedAt: null };
  if (!config.community) return { ...mine, online: false };
  try {
    const r = await fetch(`${config.community.url}/v1/scams?region=${encodeURIComponent(region)}`);
    if (!r.ok) return { ...mine, online: false };
    const j = (await r.json()) as { items?: PublishedScam[] };
    const fresh = { items: Array.isArray(j.items) ? j.items : [], fetchedAt: new Date().toISOString(), region };
    write(LIST, fresh);
    return { items: fresh.items, fetchedAt: fresh.fetchedAt, online: true };
  } catch {
    return { ...mine, online: false };
  }
}

/** Published reports from this number (E.164 or short code), from the list kept on the phone. Never "safe". */
export function reportsFor(number: string, items: PublishedScam[]): PublishedScam[] {
  const n = number.replace(/[^\d+]/g, '');
  if (!n) return [];
  return items.filter((i) => i.senderValue && i.senderValue.replace(/[^\d+]/g, '') === n);
}
