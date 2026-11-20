import { describe, expect, it } from 'vitest';
import {
  chunkPhonemes,
  KOKORO_MAX_PHONEMES,
  KOKORO_VOCAB,
  kokoroIds,
  kokoroPhonemes,
  kokoroSpeed,
  splitForFirstAudio,
  splitSentences,
  styleRow,
  styleRowIndex,
} from '../src/index.js';

describe('Kokoro vocabulary and ids', () => {
  it('is the model tokenizer vocabulary: 115 symbols, "$" is the pad', () => {
    expect(Object.keys(KOKORO_VOCAB)).toHaveLength(115);
    expect(KOKORO_VOCAB.$).toBe(0);
    expect(KOKORO_VOCAB[' ']).toBe(16);
    expect(KOKORO_VOCAB['ɹ']).toBe(123);
    expect(KOKORO_VOCAB['ˈ']).toBe(156);
    expect(KOKORO_VOCAB['̃']).toBe(17); // French nasal tilde
    expect(KOKORO_VOCAB['ᵻ']).toBe(177);
    expect(new Set(Object.values(KOKORO_VOCAB)).size).toBe(115);
  });

  it('maps every symbol through the vocabulary and pads with 0 at both ends', () => {
    expect(kokoroIds('hˈɛloʊ.')).toEqual([0, 50, 156, 86, 54, 57, 135, 4, 0]);
  });

  it('drops symbols the model does not know, as its tokenizer does', () => {
    expect(kokoroIds('a̩b#')).toEqual([0, 43, 44, 0]);
    expect(kokoroIds('')).toEqual([0, 0]);
  });

  it('keeps at most 510 phonemes (512 tokens with the pads)', () => {
    const ids = kokoroIds('a'.repeat(600));
    expect(ids).toHaveLength(KOKORO_MAX_PHONEMES + 2);
    expect(ids[0]).toBe(0);
    expect(ids.at(-1)).toBe(0);
    expect(ids.slice(1, -1).every((n) => n === 43)).toBe(true);
  });
});

describe('Kokoro style row', () => {
  const voice = Float32Array.from({ length: 510 * 256 }, (_, i) => Math.floor(i / 256)); // each row filled with its index

  it('uses the row of the number of phoneme tokens (pads not counted)', () => {
    expect(styleRowIndex(kokoroIds('abc').length)).toBe(3);
    const row = styleRow(voice, kokoroIds('abc').length);
    expect(row).toHaveLength(256);
    expect(row.every((v) => v === 3)).toBe(true);
  });

  it('clamps to the rows the file has', () => {
    expect(styleRowIndex(2)).toBe(0);
    expect(styleRowIndex(0)).toBe(0);
    expect(styleRowIndex(512)).toBe(509);
    expect(styleRowIndex(9999)).toBe(509);
    expect(styleRow(voice, 512)[0]).toBe(509);
  });

  it('refuses a voice file that is too short', () => {
    expect(() => styleRow(new Float32Array(256), 5)).toThrow(/too short/);
  });
});

