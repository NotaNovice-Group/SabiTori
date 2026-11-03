/**
 * Regression tests for review round 3 (language system, voices, update channel).
 * One describe per fix; numbers match the review list.
 */
import { describe, expect, it, vi } from 'vitest';
import type { LanguagePack, PackManifest, PackPhrases, PackRules, SlotValue } from '@sabitori/core';
import {
  assemble, createBrowserTts, createManifestVoiceResolver, createMemoryRegistry, createPackRegistry, createPacksVoiceResolver, createPiperRuntime,
  createPiperTts, createPlayer, createWorkerEngines, dateTokens, digitTokens, isNoRules, loadManifests, maxNumber, moneyTokens, noRules, numberTokens,
  parseAudioIndex, parsePiperConfig, phoneTokens, piperVoiceFromManifest, renderPhrase, renderPlan, requiredClips, rulesWarnings, textToIds, textToIdsChecked,
  TtsVoiceUnavailableError, validateRules, voiceKey, SpeechRuleError, PackLoadError, MissingResourceError,
  type FetchLike, type OrtLike, type PiperEngine, type PiperVoiceSpec, type RenderedSection, type SpeechPack, type WorkerLike,
} from '../src/index.js';
import { enRules, frRules, manifest, region, ttsPack } from './helpers.js';

const ctx = { region, today: '2026-11-02' };
const e = (text: string, audio?: ({ slot: string } | { clip: string })[], status: 'draft' | 'reviewed' = 'reviewed') => ({ text, status, ...(audio ? { audio } : {}) });
const clone = <T>(x: T): T => JSON.parse(JSON.stringify(x));
const money = (amount: number): Record<string, SlotValue> => ({ amount: { type: 'money', value: { amount, currency: 'XAF' } } });
const textOf = (r: PackRules, n: number, o?: Parameters<typeof numberTokens>[2]) => assemble(numberTokens(r.numbers, n, o));

function fakeFetch(files: Record<string, unknown>, status: Record<string, number> = {}): FetchLike {
  return async (url) => {
    if (url in status) return { ok: false, status: status[url]!, json: async () => ({}) };
    if (!(url in files)) return { ok: false, status: 404, json: async () => ({}) };
    return { ok: true, status: 200, json: async () => files[url] };
  };
}

/** A tiny recorded language whose clips are listed in audio/index.json. */
const rec = (tag = 'xz') => manifest(tag, { kind: 'recorded' }, ['en']);
const xzRules = (): PackRules => ({
  formatVersion: 1,
  numbers: { atoms: Object.fromEntries('abcdefghij'.split('').map((w, i) => [String(i), w])), scales: [{ value: 10, word: 'tn', omitOne: true }] },
  money: { template: '{amount} {currency}', currencies: { XAF: { text: 'fr', plural: 'frs' } } },
});

describe('1. clip index records the file extension', () => {
  const files = (clips: unknown[]) => ({
    '/p/xz/manifest.json': rec(), '/p/xz/phrases.json': { 'scam.likely': e('Trik', [{ clip: 'scam.likely.0' }]) }, '/p/xz/rules.json': xzRules(),
    '/p/xz/audio/index.json': { clips },
  });
  it('uses the indexed file name for the clip url, string entries mean .webm', async () => {
    const reg = createPackRegistry({ baseUrl: '/p', fetch: fakeFetch(files([{ id: 'scam.likely.0', file: 'scam.likely.0.m4a' }, 'num.1', { id: 'num.2', file: 'num.2.webm' }])) });
    const p = (await reg.get('xz')) as SpeechPack;
    expect(p.clipUrl!('scam.likely.0')).toBe('/p/xz/audio/scam.likely.0.m4a');
    expect(p.clipUrl!('num.1')).toBe('/p/xz/audio/num.1.webm');
    expect(p.clipUrl!('num.2')).toBe('/p/xz/audio/num.2.webm');
    expect(p.hasClip!('scam.likely.0')).toBe(true);
    expect(p.hasClip!('num.3')).toBe(false);
  });
  it('rendering plays the .m4a file', async () => {
    const reg = createPackRegistry({ baseUrl: '/p', fetch: fakeFetch({ ...files([{ id: 'scam.likely.0', file: 'scam.likely.0.m4a' }]), '/p/index.json': { packs: ['xz'] } }) });
    const r = await renderPhrase('scam.likely', undefined, 'xz', reg, ctx);
    expect(r.parts).toEqual([{ kind: 'clip', url: '/p/xz/audio/scam.likely.0.m4a' }]);
  });
  it('refuses file names that are not the id plus .webm or .m4a, repeated ids and other shapes', () => {
    for (const bad of [
      [{ id: 'a', file: 'a.wav' }], [{ id: 'a', file: 'b.webm' }], [{ id: 'a', file: '../a.webm' }], ['a', 'a'], [{ id: 'a' }], [3], [{ id: '../x', file: '../x.webm' }],
    ]) expect(() => parseAudioIndex({ clips: bad }, 'xz'), JSON.stringify(bad)).toThrow(PackLoadError);
    expect(() => parseAudioIndex({ clips: 'x' }, 'xz')).toThrow(/must look like/);
    expect([...parseAudioIndex({ clips: ['a.b', { id: 'c', file: 'c.m4a' }] }, 'xz')]).toEqual([['a.b', 'a.b.webm'], ['c', 'c.m4a']]);
  });
  it('a registry rejects a bad index when loading the pack', async () => {
    const reg = createPackRegistry({ baseUrl: '/p', fetch: fakeFetch(files([{ id: 'a', file: 'a.wav' }])) });
    await expect(reg.get('xz')).rejects.toThrow(/must be "a.webm" or "a.m4a"/);
  });
});

