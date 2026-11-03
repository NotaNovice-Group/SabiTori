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
  const { languages, settings, setSettings, say, t, manifest, spokenIn } = useApp();
  const pick = (m: PackManifest) => {
    setSettings({ lang: m.tag });
    say('ui.welcome', undefined, m.tag);
    onPick?.(m.tag);
  };
  return (
    <div role="radiogroup" aria-label={t('ui.language')}>
    <ul className="langs">
      {languages.map((m) => {
        const chosen = settings.lang === m.tag;
        // The note names the language the engine really speaks for this one (its fallback chain, as rendered),
        // not the first fallback the manifest lists, which may itself not be ready.
        const spoken = spokenIn[m.tag];
        const fellBack = !!spoken && spoken !== m.tag;
        const soon = m.status === 'in_recording' || m.status === 'planned' || fellBack;
        const meanwhile = fellBack ? manifest(spoken)?.autonym : undefined;
        const fr = frenchName(m.tag);
        return (
          <li key={m.tag} className="lang" data-chosen={chosen || undefined}>
            <button type="button" className="lang-pick" role="radio" aria-checked={chosen} onClick={() => pick(m)}>
              <span className="lang-head">
                <span className="lang-autonym" lang={m.tag}>{m.autonym}</span>
                <span className="lang-check" aria-hidden>{chosen && <Check size={28} strokeWidth={2.5} />}</span>
              </span>
              <span className="lang-names">
                <span lang="en">{m.name}</span>
                {fr && fr !== m.name && <> · <span lang="fr">{fr}</span></>}
              </span>
              {soon && (meanwhile ? <span className="lang-note">{t('app.lang.soon', { name: meanwhile })}</span> : <span className="lang-note">{t('app.lang.soon_plain')}</span>)}
            </button>
            <button type="button" className="btn btn-round lang-play" aria-label={`${t('ui.listen')}: ${m.autonym}`} onClick={() => say('ui.welcome', undefined, m.tag)}>
              <span className="round-ic"><Play size={24} strokeWidth={2} aria-hidden /></span>
            </button>
          </li>
        );
      })}
    </ul>
    </div>
  );
}
