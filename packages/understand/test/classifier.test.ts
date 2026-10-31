import { describe, expect, it, vi } from 'vitest';
import { createLlmClassifier, wllamaAssetPaths, type LlmEngine } from '../src/index.js';
import { facts, fallbackWith, input } from './helpers.js';

const good = '{"kind":"bank","action":"pay","urgency":"urgent","confidence":0.95}';
const eng = (fn: LlmEngine['complete']): LlmEngine => ({ complete: fn });

describe('createLlmClassifier', () => {
  it('returns model labels with capped, combined confidence', async () => {
    const c = await createLlmClassifier({ model: 'x', fallback: fallbackWith({ kind: 'bank' }), engine: eng(async () => good) });
    expect(c.id).toBe('qwen2.5-1.5b-q4@1');
    const u = await c.classify(input('hi'), facts());
    expect(u).toMatchObject({ kind: 'bank', action: 'pay', urgency: 'urgent', confidence: 0.9, producedBy: c.id });
  });
  it('lowers confidence when fallback disagrees on kind', async () => {
    const c = await createLlmClassifier({ model: 'x', fallback: fallbackWith({ kind: 'school' }), engine: eng(async () => good) });
    expect((await c.classify(input('hi'), facts())).confidence).toBe(0.54);
  });
  it.each(['not json', '{"kind":"nope","action":"pay","urgency":"info","confidence":0.5}'])('falls back on bad output %s', async (out) => {
    const c = await createLlmClassifier({ model: 'x', fallback: fallbackWith(), engine: eng(async () => out) });
    expect((await c.classify(input('hi'), facts())).producedBy).toBe('rules@1');
  });
  it('falls back when engine throws', async () => {
    const c = await createLlmClassifier({ model: 'x', fallback: fallbackWith(), engine: eng(async () => { throw new Error('boom'); }) });
    expect((await c.classify(input('hi'), facts())).producedBy).toBe('rules@1');
  });
  it('falls back on timeout and aborts the engine', async () => {
    let aborted = false;
    const c = await createLlmClassifier({
      model: 'x', fallback: fallbackWith(), timeoutMs: 20,
      engine: eng(({ signal }) => new Promise((_, rej) => signal.addEventListener('abort', () => { aborted = true; rej(new Error('abort')); }))),
    });
    expect((await c.classify(input('hi'), facts())).producedBy).toBe('rules@1');
    expect(aborted).toBe(true);
  });
  it('serialises concurrent calls', async () => {
    let active = 0, max = 0;
    const c = await createLlmClassifier({
      model: 'x', fallback: fallbackWith(),
      engine: eng(async () => { active++; max = Math.max(max, active); await new Promise((r) => setTimeout(r, 5)); active--; return good; }),
    });
    await Promise.all([c.classify(input('a'), facts()), c.classify(input('b'), facts())]);
    expect(max).toBe(1);
  });
});

describe('wllama wiring (mocked)', () => {
  it('loads a Blob and passes grammar + abort signal', async () => {
    const loadModel = vi.fn(async () => {});
    const create = vi.fn(async (_a: unknown) => ({ choices: [{ message: { content: good } }] }));
    const ctor = vi.fn();
    vi.doMock('@wllama/wllama', () => ({
      Wllama: class { constructor(...a: unknown[]) { ctor(...a); } loadModel = loadModel; createChatCompletion = create; },
    }));
    const { createLlmClassifier: make } = await import('../src/classifier.js');
    const c = await make({ model: new Blob(['GGUF']), fallback: fallbackWith(), wasmBaseUrl: '/w', threads: 2 });
    await c.classify(input('hi'), facts());
    expect(ctor.mock.calls[0]![0]).toEqual(wllamaAssetPaths('/w'));
    expect(loadModel).toHaveBeenCalledOnce();
    const arg = create.mock.calls[0]![0] as Record<string, unknown>;
    expect(arg.grammar).toContain('root ::=');
    expect(arg.temperature).toBe(0);
    expect(arg.abortSignal).toBeInstanceOf(AbortSignal);
    vi.doUnmock('@wllama/wllama');
  });
});

describe('wllamaAssetPaths', () => {
  it('normalises the trailing slash', () => {
    expect(wllamaAssetPaths('/wllama').default).toBe('/wllama/wllama.wasm');
    expect(wllamaAssetPaths('/wllama/')['multi-thread/wllama.wasm']).toBe('/wllama/wllama.wasm');
  });
});