describe('3. a missing rules.json means "no rules"', () => {
  const base = (rules?: unknown) => ({
    '/p/index.json': { packs: ['xz', 'en'] },
    '/p/xz/manifest.json': rec(),
    '/p/xz/phrases.json': { 'scam.likely': e('Trik', [{ clip: 'scam.likely.0' }]), 'money.amount': e('Mɔni {amount}', [{ clip: 'money.amount.0' }, { slot: 'amount' }]) },
    '/p/xz/audio/index.json': { clips: ['scam.likely.0', 'money.amount.0'] },
    '/p/en/manifest.json': manifest('en', { kind: 'tts', engine: 'system', bcp47: 'en-GB' }), '/p/en/phrases.json': { 'money.amount': e('The amount is {amount}.') }, '/p/en/rules.json': enRules,
    ...(rules ? { '/p/xz/rules.json': rules } : {}),
  });
  it('loads the pack; phrases without slots play, phrases with number slots fall back one by one', async () => {
    const reg = createPackRegistry({ baseUrl: '/p', fetch: fakeFetch(base()) });
    const p = (await reg.get('xz')) as SpeechPack;
    expect(p.noRules).toBe(true);
    expect(isNoRules(p.rules)).toBe(true);
    const a = await renderPhrase('scam.likely', undefined, 'xz', reg, ctx);
    expect(a.lang).toBe('xz');
    const b = await renderPhrase('money.amount', money(5000), 'xz', reg, ctx);
    expect(b.lang).toBe('en');
    expect(b.text).toBe('The amount is five thousand CFA francs.');
  });
  it('only a 404 is "no rules": a server error or an invalid file still fails the pack', async () => {
    const reg500 = createPackRegistry({ baseUrl: '/p', fetch: fakeFetch(base(), { '/p/xz/rules.json': 500 }) });
    await expect(reg500.get('xz')).rejects.toThrow(/HTTP 500/);
    const bad = createPackRegistry({ baseUrl: '/p', fetch: fakeFetch(base({ formatVersion: 1, numbers: { atoms: {} } })) });
    await expect(bad.get('xz')).rejects.toThrow(/atoms is missing/);
  });
  it('requiredClips of a pack without rules lists only the phrase clips', async () => {
    const reg = createPackRegistry({ baseUrl: '/p', fetch: fakeFetch(base()) });
    const p = (await reg.get('xz')) as SpeechPack;
    expect(requiredClips(p)).toEqual(['money.amount.0', 'scam.likely.0']);
    expect(p.missingClips).toEqual([]);
  });
  it('noRules() works in a memory registry (the Recorder preview)', async () => {
    const pack: LanguagePack = { manifest: manifest('tts', { kind: 'tts', engine: 'system', bcp47: 'x' }), phrases: { 'money.amount': e('x {amount}') }, rules: noRules() };
    const reg = createMemoryRegistry([pack, ttsPack('en', 'en-GB', enRules, { 'money.amount': e('Pay {amount}.') })]);
    expect((await renderPhrase('money.amount', money(3), 'tts', reg, ctx)).lang).toBe('en');
  });
});

describe('4. draft phrases are not spoken', () => {
  const drafts: PackPhrases = { 'scam.likely': e('Trik', [{ clip: 'scam.likely.0' }], 'draft'), 'scam.caution': e('Care', [{ clip: 'scam.caution.0' }], 'reviewed') };
  const xz = (status: PackManifest['status'] = 'beta'): SpeechPack => ({
    manifest: { ...rec(), status }, phrases: drafts, rules: xzRules(), hasClip: () => true, clipUrl: (id) => `/x/${id}.webm`,
  });
  const en = ttsPack('en', 'en-GB', enRules, { 'scam.likely': e('This looks like a trick.'), 'scam.caution': e('Be careful.') });
  it('a recorded pack skips a draft and the next language speaks; reviewed phrases play', async () => {
    const reg = createMemoryRegistry([xz(), en]);
    expect((await renderPhrase('scam.likely', undefined, 'xz', reg, ctx)).lang).toBe('en');
    expect((await renderPhrase('scam.caution', undefined, 'xz', reg, ctx)).lang).toBe('xz');
  });
  it('includeDrafts plays them (tester builds)', async () => {
    const reg = createMemoryRegistry([xz(), en]);
    const r = await renderPhrase('scam.likely', undefined, 'xz', reg, { ...ctx, includeDrafts: true });
    expect(r.lang).toBe('xz');
  });
  it('renderPlan skips the draft too', async () => {
    const reg = createMemoryRegistry([xz(), en]);
    const out = await renderPlan({ sections: [{ section: 'scam', utterances: [{ key: 'scam.likely' }] }] } as never, 'xz', reg, ctx);
    expect(out[0]!.lang).toBe('en');
  });
  it('packs below beta skip drafts even with a synthetic voice; beta/stable synthetic packs (fr, en) keep speaking theirs', async () => {
    const tts = (status: PackManifest['status']) => ({ ...ttsPack('yy', 'yy', enRules, { 'scam.likely': e('YY', undefined, 'draft') }), manifest: { ...manifest('yy', { kind: 'tts', engine: 'system', bcp47: 'yy' }, ['en']), status } });
    expect((await renderPhrase('scam.likely', undefined, 'yy', createMemoryRegistry([tts('in_recording'), en]), ctx)).lang).toBe('en');
    expect((await renderPhrase('scam.likely', undefined, 'yy', createMemoryRegistry([tts('beta'), en]), ctx)).lang).toBe('yy');
  });
  it('the pack status is available through registry.list() and manifests()', async () => {
    const reg = createMemoryRegistry([xz('in_recording'), en]);
    expect((await reg.list()).map((m) => [m.tag, m.status])).toEqual([['xz', 'in_recording'], ['en', 'beta']]);
    expect((await reg.manifests!()).complete).toBe(true);
  });
});

