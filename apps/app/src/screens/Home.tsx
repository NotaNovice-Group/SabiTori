import { useEffect, useRef, useState } from 'react';
import { Camera, CalendarClock, ClipboardPaste, FileText, Images, Info, Settings as Cog, Smartphone, Lightbulb, OctagonX } from 'lucide-react';
import type { Card } from '@sabitori/core';
import { useApp } from '../app-context';
import { Screen } from '../components/Screen';
import { SpeakingButton } from '../components/SpeakingButton';
import { Wordmark } from '../components/Mark';
import { KIND_ICON, URGENCY_ICON } from '../components/icons';
import { navigate } from '../lib/router';
import { session } from '../lib/session';
import { isNative } from '../lib/native';
import { useNativePhoto } from '../components/PhotoPicker';
import { formatAgo, formatMoney, formatShortDate } from '../lib/format';
import { rememberNames } from '../lib/crash';

export function senderName(card: Card, fallback: string): string {
  return card.sender.displayName ?? card.input.sender?.value ?? fallback;
}

function Row({ card }: { card: Card }) {
  const { t, locale } = useApp();
  // A record from an older or damaged history may carry a kind or urgency this version does not know.
  const Kind = KIND_ICON[card.understanding.kind] ?? FileText;
  const U = URGENCY_ICON[card.understanding.urgency] ?? Info;
  const scam = card.scam.level !== 'no_signs' && card.scam.level !== undefined;
  // A likely scam is never listed like a bill: no amount, no date, and the stop sign as its picture.
  const likely = card.scam.level === 'likely_scam';
  const Pic = likely ? OctagonX : Kind;
  const level = scam ? 'urgent' : card.understanding.urgency;
  const Chip = scam ? URGENCY_ICON.urgent : U;
  // a card we could not fully understand has no urgency to claim
  const chip = scam || card.mode !== 'facts_only';
  return (
    <li>
      <a className="row" href={`#/card/${card.id}`}>
        <Pic className={likely ? 'row-ic row-ic-stop' : 'row-ic'} size={28} strokeWidth={2} aria-hidden />
        <span className="row-main">
          <span className="row-top">
            <b className="row-name">{senderName(card, t('app.sender.unknown'))}</b>
            <span className="row-ago">{formatAgo(card.createdAt, locale)}</span>
          </span>
          <span className="row-meta">
            {chip && (
              <span className="chip" data-level={level}>
                <Chip size={18} strokeWidth={2} aria-hidden />
                {scam ? t('app.scam.title') : t(`app.urgency.${card.understanding.urgency}`)}
              </span>
            )}
            {!likely && card.deadline && (
              <span className="row-fact"><CalendarClock size={18} strokeWidth={2} aria-hidden />{formatShortDate(card.deadline.value, locale)}</span>
            )}
            {!likely && card.amount && <b className="num row-fact">{formatMoney(card.amount.value.amount, card.amount.value.currency, locale)}</b>}
          </span>
        </span>
      </a>
    </li>
  );
}

export function HomeScreen() {
  const { t, history } = useApp();
  const input = useRef<HTMLInputElement>(null);
  const [notice, setNotice] = useState(() => session.takeNotice());
  // The senders listed here are on screen: an error report must never contain them.
  useEffect(() => rememberNames(...history.map((c) => senderName(c, ''))), [history]);
  const open = (f: File) => {
    session.setPhoto(f);
    navigate('/capture');
  };
  const native = isNative();
  const photo = useNativePhoto(open);
  const onFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    e.target.value = '';
    if (f) open(f);
  };
  return (
    <Screen
      title={<Wordmark />}
      className="home"
      right={<SpeakingButton speakKey="ui.settings" variant="quiet" icon={<Cog size={24} strokeWidth={2} aria-hidden />} label={t('ui.settings')} onAct={() => navigate('/settings')} />}
      dock={
        <>
          <input ref={input} type="file" accept="image/*" capture="environment" hidden onChange={onFile} tabIndex={-1} />
          <SpeakingButton speakKey="ui.take_photo" variant="hero" className="btn-block" icon={<Camera size={32} strokeWidth={2} aria-hidden />} onAct={() => (native ? void photo.pick('camera') : input.current?.click())} />
          {native && <SpeakingButton speakKey="app.photo.choose" variant="secondary" className="btn-block" icon={<Images size={24} strokeWidth={2} aria-hidden />} onAct={() => void photo.pick('gallery')} />}
          <SpeakingButton speakKey="ui.paste" variant="secondary" className="btn-block" icon={<ClipboardPaste size={24} strokeWidth={2} aria-hidden />} onAct={() => navigate('/paste')} />
        </>
      }
    >
      {notice && (
        <div className="notice" role="status">
          <p>{t(notice)}</p>
          <SpeakingButton speakKey="app.close" variant="quiet" onAct={() => setNotice(null)} />
        </div>
      )}
      <section aria-labelledby="hist">
        <h2 id="hist" className="section-title">{t('ui.history')}</h2>
        {history.length === 0 ? (
          <div className="empty">
            <p className="empty-title">{t('app.home.empty')}</p>
            <p className="empty-body">{t('app.home.empty_hint')}</p>
            <p className="privacy"><Smartphone size={24} strokeWidth={2} aria-hidden /><b>{t('ui.privacy')}</b></p>
          </div>
        ) : (
          <ul className="rows">{history.map((c) => <Row key={c.id} card={c} />)}</ul>
        )}
        <SpeakingButton speakKey="app.practice" variant="quiet" className="practice" icon={<Lightbulb size={24} strokeWidth={2} aria-hidden />} onAct={() => navigate('/practice')} />
      </section>
      {photo.notice}
    </Screen>
  );
}
