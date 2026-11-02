// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, createElement, useState } from 'react';
import { createRoot, type Root } from 'react-dom/client';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const say = vi.fn();
const app = { settings: { listenFirst: true, lang: 'fr' }, say, t: (k: string) => k };
vi.mock('../src/app-context', () => ({ useApp: () => app }));

const { SpeakingButton } = await import('../src/components/SpeakingButton');
const { Sheet } = await import('../src/components/Sheet');
const { Screen } = await import('../src/components/Screen');

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
  say.mockClear();
  app.settings.listenFirst = true;
});

const pointerTap = (el: Element) => {
  act(() => { el.dispatchEvent(new Event('pointerdown', { bubbles: true })); });
  act(() => { el.dispatchEvent(new Event('pointerup', { bubbles: true })); });
  act(() => { el.dispatchEvent(new MouseEvent('click', { bubbles: true, detail: 1 })); });
};
const assistiveClick = (el: Element) => act(() => { el.dispatchEvent(new MouseEvent('click', { bubbles: true, detail: 0 })); });

describe('listen-first and assistive technology', () => {
  it('a finger needs two taps: the first speaks, the second acts', () => {
    const onAct = vi.fn();
    const h = mount(createElement(SpeakingButton, { speakKey: 'ui.paste' as never, onAct }));
    const b = h.querySelector('button')!;
    pointerTap(b);
    expect(onAct).not.toHaveBeenCalled();
    expect(say).toHaveBeenCalledTimes(1);
    pointerTap(b);
    expect(onAct).toHaveBeenCalledTimes(1);
  });
  it('a TalkBack/keyboard click (no pointerdown) acts at once, without a third tap', () => {
    const onAct = vi.fn();
    const h = mount(createElement(SpeakingButton, { speakKey: 'ui.paste' as never, onAct }));
    assistiveClick(h.querySelector('button')!);
    expect(onAct).toHaveBeenCalledTimes(1);
    expect(say).not.toHaveBeenCalled();
  });
  it('a click with detail 0 right after a pointerdown (synthesised) also acts', () => {
    const onAct = vi.fn();
    const h = mount(createElement(SpeakingButton, { speakKey: 'ui.paste' as never, onAct }));
    const b = h.querySelector('button')!;
    act(() => { b.dispatchEvent(new Event('pointerdown', { bubbles: true })); });
    assistiveClick(b);
    expect(onAct).toHaveBeenCalledTimes(1);
  });
});

describe('Sheet', () => {
  function Host({ onClosed }: { onClosed?: () => void }) {
    const [open, setOpen] = useState(false);
    return createElement('div', null,
      createElement('button', { id: 'opener', onClick: () => setOpen(true) }, 'open'),
      open && createElement(Sheet, { title: 'T', onClose: () => { setOpen(false); onClosed?.(); }, children: createElement('button', { id: 'inner' }, 'inner') }),
    );
  }
  const open = (h: HTMLElement) => {
    const b = h.querySelector<HTMLButtonElement>('#opener')!;
    b.focus();
    act(() => b.click());
  };

  it('is a labelled modal dialog in a portal, makes the app inert and takes focus', () => {
    const h = mount(createElement(Host));
    open(h);
    const d = document.querySelector('[role=dialog]') as HTMLElement;
    expect(d.getAttribute('aria-modal')).toBe('true');
    expect(document.getElementById(d.getAttribute('aria-labelledby')!)?.textContent).toBe('T');
    expect(h.hasAttribute('inert')).toBe(true);
    expect(document.activeElement).toBe(d);
  });
  it('traps Tab, closes on Escape and returns focus to the opener', () => {
    const h = mount(createElement(Host));
    open(h);
    const d = document.querySelector('[role=dialog]') as HTMLElement;
    const buttons = d.querySelectorAll('button');
    const last = buttons[buttons.length - 1]!;
    last.focus();
    const tab = new KeyboardEvent('keydown', { key: 'Tab', bubbles: true, cancelable: true });
    act(() => { document.dispatchEvent(tab); });
    expect(tab.defaultPrevented).toBe(true);
    expect(document.activeElement).toBe(buttons[0]);
    act(() => { document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })); });
    expect(document.querySelector('[role=dialog]')).toBeNull();
    expect(h.hasAttribute('inert')).toBe(false);
    expect(document.activeElement).toBe(h.querySelector('#opener'));
  });
  it('closes on the Back gesture (popstate) and pushes exactly one history entry', () => {
    const before = history.length;
    const closed = vi.fn();
    const h = mount(createElement(Host, { onClosed: closed }));
    open(h);
    expect(history.length).toBe(before + 1);
    act(() => { window.dispatchEvent(new PopStateEvent('popstate')); });
    expect(closed).toHaveBeenCalledTimes(1);
    expect(document.querySelector('[role=dialog]')).toBeNull();
  });
});

describe('Screen', () => {
  it('moves focus to the h1 on arrival and is the single main landmark with the dock inside', () => {
    const h = mount(createElement(Screen, { title: 'Réglages', dock: createElement('button', null, 'go'), children: createElement('p', null, 'x') }));
    expect(document.activeElement?.tagName).toBe('H1');
    const mains = h.querySelectorAll('main');
    expect(mains.length).toBe(1);
    expect(mains[0]!.querySelector('.dock')).not.toBeNull();
  });
});