describe('8. large amounts are never read digit by digit', () => {
  it('money, dates and number slots throw SpeechRuleError above the composable range; phones keep digit reading', () => {
    const r = xzRules(); // atoms 0-9, scale 10: composes up to 99
    expect(maxNumber(r.numbers)).toBe(99);
    expect(textOf(r, 99)).toBe('j tn j');
    expect(() => moneyTokens(r, { amount: 100, currency: 'XAF' })).toThrow(SpeechRuleError);
    expect(() => numberTokens(r.numbers, 100, { overflow: 'throw' })).toThrow(/compose up to 99/);
    expect(assemble(numberTokens(r.numbers, 100))).toBe('b a a'); // default stays digits for phone groups
    r.phones = { groups: [4], read: 'number', defaultGroupSize: 4 };
    expect(assemble(phoneTokens(r, '1234567', '237'))).toBe('b c d e f g h'); // groups above the cap are read digit by digit
  });
  it('the cap is derived from the scales (no x1000 assumption)', () => {
    const atoms = Object.fromEntries(Array.from({ length: 20 }, (_, i) => [String(i), `a${i}`]));
    const b20: PackRules = { formatVersion: 1, numbers: { atoms, scales: [{ value: 20, word: 'S20', omitOne: true }, { value: 400, word: 'S400', omitOne: true }, { value: 8000, word: 'S8000', omitOne: true }] } };
    validateRules(b20);
    expect(maxNumber(b20.numbers)).toBe(63_999_999); // not 7 999 999
    expect(textOf(b20, 25_000_000, { overflow: 'throw' })).toContain('S8000');
    expect(() => numberTokens(b20.numbers, 64_000_000, { overflow: 'throw' })).toThrow(SpeechRuleError);
    expect(maxNumber(frRules.numbers)).toBeGreaterThan(1e12);
    expect(maxNumber(enRules.numbers)).toBeGreaterThan(1e12);
  });
  it('rulesWarnings probes up to 1e9 and warns when the largest composable amount is below it', () => {
    const w = rulesWarnings(xzRules()).join('|');
    expect(w).toMatch(/largest number the rules can compose is 99; amounts above it \(up to 1000000000\)/);
    expect(rulesWarnings(enRules)).toEqual([]);
    const holes = clone(xzRules());
    holes.numbers.scales = [{ value: 100, word: 'S' }];
    expect(rulesWarnings(holes).join('|')).toMatch(/cannot say 10/);
  });
  it('a phrase with a huge amount falls back to a language that can say it', async () => {
    const reg = createMemoryRegistry([ttsPack('xz', 'xz', xzRules(), { 'money.amount': e('x {amount}') }, ['en']), ttsPack('en', 'en-GB', enRules, { 'money.amount': e('Pay {amount}.') })]);
    expect((await renderPhrase('money.amount', money(5_000), 'xz', reg, ctx)).lang).toBe('en');
    expect((await renderPhrase('money.amount', money(50), 'xz', reg, ctx)).lang).toBe('xz');
  });
});

