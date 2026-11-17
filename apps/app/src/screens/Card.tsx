import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { pilot } from '../lib/pilot';
import { CalendarPlus, CalendarCheck, Phone, RotateCcw, Play, Square, Turtle, Eye, Search, Trash2, Shield, ShieldAlert } from 'lucide-react';
import type { Card, SourceSpan } from '@sabitori/core';
import { useApp } from '../app-context';
import type { SectionView } from '../engine';
import { Screen } from '../components/Screen';
import { Sheet } from '../components/Sheet';
import { SpeakingButton } from '../components/SpeakingButton';
import { SECTION_ICON, URGENCY_ICON } from '../components/icons';
import { navigate } from '../lib/router';
import { getCard, deleteCard, putCard, type StoredCard } from '../lib/db';
import { session } from '../lib/session';
import { buildIcs, downloadIcs } from '../lib/ics';
import { isNative, openSystemSettings } from '../lib/native';
import { cancelReminders, hasReminders, scheduleReminders } from '../lib/reminders';
import { formatLongDate, formatMoney, formatPhone, todayIso, formatDeadline } from '../lib/format';
import { senderName } from './Home';
import { SPEEDS } from '../lib/settings';
import { rememberMessage, rememberNames } from '../lib/crash';

const reduced = () => typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;

interface Source {
  label: string;
  span: SourceSpan;
}

/** Loads a card by id from this session or history, then shows it. */
export function CardRoute({ id }: { id: string }) {
  const { t } = useApp();
  const [card, setCard] = useState<StoredCard | undefined | null>(() => session.getCard(id) ?? null);
  useEffect(() => {
    if (card) return;
    let live = true;
    void getCard(id).then((c) => live && setCard(c));
    return () => { live = false; };
  }, [id, card]);
  if (card === null) return null;
  if (!card)
    return (
      <Screen title={t('app.card.not_found')} back={() => navigate('/')}>
        <p className="note">{t('app.card.not_found')}</p>
      </Screen>
    );
  return <CardScreen card={card} />;
}

/**
 * The spoken card. Its one question is "what must I do, and by when?", so the lead block
 * (urgency word, action, date, amount) is the largest thing on the first screen. A scam warning,
 * when there is one, comes before everything. Sender and subject are a compact header.
 * "No warning signs" is spoken first but shown as a quiet line at the end: it is never a badge.
 */
