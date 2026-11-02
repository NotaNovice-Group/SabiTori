/**
 * Build and read language pack zips in the exact folder layout of /packs/<tag>/:
 *   manifest.json, phrases.json, rules.json (only if edited), audio/<clipId>.webm
 * plus an optional recorder-notes.json that keeps what a pack has no place for
 * (consent, review notes, atom labels, letter palette) so work can continue.
 */
import { zipSync, unzipSync, strToU8, strFromU8 } from 'fflate';
import type { LanguagePack, PackManifest, PackPhrases, PhraseEntry } from '@sabitori/core';
import { buildAudio, textPieces } from './slots';
import { labelOf, parseRules } from './rulesLabels';
import { ITEM_BY_KEY, type ClipRecord, type Project, type PhraseWork, type Speaker, DEFAULT_PALETTE } from './model';

export const NOTES_FILE = 'recorder-notes.json';
/** Lists every clip id in audio/ ({"clips":[...]}). Written on export, regenerated from the clips, ignored on import. */
export const AUDIO_INDEX = 'audio/index.json';

export function bumpPatch(v: string): string {
  const m = /^(\d+)\.(\d+)\.(\d+)$/.exec(v);
  return m ? `${m[1]}.${m[2]}.${Number(m[3]) + 1}` : '0.1.0';
}

/** Is every text piece of this phrase recorded for its current wording? */
export function phraseRecordedState(
  key: string,
  text: string,
  clips: ReadonlyMap<string, ClipRecord>,
): { total: number; done: number; stale: number } {
  const pieces = textPieces(key, text);
  let done = 0;
  let stale = 0;
  for (const p of pieces) {
    const c = clips.get(p.id);
    if (!c) continue;
    if (c.text === p.text) done += 1;
    else stale += 1;
  }
  return { total: pieces.length, done, stale };
}

export function buildManifest(p: Project, version = p.version): PackManifest {
  const roleOf = (s: Speaker) => s.role;
  return {
    formatVersion: 1,
    tag: p.tag,
    name: p.name,
    autonym: p.autonym,
    script: 'Latn',
    direction: 'ltr',
    fallback: p.fallback,
    voice: { kind: 'recorded' },
    reads: false,
    status: p.exportStatus,
    regions: ['CM'],
    license: p.license,
    contributors: p.speakers.filter((s) => s.consent && s.name.trim()).map((s) => ({ name: s.name.trim(), role: roleOf(s) })),
    version,
  };
}

export function buildPhrases(p: Project, clips: ReadonlyMap<string, ClipRecord>): PackPhrases {
  const out: Record<string, PhraseEntry> = {};
  for (const [key, w] of Object.entries(p.phrases)) {
    const text = w.text.trim();
    if (!text) continue;
    const entry: PhraseEntry = { text, status: w.review === 'reviewed' ? 'reviewed' : 'draft' };
    const st = phraseRecordedState(key, text, clips);
    if (st.total > 0 && st.done === st.total) entry.audio = buildAudio(key, text);
    out[key] = entry;
  }
  return out as PackPhrases;
}

/** The pack as the speech package sees it (used to ask requiredClips what atoms are needed). */
export function toLanguagePack(p: Project, clips: ReadonlyMap<string, ClipRecord>): LanguagePack {
  let rules = { formatVersion: 1 } as LanguagePack['rules'];
  if (p.rulesText) {
    try {
      rules = JSON.parse(p.rulesText);
    } catch {
      /* keep the empty rules until the text is valid again */
    }
  }
  return { manifest: buildManifest(p), phrases: buildPhrases(p, clips), rules };
}

/** Clip ids a pack's phrases actually use. */
export function usedPhraseClips(phrases: PackPhrases): Set<string> {
  const s = new Set<string>();
  for (const e of Object.values(phrases)) for (const part of e?.audio ?? []) if ('clip' in part) s.add(part.clip);
  return s;
}

const isPhraseClip = (id: string) => {
  const m = /^(.*)\.\d+$/.exec(id);
  return !!m && ITEM_BY_KEY.has(m[1]!);
};

export interface ExportOptions {
  includeNotes: boolean;
  /** Extra clip ids to include (atoms the speaker recorded). */
  atomIds: string[];
}

