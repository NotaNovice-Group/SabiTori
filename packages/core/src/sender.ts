import type { MessageInput, Sender } from './types.js';
import type { OfficialSender, RegionConfig } from './region.js';
import type { ReadingLexicon } from './reading.js';
import { collect, escapeRe, findTerms, fold, termSource } from './text.js';

const norm = (s: string) => fold(s).replace(/[^\p{L}\p{N}]/gu, '');

/** Position window (characters) where a company name counts as the message's author. */
const HEAD = 100;
const TAIL = 60;

function aliasRe(alias: string): RegExp {
  const body = escapeRe(fold(alias).trim()).replace(/\s+/g, '\\s+');
  return new RegExp(`(?<![\\p{L}\\p{N}])${body}(?![\\p{L}\\p{N}])`, 'gu');
}

/**
 * An alias written with inner capitals ("MoMo", "MTN", "ENEO") is a brand token: the text must spell it
 * the same way or in all capitals. "Momo Jean" (a first name) is not the brand.
 */
function brandCase(alias: string, written: string): boolean {
  const t = alias.trim();
  if (/\s/.test(t) || !/\p{Lu}/u.test(t.slice(1))) return true;
  return written === t || written === written.toUpperCase();
}

type Hit = { o: OfficialSender; start: number; end: number; alias: string };

/**
 * Company names found in the text. `winners` are names that can be the author; `channels` are names
 * used as a payment channel ("via Orange Money", or a second name after "ou"), never the author.
 */
function aliasHits(
  input: MessageInput,
  region: RegionConfig,
  lexicons: ReadingLexicon[],
): { winners: Hit[]; channels: Hit[] } {
  const n = fold(input.text);
  const via = collect(lexicons, (l) => l.scam.viaWords);
  const viaHits = findTerms(n, via);
  const joins = collect(lexicons, (l) => l.scam.joinWords);
  const joinRe = new RegExp(
    `^\\s*(?:[,/&]|${joins.length ? joins.map((j) => termSource(j)).join('|') : '(?!)'})?\\s*$`,
    'u',
  );
  const all: Hit[] = [];
  for (const o of region.officialSenders) {
    for (const a of o.aliases) {
      const re = aliasRe(a);
      let m: RegExpExecArray | null;
      while ((m = re.exec(n))) {
        if (!brandCase(a, input.text.slice(m.index, m.index + m[0].length))) continue;
        all.push({ o, start: m.index, end: m.index + m[0].length, alias: a });
      }
    }
  }
  // Earliest first; at the same place the longest alias; a hit inside an earlier hit is dropped.
  all.sort((x, y) => x.start - y.start || y.end - x.end);
  const hits: Hit[] = [];
  for (const h of all) if (!hits.some((k) => h.start < k.end && k.start < h.end)) hits.push(h);
  const winners: Hit[] = [];
  const channels: Hit[] = [];
  hits.forEach((h, i) => {
    const prev = hits[i - 1];
    const channel =
      viaHits.some((v) => v.end <= h.start && h.start - v.end <= 3) ||
      (prev !== undefined && joinRe.test(n.slice(prev.end, h.start)));
    (channel ? channels : winners).push(h);
  });
  return { winners, channels };
}

/** Character ranges of company names used as payment channels. Not evidence of what the message is about. */
export function channelSpans(
  input: MessageInput,
  region: RegionConfig,
  lexicons: ReadingLexicon[] = [],
): { start: number; end: number }[] {
  return aliasHits(input, region, lexicons).channels.map(({ start, end }) => ({ start, end }));
}

export function matchSender(
  input: MessageInput,
  region: RegionConfig,
  lexicons: ReadingLexicon[] = [],
): { sender: Sender; claimedSenderId?: string } {
  const given = input.sender?.value?.trim();
  const givenKind = input.sender?.kind;

  // 1. Verified: the id/number must be on a VERIFIED official sender's own lists.
  if (given && (givenKind === 'name' || givenKind === 'number')) {
    const g = norm(given);
    for (const o of region.officialSenders) {
      if (!o.verified) continue;
      const ids = [...o.smsSenderIds, ...o.shortCodes].map(norm).filter(Boolean);
      // A verified sender is still the company it names: its own helpline and codes stay recognisable.
      if (ids.includes(g))
        return { sender: { officialId: o.id, displayName: o.displayName, verified: true }, claimedSenderId: o.id };
    }
  }

  // 2. Claimed: the sender name, or the text, names an official company.
  let best: { o: OfficialSender; len: number } | undefined;
  const consider = (o: OfficialSender, len: number) => {
    if (!best || len > best.len) best = { o, len };
  };
  if (given && givenKind === 'name') {
    const g = fold(given);
    for (const o of region.officialSenders)
      for (const a of o.aliases) if (aliasRe(a).test(g)) consider(o, 1000 + a.length);
  }
  if (!best) {
    const { winners } = aliasHits(input, region, lexicons);
    const n = fold(input.text);
    const inHead = winners.filter((h) => h.start < HEAD);
    const inTail = winners.filter((h) => h.end > n.length - TAIL);
    const w = inHead[0] ?? inTail[0];
    if (w) consider(w.o, w.alias.length);
  }
  const claimed = best as { o: OfficialSender; len: number } | undefined;
  return claimed ? { sender: { verified: false }, claimedSenderId: claimed.o.id } : { sender: { verified: false } };
}
