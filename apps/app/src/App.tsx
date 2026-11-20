import { lazy, Suspense, useEffect, useRef, useState } from 'react';
import { AppProvider, useApp } from './app-context';
import { getEngine, type Engine } from './engine';
import { parseHash, useRoute } from './lib/router';
import { capText, readShareTarget, session } from './lib/session';
import { LanguageScreen, ModeScreen } from './screens/Welcome';
import { HomeScreen } from './screens/Home';
import { PracticeScreen } from './screens/Practice';
import { PasteScreen } from './screens/Paste';
import { CaptureScreen } from './screens/Capture';
import { CardRoute } from './screens/Card';
import { ExampleRoute } from './screens/Example';
import { SettingsScreen } from './screens/Settings';
import { ScamsScreen } from './screens/Scams';
import { TeachScreen } from './screens/Teach';
import { RelayScreen } from './screens/Relay';
import { relayEnabled } from './lib/relay';

const RELAY = relayEnabled(import.meta.env as unknown as Record<string, string | undefined>);
import { TabBar, tabOf } from './components/TabBar';
import { communityConfigured, flushOutbox } from './lib/community';
import { navigate } from './lib/router';
import { config } from './config';
import { maybeBackgroundCheck } from './lib/updates';
import { hideSplash, startNativeShell } from './lib/native-shell';
import { startCrashReporting, stopCrashReporting } from './lib/crash';
import { ErrorBoundary, FatalScreen } from './components/Fatal';
// Its own chunk: the notices are only read when someone opens the screen.
const AboutScreen = lazy(() => import('./screens/About'));

/** Routes a share (or a reminder) may ask for before the first-run screens are done. */
const RESUMABLE = new Set(['paste', 'capture', 'card']);

function Routes() {
  const { settings, engine, languages } = useApp();
  const route = useRoute();
  const [head = '', arg = ''] = route.path;

  useEffect(() => {
    // Lazy: the optional understanding model never blocks first paint.
    const id = window.setTimeout(() => void engine.model.init(), 1200);
    return () => window.clearTimeout(id);
  }, [engine]);

  // Scam reports and teachings the person chose to send while offline: sent when the network is back.
  useEffect(() => {
    if (!communityConfigured()) return;
    void flushOutbox();
    const on = () => void flushOutbox();
    window.addEventListener('online', on);
    return () => window.removeEventListener('online', on);
  }, []);

  // Optional network features: each does nothing unless configured at build time AND switched on.
  useEffect(() => {
    if (config.updates && settings.updatesOn) maybeBackgroundCheck({ enabled: true });
    // Scam alerts that arrived with an earlier update and were not shown yet (lib/alerts.ts).
    if (config.updates && settings.updatesOn) void import('./lib/alerts').then((m) => m.notifyNewAlerts(settings.region, settings.lang, new Date().toISOString().slice(0, 10))).catch(() => undefined);
  }, [settings.updatesOn]);

  const packVersions = useRef<Record<string, string>>({});
  packVersions.current = Object.fromEntries(languages.map((m) => [m.tag, m.version ?? '']).filter(([, v]) => v));
  useEffect(() => {
    if (!config.crashReports) return;
    if (settings.crashOn) void startCrashReporting({ packVersions: () => packVersions.current }).catch(() => undefined);
    else void stopCrashReporting();
  }, [settings.crashOn]);

  const firstRun = !settings.onboarded && head !== 'welcome' && head !== 'mode';
  // A share that arrives on first run waits until the language is chosen (ModeScreen resumes it).
  if (firstRun && RESUMABLE.has(head)) session.setResume('/' + route.path.map(encodeURIComponent).join('/') + (route.query.toString() ? '?' + route.query.toString() : ''));
  useEffect(() => {
    if (firstRun) navigate('/welcome', { replace: true });
  }, [firstRun]);
  // Not set up yet: the language screen is rendered at once, whatever the address says.
  if (firstRun) return <LanguageScreen />;
  const onboarding = head === 'welcome' || head === 'mode';
  return (
    <>
      <Screens head={head} arg={arg} query={route.query} />
      {!onboarding && <TabBar active={tabOf(head)} />}
    </>
  );
}

function Screens({ head, arg, query }: { head: string; arg: string; query: URLSearchParams }) {
  const route = { query };
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
    case 'scams': return <ScamsScreen />;
    case 'teach': return <TeachScreen />;
    case 'relay': return RELAY ? <RelayScreen /> : <HomeScreen />;
    case 'about': return <Suspense fallback={null}><AboutScreen /></Suspense>;
    default: return <HomeScreen key={route.query.get('s') ?? ''} />;
  }
}

export function App() {
  return (
    <ErrorBoundary>
      <Start />
    </ErrorBoundary>
  );
}

function Start() {
  const [engine, setEngine] = useState<Engine | null>(null);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    const shared = readShareTarget();
    if (shared) {
      const { text, cut } = capText(shared);
      session.setSharedText(text);
      session.setNotice(cut ? 'app.share.too_long' : null);
      if (parseHash(location.hash).path[0] !== 'paste') location.hash = '#/paste';
    }
    const stopShell = startNativeShell();
    void getEngine().then(setEngine, () => setFailed(true));
    return stopShell;
  }, []);
  useEffect(() => {
    if (engine || failed) hideSplash();
  }, [engine, failed]);
  if (failed) return <FatalScreen />;
  if (!engine) return null;
  return (
    <AppProvider engine={engine}>
      <Routes />
    </AppProvider>
  );
}
