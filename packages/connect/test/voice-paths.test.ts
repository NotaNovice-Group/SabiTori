import { describe, expect, it } from 'vitest';
import { isAllowedPath, maxFileBytes, MAX_FILE_BYTES, MAX_VOICE_BYTES } from '../src/index.js';

describe('voice models in updates', () => {
  it('allows a Piper voice and its config inside a pack', () => {
    expect(isAllowedPath('packs/en/voice/en_GB-alba-medium.onnx')).toBe(true);
    expect(isAllowedPath('packs/en/voice/en_GB-alba-medium.onnx.json')).toBe(true);
    expect(isAllowedPath('packs/lns/voice/lns-community-v1.onnx')).toBe(true);
  });

  it('refuses anything else under voice/', () => {
    for (const p of [
      'packs/en/voice/../manifest.json',
      'packs/en/voice/x.bin',
      'packs/en/voice/.hidden.onnx',
      'packs/en/voice/sub/x.onnx',
      'packs/en/voice/x.onnx.exe',
      'regions/CM/voice/x.onnx',
    ])
      expect(isAllowedPath(p), p).toBe(false);
  });

  it('gives voice models a larger, still bounded, size limit', () => {
    expect(maxFileBytes('packs/en/voice/en_GB-alba-medium.onnx')).toBe(MAX_VOICE_BYTES);
    expect(maxFileBytes('packs/en/voice/en_GB-alba-medium.onnx.json')).toBe(MAX_FILE_BYTES);
    expect(maxFileBytes('packs/fr/phrases.json')).toBe(MAX_FILE_BYTES);
    expect(MAX_VOICE_BYTES).toBeLessThanOrEqual(80 * 1024 * 1024);
  });
});
