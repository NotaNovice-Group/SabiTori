/**
 * Pure steps of the voice recipe (README.md): from an exported recorded pack to a Piper training list, and the
 * check that a trained voice can say a pack's text with the app's own Piper code. No file system here.
 */
import { parsePiperConfig, textToIdsChecked } from '../src/piper/config.js';

/** A pack folder as the Recorder exports it (only what the recipe reads). */
export interface ExportedPack {
  manifest: { tag: string; license?: string; voice?: { kind?: string } };
  phrases: Record<string, { text: string; audio?: ({ clip: string } | { slot: string })[] }>;
  /** audio/index.json: clip ids, or { id, file }. */
  index: { clips: (string | { id: string; file: string })[] };
}

export interface DatasetRow {
  id: string;
  /** The audio file inside the pack's audio/ folder. */
  file: string;
  text: string;
}

const SLOT_RE = /\{(\w+)\}/g;

/**
 * The text said in each clip of a phrase: the phrase text cut at its {slots}, trimmed, pieces with no letter or
 * digit dropped, numbered in order. The Recorder names clips `<phrase key>.<n>` the same way
 * (apps/recorder/src/lib/slots.ts; apps/recorder/test/train-voice.test.ts checks the two agree).
 */
export function phraseClipTexts(key: string, text: string): { id: string; text: string }[] {
  const out: { id: string; text: string }[] = [];
  let last = 0;
  const push = (raw: string) => {
    const t = raw.replace(/^[\s,;:]+/, '').trim();
    if (/[\p{L}\p{N}]/u.test(t)) out.push({ id: `${key}.${out.length}`, text: t });
  };
  for (const m of text.matchAll(SLOT_RE)) {
    push(text.slice(last, m.index));
    last = m.index! + m[0].length;
  }
  push(text.slice(last));
  return out;
}

/**
 * Training rows: every phrase clip the pack really has, with its words. Number, date and name clips are single
 * words whose spelling lives in rules.json; they are listed as skipped (a first voice learns from sentences).
 */
export function buildDataset(pack: ExportedPack): { rows: DatasetRow[]; skipped: string[]; missing: string[] } {
  const files = new Map(pack.index.clips.map((c) => (typeof c === 'string' ? [c, `${c}.webm`] : [c.id, c.file])));
  const rows: DatasetRow[] = [];
  const used = new Set<string>();
  const missing: string[] = [];
  for (const [key, entry] of Object.entries(pack.phrases)) {
    if (!entry.audio?.length) continue;
    for (const piece of phraseClipTexts(key, entry.text)) {
      const file = files.get(piece.id);
      if (!file) {
        missing.push(piece.id);
        continue;
      }
      rows.push({ id: piece.id, file, text: piece.text });
      used.add(piece.id);
    }
  }
  const skipped = [...files.keys()].filter((id) => !used.has(id)).sort();
  rows.sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  return { rows, skipped, missing };
}

/** LJSpeech-style list Piper's preprocessing reads: `<id>|<text>`, one per line. */
export function metadataCsv(rows: DatasetRow[]): string {
  for (const r of rows) if (/[|\n\r]/.test(r.text) || /[|\n\r]/.test(r.id)) throw new Error(`Clip ${r.id}: "|" or a line break in the text`);
  return rows.map((r) => `${r.id}|${r.text}`).join('\n') + '\n';
}

/** A pack whose community has not chosen a licence may be used only with the community's written agreement. */
export const needsAgreement = (pack: ExportedPack): boolean => !pack.manifest.license || pack.manifest.license.startsWith('LicenseRef-');

export interface VoiceCheck {
  ok: boolean;
  problems: string[];
  /** Characters of the pack's text that the voice cannot say (after the app's own NFD/NFC/lower-case retries). */
  unknown: string[];
}

/**
 * Can the app use this voice for this pack? The config must parse with the app's own parser, use
 * phoneme_type "text" (local languages have no espeak-ng phonemizer), and know every letter of the pack's text.
 */
export function checkVoice(configJson: unknown, texts: string[]): VoiceCheck {
  const problems: string[] = [];
  let cfg;
  try {
    cfg = parsePiperConfig(configJson);
  } catch (e) {
    return { ok: false, problems: [(e as Error).message], unknown: [] };
  }
  if (cfg.phoneme_type !== 'text') problems.push(`phoneme_type is "${cfg.phoneme_type}"; a local-language voice must use "text"`);
  const unknown = new Set<string>();
  for (const t of texts) {
    for (const ch of new Set(t)) {
      const r = textToIdsChecked(ch, cfg.phoneme_id_map);
      if (r.letters > 0 && r.dropped > 0) unknown.add(ch);
    }
  }
  if (unknown.size) problems.push(`the voice cannot say: ${[...unknown].join(' ')}`);
  return { ok: problems.length === 0, problems, unknown: [...unknown] };
}