export function CardScreen({ card: first, example }: { card: StoredCard; example?: boolean }) {
  const { engine, settings, t, locale, manifest, refreshHistory, saveCard, uiLang } = useApp();
  const [card, setCard] = useState(first);
  /** Set while a reminder keeps this card in history (kept apart from `card` so the card is not rendered again). */
  const keepUntil = useRef(first.keepUntil);
  const [notice] = useState(() => session.takeNotice());
  const [checking, setChecking] = useState(false);
  const [improved, setImproved] = useState(false);
  const [views, setViews] = useState<SectionView[] | null>(null);
  const [active, setActive] = useState<number | null>(null);
  const [speedStep, setSpeedStep] = useState<number>(settings.speed);
  const [source, setSource] = useState<Source | null>(null);
  const [helper, setHelper] = useState(false);
  useEffect(() => {
    rememberMessage(card.input.text, card.input.sender?.value);
    rememberNames(card.input.sender?.value, card.sender.displayName);
  }, [card]);
  const els = useRef<(HTMLElement | null)[]>([]);
  const last = useRef(0);
  const rate = SPEEDS[speedStep] ?? 1;

  useEffect(() => {
    let live = true;
    void engine.renderCard(card, settings.lang).then((v) => live && setViews(v));
    return () => { live = false; };
  }, [engine, card, settings.lang]);

  useEffect(() => () => engine.stop(), [engine]);

  // Rules built this card instantly. If they were not confident, quietly let the model try (45 s at most).
  useEffect(() => {
    if (first.degradedReason !== 'low_confidence') return;
    const st = engine.model.state().status;
    if (st !== 'ready' && st !== 'loading') return;
    let live = true;
    setChecking(true);
    void engine.analyzeDeeper(first.input, 45_000).then(async (better) => {
      if (!live) return;
      setChecking(false);
      if (better && better.mode === 'full') {
        const next: StoredCard = { ...better, id: first.id, createdAt: first.createdAt, ...(keepUntil.current ? { keepUntil: keepUntil.current } : {}) };
        setCard(next);
        setImproved(true);
        if (!example) await saveCard(next);
      }
    });
    return () => { live = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [first.id]);

  const facts = card.mode === 'facts_only';
  const scamLevel = card.scam.level;

  const play = useCallback(
    (from = 0, withRate = rate) => {
      if (!views) return;
      pilot.record({ type: 'listened' });
      const pressed = performance.now();
      let heard = false;
      engine.playSections(views, {
        rate: withRate,
        from,
        onSection: (i) => {
          setActive(i);
          if (i !== null && !heard) {
            heard = true;
            pilot.record({ type: 'first_audio', ms: performance.now() - pressed });
          }
          if (i !== null) {
            last.current = i;
            const el = els.current[i];
            // "No warning signs" sits at the end of the card: keep the eye at the top while it is said.
            if (views[i]?.section === 'scam' && scamLevel === 'no_signs') window.scrollTo({ top: 0, behavior: 'auto' });
            else el?.scrollIntoView({ block: 'center', behavior: 'auto' });
            el?.style.setProperty('--p', reduced() ? '1' : '0');
          }
        },
        onProgress: (i, f) => els.current[i]?.style.setProperty('--p', reduced() ? '1' : String(f)),
        onFallback: (i, section) => setViews((prev) => (prev ? prev.map((v, k) => (k === i ? section : v)) : prev)),
      });
    },
    [engine, views, rate, scamLevel],
  );

  const autoplayed = useRef(false);
  useEffect(() => {
    if (views && settings.listenFirst && !autoplayed.current) {
      autoplayed.current = true;
      play(0);
    }
  }, [views, settings.listenFirst, play]);

  const playing = active !== null;
  const name = senderName(card, t('app.sender.unknown'));

  const layout = useMemo(() => {
    if (!views) return null;
    const idx = (s: string) => views.findIndex((v) => v.section === s);
    const scam = idx('scam');
    const head = ['sender', 'about'].map(idx).filter((i) => i >= 0);
    const lead = ['action', 'deadline', 'money'].map(idx).filter((i) => i >= 0);
    const urgency = facts ? -1 : idx('urgency');
    const help = idx('help');
    return { scam, head, lead, urgency, help };
  }, [views, facts]);

  const native = isNative();
  type ReminderState = 'unknown' | 'none' | 'set' | 'past' | 'passed' | 'denied' | 'failed';
  const [reminder, setReminder] = useState<ReminderState>('unknown');
  useEffect(() => {
    if (!native || !card.deadline) return;
    let live = true;
    void hasReminders(card.id).then((on) => live && setReminder(on ? 'set' : 'none'));
    return () => { live = false; };
  }, [native, card.id, card.deadline]);

  const remind = async () => {
    if (!card.deadline || !views) return;
    if (native) {
      // Title: the sender, or "SabiTori". Body: the card's action and date, as already rendered in the person's language.
      const who = card.sender.displayName ?? card.input.sender?.value;
      const body = ['action', 'deadline'].map((s) => views.find((v) => v.section === s)?.text ?? '').filter(Boolean).join(' ');
      const r = await scheduleReminders({
        cardId: card.id,
        deadline: card.deadline.value,
        ...(card.deadlineTime ? { time: card.deadlineTime.value } : {}),
        title: who || 'SabiTori',
        body: body || t('ui.remind'),
        route: example ? '/practice' : undefined,
        channelName: t('app.remind.channel'),
      });
      if (r.status === 'set') {
        setReminder('set');
        pilot.record({ type: 'reminder' });
        // Keep the card (and its history entry) until the reminder, whatever "Keep my messages" says;
        // otherwise a tapped reminder would open a card that is gone.
        if (!example) {
          keepUntil.current = card.deadline.value;
          const kept: StoredCard = { ...card, keepUntil: keepUntil.current };
          session.putCard(kept);
          await putCard(kept);
          void refreshHistory();
        }
      } else if (r.status === 'past') {
        setReminder(card.deadline.value < todayIso(engine.region.timezone) ? 'passed' : 'past');
      } else setReminder(r.status);
      return;
    }
    const about = views.find((v) => v.section === 'about')?.text ?? '';
    const deadlineText = views.find((v) => v.section === 'deadline')?.text ?? '';
    downloadIcs('sabitori-reminder.ics', buildIcs({ uid: card.id, date: card.deadline.value, ...(card.deadlineTime ? { time: card.deadlineTime.value } : {}), title: `${name}. ${about}`.trim(), description: `${deadlineText}\n${card.input.text}` }));
  };
  const unremind = async () => {
    await cancelReminders(card.id);
    setReminder('none');
    if (keepUntil.current && !example) {
      keepUntil.current = undefined;
      const { keepUntil: _drop, ...rest } = card;
      void _drop;
      session.putCard(rest);
      // Not kept any more: with "Do not keep", it goes at the next clean-up; otherwise it ages as usual.
      if (settings.retention > 0) await putCard(rest);
      else await deleteCard(card.id);
      void refreshHistory();
    }
  };
  const call = () => {
    if (card.contactPhone) location.href = `tel:${card.contactPhone.value}`;
  };
  const remove = async () => {
    engine.stop();
    // deleteCard cancels the card's reminders too; the session copy goes so the card cannot be reopened.
    session.dropCard(card.id);
    await deleteCard(card.id);
    await refreshHistory();
    navigate('/', { replace: true });
  };

  /** lang attribute only where the text is in another language than the interface (a phrase that fell back). */
  const langOf = (l: string) => (l && l !== uiLang ? l : undefined);

  const fallbackNote = (v: SectionView) => {
    const fb = v.lang !== settings.lang ? manifest(v.lang)?.autonym : undefined;
    return fb ? <p className="fallback">{t('app.card.fallback_note', { name: fb })}</p> : null;
  };

  /** Common frame of one spoken section: lit tint + progress bar on the inline-start edge. */
  const frame = (i: number, extra: Record<string, unknown>, className: string, children: React.ReactNode) => {
    const v = views![i]!;
    return (
      <div
        key={`${v.section}-${i}`}
        ref={(el) => { els.current[i] = el; }}
        data-active={active === i || undefined}
        aria-current={active === i ? 'true' : undefined}
        lang={langOf(v.lang)}
        className={`sec ${className}`}
        {...extra}
      >
        {children}
      </div>
    );
  };

  const renderScam = (i: number) => {
    const v = views![i]!;
    const [head, ...rest] = v.lines;
    const signals = rest.filter((l) => l.key.startsWith('scam.signal.'));
    const advice = rest.filter((l) => !l.key.startsWith('scam.signal.'));
    if (scamLevel === 'no_signs')
      return frame(i, { 'data-level': scamLevel }, 'sec-nosigns', (
        <>
          <Shield className="sec-ic" size={22} strokeWidth={2} aria-hidden />
          <div className="sec-body">
            <p className="sec-text" lang={langOf(v.lang)}>{v.text}</p>
            {fallbackNote(v)}
          </div>
        </>
      ));
    return frame(i, { 'data-level': scamLevel }, 'sec-scam', (
      <>
        <ShieldAlert className="sec-ic" size={32} strokeWidth={2} aria-hidden />
        <div className="sec-body">
          <p className="sec-text sz-lead" lang={head && langOf(head.lang)}><b>{head?.text}</b></p>
          {signals.length > 0 && <ul className="signals">{signals.map((l) => <li key={l.key} lang={langOf(l.lang)}>{l.text}</li>)}</ul>}
          {advice.map((l) => <p key={l.key} className="advice" lang={langOf(l.lang)}>{l.text}</p>)}
          {fallbackNote(v)}
        </div>
      </>
    ));
  };

  const renderUrgency = (i: number) => {
    const u = card.understanding.urgency;
    const Icon = URGENCY_ICON[u] ?? URGENCY_ICON.info;
    const v = views![i]!;
    return frame(i, { 'data-urgency': u }, 'sec-urgency', (
      <>
        <Icon className="sec-ic" size={28} strokeWidth={2} aria-hidden />
        <div className="sec-body">
          <p className="urgency-word">{t(`app.urgency.${u}`)}</p>
          {fallbackNote(v)}
        </div>
      </>
    ));
  };

  const renderSection = (i: number) => {
    const v = views![i]!;
    const Icon = SECTION_ICON[v.section];
    const notice = v.lines.length > 0 && v.lines.every((l) => l.key === 'facts_only.intro');
    const lines = (size: string) => v.lines.map((l) => <p key={l.key} className={`sec-text ${size}`} lang={langOf(l.lang)}>{l.text}</p>);
    let body: React.ReactNode;
    let cls = `sec-${v.section}`;
    if (notice) {
      cls += ' sec-notice';
      body = lines('sz-body');
    } else if (v.section === 'deadline' && card.deadline) {
      body = (
        <>
          <FactValue onSource={setSource} raw={card.deadline.raw} span={card.deadline.span} text={formatDeadline(card.deadline.value, card.deadlineTime?.value, locale)} size="sz-lead" />
          {lines('sz-small sec-said')}
        </>
      );
    } else if (v.section === 'money' && card.amount) {
      body = (
        <>
          <FactValue onSource={setSource} raw={card.amount.raw} span={card.amount.span} text={formatMoney(card.amount.value.amount, card.amount.value.currency, locale)} size="sz-lead" />
          {lines('sz-small sec-said')}
        </>
      );
    } else if (v.section === 'help' && card.contactPhone) {
      body = (
        <>
          <FactValue onSource={setSource} raw={card.contactPhone.raw} span={card.contactPhone.span} text={formatPhone(card.contactPhone.value, engine.region.phone.countryCode)} size="sz-lead" />
          {lines('sz-small sec-said')}
          <SpeakingButton speakKey="ui.call" variant="secondary" className="sec-action" icon={<Phone size={24} strokeWidth={2} aria-hidden />} onAct={call} />
        </>
      );
    } else if (v.section === 'about') {
      body = (
        <>
          {lines('sz-title')}
          {card.reference && !facts && <FactValue onSource={setSource} raw={card.reference.raw} span={card.reference.span} label={t('app.fact.reference')} size="sz-body" />}
        </>
      );
    } else if (v.section === 'action') {
      const unsure = v.lines.some((l) => l.key === 'action.unclear');
      body = lines(unsure ? 'sz-title' : 'sz-lead');
    } else if (v.section === 'sender') {
      body = lines('sz-body');
    } else {
      body = lines('sz-title');
    }
    return frame(i, {}, cls, (
      <>
        <Icon className="sec-ic" size={28} strokeWidth={2} aria-hidden />
        <div className="sec-body">
          {body}
          {fallbackNote(v)}
        </div>
      </>
    ));
  };

  const dock = (
    <div className="player" role="group" aria-label={t('ui.listen')}>
      <SpeakingButton speakKey="ui.again" variant="round" immediate={false} icon={<RotateCcw size={28} strokeWidth={2} aria-hidden />} disabled={!views} onAct={() => play(playing ? last.current : 0)} />
      {playing ? (
        <SpeakingButton speakKey="ui.stop" variant="round" className="play-main" immediate icon={<Square size={32} strokeWidth={2} fill="currentColor" aria-hidden />} onAct={() => engine.stop()} />
      ) : (
        <SpeakingButton speakKey="ui.listen" variant="round" className="play-main" icon={<Play size={32} strokeWidth={2} fill="currentColor" aria-hidden />} disabled={!views} onAct={() => play(0)} />
      )}
      <SpeakingButton
        speakKey="ui.slower"
        variant="round"
        icon={<Turtle size={28} strokeWidth={2} aria-hidden />}
        disabled={!views || speedStep >= SPEEDS.length - 1}
        onAct={() => {
          const next = Math.min(SPEEDS.length - 1, speedStep + 1);
          setSpeedStep(next);
          if (playing) play(last.current, SPEEDS[next]);
          else play(0, SPEEDS[next]);
        }}
      />
    </div>
  );

  const L = layout;
  return (
    <Screen
      title={name}
      quietTitle
      back={() => { engine.stop(); navigate('/'); }}
      className="cardscreen"
      dock={dock}
    >
      <article className="card" data-mode={card.mode} data-scam={scamLevel} data-urgency={facts ? undefined : card.understanding.urgency} aria-busy={!views}>
        {example && <p className="badge-line">{t('app.practice.badge')}</p>}
        {notice && <p className="note" role="status">{t(notice)}</p>}
        {checking && (
          <div className="checking" role="status">
            <span>{t('app.card.checking')}</span>
            <span className="bar bar-small"><span className="bar-run" /></span>
          </div>
        )}
        {improved && !playing && (
          <div className="improved" role="status">
            <p>{t('app.card.improved')}</p>
            <SpeakingButton speakKey="ui.listen" variant="secondary" icon={<Play size={24} strokeWidth={2} fill="currentColor" aria-hidden />} onAct={() => { setImproved(false); play(0); }} />
          </div>
        )}
        {views && L && (
          <>
            {L.scam >= 0 && scamLevel !== 'no_signs' && renderScam(L.scam)}
            {L.head.length > 0 && <div className={`group group-head${facts ? ' group-notice' : ''}`}>{L.head.map(renderSection)}</div>}
            {(L.urgency >= 0 || L.lead.length > 0) && (
              <div className="group group-lead">
                {L.urgency >= 0 && renderUrgency(L.urgency)}
                {L.lead.map(renderSection)}
                {card.deadline && L.lead.some((i) => views[i]!.section === 'deadline') && (
                  <div className="group-actions">
                    {native && reminder === 'set' ? (
                      <>
                        <p className="note remind-note" role="status"><CalendarCheck size={24} strokeWidth={2} aria-hidden /> <b>{t('app.remind.set')}</b></p>
                        <SpeakingButton speakKey="app.remind.cancel" variant="quiet" onAct={() => void unremind()} />
                      </>
                    ) : (
                      <SpeakingButton speakKey="ui.remind" variant="secondary" icon={<CalendarPlus size={24} strokeWidth={2} aria-hidden />} onAct={() => void remind()} />
                    )}
                    {native && (reminder === 'past' || reminder === 'passed' || reminder === 'denied' || reminder === 'failed') && (
                      <p className="note" role="status">{t(`app.remind.${reminder}`)}</p>
                    )}
                    {native && reminder === 'set' && settings.retention === 0 && !example && <p className="note">{t('app.remind.kept')}</p>}
                    {native && reminder === 'denied' && (
                      <SpeakingButton speakKey="app.settings.open" variant="secondary" onAct={() => void openSystemSettings('notifications')} />
                    )}
                  </div>
                )}
              </div>
            )}
            {L.help >= 0 && <div className="group group-help">{renderSection(L.help)}</div>}
            {L.scam >= 0 && scamLevel === 'no_signs' && renderScam(L.scam)}
          </>
        )}
        <SpeakingButton speakKey="ui.show_helper" variant="secondary" className="show-helper" icon={<Eye size={24} strokeWidth={2} aria-hidden />} onAct={() => { engine.stop(); setHelper(true); }} />
        <p className="footer-note">{t('ui.not_advice')}</p>
        {!example && (
          <SpeakingButton speakKey="ui.delete" variant="quiet" className="danger-quiet" icon={<Trash2 size={24} strokeWidth={2} aria-hidden />} onAct={remove} />
        )}
      </article>
      {source && (
        <Sheet title={t('app.original')} onClose={() => setSource(null)}>
          <SourceText text={card.input.text} span={source.span} />
        </Sheet>
      )}
      {helper && views && (
        <Sheet title={t('ui.show_helper')} variant="full" onClose={() => setHelper(false)}>
          <HelperView card={card} views={views} locale={locale} phoneCc={engine.region.phone.countryCode} />
        </Sheet>
      )}
    </Screen>
  );
}

/**
 * A fact (date, amount, phone, reference) shown big. The value itself is the button that
 * opens the message with this fact highlighted; the small search glyph says so, and the
 * button speaks "Where is this in the message?" on long-press.
 */
function FactValue({ raw, span, label, text, size, onSource }: { raw: string; span: SourceSpan; label?: string; text?: string; size: string; onSource: (s: Source) => void }) {
  const { t } = useApp();
  const shown = text ?? raw;
  // The last word stays with the glyph; the space before it is an ordinary one so a long amount can wrap there.
  const cut = shown.search(/[\s\u00a0\u202f]\S*$/);
  const [head, tail] = cut > 0 ? [shown.slice(0, cut) + ' ', shown.slice(cut + 1)] : ['', shown];
  return (
    <SpeakingButton
      speakKey="ui.show_source"
      variant="quiet"
      className="fact"
      label={
        <span className="fact-line">
          {label && <span className="fact-label">{label}</span>}
          <span className="fact-row">
            <b className={`fact-value num ${size}`}>
              {head}
              <span className="fact-tail">
                {tail}
                <Search className="fact-glyph" size={24} strokeWidth={2} aria-hidden />
              </span>
            </b>
            {/* the glyph alone says nothing to a screen reader: name what the button does */}
            <span className="sr-only">. {t('ui.show_source')}</span>
          </span>
        </span>
      }
      onAct={() => onSource({ label: shown, span })}
    />
  );
}

export function SourceText({ text, span }: { text: string; span: SourceSpan }) {
  const a = Math.max(0, Math.min(span.start, text.length));
  const b = Math.max(a, Math.min(span.end, text.length));
  return (
    <p className="source">
      {text.slice(0, a)}
      <mark>{text.slice(a, b)}</mark>
      {text.slice(b)}
    </p>
  );
}

function HelperView({ card, views, locale, phoneCc }: { card: Card; views: SectionView[]; locale: string; phoneCc: string }) {
  const { uiLang } = useApp();
  const lg = (l: string) => (l && l !== uiLang ? l : undefined);
  const noSigns = card.scam.level === 'no_signs';
  // the quiet "no warning signs" line goes last for a helper too
  const order = noSigns ? [...views.filter((v) => v.section !== 'scam'), ...views.filter((v) => v.section === 'scam')] : views;
  return (
    <div className="helper">
      {order.map((v, i) => {
        const Icon = (v.section === 'urgency' ? URGENCY_ICON[card.understanding.urgency] : SECTION_ICON[v.section]) ?? SECTION_ICON.about;
        if (v.section === 'urgency' && card.mode === 'facts_only') return null;
        if (v.section === 'scam' && noSigns)
          return (
            <section key={i} className="helper-sec helper-quiet">
              <Shield size={28} strokeWidth={2} aria-hidden />
              <p lang={lg(v.lang)}>{v.text}</p>
            </section>
          );
        // numbers are read best as digits: show the fact itself, big
        const digits =
          v.section === 'deadline' && card.deadline ? formatDeadline(card.deadline.value, card.deadlineTime?.value, locale)
          : v.section === 'money' && card.amount ? formatMoney(card.amount.value.amount, card.amount.value.currency, locale)
          : v.section === 'help' && card.contactPhone ? formatPhone(card.contactPhone.value, phoneCc)
          : undefined;
        // same order of importance as the card: who and what smaller, the facts biggest
        const weight = v.section === 'sender' || v.section === 'about' || v.section === 'urgency' ? ' helper-lead' : v.section === 'help' && !digits ? ' helper-title' : '';
        return (
          <section key={i} className={`helper-sec${v.section === 'scam' ? ' helper-scam' : ''}${weight}`}>
            {v.section === 'scam' ? <ShieldAlert size={40} strokeWidth={2} aria-hidden /> : <Icon size={40} strokeWidth={2} aria-hidden />}
            <p className={digits ? 'num' : undefined} lang={digits ? undefined : lg(v.lang)}>{digits ?? v.text}</p>
          </section>
        );
      })}
    </div>
  );
}
