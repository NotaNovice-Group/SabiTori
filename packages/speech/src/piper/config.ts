/**
 * Piper model config (the `<model>.onnx.json` that ships next to every Piper voice) and the pure
 * text-to-ids steps. No DOM, no wasm: everything here is unit-tested.
 */

export interface PiperConfig {
  audio: { sample_rate: number };
  /** espeak-ng voice name, e.g. "fr" or "en-gb-x-rp". Only used when phonemeType is "espeak". */
  espeak?: { voice: string };
  /** "espeak" (default, older configs omit it) needs the phonemizer; "text" maps characters straight to ids. */
  phoneme_type?: 'espeak' | 'text';
  inference: { noise_scale: number; length_scale: number; noise_w: number };
  phoneme_id_map: Record<string, number[]>;
  num_speakers?: number;
  speaker_id_map?: Record<string, number>;
}

export const PAD = '_';
export const BOS = '^';
export const EOS = '$';

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);

export function parsePiperConfig(json: unknown): PiperConfig {
  if (!isObj(json)) throw new Error('Piper config is not an object');
  const audio = json.audio;
  if (!isObj(audio) || typeof audio.sample_rate !== 'number' || !(audio.sample_rate > 0)) throw new Error('Piper config: audio.sample_rate missing');
  const map = json.phoneme_id_map;
  if (!isObj(map)) throw new Error('Piper config: phoneme_id_map missing');
  for (const [k, v] of Object.entries(map)) {
    if (!Array.isArray(v) || !v.every((n) => Number.isInteger(n))) throw new Error(`Piper config: phoneme_id_map["${k}"] must be a list of integers`);
  }
  const type = json.phoneme_type ?? 'espeak';
  if (type !== 'espeak' && type !== 'text') throw new Error(`Piper config: unsupported phoneme_type "${String(type)}"`);
  const inf = isObj(json.inference) ? json.inference : {};
  const num = (v: unknown, d: number): number => (typeof v === 'number' && Number.isFinite(v) ? v : d);
  const espeak = isObj(json.espeak) && typeof json.espeak.voice === 'string' ? { voice: json.espeak.voice } : undefined;
  if (type === 'espeak' && !espeak) throw new Error('Piper config: espeak.voice is required for phoneme_type "espeak"');
  return {
    audio: { sample_rate: audio.sample_rate },
    ...(espeak ? { espeak } : {}),
    phoneme_type: type,
    inference: { noise_scale: num(inf.noise_scale, 0.667), length_scale: num(inf.length_scale, 1), noise_w: num(inf.noise_w, 0.8) },
    phoneme_id_map: map as Record<string, number[]>,
    num_speakers: typeof json.num_speakers === 'number' ? json.num_speakers : 1,
    ...(isObj(json.speaker_id_map) ? { speaker_id_map: json.speaker_id_map as Record<string, number> } : {}),
  };
}

/**
 * Piper's id sequence: BOS, then for each symbol its id(s) followed by PAD, then EOS. Symbols that
 * the model does not know are skipped (Piper does the same).
 */
export function symbolsToIds(symbols: Iterable<string>, map: Record<string, number[]>): number[] {
  const pad = map[PAD] ?? [0];
  const ids: number[] = [...(map[BOS] ?? [])];
  ids.push(...pad);
  for (const s of symbols) {
    const id = map[s];
    if (!id) continue;
    ids.push(...id, ...pad);
  }
  ids.push(...(map[EOS] ?? []));
  return ids;
}

export interface TextIds {
  ids: number[];
  /** Letters, digits and number-like characters in the text (what must be spoken). */
  letters: number;
  /** Of those, how many the voice does not know and had to drop. */
  dropped: number;
}

const SPOKEN = /[\p{L}\p{N}]/u;

/**
 * phoneme_type "text": characters are the symbols. NFD first because Piper's text voices are trained
 * on decomposed text; a symbol missing from the map is retried in its composed form (NFC) so a voice
 * trained on precomposed letters still works. A character the voice does not know is retried in lower case
 * (voices trained on lower-case text do not know "E" of "ENEO") before it is dropped.
 * Reports how many letters and digits were dropped, so a caller can refuse mostly-unknown text.
 */
export function textToIdsChecked(text: string, map: Record<string, number[]>): TextIds {
  const run = (form: 'NFD' | 'NFC'): { symbols: string[]; letters: number; dropped: number; lost: number } => {
    const symbols: string[] = [];
    let letters = 0;
    let dropped = 0;
    let lost = 0;
    for (const ch of text.normalize(form)) {
      const spoken = SPOKEN.test(ch);
      if (spoken) letters += 1;
      let use: string | undefined = map[ch] ? ch : undefined;
      if (!use) {
        const lower = ch.toLowerCase().normalize(form);
        if (lower !== ch && map[lower]) use = lower;
      }
      if (use) symbols.push(use);
      else {
        lost += 1;
        if (spoken) dropped += 1;
      }
    }
    return { symbols, letters, dropped, lost };
  };
  const nfd = run('NFD');
  const nfc = run('NFC');
  // Whichever form leaves fewer letters unknown to the model (ties: NFD, as Piper's own text voices are trained).
  const best = nfc.dropped < nfd.dropped || (nfc.dropped === nfd.dropped && nfc.lost < nfd.lost) ? nfc : nfd;
  return { ids: symbolsToIds(best.symbols, map), letters: best.letters, dropped: best.dropped };
}

export function textToIds(text: string, map: Record<string, number[]>): number[] {
  return textToIdsChecked(text, map).ids;
}

/** Text of which the voice knows at most this share of the letters is not spoken: the caller falls back to another voice. */
export const MIN_KNOWN_SHARE = 0.5;

/** Phonemes from espeak (already split into symbols) to ids. */
export function phonemesToIds(phonemes: string[], map: Record<string, number[]>): number[] {
  return symbolsToIds(phonemes, map);
}

/**
 * App speaking rate (1 = normal, 2 = twice as fast) to a multiplier of the model's own length_scale
 * (Piper: bigger = slower). Clamped so that a wild value cannot produce a mush or a crawl.
 */
export function lengthScaleForRate(rate: number): number {
  const r = Number.isFinite(rate) && rate > 0 ? rate : 1;
  return Math.min(Math.max(Number((1 / r).toFixed(3)), 0.4), 2.5);
}

/**
 * Splits text into sentences for synthesis; each is one Piper call, so playback can start after the
 * first one. A "." only ends a sentence before whitespace or the end ("5.000" stays whole), and a piece
 * of three characters or fewer ("M.", "Dr.") is joined to the next one.
 */
export function splitSentences(text: string, maxChars = 220): string[] {
  const clean = text.replace(/\s+/g, ' ').trim();
  if (!clean) return [];
  const raw = clean.split(/(?<=[.!?…;。])\s+/);
  const merged: string[] = [];
  let carry = '';
  for (const piece of raw) {
    const p = carry ? `${carry} ${piece}` : piece;
    if (p.length <= 3 && piece !== raw[raw.length - 1]) carry = p;
    else {
      merged.push(p);
      carry = '';
    }
  }
  if (carry) merged.push(carry);
  const out: string[] = [];
  for (let p of merged) {
    while (p.length > maxChars) {
      const win = p.slice(0, maxChars);
      let cut = Math.max(win.lastIndexOf(', '), win.lastIndexOf(': '));
      if (cut < maxChars * 0.3) cut = win.lastIndexOf(' ');
      if (cut <= 0) cut = maxChars - 1;
      out.push(p.slice(0, cut + 1).trim());
      p = p.slice(cut + 1).trim();
    }
    if (p) out.push(p);
  }
  return out;
}
