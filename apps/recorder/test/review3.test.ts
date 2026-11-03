/** Regression tests for review round 3 (Recorder). */
import { describe, expect, it } from 'vitest';
import { unzipSync, zipSync, strToU8 } from 'fflate';
import { createPackRegistry, renderPhrase, requiredClips, validateRules, type FetchLike } from '@sabitori/speech';
import type { PackRules, RegionConfig } from '@sabitori/core';
import {
  buildPhrases, buildRules, canReview, currentAtomLabel, exportableClips, exportPackZip, importPackZip, isMinimalRulesText, recordersOf, toLanguagePack, EARLIER, NOTES_FILE, UNLISTED,
} from '../src/lib/pack';
import { EXPORT_PROMPT_EVERY, newProject, shouldPromptExport, type ClipRecord, type Project } from '../src/lib/model';
import { labelOf, withLabel } from '../src/lib/rulesLabels';
import { DEFAULT_ANSWERS, minimalRules, neutralRules } from '../src/lib/starter';
import { requestPersistence } from '../src/lib/persist';
import { persistClip, withUnsaved } from '../src/lib/unsaved';
import { textPieces } from '../src/lib/slots';

const dec = new TextDecoder();
const blob = (type = 'audio/webm') => new Blob([new Uint8Array([1, 2, 3, 4])], { type });
const clip = (id: string, text: string, speakerId: string | undefined, ext: 'webm' | 'm4a' = 'webm'): ClipRecord => ({ id, blob: blob(ext === 'webm' ? 'audio/webm' : 'audio/mp4'), durationMs: 800, text, ext, at: 1, speakerId });

function project(): Project {
  const p = newProject({
    tag: 'xzr', name: 'Xar', autonym: 'Xàr', fallback: ['fr'], license: 'CC-BY-SA-4.0',
    speakers: [
      { id: 'ama', name: 'Ama N.', role: 'speaker', consent: true, voiceConsent: true, voiceConsentDate: '2026-10-01' },
      { id: 'bebe', name: 'Bebe K.', role: 'reviewer', consent: true, voiceConsent: true, voiceConsentDate: '2026-10-02' },
      { id: 'anon', name: 'Anonymous Voice', role: 'speaker', consent: false, voiceConsent: true, voiceConsentDate: '2026-10-03' },
      { id: 'nope', name: 'Declined', role: 'speaker', consent: true, voiceConsent: false },
    ],
  });
  p.phrases['scam.likely'] = { text: 'Trik!', review: 'reviewed', recordedBy: 'ama', reviewedBy: 'bebe' };
  p.phrases['deadline.by'] = { text: 'Na {date} na di de.', review: 'none', recordedBy: 'ama' };
  return p;
}
const clipsFor = (p: Project, who: Record<string, string | undefined> = {}, ext: 'webm' | 'm4a' = 'webm') => {
  const m = new Map<string, ClipRecord>();
  for (const [k, w] of Object.entries(p.phrases)) for (const piece of textPieces(k, w.text)) m.set(piece.id, clip(piece.id, piece.text, k in who ? who[k] : 'ama', ext));
  return m;
};
const read = async (p: Project, clips: Map<string, ClipRecord>, opts: Parameters<typeof exportPackZip>[2] = { atomIds: [] }) => {
  const r = await exportPackZip(p, clips, opts);
  const z = unzipSync(r.bytes);
  const json = (n: string) => JSON.parse(dec.decode(z[n]));
  return { r, z, json };
};

