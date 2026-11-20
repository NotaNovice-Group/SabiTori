import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  assetPathOf,
  createKokoroNativeEngines,
  createKokoroTts,
  int16Base64ToFloat,
  kokoroVoiceFor,
  type KokoroNativePlugin,
  type PhonemizerLike,
  type TtsBackend,
} from '../src/index.js';

const voiceFile = (offset = 0): Uint8Array => new Uint8Array(Float32Array.from({ length: 510 * 256 }, (_, i) => Math.floor(i / 256) + offset).buffer);
const EN = kokoroVoiceFor('en', 'https://localhost/kokoro/')!;
const FR = kokoroVoiceFor('fr', 'https://localhost/kokoro/')!;
const files: Record<string, Uint8Array> = { [EN.styleUrl]: voiceFile(0), [FR.styleUrl]: voiceFile(1000) };
const fetchBytes = async (u: string): Promise<Uint8Array> => {
  if (!files[u]) throw new Error(`HTTP 404 for ${u}`);
  return files[u]!;
};
const phon = (symbols: string[]): PhonemizerLike => ({ phonemize: vi.fn(() => symbols) });

/** Int16 little-endian PCM as base64, as the plugin sends it. */
const pcm = (values: number[]): string => {
  const b = new Uint8Array(new Int16Array(values).buffer);
  let s = '';
  for (const x of b) s += String.fromCharCode(x);
  return btoa(s);
};

function fakePlugin(opts: { delayMs?: (ids: number[]) => number; samples?: number[]; failLoad?: boolean } = {}) {
  const calls: Array<{ ids: number[]; style: number[]; speed: number }> = [];
  const loads: Array<{ model: string; threads?: number }> = [];
  const plugin: KokoroNativePlugin & { unloads: number } = {
    unloads: 0,
    async load(o) {
      loads.push(o);
      if (opts.failLoad) throw new Error('model not found');
      return { threads: o.threads };
    },
    async synthesize(o) {
      calls.push(o);
      const ms = opts.delayMs?.(o.ids) ?? 0;
      if (ms) await new Promise((r) => setTimeout(r, ms));
      return { audio: pcm(opts.samples ?? [0, 16384, -32768, 32767]), sampleRate: 24000 };
    },
    async unload() {
      plugin.unloads++;
    },
  };
  return { plugin, calls, loads };
}

describe('Kokoro native helpers', () => {
  it('maps a model URL to its path in the app assets, refusing anything else', () => {
    expect(assetPathOf('https://localhost/kokoro/model_uint8.onnx')).toBe('kokoro/model_uint8.onnx');
    expect(assetPathOf('capacitor://localhost/kokoro/model_uint8.onnx')).toBe('kokoro/model_uint8.onnx');
    expect(assetPathOf('./kokoro/m.onnx', 'https://localhost/')).toBe('kokoro/m.onnx');
    expect(assetPathOf('https://localhost/kokoro/../../etc/passwd')).toBe('etc/passwd'); // URL parsing resolves "..": still inside the assets
    expect(assetPathOf('https://localhost/kokoro/..%2Fx')).toBeNull(); // an encoded slash cannot smuggle a ".." in
    expect(assetPathOf('https://localhost/a b.onnx')).toBeNull();
    expect(assetPathOf('https://localhost/')).toBeNull();
  });

  it('decodes little-endian Int16 PCM to floats', () => {
    expect(Array.from(int16Base64ToFloat(pcm([0, 16384, -32768, 32767, -1])))).toEqual([0, 0.5, -1, 32767 / 32768, -1 / 32768]);
    expect(int16Base64ToFloat('')).toHaveLength(0);
  });
});

