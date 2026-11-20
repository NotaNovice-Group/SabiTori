import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  createKokoroTts,
  KOKORO_FIRST_AUDIO_MS,
  KOKORO_MAX_WAIT_MS,
  KOKORO_PROBE,
  KOKORO_RETEST_MS,
  kokoroFirstSynthesisBudget,
  kokoroSpeedVerdict,
  kokoroVoiceFor,
  skipKokoro,
  type AudioOutput,
  type KokoroVoiceSpec,
  type PiperAudio,
  type PiperEngine,
  type PiperEvent,
  type TtsBackend,
} from '../src/index.js';

describe('Kokoro speed guard (pure)', () => {
  it('gives the first synthesis 2.5 s, more for a long piece, never more than 5 s', () => {
    expect(kokoroFirstSynthesisBudget('Bonjour.')).toBe(KOKORO_FIRST_AUDIO_MS);
    expect(kokoroFirstSynthesisBudget('x'.repeat(84))).toBe(3600); // ~6 s of speech: 0.6 s per second
  });

  it('scales with the expected length of speech and with the rate', () => {
    // 140 characters ~ 10 s of speech -> 6 s, capped at 5 s.
    expect(kokoroFirstSynthesisBudget('x'.repeat(140))).toBe(KOKORO_MAX_WAIT_MS);
    // 70 characters ~ 5 s of speech -> 3 s.
    expect(kokoroFirstSynthesisBudget('x'.repeat(70))).toBe(3000);
    // Faster speech is shorter: 70 characters at rate 2 ~ 2.5 s -> the 2.5 s floor.
    expect(kokoroFirstSynthesisBudget('x'.repeat(70), 2)).toBe(KOKORO_FIRST_AUDIO_MS);
    expect(kokoroFirstSynthesisBudget('x'.repeat(70), 0)).toBe(3000); // a broken rate counts as 1
  });

  it('accepts a real-time factor below 1 only', () => {
    expect(kokoroSpeedVerdict({ ms: 1500, audioSeconds: 3 })).toEqual({ ok: true, rtf: 0.5 });
    const slow = kokoroSpeedVerdict({ ms: 3000, audioSeconds: 3 });
    expect(slow.ok).toBe(false);
    expect(slow).toMatchObject({ rtf: 1, why: 'real-time factor 1.00 (limit 1)' });
    expect(kokoroSpeedVerdict({ ms: 8000, audioSeconds: 2.9 }).ok).toBe(false);
    expect(kokoroSpeedVerdict({ ms: 500, audioSeconds: 0 }).ok).toBe(true); // nothing to judge
  });

  it('remembers a slow phone for 30 days, for the same model and thread count only', () => {
    const now = 1_800_000_000_000;
    const v = { version: 'v1', threads: 1, at: now - 1000, why: 'slow' };
    expect(skipKokoro(v, now, 'v1', 1)).toBe(true);
    expect(skipKokoro(v, now, 'v2', 1)).toBe(false); // new model: test again
    expect(skipKokoro(v, now, 'v1', 4)).toBe(false); // more threads now: test again
    expect(skipKokoro({ ...v, at: now - KOKORO_RETEST_MS }, now, 'v1', 1)).toBe(false);
    expect(skipKokoro({ ...v, at: now + 60_000 }, now, 'v1', 1)).toBe(false); // clock went back
    for (const junk of [null, undefined, 'slow', 42, {}, { version: 'v1', threads: 1, at: 'x' }]) expect(skipKokoro(junk, now, 'v1', 1)).toBe(false);
  });
});

const audio = (seconds: number): PiperAudio => ({ samples: new Float32Array(Math.round(seconds * 1000)), sampleRate: 1000 });
const EN = kokoroVoiceFor('en', '/k/')!;
const FR = kokoroVoiceFor('fr', '/k/')!;