describe('1. clips keep their extension in audio/index.json', () => {
  it('writes {"id","file"} entries with the real extension', async () => {
    const p = project();
    const { z, json } = await read(p, clipsFor(p, {}, 'm4a'));
    expect(Object.keys(z).filter((n) => n.startsWith('audio/')).sort()).toEqual(['audio/deadline.by.0.m4a', 'audio/deadline.by.1.m4a', 'audio/index.json', 'audio/scam.likely.0.m4a']);
    expect(json('audio/index.json').clips).toEqual([
      { id: 'deadline.by.0', file: 'deadline.by.0.m4a' }, { id: 'deadline.by.1', file: 'deadline.by.1.m4a' }, { id: 'scam.likely.0', file: 'scam.likely.0.m4a' },
    ]);
  });
  it('a mixed pack (webm and m4a clips) keeps each clip\'s own extension', async () => {
    const p = project();
    const clips = clipsFor(p);
    clips.set('scam.likely.0', clip('scam.likely.0', 'Trik!', 'ama', 'm4a'));
    const { json } = await read(p, clips);
    expect(json('audio/index.json').clips.map((c: { file: string }) => c.file)).toEqual(['deadline.by.0.webm', 'deadline.by.1.webm', 'scam.likely.0.m4a']);
  });
  it('the speech package loads the exported pack and plays the .m4a files', async () => {
    const p = project();
    const { z, json } = await read(p, clipsFor(p, {}, 'm4a'));
    const files: Record<string, unknown> = { '/p/index.json': { packs: ['xzr'] } };
    for (const n of ['manifest.json', 'phrases.json', 'rules.json', 'audio/index.json']) files[`/p/xzr/${n}`] = json(n);
    const fetchLike: FetchLike = async (u) => (u in files ? { ok: true, status: 200, json: async () => files[u] } : { ok: false, status: 404, json: async () => ({}) });
    const reg = createPackRegistry({ baseUrl: '/p', fetch: fetchLike });
    const region: RegionConfig = { formatVersion: 1, code: 'CM', name: 'Cameroon', timezone: 'Africa/Douala', currency: { code: 'XAF', aliases: [] }, phone: { countryCode: '237', nationalPattern: '6\\d{8}' }, languages: ['xzr'], officialSenders: [] };
    const r = await renderPhrase('scam.likely', undefined, 'xzr', reg, { region, today: '2026-11-02' });
    expect(r.lang).toBe('xzr');
    expect(r.parts).toEqual([{ kind: 'clip', url: '/p/xzr/audio/scam.likely.0.m4a' }]);
    expect(Object.keys(z)).toContain('audio/scam.likely.0.m4a');
  });
});

describe('3. every export has a valid rules.json', () => {
  it('a project with no rules exports the minimal valid rules (digits 0-9)', async () => {
    const p = project();
    const { z, json } = await read(p, clipsFor(p));
    expect(z['rules.json']).toBeDefined();
    expect(() => validateRules(json('rules.json'))).not.toThrow();
    expect(json('rules.json')).toEqual(minimalRules());
  });
  it('rules that are not valid JSON, or not valid rules, are replaced by the minimal ones, with a warning', async () => {
    for (const text of ['{ nope', JSON.stringify({ formatVersion: 1, numbers: { atoms: { 0: 'x' } } })]) {
      const p = { ...project(), rulesText: text };
      const { r, json } = await read(p, clipsFor(p));
      expect(json('rules.json')).toEqual(minimalRules());
      expect(r.warnings.join(' ')).toMatch(/minimal rules/);
    }
  });
  it('valid community rules are exported as written', async () => {
    const rules = neutralRules();
    const p = { ...project(), rulesText: JSON.stringify(rules) };
    const { r, json } = await read(p, clipsFor(p));
    expect(json('rules.json')).toEqual(rules);
    expect(r.warnings).toEqual([]);
    expect(buildRules(p).warning).toBeUndefined();
  });
  it('importing a pack with only the minimal rules starts from the questions again', async () => {
    const p = project();
    const back = importPackZip((await exportPackZip(p, clipsFor(p), { atomIds: [] })).bytes);
    expect(back.project.rulesText).toBeUndefined();
    expect(isMinimalRulesText(JSON.stringify(minimalRules()))).toBe(true);
    expect(isMinimalRulesText(JSON.stringify(neutralRules()))).toBe(false);
  });
});

