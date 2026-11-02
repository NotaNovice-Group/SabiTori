// @vitest-environment jsdom
// Review 3: first-run routing, the error screen and boundary, the language list's honest note.
import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const manifests = [
  { tag: 'fr', autonym: 'Français', name: 'French', status: 'beta', fallback: ['en'] },
  { tag: 'lmp', autonym: 'Limbum', name: 'Limbum', status: 'in_recording', fallback: ['wes', 'en', 'fr'] },
  { tag: 'wes', autonym: 'Pidgin', name: 'Cameroonian Pidgin', status: 'in_recording', fallback: ['en', 'fr'] },
  { tag: 'en', autonym: 'English', name: 'English', status: 'beta', fallback: [] },
];
const app = {
  settings: { listenFirst: false, lang: 'fr', onboarded: false, retention: 30 },
  setSettings: vi.fn(),
  say: vi.fn(),
  t: (k: string, s?: Record<string, string>) => (s?.name ? `${k}:${s.name}` : k),
  languages: manifests,
  manifest: (tag: string) => manifests.find((m) => m.tag === tag),
  // what the engine really renders: Limbum falls back past Pidgin (no rules yet) to English
  spokenIn: { fr: 'fr', lmp: 'en', wes: 'en', en: 'en' } as Record<string, string>,
};
vi.mock('../src/app-context', () => ({ useApp: () => app }));

const { useRoute, navigate } = await import('../src/lib/router');
const { LanguageList } = await import('../src/components/LanguageList');
const { ErrorBoundary, FatalScreen } = await import('../src/components/Fatal');

let root: Root | undefined;
let host: HTMLElement | undefined;
function mount(node: Parameters<Root['render']>[0]) {
  host = document.createElement('div');
  host.id = 'root';
  document.body.appendChild(host);
  root = createRoot(host);
  act(() => root!.render(node));
  return host;
}
afterEach(() => {
  act(() => root?.unmount());
  host?.remove();
  document.body.innerHTML = '';
  history.replaceState(null, '', '/');
});

describe('router (R4 #1: first-run blank screen)', () => {
  it('picks up a hash that changed after the first render but before the listener existed', () => {
    history.replaceState(null, '', '/#/');
    const seen: string[] = [];
    let first = true;
    function Show() {
      const r = useRoute();
      seen.push(r.path.join('/'));
      // The old App redirected during render (queueMicrotask(navigate)) and the hashchange event could fire
      // before useRoute listened. replaceState changes the hash with no event at all: the worst case.
      if (first) {
        first = false;
        history.replaceState(null, '', '/#/welcome');
      }
      return null;
    }
    mount(createElement(Show));
    expect(seen[0]).toBe('');
    expect(seen.at(-1)).toBe('welcome');
  });
  it('follows normal navigation', async () => {
    history.replaceState(null, '', '/#/');
    let seen = '';
    function Show() {
      seen = useRoute().path.join('/');
      return null;
    }
    mount(createElement(Show));
    await act(async () => {
      navigate('/settings');
      await new Promise((r) => setTimeout(r, 0));
    });
    expect(seen).toBe('settings');
  });
});

describe('error screen and boundary (R4 #2, #7)', () => {
  it('a screen that throws shows the calm error screen, in the person’s language, with working buttons', () => {
    const restart = vi.fn();
    const removeUpdates = vi.fn(async () => undefined);
    function Boom(): never {
      throw new Error('bad record');
    }
    const err = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const h = mount(createElement(ErrorBoundary, { fallback: createElement(FatalScreen, { actions: { restart, removeUpdates }, lang: 'fr' }), children: createElement(Boom) }));
    err.mockRestore();
    expect(h.querySelector('h1')!.textContent).toBe('Un problème est survenu');
    const buttons = [...h.querySelectorAll('button')].map((b) => b.textContent);
    expect(buttons).toEqual(['Écouter', 'Recommencer', 'Retirer les mises à jour téléchargées']);
    act(() => (h.querySelectorAll('button')[1] as HTMLButtonElement).click());
    expect(restart).toHaveBeenCalledTimes(1);
  });
  it('without an update channel there is no "remove updates" button; English when chosen', () => {
    const h = mount(createElement(FatalScreen, { actions: { restart: vi.fn() }, lang: 'en' }));
    expect([...h.querySelectorAll('button')].map((b) => b.textContent)).toEqual(['Listen', 'Start again']);
    expect(document.documentElement.lang).toBe('en');
  });
});

describe('language list (R3 #4: honest "spoken in" note)', () => {
  it('names the language the engine really speaks, not the first fallback listed', () => {
    const h = mount(createElement(LanguageList));
    const notes = [...h.querySelectorAll('.lang')].map((li) => [li.querySelector('.lang-autonym')!.textContent, li.querySelector('.lang-note')?.textContent ?? '']);
    expect(notes).toEqual([
      ['Français', ''],
      ['Limbum', 'app.lang.soon:English'], // manifest fallback[0] is Pidgin, which cannot speak yet
      ['Pidgin', 'app.lang.soon:English'],
      ['English', ''],
    ]);
  });
  it('a language still being recorded is offered, with the note', () => {
    const h = mount(createElement(LanguageList));
    expect(h.querySelectorAll('[role=radio]')).toHaveLength(4);
  });
});
