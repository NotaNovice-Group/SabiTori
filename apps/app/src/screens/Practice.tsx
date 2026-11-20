import { ChevronRight, Zap, Droplets, Smartphone, Gift, HeartPulse, GraduationCap, FileText, type LucideIcon } from 'lucide-react';

/** A picture for each example, so it can be chosen without reading (the prize one stays neutral: it is the lesson). */
const EXAMPLE_ICON: Record<string, LucideIcon> = { eneo: Zap, camwater: Droplets, momo: Smartphone, prize: Gift, hospital: HeartPulse, school: GraduationCap };
import { useApp } from '../app-context';
import { Screen } from '../components/Screen';
import { EXAMPLES } from '../lib/examples';
import { navigate } from '../lib/router';

export function PracticeScreen() {
  const { t } = useApp();
  return (
    <Screen title={t('app.practice.title')} back={() => navigate('/')}>
      <ul className="rows">
        {EXAMPLES.map((e) => (
          <li key={e.id}>
            <a className="row row-plain" href={`#/example/${e.id}`}>
              {(() => { const I = EXAMPLE_ICON[e.id] ?? FileText; return <I className="row-ic" size={28} strokeWidth={2} aria-hidden />; })()}
              <span className="row-name">{t(e.titleKey)}</span>
              <ChevronRight size={24} strokeWidth={2} aria-hidden />
            </a>
          </li>
        ))}
      </ul>
      <p className="note">{t('app.practice.hint')}</p>
    </Screen>
  );
}
