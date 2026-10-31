/**
 * Slot handling. A catalog sentence holds {slots}; a translator may move them
 * anywhere. For recording, a translation is cut at its slots: the text pieces
 * are recorded as clips, the slots are filled in by SabiTori's number, date
 * and name rules.
 */
import type { AudioPart } from '@sabitori/core';

export type Piece =
  | { kind: 'text'; text: string; index: number; id: string }
  | { kind: 'slot'; name: string };

const SLOT_RE = /\{(\w+)\}/g;

/** Slot names in order of appearance (duplicates kept). */
export function slotsIn(text: string): string[] {
  return [...text.matchAll(SLOT_RE)].map((m) => m[1]!);
}

/** Deterministic clip id for the nth text piece of a phrase. */
export function clipId(phraseKey: string, pieceIndex: number): string {
  return `${phraseKey}.${pieceIndex}`;
}

/**
 * Cut a sentence at its slots. Text pieces are trimmed; pieces with no letters
 * in them (only spaces or lone punctuation) are dropped because there is
 * nothing to say. Text pieces are numbered 0, 1, 2 in order.
 */
export function splitAtSlots(phraseKey: string, text: string): Piece[] {
  const out: Piece[] = [];
  let last = 0;
  let n = 0;
  const pushText = (raw: string) => {
    const t = raw.replace(/^[\s,;:]+/, '').trim();
    if (!/[\p{L}\p{N}]/u.test(t)) return;
    out.push({ kind: 'text', text: t, index: n, id: clipId(phraseKey, n) });
    n += 1;
  };
  for (const m of text.matchAll(SLOT_RE)) {
    pushText(text.slice(last, m.index));
    out.push({ kind: 'slot', name: m[1]! });
    last = m.index + m[0].length;
  }
  pushText(text.slice(last));
  return out;
}

export function textPieces(phraseKey: string, text: string) {
  return splitAtSlots(phraseKey, text).filter(
    (p): p is Extract<Piece, { kind: 'text' }> => p.kind === 'text',
  );
}

/** PhraseEntry.audio: the clips and slots in speaking order. */
export function buildAudio(phraseKey: string, text: string): AudioPart[] {
  return splitAtSlots(phraseKey, text).map((p) =>
    p.kind === 'text' ? { clip: p.id } : { slot: p.name },
  );
}

export interface SlotCheck {
  ok: boolean;
  missing: string[];
  extra: string[];
  /** Stray or broken braces such as "{amount" or "{}". */
  malformed: boolean;
}

/** A translation must use exactly the catalog's slots (each at least once, none invented). */
export function validateSlots(text: string, expected: readonly string[]): SlotCheck {
  const found = new Set(slotsIn(text));
  const want = new Set(expected);
  const missing = [...want].filter((s) => !found.has(s));
  const extra = [...found].filter((s) => !want.has(s));
  const stripped = text.replace(SLOT_RE, '');
  const malformed = /[{}]/.test(stripped);
  return { ok: missing.length === 0 && extra.length === 0 && !malformed, missing, extra, malformed };
}

/** Text with slots split out, for drawing chips. */
export function tokens(text: string): ({ t: 'text'; v: string } | { t: 'slot'; v: string })[] {
  const out: ({ t: 'text'; v: string } | { t: 'slot'; v: string })[] = [];
  let last = 0;
  for (const m of text.matchAll(SLOT_RE)) {
    if (m.index > last) out.push({ t: 'text', v: text.slice(last, m.index) });
    out.push({ t: 'slot', v: m[1]! });
    last = m.index + m[0].length;
  }
  if (last < text.length) out.push({ t: 'text', v: text.slice(last) });
  return out;
}
