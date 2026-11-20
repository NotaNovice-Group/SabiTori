/**
 * Kokoro through the phone's native onnxruntime (the SabiToriKokoro Capacitor plugin, iOS and Android): about four
 * times faster than onnxruntime-web in a WebView and it can use several cores. Only the model run is native; the
 * text work (espeak-ng phonemes, ids, style row, chunking) stays in this package (runtime.ts, text.ts), on the page.
 *
 * Plugin contract (apps/app/ios/App/App/SabiToriKokoroPlugin.swift, apps/app/android/.../SabiToriKokoroPlugin.java):
 *   load({ model, threads })          model: path of the model inside the app's web assets ("kokoro/model_uint8.onnx")
 *   synthesize({ ids, style, speed }) -> { audio: base64 of little-endian Int16 PCM, sampleRate: 24000 }
 *   unload()
 * Int16 instead of Float32 halves what crosses the bridge (about 0.45 MB of base64 per second of speech instead of 0.9).
 */
import type { PiperEngine } from '../piper/engine.js';
import type { PhonemizerLike } from '../piper/runtime.js';
import { createKokoroRuntime, type KokoroModel, type LoadedKokoroVoice } from './runtime.js';
import { KOKORO_SAMPLE_RATE } from './text.js';
import type { KokoroVoiceSpec } from './voices.js';

export interface KokoroNativePlugin {
  load(opts: { model: string; threads?: number }): Promise<{ threads?: number } | void>;
  synthesize(opts: { ids: number[]; style: number[]; speed: number }): Promise<{ audio: string; sampleRate?: number }>;
  unload(): Promise<void>;
}

/**
 * The model's path inside the app's web assets, from its URL ("https://localhost/kokoro/model_uint8.onnx" ->
 * "kokoro/model_uint8.onnx"). Only plain relative paths: no "..", no other characters. Null when it is not one.
 */
export function assetPathOf(modelUrl: string, base?: string): string | null {
  let path: string;
  try {
    path = new URL(modelUrl, base ?? 'https://localhost/').pathname;
  } catch {
    return null;
  }
  path = decodeURIComponent(path).replace(/^\/+/, '');
  if (!/^[A-Za-z0-9._/-]+$/.test(path) || path.split('/').some((p) => p === '..' || p === '.' || p === '')) return null;
  return path;
}

/** base64 of little-endian Int16 PCM to float samples in [-1, 1). */
export function int16Base64ToFloat(b64: string): Float32Array {
  const bin = atob(b64);
  const n = bin.length >> 1;
  const out = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    let v = bin.charCodeAt(2 * i) | (bin.charCodeAt(2 * i + 1) << 8);
    if (v >= 0x8000) v -= 0x10000;
    out[i] = v / 32768;
  }
  return out;
}

/** The native back end for createKokoroRuntime: one model opened in the plugin, freed with the last voice. */
export function nativeModelOpener(plugin: KokoroNativePlugin, threads: number, base?: string): (modelUrl: string) => Promise<KokoroModel> {
  return async (url) => {
    const model = assetPathOf(url, base);
    if (!model) throw new Error(`Kokoro model URL is not an app asset path: ${url}`);
    await plugin.load({ model, threads });
    return {
      async run(ids, style, speed) {
        const r = await plugin.synthesize({ ids, style: Array.from(style), speed });
        if (r.sampleRate && r.sampleRate !== KOKORO_SAMPLE_RATE) throw new Error(`Kokoro native audio at ${r.sampleRate} Hz, expected ${KOKORO_SAMPLE_RATE}`);
        return int16Base64ToFloat(r.audio);
      },
      release() {
        void plugin.unload().catch(() => undefined);
      },
    };
  };
}

/**
 * Kokoro engines that run the model natively. `loadPhonemizer` loads espeak-ng on the page (it takes a few
 * milliseconds per sentence; the model run, which takes seconds, is off the page in the plugin's own thread).
 */
export function createKokoroNativeEngines(opts: {
  plugin: KokoroNativePlugin;
  loadPhonemizer: () => Promise<PhonemizerLike>;
  fetchBytes?: (url: string) => Promise<Uint8Array>;
  /** Native intra-op threads. Default 4 (the plugin caps it to the phone's active cores). */
  threads?: number;
  base?: string;
}): (voice: KokoroVoiceSpec) => PiperEngine {
  const fetchBytes =
    opts.fetchBytes ??
    (async (u: string) => {
      const r = await fetch(u);
      if (!r.ok) throw new Error(`HTTP ${r.status} for ${u}`);
      return new Uint8Array(await r.arrayBuffer());
    });
  const runtime = createKokoroRuntime({ loadPhonemizer: opts.loadPhonemizer, fetchBytes, openModel: nativeModelOpener(opts.plugin, opts.threads ?? 4, opts.base) });
  return (voice) => {
    let loaded: Promise<LoadedKokoroVoice> | null = null;
    let disposed = false;
    return {
      async load() {
        const p = runtime.load(voice);
        loaded = p;
        const v = await p;
        if (disposed) v.release(); // disposed while loading
      },
      async synthesize(text, o) {
        if (!loaded) throw new Error('Kokoro voice not loaded');
        return (await loaded).synthesize(text, o);
      },
      dispose() {
        if (disposed) return;
        disposed = true;
        void loaded?.then((v) => v.release()).catch(() => undefined);
      },
    };
  };
}
