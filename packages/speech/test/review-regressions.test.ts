import { describe, expect, it } from 'vitest';
import type { LanguagePack, PackPhrases, PackRules, SpeechPlan } from '@sabitori/core';
import {
  assemble,
  createMemoryRegistry,
  createPackRegistry,
  createPlayer,
  maxNumber,
  numberTokens,
  phoneTokens,
  renderPhrase,
  renderPlan,
  requiredClips,
  rulesWarnings,
  validateManifest,
  validatePhrases,
  validateRules,
  PackLoadError,
  type ClipBackend,
  type FetchLike,
  type PackRegistry,
  type RenderedSection,
  type SpeechPack,
  type TtsBackend,
} from '../src/index.js';
import { enRules, frRules, manifest, region, ttsPack } from './helpers.js';

const ctx = { region, today: '2026-10-31' };
const clone = <T>(x: T): T => JSON.parse(JSON.stringify(x));
const e = (text: string, audio?: ({ slot: string } | { clip: string })[]) => ({ text, status: 'reviewed' as const, ...(audio ? { audio } : {}) });
const ttsM = (tag: string, fallback: string[] = []) => manifest(tag, { kind: 'tts', engine: 'system', bcp47: tag }, fallback);
const moneySlot = (amount: number) => ({ amount: { type: 'money' as const, value: { amount, currency: 'XAF' } } });

const frPhrases: PackPhrases = { 'money.amount': e('Le montant est {amount}.'), 'help.call': e('Appelez le {phone}.'), 'sender.known': e('Ce message vient de {sender}.') };
const enPhrases: PackPhrases = { 'money.amount': e('The amount is {amount}.'), 'help.call': e('Call {phone}.'), 'sender.known': e('This message is from {sender}.') };
const fr = ttsPack('fr', 'fr-FR', frRules, frPhrases);
const en = ttsPack('en', 'en-GB', enRules, enPhrases);

/** A registry that does NOT validate: models a pack that slipped through, so the renderer itself must be defensive. */
const rawRegistry = (...packs: LanguagePack[]): PackRegistry => ({
  get: async (t) => {
    const p = packs.find((x) => x.manifest.tag === t);
    if (!p) throw new PackLoadError(`no ${t}`);
    return p;
  },
  list: async () => packs.map((p) => p.manifest),
});

