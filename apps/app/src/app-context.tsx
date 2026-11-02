import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { CATALOG, type LangTag, type PackManifest } from '@sabitori/core';
import { EXTRA, isExtraKey, type Bundle, type Engine, type ExtraKey, type UiKey } from './engine';
import { fillSlots } from './engine/shared';
import { loadSettings, saveSettings, SPEEDS, type Settings } from './lib/settings';
import { applyRetention, putCard, type StoredCard } from './lib/db';
import { session } from './lib/session';
import { setUpdateLanguages } from './lib/updates';
import { fallbackChain } from './engine/shared';
import { config } from './config';

interface Ctx {
  engine: Engine;
  settings: Settings;
  setSettings(patch: Partial<Settings>): void;
  languages: PackManifest[];
  manifest(tag: LangTag): PackManifest | undefined;
  t(key: UiKey, slots?: Record<string, string>): string;
  /** Language the string was really rendered in (fallback chain). */
  tLang(key: UiKey): LangTag;
  /** Speak an interface string (a button name, a prompt). */
  say(key: UiKey, slots?: Record<string, string>, lang?: LangTag): void;
  locale: string;
  /** Language the interface is really rendered in (the chosen one, or the fallback it uses). */
  uiLang: LangTag;
  /** For each offered language, the language its words are really spoken in today. */
  spokenIn: Record<LangTag, LangTag>;
  rate: number;
  history: StoredCard[];
  refreshHistory(): Promise<void>;
  /** Keeps the card for this session and, if history is on, on the phone. False when it could not be stored. */
  saveCard(card: StoredCard): Promise<boolean>;
}

/** How long saving to history may take before the card is shown anyway (storage that never answers). */
export const SAVE_TIMEOUT_MS = 3000;

export function within<T>(p: Promise<T>, ms: number, fallback: T): Promise<T> {
  let id: ReturnType<typeof setTimeout> | undefined;
  return Promise.race([p.catch(() => fallback), new Promise<T>((r) => { id = setTimeout(() => r(fallback), ms); })]).finally(() => clearTimeout(id));
}

const AppCtx = createContext<Ctx | null>(null);

export function useApp(): Ctx {
  const c = useContext(AppCtx);
  if (!c) throw new Error('AppProvider missing');
  return c;
}

export function useT() {
  const { t } = useApp();
  return t;
}

function englishFallback(key: UiKey): string {
  return isExtraKey(key) ? EXTRA[key as ExtraKey].en : (CATALOG as Record<string, { en: string }>)[key]?.en ?? key;
}

export function pickInitialLanguage(offered: string[], navLang: string | undefined, fallback: string): string {
  const base = (navLang ?? '').toLowerCase().split('-')[0] ?? '';
  return offered.includes(base) ? base : offered.includes(fallback) ? fallback : (offered[0] ?? fallback);
}

export function AppProvider({ engine, children }: { engine: Engine; children: ReactNode }) {
  const [settings, setSettingsState] = useState<Settings>(() => {
    const s = loadSettings();
    if (!s.onboarded) s.lang = pickInitialLanguage(engine.region.languages, navigator.language, 'fr');
    return s;
  });
  const [languages, setLanguages] = useState<PackManifest[]>([]);
  const [bundle, setBundle] = useState<Bundle | null>(null);
  const [bundleLang, setBundleLang] = useState<LangTag>('');
  const [history, setHistory] = useState<StoredCard[]>([]);
  const [spokenIn, setSpokenIn] = useState<Record<LangTag, LangTag>>({});
  const cache = useRef(new Map<LangTag, Bundle>());

  useEffect(() => {
    let live = true;
    void engine.languages().then(async (ls) => {
      if (!live) return;
      setLanguages(ls);
      // What each language is really spoken in: the language the engine renders its words in.
      const pairs = await Promise.all(ls.map(async (m) => [m.tag, (await engine.phrase('ui.welcome', m.tag).catch(() => null))?.lang ?? m.tag] as const));
      if (live) setSpokenIn(Object.fromEntries(pairs));
    });
    return () => { live = false; };
  }, [engine]);

  useEffect(() => {
    let live = true;
    const lang = settings.lang;
    const hit = cache.current.get(lang);
    const apply = (b: Bundle) => {
      if (!live) return;
      setBundle(b);
      setBundleLang(lang);
    };
    if (hit) apply(hit);
    else
      void engine.bundle(lang).then((b) => {
        cache.current.set(lang, b);
        apply(b);
      });
    return () => {
      live = false;
    };
  }, [engine, settings.lang]);

  // <html lang> is the language the screen is really in (a pack without its own words shows its fallback).
  const uiLang = (bundleLang === settings.lang ? bundle?.['ui.welcome']?.lang : undefined) ?? settings.lang;
  useEffect(() => {
    document.documentElement.lang = uiLang;
  }, [uiLang]);

  const refreshHistory = useCallback(async () => {
    setHistory(await applyRetention(settings.retention));
  }, [settings.retention]);

  useEffect(() => {
    void refreshHistory();
  }, [refreshHistory]);

  const setSettings = useCallback((patch: Partial<Settings>) => {
    setSettingsState((prev) => {
      const next = { ...prev, ...patch };
      saveSettings(next);
      return next;
    });
  }, []);

  const manifest = useCallback((tag: LangTag) => languages.find((m) => m.tag === tag), [languages]);

  // Updates download the files of the chosen language and of every language it falls back to, nothing else.
  useEffect(() => {
    if (!config.updates || languages.length === 0) return;
    setUpdateLanguages([settings.lang, ...fallbackChain(new Map(languages.map((m) => [m.tag, m] as const)), settings.lang)]);
  }, [languages, settings.lang]);

  const t = useCallback(
    (key: UiKey, slots?: Record<string, string>) => fillSlots(bundle?.[key]?.text ?? englishFallback(key), slots),
    [bundle],
  );
  const tLang = useCallback((key: UiKey) => bundle?.[key]?.lang ?? 'en', [bundle]);

  const rate = SPEEDS[settings.speed] ?? 1;
  const say = useCallback(
    (key: UiKey, slots?: Record<string, string>, lang?: LangTag) => {
      void engine.phrase(key, lang ?? settings.lang, slots).then((r) => engine.speak(r, rate));
    },
    [engine, settings.lang, rate],
  );

  const saveCard = useCallback(
    async (card: StoredCard): Promise<boolean> => {
      session.putCard(card);
      if (settings.retention <= 0 && !card.keepUntil) return true;
      const ok = await within(putCard(card), SAVE_TIMEOUT_MS, false);
      void refreshHistory();
      return ok;
    },
    [settings.retention, refreshHistory],
  );

  const locale = useMemo(() => {
    const m = languages.find((l) => l.tag === settings.lang);
    const v = m?.voice;
    const bcp = v && v.kind === 'tts' ? v.bcp47 : settings.lang;
    try {
      return Intl.DateTimeFormat.supportedLocalesOf([bcp]).length ? bcp : 'fr';
    } catch {
      return 'fr';
    }
  }, [languages, settings.lang]);

  const ready = bundle !== null && bundleLang === settings.lang && languages.length > 0;
  const value: Ctx = {
    engine, settings, setSettings, languages, manifest, t, tLang, say, locale, uiLang, spokenIn, rate, history, refreshHistory, saveCard,
  };
  if (!bundle || languages.length === 0) return null;
  void ready;
  return <AppCtx.Provider value={value}>{children}</AppCtx.Provider>;
}
