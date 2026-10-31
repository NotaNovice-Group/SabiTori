import { ChevronRight } from 'lucide-react';
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