export async function exportPackZip(
  p: Project,
  clips: ReadonlyMap<string, ClipRecord>,
  opts: ExportOptions,
): Promise<{ bytes: Uint8Array; version: string; files: string[] }> {
  const version = bumpPatch(p.version);
  const manifest = buildManifest(p, version);
  const phrases = buildPhrases(p, clips);
  const files: Record<string, Uint8Array | [Uint8Array, { level: 0 }]> = {};
  const json = (o: unknown) => strToU8(JSON.stringify(o, null, 2) + '\n');
  files['manifest.json'] = json(manifest);
  files['phrases.json'] = json(phrases);
  if (p.rulesText) {
    try {
      files['rules.json'] = json(JSON.parse(p.rulesText));
    } catch {
      /* invalid rules text is never exported */
    }
  }
  const ids = new Set<string>([...usedPhraseClips(phrases), ...opts.atomIds]);
  const written: string[] = [];
  for (const id of ids) {
    const c = clips.get(id);
    if (!c) continue;
    files[`audio/${id}.${c.ext}`] = [new Uint8Array(await c.blob.arrayBuffer()), { level: 0 }];
    written.push(id);
  }
  // The speech package refuses recorded packs without this index of the clips present in audio/.
  files[AUDIO_INDEX] = json({ clips: written.sort() });
  if (opts.includeNotes) {
    files[NOTES_FILE] = json({
      formatVersion: 1,
      speakers: p.speakers,
      palette: p.palette,
      atoms: p.atoms,
      review: Object.fromEntries(
        Object.entries(p.phrases)
          .filter(([, w]) => w.review !== 'none' || w.note || w.recordedBy)
          .map(([k, w]) => [k, { review: w.review, note: w.note, reviewedBy: w.reviewedBy, recordedBy: w.recordedBy }]),
      ),
      clips: Object.fromEntries([...ids].filter((i) => clips.has(i)).map((i) => [i, { speakerId: clips.get(i)!.speakerId }])),
      drafts: Object.fromEntries(
        Object.entries(p.phrases).filter(([k, w]) => w.text.trim() && !phrases[k as keyof typeof phrases]).map(([k, w]) => [k, w.text]),
      ),
    });
  }
  const bytes = zipSync(files as never, { level: 0 });
  return { bytes, version, files: Object.keys(files) };
}

export interface ImportedPack {
  project: Project;
  clips: ClipRecord[];
  warnings: string[];
}

export function importPackZip(data: Uint8Array): ImportedPack {
  const raw = unzipSync(data);
  // Accept a zip that wraps everything in one folder (e.g. "ewo/").
  const names = Object.keys(raw);
  const prefix = names.find((n) => n.endsWith('manifest.json'))?.replace(/manifest\.json$/, '') ?? '';
  const get = (n: string) => raw[prefix + n];
  const mf = get('manifest.json');
  if (!mf) throw new Error('This zip has no manifest.json. Is it a SabiTori language pack?');
  const warnings: string[] = [];
  const manifest = JSON.parse(strFromU8(mf)) as PackManifest;
  const phrasesFile = get('phrases.json');
  const phrases = (phrasesFile ? JSON.parse(strFromU8(phrasesFile)) : {}) as PackPhrases;
  const rules = get('rules.json');
  const notesFile = get(NOTES_FILE);
  const notes = notesFile ? (JSON.parse(strFromU8(notesFile)) as Record<string, any>) : undefined;

  const speakers: Speaker[] = notes?.speakers ?? manifest.contributors.map((c, i) => ({
    id: `imp${i}`,
    name: c.name,
    role: c.role === 'translator' || c.role === 'reviewer' ? c.role : 'speaker',
    consent: true,
  }));
  const now = Date.now();
  const work: Record<string, PhraseWork> = {};
  for (const [key, e] of Object.entries(phrases)) {
    if (!e) continue;
    const r = notes?.review?.[key];
    work[key] = {
      text: e.text,
      review: e.status === 'reviewed' ? 'reviewed' : (r?.review ?? 'none'),
      note: r?.note,
      reviewedBy: r?.reviewedBy,
      recordedBy: r?.recordedBy,
    };
  }
  for (const [key, text] of Object.entries(notes?.drafts ?? {})) {
    if (!work[key]) work[key] = { text: String(text), review: notes?.review?.[key]?.review ?? 'none', note: notes?.review?.[key]?.note };
  }

  const clips: ClipRecord[] = [];
  for (const [name, bytes] of Object.entries(raw)) {
    if (name === prefix + AUDIO_INDEX) continue; // regenerated on export
    const m = /^audio\/(.+)\.(webm|m4a)$/.exec(name.slice(prefix.length));
    if (!name.startsWith(prefix) || !m) continue;
    const id = m[1]!;
    let text = notes?.atoms?.[id]?.label ?? labelOf(parseRules(rules ? strFromU8(rules) : undefined), id) ?? '';
    const pm = /^(.*)\.(\d+)$/.exec(id);
    if (pm && work[pm[1]!]) {
      text = textPieces(pm[1]!, work[pm[1]!]!.text)[Number(pm[2])]?.text ?? '';
    }
    const type = m[2] === 'webm' ? 'audio/webm' : 'audio/mp4';
    clips.push({
      id,
      blob: new Blob([bytes as BlobPart], { type }),
      durationMs: 0,
      text,
      speakerId: notes?.clips?.[id]?.speakerId,
      ext: m[2] as 'webm' | 'm4a',
      at: now,
    });
  }
  if (!clips.length) warnings.push('No audio in this zip yet.');
  const project: Project = {
    id: `${manifest.tag}-${now.toString(36)}`,
    tag: manifest.tag,
    name: manifest.name,
    autonym: manifest.autonym,
    fallback: manifest.fallback ?? [],
    speakers,
    activeSpeakerId: speakers[0]?.id,
    license: manifest.license,
    palette: notes?.palette ?? [...DEFAULT_PALETTE],
    phrases: work,
    atoms: notes?.atoms ?? Object.fromEntries(clips.filter((c) => !isPhraseClip(c.id) && c.text).map((c) => [c.id, { label: c.text }])),
    rulesText: rules ? strFromU8(rules) : undefined,
    version: manifest.version,
    exportStatus: manifest.status === 'beta' ? 'beta' : 'in_recording',
    createdAt: now,
    updatedAt: now,
  };
  return { project, clips, warnings };
}

export { isPhraseClip };
