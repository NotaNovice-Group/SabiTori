import { useState } from 'react';
import { Megaphone, ShieldQuestion, Send, CircleCheck, Clock } from 'lucide-react';
import type { Card } from '@sabitori/core';
import { useApp } from '../app-context';
import { SpeakingButton } from './SpeakingButton';
import { Sheet } from './Sheet';
import { communityConfigured, reportFromCard, sendScamReport, wasReported } from '../lib/community';

/**
 * Under a scam warning: "Warn others". The sheet shows exactly what would be sent (the message, which the person
 * can edit to remove their own name or account numbers, and the sender, which they can leave out) and sends only
 * on Send. On a card with no scam signs, a quieter "I think this is a scam" opens the same sheet.
 */
export function ReportScam({ card }: { card: Card }) {
  const { t, settings } = useApp();
  const flagged = card.scam.level !== 'no_signs';
  const [open, setOpen] = useState(false);
  const [done, setDone] = useState<'sent' | 'queued' | null>(() => (wasReported(card.id) ? 'sent' : null));
  const base = reportFromCard(card, settings.lang, import.meta.env.VITE_APP_VERSION as string | undefined);
  const [text, setText] = useState(base.text);
  const [withSender, setWithSender] = useState(base.sender.kind !== 'unknown');
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);

  const send = async () => {
    if (busy || text.trim().length < 8) return;
    setBusy(true);
    const r = await sendScamReport(card.id, {
      ...base,
      ...(flagged ? {} : { level: 'caution' as const }),
      text: text.trim(),
      sender: withSender ? base.sender : { kind: 'unknown' },
    });
    setBusy(false);
    setFailed(r === 'failed');
    if (r === 'failed') return; // keep the sheet open with the text, so the person can try again
    setDone(r);
    setOpen(false);
  };

  if (done)
    return (
      <p className="report-done" role="status">
        {done === 'sent' ? <CircleCheck size={24} strokeWidth={2} aria-hidden /> : <Clock size={24} strokeWidth={2} aria-hidden />}
        <span>{t(done === 'sent' ? 'app.report.thanks' : communityConfigured() ? 'app.report.queued' : 'app.report.saved')}</span>
      </p>
    );

  return (
    <div className={flagged ? 'report report-flagged' : 'report'}>
      {flagged ? (
        <SpeakingButton speakKey="app.report.warn" variant="secondary" className="btn-block report-btn" icon={<Megaphone size={24} strokeWidth={2} aria-hidden />} onAct={() => setOpen(true)} />
      ) : (
        <SpeakingButton speakKey="app.report.suspect" variant="quiet" icon={<ShieldQuestion size={24} strokeWidth={2} aria-hidden />} onAct={() => setOpen(true)} />
      )}
      {open && (
        <Sheet title={t('app.report.title')} onClose={() => setOpen(false)}>
          <p className="sheet-lead">{t('app.report.explain')}</p>
          <div className="field">
            <label htmlFor="rep-text" className="field-label">{t('app.report.message')}</label>
            <textarea id="rep-text" className="textarea" rows={6} value={text} onChange={(e) => setText(e.target.value.slice(0, 1500))} />
            <p className="note">{t('app.report.edit_hint')}</p>
          </div>
          {base.sender.kind !== 'unknown' && base.sender.value && (
            <label className="check-row">
              <input type="checkbox" checked={withSender} onChange={(e) => setWithSender(e.target.checked)} />
              <span>
                {t('app.report.include_sender')} <b className="num">{base.sender.value}</b>
              </span>
            </label>
          )}
          <p className="note">{t('app.report.review_note')}</p>
          {failed && <p className="error" role="alert">{t('app.share.failed')}</p>}
          <div className="sheet-actions">
            <SpeakingButton speakKey="app.report.send" variant="primary" className="btn-block" icon={<Send size={24} strokeWidth={2} aria-hidden />} disabled={busy || text.trim().length < 8} onAct={() => void send()} />
            <SpeakingButton speakKey="app.report.cancel" variant="quiet" className="btn-block" onAct={() => setOpen(false)} />
          </div>
        </Sheet>
      )}
    </div>
  );
}
