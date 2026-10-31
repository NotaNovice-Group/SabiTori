import { createEngine } from './packages-engine';
import { loadSettings } from '../lib/settings';
import type { Engine, PlayOptions, Rendered, RenderedSection } from './types';

let engine: Promise<Engine> | null = null;

/**
 * Wraps an engine so that playback state can never get stuck: stopping (or speaking
 * a button label over a card) always tells the screen that the section highlight ended,
 * and callbacks from a superseded playback are ignored.
 */
export function withLifecycle(inner: Engine): Engine {
  let active: PlayOptions | null = null;
  let done: (() => void) | null = null;
  const end = () => {
    const d = done;
    active = null;
    done = null;
    d?.();
  };
  return Object.create(inner, {
    playSections: {
      value(sections: RenderedSection[], opts: PlayOptions) {
        end();
        const mine: PlayOptions = {
          ...opts,
          onSection: (i) => {
            if (active !== mine) return;
            if (i === null) {
              active = null;
              done = null;
            }
            opts.onSection?.(i);
          },
          onProgress: (i, f) => {
            if (active === mine) opts.onProgress?.(i, f);
          },
        };
        active = mine;
        done = () => opts.onSection?.(null);
        inner.playSections(sections, mine);
      },
    },
    speak: {
      value(r: Rendered, rate?: number) {
        end();
        inner.speak(r, rate);
      },
    },
    stop: {
      value() {
        inner.stop();
        end();
      },
    },
    playing: { get: () => active !== null || inner.playing },
  }) as Engine;
}

/** The one door to @sabitori/core, speech and understand. */
export function getEngine(): Promise<Engine> {
  engine ??= createEngine(import.meta.env.BASE_URL, loadSettings().region).then(withLifecycle);
  return engine;
}

export * from './types';
export { EXTRA, isExtraKey, type ExtraKey } from './extra';