describe('1. missing clip mid-section', () => {
  const ALL_BUT_THOUSAND = (id: string) => id !== 'scale.1000';
  const recorded = (hasClip?: (id: string) => boolean): SpeechPack => ({
    manifest: manifest('xx', { kind: 'recorded' }, ['fr']),
    rules: enRules,
    phrases: { 'money.amount': e('amount {amount}', [{ clip: 'p.pre' }, { slot: 'amount' }]) },
    hasClip,
    clipUrl: (id) => `/x/${id}.webm`,
  });

  it('12 500 with scale.1000 missing from the index falls back before playback; never "twelve five hundred francs"', async () => {
    const reg = createMemoryRegistry([recorded(ALL_BUT_THOUSAND), fr, en]);
    const r = await renderPhrase('money.amount', moneySlot(12500), 'xx', reg, ctx);
    expect(r.lang).toBe('fr');
    expect(r.text).toBe('Le montant est douze mille cinq cents francs CFA.');
    expect(r.parts.every((p) => p.kind === 'tts')).toBe(true);
  });

  const files = (index?: unknown): Record<string, unknown> => ({
    '/p/xx/manifest.json': manifest('xx', { kind: 'recorded' }, ['fr']),
    '/p/xx/phrases.json': { 'money.amount': e('amount {amount}', [{ clip: 'p.pre' }, { slot: 'amount' }]) },
    '/p/xx/rules.json': enRules,
    '/p/fr/manifest.json': ttsM('fr'), '/p/fr/phrases.json': frPhrases, '/p/fr/rules.json': frRules,
    '/p/en/manifest.json': ttsM('en'), '/p/en/phrases.json': enPhrases, '/p/en/rules.json': enRules,
    ...(index === undefined ? {} : { '/p/xx/audio/index.json': index }),
  });
  const fetcher = (f: Record<string, unknown>): FetchLike => async (u) =>
    u in f ? { ok: true, status: 200, json: async () => f[u] } : { ok: false, status: 404, json: async () => ({}) };

  it('a recorded pack without audio/index.json is refused at load', async () => {
    const reg = createPackRegistry({ baseUrl: '/p', fetch: fetcher(files()) });
    await expect(reg.get('xx')).rejects.toThrow(/audio\/index\.json/);
  });
  it('a malformed audio/index.json is refused', async () => {
    for (const bad of [{}, { clips: 'num.1' }, { clips: [1] }, []]) {
      const reg = createPackRegistry({ baseUrl: '/p', fetch: fetcher(files(bad)) });
      await expect(reg.get('xx')).rejects.toThrow(/audio\/index\.json/);
    }
  });
  it('load exposes requiredClips minus the index as missingClips, and rendering falls back', async () => {
    const reg = createPackRegistry({ baseUrl: '/p', fetch: fetcher(files({ clips: ['p.pre', 'num.12', 'num.5', 'scale.100', 'currency.XAF', 'num.0'] })) });
    const pack = (await reg.get('xx')) as SpeechPack;
    const need = requiredClips(pack);
    expect(pack.missingClips).toEqual(need.filter((c) => !['p.pre', 'num.12', 'num.5', 'scale.100', 'currency.XAF', 'num.0'].includes(c)));
    expect(pack.missingClips).toContain('scale.1000');
    const r = await renderPhrase('money.amount', moneySlot(12500), 'xx', reg, ctx);
    expect(r.lang).toBe('fr');
  });
  it('a complete index leaves missingClips empty', async () => {
    const probe = { manifest: manifest('xx', { kind: 'recorded' }), rules: enRules, phrases: { 'money.amount': e('x {amount}', [{ clip: 'p.pre' }, { slot: 'amount' }]) } } as LanguagePack;
    const reg = createPackRegistry({ baseUrl: '/p', fetch: fetcher(files({ clips: requiredClips(probe) })) });
    expect(((await reg.get('xx')) as SpeechPack).missingClips).toEqual([]);
  });
  it('rejects tags that are not language tags (path traversal)', async () => {
    const reg = createPackRegistry({ baseUrl: '/p', fetch: fetcher({}) });
    await expect(reg.get('../../etc')).rejects.toThrow(/not a valid language tag/);
  });

  describe('player', () => {
    function fakes(failUrl: string) {
      const log: string[] = [];
      const tts: TtsBackend = { speak: async ({ text }) => void log.push(`tts:${text}`), cancel: () => {} };
      const clips: ClipBackend = {
        play: async ({ url }) => {
          log.push(`clip:${url}`);
          if (url === failUrl) throw new Error(`cannot play ${url}`);
        },
        cancel: () => {},
      };
      return { log, tts, clips };
    }
    const C = (url: string) => ({ kind: 'clip' as const, url });
    const sec = (...parts: RenderedSection['parts']): RenderedSection => ({ section: 'money', text: '', parts, lang: 'xx' });

    it('stops the section at the failing clip, calls onError(sectionIndex, err), and plays the next section', async () => {
      const f = fakes('scale.1000');
      const p = createPlayer(f);
      const errors: [number, string][] = [];
      const sections = [sec(C('num.12'), C('scale.1000'), C('num.5'), C('scale.100'), C('currency.XAF')), sec(C('after'))];
      p.play(sections, { rate: 1, onError: (i, err) => errors.push([i, err.message]) });
      for (let i = 0; i < 50; i++) await Promise.resolve();
      expect(f.log).toEqual(['clip:num.12', 'clip:scale.1000', 'clip:after']);
      expect(errors).toEqual([[0, 'cannot play scale.1000']]);
      expect(p.playing).toBe(false);
    });
    it('a throwing onError does not break playback', async () => {
      const f = fakes('a');
      const p = createPlayer(f);
      p.play([sec(C('a')), sec(C('b'))], { rate: 1, onError: () => { throw new Error('boom'); } });
      for (let i = 0; i < 50; i++) await Promise.resolve();
      expect(f.log).toEqual(['clip:a', 'clip:b']);
    });
  });
});

