import type { LangTag, LanguagePack, PackManifest } from '@sabitori/core';
import { clipFile, parseAudioIndex } from './audio-index.js';
import { PackLoadError } from './errors.js';
import { requiredClips } from './required.js';
import { isNoRules, noRules } from './rules-ext.js';
import { isLangTag, validateManifest, validatePhrases, validateRules } from './validate.js';

export interface ManifestList {
  /** Valid manifests, in the order of packs/index.json. A pack whose manifest cannot be read or is invalid is left out. */
  manifests: PackManifest[];
  errors: { tag: string; message: string }[];
  /** False when some manifest was skipped; a later call tries those again. */
  complete: boolean;
}

export interface PackRegistry {
  get(tag: LangTag): Promise<LanguagePack>;
  /**
   * The manifests of every pack in index.json (each carries `status`, so the app can decide what to offer:
   * `stable` and `beta` are offered, `in_recording` and `planned` are not). A pack with a broken manifest is
   * skipped, it never hides the others. Throws only when the index itself cannot be read.
   */
  list(): Promise<PackManifest[]>;
  /**
   * Like list() but says what was skipped. Manifests are fetched once and shared: the Piper voice resolver
   * should use this (createPacksVoiceResolver's `list` option) instead of fetching them again.
   */
  manifests?(): Promise<ManifestList>;
}

/**
 * A pack that can tell which of its clips exist. Without `hasClip` every
 * clip is assumed present (memory packs in tests). createPackRegistry
 * requires audio/index.json for recorded packs and fills `hasClip` and `missingClips` from it.
 */
export type SpeechPack = LanguagePack & {
  hasClip?: (clipId: string) => boolean;
  /** Recorded packs: clips the pack needs (requiredClips) that audio/index.json does not list. Phrases that need them fall back. */
  missingClips?: string[];
  /** True when the pack had no rules.json: slots of numbers, money, dates and phones fall back per phrase. */
  noRules?: boolean;
};

export type FetchLike = (url: string) => Promise<{ ok: boolean; status: number; json(): Promise<unknown> }>;

export function defaultClipUrl(baseUrl: string, tag: LangTag, files?: ReadonlyMap<string, string>): (id: string) => string {
  return (id) => `${baseUrl}/${tag}/audio/${files?.get(id) ?? clipFile(id)}`;
}

class NotFound extends PackLoadError {}

export function createPackRegistry(opts: { baseUrl: string; fetch?: FetchLike }): PackRegistry {
  const baseUrl = opts.baseUrl.replace(/\/+$/, '');
  const doFetch: FetchLike = opts.fetch ?? ((u) => fetch(u));
  const packs = new Map<LangTag, Promise<LanguagePack>>();
  const manifests = new Map<LangTag, Promise<PackManifest>>();
  let indexP: Promise<string[]> | null = null;

  async function getJson(url: string, tag?: string): Promise<unknown> {
    let res;
    try {
      res = await doFetch(url);
    } catch (e) {
      throw new PackLoadError(`Could not fetch ${url}: ${(e as Error).message}`, tag);
    }
    if (!res.ok) {
      const E = res.status === 404 ? NotFound : PackLoadError;
      throw new E(`Could not fetch ${url}: HTTP ${res.status}`, tag);
    }
    try {
      return await res.json();
    } catch {
      throw new PackLoadError(`${url} is not valid JSON`, tag);
    }
  }

  const loadManifest = (tag: LangTag): Promise<PackManifest> => {
    let p = manifests.get(tag);
    if (!p) {
      p = (isLangTag(tag) ? getJson(`${baseUrl}/${tag}/manifest.json`, tag) : Promise.reject(new PackLoadError(`"${String(tag)}" is not a valid language tag`))).then((j) => validateManifest(j, tag));
      p.catch(() => manifests.delete(tag));
      manifests.set(tag, p);
    }
    return p;
  };

  const readIndex = (): Promise<string[]> => {
    if (!indexP) {
      indexP = getJson(`${baseUrl}/index.json`).then((idx) => {
        const list = (idx as { packs?: unknown } | null)?.packs;
        if (!Array.isArray(list) || list.some((x) => typeof x !== 'string')) {
          throw new PackLoadError(`${baseUrl}/index.json must look like {"packs":["fr","en"]}`);
        }
        return list as string[];
      });
      indexP.catch(() => (indexP = null));
    }
    return indexP;
  };

  async function load(tag: LangTag): Promise<LanguagePack> {
    const [manifest, phrasesJson, rulesJson] = await Promise.all([
      loadManifest(tag),
      getJson(`${baseUrl}/${tag}/phrases.json`, tag),
      // A missing rules.json is "no rules" (a community pack can start with phrases only); any other failure is an error.
      getJson(`${baseUrl}/${tag}/rules.json`, tag).catch((e) => {
        if (e instanceof NotFound) return undefined;
        throw e;
      }),
    ]);
    const pack: SpeechPack = {
      manifest,
      phrases: validatePhrases(phrasesJson, tag),
      rules: rulesJson === undefined ? noRules() : validateRules(rulesJson, tag),
      clipUrl: defaultClipUrl(baseUrl, tag),
      ...(rulesJson === undefined ? { noRules: true } : {}),
    };
    if (manifest.voice.kind === 'recorded') {
      // A recorded pack without a clip index cannot be checked before playback, so it is refused.
      let idx: unknown;
      try {
        idx = await getJson(`${baseUrl}/${tag}/audio/index.json`, tag);
      } catch (e) {
        throw new PackLoadError(`Recorded pack "${tag}" needs audio/index.json listing its clips: ${(e as Error).message}`, tag);
      }
      const files = parseAudioIndex(idx, tag);
      pack.hasClip = (id) => files.has(id);
      pack.clipUrl = defaultClipUrl(baseUrl, tag, files);
      pack.missingClips = requiredClips(pack).filter((id) => !files.has(id));
    }
    return pack;
  }

  async function readManifests(): Promise<ManifestList> {
    const tags = await readIndex();
    const results = await Promise.all(tags.map((t) => loadManifest(t).then((m) => ({ m }), (e: unknown) => ({ tag: t, message: e instanceof Error ? e.message : String(e) }))));
    const out: ManifestList = { manifests: [], errors: [], complete: true };
    for (const r of results) {
      if ('m' in r) out.manifests.push(r.m);
      else out.errors.push(r);
    }
    out.complete = out.errors.length === 0;
    return out;
  }

  return {
    get(tag) {
      if (!isLangTag(tag)) return Promise.reject(new PackLoadError(`"${String(tag)}" is not a valid language tag`));
      let p = packs.get(tag);
      if (!p) {
        p = load(tag);
        p.catch(() => packs.delete(tag));
        packs.set(tag, p);
      }
      return p;
    },
    async list() {
      return (await readManifests()).manifests;
    },
    manifests: readManifests,
  };
}

/** Registry over packs already in memory (tests, recorder preview, side-loaded packs). Packs are validated. */
export function createMemoryRegistry(packs: LanguagePack[]): PackRegistry {
  const map = new Map<LangTag, LanguagePack>();
  for (const p of packs) {
    validateManifest(p.manifest, p.manifest?.tag);
    validatePhrases(p.phrases, p.manifest.tag);
    if (!isNoRules(p.rules)) validateRules(p.rules, p.manifest.tag);
    map.set(p.manifest.tag, p.clipUrl ? p : { ...p, clipUrl: (id) => `${p.manifest.tag}/audio/${clipFile(id)}` });
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
    async manifests() {
      return { manifests: [...map.values()].map((p) => p.manifest), errors: [], complete: true };
    },
  };
}
