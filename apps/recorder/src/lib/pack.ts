/**
 * Build and read language pack zips in the exact folder layout of /packs/<tag>/:
 *   manifest.json, phrases.json, rules.json (always), audio/<clipId>.<webm|m4a>, audio/index.json
 * plus, only when asked for, a working copy with recorder-notes.json that keeps what a pack has no place for
 * (review notes, atom labels, letter palette) so work can continue. That file must never be put in packs/
 * (scripts/check-packs.mjs and scripts/guard-packs.mjs reject it).
 */
import { zipSync, unzipSync, strToU8, strFromU8 } from 'fflate';
import type { LanguagePack, PackManifest, PackPhrases, PackRules, PhraseEntry } from '@sabitori/core';
import { noRules, validateRules } from '@sabitori/speech';
import { buildAudio, textPieces } from './slots';
import { labelOf, parseRules } from './rulesLabels';
import { minimalRules } from './starter';
import { ITEM_BY_KEY, type ClipRecord, type Project, type PhraseWork, type Speaker, DEFAULT_PALETTE, today } from './model';

export const NOTES_FILE = 'recorder-notes.json';
/** Lists every clip in audio/ ({"clips":[{"id","file"}]}). Written on export, regenerated from the clips, ignored on import. */
export const AUDIO_INDEX = 'audio/index.json';
/** In the working notes: a speaker who is not listed (no consent to be named) is recorded under this id. */
export const UNLISTED = '?';
/** Speaker id given to clips of an imported pack that came with no notes (their consent was settled when that pack was published). */
export const EARLIER = 'earlier-pack';

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

// ---- who did what ----------------------------------------------------------------------------------------------

/** Every speaker who recorded a clip of this phrase (from the clips, not just the last one), plus `recordedBy`. */
export function recordersOf(p: Pick<Project, 'phrases'>, clips: ReadonlyMap<string, ClipRecord>, key: string): Set<string> {
  const out = new Set<string>();
  const w = p.phrases[key];
  if (w?.recordedBy) out.add(w.recordedBy);
  const re = new RegExp(`^${key.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\.\\d+$`);
  for (const [id, c] of clips) if (re.test(id)) out.add(c.speakerId ?? UNLISTED);
  return out;
}

/** A reviewer must be a known speaker and must not have recorded any part of the phrase. */
export function canReview(p: Pick<Project, 'phrases' | 'speakers'>, clips: ReadonlyMap<string, ClipRecord>, key: string, speakerId: string | undefined): { ok: true } | { ok: false; reason: string } {
  const sp = p.speakers.find((s) => s.id === speakerId);
  if (!sp) return { ok: false, reason: 'Choose who is listening first.' };
  if (recordersOf(p, clips, key).has(sp.id)) return { ok: false, reason: `${sp.name || 'This person'} recorded this. A different person must review it.` };
  return { ok: true };
}

// ---- consent -----------------------------------------------------------------------------------------------------

export interface BlockedClip {
  id: string;
  /** Plain words: why this clip is not exported. */
  reason: string;
}

/**
 * The clips that may be exported: those of a speaker who agreed to have their voice recorded AND published.
 * A clip with no speaker, or of a speaker who is not in the project, is blocked too: there is no consent to show.
 */
export function exportableClips(p: Pick<Project, 'speakers'>, clips: ReadonlyMap<string, ClipRecord>): { allowed: Map<string, ClipRecord>; blocked: BlockedClip[] } {
  const allowed = new Map<string, ClipRecord>();
  const blocked: BlockedClip[] = [];
  for (const [id, c] of clips) {
    const sp = p.speakers.find((s) => s.id === c.speakerId);
    if (!sp) blocked.push({ id, reason: 'no speaker is recorded for it, so there is no consent to publish the voice' });
    else if (!sp.voiceConsent) blocked.push({ id, reason: `${sp.name.trim() || 'the speaker'} has not agreed to have their voice published` });
    else allowed.set(id, c);
  }
  return { allowed, blocked };
}

// ---- pack files ----------------------------------------------------------------------------------------------------

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

