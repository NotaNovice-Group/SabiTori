import { analyze, buildSpeechPlan, type LangTag, type ReadingLexicon, type RegionConfig } from '@sabitori/core';
import { renderPlan, type PackRegistry } from '@sabitori/speech';
import { chooseLang, composeReply, MAX_PARTS } from './compose.js';

export { chooseLang, MAX_PARTS };

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
  const { text: out, parts } = composeReply(sections.map((x) => x.text), lang);
  return { text: out, parts, lang, scam: card.scam.level };
}
