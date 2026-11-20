import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { buildDataset, checkVoice, metadataCsv, needsAgreement, phraseClipTexts, type ExportedPack } from '../train-voice/dataset';

const pack: ExportedPack = {
  manifest: { tag: 'xzr', license: 'LicenseRef-community-decides', voice: { kind: 'recorded' } },
  phrases: {
    'money.pay': { text: 'Yu go pay {amount} bifo {date}.', audio: [{ clip: 'money.pay.0' }, { slot: 'amount' }, { clip: 'money.pay.1' }, { slot: 'date' }] },
    'scam.never_share': { text: 'No giv yu kod to nobodi.', audio: [{ clip: 'scam.never_share.0' }] },
    'about.draft': { text: 'Dis wan no get audio yet.' },
  },
  index: { clips: ['money.pay.0', { id: 'scam.never_share.0', file: 'scam.never_share.0.m4a' }, 'num.1'] },
};

describe('voice recipe: training list', () => {
  it('cuts phrases at slots like the Recorder names its clips', () => {
    expect(phraseClipTexts('money.pay', 'Yu go pay {amount} bifo {date}.')).toEqual([
      { id: 'money.pay.0', text: 'Yu go pay' },
      { id: 'money.pay.1', text: 'bifo' },
    ]);
    expect(phraseClipTexts('k', '{amount}, {date}')).toEqual([]);
  });

  it('lists recorded phrase clips with their words, and reports single words and missing pieces', () => {
    const d = buildDataset(pack);
    expect(d.rows).toEqual([
      { id: 'money.pay.0', file: 'money.pay.0.webm', text: 'Yu go pay' },
      { id: 'scam.never_share.0', file: 'scam.never_share.0.m4a', text: 'No giv yu kod to nobodi.' },
    ]);
    expect(d.missing).toEqual(['money.pay.1']);
    expect(d.skipped).toEqual(['num.1']);
    expect(metadataCsv(d.rows)).toBe('money.pay.0|Yu go pay\nscam.never_share.0|No giv yu kod to nobodi.\n');
    expect(() => metadataCsv([{ id: 'a', file: 'a.webm', text: 'x|y' }])).toThrow();
  });

  it('a pack without a licence needs the community to agree', () => {
    expect(needsAgreement(pack)).toBe(true);
    expect(needsAgreement({ ...pack, manifest: { tag: 'xzr', license: 'CC-BY-SA-4.0' } })).toBe(false);
  });
});

describe('voice recipe: can the app use the voice', () => {
  const textVoice = (letters: string) => ({
    audio: { sample_rate: 22050 },
    phoneme_type: 'text',
    inference: { noise_scale: 0.667, length_scale: 1, noise_w: 0.8 },
    phoneme_id_map: Object.fromEntries(['_', '^', '$', ' ', '.', ...letters].map((c, i) => [c, [i]])),
  });

  it('OK when every letter of the pack is known (case and accents handled as the app does)', () => {
    const r = checkVoice(textVoice('abcdefghijklmnopqrstuvwxyz'), ['Yu go pay bifo.', 'No giv yu kod to nobodi.']);
    expect(r).toEqual({ ok: true, problems: [], unknown: [] });
  });

  it('names the letters the voice cannot say', () => {
    const r = checkVoice(textVoice('abcdefghijklmnopqrstuvwxyz'), ['Mɛ nɔ sabi.']);
    expect(r.ok).toBe(false);
    expect(r.unknown.sort()).toEqual(['ɔ', 'ɛ']);
  });

  it('refuses an espeak voice and a broken config', () => {
    const fr = JSON.parse(readFileSync(resolve(__dirname, '../../../packs/fr/voice/fr_FR-siwis-medium.onnx.json'), 'utf8'));
    expect(checkVoice(fr, ['Bonjour.']).problems[0]).toMatch(/phoneme_type is "espeak"/);
    expect(checkVoice({}, ['x']).ok).toBe(false);
  });
});
