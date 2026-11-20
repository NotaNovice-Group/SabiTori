import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import type { PackManifest } from '@sabitori/core';
import { KOKORO_VERSION, type KokoroNativePlugin, type TtsBackend } from '@sabitori/speech';
import { createAppTts } from '../src/engine/native-player';

const en = JSON.parse(readFileSync(join(process.cwd(), '../../packs/en/manifest.json'), 'utf8')) as PackManifest;
const list = async () => ({ manifests: [en], complete: true, errors: [] });

function plugin() {
  const p: KokoroNativePlugin & { load: ReturnType<typeof vi.fn> } = {
    load: vi.fn(async () => ({ threads: 4 })),
    synthesize: vi.fn(async () => ({ audio: '', sampleRate: 24000 })),
    unload: vi.fn(async () => undefined),
  };
  return p;
}
const settle = async () => {
  for (let i = 0; i < 20; i++) await new Promise((r) => setTimeout(r, 0));
};

describe('createAppTts', () => {
  const system: TtsBackend = { speak: vi.fn(async () => undefined), cancel: vi.fn() };
  it('uses the system voice directly where Piper cannot run', () => {
    expect(createAppTts(system, { piper: false })).toBe(system);
  });

  it('native app: loads the bundled Kokoro model in the SabiToriKokoro plugin, with 4 threads', async () => {
    const p = plugin();
    createAppTts(system, { piper: true, baseUrl: 'https://localhost/', list, kokoroPlugin: p, kokoroMemory: { get: () => null, set: vi.fn() } });
    await settle();
    expect(p.load).toHaveBeenCalledWith({ model: 'kokoro/model_uint8.onnx', threads: 4 });
  });

  it('native app: a phone found too slow recently does not load the model again', async () => {
    const p = plugin();
    const verdict = { version: `${KOKORO_VERSION}-native`, threads: 4, at: Date.now() - 1000 };
    createAppTts(system, { piper: true, baseUrl: 'https://localhost/', list, kokoroPlugin: p, kokoroMemory: { get: () => verdict, set: vi.fn() } });
    await settle();
    expect(p.load).not.toHaveBeenCalled();
  });

  it('web with one thread: no Kokoro (it would download 177 MB for nothing)', async () => {
    const p = plugin();
    const get = vi.fn(() => null);
    createAppTts(system, { piper: true, baseUrl: 'https://localhost/', list, kokoroPlugin: null, kokoroMemory: { get, set: vi.fn() } });
    await settle();
    expect(p.load).not.toHaveBeenCalled();
  });
});
