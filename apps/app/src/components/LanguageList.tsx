import { Check, Play } from 'lucide-react';
import type { PackManifest } from '@sabitori/core';
import { useApp } from '../app-context';

function frenchName(tag: string): string | undefined {
  try {
    const n = new Intl.DisplayNames(['fr'], { type: 'language' }).of(tag);
    return n && n.toLowerCase() !== tag.toLowerCase() ? n : undefined;
  } catch {
    return undefined;
  }
}

/** Languages the region offers: autonym large, names small, honest note while a voice is still being recorded. */
export function LanguageList({ onPick }: { onPick?: (tag: string) => void }) {
  const { languages, settings, setSettings, say, t, manifest } = useApp();
  const pick = (m: PackManifest) => {
    setSettings({ lang: m.tag });
    say('ui.welcome', undefined, m.tag);
    onPick?.(m.tag);
  };
  return (
    <ul className="langs" role="radiogroup" aria-label={t('ui.language')}>
      {languages.map((m) => {
        const chosen = settings.lang === m.tag;
        const soon = m.status === 'in_recording' || m.status === 'planned';
        const meanwhile = soon ? manifest(m.fallback[0] ?? 'fr')?.autonym : undefined;
        const fr = frenchName(m.tag);
        const names = [m.name, fr && fr !== m.name ? fr : undefined].filter(Boolean).join(' · ');
        return (
          <li key={m.tag} className="lang" data-chosen={chosen || undefined}>
            <button type="button" className="lang-pick" role="radio" aria-checked={chosen} onClick={() => pick(m)} lang={m.tag}>
              <span className="lang-head">
                <span className="lang-autonym">{m.autonym}</span>
                <span className="lang-check" aria-hidden>{chosen && <Check size={28} strokeWidth={2.5} />}</span>
              </span>
              <span className="lang-names">{names}</span>
              {soon && <span className="lang-note">{t('app.lang.soon', { name: meanwhile ?? 'Français' })}</span>}
            </button>
            <button type="button" className="btn btn-round lang-play" aria-label={`${t('ui.listen')}: ${m.autonym}`} onClick={() => say('ui.welcome', undefined, m.tag)}>
              <span className="round-ic"><Play size={24} strokeWidth={2} aria-hidden /></span>
            </button>
          </li>
        );
      })}
    </ul>
  );
}