describe('10. number rules: contexts, bound and plural clips', () => {
  const rules = (): PackRules => {
    // rules.json is data: the new fields are not in the core types, so build it loosely.
    const r = clone(xzRules()) as unknown as { numbers: Record<string, unknown>; money: { currencies: Record<string, unknown> } };
    r.numbers.atoms = { ...(r.numbers.atoms as object), '80': { text: 'ev', bound: 'evb', boundClip: true } };
    r.numbers.scales = [{ value: 100, word: 'hd', plural: 'hds', pluralWhen: 'multiple', pluralClip: true }];
    r.numbers.contexts = {
      money: { atoms: { '1': 'one-m', '2': 'two-m' }, scales: [{ value: 100, word: 'hd-m' }], joiners: { na: { text: 'na-m' } }, join: [{ token: 'na' }] },
      day: { atoms: { '3': 'three-d' } },
      year: { atoms: { '2': 'two-y' } },
    };
    r.numbers.joiners = { na: { text: 'na' } };
    r.money.currencies = { XAF: { text: 'fr', plural: 'frs', pluralClip: true } };
    return r as unknown as PackRules;
  };
  it('validates, and an invalid context or flag is named', () => {
    expect(() => validateRules(rules())).not.toThrow();
    const bad = rules() as never as { numbers: { contexts: Record<string, unknown> } };
    bad.numbers.contexts.weekend = { atoms: {} };
    expect(() => validateRules(bad)).toThrow(/contexts.weekend is not one of money, day, year/);
    const b2 = rules() as never as { numbers: { atoms: Record<string, unknown> } };
    b2.numbers.atoms['80'] = { text: 'x', boundClip: 'yes' };
    expect(() => validateRules(b2)).toThrow(/boundClip/);
  });
  it('money uses the money set with its own clip ids; other places use the base atoms', () => {
    const r = rules();
    const ids = (t: ReturnType<typeof numberTokens>) => t.map((x) => x.id);
    expect(ids(moneyTokens(r, { amount: 2, currency: 'XAF' }))).toEqual(['num.money.2', 'currency.XAF.plural']);
    expect(assemble(moneyTokens(r, { amount: 1, currency: 'XAF' }))).toBe('one-m fr');
    expect(assemble(moneyTokens(r, { amount: 3, currency: 'XAF' }))).toBe('d frs'); // 3 has no money atom: inherits the base word
    expect(ids(moneyTokens(r, { amount: 3, currency: 'XAF' }))).toEqual(['num.3', 'currency.XAF.plural']);
    expect(ids(numberTokens(r.numbers, 2))).toEqual(['num.2']);
  });
  it('day and year contexts apply to dates', () => {
    const base = rules();
    (base.numbers.atoms as Record<string, string>)['20'] = 'twenty';
    const r = { ...base, dates: { months: Array.from({ length: 12 }, (_, i) => `m${i + 1}`), templates: { full: '{day} {month} {year}', noYear: '{day} {month}' }, yearStyle: 'cardinal' as const } };
    expect(dateTokens(r, '2026-03-03', '2026-11-02').map((t) => t.id)).toEqual(['num.day.3', 'month.3']);
    expect(dateTokens(r, '2022-03-04', '2026-11-02').map((t) => t.id)).toEqual(['num.4', 'month.3', 'num.20', 'scale.100.plural', 'num.20', 'num.year.2']);
  });
  it('bound and plural forms have their own clips when asked, and share one otherwise', () => {
    const r = rules();
    expect(numberTokens(r.numbers, 81).map((t) => t.id)).toEqual(['num.80.bound', 'num.1']);
    expect(numberTokens(r.numbers, 80).map((t) => t.id)).toEqual(['num.80']);
    expect(numberTokens(r.numbers, 200).map((t) => t.id)).toEqual(['num.2', 'scale.100.plural']);
    expect(numberTokens(r.numbers, 100).map((t) => t.id)).toEqual(['num.1', 'scale.100']);
    const same = clone(frRules) as PackRules;
    expect(numberTokens(same.numbers, 80).map((t) => t.id)).toEqual(['num.80']);
    expect(numberTokens(same.numbers, 81).map((t) => t.id)).toEqual(['num.80', null, 'num.1']); // French: bound form, same clip (the hyphen is silent)
  });
  it('requiredClips lists every new clip id', () => {
    const r = rules();
    const pack: LanguagePack = { manifest: rec(), phrases: {}, rules: r };
    const ids = requiredClips(pack);
    for (const id of ['num.80', 'num.80.bound', 'scale.100', 'scale.100.plural', 'currency.XAF', 'currency.XAF.plural', 'num.money.1', 'num.money.2', 'scale.money.100', 'join.money.na', 'num.day.3', 'num.year.2']) expect(ids, id).toContain(id);
    expect(ids).not.toContain('num.money.3');
  });
  it('a recorded pack missing a context clip falls back instead of playing a half amount', async () => {
    const r = rules();
    const clips = new Set(requiredClips({ manifest: rec(), phrases: {}, rules: r }).filter((i) => i !== 'num.money.2'));
    const x: SpeechPack = { manifest: rec(), phrases: { 'money.amount': e('x {amount}', [{ clip: 'p.0' }, { slot: 'amount' }]) }, rules: r, hasClip: (i) => i === 'p.0' || clips.has(i), clipUrl: (i) => `/${i}.webm` };
    const reg = createMemoryRegistry([x, ttsPack('en', 'en-GB', enRules, { 'money.amount': e('Pay {amount}.') })]);
    expect((await renderPhrase('money.amount', money(2), 'xz', reg, ctx)).lang).toBe('en');
    expect((await renderPhrase('money.amount', money(1), 'xz', reg, ctx)).lang).toBe('xz');
  });
});

