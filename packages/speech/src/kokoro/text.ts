/**
 * Kokoro-82M text steps, all pure (no DOM, no wasm) and unit-tested:
 * espeak-ng IPA -> Kokoro's phoneme spelling -> token ids, the style row a sequence uses, and how text is cut
 * into pieces the model can take.
 *
 * Kokoro reads IPA characters one by one. Its vocabulary is fixed by the model (onnx-community/Kokoro-82M-v1.0-ONNX,
 * tokenizer.json), so it is written here instead of fetched: a different model needs different code anyway.
 */

/** tokenizer.json `model.vocab` of onnx-community/Kokoro-82M-v1.0-ONNX (revision pinned in scripts/fetch-kokoro.mjs). "$" (0) is the pad. */
export const KOKORO_VOCAB: Readonly<Record<string, number>> = Object.freeze({
  $: 0, ';': 1, ':': 2, ',': 3, '.': 4, '!': 5, '?': 6, '—': 9, '…': 10, '"': 11, '(': 12, ')': 13, '“': 14, '”': 15, ' ': 16,
  '̃': 17, ʣ: 18, ʥ: 19, ʦ: 20, ʨ: 21, ᵝ: 22, ꭧ: 23, A: 24, I: 25, O: 31, Q: 33, S: 35, T: 36, W: 39, Y: 41, ᵊ: 42,
  a: 43, b: 44, c: 45, d: 46, e: 47, f: 48, h: 50, i: 51, j: 52, k: 53, l: 54, m: 55, n: 56, o: 57, p: 58, q: 59, r: 60,
  s: 61, t: 62, u: 63, v: 64, w: 65, x: 66, y: 67, z: 68, ɑ: 69, ɐ: 70, ɒ: 71, æ: 72, β: 75, ɔ: 76, ɕ: 77, ç: 78, ɖ: 80,
  ð: 81, ʤ: 82, ə: 83, ɚ: 85, ɛ: 86, ɜ: 87, ɟ: 90, ɡ: 92, ɥ: 99, ɨ: 101, ɪ: 102, ʝ: 103, ɯ: 110, ɰ: 111, ŋ: 112, ɳ: 113,
  ɲ: 114, ɴ: 115, ø: 116, ɸ: 118, θ: 119, œ: 120, ɹ: 123, ɾ: 125, ɻ: 126, ʁ: 128, ɽ: 129, ʂ: 130, ʃ: 131, ʈ: 132, ʧ: 133,
  ʊ: 135, ʋ: 136, ʌ: 138, ɣ: 139, ɤ: 140, χ: 142, ʎ: 143, ʒ: 147, ʔ: 148, ˈ: 156, ˌ: 157, ː: 158, ʰ: 162, ʲ: 164, '↓': 169,
  '→': 171, '↗': 172, '↘': 173, ᵻ: 177,
});

/** The model's context is 512 tokens; two are the pads at either end. */
export const KOKORO_MAX_PHONEMES = 510;
/** Rows of a voice file: one 256-float style vector per sequence length 0..509. */
export const KOKORO_STYLE_ROWS = 510;
export const KOKORO_STYLE_DIM = 256;
export const KOKORO_SAMPLE_RATE = 24000;

/** Which spelling rules apply after espeak-ng: Kokoro's English voices were trained on kokoro-js/misaki rules, other languages on misaki's espeak rules. */
export type KokoroLang = 'en-us' | 'en-gb' | 'fr';

/**
 * espeak-ng IPA (as piper-phonemize prints it: one string per sentence, symbols without tie marks) to the spelling
 * Kokoro was trained on. English follows kokoro-js 1.2.1 `phonemize()`; French follows misaki's EspeakG2P
 * (affricates as one symbol, hyphens dropped). Sentences are joined with a space.
 */
