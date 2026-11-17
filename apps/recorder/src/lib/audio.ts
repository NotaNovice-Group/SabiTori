/** Browser audio: microphone capture with a live level, trimming, playback. */
import { trimSilence } from './trim';

export function pickMime(): { mime: string; ext: 'webm' | 'm4a' } | null {
  if (typeof MediaRecorder === 'undefined') return null;
  for (const [mime, ext] of [
    ['audio/webm;codecs=opus', 'webm'],
    ['audio/webm', 'webm'],
    ['audio/mp4', 'm4a'],
  ] as const) {
    if (MediaRecorder.isTypeSupported(mime)) return { mime, ext };
  }
  return null;
}

export interface Captured {
  blob: Blob;
  durationMs: number;
  ext: 'webm' | 'm4a';
  silent: boolean;
  trimmedMs: number;
}

/** Re-encode a PCM slice. Real time: a 2 second clip takes about 2 seconds. */
async function encode(samples: Float32Array, sampleRate: number, mime: string): Promise<Blob> {
  const ctx = new AudioContext({ sampleRate });
  const buf = ctx.createBuffer(1, samples.length, sampleRate);
  buf.copyToChannel(samples as Float32Array<ArrayBuffer>, 0);
  const src = ctx.createBufferSource();
  src.buffer = buf;
  const dest = ctx.createMediaStreamDestination();
  src.connect(dest);
  const rec = new MediaRecorder(dest.stream, { mimeType: mime });
  const chunks: Blob[] = [];
  rec.ondataavailable = (e) => e.data.size && chunks.push(e.data);
  const done = new Promise<Blob>((res) => (rec.onstop = () => res(new Blob(chunks, { type: mime.split(';')[0] }))));
  rec.start();
  src.onended = () => setTimeout(() => rec.stop(), 60);
  src.start();
  const blob = await done;
  void ctx.close();
  return blob;
}

/** A phrase takes a few seconds; a recording this long was forgotten. It stops and is kept. */
export const MAX_RECORDING_MS = 30_000;
/** If the recorder never reports that it stopped, give up waiting after this long and use what was recorded. */
const STOP_WAIT_MS = 2_000;

export type Interruption = 'mic_lost' | 'too_long' | 'hidden';

export class MicSession {
  private stream!: MediaStream;
  private ctx!: AudioContext;
  private analyser!: AnalyserNode;
  private rec!: MediaRecorder;
  private chunks: Blob[] = [];
  private raf = 0;
  private fmt = pickMime();
  private started = 0;
  private buf = new Float32Array(1024);
  private limit: ReturnType<typeof setTimeout> | undefined;
  private onHidden = () => {
    if (document.visibilityState === 'hidden') this.interrupt?.('hidden');
  };
  /** Called once when recording must end without the person pressing stop (see Interruption). */
  private interrupt?: (why: Interruption) => void;

  static supported() {
    return !!navigator.mediaDevices?.getUserMedia && !!pickMime();
  }

  async start(onLevel: (rms: number, peak: number) => void, onInterrupt?: (why: Interruption) => void) {
    if (!this.fmt) throw new Error('This browser cannot record audio.');
    this.stream = await navigator.mediaDevices.getUserMedia({
      audio: { channelCount: 1, echoCancellation: false, noiseSuppression: false, autoGainControl: false },
    });
    let told = false;
    this.interrupt = (why) => {
      if (told) return;
      told = true;
      onInterrupt?.(why);
    };
    // A call, an unplugged headset or another app taking the microphone ends the track.
    for (const t of this.stream.getAudioTracks()) t.addEventListener('ended', () => this.interrupt?.('mic_lost'));
    document.addEventListener('visibilitychange', this.onHidden);
    this.limit = setTimeout(() => this.interrupt?.('too_long'), MAX_RECORDING_MS);
    this.ctx = new AudioContext();
    const src = this.ctx.createMediaStreamSource(this.stream);
    this.analyser = this.ctx.createAnalyser();
    this.analyser.fftSize = 1024;
    src.connect(this.analyser);
    this.rec = new MediaRecorder(this.stream, { mimeType: this.fmt.mime });
    this.rec.ondataavailable = (e) => e.data.size && this.chunks.push(e.data);
    this.rec.onerror = () => this.interrupt?.('mic_lost');
    this.rec.start(100);
    this.started = performance.now();
    const tick = () => {
      this.analyser.getFloatTimeDomainData(this.buf);
      let s = 0;
      let pk = 0;
      for (const v of this.buf) {
        s += v * v;
        pk = Math.max(pk, Math.abs(v));
      }
      onLevel(Math.sqrt(s / this.buf.length), pk);
      this.raf = requestAnimationFrame(tick);
    };
    tick();
  }