describe('2. validation rejects crashing input', () => {
  const rules = (mut: (r: any) => void): unknown => {
    const r = clone(enRules) as any;
    mut(r);
    return r;
  };
  const bad: [string, (r: any) => void, RegExp][] = [
    ['override {number: 13} on 13 (cycle)', (r) => (r.numbers.overrides = { '13': { say: [{ number: 13 }] } }), /cycl|deep|cannot say 13/],
    ['scale value 1', (r) => (r.numbers.scales = [{ value: 1, word: 'x' }]), /scales\[0\]\.value/],
    ['scale value 0', (r) => (r.numbers.scales = [{ value: 0, word: 'x' }]), /scales\[0\]\.value/],
    ['scale value -100', (r) => (r.numbers.scales = [{ value: -100, word: 'x' }]), /scales\[0\]\.value/],
    ['scale value 1.5', (r) => (r.numbers.scales = [{ value: 1.5, word: 'x' }]), /scales\[0\]\.value/],
    ['scale word missing', (r) => (r.numbers.scales = [{ value: 100 }]), /scales\[0\]\.word/],
    ['duplicate scale', (r) => (r.numbers.scales = [{ value: 100, word: 'a' }, { value: 100, word: 'b' }]), /repeated/],
    ['phones.defaultGroupSize 0', (r) => (r.phones.defaultGroupSize = 0), /defaultGroupSize/],
    ['phones.defaultGroupSize -1', (r) => (r.phones.defaultGroupSize = -1), /defaultGroupSize/],
    ['phones.groups [0]', (r) => (r.phones.groups = [0]), /phones\.groups/],
    ['phones.groups strings', (r) => (r.phones.groups = ['a']), /phones\.groups/],
    ['phones.groupRead junk', (r) => (r.phones.groupRead = ['xyz']), /groupRead/],
    ['atoms["3"] = 3', (r) => (r.numbers.atoms['3'] = 3), /atoms\["3"\]/],
    ['atoms["3"] = {bound only}', (r) => (r.numbers.atoms['3'] = { bound: 'x' }), /atoms\["3"\]/],
    ['atoms["3"] = ""', (r) => (r.numbers.atoms['3'] = ''), /atoms\["3"\]/],
    ['atoms key "x"', (r) => (r.numbers.atoms.x = 'x'), /atoms key "x"/],
    ['months numbers', (r) => (r.dates.months = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]), /months/],
    ['months objects', (r) => (r.dates.months = Array(12).fill({ a: 1 })), /months/],
    ['months 11', (r) => (r.dates.months = r.dates.months.slice(1)), /months/],
    ['weekdays 6', (r) => (r.dates.weekdays = r.dates.weekdays.slice(1)), /weekdays/],
    ['days null', (r) => (r.dates.days = { '15': null }), /days\["15"\]/],
    ['days key 99', (r) => (r.dates.days = { '99': 'x' }), /days key/],
    ['joiner is a string', (r) => (r.numbers.joiners.and = 'and'), /joiners\["and"\]/],
    ['joiner text number', (r) => (r.numbers.joiners.and = { text: 5 }), /joiners\["and"\]/],
    ['currency {}', (r) => (r.money.currencies.XAF = {}), /currencies\["XAF"\]/],
    ['currencies array', (r) => (r.money.currencies = []), /currencies/],
    ['singularFor string', (r) => (r.money.singularFor = 'x'), /singularFor/],
    ['money template without {amount}', (r) => (r.money.template = '{currency}'), /\{amount\}/],
    ['join token "constructor" (inherited key)', (r) => (r.numbers.join = [{ token: 'constructor' }]), /unknown joiner/],
    ['override base not below range', (r) => (r.numbers.overrides = { '60-79': { base: 60 } }), /base 60 must be below 60/],
    ['override say unknown atom', (r) => (r.numbers.overrides = { '13': { say: [{ atom: 999 }] } }), /atom 999/],
    ['override say two keys', (r) => (r.numbers.overrides = { '13': { say: [{ atom: 1, scale: 100 }] } }), /exactly one/],
    ['unknown template word', (r) => (r.dates.templates.full = '{day} {w:of} {month}'), /not in words/],
  ];
  for (const [name, mut, re] of bad) {
    it(`rejects: ${name}`, () => {
      expect(() => validateRules(rules(mut), 'x')).toThrow(PackLoadError);
      expect(() => validateRules(rules(mut), 'x')).toThrow(re);
    });
  }
  it('the real packs and the hypothetical shapes still validate', () => {
    expect(() => validateRules(frRules, 'fr')).not.toThrow();
    expect(() => validateRules(enRules, 'en')).not.toThrow();
  });

  const man = (extra: Record<string, unknown>, tag = 'xx') => ({ formatVersion: 1, tag, name: 'x', autonym: 'x', fallback: [], voice: { kind: 'recorded' }, ...extra });
  it('manifest: tag, fallback, direction, status, reads, engine', () => {
    expect(() => validateManifest(man({ tag: '../../etc' }), '../../etc')).toThrow(/tag must be a language tag/);
    expect(() => validateManifest(man({ tag: 'FR' }), 'xx')).toThrow(/tag must be/);
    expect(() => validateManifest(man({ fallback: ['xx'] }), 'xx')).toThrow(/pack itself/);
    expect(() => validateManifest(man({ fallback: ['../fr'] }), 'xx')).toThrow(/fallback/);
    expect(() => validateManifest(man({ fallback: ['fr', 'fr'] }), 'xx')).toThrow(/twice/);
    expect(() => validateManifest(man({ direction: 'diag' }), 'xx')).toThrow(/direction/);
    expect(() => validateManifest(man({ status: 'hacked' }), 'xx')).toThrow(/status/);
    expect(() => validateManifest(man({ reads: 'yes' }), 'xx')).toThrow(/reads/);
    expect(() => validateManifest(man({ voice: { kind: 'tts', bcp47: 'en', engine: 'evil' } }), 'xx')).toThrow(/engine/);
    expect(validateManifest(man({ tag: 'pcm-CM', direction: 'ltr', status: 'beta', reads: false, fallback: ['en'] }), 'pcm-CM').tag).toBe('pcm-CM');
  });
  it('phrases: clip ids and slots', () => {
    const ph = (audio: unknown) => ({ 'money.amount': { text: 'x', status: 'draft', audio } });
    expect(() => validatePhrases(ph([{ clip: '../../../x' }]), 'x')).toThrow(/audio\[0\]\.clip/);
    expect(() => validatePhrases(ph([{ clip: 'a..b' }]), 'x')).toThrow(/audio\[0\]\.clip/);
    expect(() => validatePhrases(ph([{ clip: 5, slot: 'amount' }]), 'x')).toThrow(/exactly/);
    expect(() => validatePhrases(ph([{ clip: 'a', slot: 'amount' }]), 'x')).toThrow(/exactly/);
    expect(() => validatePhrases(ph([{ slot: 'phone' }]), 'x')).toThrow(/not a slot of money\.amount/);
    expect(() => validatePhrases(ph([{ clip: 5 }]), 'x')).toThrow(/clip/);
    expect(() => validatePhrases({ toString: { text: 'x' } }, 'x')).toThrow(/unknown phrase key/);
    expect(validatePhrases(ph([{ clip: 'phrase.money_1-x' }, { slot: 'amount' }]), 'x')).toBeTruthy();
  });
});

