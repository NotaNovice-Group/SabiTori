import { BookOpen, Ear } from 'lucide-react';
import { useApp } from '../app-context';
import { LanguageList } from '../components/LanguageList';
import { Screen } from '../components/Screen';
import { SpeakingButton } from '../components/SpeakingButton';
import { Mark } from '../components/Mark';
import { navigate } from '../lib/router';
import { session } from '../lib/session';

export function LanguageScreen() {
  const { t } = useApp();
  return (
    <Screen
      title={t('ui.welcome')}
      className="welcome"
      above={
        <div className="welcome-brand">
          <Mark size={56} />
          <span className="wordmark">SabiTori</span>
        </div>
      }
      dock={<SpeakingButton speakKey="app.next" variant="primary" label={t('app.next')} onAct={() => navigate('/mode')} />}
    >
      <LanguageList />
    </Screen>
  );
}

export function ModeScreen() {
  const { t, setSettings } = useApp();
  const choose = (listenFirst: boolean) => {
    setSettings({ listenFirst, onboarded: true });
    // A message shared into the app before it was set up opens now.
    navigate(session.takeResume() ?? '/', { replace: true });
  };
  return (
    <Screen title={t('app.mode.title')} back={() => navigate('/welcome')} noHome className="mode">
      <div className="choices">
        <SpeakingButton speakKey="app.mode.listen" variant="hero" className="choice" icon={<Ear size={32} strokeWidth={2} aria-hidden />} label={<span className="choice-text"><b>{t('app.mode.listen')}</b><small>{t('app.mode.listen_hint')}</small></span>} onAct={() => choose(true)} />
        <SpeakingButton speakKey="app.mode.read" variant="hero" className="choice choice-alt" icon={<BookOpen size={32} strokeWidth={2} aria-hidden />} label={<span className="choice-text"><b>{t('app.mode.read')}</b><small>{t('app.mode.read_hint')}</small></span>} onAct={() => choose(false)} />
      </div>
    </Screen>
  );
}
