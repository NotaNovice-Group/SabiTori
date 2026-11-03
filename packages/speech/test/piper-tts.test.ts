import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createPiperTts, type AudioOutput, type PiperAudio, type PiperEngine, type PiperTtsOptions, type PiperVoiceSpec, type TtsBackend } from '../src/index.js';

const VOICE: PiperVoiceSpec = { id: 'fr:fr_FR-test', modelUrl: 'm.onnx', configUrl: 'm.onnx.json' };
const audio = (seconds = 1): PiperAudio => ({ samples: new Float32Array(seconds * 1000), sampleRate: 1000 });

interface FakeEngine extends PiperEngine {
  calls: Array<{ text: string; lengthScale: number }>;
  disposed: boolean;
}
function engine(over: { load?: () => Promise<void>; synth?: (t: string) => Promise<PiperAudio> } = {}): FakeEngine {
  const e: FakeEngine = {
    calls: [],
    disposed: false,
    load: over.load ?? (async () => undefined),
    async synthesize(text, { lengthScale }) {
      e.calls.push({ text, lengthScale });
      return over.synth ? over.synth(text) : audio();
    },
    dispose() {
      e.disposed = true;
    },
  };
  return e;
}

function fallback(): TtsBackend & { spoken: Array<{ text: string; bcp47: string; rate: number }> } {
  const f = {
    spoken: [] as Array<{ text: string; bcp47: string; rate: number }>,
    async speak(req: { text: string; bcp47: string; rate: number; onProgress?: (f: number) => void }) {
      f.spoken.push({ text: req.text, bcp47: req.bcp47, rate: req.rate });
      req.onProgress?.(1);
    },
    cancel: vi.fn(),
  };
  return f;
}

/** Audio output that finishes instantly and records what it played. */
function output(): AudioOutput & { played: PiperAudio[]; failWith?: Error } {
  const o: AudioOutput & { played: PiperAudio[]; failWith?: Error } = {
    played: [],
    play(a, onProgress) {
      if (o.failWith) return { done: Promise.reject(o.failWith), stop() {} };
      o.played.push(a);
      onProgress(0.5);
      return { done: Promise.resolve(), stop() {} };
    },
  };
  return o;
}

function make(over: Partial<PiperTtsOptions> & { eng?: FakeEngine } = {}) {
  const eng = over.eng ?? engine();
  const fb = fallback();
  const out = output();
  const events: unknown[] = [];
  const factory = vi.fn(() => eng);
  const tts = createPiperTts({
    engines: factory,
    resolveVoice: (b) => (b.startsWith('fr') ? VOICE : null),
    fallback: fb,
    output: out,
    onEvent: (e) => events.push(e),
    ...over,
  });
  return { tts, eng, fb, out, events, factory };
}

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

describe('Piper TTS backend: speaking', () => {
  it('synthesizes sentence by sentence and plays them in order, reporting progress', async () => {
    const { tts, eng, out, fb } = make();
    const prog: number[] = [];
    await tts.speak({ text: 'Bonjour. Merci beaucoup.', bcp47: 'fr-FR', rate: 1, onProgress: (f) => prog.push(f) });
    expect(eng.calls.map((c) => c.text)).toEqual(['Bonjour.', 'Merci beaucoup.']);
    expect(out.played).toHaveLength(2);
    expect(fb.spoken).toHaveLength(0);
    expect(prog.at(-1)).toBe(1);
    expect(prog).toEqual([...prog].sort((a, b) => a - b)); // never goes backwards
    expect(prog.every((p) => p >= 0 && p <= 1)).toBe(true);
  });

  it('maps rate to length_scale: faster is smaller', async () => {
    const { tts, eng } = make();
    await tts.speak({ text: 'Un.', bcp47: 'fr-FR', rate: 1.25, onProgress: undefined });
    await tts.speak({ text: 'Deux.', bcp47: 'fr-FR', rate: 0.5 });
    expect(eng.calls.map((c) => c.lengthScale)).toEqual([0.8, 2]);
  });

  it('uses the system voice when no pack declares a Piper voice for the language', async () => {
    const { tts, fb, eng, events } = make();
    await tts.speak({ text: 'Hello.', bcp47: 'en-GB', rate: 1 });
    expect(fb.spoken).toEqual([{ text: 'Hello.', bcp47: 'en-GB', rate: 1 }]);
    expect(eng.calls).toHaveLength(0);
    expect(events).toContainEqual({ type: 'fallback', reason: 'no-voice' });
  });

  it('speaks nothing for empty text', async () => {
    const { tts, out, fb } = make();
    await tts.speak({ text: '  ', bcp47: 'fr-FR', rate: 1 });
    expect(out.played).toHaveLength(0);
    expect(fb.spoken).toHaveLength(0);
  });
});

