/**
 * The adapter: the only module that touches @sabitori/core, @sabitori/speech and
 * @sabitori/understand. It loads the region, the reading lexicons and the packs,
 * and exposes analyze / plan / render / play to the UI as one small Engine.
 *
 *   core.analyze(input, { region, lexicons, classifier })      -> Engine.analyze
 *   core.buildSpeechPlan(card, { today })                      -> Engine.renderCard (step 1)
 *   speech.renderPlan(plan, lang, registry, { region, today }) -> Engine.renderCard (step 2)
 *   speech.renderPhrase(key, slots, lang, registry, ctx)       -> Engine.phrase / bundle / speak
 *   speech.createBrowserPlayer()                               -> Engine.playSections / stop
 *   understand.createEncoderClassifier (built in, default)       -> Engine.analyze, Engine.understanding (engine/encoder.ts)
 *   understand.createLlmClassifier / modelStore                -> Engine.model (engine/model.ts), the optional deeper path
 */
import {
  CATALOG, PHRASE_KEYS, analyze, buildSpeechPlan, createRulesClassifier, extractFacts,
  type Card, type Classifier, type LangTag, type MessageInput, type PackManifest, type PhraseKey,
  type ReadingLexicon, type RegionConfig, type SlotValue,
} from '@sabitori/core';
import { createAppPlayer } from './native-player';
import { createBrowserPlayer, createPackRegistry, renderPhrase, renderPlan, type PackRegistry } from '@sabitori/speech';
import { EXTRA, EXTRA_KEYS, isExtraKey } from './extra';
import { BUNDLE_KEYS, fallbackChain, fillSlots, resolveExtra } from './shared';
import { createModelController } from './model';
import { createEncoderController } from './encoder';
import { todayIso } from '../lib/format';
import type { Bundle, Engine, PlayOptions, Rendered, RenderedSection, SectionView, UiKey } from './types';

export interface EngineDeps {
  region: RegionConfig;
  registry: PackRegistry;
  lexicons: ReadingLexicon[];
  /** Base URL of the app, for the wllama wasm. */
  baseUrl: string;
  /** Override for tests (the browser player needs speechSynthesis). */
  player?: { play(s: RenderedSection[], o: PlayOptions): void; stop(): void; readonly playing: boolean };
  today?: () => string;
}

type FetchFn = (url: string) => Promise<Response>;

async function getJson(url: string, doFetch: FetchFn = (u) => fetch(u)): Promise<unknown> {
  const res = await doFetch(url);
  if (!res.ok) throw new Error(`${url}: HTTP ${res.status}`);
  // A dev server answers unknown paths with index.html: that is "not found", not JSON.
  return JSON.parse(await res.text());
}

/**
 * Load region, packs index and reading lexicons from the app's own origin.
 * `assets` (only when the optional update channel is configured) serves downloaded, verified
 * files first and the bundled ones otherwise: packs, region.json, reading.json, audio clips.
 */
export async function createEngine(
  baseUrl: string,
  regionCode: string,
  assets?: { fetch: FetchFn; resolveClip: (url: string) => Promise<string | null> } | null,
): Promise<Engine> {
  const f = assets?.fetch;
  const loadRegion = async (code: string) => {
    const r = await getJson(`${baseUrl}regions/${code}/region.json`, f);
    if (!isRegionConfig(r)) throw new Error(`regions/${code}/region.json is not a region`);
    return r;
  };
  let region: RegionConfig;
  try {
    region = await loadRegion(regionCode);
  } catch {
    region = await loadRegion('CM');
  }
  const registry = createPackRegistry({ baseUrl: `${baseUrl}packs`, ...(f ? { fetch: f } : {}) });
  const manifests = await registry.list().catch(() => [] as PackManifest[]);
  // Without one language of the region the app has nothing to show: fail now, so the caller can retry
  // without downloaded files (or show the error screen), instead of a blank page.
  if (!manifests.some((m) => m && region.languages.includes(m.tag))) throw new Error('no language pack of the region could be loaded');
  const lexicons: ReadingLexicon[] = [];
  await Promise.all(
    manifests
      .filter((m) => m.reads)
      .map(async (m) => {
        try {
          const lx = (await getJson(`${baseUrl}packs/${m.tag}/reading.json`, f)) as ReadingLexicon;
          if (lx && lx.formatVersion === 1) lexicons.push(lx);
          else if (assets) throw new Error(`packs/${m.tag}/reading.json is not a reading lexicon`);
        } catch (e) {
          // With downloaded files a broken lexicon must not quietly switch reading off: let the caller retry.
          if (assets) throw e;
          /* this language cannot be read yet: rules use the others */
        }
      }),
  );
  const list = registry.manifests?.bind(registry);
  return createEngineFrom({ region, registry, lexicons, baseUrl, player: assets ? createAppPlayer(assets.resolveClip, (u) => getJson(u, assets.fetch), list) : createAppPlayer(undefined, undefined, list) });
}

