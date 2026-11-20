/**
 * Choosing the phone's best voice. iOS lists every installed voice; its identifier says the quality
 * ("…premium…", "…enhanced…", Siri voices) and the default for a language is often the small "compact"
 * one, which sounds robotic. Novelty voices (Zarvox, Bubbles…) and the Eloquence voices must never speak a card.
 */
export interface PhoneVoice {
  voiceURI: string;
  name: string;
  lang: string;
}

const NOVELTY = /\b(albert|bad news|bahh|bells|boing|bubbles|cellos|good news|jester|organ|superstar|trinoids|whisper|wobble|zarvox|fred|junior|ralph|kathy|deranged|hysterical|pipe organ)\b/i;

/** 3 premium, 2 enhanced or Siri, 1 an ordinary voice, 0 compact, -1 never. */
export function voiceRank(v: PhoneVoice): number {
  const id = `${v.voiceURI} ${v.name}`.toLowerCase();
  if (id.includes('eloquence') || id.includes('speech.synthesis.voice.') || NOVELTY.test(v.name)) return -1;
  if (id.includes('premium')) return 3;
  if (id.includes('enhanced') || id.includes('siri')) return 2;
  if (id.includes('compact')) return 0;
  return 1;
}

/** Index (in the list) of the best voice for a BCP-47 tag: same language, the same region first, highest rank. */
export function pickVoice(voices: readonly PhoneVoice[], bcp47: string): { index: number; rank: number } | null {
  const want = bcp47.toLowerCase().replace('_', '-');
  const lang = want.split('-')[0];
  let best: { index: number; rank: number; score: number } | null = null;
  voices.forEach((v, index) => {
    const l = v.lang.toLowerCase().replace('_', '-');
    if (l.split('-')[0] !== lang) return;
    const rank = voiceRank(v);
    if (rank < 0) return;
    const score = rank * 10 + (l === want ? 1 : 0);
    if (!best || score > best.score) best = { index, rank, score };
  });
  return best ? { index: (best as { index: number }).index, rank: (best as { rank: number }).rank } : null;
}

/** A voice at least this good is preferred over the bundled Piper voice on iOS. */
export const SMOOTH_RANK = 2;