/**
 * Phrases for phrases.json. A phrase is "reviewed" only when a known speaker other than every recorder of the
 * phrase marked it so; an imported "reviewed" without that record is exported as draft. `clips` should be the
 * exportable clips (exportableClips): audio is written only for phrases whose every text piece is recorded in them.
 */
export function buildPhrases(p: Project, clips: ReadonlyMap<string, ClipRecord>): PackPhrases {
  const out: Record<string, PhraseEntry> = {};
  for (const [key, w] of Object.entries(p.phrases)) {
    const text = w.text.trim();
    if (!text) continue;
    const trusted = w.review === 'reviewed' && !!w.reviewedBy && p.speakers.some((s) => s.id === w.reviewedBy) && !recordersOf(p, clips, key).has(w.reviewedBy);
    const entry: PhraseEntry = { text, status: trusted ? 'reviewed' : 'draft' };
    const st = phraseRecordedState(key, text, clips);
    if (st.total > 0 && st.done === st.total) entry.audio = buildAudio(key, text);
    out[key] = entry;
  }
  return out as PackPhrases;
}

/** The pack's rules: the community's rules.json when it is valid, else the minimal valid one (and a warning). */
export function buildRules(p: Pick<Project, 'rulesText'>): { rules: PackRules; warning?: string } {
  if (!p.rulesText?.trim()) return { rules: minimalRules() };
  let parsed: unknown;
  try {
    parsed = JSON.parse(p.rulesText);
  } catch {
    return { rules: minimalRules(), warning: 'The number and date rules are not valid JSON, so the pack has only the minimal rules. Fix them under Pack and export again.' };
  }
  try {
    return { rules: validateRules(parsed, 'rules') };
  } catch (e) {
    return { rules: minimalRules(), warning: `The number and date rules are not valid (${e instanceof Error ? e.message : String(e)}), so the pack has only the minimal rules. Fix them under Pack.` };
  }
}

