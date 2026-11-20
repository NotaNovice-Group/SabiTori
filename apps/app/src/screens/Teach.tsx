import { useEffect, useMemo, useRef, useState } from 'react';
import { Mic, Square, Play, RotateCcw, Send, Shuffle, PencilLine, Flame, CircleCheck, Clock, Trash2, Languages } from 'lucide-react';
import { useApp } from '../app-context';
import { Screen } from '../components/Screen';
import { SpeakingButton } from '../components/SpeakingButton';
import { PROMPTS, TEACH_LANGS, promptOfTheDay } from '../lib/teach-prompts';
import { blobToBase64, canRecord, MAX_SECONDS, startRecording, type Recording } from '../lib/recorder';
import { communityConfigured, sendTeaching, taughtItems, teachStreak, type TaughtItem } from '../lib/community';

const LANG_KEY = 'sabitori.teach.lang';

/**
 * Teach SabiTori: a word or phrase in your language, written and/or spoken, with its meaning in English (or French).
 * Sent only when the person presses Send, to train better support for the languages of Cameroon.
 */
export function TeachScreen() {
  const { t, settings, locale } = useApp();
  const [lang, setLang] = useState(() => {
    try { return localStorage.getItem(LANG_KEY) ?? 'wes'; } catch { return 'wes'; }
  });
  const [otherName, setOtherName] = useState('');
  const [idx, setIdx] = useState(promptOfTheDay);
  const [own, setOwn] = useState(false);
  const prompt = PROMPTS[idx]!;
  const meaningLang: 'en' | 'fr' = settings.lang === 'fr' ? 'fr' : 'en';
  const [phrase, setPhrase] = useState('');
  const [meaning, setMeaning] = useState('');
  const [rec, setRec] = useState<Recording | null>(null);
  const [recording, setRecording] = useState(false);
  const [micError, setMicError] = useState(false);
  const stopper = useRef<(() => Promise<Recording>) | null>(null);
  const [playUrl, setPlayUrl] = useState<string>();
  const audio = useRef<HTMLAudioElement>(null);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<'sent' | 'queued' | null>(null);
  const [items, setItems] = useState<TaughtItem[]>(() => taughtItems());
  const streak = useMemo(() => teachStreak(items), [items]);

  useEffect(() => { try { localStorage.setItem(LANG_KEY, lang); } catch { /* not kept */ } }, [lang]);
  // The meaning box starts with the prompt's meaning; for "my own phrase" it starts empty.
  useEffect(() => setMeaning(own ? '' : prompt[meaningLang]), [idx, own, meaningLang]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (!rec) return setPlayUrl(undefined);
    const u = URL.createObjectURL(rec.blob);
    setPlayUrl(u);
    return () => URL.revokeObjectURL(u);
  }, [rec]);
  useEffect(() => () => void stopper.current?.(), []);

  const record = async () => {
    setMicError(false);
    if (recording) {
      const r = await stopper.current?.();
      stopper.current = null;
      setRecording(false);
      if (r) setRec(r);
      return;
    }
    try {
      const s = await startRecording((r) => { setRecording(false); stopper.current = null; setRec(r); });
      stopper.current = s.stop;
      setRec(null);
      setRecording(true);
    } catch {
      setMicError(true);
    }
  };

  const next = () => { setOwn(false); setIdx((i) => (i + 1) % PROMPTS.length); reset(); };
  const reset = () => { setPhrase(''); setRec(null); setResult(null); };

  const ready = (phrase.trim().length > 0 || rec) && meaning.trim().length > 0 && !recording && (lang !== 'other' || otherName.trim());
  const send = async () => {
    if (!ready || busy) return;
    setBusy(true);
    const r = await sendTeaching({
      lang: lang === 'other' ? 'und' : lang,
      ...(lang === 'other' ? { dialect: otherName.trim().slice(0, 40) } : {}),
      ...(phrase.trim() ? { phrase: phrase.trim().slice(0, 300) } : {}),
      meaning: meaning.trim().slice(0, 300),
      meaningLang,
      ...(own ? {} : { promptId: prompt.id }),
      ...(rec ? { audio: { base64: await blobToBase64(rec.blob), type: rec.type } } : {}),
    });
    setBusy(false);
    setResult(r);
    setItems(taughtItems());
    setPhrase('');
    setRec(null);
  };

  const langName = lang === 'other' ? otherName || t('app.teach.other') : TEACH_LANGS.find((l) => l.tag === lang)?.name ?? lang;

  return (
    <Screen
      title={t('app.teach.title')}
      className="teach"
      dock={<SpeakingButton speakKey="app.teach.send" variant="primary" className="btn-block" icon={<Send size={24} strokeWidth={2} aria-hidden />} disabled={!ready || busy} onAct={() => void send()} />}
    >
      <p className="teach-intro">{t('app.teach.intro')}</p>
      {items.length > 0 && (
        <p className="teach-stats">
          <span><Flame size={22} strokeWidth={2} aria-hidden /> <b>{t('app.teach.streak', { n: String(streak) })}</b></span>
          <span>{t('app.teach.count', { n: String(items.length) })}</span>
        </p>
      )}

      <div className="field">
        <label htmlFor="teach-lang" className="field-label"><Languages size={22} strokeWidth={2} aria-hidden /> {t('app.teach.language')}</label>
        <select id="teach-lang" className="input select" value={lang} onChange={(e) => setLang(e.target.value)}>
          {TEACH_LANGS.map((l) => <option key={l.tag} value={l.tag}>{l.name}</option>)}
          <option value="other">{t('app.teach.other')}</option>
        </select>
        {lang === 'other' && (
          <>
            <label htmlFor="teach-other" className="field-sublabel">{t('app.teach.other_name')}</label>
            <input id="teach-other" className="input" value={otherName} onChange={(e) => setOtherName(e.target.value)} autoComplete="off" />
          </>
        )}
      </div>

      <section className="prompt-card" aria-labelledby="teach-prompt">
        <p className="prompt-eyebrow" id="teach-prompt">{own ? t('app.teach.own_title') : t('app.teach.prompt_title', { lang: langName })}</p>
        {!own && <p className="prompt-text">“{prompt[meaningLang]}”</p>}
        {!own && meaningLang === 'en' && <p className="prompt-alt">{prompt.fr}</p>}
        <div className="prompt-actions">
          <SpeakingButton speakKey="app.teach.another" variant="quiet" icon={<Shuffle size={22} strokeWidth={2} aria-hidden />} onAct={next} />
          <SpeakingButton speakKey="app.teach.own" variant="quiet" pressed={own} icon={<PencilLine size={22} strokeWidth={2} aria-hidden />} onAct={() => { setOwn((o) => !o); reset(); }} />
        </div>
      </section>

      <div className="field">
        <label htmlFor="teach-phrase" className="field-label">{t('app.teach.write', { lang: langName })}</label>
        <textarea id="teach-phrase" className="textarea" rows={2} value={phrase} onChange={(e) => setPhrase(e.target.value)} lang={lang === 'other' ? undefined : lang} />
      </div>

      {canRecord() && (
        <div className="field">
          <span className="field-label">{t('app.teach.say', { lang: langName })}</span>
          <div className="rec-row">
            <SpeakingButton
              speakKey={recording ? 'app.teach.stop' : rec ? 'app.teach.again' : 'app.teach.record'}
              variant={recording ? 'danger' : 'secondary'}
              immediate
              className="rec-btn"
              icon={recording ? <Square size={24} strokeWidth={2} fill="currentColor" aria-hidden /> : rec ? <RotateCcw size={24} strokeWidth={2} aria-hidden /> : <Mic size={24} strokeWidth={2} aria-hidden />}
              onAct={() => void record()}
            />
            {recording && <span className="rec-live" role="status"><span className="rec-dot" aria-hidden="true" />{t('app.teach.recording', { n: String(MAX_SECONDS) })}</span>}
            {rec && !recording && playUrl && (
              <>
                <audio ref={audio} src={playUrl} preload="auto" />
                <SpeakingButton speakKey="app.teach.play" variant="quiet" icon={<Play size={22} strokeWidth={2} fill="currentColor" aria-hidden />} onAct={() => { void audio.current?.play(); }} />
                <SpeakingButton speakKey="app.teach.delete" variant="quiet" icon={<Trash2 size={22} strokeWidth={2} aria-hidden />} label={<span className="sr-only">{t('app.teach.delete')}</span>} onAct={() => setRec(null)} />
                <span className="num rec-len">{rec.seconds.toFixed(1)} s</span>
              </>
            )}
          </div>
          {micError && <p className="error" role="alert">{t('app.teach.mic_error')}</p>}
        </div>
      )}

      <div className="field">
        <label htmlFor="teach-meaning" className="field-label">{t(meaningLang === 'fr' ? 'app.teach.meaning_fr' : 'app.teach.meaning_en')}</label>
        <input id="teach-meaning" className="input" value={meaning} onChange={(e) => setMeaning(e.target.value)} autoComplete="off" />
      </div>

      {result && (
        <p className="report-done" role="status">
          {result === 'sent' ? <CircleCheck size={24} strokeWidth={2} aria-hidden /> : <Clock size={24} strokeWidth={2} aria-hidden />}
          <span>{t(result === 'sent' ? 'app.teach.thanks' : communityConfigured() ? 'app.teach.queued' : 'app.teach.saved')}</span>
        </p>
      )}
      <p className="note">{t('app.teach.what_sent')}</p>

      {items.length > 0 && (
        <section aria-labelledby="teach-mine">
          <h2 id="teach-mine" className="section-title">{t('app.teach.mine')}</h2>
          <ul className="taught">
            {items.slice(0, 20).map((i) => (
              <li key={i.at}>
                <b lang={i.lang}>{i.phrase ?? <Mic size={18} strokeWidth={2} aria-label={t('app.teach.recorded')} />}</b>
                <span>{i.meaning}</span>
                <span className="row-ago">{new Date(i.at).toLocaleDateString(locale)}{i.withAudio && i.phrase ? <Mic size={16} strokeWidth={2} aria-label={t('app.teach.recorded')} /> : null}</span>
              </li>
            ))}
          </ul>
        </section>
      )}
    </Screen>
  );
}