/** Fake Kokoro engine: each synthesis takes `rtf` x the audio length (1 s of audio per 14 characters) of fake time. */
function engines(rtf: number, over: { load?: () => Promise<void>; fail?: boolean } = {}) {
  const calls: string[] = [];
  const disposed: string[] = [];
  const factory = vi.fn((voice: KokoroVoiceSpec): PiperEngine => ({
    load: over.load ?? (async () => undefined),
    async synthesize(text) {
      calls.push(text);
      const secs = Math.max(text.length / 14, 0.1);
      await new Promise((r) => setTimeout(r, secs * rtf * 1000));
      if (over.fail) throw new Error('boom');
      return audio(secs);
    },
    dispose() {
      disposed.push(voice.id);
    },
  }));
  return { factory, calls, disposed };
}

function make(rtf: number, over: { load?: () => Promise<void>; fail?: boolean } = {}) {
  const e = engines(rtf, over);
  const spoken: string[] = [];
  const fallback: TtsBackend = {
    async speak(r) {
      spoken.push(r.text);
    },
    cancel: vi.fn(),
  };
  const played: PiperAudio[] = [];
  const output: AudioOutput = {
    play(a) {
      played.push(a);
      return { done: new Promise((r) => setTimeout(r, (a.samples.length / a.sampleRate) * 1000)), stop() {} };
    },
  };
  const events: PiperEvent[] = [];
  const tts = createKokoroTts({
    engines: e.factory,
    resolveVoice: (b) => (b.startsWith('fr') ? FR : b.startsWith('en') ? EN : null),
    fallback,
    output,
    onEvent: (ev) => events.push(ev),
    now: () => Date.now(),
  });
  return { tts, ...e, spoken, played, events };
}

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

const TEXT = 'Your bill must be paid before the end of the month. Thank you for your trust.';

describe('Kokoro TTS: fast phone', () => {
  it('passes the background speed test, then speaks sentence by sentence, the next made while one plays', async () => {
    const { tts, calls, spoken, played, events } = make(0.4);
    const warm = tts.warm('en-GB');
    await vi.advanceTimersByTimeAsync(5000);
    expect(await warm).toBe(true);
    expect(calls).toEqual([KOKORO_PROBE['en-us']]);
    const t0 = Date.now();
    let endAt = 0;
    const done = tts.speak({ text: TEXT, bcp47: 'en-GB', rate: 1 }).then(() => (endAt = Date.now()));
    await vi.advanceTimersByTimeAsync(60_000);
    await done;
    expect(spoken).toEqual([]);
    const [s1, s2] = ['Your bill must be paid before the end of the month.', 'Thank you for your trust.'];
    expect(calls.slice(1)).toEqual([s1, s2]);
    expect(played).toHaveLength(2);
    expect(events.filter((e) => e.type === 'fallback')).toEqual([]);
    // Pipelined: the first synthesis, then both sentences back to back (the second was made while the first played).
    const audioMs = played.reduce((n, a) => n + a.samples.length, 0);
    const firstSynthMs = (s1.length / 14) * 0.4 * 1000;
    const secondSynthMs = (s2.length / 14) * 0.4 * 1000;
    expect(endAt - t0).toBeGreaterThanOrEqual(firstSynthMs + audioMs - 5);
    expect(endAt - t0).toBeLessThan(firstSynthMs + audioMs + secondSynthMs - 100);
  });

  it('without a warm-up, the first real synthesis is judged instead and passes', async () => {
    const { tts, spoken, played } = make(0.5);
    const done = tts.speak({ text: 'Thank you.', bcp47: 'fr-FR', rate: 1 });
    await vi.advanceTimersByTimeAsync(10_000);
    await done;
    expect(spoken).toEqual([]);
    expect(played).toHaveLength(1);
  });
});

