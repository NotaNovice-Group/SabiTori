/**
 * The SMS reply text from a card's rendered sections. Browser-safe (no Node imports): the gateway service and the
 * Android relay build both use it, so a forwarded message gets the same reply whichever route carries it.
 */
import { smsParts, toGsm7 } from './sms.js';

export { smsParts, isGsm7, toGsm7 } from './sms.js';

/** At most this many SMS parts per reply: enough for a card, cheap enough to send. */
export const MAX_PARTS = 3;

export type ReplyLang = 'fr' | 'en';

/**
 * "EN ..." or "FR ..." at the start chooses the reply language; otherwise the reply is in the message's own
 * language (French when it cannot tell, the most common language of official messages in Cameroon).
 */
export function chooseLang(text: string, detected: string): { lang: ReplyLang; body: string } {
  const m = /^\s*(EN|FR|ENG|FRA)\b[\s:,-]*/i.exec(text);
  if (m) return { lang: m[1]!.toUpperCase().startsWith('E') ? 'en' : 'fr', body: text.slice(m[0].length) };
  return { lang: detected === 'en' ? 'en' : 'fr', body: text };
}

/**
 * The card's sections (already in speaking order: a scam warning first, no money on a scam) as one SMS, GSM-7 only.
 * Sections are dropped from the end until the reply fits in MAX_PARTS.
 */
export function composeReply(sectionTexts: string[], lang: ReplyLang): { text: string; parts: number } {
  const lines = sectionTexts.map((t) => toGsm7(t.trim())).filter(Boolean);
  const head = lang === 'en' ? 'SabiTori:' : 'SabiTori :';
  let keep = lines.length;
  let out = [head, ...lines].join('\n');
  while (keep > 1 && smsParts(out) > MAX_PARTS) {
    keep--;
    out = [head, ...lines.slice(0, keep)].join('\n');
  }
  return { text: out, parts: smsParts(out) };
}
