import { useEffect, useRef, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { X } from 'lucide-react';
import { useApp } from '../app-context';
import { SpeakingButton } from './SpeakingButton';

interface Props {
  title: string;
  onClose: () => void;
  children: ReactNode;
  /** 'sheet' sits at the bottom; 'full' fills the screen (Show someone). */
  variant?: 'sheet' | 'full';
}

const FOCUSABLE = 'button:not([disabled]),[href],input:not([disabled]):not([type=hidden]),textarea:not([disabled]),select:not([disabled]),[tabindex]:not([tabindex="-1"])';

/**
 * A modal dialog. It lives in a portal on <body>, so the whole app behind it can be made inert
 * (not reachable by Tab, swipe or TalkBack). Focus goes to the dialog on open, is trapped, and returns to
 * the element that opened it. Escape, the scrim and the phone's Back button all close it: Back works
 * because opening pushes one history entry that the Back gesture pops.
 */
export function Sheet({ title, onClose, children, variant = 'sheet' }: Props) {
  const ref = useRef<HTMLDivElement>(null);
  const { t } = useApp();
  // The parent often passes a fresh arrow function on every render; the effect below must not re-run for that.
  const close = useRef(onClose);
  close.current = onClose;

  useEffect(() => {
    const prev = document.activeElement as HTMLElement | null;
    const app = document.getElementById('root');
    ref.current?.focus();
    app?.setAttribute('inert', '');
    document.body.classList.add('modal-open');

    const key = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { e.preventDefault(); close.current(); return; }
      if (e.key !== 'Tab' || !ref.current) return;
      const f = [...ref.current.querySelectorAll<HTMLElement>(FOCUSABLE)].filter((el) => !el.closest('[hidden]') && getComputedStyle(el).display !== 'none');
      if (!f.length) { e.preventDefault(); ref.current.focus(); return; }
      const first = f[0]!;
      const last = f[f.length - 1]!;
      const at = document.activeElement;
      if (e.shiftKey && (at === first || at === ref.current)) { e.preventDefault(); last.focus(); }
      else if (!e.shiftKey && at === last) { e.preventDefault(); first.focus(); }
    };
    document.addEventListener('keydown', key);

    // Back button / gesture: one history entry for the open dialog.
    const mark = { sabiSheet: Math.random() };
    const hash = location.hash;
    history.pushState(mark, '');
    let popped = false;
    const pop = () => { popped = true; close.current(); };
    window.addEventListener('popstate', pop);

    return () => {
      document.removeEventListener('keydown', key);
      window.removeEventListener('popstate', pop);
      app?.removeAttribute('inert');
      document.body.classList.remove('modal-open');
      // Closed some other way (button, Escape): remove our history entry, unless the route moved on meanwhile.
      if (!popped && location.hash === hash && (history.state as { sabiSheet?: number } | null)?.sabiSheet === mark.sabiSheet) history.back();
      if (prev && document.contains(prev)) prev.focus?.();
    };
  }, []);

  return createPortal(
    <div className={`sheet-root sheet-${variant}`}>
      <div className="sheet-scrim" onClick={() => close.current()} aria-hidden />
      <div className="sheet" role="dialog" aria-modal="true" aria-labelledby="sheet-title" ref={ref} tabIndex={-1}>
        <div className="sheet-head">
          <h2 className="sheet-title" id="sheet-title">{title}</h2>
          <SpeakingButton speakKey="app.close" variant="secondary" icon={<X size={24} aria-hidden />} label={t('app.close')} onAct={() => close.current()} />
        </div>
        <div className="sheet-body">{children}</div>
      </div>
    </div>,
    document.body,
  );
}
