/**
 * TEMPORARY stand-in for @sabitori/core (analyze, buildSpeechPlan, rules classifier)
 * and @sabitori/speech (registry, render, player), used only while those packages
 * are incomplete. engine/index.ts picks the real packages as soon as they export
 * the documented API. Not part of the product.
 */
import { CATALOG, PHRASE_KEYS } from '@sabitori/core';
import type {
  Card, CardSection, Classifier, Facts, Fact, IsoDate, LangTag, LanguagePack, MessageInput, PackManifest, PackPhrases,
  PhraseKey, RegionConfig, ScamSignal, SlotValue, SpeechPlan, Understanding, Utterance,
} from '@sabitori/core';
import { EXTRA, EXTRA_KEYS } from './extra';
import { BUNDLE_KEYS, fallbackChain, fillSlots, isExtraKey, resolveExtra } from './shared';
import type { Bundle, Engine, PlayOptions, Rendered, RenderedPart, RenderedSection, SectionView, UiKey } from './types';
import { createModelController } from './model';

const get = async (url: string) => {
  const r = await fetch(url);
  if (!r.ok) throw new Error(url);
  return JSON.parse(await r.text());
};

const FALLBACK_REGION: RegionConfig = {
  formatVersion: 1,
  code: 'CM',
  name: 'Cameroon',
  timezone: 'Africa/Douala',
  currency: { code: 'XAF', aliases: ['FCFA', 'F CFA', 'XAF'] },
  phone: { countryCode: '237', nationalPattern: '[62]\\d{8}' },
  languages: ['fr', 'en', 'wes', 'dua', 'ewo', 'fub'],
  officialSenders: [],
};

