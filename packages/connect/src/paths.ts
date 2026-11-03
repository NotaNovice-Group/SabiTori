/**
 * Which files an update may contain. The update channel can only ever replace files the app
 * already reads; anything else is refused before it is downloaded.
 */
export const MAX_FILE_BYTES = 20 * 1024 * 1024;
/** Piper voice models (a French or English voice is 28 to 63 MB; community voices are smaller). */
export const MAX_VOICE_BYTES = 80 * 1024 * 1024;
export const MAX_TOTAL_BYTES = 300 * 1024 * 1024;
export const MAX_FILES = 5000;
export const MAX_INDEX_BYTES = 2 * 1024 * 1024;
/** A language's own file list (`packs/<tag>/index.json`). */
export const MAX_LANGUAGE_INDEX_BYTES = 2 * 1024 * 1024;

/** Coarse shape, as documented: only packs/ and regions/, no ".." anywhere. */
const SHAPE = /^(packs|regions)\/[A-Za-z0-9_.\-/]+$/;
/**
 * Pack tags and clip ids follow the speech package's validators (validate.ts), not a narrower pattern: tags are
 * BCP 47 shaped ("fr", "ewo", "pcm-CM") and clip ids may use upper case ("currency.XAF"). A path the app reads
 * is never refused by the update channel only because of its spelling.
 */
const TAG = '[a-z]{2,3}(?:-[A-Za-z0-9]{2,8})*';
const MAX_TAG = 35;
/** Longest clip id (file stem), as in the speech package. */
const CLIP = '[A-Za-z0-9][A-Za-z0-9_.\\-]{0,99}';
const WHITELIST: RegExp[] = [
  /^packs\/index\.json$/,
  new RegExp(`^packs/${TAG}/(manifest|phrases|rules|reading)\\.json$`),
  // Per-language file list of a language that is updated on its own (see UpdateIndex.languages).
  new RegExp(`^packs/${TAG}/index\\.json$`),
  new RegExp(`^packs/${TAG}/audio/index\\.json$`),
  new RegExp(`^packs/${TAG}/audio/${CLIP}\\.(webm|m4a)$`),
  // Piper voices: an English voice, or a voice trained on a community's own recordings.
  new RegExp(`^packs/${TAG}/voice/[A-Za-z0-9][A-Za-z0-9_.\\-]{0,63}\\.onnx(\\.json)?$`),
  // Region codes are upper case (regions/CM/region.json), as the app already reads them.
  /^regions\/[A-Z]{2}\/region\.json$/,
];

/** The pack tag of a `packs/<tag>/...` path, or null. */
export function packTagOf(path: string): string | null {
  const m = /^packs\/([^/]+)\//.exec(path);
  return m ? m[1]! : null;
}

export function isAllowedPath(path: unknown): path is string {
  if (typeof path !== 'string' || path.length > 200) return false;
  if (!SHAPE.test(path)) return false;
  if (path.includes('..') || path.includes('//')) return false;
  if (path.split('/').some((s) => s === '' || s === '.')) return false;
  if (!WHITELIST.some((re) => re.test(path))) return false;
  const tag = packTagOf(path);
  return tag === null || tag.length <= MAX_TAG;
}

/** Largest size a file at this path may have. */
export function maxFileBytes(path: string): number {
  return /\/voice\/[^/]+\.onnx$/.test(path) ? MAX_VOICE_BYTES : MAX_FILE_BYTES;
}

export function contentTypeOf(path: string): string {
  if (path.endsWith('.json')) return 'application/json';
  if (path.endsWith('.webm')) return 'audio/webm';
  if (path.endsWith('.m4a')) return 'audio/mp4';
  return 'application/octet-stream';
}

/**
 * Maps a request URL of the app (for example "./packs/fr/phrases.json" or
 * "https://localhost/regions/CM/region.json?x") to an update path, or null.
 */
export function updatePathOfUrl(url: string): string | null {
  const clean = url.split('#')[0]!.split('?')[0]!.replace(/^[a-z][a-z0-9+.-]*:\/\/[^/]*/i, '');
  const m = /(?:^|\/)((?:packs|regions)\/.*)$/.exec(clean);
  const path = m?.[1];
  return path && isAllowedPath(path) ? path : null;
}
