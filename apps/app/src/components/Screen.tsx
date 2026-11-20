import { useEffect, useLayoutEffect, useRef, type ReactNode } from 'react';
import { ArrowLeft, House } from 'lucide-react';
import { navigate } from '../lib/router';
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
  /** No Home button beside Back (first-run screens, where there is no home yet). */
  noHome?: boolean;
}

/**
 * One screen: back button, h1 that takes focus on arrival (so a screen reader starts at the new title after
 * every route change), scrolling content, optional bottom dock. The whole screen is the one <main> landmark,
 * dock included, so nothing sits outside a landmark.
 */
export function Screen({ title, back, right, children, dock, className, quietTitle, above, noHome }: Props) {
  const h1 = useRef<HTMLHeadingElement>(null);
  const { t, engine } = useApp();
  const root = useRef<HTMLDivElement>(null);
  const dockEl = useRef<HTMLDivElement>(null);
  const bar = useRef<HTMLElement>(null);
  // The top bar sticks while the page scrolls, unless large text makes it tall: then it would cover the content
  // it should leave room for, so it scrolls away with the page (same rule as the dock).
  useLayoutEffect(() => {
    const b = bar.current;
    if (!b) return;
    const set = () => {
      const tall = b.offsetHeight > window.innerHeight * 0.15;
      b.toggleAttribute('data-tall', tall);
      // While it sticks, nothing scrolled into view (a focused button, the section being read) may end under it.
      document.documentElement.style.setProperty('--bar-h', tall ? '0px' : `${b.offsetHeight}px`);
    };
    set();
    const ro = typeof ResizeObserver === 'function' ? new ResizeObserver(set) : null;
    ro?.observe(b);
    window.addEventListener('resize', set);
    return () => { ro?.disconnect(); window.removeEventListener('resize', set); };
  }, []);
  useLayoutEffect(() => {
    const d = dockEl.current;
    const r = root.current;
    const html = document.documentElement;
    if (!d || !r) {
      html.style.setProperty('--dock-h', '0px');
      return;
    }
    const set = () => {
      r.style.setProperty('--dock-pad', `${d.offsetHeight + 16}px`);
      // at a large text size the dock can fill most of the screen: then it scrolls with the page instead of sticking
      d.toggleAttribute('data-tall', d.offsetHeight > window.innerHeight * 0.4);
      // The page's scroll padding (app.css) keeps focused or scrolled-to content above the dock and the tab bar.
      html.style.setProperty('--dock-h', d.hasAttribute('data-tall') ? '0px' : `${d.offsetHeight}px`);
    };
    set();
    const ro = typeof ResizeObserver === 'function' ? new ResizeObserver(set) : null;
    ro?.observe(d);
    window.addEventListener('resize', set);
    return () => { ro?.disconnect(); window.removeEventListener('resize', set); };
  }, [dock]);
  useEffect(() => {
    h1.current?.focus({ preventScroll: true });
    window.scrollTo(0, 0);
  }, []);
  return (
    <main ref={root} className={`screen${dock ? ' has-dock' : ''}${className ? ' ' + className : ''}`}>
      {above}
      <header ref={bar} className="topbar">
        {back && (
          <SpeakingButton speakKey="ui.back" variant="quiet" icon={<ArrowLeft size={24} strokeWidth={2} aria-hidden />} label={t('ui.back')} onAct={back} className="topbar-back" />
        )}
        <h1 ref={h1} tabIndex={-1} className={quietTitle ? 'sr-only' : 'screen-title'}>
          {title}
        </h1>
        {right && <div className="topbar-right">{right}</div>}
        {!right && back && !noHome && (
          <div className="topbar-right">
            <SpeakingButton speakKey="app.nav.home" variant="quiet" icon={<House size={24} strokeWidth={2} aria-hidden />} label={<span className="sr-only">{t('app.nav.home')}</span>} onAct={() => { engine.stop(); navigate('/'); }} className="topbar-home" />
          </div>
        )}
      </header>
      <div className="screen-body">{children}</div>
      {dock && (
        <div className="dock" ref={dockEl}>
          <div className="dock-inner">{dock}</div>
        </div>
      )}
    </main>
  );
}
