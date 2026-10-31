import { describe, expect, it } from 'vitest';
import { trimSilence } from '../src/lib/trim';

const SR = 16000;
function tone(ms: number, amp = 0.3, f = 220) {
  const n = Math.round((ms / 1000) * SR);
  return Float32Array.from({ length: n }, (_, i) => amp * Math.sin((2 * Math.PI * f * i) / SR));
}
function noise(ms: number, amp = 0.002) {
  const n = Math.round((ms / 1000) * SR);
  let s = 1;
  return Float32Array.from({ length: n }, () => ((s = (s * 16807) % 2147483647) / 2147483647 - 0.5) * 2 * amp);
}
const cat = (...a: Float32Array[]) => {
  const out = new Float32Array(a.reduce((n, x) => n + x.length, 0));
  let o = 0;
  for (const x of a) (out.set(x, o), (o += x.length));
  return out;
};

describe('trimSilence', () => {
  it('cuts leading and trailing silence but keeps a little padding', () => {
    const pcm = cat(noise(800), tone(500), noise(1200));
    const r = trimSilence(pcm, SR);
    expect(r.silent).toBe(false);
    const startMs = (r.start / SR) * 1000;
    const endMs = (r.end / SR) * 1000;
    expect(startMs).toBeGreaterThan(650);
    expect(startMs).toBeLessThanOrEqual(800);
    expect(endMs).toBeGreaterThanOrEqual(1300);
    expect(endMs).toBeLessThan(1500);
  });
  it('keeps speech with a quiet word in the middle', () => {
    const pcm = cat(noise(500), tone(300), tone(300, 0.04), tone(300), noise(500));
    const r = trimSilence(pcm, SR);
    expect(((r.end - r.start) / SR) * 1000).toBeGreaterThan(900);
  });
  it('reports silence when nothing was said', () => {
    const r = trimSilence(noise(1000), SR);
    expect(r.silent).toBe(true);
    expect(r.end - r.start).toBe(SR);
  });
  it('does not trim a clip with no silence', () => {
    const pcm = tone(600);
    const r = trimSilence(pcm, SR);
    expect(r.start).toBe(0);
    expect(r.end).toBe(pcm.length);
  });
});
