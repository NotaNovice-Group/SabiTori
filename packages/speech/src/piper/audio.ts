import type { PiperAudio } from './engine.js';

/** Plays one synthesized sentence. `done` resolves when it has finished or was stopped. */
export interface AudioOutput {
  play(audio: PiperAudio, onProgress: (fraction: number) => void): { done: Promise<void>; stop(): void };
  /** Releases the audio device (called when the backend is cancelled for good). Optional. */
  close?(): void;
}

interface CtxLike {
  currentTime: number;
  state: string;
  destination: unknown;
  resume(): Promise<void>;
  createBuffer(channels: number, length: number, rate: number): { getChannelData(c: number): Float32Array; duration: number };
  createBufferSource(): { buffer: unknown; connect(d: unknown): void; start(): void; stop(): void; onended: (() => void) | null };
}

/** WebAudio output. One AudioContext, created on first use (inside the user's tap, so autoplay rules allow it). */
export function createWebAudioOutput(opts?: { makeContext?: () => CtxLike }): AudioOutput {
  let ctx: CtxLike | null = null;
  const make =
    opts?.makeContext ??
    (() => {
      const g = globalThis as unknown as { AudioContext?: new () => CtxLike; webkitAudioContext?: new () => CtxLike };
      const C = g.AudioContext ?? g.webkitAudioContext;
      if (!C) throw new Error('Web Audio is not available');
      return new C();
    });
  return {
    play(audio, onProgress) {
      ctx ??= make();
      const c = ctx;
      let finish!: () => void;
      let fail!: (e: Error) => void;
      const done = new Promise<void>((r, j) => {
        finish = r;
        fail = j;
      });
      let src: ReturnType<CtxLike['createBufferSource']> | null = null;
      let timer: ReturnType<typeof setInterval> | undefined;
      let guard: ReturnType<typeof setTimeout> | undefined;
      let ended = false;
      const end = (): void => {
        if (ended) return;
        ended = true;
        clearInterval(timer);
        clearTimeout(guard);
        finish();
      };
      const duration = audio.samples.length / audio.sampleRate;
      if (audio.samples.length === 0) {
        end();
        return { done, stop: end };
      }
      void (async () => {
        try {
          if (c.state === 'suspended') await Promise.race([c.resume(), new Promise((r) => setTimeout(r, 1000))]);
          if (ended) return;
          if (c.state === 'suspended') throw new Error('audio is blocked by the browser');
          const buf = c.createBuffer(1, audio.samples.length, audio.sampleRate);
          buf.getChannelData(0).set(audio.samples);
          src = c.createBufferSource();
          src.buffer = buf;
          src.connect(c.destination);
          src.onended = end;
          const t0 = c.currentTime;
          src.start();
          timer = setInterval(() => onProgress(Math.min((c.currentTime - t0) / duration, 1)), 100);
          // A suspended or broken audio device never fires "ended": do not hang the player.
          guard = setTimeout(end, duration * 1000 + 1500);
        } catch (e) {
          if (ended) return;
          ended = true;
          clearInterval(timer);
          clearTimeout(guard);
          fail(e instanceof Error ? e : new Error(String(e)));
        }
      })();
      return {
        done,
        stop() {
          try {
            src?.stop();
          } catch {
            /* not started */
          }
          end();
        },
      };
    },
  };
}
