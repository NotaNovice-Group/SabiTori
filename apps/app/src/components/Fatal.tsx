import { Component, useEffect, useRef, useState, type ErrorInfo, type ReactNode } from 'react';
import { RotateCcw, Trash2, Volume2, CircleAlert } from 'lucide-react';
import { EXTRA, type ExtraKey } from '../engine/extra';
import { loadSettings } from '../lib/settings';
import { config } from '../config';
import { crashReportingActive } from '../lib/crash';

/** Without an engine there are no packs: the error screen speaks French or English (the region's built-in pair). */
export function fatalLang(lang = loadSettings().lang): 'fr' | 'en' {
  return lang === 'en' ? 'en' : 'fr';
}

const VOICE: Record<'fr' | 'en', string> = { fr: 'fr-FR', en: 'en-GB' };

function speak(text: string, lang: 'fr' | 'en') {
  try {
    const s = window.speechSynthesis;
    if (!s) return;
    s.cancel();
    const u = new SpeechSynthesisUtterance(text);
    u.lang = VOICE[lang];
    s.speak(u);
  } catch {
    /* no voice on this phone */
  }
}

async function withTimeout<T>(p: Promise<T>, ms: number): Promise<T | undefined> {
  let id: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([p, new Promise<undefined>((r) => { id = setTimeout(() => r(undefined), ms); })]);
  } finally {
    clearTimeout(id);
  }
}

export interface FatalActions {
  restart(): void;
  /** Forget downloaded updates, then restart. Absent when the build has no update channel. */
  removeUpdates?: () => Promise<void>;
}

export function defaultFatalActions(): FatalActions {
  const restart = () => {
    try {
      location.replace(location.pathname + location.search + '#/');
    } catch {
      /* keep the current address */
    }
    location.reload();
  };
  return {
    restart,
    removeUpdates: config.updates
      ? async () => {
          try {
            const { clearUpdates } = await import('../lib/updates');
            await withTimeout(clearUpdates(), 8000);
          } catch {
            /* nothing could be removed: restarting still retries with the built-in files */
          }
          restart();
        }
      : undefined,
  };
}

/**
 * The calm screen shown when the app cannot continue (the engine did not start, or a screen threw).
 * It needs nothing but this file: no engine, no packs, no context. Every button has an icon and a word,
 * and "Listen" reads the explanation aloud with the phone's own voice.
 */
export function FatalScreen({ actions = defaultFatalActions(), lang = fatalLang() }: { actions?: FatalActions; lang?: 'fr' | 'en' }) {
  const t = (k: ExtraKey) => EXTRA[k][lang];
  const h1 = useRef<HTMLHeadingElement>(null);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    h1.current?.focus({ preventScroll: true });
    try {
      document.documentElement.lang = lang;
    } catch {
      /* no document */
    }
  }, [lang]);
  return (
    <main className="screen has-dock fatal" lang={lang}>
      <header className="topbar">
        <h1 ref={h1} tabIndex={-1} className="screen-title">{t('app.fatal.title')}</h1>
      </header>
      <div className="screen-body">
        <p className="fatal-body"><CircleAlert size={28} strokeWidth={2} aria-hidden /> <span>{t('app.fatal.body')}</span></p>
        <button type="button" className="btn btn-secondary" onClick={() => speak(`${t('app.fatal.title')}. ${t('app.fatal.body')}`, lang)}>
          <Volume2 size={24} strokeWidth={2} aria-hidden />
          <span className="btn-label">{t('app.fatal.listen')}</span>
        </button>
      </div>
      <div className="dock">
        <div className="dock-inner">
          <button type="button" className="btn btn-primary btn-block" disabled={busy} onClick={() => { setBusy(true); actions.restart(); }}>
            <RotateCcw size={24} strokeWidth={2} aria-hidden />
            <span className="btn-label">{t('app.fatal.restart')}</span>
          </button>
          {actions.removeUpdates && (
            <button type="button" className="btn btn-secondary btn-block" disabled={busy} onClick={() => { setBusy(true); void actions.removeUpdates!(); }}>
              <Trash2 size={24} strokeWidth={2} aria-hidden />
              <span className="btn-label">{t('app.fatal.remove_updates')}</span>
            </button>
          )}
        </div>
      </div>
    </main>
  );
}

/** Top-level boundary: a screen that throws while rendering shows FatalScreen instead of a blank page. */
export class ErrorBoundary extends Component<{ children: ReactNode; fallback?: ReactNode; onError?: (e: unknown) => void }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  componentDidCatch(error: unknown, _info: ErrorInfo) {
    this.props.onError?.(error);
    // Let the optional crash reporter (its global handlers) see it; it scrubs message text first.
    if (crashReportingActive())
      setTimeout(() => {
        throw error;
      });
  }
  render() {
    return this.state.failed ? (this.props.fallback ?? <FatalScreen />) : this.props.children;
  }
}
