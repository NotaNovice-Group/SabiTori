import { createEngine } from './packages-engine';
import { loadSettings } from '../lib/settings';
import { connectedAssets, quarantineUpdates, verifyDownloadedOnce } from '../lib/updates';
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

type Assets = Parameters<typeof createEngine>[2];
export interface StartDeps {
  create: (baseUrl: string, region: string, assets: Assets) => Promise<Engine>;
  assets: () => Assets;
  quarantine: (reason: string) => Promise<void>;
  /** Re-checks the downloaded files (once per installed update) and sets a damaged set aside before it is used. */
  verify?: () => Promise<void>;
  /** How long the start with downloaded files may take before the built-in files are used instead. */
  timeoutMs?: number;
}

/**
 * Start the engine. With the optional update channel, downloaded files are tried first; if they make
 * the start fail (a malformed region or pack that passed its signature), they are set aside with the
 * reason and the engine starts again from the built-in files only, so a bad update can never brick the
 * app. A start that hangs (storage that never answers) falls back to the built-in files for this session.
 */
export async function startEngine(baseUrl: string, region: string, deps: StartDeps): Promise<Engine> {
  const assets = deps.assets();
  if (assets && deps.verify) {
    let t: ReturnType<typeof setTimeout> | undefined;
    await Promise.race([deps.verify().catch(() => undefined), new Promise((r) => { t = setTimeout(r, deps.timeoutMs ?? 10_000); })]);
    clearTimeout(t);
  }
  if (assets) {
    let timer: ReturnType<typeof setTimeout> | undefined;
    const timeout = new Promise<'timeout'>((res) => { timer = setTimeout(() => res('timeout'), deps.timeoutMs ?? 10_000); });
    try {
      const r = await Promise.race([deps.create(baseUrl, region, assets), timeout]);
      if (r !== 'timeout') return r;
    } catch (e) {
      await deps.quarantine(String((e as Error)?.message ?? e)).catch(() => undefined);
    } finally {
      clearTimeout(timer);
    }
  }
  return deps.create(baseUrl, region, null);
}

/** The one door to @sabitori/core, speech and understand. */
export function getEngine(): Promise<Engine> {
  engine ??= startEngine(import.meta.env.BASE_URL, loadSettings().region, {
    create: createEngine,
    assets: connectedAssets,
    quarantine: quarantineUpdates,
    verify: verifyDownloadedOnce,
  }).then(withLifecycle);
  engine.catch(() => { engine = null; });
  return engine;
}

export * from './types';
export { EXTRA, isExtraKey, type ExtraKey } from './extra';
