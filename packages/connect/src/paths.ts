/**
 * Which files an update may contain. The update channel can only ever replace files the app
 * already reads; anything else is refused before it is downloaded.
 */
export const MAX_FILE_BYTES = 20 * 1024 * 1024;
export const MAX_TOTAL_BYTES = 300 * 1024 * 1024;
export const MAX_FILES = 5000;
export const MAX_INDEX_BYTES = 2 * 1024 * 1024;

/** Coarse shape, as documented: only packs/ and regions/, no ".." anywhere. */
const SHAPE = /^(packs|regions)\/[A-Za-z0-9_.\-/]+$/;
const TAG = '[a-z][a-z0-9_-]{0,31}';
const WHITELIST: RegExp[] = [
  /^packs\/index\.json$/,
  new RegExp(`^packs/${TAG}/(manifest|phrases|rules|reading)\\.json$`),
  new RegExp(`^packs/${TAG}/audio/index\\.json$`),
  new RegExp(`^packs/${TAG}/audio/[a-z0-9][a-z0-9_.\\-]{0,63}\\.(webm|m4a)$`),
  // Region codes are upper case (regions/CM/region.json), as the app already reads them.
  /^regions\/[A-Z]{2}\/region\.json$/,
];

export function isAllowedPath(path: unknown): path is string {
  if (typeof path !== 'string' || path.length > 200) return false;
  if (!SHAPE.test(path)) return false;
  if (path.includes('..') || path.includes('//')) return false;
  if (path.split('/').some((s) => s === '' || s === '.')) return false;
  return WHITELIST.some((re) => re.test(path));
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