describe('12. English rules: ordinal dates, foreign numbers, invalid values', () => {
  it('the date says "the eleventh of November" and keeps the catalog phrase "Do it by {date}" grammatical', async () => {
    expect(assemble(dateTokens(enRules, '2026-11-11', '2026-11-02'))).toBe('the eleventh of November');
    expect(assemble(dateTokens(enRules, '2027-03-01', '2026-11-02'))).toBe('the first of March twenty twenty-seven');
    expect(assemble(dateTokens(enRules, '2026-12-22', '2026-11-02'))).toBe('the twenty-second of December');
    expect(assemble(dateTokens(enRules, '2026-11-03', '2026-11-02'))).toBe('tomorrow');
    const en = ttsPack('en', 'en-GB', enRules, { 'deadline.by': e('Do it by {date}.') });
    const r = await renderPhrase('deadline.by', { date: { type: 'date', value: '2026-11-11' } }, 'en', createMemoryRegistry([en]), ctx);
    expect(r.text).toBe('Do it by the eleventh of November.');
  });
  it('every day of the month has an ordinal word', () => {
    const days = (enRules.dates as { days: Record<string, string> }).days;
    expect(Object.keys(days)).toHaveLength(31);
  });
  it('a foreign number (+33...) is read in generic groups of digits, not in the Cameroon pattern', () => {
    expect(assemble(phoneTokens(enRules, '+33612345678', '237'))).toBe('three three six, one two three, four five six, seven eight');
    expect(assemble(phoneTokens(enRules, '0033612345678', '237'))).toBe('three three six, one two three, four five six, seven eight');
    expect(assemble(phoneTokens(enRules, '+237677123456', '237'))).toBe('six, seventy-seven, twelve, thirty-four, fifty-six');
    expect(assemble(phoneTokens(enRules, '677123456', '237'))).toBe('six, seventy-seven, twelve, thirty-four, fifty-six');
    const r = clone(enRules) as never as { phones: Record<string, unknown> } & PackRules;
    r.phones.foreignGroupSize = 2;
    expect(assemble(phoneTokens(r, '+33612', '237'))).toBe('three three, six one, two');
    expect(() => validateRules({ ...enRules, phones: { ...enRules.phones, foreignGroupSize: 0 } })).toThrow(/foreignGroupSize/);
  });
  it('invalid dates and decimal amounts throw SpeechRuleError and the phrase falls back cleanly', async () => {
    expect(() => dateTokens(enRules, '2027-02-29', '2026-11-02')).toThrow(SpeechRuleError);
    expect(() => dateTokens(enRules, 'tomorrow', '2026-11-02')).toThrow(SpeechRuleError);
    expect(() => moneyTokens(enRules, { amount: 12.5, currency: 'XAF' })).toThrow(SpeechRuleError);
    const noDates = { ...enRules, dates: undefined } as PackRules;
    const reg = createMemoryRegistry([
      ttsPack('en', 'en-GB', enRules, { 'deadline.by': e('Do it by {date}.') }),
      ttsPack('xx', 'xx', noDates, { 'deadline.by': e('xx {date}') }, ['en']),
    ]);
    // a pack whose rules cannot say dates: the phrase is spoken by the next language, with the date said right there
    const ok = await renderPhrase('deadline.by', { date: { type: 'date', value: '2026-11-11' } }, 'xx', reg, ctx);
    expect(ok.lang).toBe('en');
    // an impossible date is a SpeechRuleError everywhere: a clean MissingResourceError, never a garbled sentence
    await expect(renderPhrase('deadline.by', { date: { type: 'date', value: '2027-02-29' } }, 'xx', reg, ctx)).rejects.toBeInstanceOf(MissingResourceError);
  });
});

