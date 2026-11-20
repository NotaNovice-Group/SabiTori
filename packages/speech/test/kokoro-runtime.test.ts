import { describe, expect, it, vi } from 'vitest';
import {
  createKokoroRuntime,
  ortModelOpener,
  createKokoroVoiceResolver,
  KOKORO_MODEL_FILE,
  KOKORO_VERSION,
  KOKORO_VOICES,
  kokoroThreads,
  kokoroVoiceFor,
  type OrtLike,
  type PhonemizerLike,
  type PiperVoiceSpec,
} from '../src/index.js';
import { FILES, KOKORO_ESPEAK_LANGS, localName } from '../../../scripts/fetch-kokoro.mjs';

const STYLE_BYTES = 510 * 256 * 4;
/** A voice file whose row r is filled with r + offset. */
const voiceFile = (offset = 0): Uint8Array => new Uint8Array(Float32Array.from({ length: 510 * 256 }, (_, i) => Math.floor(i / 256) + offset).buffer);

interface Feed {
  type: string;
  data: ArrayLike<number | bigint>;
  dims?: number[];
}
function fakeOrt(opts: { inputs?: string[]; out?: () => Float32Array } = {}) {
  const runs: Array<Record<string, Feed>> = [];
  const released = vi.fn();
  class Tensor {
    constructor(public type: string, public data: unknown, public dims?: number[]) {}
  }
  const create = vi.fn(async () => ({
    inputNames: opts.inputs ?? ['input_ids', 'style', 'speed'],
    outputNames: ['waveform'],
    async run(feeds: Record<string, unknown>) {
      runs.push(feeds as Record<string, Feed>);
      return { waveform: { data: opts.out ? opts.out() : new Float32Array([0.1, -0.2, 0.3]) } };
    },
    release: released,
  }));
  const ort: OrtLike = { InferenceSession: { create }, Tensor: Tensor as never };
  return { ort, runs, create, released };
}

const phon = (symbols: string[]): PhonemizerLike => ({ phonemize: vi.fn(() => symbols) });
const fetchFrom = (files: Record<string, Uint8Array>) => vi.fn(async (u: string) => {
  const f = files[u];
  if (!f) throw new Error(`HTTP 404 for ${u}`);
  return f;
});

const EN = kokoroVoiceFor('en', '/k/')!;
const FR = kokoroVoiceFor('fr', '/k/')!;
const files = { [EN.modelUrl]: new Uint8Array(8), [EN.styleUrl]: voiceFile(0), [FR.styleUrl]: voiceFile(1000) };

describe('createKokoroRuntime', () => {
  it('feeds padded ids, the style row of their length and the speed, and returns 24 kHz audio', async () => {
    const { ort, runs } = fakeOrt();
    const p = phon(['h', 'ə', 'l', 'ˈ', 'o', 'ʊ']);
    const rt = createKokoroRuntime({ openModel: ortModelOpener(ort, fetchFrom(files)), loadPhonemizer: async () => p, fetchBytes: fetchFrom(files) });
    const v = await rt.load(EN);
    const a = await v.synthesize('Hello', { lengthScale: 0.8 });
    expect(p.phonemize).toHaveBeenCalledWith('en-us', 'Hello');
    expect(a.sampleRate).toBe(24000);
    expect(Array.from(a.samples)).toEqual([Math.fround(0.1), Math.fround(-0.2), Math.fround(0.3)]);
    const f = runs[0]!;
    expect(Array.from(f.input_ids!.data, Number)).toEqual([0, 50, 83, 54, 156, 57, 135, 0]);
    expect(f.input_ids!.dims).toEqual([1, 8]);
    expect(f.style!.dims).toEqual([1, 256]);
    expect(Array.from(f.style!.data).every((x) => x === 6)).toBe(true); // 6 phoneme tokens -> row 6
    expect(Array.from(f.speed!.data)).toEqual([1.25]);
  });

  it('loads the model once for every voice and releases it with the last voice', async () => {
    const { ort, create, released, runs } = fakeOrt();
    const rt = createKokoroRuntime({ openModel: ortModelOpener(ort, fetchFrom(files)), loadPhonemizer: async () => phon(['a']), fetchBytes: fetchFrom(files) });
    const en = await rt.load(EN);
    const fr = await rt.load(FR);
    expect(create).toHaveBeenCalledTimes(1);
    await fr.synthesize('a', { lengthScale: 1 });
    expect(runs[0]!.style!.data[0]).toBe(1001); // the French voice file, row 1
    en.release();
    expect(released).not.toHaveBeenCalled();
    fr.release();
    fr.release(); // twice is harmless
    await Promise.resolve();
    await Promise.resolve();
    expect(released).toHaveBeenCalledTimes(1);
  });

  it('refuses a model that does not take Kokoro inputs', async () => {
    const { ort, released } = fakeOrt({ inputs: ['input', 'input_lengths', 'scales'] });
    const rt = createKokoroRuntime({ openModel: ortModelOpener(ort, fetchFrom(files)), loadPhonemizer: async () => phon(['a']), fetchBytes: fetchFrom(files) });
    await expect(rt.load(EN)).rejects.toThrow(/not a Kokoro model.*"input_ids"/);
    expect(released).toHaveBeenCalled();
  });

  it('refuses a voice file of the wrong size', async () => {
    const { ort } = fakeOrt();
    const rt = createKokoroRuntime({ openModel: ortModelOpener(ort, fetchFrom(files)), loadPhonemizer: async () => phon(['a']), fetchBytes: fetchFrom({ ...files, [EN.styleUrl]: new Uint8Array(STYLE_BYTES - 4) }) });
    await expect(rt.load(EN)).rejects.toThrow(/expected 522240/);
  });

  it('refuses NaN audio (it would play as silence)', async () => {
    const { ort } = fakeOrt({ out: () => new Float32Array([0.1, Number.NaN]) });
    const rt = createKokoroRuntime({ openModel: ortModelOpener(ort, fetchFrom(files)), loadPhonemizer: async () => phon(['a']), fetchBytes: fetchFrom(files) });
    const v = await rt.load(EN);
    await expect(v.synthesize('a', { lengthScale: 1 })).rejects.toThrow(/invalid audio/);
  });

  it('returns empty audio, without running the model, when nothing is speakable', async () => {
    const { ort, runs } = fakeOrt();
    const rt = createKokoroRuntime({ openModel: ortModelOpener(ort, fetchFrom(files)), loadPhonemizer: async () => phon(['#']), fetchBytes: fetchFrom(files) });
    const v = await rt.load(EN);
    const a = await v.synthesize('#', { lengthScale: 1 });
    expect(a.samples).toHaveLength(0);
    expect(runs).toHaveLength(0);
  });
});

