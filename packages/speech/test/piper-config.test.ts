import { describe, expect, it } from 'vitest';
import { lengthScaleForRate, parsePiperConfig, phonemesToIds, splitSentences, textToIds } from '../src/index.js';

const MAP: Record<string, number[]> = { _: [0], '^': [1], $: [2], ' ': [3], a: [4], b: [5], é: [6], e: [7], '.': [8] };

describe('parsePiperConfig', () => {
  const base = { audio: { sample_rate: 16000 }, espeak: { voice: 'fr' }, inference: { noise_scale: 0.5, length_scale: 1.1, noise_w: 0.8 }, phoneme_id_map: MAP };
  it('defaults phoneme_type to espeak (old configs omit it)', () => {
    expect(parsePiperConfig(base).phoneme_type).toBe('espeak');
  });
  it('accepts phoneme_type "text" without an espeak voice', () => {
    const { espeak: _e, ...rest } = base;
    expect(parsePiperConfig({ ...rest, phoneme_type: 'text' }).phoneme_type).toBe('text');
  });
  it('rejects espeak models with no espeak voice, bad maps and unknown types', () => {
    const { espeak: _e, ...rest } = base;
    expect(() => parsePiperConfig(rest)).toThrow(/espeak.voice/);
    expect(() => parsePiperConfig({ ...base, phoneme_id_map: { a: ['x'] } })).toThrow(/integers/);
    expect(() => parsePiperConfig({ ...base, phoneme_type: 'pinyin' })).toThrow(/unsupported/);
    expect(() => parsePiperConfig({})).toThrow();
  });
});

describe('ids', () => {
  it('phonemes: BOS, PAD, then symbol+PAD, then EOS; unknown symbols are skipped', () => {
    expect(phonemesToIds(['a', 'ʃ', 'b'], MAP)).toEqual([1, 0, 4, 0, 5, 0, 2]);
  });
  it('text voices map characters straight to ids (no espeak)', () => {
    expect(textToIds('ab.', MAP)).toEqual([1, 0, 4, 0, 5, 0, 8, 0, 2]);
  });
  it('text voices: precomposed letters work when the model has them (NFC), decomposed otherwise', () => {
    expect(textToIds('é', MAP)).toEqual([1, 0, 6, 0, 2]);
    const decomposedMap = { _: [0], '^': [1], $: [2], e: [7], '́': [9] };
    expect(textToIds('é', decomposedMap)).toEqual([1, 0, 7, 0, 9, 0, 2]);
  });
});

describe('lengthScaleForRate', () => {
  it('maps rate to a length_scale multiplier (faster = smaller) and clamps', () => {
    expect(lengthScaleForRate(1)).toBe(1);
    expect(lengthScaleForRate(2)).toBe(0.5);
    expect(lengthScaleForRate(0.8)).toBe(1.25);
    expect(lengthScaleForRate(100)).toBe(0.4);
    expect(lengthScaleForRate(0.01)).toBe(2.5);
    expect(lengthScaleForRate(NaN)).toBe(1);
    expect(lengthScaleForRate(-1)).toBe(1);
  });
});

describe('splitSentences', () => {
  it('splits at sentence ends but not inside numbers', () => {
    expect(splitSentences('Vous devez 5.000 francs. Payez avant demain ! Merci')).toEqual(['Vous devez 5.000 francs.', 'Payez avant demain !', 'Merci']);
  });
  it('joins tiny abbreviations to the next sentence', () => {
    expect(splitSentences('M. Dupont arrive. Bonjour.')).toEqual(['M. Dupont arrive.', 'Bonjour.']);
  });
  it('breaks very long text at commas or spaces', () => {
    const long = Array.from({ length: 80 }, (_, i) => `mot${i}`).join(' ');
    const parts = splitSentences(long, 100);
    expect(parts.every((p) => p.length <= 100)).toBe(true);
    expect(parts.join(' ')).toBe(long);
  });
  it('empty text gives no sentences', () => {
    expect(splitSentences('  \n ')).toEqual([]);
  });
});
