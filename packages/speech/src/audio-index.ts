import { PackLoadError } from './errors.js';
import { isId } from './validate.js';

/** Audio formats a pack may ship. The index records which one each clip uses. */
export const CLIP_EXTENSIONS = ['webm', 'm4a'] as const;
export type ClipExtension = (typeof CLIP_EXTENSIONS)[number];

export interface AudioIndexEntry {
  id: string;
  /** File name inside audio/, always `<id>.webm` or `<id>.m4a`. */
  file: string;
}

/** Longest clip id (and so file stem) the update channel and the registry accept. */
export const MAX_CLIP_ID = 100;

export const clipFile = (id: string, ext: ClipExtension = 'webm'): string => `${id}.${ext}`;

/**
 * Reads audio/index.json: `{"clips": [ {"id": "money.amount.0", "file": "money.amount.0.m4a"}, ... ]}`.
 * An entry may also be a plain string (the clip id); that form means `<id>.webm`, so packs written before
 * clips could be .m4a keep working. Returns clip id -> file name. Throws PackLoadError on anything else:
 * a file name that is not the id plus .webm or .m4a, a repeated id, an invalid id.
 */
export function parseAudioIndex(json: unknown, tag?: string): Map<string, string> {
  const fail = (m: string): never => {
    throw new PackLoadError(`audio/index.json of "${tag}" ${m}`, tag);
  };
  const clips = typeof json === 'object' && json !== null && !Array.isArray(json) ? (json as { clips?: unknown }).clips : undefined;
  if (!Array.isArray(clips)) return fail('must look like {"clips":[{"id":"num.1","file":"num.1.webm"}, ...]}');
  const out = new Map<string, string>();
  for (const e of clips) {
    let id: unknown;
    let file: unknown;
    if (typeof e === 'string') {
      id = e;
      file = `${e}.webm`;
    } else if (typeof e === 'object' && e !== null && !Array.isArray(e)) {
      id = (e as { id?: unknown }).id;
      file = (e as { file?: unknown }).file;
    } else return fail('has an entry that is neither a clip id nor {"id","file"}');
    if (!isId(id) || id.length > MAX_CLIP_ID) return fail(`has an invalid clip id ${JSON.stringify(id)}`);
    if (!CLIP_EXTENSIONS.some((x) => file === clipFile(id, x))) return fail(`lists "${id}" with file ${JSON.stringify(file)}; it must be "${id}.webm" or "${id}.m4a"`);
    if (out.has(id)) return fail(`lists "${id}" twice`);
    out.set(id, file as string);
  }
  return out;
}