describe('kokoroPhonemes (espeak-ng IPA to Kokoro spelling)', () => {
  it('English: the kokoro-js rules', () => {
    // Same output as kokoro-js 1.2.1 phonemize() for these espeak-ng strings.
    expect(kokoroPhonemes(['ɡˈʊd mˈɔːnɪŋ'], 'en-us')).toBe('ɡˈʊd mˈɔːnɪŋ');
    expect(kokoroPhonemes(['raɪt'], 'en-us')).toBe('ɹaɪt');
    expect(kokoroPhonemes(['lɒx'], 'en-gb')).toBe('lɒk');
    expect(kokoroPhonemes(['kʲuː ɬan'], 'en-us')).toBe('kjuː lan');
    expect(kokoroPhonemes(['nˈaɪnti'], 'en-us')).toBe('nˈaɪndi');
    expect(kokoroPhonemes(['nˈaɪnti'], 'en-gb')).toBe('nˈaɪnti');
    expect(kokoroPhonemes(['fˈaɪvhˈʌndɹɪd'], 'en-us')).toBe('fˈaɪv hˈʌndɹɪd');
    expect(kokoroPhonemes(['ɪts z.'], 'en-us')).toBe('ɪtsz.');
  });

  it('puts back the space piper-phonemize leaves out after a sentence end', () => {
    expect(kokoroPhonemes(['həlˈoʊ!wˈɜːld.'], 'en-us')).toBe('həlˈoʊ! wˈɜːld.');
    expect(kokoroPhonemes(['bɔ̃ʒˈuʁ.mɛʁsˈi'], 'fr')).toBe('bɔ̃ʒˈuʁ. mɛʁsˈi');
    expect(kokoroPhonemes(['a', ' b '], 'fr')).toBe('a b');
  });

  it('French: misaki rules (affricates as one symbol, hyphens dropped, r and x untouched)', () => {
    expect(kokoroPhonemes(['dʒˈin tʃˈad'], 'fr')).toBe('ʤˈin ʧˈad');
    expect(kokoroPhonemes(['vˈø-tʁ'], 'fr')).toBe('vˈøtʁ');
    expect(kokoroPhonemes(['ʁ r x'], 'fr')).toBe('ʁ r x');
  });
});

describe('chunkPhonemes', () => {
  it('keeps a normal sentence whole', () => {
    expect(chunkPhonemes('həlˈoʊ, wˈɜːld.')).toEqual(['həlˈoʊ, wˈɜːld.']);
  });

  it('cuts text longer than the model context at a clause mark, every piece within the limit', () => {
    const clause = `${'ab '.repeat(40).trim()},`; // 120 symbols + comma
    const text = Array.from({ length: 8 }, () => clause).join(' ');
    const pieces = chunkPhonemes(text, 200);
    expect(pieces.length).toBeGreaterThan(1);
    for (const p of pieces) expect(kokoroIds(p).length - 2).toBeLessThanOrEqual(200);
    expect(pieces.slice(0, -1).every((p) => p.endsWith(','))).toBe(true);
    expect(pieces.join(' ')).toBe(text);
  });

  it('cuts hard when there is no space at all', () => {
    const pieces = chunkPhonemes('a'.repeat(25), 10);
    expect(pieces).toEqual(['a'.repeat(10), 'a'.repeat(10), 'a'.repeat(5)]);
  });
});

describe('splitForFirstAudio', () => {
  it('cuts a long first sentence at a comma so the first audio comes sooner', () => {
    const first = 'Your electricity bill of twelve thousand five hundred francs must be paid, at any agency before the end of the month.';
    const out = splitForFirstAudio(splitSentences(`${first} Thank you.`));
    expect(out).toEqual(['Your electricity bill of twelve thousand five hundred francs must be paid,', 'at any agency before the end of the month.', 'Thank you.']);
  });

  it('leaves short first sentences, later sentences and comma-less sentences alone', () => {
    expect(splitForFirstAudio(['Hello, world.', `${'x'.repeat(150)}, y.`])).toEqual(['Hello, world.', `${'x'.repeat(150)}, y.`]);
    expect(splitForFirstAudio([`${'word '.repeat(30)}end.`])).toEqual([`${'word '.repeat(30)}end.`]);
    expect(splitForFirstAudio([])).toEqual([]);
  });
});

describe('kokoroSpeed', () => {
  it('is the inverse of Piper length scale, clamped', () => {
    expect(kokoroSpeed(1)).toBe(1);
    expect(kokoroSpeed(0.8)).toBe(1.25);
    expect(kokoroSpeed(2)).toBe(0.5);
    expect(kokoroSpeed(4)).toBe(0.5);
    expect(kokoroSpeed(0.1)).toBe(2);
    expect(kokoroSpeed(Number.NaN)).toBe(1);
  });
});