describe('Piper TTS backend: cache for "Again"', () => {
  it('replays the same text without synthesizing again', async () => {
    const { tts, eng, out } = make();
    await tts.speak({ text: 'Bonjour. Merci.', bcp47: 'fr-FR', rate: 1 });
    expect(eng.calls).toHaveLength(2);
    await tts.speak({ text: 'Bonjour. Merci.', bcp47: 'fr-FR', rate: 1 });
    expect(eng.calls).toHaveLength(2);
    expect(out.played).toHaveLength(4);
  });

  it('keeps one entry per rate (length_scale changes the audio)', async () => {
    const { tts, eng } = make();
    await tts.speak({ text: 'Bonjour.', bcp47: 'fr-FR', rate: 1 });
    await tts.speak({ text: 'Bonjour.', bcp47: 'fr-FR', rate: 0.8 });
    expect(eng.calls).toHaveLength(2);
    await tts.speak({ text: 'Bonjour.', bcp47: 'fr-FR', rate: 0.8 });
    expect(eng.calls).toHaveLength(2);
  });

  it('evicts the oldest audio when the byte budget is exceeded', async () => {
    const { tts, eng } = make({ maxCacheBytes: 9000 }); // one 4000-byte clip fits twice, not three times
    for (const t of ['Un.', 'Deux.', 'Trois.']) await tts.speak({ text: t, bcp47: 'fr-FR', rate: 1 });
    expect(eng.calls).toHaveLength(3);
    await tts.speak({ text: 'Trois.', bcp47: 'fr-FR', rate: 1 });
    expect(eng.calls).toHaveLength(3); // newest still cached
    await tts.speak({ text: 'Un.', bcp47: 'fr-FR', rate: 1 });
    expect(eng.calls).toHaveLength(4); // oldest was evicted
  });
});

describe('Piper TTS backend: never silent', () => {
  it('falls back to system TTS when the model fails to load, and stops trying that voice', async () => {
    const eng = engine({ load: async () => { throw new Error('HTTP 404 for m.onnx'); } });
    const { tts, fb, events, factory } = make({ eng });
    await tts.speak({ text: 'Bonjour.', bcp47: 'fr-FR', rate: 1 });
    expect(fb.spoken).toHaveLength(1);
    expect(events).toContainEqual(expect.objectContaining({ type: 'fallback', reason: 'load-error', detail: expect.stringContaining('404') }));
    expect(eng.disposed).toBe(true);
    await tts.speak({ text: 'Encore.', bcp47: 'fr-FR', rate: 1 });
    expect(fb.spoken).toHaveLength(2);
    expect(factory.mock.calls.length).toBeLessThanOrEqual(2); // at most one retry to load, never a loop
  });

  it('falls back and disables Piper for the session when the first synthesis takes longer than 6 s', async () => {
    const eng = engine({ synth: () => new Promise(() => undefined) });
    const { tts, fb, events } = make({ eng });
    const p = tts.speak({ text: 'Bonjour.', bcp47: 'fr-FR', rate: 1 });
    await vi.advanceTimersByTimeAsync(5900);
    expect(fb.spoken).toHaveLength(0);
    await vi.advanceTimersByTimeAsync(200);
    await p;
    expect(fb.spoken).toEqual([{ text: 'Bonjour.', bcp47: 'fr-FR', rate: 1 }]);
    expect(events).toContainEqual(expect.objectContaining({ reason: 'first-synthesis-slow' }));
    expect(tts.disabled).toBe(false); // only this voice is off, not Piper as a whole
    expect([...tts.disabledVoices]).toEqual([VOICE.id]);
    expect(eng.disposed).toBe(true);
    await tts.speak({ text: 'Suite.', bcp47: 'fr-FR', rate: 1 });
    expect(fb.spoken).toHaveLength(2);
    expect(eng.calls).toHaveLength(1);
  });

  it('a first synthesis just under the limit keeps Piper on, and later sentences are not timed', async () => {
    let n = 0;
    const eng = engine({ synth: () => new Promise((r) => setTimeout(() => r(audio()), n++ === 0 ? 5000 : 20000)) });
    const { tts, fb, out } = make({ eng });
    const p = tts.speak({ text: 'Premier. Deuxieme.', bcp47: 'fr-FR', rate: 1 });
    await vi.advanceTimersByTimeAsync(30000);
    await p;
    expect(fb.spoken).toHaveLength(0);
    expect(out.played).toHaveLength(2);
    expect(tts.disabled).toBe(false);
  });

  it('a model still loading after the grace period is spoken by the system voice this time, then used when ready', async () => {
    let release!: () => void;
    const eng = engine({ load: () => new Promise<void>((r) => (release = r)) });
    const { tts, fb, out, events } = make({ eng });
    const p = tts.speak({ text: 'Bonjour.', bcp47: 'fr-FR', rate: 1 });
    await vi.advanceTimersByTimeAsync(6100);
    await p;
    expect(fb.spoken).toHaveLength(1);
    expect(events).toContainEqual(expect.objectContaining({ reason: 'load-slow' }));
    expect(tts.disabled).toBe(false);
    release();
    await vi.advanceTimersByTimeAsync(0);
    await tts.speak({ text: 'Encore.', bcp47: 'fr-FR', rate: 1 });
    expect(fb.spoken).toHaveLength(1);
    expect(out.played).toHaveLength(1);
  });

  it('a synthesis error on the first sentence falls back for the whole text', async () => {
    const eng = engine({ synth: async () => { throw new Error('ort: out of memory'); } });
    const { tts, fb } = make({ eng });
    await tts.speak({ text: 'Premier. Deuxieme.', bcp47: 'fr-FR', rate: 1 });
    expect(fb.spoken).toEqual([{ text: 'Premier. Deuxieme.', bcp47: 'fr-FR', rate: 1 }]);
  });

  it('a synthesis error mid-way: the system voice speaks only what has not been played', async () => {
    let n = 0;
    const eng = engine({ synth: async () => { if (++n === 2) throw new Error('boom'); return audio(); } });
    const { tts, fb, out } = make({ eng });
    await tts.speak({ text: 'Premier. Deuxieme. Troisieme.', bcp47: 'fr-FR', rate: 1 });
    expect(out.played).toHaveLength(1);
    expect(fb.spoken.map((s) => s.text)).toEqual(['Deuxieme. Troisieme.']);
  });

  it('blocked audio output falls back to system TTS for the rest, and turns Piper off', async () => {
    const { tts, fb, out } = make();
    out.failWith = new Error('audio is blocked by the browser');
    await tts.speak({ text: 'Premier. Deuxieme.', bcp47: 'fr-FR', rate: 1 });
    expect(fb.spoken.map((s) => s.text)).toEqual(['Premier. Deuxieme.']);
    expect(tts.disabled).toBe(true);
  });

  it('forwards the fallback progress as a fraction of the whole text', async () => {
    const { tts, fb, out } = make();
    out.failWith = new Error('blocked');
    const prog: number[] = [];
    await tts.speak({ text: 'Un.', bcp47: 'fr-FR', rate: 1, onProgress: (f) => prog.push(f) });
    expect(fb.spoken).toHaveLength(1);
    expect(prog.at(-1)).toBe(1);
  });
});