describe('Kokoro TTS: slow phone, never silent', () => {
  it('a speed test over the 2.5 s limit switches Kokoro off for every language before anyone listens', async () => {
    const { tts, spoken, calls, disposed, events } = make(3); // RTF 3: like single-thread wasm on a server CPU
    const warm = tts.warm('en-GB');
    await vi.advanceTimersByTimeAsync(KOKORO_FIRST_AUDIO_MS + 10);
    expect(await warm).toBe(false);
    expect(disposed).toContain('kokoro:af_heart'); // worker freed
    expect(tts.tooSlow).toMatch(/not ready after 2500 ms/);
    expect(events.find((e) => e.type === 'fallback')).toMatchObject({ type: 'fallback', reason: 'first-synthesis-slow', voice: 'kokoro:af_heart' });
    const before = calls.length;
    await tts.speak({ text: 'Hello.', bcp47: 'en-GB', rate: 1 });
    await tts.speak({ text: 'Bonjour.', bcp47: 'fr-FR', rate: 1 });
    expect(spoken).toEqual(['Hello.', 'Bonjour.']); // straight to the fallback, no waiting
    expect(calls.length).toBe(before);
    expect(await tts.warm('fr-FR')).toBe(false);
  });

  it('a first piece ready in time but slower than real time also switches Kokoro off', async () => {
    // 9 characters: 0.64 s of audio made in 0.77 s, well inside the 2.5 s deadline but slower than real time.
    const { tts, spoken, played, events } = make(1.2);
    const done = tts.speak({ text: 'Hi there.', bcp47: 'en-GB', rate: 1 });
    await vi.advanceTimersByTimeAsync(5000);
    await done;
    expect(played).toHaveLength(0);
    expect(spoken).toEqual(['Hi there.']);
    expect(events).toContainEqual(expect.objectContaining({ reason: 'first-synthesis-slow', detail: expect.stringMatching(/real-time factor 1.20/) }));
    expect(tts.tooSlow).toMatch(/real-time factor/);
  });

  it('a first synthesis that misses its deadline is spoken by the fallback, not waited for', async () => {
    const { tts, spoken } = make(5);
    const t0 = Date.now();
    const done = tts.speak({ text: TEXT, bcp47: 'en-GB', rate: 1 });
    await vi.advanceTimersByTimeAsync(KOKORO_MAX_WAIT_MS + 10);
    await done;
    expect(Date.now() - t0).toBeLessThanOrEqual(KOKORO_MAX_WAIT_MS + 10);
    expect(spoken).toEqual([TEXT]);
  });

  it('a speak() that arrives during the speed test waits for its verdict, then uses the fallback', async () => {
    const { tts, spoken, calls } = make(3);
    void tts.warm('fr-FR');
    await vi.advanceTimersByTimeAsync(10); // loaded, speed test running
    const done = tts.speak({ text: 'Bonjour.', bcp47: 'fr-FR', rate: 1 });
    await vi.advanceTimersByTimeAsync(KOKORO_FIRST_AUDIO_MS);
    await done;
    expect(spoken).toEqual(['Bonjour.']);
    expect(calls).toEqual([KOKORO_PROBE.fr]); // the utterance itself was never given to Kokoro
  });

  it('a model that cannot load: the fallback speaks', async () => {
    const { tts, spoken } = make(0.3, { load: async () => Promise.reject(new Error('HTTP 404')) });
    expect(await tts.warm('en-GB')).toBe(false);
    await tts.speak({ text: 'Hello.', bcp47: 'en-GB', rate: 1 });
    expect(spoken).toEqual(['Hello.']);
  });

  it('a speed test that fails with an error marks the voice broken and the fallback speaks', async () => {
    const { tts, spoken, events } = make(0.3, { fail: true });
    const warm = tts.warm('en-GB');
    await vi.advanceTimersByTimeAsync(3000);
    expect(await warm).toBe(false);
    expect(events).toContainEqual(expect.objectContaining({ reason: 'synthesis-error', detail: 'speed test: boom' }));
    await tts.speak({ text: 'Hello.', bcp47: 'en-GB', rate: 1 });
    expect(spoken).toEqual(['Hello.']);
  });

  it('languages without a Kokoro voice go to the fallback', async () => {
    const { tts, spoken } = make(0.3);
    await tts.speak({ text: 'Mbolo.', bcp47: 'ewo', rate: 1 });
    expect(spoken).toEqual(['Mbolo.']);
  });
});
