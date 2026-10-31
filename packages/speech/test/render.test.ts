import { describe, expect, it } from 'vitest';
import type { LanguagePack, PackPhrases, SpeechPlan } from '@sabitori/core';
import { createMemoryRegistry, renderPhrase, renderPlan, type SpeechPack } from '../src/index.js';
import { enRules, frRules, manifest, region, ttsPack } from './helpers.js';

const ctx = { region, today: '2026-10-31' };
const e = (text: string, audio?: { clip: string }[] | ({ slot: string } | { clip: string })[]) => ({ text, status: 'reviewed' as const, ...(audio ? { audio } : {}) });

const frPhrases: PackPhrases = {
  'money.amount': e('Le montant est {amount}.'),
  'deadline.by': e('Faites-le avant le {date}.'),
  'help.call': e('Pour poser des questions, appelez le {phone}.'),
  'sender.known': e('Ce message vient de {sender}.'),
  'about.bank': e('Cela concerne votre compte en banque.'),
  'scam.likely': e('Ceci ressemble à une arnaque.'),
};
const enPhrases: PackPhrases = {
  'money.amount': e('The amount is {amount}.'),
  'deadline.by': e('Do it by {date}.'),
  'about.bank': e('It is about your bank account.'),
  'about.health': e('It is about your health.'),
};
const fr = ttsPack('fr', 'fr-FR', frRules, frPhrases);
const en = ttsPack('en', 'en-GB', enRules, enPhrases);

/** Hypothetical recorded pack reusing English-style rules, with clip knowledge. */
function recorded(available: (id: string) => boolean, phrases?: PackPhrases): SpeechPack {
  return {
    manifest: manifest('xx', { kind: 'recorded' }, ['fr']),
    rules: enRules,
    phrases: phrases ?? {
      'about.bank': e('bank', [{ clip: 'phrase.about.bank' }]),
      'money.amount': e('amount {amount}', [{ clip: 'phrase.money.amount.pre' }, { slot: 'amount' }]),
      'about.health': e('health'), // no audio recorded
    },
    hasClip: available,
    clipUrl: (id) => `/x/${id}.webm`,
  };
}
const reg = (...p: LanguagePack[]) => createMemoryRegistry(p);

describe('renderPhrase, TTS packs', () => {
  it('fills slots into one tts part with the same display and spoken text', async () => {
    const r = await renderPhrase('money.amount', { amount: { type: 'money', value: { amount: 15000, currency: 'XAF' } } }, 'fr', reg(fr, en), ctx);
    expect(r.text).toBe('Le montant est quinze mille francs CFA.');
    expect(r.parts).toEqual([{ kind: 'tts', text: r.text, bcp47: 'fr-FR' }]);
    expect(r.lang).toBe('fr');
  });
  it('fr date has no article of its own; relative dates are not used', async () => {
    const r = await renderPhrase('deadline.by', { date: { type: 'date', value: '2026-11-12' } }, 'fr', reg(fr, en), ctx);
    expect(r.text).toBe('Faites-le avant le douze novembre.');
    const t = await renderPhrase('deadline.by', { date: { type: 'date', value: '2026-11-01' } }, 'fr', reg(fr, en), ctx);
    expect(t.text).toBe('Faites-le avant le premier novembre.');
  });
  it('en relative date', async () => {
    const r = await renderPhrase('deadline.by', { date: { type: 'date', value: '2026-11-01' } }, 'en', reg(fr, en), ctx);
    expect(r.text).toBe('Do it by tomorrow.');
  });
  it('date relativeTo overrides today', async () => {
    const r = await renderPhrase('deadline.by', { date: { type: 'date', value: '2027-01-05', relativeTo: '2027-01-04' } }, 'en', reg(en), ctx);
    expect(r.text).toBe('Do it by tomorrow.');
  });
  it('phone', async () => {
    const r = await renderPhrase('help.call', { phone: { type: 'phone', value: '+237677123456' } }, 'fr', reg(fr), ctx);
    expect(r.text).toBe('Pour poser des questions, appelez le six, soixante-dix-sept, douze, trente-quatre, cinquante-six.');
  });
  it('sender uses the region display name', async () => {
    const r = await renderPhrase('sender.known', { sender: { type: 'sender', officialId: 'mtn-momo' } }, 'fr', reg(fr), ctx);
    expect(r.text).toBe('Ce message vient de MTN MoMo.');
  });
  it('sender falls back to fallbackText', async () => {
    const r = await renderPhrase('sender.known', { sender: { type: 'sender', fallbackText: 'Bank X' } }, 'fr', reg(fr), ctx);
    expect(r.text).toBe('Ce message vient de Bank X.');
  });
  it('a text slot in another language is its own tts part', async () => {
    const p = ttsPack('fr', 'fr-FR', frRules, { 'sender.known': e('Résumé : {sender}') });
    const r = await renderPhrase('sender.known', { sender: { type: 'text', value: 'Your bill is due', lang: 'en' } }, 'fr', reg(p, en), ctx);
    expect(r.parts).toEqual([
      { kind: 'tts', text: 'Résumé :', bcp47: 'fr-FR' },
      { kind: 'tts', text: 'Your bill is due', bcp47: 'en-GB' },
    ]);
  });
  it('missing slot value in every language is a clear error', async () => {
    await expect(renderPhrase('deadline.by', {}, 'fr', reg(fr, en), ctx)).rejects.toThrow(/Cannot render "deadline.by"/);
  });
});