describe('Kokoro voices', () => {
  it('English and French voices with their files, versioned', () => {
    expect(EN).toMatchObject({ id: 'kokoro:af_heart', modelUrl: `/k/${KOKORO_MODEL_FILE}`, styleUrl: '/k/voices/af_heart.bin', espeakVoice: 'en-us', lang: 'en-us', version: KOKORO_VERSION });
    expect(FR).toMatchObject({ id: 'kokoro:ff_siwis', styleUrl: '/k/voices/ff_siwis.bin', espeakVoice: 'fr', lang: 'fr' });
    expect(kokoroVoiceFor('ewo', '/k')).toBeNull();
    expect(kokoroVoiceFor('constructor', '/k')).toBeNull();
  });

  it('follows the pack voice: en and fr (and Pidgin, which uses the en files) get Kokoro, others do not', async () => {
    const piper = vi.fn(async (bcp47: string, ref?: { tag?: string }): Promise<PiperVoiceSpec | null> => {
      if (ref?.tag === 'dua') return null;
      if (ref?.tag === 'xyz') return { id: 'xyz:xyz-voice', modelUrl: 'm', configUrl: 'c' };
      const folder = ref?.tag === 'wes' ? 'en' : bcp47.slice(0, 2);
      return { id: `${folder}:voice`, modelUrl: 'm', configUrl: 'c' };
    });
    const resolve = createKokoroVoiceResolver(piper, '/k/');
    expect((await resolve('en-GB'))?.id).toBe('kokoro:af_heart');
    expect((await resolve('en-GB', { tag: 'wes' }))?.id).toBe('kokoro:af_heart');
    expect((await resolve('fr-FR'))?.id).toBe('kokoro:ff_siwis');
    expect(await resolve('dua', { tag: 'dua' })).toBeNull();
    expect(await resolve('xx', { tag: 'xyz' })).toBeNull();
  });

  it('the fetch script ships exactly the model and voice files the code names, with the espeak dictionaries they need', () => {
    const local = Object.keys(FILES).map(localName).sort();
    const wanted = [KOKORO_MODEL_FILE, ...Object.values(KOKORO_VOICES).map((v) => `voices/${v.voice}.bin`)].sort();
    expect(local).toEqual(wanted);
    for (const v of Object.values(KOKORO_VOICES)) expect(KOKORO_ESPEAK_LANGS).toContain(v.espeakVoice.split('-')[0]);
    expect(Object.values(FILES).every((h) => /^[0-9a-f]{64}$/.test(h))).toBe(true);
  });

  it('threads: one unless the page is cross-origin isolated, then up to 4', () => {
    expect(kokoroThreads({})).toBe(1);
    expect(kokoroThreads({ crossOriginIsolated: false, navigator: { hardwareConcurrency: 8 } })).toBe(1);
    expect(kokoroThreads({ crossOriginIsolated: true, navigator: { hardwareConcurrency: 8 } })).toBe(4);
    expect(kokoroThreads({ crossOriginIsolated: true, navigator: { hardwareConcurrency: 2 } })).toBe(2);
    expect(kokoroThreads({ crossOriginIsolated: true })).toBe(1);
  });
});