describe('5. consent and privacy', () => {
  it('the working notes are off by default: a plain export has no recorder-notes.json', async () => {
    const p = project();
    const { z, r } = await read(p, clipsFor(p), { atomIds: [] });
    expect(Object.keys(z)).not.toContain(NOTES_FILE);
    expect(r.workingCopy).toBe(false);
  });
  it('the working notes never list a speaker who has not agreed to be named, and mark their work as unlisted', async () => {
    const p = project();
    p.phrases['scam.likely']!.recordedBy = 'anon';
    const clips = clipsFor(p, { 'scam.likely': 'anon' });
    const { z, json, r } = await read(p, clips, { atomIds: [], includeNotes: true });
    expect(r.workingCopy).toBe(true);
    const raw = dec.decode(z[NOTES_FILE]);
    expect(raw).not.toContain('Anonymous Voice');
    expect(raw).not.toContain('anon"');
    const notes = json(NOTES_FILE);
    expect(notes.speakers.map((s: { name: string }) => s.name).sort()).toEqual(['Ama N.', 'Bebe K.', 'Declined']);
    expect(notes.clips['scam.likely.0'].speakerId).toBe(UNLISTED);
    expect(notes.review['scam.likely'].recordedBy).toBe(UNLISTED);
    expect(notes.note).toMatch(/do not put this file in packs/i);
  });
  it('a speaker\'s publish consent is separate from being named: the voice of a speaker who did not agree is not exported', async () => {
    const p = project();
    const clips = clipsFor(p, { 'scam.likely': 'nope', 'deadline.by': 'ama' });
    const { allowed, blocked } = exportableClips(p, clips);
    expect([...allowed.keys()].sort()).toEqual(['deadline.by.0', 'deadline.by.1']);
    expect(blocked).toEqual([{ id: 'scam.likely.0', reason: 'Declined has not agreed to have their voice published' }]);
    const { z, json, r } = await read(p, clips);
    expect(Object.keys(z)).not.toContain('audio/scam.likely.0.webm');
    expect(json('audio/index.json').clips.map((c: { id: string }) => c.id)).toEqual(['deadline.by.0', 'deadline.by.1']);
    expect(json('phrases.json')['scam.likely'].audio).toBeUndefined(); // text only: the phrase will fall back, not play a missing clip
    expect(r.blocked).toHaveLength(1);
    expect(r.warnings.join(' ')).toMatch(/has not agreed to have their voice published/);
    // named but no voice consent: still listed as a contributor; consent to the voice does not imply being named
    expect(json('manifest.json').contributors.map((c: { name: string }) => c.name)).toEqual(['Ama N.', 'Bebe K.', 'Declined']);
  });
  it('a speaker who agreed to the voice but not to be named: clip exported, name not published', async () => {
    const p = project();
    const { json } = await read(p, clipsFor(p, { 'scam.likely': 'anon' }));
    expect(json('audio/index.json').clips.map((c: { id: string }) => c.id)).toContain('scam.likely.0');
    expect(JSON.stringify(json('manifest.json'))).not.toContain('Anonymous');
  });
  it('a clip with no known speaker is not exported', () => {
    const p = project();
    const { blocked } = exportableClips(p, new Map([['a.0', clip('a.0', 'x', undefined)], ['b.0', clip('b.0', 'x', 'ghost')]]));
    expect(blocked.map((b) => b.id)).toEqual(['a.0', 'b.0']);
  });
  it('importing a plain pack gives its clips an "earlier pack" speaker with consent as of the import, so re-export still works', async () => {
    const p = project();
    const plain = (await exportPackZip(p, clipsFor(p), { atomIds: [] })).bytes;
    const back = importPackZip(plain);
    expect(back.clips.every((c) => c.speakerId === EARLIER)).toBe(true);
    const sp = back.project.speakers.find((s) => s.id === EARLIER)!;
    expect(sp).toMatchObject({ consent: false, voiceConsent: true });
    expect(sp.voiceConsentDate).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(back.project.speakers.filter((s) => s.id !== EARLIER).every((s) => !s.voiceConsent)).toBe(true); // named in the pack says nothing about the voice
    const again = await exportPackZip(back.project, new Map(back.clips.map((c) => [c.id, c])), { atomIds: [] });
    expect(again.blocked).toEqual([]);
  });
});