export async function createStandInEngine(base: string): Promise<Engine> {
  let region = FALLBACK_REGION;
  try {
    region = await get(`${base}regions/CM/region.json`);
  } catch {
    /* embedded fallback */
  }
  const manifests = new Map<LangTag, PackManifest>();
  const phrases = new Map<LangTag, PackPhrases>();
  const load = async (tag: LangTag) => {
    if (phrases.has(tag)) return;
    try {
      manifests.set(tag, await get(`${base}packs/${tag}/manifest.json`));
      phrases.set(tag, await get(`${base}packs/${tag}/phrases.json`));
    } catch {
      phrases.set(tag, {});
    }
  };
  let all: PackManifest[] | null = null;
  async function languages() {
    if (all) return all;
    await Promise.all(region.languages.map(load));
    all = region.languages.map((t) => manifests.get(t)).filter((m): m is PackManifest => !!m);
    return all;
  }
  const locale = (tag: LangTag) => {
    const m = manifests.get(tag);
    const v = m?.voice;
    return v && v.kind === 'tts' ? v.bcp47 : tag;
  };
  const bcpFor = (tag: LangTag) => locale(tag);

  async function renderCatalog(key: PhraseKey, lang: LangTag, slots?: Record<string, SlotValue>): Promise<Rendered> {
    await languages();
    const chain = [lang, ...fallbackChain(manifests, lang)];
    for (const tag of chain) {
      await load(tag);
      const entry = phrases.get(tag)?.[key];
      const text = entry?.text ?? (tag === 'en' ? CATALOG[key].en : undefined);
      if (text) {
        const out = text.replace(/\{(\w+)\}/g, (_m, k: string) => fmtSlot(slots?.[k], tag));
        return { text: out, parts: [{ kind: 'tts', text: out, bcp47: bcpFor(tag) }], lang: tag };
      }
    }
    const t = CATALOG[key].en;
    return { text: t, parts: [{ kind: 'tts', text: t, bcp47: 'en-GB' }], lang: 'en' };
  }

  function fmtSlot(v: SlotValue | undefined, tag: LangTag): string {
    if (!v) return '';
    const loc = locale(tag);
    switch (v.type) {
      case 'number': return String(v.value);
      case 'money': return new Intl.NumberFormat(loc, { style: 'currency', currency: v.value.currency, maximumFractionDigits: 0 }).format(v.value.amount);
      case 'date': return new Intl.DateTimeFormat(loc, { weekday: 'long', day: 'numeric', month: 'long', timeZone: 'UTC' }).format(new Date(v.value + 'T00:00:00Z'));
      case 'phone': return v.value.replace(/^\+237/, '').replace(/(\d)(?=(\d{2})+$)/g, '$1 ');
      case 'sender': return v.fallbackText ?? '';
      case 'text': return v.value;
    }
  }

  async function phrase(key: UiKey, lang: LangTag, slots?: Record<string, string>): Promise<Rendered> {
    await languages();
    if (isExtraKey(key)) {
      const chain = fallbackChain(manifests, lang);
      const r = resolveExtra(key, lang, chain);
      const text = fillSlots(r.text, slots);
      return { text, parts: [{ kind: 'tts', text, bcp47: bcpFor(r.lang) }], lang: r.lang };
    }
    const s: Record<string, SlotValue> = {};
    for (const [k, v] of Object.entries(slots ?? {})) s[k] = { type: 'text', value: v, lang: 'unknown' };
    return renderCatalog(key, lang, s);
  }

  async function bundle(lang: LangTag): Promise<Bundle> {
    const out = {} as Bundle;
    await Promise.all(
      BUNDLE_KEYS.map(async (k) => {
        if (!isExtraKey(k) && (CATALOG[k] as { slots?: readonly string[] }).slots?.length) return;
        const r = await phrase(k, lang);
        out[k] = { text: r.text, lang: r.lang };
      }),
    );
    return out;
  }

  /* ---------- very small rules classifier + fact extraction ---------- */
  const MONTHS: Record<string, number> = { janvier: 1, février: 2, fevrier: 2, mars: 3, avril: 4, mai: 5, juin: 6, juillet: 7, août: 8, aout: 8, septembre: 9, octobre: 10, novembre: 11, décembre: 12, decembre: 12, january: 1, february: 2, march: 3, april: 4, may: 5, june: 6, july: 7, august: 8, september: 9, october: 10, november: 11, december: 12 };
  const fact = <T,>(value: T, m: RegExpExecArray): Fact<T> => ({ value, span: { start: m.index, end: m.index + m[0].length }, raw: m[0] });
  function extract(text: string): Facts {
    const dates: Fact<IsoDate>[] = [];
    let m: RegExpExecArray | null;
    const r1 = /(\d{1,2})\s+(janvier|février|fevrier|mars|avril|mai|juin|juillet|août|aout|septembre|octobre|novembre|décembre|decembre)\s+(\d{4})/gi;
    while ((m = r1.exec(text))) dates.push(fact(`${m[3]}-${String(MONTHS[m[2]!.toLowerCase()]).padStart(2, '0')}-${m[1]!.padStart(2, '0')}`, m));
    const r2 = /(\d{1,2})\/(\d{1,2})\/(\d{4})/g;
    while ((m = r2.exec(text))) dates.push(fact(`${m[3]}-${m[2]!.padStart(2, '0')}-${m[1]!.padStart(2, '0')}`, m));
    const amounts: Facts['amounts'] = [];
    const r3 = /(\d{1,3}(?:[  .]\d{3})+|\d+)\s*(?:FCFA|F CFA|XAF)/gi;
    while ((m = r3.exec(text))) amounts.push(fact({ amount: Number(m[1]!.replace(/\D/g, '')), currency: region.currency.code }, m));
    const phones: Fact<string>[] = [];
    const r4 = /\b([62]\d{2}[ .]?\d{2}[ .]?\d{2}[ .]?\d{2})\b/g;
    while ((m = r4.exec(text))) phones.push(fact('+237' + m[1]!.replace(/\D/g, ''), m));
    const references: Fact<string>[] = [];
    const r5 = /N°\s*([\d ]{6,})/g;
    while ((m = r5.exec(text))) references.push(fact(m[1]!.trim(), m));
    const urls: Fact<string>[] = [];
    const r6 = /https?:\/\/\S+/g;
    while ((m = r6.exec(text))) urls.push(fact(m[0], m));
    return { lang: /\b(vous|votre|le|la|les|de)\b/i.test(text) ? 'fr' : 'en', dates, amounts, phones, references, urls, ussdCodes: [] };
  }
  const has = (t: string, re: RegExp) => re.test(t.toLowerCase());
  const rules: Classifier = {
    id: 'rules@1',
    async classify(input, facts): Promise<Understanding> {
      const t = input.text;
      const kind = has(t, /eneo|électricité|electricity/) ? 'electricity_bill' : has(t, /camwater|eau|water/) ? 'water_bill' : has(t, /momo|mobile money|transfert|gagné|pin|reçu .*fcfa|code secret/) ? 'mobile_money' : has(t, /hôpital|rendez-vous|consultation|hospital/) ? 'health' : has(t, /scolarit|lycée|école|school/) ? 'school' : 'other';
      const action = has(t, /payer|réglez|paiement|frais|pay/) ? 'pay' : has(t, /apportez|bring/) ? 'bring_document' : kind === 'health' ? 'go_to_place' : 'unclear';
      const urgent = has(t, /coupure|suspension|immédiatement|10 minutes|vite/);
      return { kind, action, urgency: urgent ? 'urgent' : facts.dates.length ? 'soon' : 'info', confidence: kind === 'other' ? 0.3 : 0.82, producedBy: 'rules@1' };
    },
  };
  const model = createModelController(rules, base);

  function scam(input: MessageInput, facts: Facts): Card['scam'] {
    const t = input.text.toLowerCase();
    const signals: ScamSignal[] = [];
    if (/pin|code secret/.test(t)) signals.push('asks_pin');
    if (/par erreur|une erreur|renvoy/.test(t)) signals.push('wrong_transfer');
    if (/gagné|félicitations/.test(t)) signals.push('prize_fee');
    if (facts.urls.length) signals.push('link');
    if (/immédiatement|10 minutes|vite/.test(t) && signals.length) signals.push('time_pressure');
    return { level: signals.length >= 2 ? 'likely_scam' : signals.length ? 'caution' : 'no_signs', signals };
  }

  async function analyze(input: MessageInput): Promise<Card> {
    const facts = extract(input.text);
    const understanding = await model.classifier().classify(input, facts);
    const sc = scam(input, facts);
    const named = input.sender?.kind === 'name' ? input.sender.value : undefined;
    const card: Card = {
      id: crypto.randomUUID(),
      createdAt: new Date().toISOString(),
      input, facts,
      sender: { displayName: named, verified: false },
      understanding, scam: sc,
      deadline: facts.dates[0],
      amount: facts.amounts[0],
      contactPhone: sc.level === 'likely_scam' ? undefined : facts.phones[0],
      reference: facts.references[0],
      mode: understanding.confidence < 0.5 ? 'facts_only' : 'full',
      degradedReason: understanding.confidence < 0.5 ? 'low_confidence' : undefined,
    };
    return card;
  }

  function plan(card: Card): SpeechPlan {
    const S: SpeechPlan['sections'] = [];
    const add = (section: CardSection, utterances: Utterance[]) => S.push({ section, utterances });
    if (card.scam.level !== 'no_signs') {
      const u: Utterance[] = [{ key: card.scam.level === 'likely_scam' ? 'scam.likely' : 'scam.caution' }];
      for (const s of card.scam.signals) u.push({ key: `scam.signal.${s}` as PhraseKey });
      if (card.scam.signals.some((s) => s === 'wrong_transfer' || s === 'asks_pin' || s === 'prize_fee')) u.push({ key: 'scam.check_balance' });
      add('scam', u);
    }
    const name = card.sender.displayName ?? card.input.sender?.value;
    if (card.mode === 'facts_only') add('about', [{ key: 'facts_only.intro' }]);
    add('sender', name ? [{ key: card.sender.verified ? 'sender.known' : 'sender.claimed', slots: { sender: { type: 'sender', fallbackText: name } } }] : [{ key: 'sender.unknown' }]);
    if (card.mode === 'full') {
      add('about', [{ key: `about.${card.understanding.kind}` as PhraseKey }]);
      add('action', [{ key: `action.${card.understanding.action}` as PhraseKey }]);
    }
    if (card.deadline) add('deadline', [{ key: 'deadline.by', slots: { date: { type: 'date', value: card.deadline.value } } }]);
    else if (card.mode === 'full') add('deadline', [{ key: 'deadline.none' }]);
    if (card.amount) add('money', [{ key: 'money.amount', slots: { amount: { type: 'money', value: card.amount.value } } }]);
    else if (card.mode === 'full') add('money', [{ key: 'money.none' }]);
    add('help', card.contactPhone ? [{ key: 'help.call', slots: { phone: { type: 'phone', value: card.contactPhone.value } } }] : [{ key: 'help.none' }]);
    if (card.mode === 'full') add('urgency', [{ key: `urgency.${card.understanding.urgency}` as PhraseKey }]);
    return { sections: S };
  }

  async function renderCard(card: Card, lang: LangTag): Promise<SectionView[]> {
    const out: SectionView[] = [];
    for (const s of plan(card).sections) {
      const parts: RenderedPart[] = [];
      const texts: string[] = [];
      const lines: SectionView['lines'] = [];
      let used = lang;
      for (const u of s.utterances) {
        const r = await renderCatalog(u.key, lang, u.slots);
        parts.push(...r.parts);
        texts.push(r.text);
        lines.push({ key: u.key, text: r.text, lang: r.lang });
        used = r.lang;
      }
      out.push({ section: s.section, text: texts.join(' '), parts, lang: used, lines });
    }
    return out;
  }

  /* ---------- speech: browser speechSynthesis ---------- */
  let playing = false;
  let token = 0;
  function speakParts(parts: RenderedPart[], rate: number, onProgress: (f: number) => void): Promise<void> {
    const tts = parts.filter((p): p is Extract<RenderedPart, { kind: 'tts' }> => p.kind === 'tts');
    const text = tts.map((p) => p.text).join(' ');
    return new Promise((resolve) => {
      const synth = window.speechSynthesis;
      if (!synth) {
        const ms = Math.max(1200, text.length * 55 / rate);
        const t0 = performance.now();
        const id = setInterval(() => {
          const f = Math.min(1, (performance.now() - t0) / ms);
          onProgress(f);
          if (f >= 1) { clearInterval(id); resolve(); }
        }, 80);
        return;
      }
      const u = new SpeechSynthesisUtterance(text);
      u.lang = tts[0]?.bcp47 ?? 'fr-FR';
      u.rate = rate;
      u.onboundary = (e) => onProgress(Math.min(1, e.charIndex / Math.max(1, text.length)));
      u.onend = () => resolve();
      u.onerror = () => resolve();
      synth.speak(u);
    });
  }
  const api: Engine = {
    region,
    source: 'stand-in',
    languages,
    bundle,
    phrase,
    analyze,
    renderCard,
    playSections(sections: RenderedSection[], opts: PlayOptions) {
      api.stop();
      const my = ++token;
      playing = true;
      void (async () => {
        for (let i = opts.from ?? 0; i < sections.length; i++) {
          if (my !== token) return;
          opts.onSection?.(i);
          await speakParts(sections[i]!.parts, opts.rate, (f) => opts.onProgress?.(i, f));
          if (my !== token) return;
          opts.onProgress?.(i, 1);
        }
        playing = false;
        opts.onSection?.(null);
      })();
    },
    speak(r: Rendered, rate = 1) {
      api.stop();
      void speakParts(r.parts, rate, () => {});
    },
    stop() {
      token++;
      playing = false;
      try { window.speechSynthesis?.cancel(); } catch { /* ignore */ }
    },
    get playing() { return playing; },
    model,
    classifier: () => model.classifier(),
  };
  void EXTRA; void EXTRA_KEYS; void PHRASE_KEYS; void (null as unknown as LanguagePack);
  return api;
}