describe('Piper TTS backend: cancel and warm', () => {
  it('cancel stops playback, silences the fallback too, and a cancelled speak resolves without speaking more', async () => {
    let stopped = false;
    let resolveDone!: () => void;
    const out: AudioOutput = { play: () => ({ done: new Promise<void>((r) => (resolveDone = r)), stop: () => { stopped = true; resolveDone(); } }) };
    const { tts, fb } = make({ output: out });
    const p = tts.speak({ text: 'Premier. Deuxieme.', bcp47: 'fr-FR', rate: 1 });
    await vi.advanceTimersByTimeAsync(10);
    tts.cancel();
    await p;
    expect(stopped).toBe(true);
    expect(fb.cancel).toHaveBeenCalled();
    expect(fb.spoken).toHaveLength(0);
  });

  it('a newer speak supersedes an older one that is still loading', async () => {
    let release!: () => void;
    const eng = engine({ load: () => new Promise<void>((r) => (release = r)) });
    const { tts, out } = make({ eng });
    const a = tts.speak({ text: 'Ancien.', bcp47: 'fr-FR', rate: 1 });
    const b = tts.speak({ text: 'Nouveau.', bcp47: 'fr-FR', rate: 1 });
    await vi.advanceTimersByTimeAsync(0);
    release();
    await vi.advanceTimersByTimeAsync(0);
    await Promise.all([a, b]);
    expect(eng.calls.map((c) => c.text)).toEqual(['Nouveau.']);
    expect(out.played).toHaveLength(1);
  });

  it('warm loads the model ahead of the first utterance', async () => {
    const { tts, eng } = make();
    expect(await tts.warm('fr-FR')).toBe(true);
    expect(await tts.warm('en-GB')).toBe(false);
    expect(eng.calls).toHaveLength(0);
  });

  it('warm reports false (and does not throw) when loading fails', async () => {
    const { tts } = make({ eng: engine({ load: async () => { throw new Error('x'); } }) });
    expect(await tts.warm('fr-FR')).toBe(false);
  });

  it('keeps at most maxLoadedVoices models in memory', async () => {
    const engs = new Map<string, FakeEngine>();
    const voices: Record<string, PiperVoiceSpec> = { fr: { ...VOICE, id: 'fr' }, en: { ...VOICE, id: 'en' }, ewo: { ...VOICE, id: 'ewo' } };
    const tts = createPiperTts({
      engines: (v) => { const e = engine(); engs.set(v.id, e); return e; },
      resolveVoice: (b) => voices[b] ?? null,
      fallback: fallback(),
      output: output(),
      maxLoadedVoices: 2,
    });
    for (const b of ['fr', 'en', 'ewo']) await tts.speak({ text: 'Un.', bcp47: b, rate: 1 });
    expect(engs.get('fr')!.disposed).toBe(true);
    expect(engs.get('en')!.disposed).toBe(false);
    expect(engs.get('ewo')!.disposed).toBe(false);
  });
});
