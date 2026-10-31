import type { LangTag, LanguagePack, PackManifest } from '@sabitori/core';
import { PackLoadError } from './errors.js';
import { validateManifest, validatePhrases, validateRules } from './validate.js';

export interface PackRegistry {
  get(tag: LangTag): Promise<LanguagePack>;
  list(): Promise<PackManifest[]>;
}

/**
 * A pack that can tell which of its clips exist. Without `hasClip` every
 * clip is assumed present. The registry fills it from audio/index.json
 * ({"clips":["num.1",...]}) when that file exists.
 */
export type SpeechPack = LanguagePack & { hasClip?: (clipId: string) => boolean };

export type FetchLike = (url: string) => Promise<{ ok: boolean; status: number; json(): Promise<unknown> }>;

export function defaultClipUrl(baseUrl: string, tag: LangTag): (id: string) => string {
  return (id) => `${baseUrl}/${tag}/audio/${id}.webm`;
}

export function createPackRegistry(opts: { baseUrl: string; fetch?: FetchLike }): PackRegistry {
  const baseUrl = opts.baseUrl.replace(/\/+$/, '');
  const doFetch: FetchLike = opts.fetch ?? ((u) => fetch(u));
  const packs = new Map<LangTag, Promise<LanguagePack>>();
  const manifests = new Map<LangTag, Promise<PackManifest>>();

  async function getJson(url: string, tag?: string): Promise<unknown> {
    let res;
    try {
      res = await doFetch(url);
    } catch (e) {
      throw new PackLoadError(`Could not fetch ${url}: ${(e as Error).message}`, tag);
    }
    if (!res.ok) throw new PackLoadError(`Could not fetch ${url}: HTTP ${res.status}`, tag);
    try {
      return await res.json();
    } catch {
      throw new PackLoadError(`${url} is not valid JSON`, tag);
    }
  }

  const loadManifest = (tag: LangTag): Promise<PackManifest> => {
    let p = manifests.get(tag);
    if (!p) {
      p = getJson(`${baseUrl}/${tag}/manifest.json`, tag).then((j) => validateManifest(j, tag));
      p.catch(() => manifests.delete(tag));
      manifests.set(tag, p);
    }
    return p;
  };

  async function load(tag: LangTag): Promise<LanguagePack> {
    const [manifest, phrasesJson, rulesJson] = await Promise.all([
      loadManifest(tag),
      getJson(`${baseUrl}/${tag}/phrases.json`, tag),
      getJson(`${baseUrl}/${tag}/rules.json`, tag),
    ]);
    const pack: SpeechPack = {
      manifest,
      phrases: validatePhrases(phrasesJson, tag),
      rules: validateRules(rulesJson, tag),
      clipUrl: defaultClipUrl(baseUrl, tag),
    };
    if (manifest.voice.kind === 'recorded') {
      try {
        const idx = (await getJson(`${baseUrl}/${tag}/audio/index.json`, tag)) as { clips?: unknown };
        if (Array.isArray(idx.clips)) {
          const set = new Set(idx.clips.filter((x): x is string => typeof x === 'string'));
          pack.hasClip = (id) => set.has(id);
        }
      } catch {
        /* no index: assume every clip exists */
      }
    }
    return pack;
  }

  return {
    get(tag) {
      let p = packs.get(tag);
      if (!p) {
        p = load(tag);
        p.catch(() => packs.delete(tag));
        packs.set(tag, p);
      }
      return p;
    },
    async list() {
      const idx = (await getJson(`${baseUrl}/index.json`)) as { packs?: unknown };
      if (!idx || !Array.isArray(idx.packs) || idx.packs.some((x) => typeof x !== 'string')) {
        throw new PackLoadError(`${baseUrl}/index.json must look like {"packs":["fr","en"]}`);
      }
      return Promise.all((idx.packs as string[]).map(loadManifest));
    },
  };
}

/** Registry over packs already in memory (tests, recorder preview, side-loaded packs). Packs are validated. */
export function createMemoryRegistry(packs: LanguagePack[]): PackRegistry {
  const map = new Map<LangTag, LanguagePack>();
  for (const p of packs) {
    validateManifest(p.manifest, p.manifest?.tag);
    validatePhrases(p.phrases, p.manifest.tag);
    validateRules(p.rules, p.manifest.tag);
    map.set(p.manifest.tag, p.clipUrl ? p : { ...p, clipUrl: (id) => `${p.manifest.tag}/audio/${id}.webm` });
  }
  return {
    async get(tag) {
      const p = map.get(tag);
      if (!p) throw new PackLoadError(`No language pack "${tag}" in memory registry`, tag);
      return p;
    },
    async list() {
      return [...map.values()].map((p) => p.manifest);
    },
  };
}