describe('2b. renderer is defensive even when bad rules get past validation', () => {
  const evil = (mut: (r: any) => void): LanguagePack => {
    const r = clone(enRules) as any;
    mut(r);
    return ttsPack('zz', 'zz', r, { 'money.amount': e('zz {amount}'), 'help.call': e('zz {phone}') }, ['fr']);
  };
  const render = async (p: LanguagePack, key: 'money.amount' | 'help.call', slots: any) =>
    renderPhrase(key, slots, 'zz', rawRegistry(p, fr, en), ctx);

  it('number say-cycle: SpeechRuleError internally, falls back to fr', async () => {
    const p = evil((r) => (r.numbers.overrides = { '13': { say: [{ number: 13 }] } }));
    const t = await render(p, 'money.amount', moneySlot(13));
    expect(t.lang).toBe('fr');
    expect(() => numberTokens(p.rules.numbers, 13)).toThrow(/cycl|deep/);
  });
  it('exponential say-cycle is cut by the step budget quickly', () => {
    const r = clone(enRules) as any;
    r.numbers.overrides = { '13': { say: [{ number: 13 }, { number: 13 }] } };
    const t0 = Date.now();
    expect(() => numberTokens(r.numbers, 13)).toThrow(/limit/);
    expect(Date.now() - t0).toBeLessThan(1000);
  });
  it('scale value 1 does not overflow the stack', async () => {
    const p = evil((r) => (r.numbers.scales = [{ value: 1, word: 'x' }]));
    expect(() => numberTokens(p.rules.numbers, 42)).not.toThrow(RangeError);
    expect((await render(p, 'money.amount', moneySlot(42))).lang).toBe('fr');
  });
  it('phones.defaultGroupSize 0 does not throw "Invalid array length"', async () => {
    const p = evil((r) => ((r.phones.defaultGroupSize = 0), (r.phones.groups = [3]), (r.phones.groupsByLength = {})));
    expect(() => phoneTokens(p.rules, '+237677123456', '237')).toThrow(/group sizes/);
    expect((await render(p, 'help.call', { phone: { type: 'phone', value: '+237677123456' } })).lang).toBe('fr');
  });
  it('huge phone is refused instead of expanded', () => {
    expect(() => phoneTokens(enRules, '1'.repeat(100_000), '237')).toThrow(/too many digits/);
  });
  it('currency {} never speaks "undefined"; months as numbers fall back', async () => {
    const p = evil((r) => (r.money.currencies.XAF = {}));
    const out = await render(p, 'money.amount', moneySlot(5));
    expect(out.text).not.toMatch(/undefined|null/);
    expect(out.lang).toBe('fr');
  });
  it('inherited keys are not words ("constructor" currency, joiner)', async () => {
    const out = await renderPhrase('money.amount', { amount: { type: 'money', value: { amount: 5, currency: 'constructor' } } }, 'en', rawRegistry(en), ctx);
    expect(out.text).toBe('The amount is five constructor.');
  });
  it('non-integer, negative and unsafe amounts are rejected, never rounded or exponent-formatted', () => {
    for (const n of [1.5, -1, NaN, Infinity, 1e21, 2 ** 53, Number.MAX_VALUE]) expect(() => numberTokens(enRules.numbers, n)).toThrow(/cannot say/);
    expect(assemble(numberTokens(enRules.numbers, 12500))).toBe('twelve thousand five hundred');
  });
  it('an unexpected TypeError inside a pack moves on to the next language', async () => {
    const p = evil((r) => (r.dates = { months: null, templates: { full: '{day} {month}', noYear: '{day} {month}' } }));
    const out = await renderPhrase('deadline.by', { date: { type: 'date', value: '2026-11-15' } }, 'zz', rawRegistry({ ...p, phrases: { 'deadline.by': e('zz {date}') } }, fr, en), ctx);
    expect(out.lang).not.toBe('zz');
  });
});

