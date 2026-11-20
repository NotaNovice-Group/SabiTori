import { useEffect, useState } from 'react';
import { pilot, recordExplained } from '../lib/pilot';
import { rememberMessage, rememberNames } from '../lib/crash';
import { ClipboardPaste, Building2, Phone, CircleHelp } from 'lucide-react';
import type { MessageInput } from '@sabitori/core';
import { useApp } from '../app-context';
import { Screen } from '../components/Screen';
import { SpeakingButton } from '../components/SpeakingButton';
import { Segmented } from '../components/Segmented';
import { navigate } from '../lib/router';
import { capText, session } from '../lib/session';
import { buildInput, uniqueCard } from '../lib/open';
import { todayIso } from '../lib/format';
import { PhoneField, senderNumber } from '../components/PhoneField';
import type { CountryCode } from 'libphonenumber-js/min';

type Kind = 'name' | 'number' | 'unknown';

export function PasteScreen() {
  const { t, engine, saveCard } = useApp();
  const [text, setText] = useState(() => session.takeSharedText() ?? '');
  const [notice, setNotice] = useState(() => session.takeNotice());
  const [failed, setFailed] = useState(false);
  useEffect(() => rememberMessage(text), []); // eslint-disable-line react-hooks/exhaustive-deps
  const [kind, setKind] = useState<Kind>('unknown');
  const [who, setWho] = useState('');
  const [country, setCountry] = useState<CountryCode>(() => (engine.region.code as CountryCode) || 'CM');
  const [busy, setBusy] = useState(false);

  const go = async () => {
    if (!text.trim() || busy) return;
    setBusy(true);
    setFailed(false);
    const started = performance.now();
    try {
      const value = kind === 'number' ? senderNumber(who, country) : who.trim();
      const sender: MessageInput['sender'] = kind === 'unknown' || !value ? { kind: 'unknown' } : { kind, value };
      rememberNames(who);
      const card = uniqueCard(await engine.analyze(buildInput(capText(text.trim()).text, 'paste', engine.region.code, sender, todayIso(engine.region.timezone))));
      recordExplained(pilot, card, false, performance.now() - started);
      // Storage that fails or never answers must not keep the person waiting: the card shows anyway.
      if (!(await saveCard(card))) session.setNotice('app.card.not_saved');
      navigate(`/card/${card.id}`, { replace: true });
    } catch {
      setFailed(true);
      setBusy(false);
    }
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
        <textarea id="msg" className="textarea" value={text} onChange={(e) => { const c = capText(e.target.value); rememberMessage(c.text); setText(c.text); setNotice(c.cut ? 'app.share.too_long' : null); }} placeholder={t('app.paste.placeholder')} rows={7} />
        {notice && <p className="note" role="status">{t(notice)}</p>}
      </div>
      <div className="field">
        <span className="field-label" id="who-label">{t('app.paste.sender')}</span>
        <Segmented<Kind>
          label={t('app.paste.sender')}
          value={kind}
          onChange={setKind}
          options={[
            { value: 'name', key: 'app.paste.sender.name', label: t('app.paste.sender.name'), icon: <Building2 size={24} strokeWidth={2} aria-hidden /> },
            { value: 'number', key: 'app.paste.sender.number', label: t('app.paste.sender.number'), icon: <Phone size={24} strokeWidth={2} aria-hidden /> },
            { value: 'unknown', key: 'app.paste.sender.unknown', label: t('app.paste.sender.unknown'), icon: <CircleHelp size={24} strokeWidth={2} aria-hidden /> },
          ]}
        />
        {kind === 'name' && (
          <>
            <label htmlFor="who" className="field-sublabel">{t('app.paste.sender.name_label')}</label>
            <input id="who" className="input" value={who} onChange={(e) => { rememberNames(e.target.value); setWho(e.target.value); }} autoComplete="off" />
          </>
        )}
        {kind === 'number' && (
          <PhoneField id="who" label={t('app.paste.sender.number_label')} country={country} onCountry={setCountry} value={who} onValue={(v) => { rememberNames(v); setWho(v); }} />
        )}
      </div>
      {failed && <p className="error" role="alert">{t('app.capture.failed')}</p>}
    </Screen>
  );
}
