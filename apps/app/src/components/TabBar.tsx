import { useLayoutEffect, useRef } from 'react';
import { House, ShieldAlert, GraduationCap } from 'lucide-react';
import { useApp } from '../app-context';
import { navigate } from '../lib/router';
import { SpeakingButton } from './SpeakingButton';
import type { UiKey } from '../engine';

export type Tab = 'home' | 'scams' | 'teach';

const TABS: { tab: Tab; path: string; key: UiKey; Icon: typeof House }[] = [
  { tab: 'home', path: '/', key: 'app.nav.home', Icon: House },
  { tab: 'scams', path: '/scams', key: 'app.nav.scams', Icon: ShieldAlert },
  { tab: 'teach', path: '/teach', key: 'app.nav.teach', Icon: GraduationCap },
];

/** Which tab a route belongs to (a card opened from Scams still lights Home: it lives in the history). */
export function tabOf(head: string): Tab | null {
  if (head === 'scams' || head === 'report') return 'scams';
  if (head === 'teach') return 'teach';
  if (head === '' || head === 'card' || head === 'paste' || head === 'capture' || head === 'practice' || head === 'example') return 'home';
  return null;
}

/**
 * Always at the bottom of the screen after first run: Home, Scams, Teach. Big targets, an icon and a word each
 * (a word is never missing for a reader, the name is spoken on a long press for a listener).
 */
export function TabBar({ active }: { active: Tab | null }) {
  const { t, engine } = useApp();
  const el = useRef<HTMLElement>(null);
  useLayoutEffect(() => {
    const root = document.documentElement;
    root.classList.add('has-tabbar');
    const set = () => root.style.setProperty('--tabbar-h', `${el.current?.offsetHeight ?? 0}px`);
    set();
    const ro = typeof ResizeObserver === 'function' ? new ResizeObserver(set) : null;
    if (el.current) ro?.observe(el.current);
    return () => {
      ro?.disconnect();
      root.classList.remove('has-tabbar');
      root.style.removeProperty('--tabbar-h');
    };
  }, []);
  return (
    <nav ref={el} className="tabbar" aria-label={t('app.nav.label')}>
      <ul className="tabbar-inner">
        {TABS.map(({ tab, path, key, Icon }) => (
          <li key={tab}>
            <SpeakingButton
              speakKey={key}
              variant="quiet"
              immediate
              className="tab"
              current={active === tab}
              icon={<span className="tab-ic"><Icon size={26} strokeWidth={active === tab ? 2.4 : 2} aria-hidden /></span>}
              label={<span className="tab-label">{t(key)}</span>}
              onAct={() => {
                engine.stop();
                navigate(path);
              }}
            />
          </li>
        ))}
      </ul>
    </nav>
  );
}
