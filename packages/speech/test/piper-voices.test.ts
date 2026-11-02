import { describe, expect, it } from 'vitest';
import type { PackManifest } from '@sabitori/core';
import { createManifestVoiceResolver, createPacksVoiceResolver, loadManifests, piperVoiceFromManifest } from '../src/index.js';

const m = (tag: string, voice: PackManifest['voice']): PackManifest => ({ formatVersion: 1, tag, name: tag, autonym: tag, script: 'Latn', direction: 'ltr', fallback: [], voice, reads: false, status: 'beta', regions: ['CM'], license: 'CC-BY-4.0', contributors: [], version: '0.1.0' }) as PackManifest;

describe('piperVoiceFromManifest', () => {
  it('points at packs/<tag>/voice/<model id>.onnx(.json)', () => {
    const v = piperVoiceFromManifest(m('fr', { kind: 'tts', engine: 'piper', bcp47: 'fr-FR', voiceHint: 'fr_FR-siwis-low' }), './packs/');
    expect(v).toEqual({ id: 'fr:fr_FR-siwis-low', modelUrl: './packs/fr/voice/fr_FR-siwis-low.onnx', configUrl: './packs/fr/voice/fr_FR-siwis-low.onnx.json' });
  });
  it('defaults the model id to the pack tag and refuses path tricks in voiceHint', () => {
    expect(piperVoiceFromManifest(m('ewo', { kind: 'tts', engine: 'piper', bcp47: 'ewo' }), 'p')!.modelUrl).toBe('p/ewo/voice/ewo.onnx');
    expect(piperVoiceFromManifest(m('ewo', { kind: 'tts', engine: 'piper', bcp47: 'ewo', voiceHint: '../x' }), 'p')!.modelUrl).toBe('p/ewo/voice/ewo.onnx');
  });
  it('is null for system voices and recorded packs', () => {
    expect(piperVoiceFromManifest(m('en', { kind: 'tts', engine: 'system', bcp47: 'en-GB' }), 'p')).toBeNull();
    expect(piperVoiceFromManifest(m('en', { kind: 'recorded' }), 'p')).toBeNull();
  });
});

describe('createManifestVoiceResolver', () => {
  const list = async () => [m('fr', { kind: 'tts', engine: 'piper', bcp47: 'fr-FR', voiceHint: 'a' }), m('en', { kind: 'tts', engine: 'piper', bcp47: 'en-GB', voiceHint: 'b' }), m('wes', { kind: 'tts', engine: 'system', bcp47: 'pcm' })];
  it('matches by exact tag then by language, ignoring case and underscores', async () => {
    const r = createManifestVoiceResolver(list, 'p');
    expect((await r('fr_fr'))!.id).toBe('fr:a');
    expect((await r('en-US'))!.id).toBe('en:b');
    expect(await r('pcm')).toBeNull();
    expect(await r('de-DE')).toBeNull();
  });
  it('returns null when the manifests cannot be listed', async () => {
    const r = createManifestVoiceResolver(async () => { throw new Error('offline'); }, 'p');
    expect(await r('fr-FR')).toBeNull();
  });
});

describe('loadManifests / createPacksVoiceResolver', () => {
  const files: Record<string, unknown> = {
    'p/index.json': { packs: ['fr', 'bad', 'gone', 'en'] },
    'p/fr/manifest.json': m('fr', { kind: 'tts', engine: 'piper', bcp47: 'fr-FR', voiceHint: 'a' }),
    'p/en/manifest.json': m('en', { kind: 'tts', engine: 'piper', bcp47: 'en-GB', voiceHint: 'b' }),
    'p/bad/manifest.json': { nonsense: true },
  };
  const get = async (u: string) => {
    if (!(u in files)) throw new Error(`HTTP 404 for ${u}`);
    return files[u];
  };
  it('one broken or missing manifest does not take the other voices away', async () => {
    const r = await loadManifests('p/', get);
    expect(r.manifests.map((x) => x.tag).sort()).toEqual(['en', 'fr']);
    expect(r.complete).toBe(false);
    const resolve = createPacksVoiceResolver('p', get);
    expect((await resolve('fr-FR'))!.modelUrl).toBe('p/fr/voice/a.onnx');
    expect((await resolve('en-GB'))!.id).toBe('en:b');
  });
  it('rejects when the index cannot be read (the player then uses the system voice)', async () => {
    await expect(createPacksVoiceResolver('q', get)('fr-FR')).rejects.toThrow(/404/);
  });
});
