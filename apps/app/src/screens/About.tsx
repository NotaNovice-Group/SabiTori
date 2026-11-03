import { useApp } from '../app-context';
import { Screen } from '../components/Screen';
import { navigate } from '../lib/router';
import { Markdown, inline, voiceCredit } from '../lib/markdown';
// Bundled with the app (no network): the third-party notices and every pack's voice card.
import notices from '../../../../THIRD_PARTY_NOTICES.md?raw';
import fontLicence from '../fonts/Andika-OFL.txt?raw';

const voiceCards = import.meta.glob('../../../../packs/*/voice/VOICE.md', { query: '?raw', import: 'default', eager: true }) as Record<string, string>;

export const VOICE_CREDITS = Object.entries(voiceCards)
  .sort(([a], [b]) => a.localeCompare(b))
  .map(([path, md]) => ({ tag: /packs\/([^/]+)\/voice/.exec(path)?.[1] ?? '', ...voiceCredit(md) }))
  .filter((v) => v.title);

/** "About and open licences": who made the voices (CC BY needs the credit shown) and every third-party licence. */
export default function AboutScreen() {
  const { t } = useApp();
  return (
    <Screen title={t('app.settings.about')} back={() => navigate('/settings')} className="about">
      <p>{t('app.about.intro')}</p>
      <section aria-labelledby="a-voices" className="panel">
        <h2 id="a-voices" className="panel-title">{t('app.about.voices')}</h2>
        <ul className="md-table">
          {VOICE_CREDITS.map((v) => (
            <li key={v.tag} lang="en">
              <p className="md-row-head">{v.title}</p>
              {v.attribution && <p>{inline(v.attribution)}</p>}
              {v.licence && <p><span className="md-k">Licence: </span>{inline(v.licence)}</p>}
            </li>
          ))}
        </ul>
      </section>
      <section aria-labelledby="a-notices" className="panel">
        <h2 id="a-notices" className="panel-title">{t('app.about.notices')}</h2>
        {/* The notices are written in English (licence texts are not translated). */}
        <div lang="en"><Markdown src={notices.replace(/^# .*\n/, '')} baseLevel={3} /></div>
      </section>
      <section aria-labelledby="a-font" className="panel" lang="en">
        <h2 id="a-font" className="panel-title">Andika 7.000, SIL Open Font License 1.1</h2>
        <Markdown src={fontLicence} baseLevel={3} />
      </section>
    </Screen>
  );
}
