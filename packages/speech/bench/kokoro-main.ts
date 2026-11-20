// Kokoro benchmark page (see kokoro-run.mjs). Uses the app's real code path: createKokoroWorkerEngines (the Kokoro
// Web Worker, onnxruntime-web wasm with 1 thread as in the app) and createKokoroTts for time to first audio.
import { createKokoroTts, createKokoroWorkerEngines, kokoroPhonemes, kokoroThreads, kokoroVoiceFor, type KokoroLang, type TtsBackend } from '@sabitori/speech';
import { loadPhonemizer } from '../src/piper/worker-assets.js';

const base = new URL('/', location.href).href;
// ?model=<file> benchmarks another model file from public/kokoro/ (the app ships KOKORO_MODEL_FILE).
const modelOverride = new URL(location.href).searchParams.get('model');
// ?threads=<n> (needs the page cross-origin isolated: BENCH_COI=1 for the bench server). Default: the app's choice (kokoroThreads).
const threadsParam = new URL(location.href).searchParams.get('threads');
const threads = threadsParam ? Number(threadsParam) : undefined;
const voiceFor = (folder: string) => {
  const v = kokoroVoiceFor(folder, `${base}kokoro/`)!;
  return modelOverride ? { ...v, modelUrl: `${base}kokoro/${modelOverride}`, id: `${v.id}+${modelOverride}` } : v;
};

(window as any).benchKokoro = async (folder: string, sentences: string[]) => {
  const voice = voiceFor(folder);
  const engines = createKokoroWorkerEngines(`${base}piper/`, `${base}ort/`, threads);
  const engine = engines(voice);
  const t0 = performance.now();
  await engine.load();
  const loadMs = performance.now() - t0;
  const rows: any[] = [];
  const wavs: string[] = [];
  for (const text of sentences) {
    const s = performance.now();
    const a = await engine.synthesize(text, { lengthScale: 1 });
    const ms = performance.now() - s;
    const audioS = a.samples.length / a.sampleRate;
    let bad = 0;
    let peak = 0;
    for (const v of a.samples) {
      if (!Number.isFinite(v)) bad++;
      else peak = Math.max(peak, Math.abs(v));
    }
    rows.push({ text, chars: text.length, synthMs: Math.round(ms), audioS: +audioS.toFixed(2), rtf: +(ms / 1000 / audioS).toFixed(3), peak: +peak.toFixed(3), ...(bad ? { nonFiniteSamples: bad } : {}) });
    // 16-bit PCM, base64, for the runner to write a WAV.
    const pcm = new Int16Array(a.samples.length);
    for (let i = 0; i < pcm.length; i++) pcm[i] = Math.max(-1, Math.min(1, a.samples[i]!)) * 32767;
    let bin = '';
    const bytes = new Uint8Array(pcm.buffer);
    for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
    wavs.push(btoa(bin));
  }
  engine.dispose();
  engines.terminate();
  return { loadMs: Math.round(loadMs), threads: threads ?? kokoroThreads(), crossOriginIsolated, rows, wavs, sampleRate: 24000 };
};

/** End to end through createKokoroTts (speed guard included): time from speak() to the first audio handed to the output. */
(window as any).ttfaKokoro = async (bcp47: string, folder: string, texts: string[]) => {
  const events: any[] = [];
  const spokenByFallback: string[] = [];
  const fallback: TtsBackend = { async speak(r) { spokenByFallback.push(r.text); }, cancel() {} };
  let firstPlay = 0;
  const output = { play() { if (!firstPlay) firstPlay = performance.now(); return { done: Promise.resolve(), stop() {} }; } };
  const tts = createKokoroTts({
    engines: createKokoroWorkerEngines(`${base}piper/`, `${base}ort/`, threads),
    resolveVoice: () => voiceFor(folder),
    fallback,
    output,
    onEvent: (e) => events.push(e),
  });
  const t0 = performance.now();
  await tts.warm(bcp47);
  const loadMs = performance.now() - t0;
  const rows: any[] = [];
  for (const text of texts) {
    firstPlay = 0;
    const s = performance.now();
    await tts.speak({ text, bcp47, rate: 1 });
    rows.push({ chars: text.length, ttfaMs: firstPlay ? Math.round(firstPlay - s) : null, totalMs: Math.round(performance.now() - s) });
  }
  tts.dispose();
  return { loadMs: Math.round(loadMs), rows, events: events.filter((e) => e.type !== 'ready'), spokenByFallback, tooSlow: tts.tooSlow };
};
/** The phonemes the app gives Kokoro for a text (to compare with kokoro-js / misaki). */
(window as any).phonemesKokoro = async (espeakVoice: string, lang: KokoroLang, text: string) => {
  const phon = await loadPhonemizer(`${base}piper/`);
  return kokoroPhonemes([phon.phonemize(espeakVoice, text).join('')], lang);
};
(window as any).ready = true;
