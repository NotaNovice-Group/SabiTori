import { describe, expect, it } from 'vitest';
import { chunkText, createBrowserTts, createPlayer, pickVoice, type ClipBackend, type RenderedSection, type TtsBackend } from '../src/index.js';

function fakes() {
  const log: string[] = [];
  let release: (() => void) | null = null;
  const gate = new Map<string, () => void>();
  const wait = (name: string) => new Promise<void>((res) => {
    gate.set(name, res);
    release = res;
  });
  const tts: TtsBackend = {
    speak: async ({ text, rate, onProgress }) => {
      log.push(`tts:${text}@${rate}`);
      onProgress?.(0.5);
      await wait(`tts:${text}`);
    },
    cancel: () => { log.push('cancel-tts'); release?.(); },
  };
  const clips: ClipBackend = {
    play: async ({ url }) => {
      log.push(`clip:${url}`);
      if (url === 'bad') throw new Error('x');
      await wait(url);
    },
    cancel: () => { log.push('cancel-clip'); release?.(); },
  };
  const finish = async (name: string) => {
    for (let i = 0; i < 20 && !gate.has(name); i++) await Promise.resolve();
    gate.get(name)!();
    gate.delete(name);
    for (let i = 0; i < 20; i++) await Promise.resolve();
  };
  return { log, tts, clips, finish };
}
const sec = (section: RenderedSection['section'], ...parts: RenderedSection['parts']): RenderedSection => ({ section, text: '', parts, lang: 'fr' });
const T = (text: string) => ({ kind: 'tts' as const, text, bcp47: 'fr-FR' });
const C = (url: string) => ({ kind: 'clip' as const, url });

describe('player', () => {
  it('plays parts and sections in order with callbacks', async () => {
    const f = fakes();
    const p = createPlayer(f);
    const events: string[] = [];
    p.play([sec('about', T('a'), C('c1')), sec('action', T('b'))], {
      rate: 0.8,
      onSection: (i) => events.push(`s${i}`),
      onProgress: (i, fr) => events.push(`p${i}:${fr}`),
    });
    expect(p.playing).toBe(true);
    await f.finish('tts:a');
    await f.finish('c1');
    await f.finish('tts:b');
    expect(f.log.filter((l) => !l.startsWith('cancel'))).toEqual(['tts:a@0.8', 'clip:c1', 'tts:b@0.8']);
    expect(events).toEqual(['s0', 'p0:0.25', 'p0:0.5', 'p0:1', 's1', 'p1:0.5', 'p1:1', 'snull']);
    expect(p.playing).toBe(false);
  });

  it('starts from an index', async () => {
    const f = fakes();
    const p = createPlayer(f);
    const seen: (number | null)[] = [];
    p.play([sec('about', T('a')), sec('action', T('b')), sec('help', T('c'))], { rate: 1, from: 1, onSection: (i) => seen.push(i) });
    await f.finish('tts:b');
    await f.finish('tts:c');
    expect(f.log.filter((l) => l.startsWith('tts'))).toEqual(['tts:b@1', 'tts:c@1']);
    expect(seen).toEqual([1, 2, null]);
  });
  it('stop cancels cleanly, ends the section once and plays nothing more', async () => {
    const f = fakes();
    const p = createPlayer(f);
    const seen: (number | null)[] = [];
    p.play([sec('about', T('a'), T('a2')), sec('action', T('b'))], { rate: 1, onSection: (i) => seen.push(i) });
    await f.finish('tts:a').catch(() => undefined);
    p.stop();
    await Promise.resolve();
    expect(p.playing).toBe(false);
    expect(f.log).toContain('cancel-tts');
    expect(f.log).toContain('cancel-clip');
    expect(seen.at(-1)).toBeNull();
    expect(seen.filter((s) => s === null)).toHaveLength(1);
    p.stop();
    expect(seen.filter((s) => s === null)).toHaveLength(1);
  });
  it('a new play() stops the previous one', async () => {
    const f = fakes();
    const p = createPlayer(f);
    const a: (number | null)[] = [];
    p.play([sec('about', T('a'))], { rate: 1, onSection: (i) => a.push(i) });
    await Promise.resolve();
    p.play([sec('about', T('z'))], { rate: 1 });
    await f.finish('tts:z');
    expect(a).toEqual([0, null]);
    expect(f.log.filter((l) => l.startsWith('tts'))).toEqual(['tts:a@1', 'tts:z@1']);
    expect(p.playing).toBe(false);
  });
  it('a failing clip aborts its section, reports it, and later sections still play', async () => {
    const f = fakes();
    const p = createPlayer(f);
    const errors: [number, string][] = [];
    p.play([sec('about', C('bad'), T('after')), sec('action', T('next'))], { rate: 1, onError: (i, e) => errors.push([i, e.message]) });
    await f.finish('tts:next');
    expect(f.log.filter((l) => !l.startsWith('cancel'))).toEqual(['clip:bad', 'tts:next@1']);
    expect(errors).toEqual([[0, 'x']]);
    expect(p.playing).toBe(false);
  });
  it('empty sections report full progress; empty plan ends immediately', async () => {
    const f = fakes();
    const p = createPlayer(f);
    const ev: string[] = [];
    p.play([sec('about')], { rate: 1, onSection: (i) => ev.push(`s${i}`), onProgress: (i, fr) => ev.push(`p${i}:${fr}`) });
    await Promise.resolve();
    expect(ev).toEqual(['s0', 'p0:1', 'snull']);
    p.play([], { rate: 1 });
    await Promise.resolve();
    expect(p.playing).toBe(false);
  });
});

