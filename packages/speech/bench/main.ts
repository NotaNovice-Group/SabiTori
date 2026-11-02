import { createPiperRuntime, createPiperTts, createPiperWorkerEngines, createManifestVoiceResolver, createPackRegistry, createWebAudioOutput, type TtsBackend } from '@sabitori/speech';

const base = new URL('/', location.href).href;
const packs = `${base}packs`;
const events: any[] = [];
const sysSpoken: string[] = [];
const fakeSystem: TtsBackend = { async speak(r) { sysSpoken.push(r.text); }, cancel() {} };

// Same runtime as the worker (runtime.ts + the same ORT / espeak files), but on the page's main thread,
// because Chromium's CPU throttling emulation does not slow Web Workers.
function mainThreadEngines(assetBase: string) {
  let ortP: Promise<any> | null = null;
  let phonP: Promise<any> | null = null;
  const loadOrt = async () => {
    const ort: any = await import(/* @vite-ignore */ `${assetBase}ort.wasm.min.mjs`);
    ort.env.wasm.wasmPaths = assetBase; ort.env.wasm.numThreads = 1; ort.env.wasm.proxy = false;
    return ort;
  };
  const loadPhon = async () => {
    const mod: any = await import(/* @vite-ignore */ `${assetBase}piper_phonemize.mjs`);
    let lines: string[] = [];
    const m = await mod.default({ noInitialRun: true, print: (d: string) => lines.push(d), printErr: () => {}, locateFile: (f: string) => `${assetBase}${f}` });
    return { phonemize(voice: string, text: string) { lines = []; m.callMain(['-l', voice, '--input', JSON.stringify([{ text }]), '--espeak_data', '/espeak-ng-data']); return JSON.parse(lines.find((l) => l.startsWith('{'))!).phonemes; } };
  };
  return (voice: any) => {
    let v: any;
    return {
      async load() {
        ortP ??= loadOrt();
        const ort = await ortP;
        const rt = createPiperRuntime({ ort, loadPhonemizer: () => (phonP ??= loadPhon()), fetchBytes: async (u) => new Uint8Array(await (await fetch(u)).arrayBuffer()) });
        v = await rt.load(voice);
      },
      async synthesize(text: string, o: any) { await new Promise((r) => setTimeout(r)); return v.synthesize(text, o); },
      dispose() {},
    };
  };
}

function make(opts: { realAudio: boolean; mode: string }) {
  const real = createWebAudioOutput();
  let firstPlayAt = 0;
  const output = {
    play(a: any, p: any) { if (!firstPlayAt) firstPlayAt = performance.now(); return opts.realAudio ? real.play(a, p) : { done: Promise.resolve(), stop() {} }; },
  };
  const tts = createPiperTts({
    engines: opts.mode === 'main' ? (mainThreadEngines(`${base}piper/`) as any) : createPiperWorkerEngines(`${base}piper/`),
    resolveVoice: createManifestVoiceResolver(() => createPackRegistry({ baseUrl: packs }).list(), packs),
    fallback: fakeSystem,
    output,
    onEvent: (e) => events.push(e),
  });
  return { tts, firstPlay: () => firstPlayAt, reset: () => (firstPlayAt = 0) };
}
(window as any).bench = async (bcp47: string, sentences: string[], realAudio: boolean, mode = 'worker') => {
  const { tts, firstPlay, reset } = make({ realAudio, mode });
  const t0 = performance.now();
  await tts.warm(bcp47);
  const loadMs = performance.now() - t0;
  const rows: any[] = [];
  for (const text of sentences) {
    reset();
    events.length = 0;
    const s = performance.now();
    await tts.speak({ text, bcp47, rate: 1 });
    const total = performance.now() - s;
    const synth = events.filter((e) => e.type === 'synth');
    const first = synth[0];
    rows.push({ text, chars: text.length, ttfaMs: Math.round(firstPlay() - s), totalMs: Math.round(total), synthMs: Math.round(synth.reduce((n, e) => n + e.ms, 0)), audioS: +synth.reduce((n, e) => n + e.audioSeconds, 0).toFixed(2), firstSynthMs: Math.round(first?.ms ?? 0), events: events.filter((e) => e.type !== 'synth' && e.type !== 'ready') });
  }
  // "Again": same text again must hit the cache
  reset();
  const s2 = performance.now();
  await tts.speak({ text: sentences[0]!, bcp47, rate: 1 });
  const again = Math.round(firstPlay() - s2);
  // rate: slower
  events.length = 0;
  await tts.speak({ text: sentences[0]!, bcp47, rate: 0.7 });
  const slowAudio = events.filter((e) => e.type === 'synth').reduce((n, e) => n + e.audioSeconds, 0);
  const fb = sysSpoken.length;
  return { loadMs: Math.round(loadMs), rows, againTtfaMs: again, slowAudioS: +slowAudio.toFixed(2), systemFallbackUtterances: fb, disabled: tts.disabled };
};
(window as any).ready = true;
