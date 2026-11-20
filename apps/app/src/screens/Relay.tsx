import { useEffect, useRef, useState } from 'react';
import { Radio, Square } from 'lucide-react';
import type { PluginListenerHandle } from '@capacitor/core';
import { useApp } from '../app-context';
import { Screen } from '../components/Screen';
import { SpeakingButton } from '../components/SpeakingButton';
import { navigate } from '../lib/router';
import { todayIso } from '../lib/format';
import { SmsRelay, clearRelayNotes, decide, limitNotice, newRelayState, relayReply, showRelayLimit, showRelayRunning } from '../lib/relay';

type Status = 'stopped' | 'running' | 'denied' | 'unavailable';

/**
 * Relay build only (docs/sms-ussd.md, route A). Shows counts, never a message or a number.
 */
export function RelayScreen() {
  const { t, engine } = useApp();
  const [status, setStatus] = useState<Status>('stopped');
  const [counts, setCounts] = useState({ replied: 0, refused: 0 });
  const handle = useRef<PluginListenerHandle | null>(null);
  const state = useRef(newRelayState());
  const notes = useRef<{ lastLimitNote?: number }>({});

  useEffect(() => () => { void handle.current?.remove(); void SmsRelay.stop().catch(() => {}); void clearRelayNotes(); }, []);

  const start = async () => {
    const r = await SmsRelay.start().catch(() => ({ available: false }) as { available: boolean; denied?: boolean });
    if (!r.available) return setStatus('unavailable');
    if ('denied' in r && r.denied) return setStatus('denied');
    handle.current = await SmsRelay.addListener('sms', async ({ from, text }) => {
      const d = decide(from, text, state.current, Date.now());
      if (!d.ok) {
        if (d.why === 'hour_limit' && limitNotice(notes.current, Date.now())) void showRelayLimit(t('app.relay.title'), t('app.relay.limit'));
        return setCounts((c) => ({ ...c, refused: c.refused + 1 }));
      }
      try {
        const reply = await relayReply(engine, text, todayIso(engine.region.timezone));
        await SmsRelay.send({ to: d.to, text: reply.text });
        setCounts((c) => ({ ...c, replied: c.replied + 1 }));
      } catch {
        setCounts((c) => ({ ...c, refused: c.refused + 1 }));
      }
    });
    setStatus('running');
    void showRelayRunning(t('app.relay.title'), t('app.relay.running'));
  };
  const stop = async () => {
    await handle.current?.remove();
    handle.current = null;
    await SmsRelay.stop().catch(() => {});
    await clearRelayNotes();
    setStatus('stopped');
  };

  return (
    <Screen title={t('app.relay.title')} back={() => navigate('/settings')}>
      <section className="panel">
        <p>{t('app.relay.body')}</p>
        <p className="panel-strong" role="status">{t(`app.relay.${status}`)}</p>
        <p className="panel-hint num">{t('app.relay.counts', { replied: String(counts.replied), refused: String(counts.refused) })}</p>
        {status === 'running' ? (
          <SpeakingButton speakKey="app.relay.stop" variant="secondary" icon={<Square size={24} strokeWidth={2} aria-hidden />} onAct={() => void stop()} />
        ) : (
          <SpeakingButton speakKey="app.relay.start" variant="primary" icon={<Radio size={24} strokeWidth={2} aria-hidden />} onAct={() => void start()} />
        )}
      </section>
    </Screen>
  );
}
