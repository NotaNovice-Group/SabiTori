import type { PackManifest } from '@sabitori/core';
import { validateManifest } from '../validate.js';
import type { PiperVoiceSpec } from './engine.js';

/**
 * The Piper voice a pack declares: `voice: { kind: 'tts', engine: 'piper', bcp47, voiceHint: '<model id>' }`.
 * Its files are `<packsBase>/<tag>/voice/<model id>.onnx` and `.onnx.json`, so a community pack ships its
 * own model by adding those two files and naming the model id (no code change). Without a voiceHint the
 * id defaults to the pack tag. Returns null for packs that use the system voice or recordings.
 */
export function piperVoiceFromManifest(m: Pick<PackManifest, 'tag' | 'voice'>, packsBase: string): PiperVoiceSpec | null {
  const v = m.voice;
  if (v.kind !== 'tts' || v.engine !== 'piper') return null;
  const id = v.voiceHint && /^[A-Za-z0-9._-]+$/.test(v.voiceHint) ? v.voiceHint : m.tag;
  const base = `${packsBase.replace(/\/+$/, '')}/${m.tag}/voice/${id}`;
  return { id: `${m.tag}:${id}`, modelUrl: `${base}.onnx`, configUrl: `${base}.onnx.json` };
}

const norm = (s: string): string => s.toLowerCase().replace(/_/g, '-');

/** Maps a BCP 47 tag from a rendered part to the Piper voice of the pack that declared that tag (exact tag first, then same language). */
export function createManifestVoiceResolver(list: () => Promise<PackManifest[]>, packsBase: string): (bcp47: string) => Promise<PiperVoiceSpec | null> {
  let cached: Promise<PackManifest[]> | null = null;
  return async (bcp47) => {
    const manifests = await (cached ??= list().catch(() => {
      cached = null;
      return [] as PackManifest[];
    }));
    const want = norm(bcp47);
    const primary = want.split('-')[0];
    const piper = manifests.filter((m) => m.voice.kind === 'tts' && m.voice.engine === 'piper');
    const exact = piper.find((m) => m.voice.kind === 'tts' && norm(m.voice.bcp47) === want);
    const lang = piper.find((m) => m.voice.kind === 'tts' && norm(m.voice.bcp47).split('-')[0] === primary);
    const m = exact ?? lang;
    return m ? piperVoiceFromManifest(m, packsBase) : null;
  };
}

/**
 * Reads the manifests of every pack in `<packsBase>/index.json`, each on its own: a pack with a broken or
 * missing manifest is skipped and does not stop the others from getting their voice. Throws only when the
 * index itself cannot be read. `complete` is false when some manifest was skipped (the caller should retry later).
 */
export async function loadManifests(packsBase: string, fetchJson?: (url: string) => Promise<unknown>): Promise<{ manifests: PackManifest[]; complete: boolean }> {
  const base = packsBase.replace(/\/+$/, '');
  const get = fetchJson ?? (async (u: string) => {
    const r = await fetch(u);
    if (!r.ok) throw new Error(`HTTP ${r.status} for ${u}`);
    return r.json();
  });
  const idx = (await get(`${base}/index.json`)) as { packs?: unknown };
  const tags = Array.isArray(idx?.packs) ? idx.packs.filter((t): t is string => typeof t === 'string') : [];
  let complete = true;
  const manifests: PackManifest[] = [];
  await Promise.all(
    tags.map(async (tag) => {
      try {
        manifests.push(validateManifest(await get(`${base}/${tag}/manifest.json`), tag));
      } catch {
        complete = false;
      }
    }),
  );
  return { manifests, complete };
}

/** The resolver the app uses: manifests read from `<packsBase>`, re-read until every one of them could be read. */
export function createPacksVoiceResolver(packsBase: string, fetchJson?: (url: string) => Promise<unknown>): (bcp47: string) => Promise<PiperVoiceSpec | null> {
  let done: PackManifest[] | null = null;
  return async (bcp47) => {
    let list = done;
    if (!list) {
      const r = await loadManifests(packsBase, fetchJson);
      list = r.manifests;
      if (r.complete) done = list;
    }
    return createManifestVoiceResolver(async () => list!, packsBase)(bcp47);
  };
}
