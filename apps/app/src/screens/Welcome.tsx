import { BookOpen, Ear } from 'lucide-react';
import { useApp } from '../app-context';
import { LanguageList } from '../components/LanguageList';
import { Screen } from '../components/Screen';
import { SpeakingButton } from '../components/SpeakingButton';
import { Wordmark } from '../components/Mark';
import { navigate } from '../lib/router';

export function LanguageScreen() {
  const { t } = useApp();
  return (
    <Screen
      title={t('ui.welcome')}
      className="welcome"
      dock={<SpeakingButton speakKey="app.next" variant="primary" label={t('app.next')} onAct={() => navigate('/mode')} />}
    >
      <div className="welcome-brand"><Wordmark /></div>
      <LanguageList />
    </Screen>
  );
}

export function ModeScreen() {
  const { t, setSettings } = useApp();
  const choose = (listenFirst: boolean) => {
    setSettings({ listenFirst, onboarded: true });
    navigate('/', { replace: true });
  };
  return (
    <Screen title={t('app.mode.title')} back={() => navigate('/welcome')} className="mode">
      <div className="choices">
        <SpeakingButton speakKey="app.mode.listen" variant="hero" className="choice" icon={<Ear size={32} strokeWidth={2} aria-hidden />} label={<span className="choice-text"><b>{t('app.mode.listen')}</b><small>{t('app.mode.listen_hint')}</small></span>} onAct={() => choose(true)} />
        <SpeakingButton speakKey="app.mode.read" variant="hero" className="choice choice-alt" icon={<BookOpen size={32} strokeWidth={2} aria-hidden />} label={<span className="choice-text"><b>{t('app.mode.read')}</b><small>{t('app.mode.read_hint')}</small></span>} onAct={() => choose(false)} />
      </div>
    </Screen>
  );
}
