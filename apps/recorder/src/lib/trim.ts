/**
 * Silence trimming by short-frame energy. Pure functions on PCM so they test
 * without a browser.
 */
export interface TrimOptions {
  frameMs?: number;
  /** Kept before the first and after the last voiced frame. */
  padStartMs?: number;
  padEndMs?: number;
  /** Absolute floor for the threshold (RMS, 0..1). */
  minThreshold?: number;
  /** Threshold as a fraction of the loudest frame. */
  peakRatio?: number;
}

export interface TrimResult {
  start: number; // sample index, inclusive
  end: number; // sample index, exclusive
  /** True when no frame rose above the threshold: nothing was said. */
  silent: boolean;
  peak: number;
}

export function frameRms(samples: Float32Array, frame: number): number[] {
  const out: number[] = [];
  for (let i = 0; i < samples.length; i += frame) {
    const e = Math.min(samples.length, i + frame);
    let sum = 0;
    for (let j = i; j < e; j++) sum += samples[j]! * samples[j]!;
    out.push(Math.sqrt(sum / Math.max(1, e - i)));
  }
  return out;
}

export function trimSilence(samples: Float32Array, sampleRate: number, opts: TrimOptions = {}): TrimResult {
  const frame = Math.max(1, Math.round(((opts.frameMs ?? 10) / 1000) * sampleRate));
  const padStart = Math.round(((opts.padStartMs ?? 80) / 1000) * sampleRate);
  const padEnd = Math.round(((opts.padEndMs ?? 140) / 1000) * sampleRate);
  const rms = frameRms(samples, frame);
  const peak = rms.reduce((a, b) => Math.max(a, b), 0);
  // Noise floor: the quietest fifth of frames. Threshold sits clearly above it.
  const sorted = [...rms].sort((a, b) => a - b);
  const floor = sorted[Math.floor(sorted.length * 0.2)] ?? 0;
  const threshold = Math.max(opts.minThreshold ?? 0.01, floor * 3, peak * (opts.peakRatio ?? 0.08));
  let first = -1;
  let last = -1;
  for (let i = 0; i < rms.length; i++) {
    if (rms[i]! >= threshold) {
      if (first < 0) first = i;
      last = i;
    }
  }
  if (first < 0 || peak < (opts.minThreshold ?? 0.01)) {
    return { start: 0, end: samples.length, silent: true, peak };
  }
  const start = Math.max(0, first * frame - padStart);
  const end = Math.min(samples.length, (last + 1) * frame + padEnd);
  return { start, end, silent: false, peak };
}
