import { describe, expect, it } from 'vitest';
import { exportPackZip, importPackZip, buildPhrases } from '../src/lib/pack';
import { newProject, type ClipRecord } from '../src/lib/model';
import { unzipSync } from 'fflate';

const blob = (n: number) => new Blob([new Uint8Array(Array.from({ length: 20 }, (_, i) => (i * n) % 255))], { type: 'audio/webm' });
function clip(id: string, text: string, n: number): ClipRecord {
  return { id, blob: blob(n), durationMs: 900, text, ext: 'webm', at: 1 };
}

function sample() {
  const p = newProject({
    tag: 'xyz', name: 'Testish', autonym: 'Ɛtɛsi', fallback: ['fr'],
    speakers: [
      { id: 's1', name: 'Amina N.', role: 'speaker', consent: true },
      { id: 's2', name: 'Private Person', role: 'reviewer', consent: false },
    ],
    license: 'CC-BY-SA-4.0',
  });
  p.phrases['deadline.by'] = { text: 'Ɓɔ {date} tɔ̂', review: 'reviewed', reviewedBy: 's2', recordedBy: 's1' };
  p.phrases['urgency.soon'] = { text: 'Ŋgɛ', review: 'none' };
  p.phrases['urgency.info'] = { text: 'Written only', review: 'sent_back', note: 'say slower' };
  p.atoms['num.1'] = { label: 'mɔ́ɔ' };
  const clips = new Map<string, ClipRecord>([
    ['deadline.by.0', clip('deadline.by.0', 'Ɓɔ', 1)],
    ['deadline.by.1', clip('deadline.by.1', 'tɔ̂', 2)],
    ['urgency.soon.0', clip('urgency.soon.0', 'Ŋgɛ', 3)],
    ['num.1', clip('num.1', 'mɔ́ɔ', 4)],
  ]);
  return { p, clips };
}

describe('pack zip', () => {
  it('writes the exact pack layout', async () => {
    const { p, clips } = sample();
    const { bytes, version } = await exportPackZip(p, clips, { includeNotes: false, atomIds: ['num.1'] });
    expect(version).toBe('0.1.1');
    const names = Object.keys(unzipSync(bytes)).sort();
    expect(names).toEqual(['audio/deadline.by.0.webm', 'audio/deadline.by.1.webm', 'audio/num.1.webm', 'audio/urgency.soon.0.webm', 'manifest.json', 'phrases.json']);
    const files = unzipSync(bytes);
    const m = JSON.parse(new TextDecoder().decode(files['manifest.json']));
    expect(m.status).toBe('in_recording');
    expect(m.contributors).toEqual([{ name: 'Amina N.', role: 'speaker' }]);
    expect(m.license).toBe('CC-BY-SA-4.0');
    const ph = JSON.parse(new TextDecoder().decode(files['phrases.json']));
    expect(ph['deadline.by'].audio).toEqual([{ clip: 'deadline.by.0' }, { slot: 'date' }, { clip: 'deadline.by.1' }]);
    expect(ph['deadline.by'].status).toBe('reviewed');
    expect(ph['urgency.info'].audio).toBeUndefined();
  });
  it('omits audio for stale or partial phrases', () => {
    const { p, clips } = sample();
    p.phrases['urgency.soon']!.text = 'Changed words';
    expect(buildPhrases(p, clips)['urgency.soon']!.audio).toBeUndefined();
  });
  it('round-trips text, audio bytes, review and notes', async () => {
    const { p, clips } = sample();
    const { bytes } = await exportPackZip(p, clips, { includeNotes: true, atomIds: ['num.1'] });
    const back = importPackZip(bytes);
    expect(back.project.tag).toBe('xyz');
    expect(back.project.autonym).toBe('Ɛtɛsi');
    expect(back.project.phrases['deadline.by']!.text).toBe('Ɓɔ {date} tɔ̂');
    expect(back.project.phrases['urgency.info']).toMatchObject({ note: 'say slower', review: 'sent_back' });
    expect(back.project.speakers.map((s) => s.name)).toContain('Private Person');
    expect(back.project.atoms['num.1']!.label).toBe('mɔ́ɔ');
    expect(back.clips.map((c) => c.id).sort()).toEqual(['deadline.by.0', 'deadline.by.1', 'num.1', 'urgency.soon.0']);
    const c = back.clips.find((x) => x.id === 'deadline.by.1')!;
    expect(c.text).toBe('tɔ̂');
    expect(new Uint8Array(await c.blob.arrayBuffer())).toEqual(new Uint8Array(await clips.get('deadline.by.1')!.blob.arrayBuffer()));
    // and the import can be exported again
    const m = new Map(back.clips.map((x) => [x.id, x]));
    const again = await exportPackZip(back.project, m, { includeNotes: false, atomIds: [] });
    expect(Object.keys(unzipSync(again.bytes))).toContain('audio/deadline.by.0.webm');
  });
  it('imports a plain pack without notes and with a wrapping folder', async () => {
    const { p, clips } = sample();
    const { bytes } = await exportPackZip(p, clips, { includeNotes: false, atomIds: [] });
    const files = unzipSync(bytes);
    const { zipSync } = await import('fflate');
    const wrapped = zipSync(Object.fromEntries(Object.entries(files).map(([k, v]) => [`xyz/${k}`, v])));
    const back = importPackZip(wrapped);
    expect(back.project.speakers.map((s) => s.name)).toEqual(['Amina N.']);
    expect(back.clips).toHaveLength(3);
  });
  it('rejects a zip with no manifest', async () => {
    const { zipSync, strToU8 } = await import('fflate');
    expect(() => importPackZip(zipSync({ 'a.txt': strToU8('x') }))).toThrow(/manifest/);
  });
});
