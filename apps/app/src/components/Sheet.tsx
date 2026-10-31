import { useEffect, useRef, type ReactNode } from 'react';
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

export function Sheet({ title, onClose, children, variant = 'sheet' }: Props) {
  const ref = useRef<HTMLDivElement>(null);
  const { t } = useApp();
  useEffect(() => {
    const prev = document.activeElement as HTMLElement | null;
    ref.current?.focus();
    const key = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
      if (e.key === 'Tab' && ref.current) {
        const f = ref.current.querySelectorAll<HTMLElement>('button,[href],input,textarea,[tabindex]:not([tabindex="-1"])');
        if (!f.length) return;
        const first = f[0]!;
        const last = f[f.length - 1]!;
        if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
        else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
      }
    };
    document.addEventListener('keydown', key);
    document.body.classList.add('modal-open');
    return () => {
      document.removeEventListener('keydown', key);
      document.body.classList.remove('modal-open');
      prev?.focus?.();
    };
  }, [onClose]);
  return (
    <div className={`sheet-root sheet-${variant}`}>
      <div className="sheet-scrim" onClick={onClose} aria-hidden />
      <div className="sheet" role="dialog" aria-modal="true" aria-label={title} ref={ref} tabIndex={-1}>
        <div className="sheet-head">
          <h2 className="sheet-title">{title}</h2>
          <SpeakingButton speakKey="app.close" variant="secondary" icon={<X size={24} aria-hidden />} label={t('app.close')} onAct={onClose} />
        </div>
        <div className="sheet-body">{children}</div>
      </div>
    </div>
  );
}
