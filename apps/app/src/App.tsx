import { useEffect, useState } from 'react';
import { AppProvider, useApp } from './app-context';
import { getEngine, type Engine } from './engine';
import { parseHash, useRoute } from './lib/router';
import { readShareTarget, session } from './lib/session';
import { LanguageScreen, ModeScreen } from './screens/Welcome';
import { HomeScreen } from './screens/Home';
import { PracticeScreen } from './screens/Practice';
import { PasteScreen } from './screens/Paste';
import { CaptureScreen } from './screens/Capture';
import { CardRoute } from './screens/Card';
import { ExampleRoute } from './screens/Example';
import { SettingsScreen } from './screens/Settings';
import { navigate } from './lib/router';

function Routes() {
  const { settings, engine } = useApp();
  const route = useRoute();
  const [head = '', arg = ''] = route.path;

  useEffect(() => {
    // Lazy: the optional understanding model never blocks first paint.
    const id = window.setTimeout(() => void engine.model.init(), 1200);
    return () => window.clearTimeout(id);
  }, [engine]);

  if (!settings.onboarded && head !== 'welcome' && head !== 'mode') {
    queueMicrotask(() => navigate('/welcome', { replace: true }));
    return null;
  }
  switch (head) {
    case 'welcome': return <LanguageScreen />;
    case 'mode': return <ModeScreen />;
    case 'capture': return <CaptureScreen />;
    case 'paste': return <PasteScreen />;
    case 'practice': return <PracticeScreen />;
    case 'example': return <ExampleRoute key={arg} id={arg} />;
    case 'card': return <CardRoute key={arg} id={arg} />;
    case 'settings': return <SettingsScreen />;
    default: return <HomeScreen />;
  }
}

export function App() {
  const [engine, setEngine] = useState<Engine | null>(null);
  useEffect(() => {
    const shared = readShareTarget();
    if (shared) {
      session.setSharedText(shared);
      if (parseHash(location.hash).path[0] !== 'paste') location.hash = '#/paste';
    }
    void getEngine().then(setEngine);
  }, []);
  if (!engine) return null;
  return (
    <AppProvider engine={engine}>
      <Routes />
    </AppProvider>
  );
}
