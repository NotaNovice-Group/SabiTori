import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { CATALOG, type Card, type LangTag, type PackManifest } from '@sabitori/core';
import { EXTRA, isExtraKey, type Bundle, type Engine, type ExtraKey, type UiKey } from './engine';
import { fillSlots } from './engine/shared';
import { loadSettings, saveSettings, SPEEDS, type Settings } from './lib/settings';
import { applyRetention, putCard } from './lib/db';
import { session } from './lib/session';

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
  rate: number;
  history: Card[];
  refreshHistory(): Promise<void>;
  saveCard(card: Card): Promise<void>;
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
  const [history, setHistory] = useState<Card[]>([]);
  const cache = useRef(new Map<LangTag, Bundle>());

  useEffect(() => {
    void engine.languages().then(setLanguages);
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

  useEffect(() => {
    document.documentElement.lang = settings.lang;
  }, [settings.lang]);

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
    async (card: Card) => {
      session.putCard(card);
      if (settings.retention > 0) {
        await putCard(card);
        await refreshHistory();
      }
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
    engine, settings, setSettings, languages, manifest, t, tLang, say, locale, rate, history, refreshHistory, saveCard,
  };
  if (!bundle || languages.length === 0) return null;
  void ready;
  return <AppCtx.Provider value={value}>{children}</AppCtx.Provider>;
}