describe('9. Piper: robustness', () => {
  const VOICE: PiperVoiceSpec = { id: 'lns:v', modelUrl: 'm', configUrl: 'c.json' };
  const output = () => ({ play: () => ({ done: Promise.resolve(), stop() {} }) }) as never;
  const audio = { samples: new Float32Array(10), sampleRate: 1000 };

  it('a voice that fails is remembered for the session: no reload loop', async () => {
    let loads = 0;
    const engines = (): PiperEngine => ({ load: async () => void loads++, synthesize: async () => { throw new Error('Gather: index 140 out of bounds'); }, dispose() {} });
    const spoken: string[] = [];
    const events: string[] = [];
    const tts = createPiperTts({ engines, resolveVoice: () => VOICE, fallback: { speak: async (r) => void spoken.push(r.text), cancel() {} }, output: output(), onEvent: (ev) => events.push(ev.type === 'fallback' ? ev.reason : ev.type) });
    for (let i = 0; i < 5; i++) await tts.speak({ text: `Sentence ${i}.`, bcp47: 'lns', rate: 1 });
    expect(loads).toBe(1);
    expect(spoken).toHaveLength(5);
    expect(events.filter((x) => x === 'synthesis-error')).toHaveLength(1);
    expect(events.filter((x) => x === 'load-error')).toHaveLength(4);
  });
  it('a voice that cannot load is remembered too', async () => {
    let loads = 0;
    const engines = (): PiperEngine => ({ load: async () => { loads++; throw new Error('HTTP 404'); }, synthesize: async () => audio, dispose() {} });
    const tts = createPiperTts({ engines, resolveVoice: () => VOICE, fallback: { speak: async () => undefined, cancel() {} }, output: output() });
    for (let i = 0; i < 4; i++) await tts.speak({ text: 'x.', bcp47: 'lns', rate: 1 });
    expect(loads).toBe(1);
  });
  it('the voice version is part of the cache key: a retrained voice under the same id is loaded again, never paired with the old model', async () => {
    const created: PiperVoiceSpec[] = [];
    const engines = (v: PiperVoiceSpec): PiperEngine => (created.push(v), { load: async () => undefined, synthesize: async () => audio, dispose() {} });
    let version = '0.1.0';
    const tts = createPiperTts({ engines, resolveVoice: () => ({ ...VOICE, version }), fallback: { speak: async () => undefined, cancel() {} }, output: output() });
    await tts.speak({ text: 'One.', bcp47: 'lns', rate: 1 });
    await tts.speak({ text: 'One.', bcp47: 'lns', rate: 1 }); // cached audio of version 0.1.0
    version = '0.2.0';
    await tts.speak({ text: 'One.', bcp47: 'lns', rate: 1 });
    expect(created.map((v) => v.version)).toEqual(['0.1.0', '0.2.0']);
    expect(voiceKey({ id: 'a', version: '1' })).toBe('a@1');
    expect(voiceKey({ id: 'a' })).toBe('a');
  });
  it('a slow first synthesis disables only that voice; another voice still uses Piper', async () => {
    vi.useFakeTimers();
    try {
      const engines = (v: PiperVoiceSpec): PiperEngine => ({ load: async () => undefined, synthesize: () => (v.id === 'slow' ? new Promise(() => undefined) : Promise.resolve(audio)), dispose() {} });
      const spoken: string[] = [];
      const tts = createPiperTts({ engines, resolveVoice: (b) => ({ id: b === 'aa' ? 'slow' : 'fast', modelUrl: 'm', configUrl: 'c' }), fallback: { speak: async (r) => void spoken.push(r.text), cancel() {} }, output: output() });
      const p = tts.speak({ text: 'Slow.', bcp47: 'aa', rate: 1 });
      await vi.advanceTimersByTimeAsync(6100);
      await p;
      expect(tts.disabled).toBe(false);
      expect([...tts.disabledVoices]).toEqual(['slow']);
      await tts.speak({ text: 'Fast.', bcp47: 'bb', rate: 1 });
      expect(spoken).toEqual(['Slow.']);
      await tts.speak({ text: 'Slow again.', bcp47: 'aa', rate: 1 });
      expect(spoken).toEqual(['Slow.', 'Slow again.']);
    } finally {
      vi.useRealTimers();
    }
  });
  it('a restarted worker clears the ready state: the voice is loaded again and keeps speaking', async () => {
    let workers = 0;
    let current!: WorkerLike & { crash(): void };
    const mk = (): WorkerLike => {
      const id = ++workers;
      const loaded = new Set<string>();
      const w = {
        onmessage: null, onerror: null, terminate() {},
        postMessage(m: never) {
          const msg = m as { id: number; type: string; voice?: { id: string; version?: string }; voiceId?: string };
          setTimeout(() => {
            if (msg.type === 'load') { loaded.add(voiceKey(msg.voice!)); w.onmessage!({ data: { id: msg.id, ok: true } }); }
            else if (msg.type === 'synth') w.onmessage!({ data: loaded.has(msg.voiceId!) ? { id: msg.id, ok: true, samples: new Float32Array(10), sampleRate: 22050 } : { id: msg.id, ok: false, error: `worker#${id}: voice not loaded` } });
            else w.onmessage!({ data: { id: msg.id, ok: true } });
          }, 1);
        },
        crash() { (w as unknown as WorkerLike).onerror!({ message: 'out of memory' }); },
      } as unknown as WorkerLike & { crash(): void };
      current = w;
      return w;
    };
    const engines = createWorkerEngines({ createWorker: mk, assetBase: '/' });
    const events: string[] = [];
    const spoken: string[] = [];
    let played = 0;
    const tts = createPiperTts({ engines, resolveVoice: () => ({ id: 'fr:x', modelUrl: 'm', configUrl: 'c' }), fallback: { speak: async (r) => void spoken.push(r.text), cancel() {} }, output: { play: () => (played++, { done: Promise.resolve(), stop() {} }) } as never, onEvent: (ev) => events.push(ev.type) });
    await tts.speak({ text: 'Bonjour.', bcp47: 'fr', rate: 1 });
    current.crash();
    for (const t of ['Un.', 'Deux.', 'Trois.']) await tts.speak({ text: t, bcp47: 'fr', rate: 1 });
    expect(workers).toBe(2);
    expect(spoken).toEqual([]); // nothing needed the system voice
    expect(played).toBe(4);
    expect(events.filter((x) => x === 'ready')).toHaveLength(2);
  });
  it('the config is checked against the model inputs and outputs on load, and a mismatched model fails on load', async () => {
    const cfg = { audio: { sample_rate: 16000 }, phoneme_type: 'text', inference: { noise_scale: 1, length_scale: 1, noise_w: 1 }, phoneme_id_map: { _: [0], '^': [1], $: [2], a: [4], b: [200] }, num_speakers: 2 };
    const session = (inputNames: string[], run?: () => Promise<never>) => ({ inputNames, outputNames: ['output'], run: run ?? (async () => ({ output: { data: new Float32Array(3) } })) });
    const rt = (s: unknown) => createPiperRuntime({
      ort: { InferenceSession: { create: async () => s }, Tensor: class { constructor(public t: string, public d: unknown) {} } } as unknown as OrtLike,
      loadPhonemizer: async () => ({ phonemize: () => [] }),
      fetchBytes: async (u) => (u.endsWith('.json') ? new TextEncoder().encode(JSON.stringify(cfg)) : new Uint8Array(4)),
    });
    await expect(rt(session(['input', 'input_lengths', 'scales'])).load(VOICE)).rejects.toThrow(/several speakers but the model has no "sid"/);
    await expect(rt(session(['input', 'scales', 'sid'])).load(VOICE)).rejects.toThrow(/no input "input_lengths"/);
    await expect(rt(session(['input', 'input_lengths', 'scales', 'sid'], async () => { throw new Error('Gather: index 200 out of bounds'); })).load(VOICE)).rejects.toThrow(/does not match its config.*out of bounds/);
    await expect(rt(session(['input', 'input_lengths', 'scales', 'sid'])).load(VOICE)).resolves.toBeTruthy();
    const single = { ...cfg, num_speakers: 1 };
    const rt1 = createPiperRuntime({ ort: { InferenceSession: { create: async () => session(['input', 'input_lengths', 'scales', 'sid']) }, Tensor: class {} } as unknown as OrtLike, loadPhonemizer: async () => ({ phonemize: () => [] }), fetchBytes: async (u) => (u.endsWith('.json') ? new TextEncoder().encode(JSON.stringify(single)) : new Uint8Array(4)) });
    await expect(rt1.load(VOICE)).rejects.toThrow(/expects a speaker id but the config has one speaker/);
  });
  it('phoneme_type "text": upper case is folded to the voice\'s letters before anything is dropped; mostly unknown text is an error', async () => {
    const map: Record<string, number[]> = { _: [0], '^': [1], $: [2], ' ': [3] };
    'abcdefghijklmnopqrstuvwxyzɓɛɔŋ'.split('').forEach((c, i) => (map[c] = [10 + i]));
    expect(textToIds('ENEO', map)).toEqual(textToIds('eneo', map));
    expect(textToIds('ENEO', map).length).toBeGreaterThan(3);
    expect(textToIdsChecked('677 12', map)).toMatchObject({ letters: 5, dropped: 5 });
    expect(textToIdsChecked('MTN MoMo', map).dropped).toBe(0);
    const cfg = { audio: { sample_rate: 16000 }, phoneme_type: 'text', inference: { noise_scale: 1, length_scale: 1, noise_w: 1 }, phoneme_id_map: map };
    const rt = createPiperRuntime({ ort: { InferenceSession: { create: async () => ({ run: async () => ({ output: { data: new Float32Array(3) } }) }) }, Tensor: class {} } as unknown as OrtLike, loadPhonemizer: async () => ({ phonemize: () => [] }), fetchBytes: async (u) => (u.endsWith('.json') ? new TextEncoder().encode(JSON.stringify(cfg)) : new Uint8Array(4)) });
    const v = await rt.load(VOICE);
    expect((await v.synthesize('ENEO', { lengthScale: 1 })).samples.length).toBe(3);
    await expect(v.synthesize('677 12', { lengthScale: 1 })).rejects.toThrow(/does not know 5 of the 5 letters and digits/);
    expect((await v.synthesize('?!', { lengthScale: 1 })).samples.length).toBe(0); // only punctuation: genuinely nothing to say
    // the error makes the Piper TTS backend use the phone's voice, not silence
    const spoken: string[] = [];
    const tts = createPiperTts({ engines: () => ({ load: async () => undefined, synthesize: (t) => v.synthesize(t, { lengthScale: 1 }), dispose() {} }), resolveVoice: () => VOICE, fallback: { speak: async (r) => void spoken.push(r.text), cancel() {} }, output: output() });
    await tts.speak({ text: '677 12.', bcp47: 'lns', rate: 1 });
    expect(spoken).toEqual(['677 12.']);
  });
  it('voices resolve in the order of index.json whichever manifest answers first', async () => {
    const man = (tag: string, bcp47: string, hint: string) => ({ formatVersion: 1, tag, name: tag, autonym: tag, fallback: [], voice: { kind: 'tts', engine: 'piper', bcp47, voiceHint: hint }, status: 'beta', reads: false, regions: [], license: 'x', contributors: [], version: '0.1.0' });
    const files: Record<string, unknown> = { 'b/index.json': { packs: ['fub', 'ffm'] }, 'b/fub/manifest.json': man('fub', 'ff-CM', 'fub-voice'), 'b/ffm/manifest.json': man('ffm', 'ff-ML', 'ffm-voice') };
    for (const slowFirst of [false, true]) {
      const r = createPacksVoiceResolver('b', async (u) => { if (slowFirst && u.includes('fub/')) await new Promise((x) => setTimeout(x, 15)); return files[u]; });
      expect((await r('ff'))!.id).toBe('fub:fub-voice');
      expect((await r('ff-NE'))!.id).toBe('fub:fub-voice');
      expect((await r('ff-ML'))!.id).toBe('ffm:ffm-voice');
    }
    const { manifests } = await loadManifests('b', async (u) => { if (u.includes('fub/')) await new Promise((x) => setTimeout(x, 15)); return files[u]; });
    expect(manifests.map((m) => m.tag)).toEqual(['fub', 'ffm']);
  });
  it('parts carry the pack tag and voice id: two packs sharing a BCP 47 tag keep separate voices', async () => {
    const mk = (tag: string, hint: string): PackManifest => ({ ...manifest(tag, { kind: 'tts', engine: 'piper', bcp47: 'ff-CM', voiceHint: hint }), version: '1.0.0' });
    const a = { ...ttsPack('fub', 'ff-CM', enRules, { 'scam.likely': e('A') }), manifest: mk('fub', 'fub-voice') };
    const b = { ...ttsPack('ffx', 'ff-CM', enRules, { 'scam.likely': e('B') }), manifest: mk('ffx', 'ffx-voice') };
    const reg = createMemoryRegistry([a, b]);
    const ra = await renderPhrase('scam.likely', undefined, 'fub', reg, ctx);
    const rb = await renderPhrase('scam.likely', undefined, 'ffx', reg, ctx);
    expect(ra.parts).toEqual([{ kind: 'tts', text: 'A', bcp47: 'ff-CM', tag: 'fub', voice: 'fub-voice' }]);
    expect(rb.parts[0]).toMatchObject({ tag: 'ffx', voice: 'ffx-voice' });
    const resolve = createManifestVoiceResolver(async () => [mk('fub', 'fub-voice'), mk('ffx', 'ffx-voice')], 'p');
    expect((await resolve('ff-CM', { tag: 'ffx' }))!.id).toBe('ffx:ffx-voice');
    expect((await resolve('ff-CM', { tag: 'fub' }))!.id).toBe('fub:fub-voice');
    expect((await resolve('ff-CM'))!.id).toBe('fub:fub-voice');
    // the player hands the tag and voice to the backend
    const seen: unknown[] = [];
    const player = createPlayer({ tts: { speak: async (r) => void seen.push([r.tag, r.voice]), cancel() {} }, clips: { play: async () => undefined, cancel() {} } });
    await new Promise<void>((res) => player.play([{ section: 'scam', text: 'B', lang: 'ffx', parts: rb.parts } as RenderedSection], { rate: 1, onSection: (i) => i === null && res() }));
    expect(seen).toEqual([['ffx', 'ffx-voice']]);
    // the voice spec carries the manifest version
    expect(piperVoiceFromManifest(mk('fub', 'fub-voice'), 'p')!.version).toBe('1.0.0');
  });
  it('registry manifests are fetched once and shared with the voice resolver', async () => {
    const log: string[] = [];
    const m = (tag: string): PackManifest => manifest(tag, { kind: 'tts', engine: 'piper', bcp47: tag, voiceHint: `${tag}-v` });
    const reg = createPackRegistry({ baseUrl: '/p', fetch: async (u) => { log.push(u); const f: Record<string, unknown> = { '/p/index.json': { packs: ['aa', 'bb', 'cc'] }, '/p/aa/manifest.json': m('aa'), '/p/bb/manifest.json': m('bb') }; return u in f ? { ok: true, status: 200, json: async () => f[u] } : { ok: false, status: 404, json: async () => ({}) }; } });
    const r = createPacksVoiceResolver('/p', undefined, undefined, { list: () => reg.manifests!() });
    expect((await r('aa'))!.id).toBe('aa:aa-v');
    expect((await r('bb'))!.id).toBe('bb:bb-v');
    await reg.list();
    expect(log.filter((u) => u.endsWith('aa/manifest.json'))).toHaveLength(1);
    // cc is missing: skipped, never hides the others, and says so
    const all = await reg.manifests!();
    expect(all.manifests.map((x) => x.tag)).toEqual(['aa', 'bb']);
    expect(all.complete).toBe(false);
    expect(all.errors[0]!.tag).toBe('cc');
  });
});

