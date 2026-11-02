import type { RenderedPart, RenderedSection } from './render.js';

export interface PlayOptions {
  rate: number;
  from?: number;
  onSection?: (index: number | null) => void;
  onProgress?: (index: number, fraction: number) => void;
  /**
   * A part of section `index` could not be played (missing clip, speech error). The rest of that
   * section is NOT played, so a half-spoken amount never reaches the listener; later sections still play.
   * The caller can re-render the section (for example in a fallback language) and play it again.
   */
  onError?: (index: number, error: Error) => void;
}

export interface Player {
  play(sections: RenderedSection[], opts: PlayOptions): void;
  stop(): void;
  readonly playing: boolean;
}

export interface TtsBackend {
  /** Speak one text. Resolves when finished or cancelled; rejects on a real error. `onProgress` gets 0..1 within this text. */
  speak(req: { text: string; bcp47: string; rate: number; onProgress?: (fraction: number) => void }): Promise<void>;
  cancel(): void;
}

export interface ClipBackend {
  /** Play one clip. Resolves when finished or cancelled; rejects if it cannot be played. */
  play(req: { url: string; rate: number }): Promise<void>;
  cancel(): void;
}

/** Sequencing logic, independent of the browser. */
export function createPlayer(backends: { tts: TtsBackend; clips: ClipBackend }): Player {
  let run = 0; // id of the current run; 0 = idle
  let counter = 0;
  let current: { id: number; opts: PlayOptions; active: boolean } | null = null;

  const end = (id: number): void => {
    if (!current || current.id !== id) return;
    const c = current;
    current = null;
    run = 0;
    if (c.active) c.opts.onSection?.(null);
  };

  async function playPart(part: RenderedPart, rate: number, onFrac: (f: number) => void): Promise<void> {
    if (part.kind === 'tts') await backends.tts.speak({ text: part.text, bcp47: part.bcp47, rate, onProgress: onFrac });
    else await backends.clips.play({ url: part.url, rate });
  }

  async function go(id: number, sections: RenderedSection[], opts: PlayOptions, from: number): Promise<void> {
    for (let i = from; i < sections.length; i++) {
      if (run !== id) return;
      current!.active = true;
      opts.onSection?.(i);
      const parts = sections[i]!.parts;
      if (parts.length === 0) opts.onProgress?.(i, 1);
      for (let p = 0; p < parts.length; p++) {
        if (run !== id) return;
        try {
          await playPart(parts[p]!, opts.rate, (f) => {
            if (run === id) opts.onProgress?.(i, (p + Math.min(Math.max(f, 0), 1)) / parts.length);
          });
        } catch (e) {
          if (run !== id) return;
          // Abort this section: the rest of it would be a wrong sentence (e.g. "twelve five hundred francs").
          try {
            opts.onError?.(i, e instanceof Error ? e : new Error(String(e)));
          } catch {
            /* a throwing callback must not stop playback */
          }
          break;
        }
        if (run !== id) return;
        opts.onProgress?.(i, (p + 1) / parts.length);
      }
    }
    end(id);
  }

  const stop = (): void => {
    const c = current;
    run = 0;
    current = null;
    backends.tts.cancel();
    backends.clips.cancel();
    if (c?.active) c.opts.onSection?.(null);
  };

  return {
    play(sections, opts) {
      stop();
      const id = ++counter;
      run = id;
      current = { id, opts, active: false };
      const from = Math.min(Math.max(opts.from ?? 0, 0), sections.length);
      void go(id, sections, opts, from);
    },
    stop,
    get playing() {
      return run !== 0;
    },
  };
}
