import { useEffect, useLayoutEffect, useRef, type ReactNode } from 'react';
import { ArrowLeft } from 'lucide-react';
import { useApp } from '../app-context';
import { SpeakingButton } from './SpeakingButton';

interface Props {
  title: ReactNode;
  back?: () => void;
  right?: ReactNode;
  children: ReactNode;
  dock?: ReactNode;
  className?: string;
  /** Hide the visual title (the h1 stays for screen readers and focus). */
  quietTitle?: boolean;
  /** Content above the title row (the product mark on the first screen). */
  above?: ReactNode;
}

/** One screen: back button, h1 that takes focus on arrival, scrolling content, optional bottom dock. */
export function Screen({ title, back, right, children, dock, className, quietTitle, above }: Props) {
  const h1 = useRef<HTMLHeadingElement>(null);
  const { t } = useApp();
  const root = useRef<HTMLDivElement>(null);
  const dockEl = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    const d = dockEl.current;
    const r = root.current;
    if (!d || !r) return;
    const set = () => r.style.setProperty('--dock-pad', `${d.offsetHeight + 16}px`);
    set();
    const ro = typeof ResizeObserver === 'function' ? new ResizeObserver(set) : null;
    ro?.observe(d);
    return () => ro?.disconnect();
  }, [dock]);
  useEffect(() => {
    h1.current?.focus({ preventScroll: true });
    window.scrollTo(0, 0);
  }, []);
  return (
    <div ref={root} className={`screen${dock ? ' has-dock' : ''}${className ? ' ' + className : ''}`}>
      {above}
      <header className="topbar">
        {back && (
          <SpeakingButton speakKey="ui.back" variant="quiet" icon={<ArrowLeft size={24} strokeWidth={2} aria-hidden />} label={t('ui.back')} onAct={back} className="topbar-back" />
        )}
        <h1 ref={h1} tabIndex={-1} className={quietTitle ? 'sr-only' : 'screen-title'}>
          {title}
        </h1>
        {right && <div className="topbar-right">{right}</div>}
      </header>
      <main className="screen-body">{children}</main>
      {dock && (
        <div className="dock" ref={dockEl}>
          <div className="dock-inner">{dock}</div>
        </div>
      )}
    </div>
  );
}