describe('3. atoms-only packs', () => {
  const only9 = (): PackRules => ({ formatVersion: 1, numbers: { atoms: Object.fromEntries('abcdefghij'.split('').map((w, i) => [String(i), w])) } });
  it('maxNumber is the largest atom; above it is digit by digit, never 9+3', () => {
    const r = only9();
    expect(maxNumber(r.numbers)).toBe(9);
    expect(assemble(numberTokens(r.numbers, 12))).toBe('b c');
    expect(assemble(numberTokens(r.numbers, 9))).toBe('j');
    expect(assemble(numberTokens(r.numbers, 100))).toBe('b a a');
  });
  it('atoms 0-9 plus a scale of 100 cannot say 12 (no wrong "nine three"): SpeechRuleError', () => {
    const r = only9();
    r.numbers.scales = [{ value: 100, word: 'S' }];
    expect(() => numberTokens(r.numbers, 12)).toThrow(/cannot say 12/);
    expect(assemble(numberTokens(r.numbers, 200))).toBe('c S');
  });
  it('warns when atoms stop below 10 with no scales, and lists numbers that cannot be said', () => {
    expect(rulesWarnings(only9()).join('|')).toMatch(/atoms stop at 9 and there are no scales/);
    const r = only9();
    r.numbers.scales = [{ value: 100, word: 'S' }];
    expect(rulesWarnings(r).join('|')).toMatch(/cannot say 10, 11, 12/);
    expect(rulesWarnings(enRules)).toEqual([]);
    expect(rulesWarnings(frRules)).toEqual([]);
  });
  it('rendering with an atoms-only pack speaks digits and keeps the amount right', async () => {
    const p = ttsPack('zz', 'zz', { ...only9(), money: { template: '{amount} {currency}', currencies: { XAF: { text: 'F' } } } }, { 'money.amount': e('zz {amount}') });
    const r = await renderPhrase('money.amount', moneySlot(12), 'zz', rawRegistry(p), ctx);
    expect(r.text).toBe('zz b c F');
  });
});