  private detach() {
    cancelAnimationFrame(this.raf);
    clearTimeout(this.limit);
    document.removeEventListener('visibilitychange', this.onHidden);
    this.interrupt = undefined;
  }

  async stop(): Promise<Captured> {
    this.detach();
    const fmt = this.fmt!;
    // A recorder that already stopped by itself (the track ended) never fires onstop again: do not wait for it.
    if (this.rec.state !== 'inactive') {
      const stopped = new Promise<void>((res) => (this.rec.onstop = () => res()));
      try {
        this.rec.stop();
      } catch {
        /* stopped meanwhile */
      }
      await Promise.race([stopped, new Promise<void>((res) => setTimeout(res, STOP_WAIT_MS))]);
    }
    this.stream.getTracks().forEach((t) => t.stop());
    const raw = new Blob(this.chunks, { type: fmt.mime.split(';')[0] });
    const wall = performance.now() - this.started;
    if (raw.size === 0) {
      void this.ctx.close();
      return { blob: raw, durationMs: 0, ext: fmt.ext, silent: true, trimmedMs: 0 };
    }
    let pcm: AudioBuffer | null = null;
    try {
      const ac = this.ctx;
      pcm = await ac.decodeAudioData(await raw.arrayBuffer());
    } catch {
      pcm = null;
    }
    void this.ctx.close();
    if (!pcm) return { blob: raw, durationMs: wall, ext: fmt.ext, silent: false, trimmedMs: 0 };
    const samples = pcm.getChannelData(0);
    const t = trimSilence(samples, pcm.sampleRate);
    const totalMs = (samples.length / pcm.sampleRate) * 1000;
    if (t.silent) return { blob: raw, durationMs: totalMs, ext: fmt.ext, silent: true, trimmedMs: 0 };
    const keptMs = ((t.end - t.start) / pcm.sampleRate) * 1000;
    if (totalMs - keptMs < 120) return { blob: raw, durationMs: totalMs, ext: fmt.ext, silent: false, trimmedMs: 0 };
    try {
      const blob = await encode(samples.slice(t.start, t.end), pcm.sampleRate, fmt.mime);
      return { blob, durationMs: keptMs, ext: fmt.ext, silent: false, trimmedMs: totalMs - keptMs };
    } catch {
      return { blob: raw, durationMs: totalMs, ext: fmt.ext, silent: false, trimmedMs: 0 };
    }
  }

  cancel() {
    this.detach();
    try {
      this.rec?.state !== 'inactive' && this.rec?.stop();
    } catch {
      /* already stopped */
    }
    this.stream?.getTracks().forEach((t) => t.stop());
    void this.ctx?.close();
  }
}

/** One thing plays at a time. Resolves when it ends or is stopped. */
let current: HTMLAudioElement | null = null;
export function stopPlayback() {
  current?.pause();
  current = null;
}
export function playUrl(url: string): Promise<void> {
  stopPlayback();
  return new Promise((resolve) => {
    const a = new Audio(url);
    current = a;
    const end = () => resolve();
    a.onended = end;
    a.onerror = end;
    a.onpause = end;
    a.play().catch(end);
  });
}
