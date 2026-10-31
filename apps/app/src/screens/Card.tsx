import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { CalendarPlus, Phone, RotateCcw, Play, Square, Turtle, Eye, Search, Trash2, ShieldAlert } from 'lucide-react';
import type { Card, SourceSpan } from '@sabitori/core';
import { useApp } from '../app-context';
import type { SectionView } from '../engine';
import { Screen } from '../components/Screen';
import { Sheet } from '../components/Sheet';
import { SpeakingButton } from '../components/SpeakingButton';
import { SECTION_ICON, URGENCY_ICON } from '../components/icons';
import { navigate } from '../lib/router';
import { getCard, deleteCard } from '../lib/db';
import { session } from '../lib/session';
import { buildIcs, downloadIcs } from '../lib/ics';
import { formatLongDate, formatMoney, formatPhone } from '../lib/format';
import { senderName } from './Home';
import { SPEEDS } from '../lib/settings';

const reduced = () => typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;

interface Source {
  label: string;
  span: SourceSpan;
}

/** Loads a card by id from this session or history, then shows it. */
export function CardRoute({ id }: { id: string }) {
  const { t } = useApp();
  const [card, setCard] = useState<Card | undefined | null>(() => session.getCard(id) ?? null);
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

export function CardScreen({ card: first, example }: { card: Card; example?: boolean }) {
  const { engine, settings, t, locale, manifest, refreshHistory, saveCard } = useApp();
  const [card, setCard] = useState(first);
  const [checking, setChecking] = useState(false);
  const [improved, setImproved] = useState(false);
  const [views, setViews] = useState<SectionView[] | null>(null);
  const [active, setActive] = useState<number | null>(null);
  const [speedStep, setSpeedStep] = useState<number>(settings.speed);
  const [source, setSource] = useState<Source | null>(null);
  const [helper, setHelper] = useState(false);
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
        const next = { ...better, id: first.id, createdAt: first.createdAt };
        setCard(next);
        setImproved(true);
        if (!example) await saveCard(next);
      }
    });
    return () => { live = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [first.id]);

  const play = useCallback(
    (from = 0, withRate = rate) => {
      if (!views) return;
      engine.playSections(views, {
        rate: withRate,
        from,
        onSection: (i) => {
          setActive(i);
          if (i !== null) {
            last.current = i;
            const el = els.current[i];
            el?.scrollIntoView({ block: 'center', behavior: 'auto' });
            el?.style.setProperty('--p', reduced() ? '1' : '0');
          }
        },
        onProgress: (i, f) => els.current[i]?.style.setProperty('--p', reduced() ? '1' : String(f)),
      });
    },
    [engine, views, rate],
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
  const facts = card.mode === 'facts_only';
  const scamLevel = card.scam.level;

  const ordered = useMemo(() => {
    if (!views) return { band: undefined as number | undefined, rest: [] as number[] };
    const band = facts ? undefined : views.findIndex((v) => v.section === 'urgency');
    const rest = views.map((_, i) => i).filter((i) => i !== band);
    return { band: band !== undefined && band >= 0 ? band : undefined, rest };
  }, [views, facts]);

  const remind = () => {
    if (!card.deadline || !views) return;
    const about = views.find((v) => v.section === 'about')?.text ?? '';
    const deadlineText = views.find((v) => v.section === 'deadline')?.text ?? '';
    downloadIcs('sabitori-reminder.ics', buildIcs({ uid: card.id, date: card.deadline.value, title: `${name}. ${about}`.trim(), description: `${deadlineText}\n${card.input.text}` }));
  };
  const call = () => {
    if (card.contactPhone) location.href = `tel:${card.contactPhone.value}`;
  };
  const remove = async () => {
    engine.stop();
    await deleteCard(card.id);
    await refreshHistory();
    navigate('/', { replace: true });
  };

  const renderSection = (i: number, mode: 'band' | 'normal') => {
    const v = views![i]!;
    const Icon = mode === 'band' ? URGENCY_ICON[card.understanding.urgency] : SECTION_ICON[v.section];
    const isActive = active === i;
    const fallback = v.lang !== settings.lang ? manifest(v.lang)?.autonym : undefined;
    const noticeOnly = v.lines.length > 0 && v.lines.every((l) => l.key === 'facts_only.intro');
    const cls = `sec sec-${v.section}${mode === 'band' ? ' band' : ''}${noticeOnly ? ' notice' : ''}`;
    const common = { ref: (el: HTMLElement | null) => { els.current[i] = el; }, 'data-active': isActive || undefined, 'data-urgency': mode === 'band' ? card.understanding.urgency : undefined, 'data-level': v.section === 'scam' ? scamLevel : undefined, className: cls } as const;
    let body;
    if (v.section === 'scam') {
      const [head, ...rest] = v.lines;
      const signals = rest.filter((l) => l.key.startsWith('scam.signal.'));
      const advice = rest.filter((l) => !l.key.startsWith('scam.signal.'));
      body = (
        <>
          <p className={`sec-text ${scamLevel === 'no_signs' ? 'sz-title' : 'sz-lead'}`}>{scamLevel === 'no_signs' ? head?.text : <b>{head?.text}</b>}</p>
          {signals.length > 0 && <ul className="signals">{signals.map((l) => <li key={l.key}>{l.text}</li>)}</ul>}
          {advice.map((l) => <p key={l.key} className="advice">{l.text}</p>)}
        </>
      );
    } else if (mode === 'band') {
      body = (
        <>
          <p className="band-word">{t(`app.urgency.${card.understanding.urgency}`)}</p>
          <p className="sec-text">{v.text}</p>
        </>
      );
    } else {
      body = (
        <>
          {(() => {
            const sentences = v.lines.map((l) => (
              <p key={l.key} className={`sec-text ${sizeFor(v.section, noticeOnly, !!(v.section === 'deadline' && card.deadline) || !!(v.section === 'money' && card.amount) || !!(v.section === 'help' && card.contactPhone))}`}>{l.text}</p>
            ));
            if (v.section === 'deadline' && card.deadline)
              return (
                <>
                  <FactRow onSource={setSource} raw={card.deadline.raw} span={card.deadline.span} text={formatLongDate(card.deadline.value, locale)}>{sentences}</FactRow>
                  <SpeakingButton speakKey="ui.remind" variant="secondary" className="sec-action" icon={<CalendarPlus size={24} strokeWidth={2} aria-hidden />} onAct={remind} />
                </>
              );
            if (v.section === 'money' && card.amount)
              return <FactRow onSource={setSource} raw={card.amount.raw} span={card.amount.span} text={formatMoney(card.amount.value.amount, card.amount.value.currency, locale)}>{sentences}</FactRow>;
            if (v.section === 'help' && card.contactPhone)
              return (
                <>
                  <FactRow onSource={setSource} raw={card.contactPhone.raw} span={card.contactPhone.span} text={formatPhone(card.contactPhone.value, engine.region.phone.countryCode)}>{sentences}</FactRow>
                  <SpeakingButton speakKey="ui.call" variant="secondary" className="sec-action" icon={<Phone size={24} strokeWidth={2} aria-hidden />} onAct={call} />
                </>
              );
            return (
              <>
                {sentences}
                {v.section === 'about' && card.reference && !facts && <FactRow onSource={setSource} raw={card.reference.raw} span={card.reference.span} label={t('app.fact.reference')} />}
              </>
            );
          })()}
        </>
      );
    }
    return (
      <section key={`${v.section}-${i}`} {...common} aria-label={v.section}>
        <Icon className="sec-ic" size={mode === 'band' ? 32 : v.section === 'scam' ? 32 : 28} strokeWidth={2} aria-hidden />
        <div className="sec-body">
          {body}
          {fallback && <p className="fallback">{t('app.card.fallback_note', { name: fallback })}</p>}
        </div>
      </section>
    );
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

  return (
    <Screen
      title={name}
      quietTitle
      back={() => { engine.stop(); navigate('/'); }}
      className={`cardscreen`}
      dock={dock}
    >
      <article className="card" data-mode={card.mode} data-scam={scamLevel} aria-busy={!views}>
        {example && <p className="badge-line">{t('app.practice.badge')}</p>}
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
        {views?.filter((v) => v.section === 'scam').map((v) => renderSection(views.indexOf(v), 'normal'))}
        {views && ordered.band !== undefined && renderSection(ordered.band, 'band')}
        {views && scamLevel === 'no_signs' && null}
        {views && ordered.rest.filter((i) => views[i]!.section !== 'scam').map((i) => renderSection(i, 'normal'))}
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

function FactRow({ raw, span, label, text, onSource, children }: { raw: string; span: SourceSpan; label?: string; text?: string; onSource: (s: Source) => void; children?: React.ReactNode }) {
  return (
    <div className="fact">
      <span className="fact-line">
        {label && <span className="fact-label">{label}</span>}
        <b className="fact-value num">{text ?? raw}</b>
      </span>
      {children}
      <SpeakingButton speakKey="ui.show_source" variant="quiet" className="fact-source" icon={<Search size={24} strokeWidth={2} aria-hidden />} onAct={() => onSource({ label: text ?? raw, span })} />
    </div>
  );
}

function sizeFor(section: string, notice: boolean, hasFact = false): string {
  if (notice || hasFact) return 'sz-body';
  switch (section) {
    case 'about': return 'sz-headline';
    case 'action': case 'deadline': case 'money': return 'sz-lead';
    default: return 'sz-title';
  }
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
  return (
    <div className="helper">
      {views.map((v, i) => {
        const Icon = SECTION_ICON[v.section];
        if (v.section === 'urgency' && card.mode === 'facts_only') return null;
        return (
          <section key={i} className={`helper-sec${v.section === 'scam' ? ' helper-scam' : ''}`}>
            {v.section === 'scam' ? <ShieldAlert size={40} strokeWidth={2} aria-hidden /> : <Icon size={40} strokeWidth={2} aria-hidden />}
            <p>{v.text}</p>
          </section>
        );
      })}
      {card.contactPhone && <p className="helper-phone num">{formatPhone(card.contactPhone.value, phoneCc)}</p>}
      {card.amount && <p className="helper-phone num">{formatMoney(card.amount.value.amount, card.amount.value.currency, locale)}</p>}
    </div>
  );
}
