/**
 * Files that must never be inside packs/ (and so never published, never committed): what the Recorder keeps for
 * working on a pack. recorder-notes.json holds the project's speakers (names, consent, who recorded what) and the
 * reviewers' notes; a pack has no place for it and the people in it agreed to nothing of the sort.
 */
import { readdirSync } from 'node:fs';
import { join, relative } from 'node:path';

export const FORBIDDEN_PACK_FILES = ['recorder-notes.json'];

/** Relative paths (under `dir`) of forbidden files, sorted. Missing directory: none. */
export function findForbiddenPackFiles(dir) {
  const found = [];
  const walk = (d) => {
    let entries;
    try {
      entries = readdirSync(d, { withFileTypes: true });
    } catch {
      return;
    }
    for (const e of entries) {
      const p = join(d, e.name);
      if (e.isDirectory()) walk(p);
      else if (FORBIDDEN_PACK_FILES.includes(e.name)) found.push(relative(dir, p).split('\\').join('/'));
    }
  };
  walk(dir);
  return found.sort();
}

export const forbiddenMessage = (path) =>
  `${path} must not be in a pack: it lists the project's speakers and review notes. Delete it (the Recorder no longer exports it by default).`;
