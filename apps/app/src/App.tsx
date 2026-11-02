import { useEffect, useRef, useState } from 'react';
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
import { config } from './config';
import { maybeBackgroundCheck } from './lib/updates';
import { hideSplash, startNativeShell } from './lib/native-shell';
import { startCrashReporting, stopCrashReporting } from './lib/crash';

function Routes() {
  const { settings, engine, languages } = useApp();
  const route = useRoute();
  const [head = '', arg = ''] = route.path;

  useEffect(() => {
    // Lazy: the optional understanding model never blocks first paint.
    const id = window.setTimeout(() => void engine.model.init(), 1200);
    return () => window.clearTimeout(id);
  }, [engine]);

  // Optional network features: each does nothing unless configured at build time AND switched on.
  useEffect(() => {
    if (config.updates && settings.updatesOn) maybeBackgroundCheck({ enabled: true });
  }, [settings.updatesOn]);

  const packVersions = useRef<Record<string, string>>({});
  packVersions.current = Object.fromEntries(languages.map((m) => [m.tag, m.version ?? '']).filter(([, v]) => v));
  useEffect(() => {
    if (!config.crashReports) return;
    if (settings.crashOn) void startCrashReporting({ packVersions: () => packVersions.current }).catch(() => undefined);
    else void stopCrashReporting();
  }, [settings.crashOn]);

  if (!settings.onboarded && head !== 'welcome' && head !== 'mode') {
    queueMicrotask(() => navigate('/welcome', { replace: true }));
    return null;
  }
  switch (head) {
    case 'welcome': return <LanguageScreen />;
    case 'mode': return <ModeScreen />;
    // `?s=` is set by a share into the app: a new share while the screen is open starts it afresh.
    case 'capture': return <CaptureScreen key={route.query.get('s') ?? ''} />;
    case 'paste': return <PasteScreen key={route.query.get('s') ?? ''} />;
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
    const stopShell = startNativeShell();
    void getEngine().then(setEngine);
    return stopShell;
  }, []);
  useEffect(() => {
    if (engine) hideSplash();
  }, [engine]);
  if (!engine) return null;
  return (
    <AppProvider engine={engine}>
      <Routes />
    </AppProvider>
  );
}
