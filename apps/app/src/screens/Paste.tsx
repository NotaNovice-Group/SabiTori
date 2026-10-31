import { useEffect, useState } from 'react';
import { rememberMessage } from '../lib/crash';
import { ClipboardPaste } from 'lucide-react';
import type { MessageInput } from '@sabitori/core';
import { useApp } from '../app-context';
import { Screen } from '../components/Screen';
import { SpeakingButton } from '../components/SpeakingButton';
import { Segmented } from '../components/Segmented';
import { navigate } from '../lib/router';
import { session } from '../lib/session';
import { buildInput } from '../lib/open';

type Kind = 'name' | 'number' | 'unknown';

export function PasteScreen() {
  const { t, engine, saveCard } = useApp();
  const [text, setText] = useState(() => session.takeSharedText() ?? '');
  useEffect(() => rememberMessage(text), []); // eslint-disable-line react-hooks/exhaustive-deps
  const [kind, setKind] = useState<Kind>('unknown');
  const [who, setWho] = useState('');
  const [busy, setBusy] = useState(false);

  const go = async () => {
    if (!text.trim() || busy) return;
    setBusy(true);
    const sender: MessageInput['sender'] = kind === 'unknown' || !who.trim() ? { kind: 'unknown' } : { kind, value: who.trim() };
    const card = await engine.analyze(buildInput(text.trim(), 'paste', engine.region.code, sender));
    await saveCard(card);
    navigate(`/card/${card.id}`, { replace: true });
  };

  return (
    <Screen
      title={t('ui.paste')}
      back={() => navigate('/')}
      className="paste"
      dock={<SpeakingButton speakKey="app.paste.go" variant="primary" className="btn-block" icon={<ClipboardPaste size={24} strokeWidth={2} aria-hidden />} disabled={!text.trim() || busy} onAct={go} />}
    >
      <div className="field">
        <label htmlFor="msg" className="field-label">{t('app.paste.label')}</label>
        <textarea id="msg" className="textarea" value={text} onChange={(e) => { rememberMessage(e.target.value); setText(e.target.value); }} placeholder={t('app.paste.placeholder')} rows={7} />
      </div>
      <div className="field">
        <span className="field-label" id="who-label">{t('app.paste.sender')}</span>
        <Segmented<Kind>
          label={t('app.paste.sender')}
          value={kind}
          onChange={setKind}
          options={[
            { value: 'name', key: 'app.paste.sender.name', label: t('app.paste.sender.name') },
            { value: 'number', key: 'app.paste.sender.number', label: t('app.paste.sender.number') },
            { value: 'unknown', key: 'app.paste.sender.unknown', label: t('app.paste.sender.unknown') },
          ]}
        />
        {kind !== 'unknown' && (
          <>
            <label htmlFor="who" className="sr-only">{t(kind === 'name' ? 'app.paste.sender.name_label' : 'app.paste.sender.number_label')}</label>
            <input id="who" className="input" value={who} onChange={(e) => setWho(e.target.value)} inputMode={kind === 'number' ? 'tel' : 'text'} placeholder={t(kind === 'name' ? 'app.paste.sender.name_label' : 'app.paste.sender.number_label')} autoComplete="off" />
          </>
        )}
      </div>
    </Screen>
  );
}
