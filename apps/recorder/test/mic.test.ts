/** MicSession when recording is interrupted: no hang, what was recorded is kept, and the reason is reported once. */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

class FakeTrack extends EventTarget {
  stop = vi.fn();
}
class FakeRecorder {
  static isTypeSupported = () => true;
  static last: FakeRecorder;
  state: 'inactive' | 'recording' = 'inactive';
  ondataavailable?: (e: { data: Blob }) => void;
  onstop?: () => void;
  onerror?: () => void;
  /** When false, stop() never fires onstop (a broken recorder). */
  firesStop = true;
  constructor() {
    FakeRecorder.last = this;
  }
  start() {
    this.state = 'recording';
  }
  stop() {
    if (this.state === 'inactive') return;
    this.state = 'inactive';
    if (this.firesStop) queueMicrotask(() => this.onstop?.());
  }
  /** The browser ends recording by itself (the track ended): onstop fires once, before anyone calls stop(). */
  endByItself() {
    this.state = 'inactive';
    this.onstop?.();
  }
}
class FakeAudioContext {
  createMediaStreamSource = () => ({ connect: () => undefined });
  createAnalyser = () => ({ fftSize: 0, getFloatTimeDomainData: () => undefined });
  decodeAudioData = () => Promise.reject(new Error('not audio'));
  close = () => Promise.resolve();
}

let track: FakeTrack;
const doc = Object.assign(new EventTarget(), { visibilityState: 'visible' as 'visible' | 'hidden' });

beforeEach(() => {
  vi.useFakeTimers();
  track = new FakeTrack();
  doc.visibilityState = 'visible';
  vi.stubGlobal('MediaRecorder', FakeRecorder);
  vi.stubGlobal('AudioContext', FakeAudioContext);
  vi.stubGlobal('document', doc);
  vi.stubGlobal('requestAnimationFrame', () => 1);
  vi.stubGlobal('cancelAnimationFrame', () => undefined);
  vi.stubGlobal('navigator', { mediaDevices: { getUserMedia: async () => ({ getAudioTracks: () => [track], getTracks: () => [track] }) } });
});
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

const { MicSession, MAX_RECORDING_MS } = await import('../src/lib/audio');

async function recording(onInterrupt = vi.fn()) {
  const m = new MicSession();
  await m.start(() => undefined, onInterrupt);
  FakeRecorder.last.ondataavailable?.({ data: new Blob(['x'.repeat(100)]) });
  return { m, onInterrupt, rec: FakeRecorder.last };
}

describe('recording that ends without the stop button', () => {
  it('the microphone is taken (track ended): reported once, and stop() does not hang', async () => {
    const { m, onInterrupt, rec } = await recording();
    rec.endByItself();
    track.dispatchEvent(new Event('ended'));
    track.dispatchEvent(new Event('ended'));
    expect(onInterrupt).toHaveBeenCalledTimes(1);
    expect(onInterrupt).toHaveBeenCalledWith('mic_lost');
    const cap = await m.stop(); // resolves at once: the recorder is already inactive
    expect(cap.silent).toBe(false);
    expect(cap.blob.size).toBe(100);
    expect(track.stop).toHaveBeenCalled();
  });

  it('a forgotten recording stops itself after the limit', async () => {
    const { onInterrupt } = await recording();
    vi.advanceTimersByTime(MAX_RECORDING_MS - 1);
    expect(onInterrupt).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);
    expect(onInterrupt).toHaveBeenCalledWith('too_long');
  });

  it('leaving the page stops it', async () => {
    const { onInterrupt } = await recording();
    doc.visibilityState = 'hidden';
    doc.dispatchEvent(new Event('visibilitychange'));
    expect(onInterrupt).toHaveBeenCalledWith('hidden');
  });

  it('a recorder that never reports stopping does not hang the app', async () => {
    const { m, rec } = await recording();
    rec.firesStop = false;
    const done = m.stop();
    await vi.advanceTimersByTimeAsync(2_000);
    const cap = await done;
    expect(cap.blob.size).toBe(100);
  });

  it('nothing recorded counts as silent, never as an empty clip', async () => {
    const m = new MicSession();
    await m.start(() => undefined);
    const cap = await m.stop();
    expect(cap.silent).toBe(true);
  });

  it('after stop, no timer or page event reports anything', async () => {
    const { m, onInterrupt } = await recording();
    await m.stop();
    vi.advanceTimersByTime(MAX_RECORDING_MS * 2);
    doc.visibilityState = 'hidden';
    doc.dispatchEvent(new Event('visibilitychange'));
    track.dispatchEvent(new Event('ended'));
    expect(onInterrupt).not.toHaveBeenCalled();
  });
});