describe('9. the phone has no voice for the language: the caller is told', () => {
  const synth = (voices: { lang: string; localService: boolean }[]) => ({ speak: vi.fn(), cancel: vi.fn(), getVoices: () => voices });
  it('createBrowserTts rejects with TtsVoiceUnavailableError instead of speaking with another language\'s voice', async () => {
    const s = synth([{ lang: 'fr-FR', localService: true }, { lang: 'en-GB', localService: true }]);
    const tts = createBrowserTts({ synth: s, makeUtterance: (text) => ({ text, lang: '', rate: 1, voice: null, onend: null, onerror: null, onboundary: null }) });
    const err = await tts.speak({ text: 'Mɔni', bcp47: 'ewo', rate: 1 }).catch((x) => x);
    expect(err).toBeInstanceOf(TtsVoiceUnavailableError);
    expect(err.bcp47).toBe('ewo');
    expect(s.speak).not.toHaveBeenCalled();
  });
  it('the player passes it to onError so the app can render the next language', async () => {
    const tts = createBrowserTts({ synth: synth([{ lang: 'fr-FR', localService: true }]) });
    const player = createPlayer({ tts, clips: { play: async () => undefined, cancel() {} } });
    const errors: Error[] = [];
    await new Promise<void>((res) => player.play([{ section: 'scam', text: 'x', lang: 'ewo', parts: [{ kind: 'tts', text: 'x', bcp47: 'ewo' }] } as RenderedSection], { rate: 1, onError: (_i, e2) => errors.push(e2), onSection: (i) => i === null && res() }));
    expect(errors[0]).toBeInstanceOf(TtsVoiceUnavailableError);
  });
  it('strictVoice: false keeps the old behaviour (speak with the default voice)', async () => {
    const s = synth([{ lang: 'fr-FR', localService: true }]);
    const tts = createBrowserTts({
      synth: s, strictVoice: false,
      makeUtterance: (text) => { const u = { text, lang: '', rate: 1, voice: null, onend: null as null | (() => void), onerror: null, onboundary: null }; return u; },
    });
    s.speak.mockImplementation((u: { onend: () => void }) => u.onend());
    await expect(tts.speak({ text: 'x', bcp47: 'ewo', rate: 1 })).resolves.toBeUndefined();
    expect(s.speak).toHaveBeenCalled();
  });
  it('Piper passes the system voice\'s TtsVoiceUnavailableError on', async () => {
    const tts = createPiperTts({
      engines: () => ({ load: async () => undefined, synthesize: async () => ({ samples: new Float32Array(1), sampleRate: 1 }), dispose() {} }),
      resolveVoice: () => null,
      fallback: createBrowserTts({ synth: synth([{ lang: 'fr-FR', localService: true }]) }),
    });
    await expect(tts.speak({ text: 'x', bcp47: 'ewo', rate: 1 })).rejects.toBeInstanceOf(TtsVoiceUnavailableError);
  });
});

describe('digit reading helpers stay available', () => {
  it('digitTokens reads any digit string with the atoms', () => {
    expect(assemble(digitTokens(enRules.numbers, '2026'))).toBe('two zero two six');
    expect(parsePiperConfig).toBeTypeOf('function');
  });
});