function validRegex(src: string): boolean {
  try {
    new RegExp(src);
    return true;
  } catch {
    return false;
  }
}

/** Enough of a region for the app to run (a signed but malformed file must not get further). */
export function isRegionConfig(v: unknown): v is RegionConfig {
  const r = v as Partial<RegionConfig> | null;
  return (
    !!r && typeof r === 'object' &&
    typeof r.code === 'string' && !!r.code &&
    typeof r.timezone === 'string' &&
    Array.isArray(r.languages) && r.languages.length > 0 && r.languages.every((t) => typeof t === 'string') &&
    !!r.phone && typeof r.phone.countryCode === 'string' && typeof r.phone.nationalPattern === 'string' && validRegex(r.phone.nationalPattern) &&
    !!r.currency && typeof r.currency.code === 'string' && Array.isArray(r.currency.aliases) &&
    (r.officialSenders === undefined || Array.isArray(r.officialSenders))
  );
}

export function createEngineFrom(deps: EngineDeps): Engine {
  const { region, registry, lexicons } = deps;
  const today = () => deps.today?.() ?? todayIso(region.timezone);
  const ctx = () => ({ region, today: today() });
  const rules: Classifier = createRulesClassifier(region, lexicons);
  const model = createModelController(rules, deps.baseUrl);
  /** Default understanding: the built-in small neural model (rules until it has loaded). */
  const encoder = createEncoderController(rules, deps.baseUrl);
  const player = deps.player ?? createAppPlayer();

  let manifestsP: Promise<PackManifest[]> | null = null;
  const allManifests = () => (manifestsP ??= registry.list().catch(() => []));
  const manifestMap = async () => new Map((await allManifests()).map((m) => [m.tag, m] as const));

  /** First language in [tag, ...fallbacks] whose pack actually loads (a pack without rules.json cannot render). */
  const loadable = new Map<LangTag, Promise<LangTag>>();
  function renderLang(tag: LangTag): Promise<LangTag> {
    let p = loadable.get(tag);
    if (!p) {
      p = (async () => {
        const chain = [tag, ...fallbackChain(await manifestMap(), tag)];
        for (const t of chain) {
          try {
            // A pack without rules.json (noRules) cannot say numbers, dates or amounts yet: use the next one.
            if ((await registry.get(t) as { noRules?: boolean }).noRules) continue;
            return t;
          } catch {
            /* try the next */
          }
        }
        return tag;
      })();
      loadable.set(tag, p);
    }
    return p;
  }

  async function voiceOf(tag: LangTag): Promise<string> {
    const m = (await manifestMap()).get(tag);
    return m?.voice.kind === 'tts' ? m.voice.bcp47 : tag;
  }

  async function packText(tag: LangTag, key: string): Promise<string | undefined> {
    try {
      return (((await registry.get(tag)).phrases as Record<string, { text?: string }>)[key])?.text;
    } catch {
      return undefined;
    }
  }

  async function phrase(key: UiKey, lang: LangTag, slots?: Record<string, string>): Promise<Rendered> {
    if (isExtraKey(key)) {
      const chain = fallbackChain(await manifestMap(), lang);
      const own = new Map<LangTag, string>();
      for (const t of [lang, ...chain]) {
        const x = await packText(t, key);
        if (x) own.set(t, x);
      }
      const r = resolveExtra(key, lang, chain, (t) => own.get(t));
      const text = fillSlots(r.text, slots);
      return { text, parts: [{ kind: 'tts', text, bcp47: await voiceOf(r.lang) }], lang: r.lang };
    }
    const s: Record<string, SlotValue> = {};
    for (const [k, v] of Object.entries(slots ?? {})) s[k] = { type: 'text', value: v, lang: 'unknown' };
    try {
      return await renderPhrase(key, Object.keys(s).length ? s : undefined, await renderLang(lang), registry, ctx());
    } catch {
      const text = CATALOG[key].en;
      return { text, parts: [{ kind: 'tts', text, bcp47: 'en-GB' }], lang: 'en' };
    }
  }

  const bundles = new Map<LangTag, Promise<Bundle>>();
  function bundle(lang: LangTag): Promise<Bundle> {
    let p = bundles.get(lang);
    if (!p) {
      p = (async () => {
        const out = {} as Bundle;
        await Promise.all(
          BUNDLE_KEYS.map(async (k) => {
            if (!isExtraKey(k) && (CATALOG[k] as { slots?: readonly string[] }).slots?.length) return;
            const r = await phrase(k, lang);
            out[k] = { text: r.text, lang: r.lang };
          }),
        );
        return out;
      })();
      bundles.set(lang, p);
    }
    return p;
  }

  async function renderCard(card: Card, lang: LangTag): Promise<SectionView[]> {
    const t = today();
    const plan = buildSpeechPlan(card, { today: t });
    const use = await renderLang(lang);
    const sections = await renderPlan(plan, use, registry, ctx());
    const views: SectionView[] = [];
    for (let i = 0; i < sections.length; i++) {
      const lines: SectionView['lines'] = [];
      for (const u of plan.sections[i]!.utterances) {
        try {
          const r = await renderPhrase(u.key, u.slots, use, registry, ctx());
          lines.push({ key: u.key, text: r.text, lang: r.lang });
        } catch {
          /* the section text above still has it */
        }
      }
      // keep the requested language visible when we had to render in another one
      views.push({ ...sections[i]!, lang: sections[i]!.lang === use && use !== lang ? use : sections[i]!.lang, lines, utterances: plan.sections[i]!.utterances });
    }
    return views;
  }

  /** Render one section again in the next language of its fallback chain that was not tried yet. */
  async function fallbackSection(sec: RenderedSection, tried: Set<LangTag>): Promise<SectionView | null> {
    const utterances = (sec as SectionView).utterances;
    if (!utterances) return null;
    tried.add(sec.lang);
    for (const tag of fallbackChain(await manifestMap(), sec.lang)) {
      if (tried.has(tag)) continue;
      tried.add(tag);
      try {
        const [r] = await renderPlan({ sections: [{ section: sec.section, utterances }] }, tag, registry, ctx());
        if (!r || (r.lang !== tag && tried.has(r.lang))) continue;
        tried.add(r.lang);
        const lines: SectionView['lines'] = [];
        for (const u of utterances) {
          try {
            const x = await renderPhrase(u.key, u.slots, tag, registry, ctx());
            lines.push({ key: u.key, text: x.text, lang: x.lang });
          } catch {
            /* the section text still has it */
          }
        }
        return { ...r, lines, utterances };
      } catch {
        /* this language cannot render it either */
      }
    }
    return null;
  }

  /**
   * Plays sections. When a part fails (a missing clip, a voice error) the player aborts that
   * section; we render it again in the next fallback language and resume from it, so the
   * listener hears the whole sentence in one language, never half of one.
   */
  let swap = 0;
  function playSections(sections: RenderedSection[], opts: PlayOptions): void {
    const tried = new Map<number, Set<LangTag>>();
    let swapping = false;
    const mine: PlayOptions = {
      ...opts,
      onSection: (i) => {
        if (i === null && swapping) return;
        opts.onSection?.(i);
      },
      onError: (i, err) => {
        opts.onError?.(i, err);
        const me = ++swap;
        swapping = true;
        player.stop();
        swapping = false;
        const set = tried.get(i) ?? new Set<LangTag>();
        tried.set(i, set);
        void fallbackSection(sections[i]!, set).then((next) => {
          if (swap !== me) return;
          if (next) {
            sections = sections.slice();
            sections[i] = next;
            opts.onFallback?.(i, next);
            player.play(sections, { ...mine, from: i });
          } else if (i + 1 < sections.length) player.play(sections, { ...mine, from: i + 1 });
          else opts.onSection?.(null);
        });
      },
    };
    swap++;
    player.play(sections, mine);
  }

  return {
    region,
    source: 'packages',
    async languages() {
      const m = await manifestMap();
      const offered = region.languages.map((t) => m.get(t)).filter((x): x is PackManifest => !!x);
      return offered;
    },
    bundle,
    phrase,
    analyze: (input: MessageInput) => analyze(input, { region, lexicons, classifier: encoder.classifier }),
    async analyzeDeeper(input: MessageInput, timeoutMs: number) {
      const t0 = Date.now();
      const llm = await model.llm(timeoutMs);
      if (!llm) return null;
      const left = Math.max(1000, timeoutMs - (Date.now() - t0));
      let timer: ReturnType<typeof setTimeout> | undefined;
      const limit = new Promise<null>((res) => { timer = setTimeout(() => res(null), left); });
      try {
        return await Promise.race([analyze(input, { region, lexicons, classifier: llm }), limit]);
      } catch {
        return null;
      } finally {
        clearTimeout(timer);
      }
    },
    countFacts(text: string) {
      try {
        const f = extractFacts(text, { region, lexicons, receivedAt: today() });
        return f.dates.length + f.amounts.length + f.phones.length;
      } catch {
        return 0;
      }
    },
    renderCard,
    playSections,
    speak(r, rate = 1) {
      swap++;
      player.play([{ section: 'about', text: r.text, parts: r.parts, lang: r.lang }], { rate });
    },
    stop: () => {
      swap++;
      player.stop();
    },
    get playing() {
      return player.playing;
    },
    // The optional deeper LLM keeps its own controller; init also starts the built-in encoder (once, after first paint).
    model: { ...model, init: () => Promise.all([encoder.init(), model.init()]).then(() => undefined) },
    understanding: { state: encoder.state, subscribe: encoder.subscribe },
    classifier: () => encoder.classifier,
  };
}

void PHRASE_KEYS; void EXTRA; void EXTRA_KEYS;
export type { PhraseKey };