describe('4. "$&" and "$\'" in substituted strings stay literal', () => {
  const sender = (fallbackText: string) => ({ sender: { type: 'sender' as const, fallbackText } });
  const recorded = (): SpeechPack => ({
    manifest: manifest('xx', { kind: 'recorded' }, ['fr']),
    rules: enRules,
    phrases: { 'sender.known': e('from {sender} now', [{ clip: 'p.from' }, { slot: 'sender' }]) },
    hasClip: () => true,
    clipUrl: (id) => `/x/${id}.webm`,
  });
  for (const nasty of ['Afriland $& <b>', "A $' B", 'A $` B', '$1 $$ x']) {
    it(`tts and recorded text keep ${JSON.stringify(nasty)}`, async () => {
      const t = await renderPhrase('sender.known', sender(nasty), 'fr', rawRegistry(fr, en), ctx);
      expect(t.text).toBe(`Ce message vient de ${nasty}.`);
      const r = await renderPhrase('sender.known', sender(nasty), 'xx', rawRegistry(recorded(), fr, en), ctx);
      expect(r.text).toBe(`from ${nasty} now`);
    });
  }
  it('a display that contains another placeholder is not expanded twice', async () => {
    const pack: SpeechPack = { ...recorded(), phrases: { 'sender.known': e('{sender} {sender}', [{ slot: 'sender' }]) } };
    const r = await renderPhrase('sender.known', sender('{sender}'), 'xx', rawRegistry(pack, fr), ctx);
    expect(r.text).toBe('{sender} {sender}');
  });
});

describe('6. terminal fallback is not hard-coded to "en"', () => {
  const zz = ttsPack('zz', 'zz', enRules, {}, []);
  const fr2 = ttsPack('fr', 'fr-FR', frRules, frPhrases);
  const frOnly = { ...region, languages: ['fr'] };
  it('default: the region languages, so a fr-only region ends in fr and does not need an en pack', async () => {
    const r = await renderPhrase('money.amount', moneySlot(80), 'zz', rawRegistry(zz, fr2), { region: frOnly, today: ctx.today });
    expect(r.lang).toBe('fr');
  });
  it('default without region languages is "en"', async () => {
    const r = await renderPhrase('money.amount', moneySlot(80), 'zz', rawRegistry(zz, fr2, en), { region: { ...region, languages: [] }, today: ctx.today });
    expect(r.lang).toBe('en');
  });
  it('ctx.terminalFallback wins', async () => {
    const r = await renderPhrase('money.amount', moneySlot(80), 'zz', rawRegistry(zz, fr2, en), { ...ctx, terminalFallback: 'fr' });
    expect(r.lang).toBe('fr');
  });
  it('current behaviour kept for fr+en regions: catalog English spoken with the en pack', async () => {
    const r = await renderPhrase('about.health', undefined, 'zz', rawRegistry(zz, fr2, en), ctx);
    expect(r.lang).toBe('en');
  });
  it('renderPlan passes the context through', async () => {
    const plan: SpeechPlan = { sections: [{ section: 'money', utterances: [{ key: 'money.amount', slots: moneySlot(80) }] }] };
    const out = await renderPlan(plan, 'zz', rawRegistry(zz, fr2, en), { ...ctx, terminalFallback: 'en' });
    expect(out[0]!.lang).toBe('en');
  });
});

describe('7. English phone numbers read like French structure', () => {
  it('6 77 12 34 56', () => {
    expect(assemble(phoneTokens(enRules, '+237677123456', '237'))).toBe('six, seventy-seven, twelve, thirty-four, fifty-six');
    expect(assemble(phoneTokens(enRules, '222234567', '237'))).toBe('two, twenty-two, twenty-three, forty-five, sixty-seven');
  });
});