describe('7. atom clips are exported only for the word as it stands now', () => {
  it('a stale number word is left out and reported', async () => {
    const rules = neutralRules();
    const p: Project = { ...project(), rulesText: JSON.stringify(rules), atoms: { 'num.1': { label: 'ɔnɛ' }, 'num.2': { label: 'bʉ̀' } } };
    const clips = clipsFor(p);
    clips.set('num.1', clip('num.1', 'ɔnɛ', 'ama'));
    clips.set('num.2', clip('num.2', 'old word', 'ama')); // recorded for a word that was changed afterwards
    const { r, z, json } = await read(p, clips, { atomIds: ['num.1', 'num.2'] });
    expect(Object.keys(z)).toContain('audio/num.1.webm');
    expect(Object.keys(z)).not.toContain('audio/num.2.webm');
    expect(json('audio/index.json').clips.map((c: { id: string }) => c.id)).not.toContain('num.2');
    expect(r.stale).toEqual(['num.2']);
    expect(r.warnings.join(' ')).toMatch(/recorded for a word that changed/);
  });
  it('currentAtomLabel prefers the speaker\'s word, then the rules\' word', () => {
    const p = { atoms: { 'num.1': { label: ' ɔnɛ ' } }, rulesText: JSON.stringify(neutralRules()) };
    expect(currentAtomLabel(p, 'num.1')).toBe('ɔnɛ');
    expect(currentAtomLabel(p, 'num.2')).toBe('2');
    expect(currentAtomLabel({ atoms: {}, rulesText: undefined }, 'num.2')).toBe('');
  });
});

