import { useEffect, useRef, useState } from 'react';
import { Camera } from 'lucide-react';
import { useApp } from '../app-context';
import { Screen } from '../components/Screen';
import { SpeakingButton } from '../components/SpeakingButton';
import { navigate } from '../lib/router';
import { session } from '../lib/session';
import { buildInput } from '../lib/open';
import { isSharp, measureSharpness } from '../lib/sharpness';
import { recognise } from '../lib/ocr';
import { rememberMessage } from '../lib/crash';

type Phase = 'checking' | 'blurry' | 'reading' | 'empty' | 'error';

export function CaptureScreen() {
  const { t, say, engine, saveCard } = useApp();
  const [file, setFile] = useState<File | null>(() => session.takePhoto());
  const [url, setUrl] = useState<string>();
  const [phase, setPhase] = useState<Phase>('checking');
  const [progress, setProgress] = useState(0);
  const [forced, setForced] = useState(0);
  const input = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!file) { navigate('/', { replace: true }); return; }
    const u = URL.createObjectURL(file);
    setUrl(u);
    return () => URL.revokeObjectURL(u);
  }, [file]);

  useEffect(() => {
    if (!file) return;
    let live = true;
    (async () => {
      try {
        if (forced === 0) {
          setPhase('checking');
          const v = await measureSharpness(file);
          if (!live) return;
          if (!isSharp(v)) {
            setPhase('blurry');
            say('ui.retake');
            return;
          }
        }
        setPhase('reading');
        setProgress(0);
        const text = await recognise(file, (f) => live && setProgress(f));
        rememberMessage(text);
        if (!live) return;
        if (text.replace(/\s/g, '').length < 12) {
          setPhase('empty');
          say('ui.retake');
          return;
        }
        const card = await engine.analyze(buildInput(text, 'photo', engine.region.code));
        if (!live) return;
        await saveCard(card);
        navigate(`/card/${card.id}`, { replace: true });
      } catch {
        if (live) setPhase('error');
      }
    })();
    return () => { live = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [file, forced]);

  const retake = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    e.target.value = '';
    if (f) { setForced(0); setFile(f); }
  };

  const failed = phase === 'blurry' || phase === 'empty' || phase === 'error';
  const busy = phase === 'checking' || phase === 'reading';
  const status =
    phase === 'checking' ? t('app.capture.checking')
    : phase === 'reading' ? t('ui.reading')
    : phase === 'blurry' ? t('ui.retake')
    : phase === 'empty' ? t('app.capture.empty')
    : t('app.capture.failed');

  return (
    <Screen
      title={t('ui.take_photo')}
      back={() => navigate('/')}
      className="capture"
      dock={
        failed ? (
          <>
            <input ref={input} type="file" accept="image/*" capture="environment" hidden onChange={retake} tabIndex={-1} />
            <SpeakingButton speakKey="app.capture.again" variant="hero" className="btn-block" icon={<Camera size={32} strokeWidth={2} aria-hidden />} onAct={() => input.current?.click()} />
            {phase === 'blurry' && <SpeakingButton speakKey="app.capture.use" variant="secondary" className="btn-block" onAct={() => setForced((n) => n + 1)} />}
          </>
        ) : undefined
      }
    >
      {url && <img className="preview" src={url} alt="" data-busy={busy || undefined} />}
      <p className="status" role="status" aria-live="polite" data-failed={failed || undefined}>{status}</p>
      {phase === 'reading' && (
        <div className="bar" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(progress * 100)} aria-label={t('ui.reading')}>
          <span style={{ width: `${Math.max(4, progress * 100)}%` }} />
        </div>
      )}
    </Screen>
  );
}