/** The pack as the speech package sees it (used to ask requiredClips what atoms are needed). */
export function toLanguagePack(p: Project, clips: ReadonlyMap<string, ClipRecord>): LanguagePack {
  let rules: PackRules = noRules();
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

/** Rules that are just the minimal digits placeholder: a project starts from the questions again instead of listing only 0-9. */
export function isMinimalRulesText(text: string | undefined): boolean {
  const r = parseRules(text) as { numbers?: { atoms?: Record<string, string> } } | undefined;
  if (!r || Object.keys(r).some((k) => k !== 'formatVersion' && k !== 'numbers')) return false;
  const n = r.numbers;
  if (!n || Object.keys(n).some((k) => k !== 'atoms')) return false;
  const a = n.atoms ?? {};
  return Object.keys(a).length === 10 && [...'0123456789'].every((d) => a[d] === d);
}

/** The word an atom clip should say now: what the speaker wrote, else the rules' word. */
export function currentAtomLabel(p: Pick<Project, 'atoms' | 'rulesText'>, id: string): string {
  const own = p.atoms[id]?.label?.trim();
  if (own) return own;
  return labelOf(parseRules(p.rulesText), id)?.trim() ?? '';
}

export interface ExportOptions {
  /**
   * Also write recorder-notes.json (a WORKING COPY: review notes, atom labels, letters, speakers who agreed to be
   * named). Default false. A working copy must never be put in packs/ or published.
   */
  includeNotes?: boolean;
  /** Extra clip ids to include (atoms the speaker recorded). */
  atomIds: string[];
}

export interface ExportResult {
  bytes: Uint8Array;
  version: string;
  files: string[];
  /** Clips left out because their speaker has not agreed to have their voice published. */
  blocked: BlockedClip[];
  /** Atom clips left out because the word was changed after recording ("stale"). */
  stale: string[];
  /** Plain-words problems the person should see (invalid rules, left-out clips). */
  warnings: string[];
  /** The zip is a working copy (has notes): not for packs/. */
  workingCopy: boolean;
}

export async function exportPackZip(p: Project, clips: ReadonlyMap<string, ClipRecord>, opts: ExportOptions): Promise<ExportResult> {
  const version = bumpPatch(p.version);
  const manifest = buildManifest(p, version);
  const { allowed, blocked } = exportableClips(p, clips);
  const phrases = buildPhrases(p, allowed);
  const files: Record<string, Uint8Array | [Uint8Array, { level: 0 }]> = {};
  const json = (o: unknown) => strToU8(JSON.stringify(o, null, 2) + '\n');
  const warnings: string[] = [];
  files['manifest.json'] = json(manifest);
  files['phrases.json'] = json(phrases);
  const r = buildRules(p);
  if (r.warning) warnings.push(r.warning);
  files['rules.json'] = json(r.rules);

  // Atom clips only when the clip was recorded for the word as it stands now (no stale number words).
  const stale: string[] = [];
  const atomIds: string[] = [];
  for (const id of opts.atomIds) {
    const c = allowed.get(id);
    if (!c) continue;
    const label = currentAtomLabel(p, id);
    if (label && c.text === label) atomIds.push(id);
    else stale.push(id);
  }
  const ids = new Set<string>([...usedPhraseClips(phrases), ...atomIds]);
  const written: { id: string; file: string }[] = [];
  for (const id of ids) {
    const c = allowed.get(id);
    if (!c) continue;
    const file = `${id}.${c.ext}`;
    files[`audio/${file}`] = [new Uint8Array(await c.blob.arrayBuffer()), { level: 0 }];
    written.push({ id, file });
  }
  // The speech package refuses recorded packs without this index, and plays only the clips it lists, with this extension.
  written.sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  files[AUDIO_INDEX] = json({ clips: written });
  if (blocked.length) warnings.push(`${blocked.length} clip${blocked.length === 1 ? ' is' : 's are'} not in the pack: the speaker has not agreed to have their voice published. Tick it under Pack, People.`);
  if (stale.length) warnings.push(`${stale.length} number or date clip${stale.length === 1 ? ' was' : 's were'} recorded for a word that changed since. Record again: ${stale.slice(0, 5).join(', ')}${stale.length > 5 ? ' ...' : ''}.`);

  if (opts.includeNotes) {
    // Only speakers who agreed to be named appear here. A clip or review by someone else is recorded as UNLISTED:
    // enough to keep "the reviewer is not the recorder" true after the notes are opened again, nothing about who.
    const listed = new Map(p.speakers.filter((s) => s.consent && s.name.trim()).map((s) => [s.id, s]));
    const who = (id?: string) => (id && listed.has(id) ? id : id ? UNLISTED : undefined);
    files[NOTES_FILE] = json({
      formatVersion: 1,
      note: 'Working copy for the Recorder. Do not put this file in packs/ and do not publish it.',
      speakers: [...listed.values()],
      palette: p.palette,
      atoms: p.atoms,
      review: Object.fromEntries(
        Object.entries(p.phrases)
          .filter(([, w]) => w.review !== 'none' || w.note || w.recordedBy)
          .map(([k, w]) => [k, { review: w.review, note: w.note, reviewedBy: who(w.reviewedBy), recordedBy: who(w.recordedBy) }]),
      ),
      clips: Object.fromEntries([...ids].filter((i) => allowed.has(i)).map((i) => [i, { speakerId: who(allowed.get(i)!.speakerId) }])),
      drafts: Object.fromEntries(
        Object.entries(p.phrases).filter(([k, w]) => w.text.trim() && !phrases[k as keyof typeof phrases]).map(([k, w]) => [k, w.text]),
      ),
    });
  }
  const bytes = zipSync(files as never, { level: 0 });
  return { bytes, version, files: Object.keys(files), blocked, stale, warnings, workingCopy: !!opts.includeNotes };
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
  const now = Date.now();
  const day = today();

  const speakers: Speaker[] = notes?.speakers
    ? (notes.speakers as Speaker[])
    : manifest.contributors.map((c, i) => ({
        id: `imp${i}`,
        name: c.name,
        role: c.role === 'translator' || c.role === 'reviewer' ? c.role : 'speaker',
        consent: true,
        // Who is named in a published pack agreed to that; nothing says they agreed to anything else, so no voice consent is assumed.
        voiceConsent: false,
      }));
  // Clips of an imported pack with no notes were published already; their speaker is "the earlier pack" with consent as of the import day.
  const hasUnknown = !notes && Object.keys(raw).some((n) => /^audio\/.+\.(webm|m4a)$/.test(n.slice(prefix.length)));
  if (hasUnknown) speakers.push({ id: EARLIER, name: 'Voices of the imported pack', role: 'speaker', consent: false, voiceConsent: true, voiceConsentDate: day });
  if (notes && Object.values(notes.clips ?? {}).some((c: any) => c?.speakerId === UNLISTED) && !speakers.some((s) => s.id === UNLISTED)) {
    // Not named, no voice consent on file: their clips stay in this project but are not exported until consent is ticked.
    speakers.push({ id: UNLISTED, name: 'A speaker who is not named', role: 'speaker', consent: false, voiceConsent: false });
  }

  const known = new Set(speakers.map((s) => s.id));
  const clipSpeaker = (id: string): string | undefined => (notes ? ((notes.clips?.[id]?.speakerId as string | undefined) ?? undefined) : EARLIER);

  const work: Record<string, PhraseWork> = {};
  for (const [key, e] of Object.entries(phrases)) {
    if (!e) continue;
    const r = notes?.review?.[key];
    // "reviewed" is trusted only with a record of a known reviewer who recorded none of the phrase; a bare status is not.
    const recorders = new Set<string>();
    if (r?.recordedBy) recorders.add(r.recordedBy);
    for (const [cid, c] of Object.entries<any>(notes?.clips ?? {})) if (new RegExp(`^${key.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\.\\d+$`).test(cid)) recorders.add(c?.speakerId ?? UNLISTED);
    const trusted = r?.review === 'reviewed' && !!r.reviewedBy && r.reviewedBy !== UNLISTED && known.has(r.reviewedBy) && !recorders.has(r.reviewedBy);
    work[key] = {
      text: e.text,
      review: trusted ? 'reviewed' : r?.review === 'sent_back' ? 'sent_back' : 'none',
      note: r?.note,
      reviewedBy: trusted ? r.reviewedBy : undefined,
      recordedBy: r?.recordedBy === UNLISTED || known.has(r?.recordedBy) ? r?.recordedBy : undefined,
      ...(e.status === 'reviewed' && !trusted ? { importedReviewed: true } : {}),
    };
  }
  for (const [key, text] of Object.entries(notes?.drafts ?? {})) {
    if (!work[key]) work[key] = { text: String(text), review: notes?.review?.[key]?.review === 'sent_back' ? 'sent_back' : 'none', note: notes?.review?.[key]?.note };
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
      speakerId: clipSpeaker(id),
      ext: m[2] as 'webm' | 'm4a',
      at: now,
    });
  }
  if (!clips.length) warnings.push('No audio in this zip yet.');
  if (Object.values(work).some((w) => w.importedReviewed)) warnings.push('Some phrases were marked reviewed in the zip, but it does not say who reviewed them. They need a review here before they are exported as reviewed.');
  const project: Project = {
    id: `${manifest.tag}-${now.toString(36)}`,
    tag: manifest.tag,
    name: manifest.name,
    autonym: manifest.autonym,
    fallback: manifest.fallback ?? [],
    speakers,
    activeSpeakerId: speakers.find((s) => s.id !== EARLIER && s.id !== UNLISTED)?.id ?? speakers[0]?.id,
    license: manifest.license,
    palette: notes?.palette ?? [...DEFAULT_PALETTE],
    phrases: work,
    atoms: notes?.atoms ?? Object.fromEntries(clips.filter((c) => !isPhraseClip(c.id) && c.text).map((c) => [c.id, { label: c.text }])),
    rulesText: rules && !isMinimalRulesText(strFromU8(rules)) ? strFromU8(rules) : undefined,
    version: manifest.version,
    exportStatus: manifest.status === 'beta' ? 'beta' : 'in_recording',
    clipsSinceExport: 0,
    createdAt: now,
    updatedAt: now,
  };
  return { project, clips, warnings };
}

export { isPhraseClip };
