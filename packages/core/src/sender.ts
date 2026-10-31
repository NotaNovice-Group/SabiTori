import type { MessageInput, Sender } from './types.js';
import type { OfficialSender, RegionConfig } from './region.js';
import type { ReadingLexicon } from './reading.js';
import { collect, escapeRe, findTerms, fold } from './text.js';

const norm = (s: string) => fold(s).replace(/[^\p{L}\p{N}]/gu, '');

/** Position window (characters) where a company name counts as the message's author. */
const HEAD = 100;
const TAIL = 60;

function aliasRe(alias: string): RegExp {
  const body = escapeRe(fold(alias).trim()).replace(/\s+/g, '\\s+');
  return new RegExp(`(?<![\\p{L}\\p{N}])${body}(?![\\p{L}\\p{N}])`, 'gu');
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
      if (ids.includes(g)) return { sender: { officialId: o.id, displayName: o.displayName, verified: true } };
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
    const n = fold(input.text);
    const via = collect(lexicons, (l) => l.scam.viaWords);
    const viaHits = findTerms(n, via);
    for (const o of region.officialSenders) {
      for (const a of o.aliases) {
        const re = aliasRe(a);
        let m: RegExpExecArray | null;
        while ((m = re.exec(n))) {
          const inHead = m.index < HEAD;
          const inTail = m.index + m[0].length > n.length - TAIL;
          if (!inHead && !inTail) continue;
          const channel = viaHits.some((v) => v.end <= m!.index && m!.index - v.end <= 3);
          if (channel) continue;
          consider(o, a.length);
        }
      }
    }
  }
  const claimed = best as { o: OfficialSender; len: number } | undefined;
  return claimed ? { sender: { verified: false }, claimedSenderId: claimed.o.id } : { sender: { verified: false } };
}
