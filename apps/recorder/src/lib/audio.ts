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

  static supported() {
    return !!navigator.mediaDevices?.getUserMedia && !!pickMime();
  }

  async start(onLevel: (rms: number, peak: number) => void) {
    if (!this.fmt) throw new Error('This browser cannot record audio.');
    this.stream = await navigator.mediaDevices.getUserMedia({
      audio: { channelCount: 1, echoCancellation: false, noiseSuppression: false, autoGainControl: false },
    });
    this.ctx = new AudioContext();
    const src = this.ctx.createMediaStreamSource(this.stream);
    this.analyser = this.ctx.createAnalyser();
    this.analyser.fftSize = 1024;
    src.connect(this.analyser);
    this.rec = new MediaRecorder(this.stream, { mimeType: this.fmt.mime });
    this.rec.ondataavailable = (e) => e.data.size && this.chunks.push(e.data);
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

  async stop(): Promise<Captured> {
    cancelAnimationFrame(this.raf);
    const fmt = this.fmt!;
    const stopped = new Promise<void>((res) => (this.rec.onstop = () => res()));
    this.rec.stop();
    await stopped;
    this.stream.getTracks().forEach((t) => t.stop());
    const raw = new Blob(this.chunks, { type: fmt.mime.split(';')[0] });
    const wall = performance.now() - this.started;
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
    cancelAnimationFrame(this.raf);
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
