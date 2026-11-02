import { useEffect, useState } from 'react';

export interface Route {
  path: string[];
  query: URLSearchParams;
}

export function parseHash(hash: string): Route {
  const raw = hash.replace(/^#/, '');
  const [p = '', q = ''] = raw.split('?');
  return { path: p.split('/').filter(Boolean).map(decodeURIComponent), query: new URLSearchParams(q) };
}

export function navigate(path: string, opts?: { replace?: boolean }): void {
  const target = '#' + path;
  if (opts?.replace) location.replace(target);
  else location.hash = target;
}

export function useRoute(): Route {
  const [state, setState] = useState(() => ({ hash: location.hash, route: parseHash(location.hash) }));
  useEffect(() => {
    let last = state.hash;
    const on = () => {
      if (location.hash === last) return;
      last = location.hash;
      setState({ hash: last, route: parseHash(last) });
    };
    window.addEventListener('hashchange', on);
    // The hash may have changed between the first render and this effect (a redirect, a share or a
    // reminder tap while the app was starting): read it again now that the listener is in place.
    on();
    return () => window.removeEventListener('hashchange', on);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return state.route;
}