describe('10. rule labels: bound and plural forms are not flattened; a neutral starting point', () => {
  const rules = (): PackRules => ({
    formatVersion: 1,
    numbers: {
      atoms: { ...Object.fromEntries([...'0123456789'].map((d) => [d, d])), '80': { text: 'ev', bound: 'evb', boundClip: true } as never },
      scales: [{ value: 100, word: 'hd', plural: 'hds', pluralWhen: 'multiple', pluralClip: true } as never],
      contexts: { money: { atoms: { '1': 'one-m' }, joiners: { na: { text: 'na-m' } } } },
    } as never,
    money: { template: '{amount} {currency}', currencies: { XAF: { text: 'fr', plural: 'frs', pluralClip: true } as never } },
  });
  it('editing a word changes only that form', () => {
    let r = rules();
    r = withLabel(r, 'num.80', 'EV');
    expect(labelOf(r, 'num.80')).toBe('EV');
    expect(labelOf(r, 'num.80.bound')).toBe('evb');
    r = withLabel(r, 'num.80.bound', 'EVB');
    expect(labelOf(r, 'num.80')).toBe('EV');
    expect(labelOf(r, 'num.80.bound')).toBe('EVB');
    r = withLabel(r, 'scale.100', 'HD');
    expect(labelOf(r, 'scale.100.plural')).toBe('hds');
    r = withLabel(r, 'scale.100.plural', 'HDS');
    expect(labelOf(r, 'scale.100')).toBe('HD');
    r = withLabel(r, 'currency.XAF', 'FR');
    expect(labelOf(r, 'currency.XAF.plural')).toBe('frs');
    r = withLabel(r, 'currency.XAF.plural', 'FRS');
    expect(labelOf(r, 'currency.XAF')).toBe('FR');
  });
  it('context words have their own labels and do not touch the base word', () => {
    let r = rules();
    expect(labelOf(r, 'num.money.1')).toBe('one-m');
    expect(labelOf(r, 'num.1')).toBe('1');
    r = withLabel(r, 'num.money.1', 'ONE-M');
    expect(labelOf(r, 'num.money.1')).toBe('ONE-M');
    expect(labelOf(r, 'num.1')).toBe('1');
    expect(labelOf(r, 'join.money.na')).toBe('na-m');
    expect(labelOf(withLabel(r, 'join.money.na', 'NA'), 'join.money.na')).toBe('NA');
    expect(labelOf(r, 'num.year.1')).toBeUndefined();
  });
  it('the ids requiredClips lists are all found in the rules (every clip has a word to write)', () => {
    const r = rules();
    const ids = requiredClips({ manifest: toLanguagePack(project(), new Map()).manifest, phrases: {}, rules: r });
    for (const id of ids) expect(labelOf(r, id), id).toBeTruthy();
    expect(ids).toEqual(expect.arrayContaining(['num.80.bound', 'scale.100.plural', 'currency.XAF.plural', 'num.money.1', 'join.money.na']));
  });
  it('the neutral starting rules are valid, ask about the grammar and copy no English', () => {
    const r = neutralRules();
    expect(() => validateRules(r)).not.toThrow();
    const text = JSON.stringify(r);
    for (const english of ['hundred', 'thousand', 'twenty', 'January', 'Monday', 'franc', 'first', 'second', 'third']) expect(text).not.toContain(english);
    expect((r.dates as { yearStyle: string }).yearStyle).toBe('cardinal');
    expect(JSON.stringify(neutralRules({ ...DEFAULT_ANSWERS, yearStyle: 'century_pairs' }))).toContain('century_pairs');
    const mdy = neutralRules({ ...DEFAULT_ANSWERS, dateOrder: 'month_day', moneyOrder: 'currency_first', dayWords: 'own_words', joiner: true, ownWords: { money: true, day: true, year: false } });
    expect(() => validateRules(mdy)).not.toThrow();
    expect((mdy.dates as { templates: { full: string } }).templates.full).toBe('{month} {day} {year}');
    expect((mdy.money as { template: string }).template).toBe('{currency} {amount}');
    expect(Object.keys((mdy.dates as { days: object }).days)).toHaveLength(31);
    expect(Object.keys((mdy.numbers as unknown as { contexts: object }).contexts).sort()).toEqual(['day', 'money']);
    const ids = requiredClips({ manifest: toLanguagePack(project(), new Map()).manifest, phrases: {}, rules: mdy });
    expect(ids).toEqual(expect.arrayContaining(['num.money.0', 'num.day.9', 'day.31', 'join.and']));
    expect(ids).not.toContain('num.year.0');
  });
});

