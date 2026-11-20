import { analyze, buildSpeechPlan, type LangTag, type ReadingLexicon, type RegionConfig } from '@sabitori/core';
import { renderPlan, type PackRegistry } from '@sabitori/speech';
import { smsParts, toGsm7 } from './sms.js';

export interface ReplyDeps {
  region: RegionConfig;
  lexicons: ReadingLexicon[];
  registry: PackRegistry;
  /** yyyy-mm-dd: the day the message arrived. */
  today: string;
}

export interface SmsReply {
  text: string;
  parts: number;
  lang: LangTag;
  scam: 'likely_scam' | 'caution' | 'no_signs';
}

/** At most this many SMS parts per reply: enough for a card, cheap enough to send for free. */
export const MAX_PARTS = 3;

/**
 * "EN ..." or "FR ..." at the start chooses the reply language; otherwise the reply is in the message's own
 * language (French when it cannot tell, the most common language of official messages in Cameroon).
 */
export function chooseLang(text: string, detected: string): { lang: LangTag; body: string } {
  const m = /^\s*(EN|FR|ENG|FRA)\b[\s:,-]*/i.exec(text);
  if (m) return { lang: m[1]!.toUpperCase().startsWith('E') ? 'en' : 'fr', body: text.slice(m[0].length) };
  return { lang: detected === 'en' ? 'en' : 'fr', body: text };
}

/**
 * The card for a forwarded message, as one SMS reply: the same analysis and the same words as the app, in the
 * same order (a scam warning always first; a scam never gets its amount or date said back). Sections are dropped
 * from the end until the reply fits in MAX_PARTS. Nothing is stored.
 */
export async function smsReply(text: string, deps: ReplyDeps, from?: string): Promise<SmsReply> {
  const first = chooseLang(text, 'fr');
  const card = await analyze(
    { text: first.body, source: 'paste', receivedAt: deps.today, region: deps.region.code, ...(from ? { sender: { kind: 'unknown' as const } } : {}) },
    { region: deps.region, lexicons: deps.lexicons },
  );
  const { lang } = chooseLang(text, card.facts.lang);
  const sections = await renderPlan(buildSpeechPlan(card, { today: deps.today }), lang, deps.registry, { region: deps.region, today: deps.today });
  const lines = sections.map((s) => toGsm7(s.text.trim())).filter(Boolean);
  const head = lang === 'en' ? 'SabiTori:' : 'SabiTori :';
  let keep = lines.length;
  let out = [head, ...lines].join('\n');
  while (keep > 1 && smsParts(out) > MAX_PARTS) {
    keep--;
    out = [head, ...lines.slice(0, keep)].join('\n');
  }
  return { text: out, parts: smsParts(out), lang, scam: card.scam.level };
}