describe('fallback chain', () => {
  it('falls back to the pack fallback list, then en', async () => {
    const r = await renderPhrase('about.health', undefined, 'fr', reg(fr, en), ctx);
    expect(r).toMatchObject({ text: 'It is about your health.', lang: 'en' });
  });
  it('falls back to catalog English when no pack has the phrase', async () => {
    const r = await renderPhrase('about.legal', undefined, 'fr', reg(fr, en), ctx);
    expect(r).toMatchObject({ text: 'It is about a legal matter, such as court or police.', lang: 'en' });
  });
  it('throws a clear error when nothing can render', async () => {
    await expect(renderPhrase('about.legal', undefined, 'fr', reg(fr), ctx)).rejects.toThrow(/Cannot render/);
  });
  it('unknown requested pack is an error', async () => {
    await expect(renderPhrase('about.bank', undefined, 'zz', reg(fr), ctx)).rejects.toThrow(/zz/);
  });
});

describe('recorded packs', () => {
  const all = () => true;
  it('plays clips and stitches slots from rules tokens', async () => {
    const x = recorded(all);
    const r = await renderPhrase('money.amount', { amount: { type: 'money', value: { amount: 21, currency: 'XAF' } } }, 'xx', reg(x, fr, en), ctx);
    expect(r.lang).toBe('xx');
    expect(r.parts).toEqual([
      { kind: 'clip', url: '/x/phrase.money.amount.pre.webm' },
      { kind: 'clip', url: '/x/num.20.webm' },
      { kind: 'clip', url: '/x/num.1.webm' },
      { kind: 'clip', url: '/x/currency.XAF.webm' },
    ]);
    expect(r.text).toBe('amount twenty-one CFA francs');
  });
  it('missing clip in a slot falls back to fr', async () => {
    const x = recorded((id) => id !== 'num.20');
    const r = await renderPhrase('money.amount', { amount: { type: 'money', value: { amount: 21, currency: 'XAF' } } }, 'xx', reg(x, fr, en), ctx);
    expect(r.lang).toBe('fr');
    expect(r.text).toBe('Le montant est vingt et un francs CFA.');
    expect(r.parts[0]).toMatchObject({ kind: 'tts', bcp47: 'fr-FR' });
  });
  it('missing phrase clip falls back', async () => {
    const x = recorded((id) => id !== 'phrase.about.bank');
    const r = await renderPhrase('about.bank', undefined, 'xx', reg(x, fr, en), ctx);
    expect(r.lang).toBe('fr');
  });
  it('phrase without audio falls back; missing phrase falls back', async () => {
    const x = recorded(all);
    expect((await renderPhrase('about.health', undefined, 'xx', reg(x, fr, en), ctx)).lang).toBe('en');
    expect((await renderPhrase('scam.likely', undefined, 'xx', reg(x, fr, en), ctx)).lang).toBe('fr');
  });
  it('optional pause clips are skipped when absent', async () => {
    const phrases: PackPhrases = { 'help.call': e('call {phone}', [{ slot: 'phone' }]) };
    const rules = { ...enRules, phones: { ...enRules.phones!, read: 'digits' as const } };
    const x = { ...recorded((id) => id !== 'pause.short', phrases), rules };
    const r = await renderPhrase('help.call', { phone: { type: 'phone', value: '677123456' } }, 'xx', reg(x, fr), ctx);
    expect(r.lang).toBe('xx');
    expect(r.parts).toHaveLength(9);
  });
  it('sender clip when available, tts of the name otherwise', async () => {
    const phrases: PackPhrases = { 'sender.known': e('from {sender}', [{ clip: 'p.from' }, { slot: 'sender' }]) };
    const slots = { sender: { type: 'sender' as const, officialId: 'mtn-momo' } };
    const a = await renderPhrase('sender.known', slots, 'xx', reg(recorded(all, phrases), fr), ctx);
    expect(a.parts).toEqual([{ kind: 'clip', url: '/x/p.from.webm' }, { kind: 'clip', url: '/x/sender.mtn-momo.webm' }]);
    const b = await renderPhrase('sender.known', slots, 'xx', reg(recorded((id) => id !== 'sender.mtn-momo', phrases), fr), ctx);
    expect(b.lang).toBe('xx');
    expect(b.parts[1]).toEqual({ kind: 'tts', text: 'MTN MoMo', bcp47: 'fr-FR' });
  });
  it('uses the default clip url when the pack has none', async () => {
    const x = { ...recorded(all), clipUrl: undefined };
    const r = await renderPhrase('about.bank', undefined, 'xx', reg(x as LanguagePack, fr), ctx);
    expect(r.parts).toEqual([{ kind: 'clip', url: 'xx/audio/phrase.about.bank.webm' }]);
  });
});

describe('renderPlan', () => {
  it('renders sections and reports the fallback language', async () => {
    const plan: SpeechPlan = {
      sections: [
        { section: 'about', utterances: [{ key: 'about.bank' }] },
        { section: 'action', utterances: [{ key: 'about.health' }, { key: 'about.bank' }] },
        { section: 'money', utterances: [{ key: 'money.amount', slots: { amount: { type: 'money', value: { amount: 80, currency: 'XAF' } } } }] },
      ],
    };
    const out = await renderPlan(plan, 'fr', reg(fr, en), ctx);
    expect(out.map((s) => s.section)).toEqual(['about', 'action', 'money']);
    expect(out[0]).toMatchObject({ lang: 'fr', text: 'Cela concerne votre compte en banque.' });
    expect(out[1]).toMatchObject({ lang: 'en', text: 'It is about your health. Cela concerne votre compte en banque.' });
    expect(out[1]!.parts).toHaveLength(2);
    expect(out[2]!.text).toBe('Le montant est quatre-vingts francs CFA.');
  });
});