describe('11. review integrity, persistence and export prompt', () => {
  it('every recorder of a phrase is found from its clips, not just the last', () => {
    const p = project();
    const clips = clipsFor(p);
    clips.set('deadline.by.1', clip('deadline.by.1', 'na di de.', 'bebe'));
    expect([...recordersOf(p, clips, 'deadline.by')].sort()).toEqual(['ama', 'bebe']);
    expect(canReview(p, clips, 'deadline.by', 'bebe')).toMatchObject({ ok: false });
    expect(canReview(p, clips, 'deadline.by', 'ama')).toMatchObject({ ok: false });
    expect(canReview(p, clips, 'deadline.by', 'anon')).toEqual({ ok: true });
    expect(canReview(p, clips, 'deadline.by', undefined)).toMatchObject({ ok: false });
    expect(canReview(p, clips, 'deadline.by', 'ghost')).toMatchObject({ ok: false });
  });
  it('a "reviewed" status is exported only when the reviewer recorded none of the phrase; otherwise draft', () => {
    const p = project();
    const clips = clipsFor(p);
    expect(buildPhrases(p, clips)['scam.likely']!.status).toBe('reviewed');
    clips.set('scam.likely.0', clip('scam.likely.0', 'Trik!', 'bebe')); // the reviewer re-recorded it
    expect(buildPhrases(p, clips)['scam.likely']!.status).toBe('draft');
    const q = project();
    q.phrases['scam.likely']!.reviewedBy = 'ghost';
    expect(buildPhrases(q, clipsFor(q))['scam.likely']!.status).toBe('draft');
    delete q.phrases['scam.likely']!.reviewedBy;
    expect(buildPhrases(q, clipsFor(q))['scam.likely']!.status).toBe('draft');
  });
  it('an imported "reviewed" without a record of who reviewed it is not trusted', async () => {
    const p = project();
    const plain = (await exportPackZip(p, clipsFor(p), { atomIds: [] })).bytes;
    expect(JSON.parse(dec.decode(unzipSync(plain)['phrases.json']))['scam.likely'].status).toBe('reviewed');
    const back = importPackZip(plain);
    expect(back.project.phrases['scam.likely']).toMatchObject({ review: 'none', importedReviewed: true });
    expect(back.warnings.join(' ')).toMatch(/does not say who reviewed/);
    const again = JSON.parse(dec.decode(unzipSync((await exportPackZip(back.project, new Map(back.clips.map((c) => [c.id, c])), { atomIds: [] })).bytes)['phrases.json']));
    expect(again['scam.likely'].status).toBe('draft');
  });
  it('a hand-edited zip that claims "reviewed" is not trusted either, with or without notes', async () => {
    const p = project();
    const { z } = await read(p, clipsFor(p), { atomIds: [], includeNotes: true });
    const notes = JSON.parse(dec.decode(z[NOTES_FILE]!));
    notes.review['scam.likely'].reviewedBy = 'ama'; // the recorder "reviewed" her own phrase
    const forged = zipSync({ ...z, [NOTES_FILE]: strToU8(JSON.stringify(notes)) });
    expect(importPackZip(forged).project.phrases['scam.likely']!.review).toBe('none');
    // while an honest working copy keeps the review (reviewer bebe, recorder ama)
    expect(importPackZip(zipSync(z)).project.phrases['scam.likely']).toMatchObject({ review: 'reviewed', reviewedBy: 'bebe' });
  });
  it('a reviewed phrase of a reviewer who is not listed in the notes (no consent to be named) is not trusted after reopening', async () => {
    const p = project();
    p.speakers.find((s) => s.id === 'bebe')!.consent = false;
    const { z } = await read(p, clipsFor(p), { atomIds: [], includeNotes: true });
    expect(importPackZip(zipSync(z)).project.phrases['scam.likely']!.review).toBe('none');
  });
  it('a failed clip save is reported as not saved', async () => {
    expect(await persistClip(async () => undefined)).toBe(true);
    expect(await persistClip(async () => { throw new DOMException('quota', 'QuotaExceededError'); })).toBe(false);
    const empty: ReadonlySet<string> = new Set();
    const one = withUnsaved(empty, 'a.0', false);
    expect([...one]).toEqual(['a.0']);
    expect(withUnsaved(one, 'a.0', false)).toBe(one);
    expect([...withUnsaved(one, 'a.0', true)]).toEqual([]);
    expect(withUnsaved(empty, 'b.0', true)).toBe(empty);
  });
  it('asks the browser to keep the storage', async () => {
    const calls: string[] = [];
    expect(await requestPersistence({ persisted: async () => false, persist: async () => (calls.push('persist'), true) })).toBe(true);
    expect(await requestPersistence({ persisted: async () => true, persist: async () => (calls.push('again'), true) })).toBe(true);
    expect(calls).toEqual(['persist']);
    expect(await requestPersistence({ persisted: async () => false, persist: async () => false })).toBe(false);
    expect(await requestPersistence({ persisted: async () => false, persist: async () => { throw new Error('denied'); } })).toBeNull();
    expect(await requestPersistence(undefined)).toBeNull();
  });
  it('prompts to export after N new clips', () => {
    expect(EXPORT_PROMPT_EVERY).toBe(10);
    expect(shouldPromptExport({})).toBe(false);
    expect(shouldPromptExport({ clipsSinceExport: 9 })).toBe(false);
    expect(shouldPromptExport({ clipsSinceExport: 10 })).toBe(true);
    expect(shouldPromptExport({ clipsSinceExport: 25 })).toBe(true);
  });
});