describe('createKokoroNativeEngines', () => {
  it('does the text work on the page and only the model run in the plugin', async () => {
    const { plugin, calls, loads } = fakePlugin();
    const p = phon(['h', 'ə', 'l', 'ˈ', 'o', 'ʊ']);
    const engines = createKokoroNativeEngines({ plugin, loadPhonemizer: async () => p, fetchBytes, threads: 4 });
    const e = engines(EN);
    await e.load();
    const a = await e.synthesize('Hello', { lengthScale: 0.8 });
    expect(loads).toEqual([{ model: 'kokoro/model_uint8.onnx', threads: 4 }]);
    expect(p.phonemize).toHaveBeenCalledWith('en-us', 'Hello');
    expect(calls[0]!.ids).toEqual([0, 50, 83, 54, 156, 57, 135, 0]);
    expect(calls[0]!.style).toHaveLength(256);
    expect(calls[0]!.style.every((x) => x === 6)).toBe(true);
    expect(calls[0]!.speed).toBe(1.25);
    expect(a.sampleRate).toBe(24000);
    expect(Array.from(a.samples)).toEqual([0, 0.5, -1, 32767 / 32768]);
  });

  it('opens the model once for both voices and unloads it with the last one', async () => {
    const { plugin, loads, calls } = fakePlugin();
    const engines = createKokoroNativeEngines({ plugin, loadPhonemizer: async () => phon(['a']), fetchBytes });
    const en = engines(EN);
    const fr = engines(FR);
    await en.load();
    await fr.load();
    expect(loads).toHaveLength(1);
    await fr.synthesize('a', { lengthScale: 1 });
    expect(calls[0]!.style[0]).toBe(1001);
    en.dispose();
    await Promise.resolve();
    await Promise.resolve();
    expect(plugin.unloads).toBe(0);
    fr.dispose();
    for (let i = 0; i < 5; i++) await Promise.resolve();
    expect(plugin.unloads).toBe(1);
  });

  it('a model the plugin cannot open fails the load (the fallback voice speaks)', async () => {
    const { plugin } = fakePlugin({ failLoad: true });
    const e = createKokoroNativeEngines({ plugin, loadPhonemizer: async () => phon(['a']), fetchBytes })(EN);
    await expect(e.load()).rejects.toThrow(/model not found/);
  });
});

describe('Kokoro TTS on the native back end: the same speed guard decides', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  /** The plugin takes `rtf` x the audio it returns (2 s of audio per call here). */
  function make(rtf: number) {
    const seconds = 2;
    const { plugin, calls } = fakePlugin({ delayMs: () => seconds * rtf * 1000, samples: new Array(24000 * seconds).fill(1000) });
    const spoken: string[] = [];
    const fallback: TtsBackend = { async speak(r) { spoken.push(r.text); }, cancel() {} };
    const played: number[] = [];
    const tts = createKokoroTts({
      engines: createKokoroNativeEngines({ plugin, loadPhonemizer: async () => phon(['a', 'b']), fetchBytes }),
      resolveVoice: (b) => (b.startsWith('fr') ? FR : EN),
      fallback,
      output: { play(a) { played.push(a.samples.length); return { done: Promise.resolve(), stop() {} }; } },
      now: () => Date.now(),
    });
    return { tts, plugin, calls, spoken, played };
  }

  it('a fast phone (RTF 0.4) passes the speed test and Kokoro speaks', async () => {
    const { tts, spoken, played } = make(0.4);
    const w = tts.warm('en-GB');
    await vi.advanceTimersByTimeAsync(2000);
    expect(await w).toBe(true);
    const d = tts.speak({ text: 'Hello there. Bye now.', bcp47: 'en-GB', rate: 1 });
    await vi.advanceTimersByTimeAsync(10_000);
    await d;
    expect(spoken).toEqual([]);
    expect(played).toEqual([48000, 48000]);
  });

  it('a slow phone (RTF 1.1) fails it and the fallback speaks; the model is unloaded', async () => {
    const { tts, spoken, plugin } = make(1.1);
    const w = tts.warm('fr-FR');
    await vi.advanceTimersByTimeAsync(3000);
    expect(await w).toBe(false);
    await vi.advanceTimersByTimeAsync(10);
    expect(plugin.unloads).toBe(1);
    await tts.speak({ text: 'Bonjour.', bcp47: 'fr-FR', rate: 1 });
    expect(spoken).toEqual(['Bonjour.']);
  });
});