export function kokoroPhonemes(sentences: readonly string[], lang: KokoroLang): string {
  let s = sentences
    .map((x) => x.trim())
    .filter(Boolean)
    .join(' ')
    // piper-phonemize prints no space after a sentence end inside one text ("wˈɜːld!dʒˈiːnz"): put it back.
    .replace(/([.!?…])(?=[^\s.!?…"”)])/g, '$1 ');
  if (lang === 'fr') {
    s = s.replace(/dʒ/g, 'ʤ').replace(/tʃ/g, 'ʧ').replace(/-/g, '');
  } else {
    s = s
      .replace(/kəkˈoːɹoʊ/g, 'kˈoʊkəɹoʊ')
      .replace(/kəkˈɔːɹəʊ/g, 'kˈəʊkəɹəʊ')
      .replace(/ʲ/g, 'j')
      .replace(/r/g, 'ɹ')
      .replace(/x/g, 'k')
      .replace(/ɬ/g, 'l')
      .replace(/(?<=[a-zɹː])(?=hˈʌndɹɪd)/g, ' ')
      .replace(/ z(?=[;:,.!?¡¿—…"«»“” ]|$)/g, 'z');
    if (lang === 'en-us') s = s.replace(/(?<=nˈaɪn)ti(?!ː)/g, 'di');
  }
  return s.replace(/\s+/g, ' ').trim();
}

/**
 * Phonemes to the model's input ids: every symbol through the vocabulary (unknown ones are dropped, as the
 * model's own tokenizer does), at most KOKORO_MAX_PHONEMES of them, then a pad (0) at each end.
 */
export function kokoroIds(phonemes: string): number[] {
  const ids: number[] = [0];
  for (const ch of phonemes) {
    const id = KOKORO_VOCAB[ch];
    if (id === undefined) continue;
    if (ids.length > KOKORO_MAX_PHONEMES) break;
    ids.push(id);
  }
  ids.push(0);
  return ids;
}

/** How many symbols of `phonemes` the model knows (what kokoroIds keeps, before the length cap). */
export function knownLength(phonemes: string): number {
  let n = 0;
  for (const ch of phonemes) if (KOKORO_VOCAB[ch] !== undefined) n++;
  return n;
}

/**
 * The style row for a sequence of `ids` (pads included): the voice file holds one row per number of phoneme
 * tokens, so the row index is the token count without the two pads, clamped to the file's rows.
 */
export function styleRowIndex(idsLength: number): number {
  return Math.min(Math.max(idsLength - 2, 0), KOKORO_STYLE_ROWS - 1);
}

/** The 256 floats of the style row for this sequence (a view into `voice`, no copy). */
export function styleRow(voice: Float32Array, idsLength: number): Float32Array {
  if (voice.length < KOKORO_STYLE_ROWS * KOKORO_STYLE_DIM) throw new Error(`Kokoro voice file is too short: ${voice.length} floats, expected ${KOKORO_STYLE_ROWS * KOKORO_STYLE_DIM}`);
  const at = styleRowIndex(idsLength) * KOKORO_STYLE_DIM;
  return voice.subarray(at, at + KOKORO_STYLE_DIM);
}

/**
 * Cuts phonemes longer than the model's context into pieces of at most `max` known symbols, at the last
 * sentence or clause mark, else the last space, else hard. Normal sentences (under about 220 characters)
 * stay one piece.
 */
export function chunkPhonemes(phonemes: string, max = KOKORO_MAX_PHONEMES): string[] {
  const out: string[] = [];
  let rest = phonemes.trim();
  while (knownLength(rest) > max) {
    // The character index where `max` known symbols end.
    let known = 0;
    let end = 0;
    for (const ch of rest) {
      if (KOKORO_VOCAB[ch] !== undefined) known++;
      end += ch.length;
      if (known >= max) break;
    }
    const win = rest.slice(0, end);
    let cut = -1;
    for (const re of [/[.!?…;:,—](?=\s)/g, /\s/g]) {
      let m: RegExpExecArray | null;
      let last = -1;
      while ((m = re.exec(win))) last = m.index + m[0].length;
      if (last > win.length * 0.3) {
        cut = last;
        break;
      }
    }
    if (cut <= 0) cut = end;
    out.push(rest.slice(0, cut).trim());
    rest = rest.slice(cut).trim();
  }
  if (rest) out.push(rest);
  return out;
}

/** App speaking rate (1 normal, 2 twice as fast) from Piper's length multiplier (1/rate) to Kokoro's `speed`, clamped to what still sounds natural. */
export function kokoroSpeed(lengthScale: number): number {
  const ls = Number.isFinite(lengthScale) && lengthScale > 0 ? lengthScale : 1;
  return Math.min(Math.max(Number((1 / ls).toFixed(3)), 0.5), 2);
}

/**
 * Splits text for Kokoro: the sentences of splitSentences, but a long FIRST piece is cut at a comma or colon so
 * the first audio is ready sooner (the rest is synthesized while it plays). Later pieces stay whole sentences,
 * which keeps Kokoro's intonation.
 */
export function splitForFirstAudio(sentences: string[], firstMax = 100): string[] {
  const [first, ...rest] = sentences;
  if (first === undefined || first.length <= firstMax) return sentences;
  const win = first.slice(0, firstMax);
  const cut = Math.max(win.lastIndexOf(', '), win.lastIndexOf(': '), win.lastIndexOf('; '));
  if (cut < 20) return sentences;
  return [first.slice(0, cut + 1).trim(), first.slice(cut + 1).trim(), ...rest];
}