describe('chunkText', () => {
  it('keeps short text whole', () => expect(chunkText('Hello  there.')).toEqual(['Hello there.']));
  it('splits long text at sentences within the limit', () => {
    const text = Array.from({ length: 12 }, (_, i) => `Sentence number ${i} is here.`).join(' ');
    const chunks = chunkText(text, 100);
    expect(chunks.length).toBeGreaterThan(2);
    expect(chunks.every((c) => c.length <= 100)).toBe(true);
    expect(chunks.join(' ')).toBe(text);
    expect(chunks.slice(0, -1).every((c) => c.endsWith('.'))).toBe(true);
  });
  it('hard-splits text without spaces', () => {
    expect(chunkText('x'.repeat(250), 100).every((c) => c.length <= 100)).toBe(true);
  });
});

describe('pickVoice', () => {
  const v = (lang: string, localService: boolean) => ({ lang, localService });
  it('prefers exact tag, then local service', () => {
    expect(pickVoice([v('fr-CA', true), v('fr-FR', false)], 'fr-FR')).toEqual(v('fr-FR', false));
    expect(pickVoice([v('fr-FR', false), v('fr-FR', true)], 'fr-FR')).toEqual(v('fr-FR', true));
    expect(pickVoice([v('fr_CA', true), v('en-US', true)], 'fr-FR')).toEqual(v('fr_CA', true));
    expect(pickVoice([v('en-US', true)], 'fr-FR')).toBeUndefined();
  });
});

describe('browser tts backend', () => {
  function synthFake(initial: { lang: string; localService: boolean }[]) {
    const spoken: { text: string; lang: string; voice: unknown }[] = [];
    let voices = initial;
    let listener: (() => void) | undefined;
    const ops: string[] = [];
    const synth = {
      speak(u: any) { ops.push('speak'); spoken.push({ text: u.text, lang: u.lang, voice: u.voice }); queueMicrotask(() => { u.onboundary?.({ charIndex: 3 }); u.onend?.(); }); },
      cancel() { ops.push('cancel'); },
      getVoices: () => voices,
      addEventListener: (_: string, cb: () => void) => { listener = cb; },
      removeEventListener: () => { listener = undefined; },
    };
    const makeUtterance = (text: string) => ({ text, lang: '', rate: 1, voice: null as unknown, onend: null, onerror: null, onboundary: null });
    return { synth, spoken, ops, makeUtterance, setVoices: (x: typeof voices) => { voices = x; listener?.(); } };
  }
  it('cancels first, picks a voice, chunks and reports progress', async () => {
    const s = synthFake([{ lang: 'fr-FR', localService: true }]);
    const tts = createBrowserTts({ synth: s.synth, makeUtterance: s.makeUtterance as never });
    const text = 'Une phrase assez longue. '.repeat(20).trim();
    const prog: number[] = [];
    await tts.speak({ text, bcp47: 'fr-FR', rate: 0.9, onProgress: (f) => prog.push(f) });
    expect(s.ops[0]).toBe('cancel');
    expect(s.spoken.length).toBeGreaterThan(1);
    expect(s.spoken.every((x) => x.lang === 'fr-FR' && (x.voice as any)?.lang === 'fr-FR')).toBe(true);
    expect(prog.at(-1)).toBe(1);
    expect([...prog].sort((a, b) => a - b)).toEqual(prog);
  });
  it('waits for voices to load', async () => {
    const s = synthFake([]);
    const tts = createBrowserTts({ synth: s.synth, makeUtterance: s.makeUtterance as never });
    const done = tts.speak({ text: 'Bonjour', bcp47: 'fr-FR', rate: 1 });
    await Promise.resolve();
    s.setVoices([{ lang: 'fr-FR', localService: true }]);
    await done;
    expect((s.spoken[0]!.voice as any).lang).toBe('fr-FR');
  });
  it('rejects without speechSynthesis', async () => {
    await expect(createBrowserTts({}).speak({ text: 'x', bcp47: 'fr', rate: 1 })).rejects.toThrow(/not available/);
  });
});
