import { describe, expect, it } from 'vitest';
import { createPacksVoiceResolver } from '../src/piper/voices.js';

const base = 'https://app.local/packs';
const manifests: Record<string, unknown> = {
  [`${base}/index.json`]: { packs: ['en'] },
  [`${base}/en/manifest.json`]: {
    formatVersion: 1, tag: 'en', name: 'English', autonym: 'English', script: 'Latn', direction: 'ltr',
    fallback: [], voice: { kind: 'tts', engine: 'piper', bcp47: 'en-GB', voiceHint: 'en_GB-alba-medium' },
    reads: true, status: 'beta', regions: ['CM'], license: 'CC-BY-4.0', contributors: [], version: '1.0.0',
  },
};
const fetchJson = async (u: string) => {
  if (!(u in manifests)) throw new Error(`404 ${u}`);
  return manifests[u];
};

describe('voices delivered by the signed update channel', () => {
  it('uses the local copies when both voice files arrived by update', async () => {
    const local = (u: string) => Promise.resolve(u.includes('/en/voice/') ? `blob:${u.split('/').pop()}` : null);
    const spec = await createPacksVoiceResolver(base, fetchJson, local)('en-GB');
    expect(spec?.modelUrl).toBe('blob:en_GB-alba-medium.onnx');
    expect(spec?.configUrl).toBe('blob:en_GB-alba-medium.onnx.json');
  });

  it('keeps the bundled paths when only one file arrived', async () => {
    const half = (u: string) => Promise.resolve(u.endsWith('.onnx') ? 'blob:model' : null);
    const spec = await createPacksVoiceResolver(base, fetchJson, half)('en-GB');
    expect(spec?.modelUrl).toBe(`${base}/en/voice/en_GB-alba-medium.onnx`);
  });

  it('keeps the bundled paths when the update store fails', async () => {
    const broken = () => Promise.reject(new Error('IndexedDB unavailable'));
    const spec = await createPacksVoiceResolver(base, fetchJson, broken)('en-GB');
    expect(spec?.modelUrl).toBe(`${base}/en/voice/en_GB-alba-medium.onnx`);
  });
});
