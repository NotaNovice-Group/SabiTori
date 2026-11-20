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

type Outgoing = { kind: 'scam'; id: string; at: string; body: ScamReport } | { kind: 'teach'; id: string; at: string; body: Teaching };

const OUTBOX = 'sabitori.outbox';
const REPORTED = 'sabitori.reported';
const LIST = 'sabitori.scamlist';
const TAUGHT = 'sabitori.taught';

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

async function post(path: string, body: unknown): Promise<'sent' | 'retry' | 'refused'> {
  if (!config.community) return 'retry';
  try {
    const r = await fetch(`${config.community.url}${path}`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
    if (r.ok) return 'sent';
    // 4xx other than rate limiting: the service will never take this item; do not retry it forever
    return r.status === 429 || r.status >= 500 ? 'retry' : 'refused';
  } catch {
    return 'retry';
  }
}

/** Queue an item and try to send the queue now. Resolves to what happened to this item. */
async function enqueue(item: Outgoing): Promise<'sent' | 'queued'> {
  write(OUTBOX, [...read<Outgoing[]>(OUTBOX, []), item]);
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
      const r = await post(item.kind === 'scam' ? '/v1/scams' : '/v1/teach', item.body);
      if (r === 'retry') left.push(item);
    }
    write(OUTBOX, left);
  })().finally(() => {
    flushing = null;
  });
  return flushing;
}

export const outboxSize = (): number => read<Outgoing[]>(OUTBOX, []).length;

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
