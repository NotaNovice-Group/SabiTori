import { useCallback, useEffect, useRef, useState } from 'react';
import { MAX_RECORDING_MS, MicSession, playUrl, stopPlayback, type Interruption } from '../lib/audio';
import { useProject } from '../store';

export interface RecState {
  /** Clip id being recorded right now. */
  recording: string | null;
  /** Clip id being trimmed and saved. */
  saving: string | null;
  level: number; // 0..1 meter position
  clipping: boolean;
  message?: { id: string; text: string; tone: 'info' | 'warn' };
  playing: string | null;
}

/** Why a recording ended on its own, said with the result. */
export const INTERRUPTED: Record<Interruption, string> = {
  mic_lost: 'The recording stopped: a call or another app took the microphone.',
  too_long: `The recording stopped after ${MAX_RECORDING_MS / 1000} seconds.`,
  hidden: 'The recording stopped because the page was left.',
};
const CHECK = ' Listen to it, and record it again if it is cut.';

const toMeter = (rms: number) => Math.max(0, Math.min(1, (20 * Math.log10(rms + 1e-6) + 60) / 54));

/** Records one clip at a time into the project, trims silence, plays back. */
export function useRecorder() {
  const { project, putClip, urlFor, clips, setPhrase } = useProject();
  const [st, setSt] = useState<RecState>({ recording: null, saving: null, level: 0, clipping: false, playing: null });
  const mic = useRef<MicSession | null>(null);
  const meta = useRef<{ id: string; text: string; phraseKey?: string } | null>(null);
  const alive = useRef(true);

  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
      mic.current?.cancel();
      stopPlayback();
    };
  }, []);

  const stop = useCallback(async (why?: Interruption) => {
    const m = mic.current;
    const info = meta.current;
    if (!m || !info) return;
    mic.current = null;
    setSt((s) => ({ ...s, recording: null, saving: info.id, level: 0, clipping: false }));
    try {
      const cap = await m.stop();
      if (!alive.current) return;
      if (cap.silent) {
        const lead = why ? INTERRUPTED[why] + ' ' : '';
        setSt((s) => ({ ...s, saving: null, message: { id: info.id, text: lead + 'We did not hear anything. Check the microphone, move closer and try again.', tone: 'warn' } }));
        return;
      }
      const saved = await putClip({ id: info.id, blob: cap.blob, durationMs: cap.durationMs, text: info.text, speakerId: project.activeSpeakerId, ext: cap.ext, at: Date.now() });
      // A new recording means the reviewer has to listen again (and the new recorder cannot be the reviewer).
      if (info.phraseKey) setPhrase(info.phraseKey, (w) => ({ ...w, recordedBy: project.activeSpeakerId, review: w.review === 'reviewed' ? 'none' : w.review, reviewedBy: w.review === 'reviewed' ? undefined : w.reviewedBy }));
      setSt((s) => ({
        ...s,
        saving: null,
        message: saved && why
          ? { id: info.id, text: `${INTERRUPTED[why]} What was recorded is saved.${CHECK}`, tone: 'warn' }
          : saved
          ? { id: info.id, text: cap.trimmedMs > 150 ? `Saved. Trimmed ${(cap.trimmedMs / 1000).toFixed(1)} s of silence.` : 'Saved.', tone: 'info' }
          : { id: info.id, text: 'Not saved on this device. Keep this page open and download the pack now.', tone: 'warn' },
      }));
    } catch {
      setSt((s) => ({ ...s, saving: null, message: { id: info.id, text: 'Could not save this recording. Try again.', tone: 'warn' } }));
    }
  }, [project.activeSpeakerId, putClip, setPhrase]);

  const stopRef = useRef(stop);
  stopRef.current = stop;

  const start = useCallback(
    async (id: string, text: string, phraseKey?: string) => {
      stopPlayback();
      const m = new MicSession();
      try {
        meta.current = { id, text, phraseKey };
        await m.start(
          (rms, peak) => alive.current && setSt((s) => ({ ...s, level: toMeter(rms), clipping: peak > 0.98 ? true : s.clipping && peak > 0.9 })),
          // Ended without the stop button: keep what was recorded, and say why.
          (why) => { if (mic.current === m) void stopRef.current(why); },
        );
        mic.current = m;
        setSt((s) => ({ ...s, recording: id, message: undefined, playing: null }));
      } catch (e) {
        m.cancel();
        const denied = e instanceof DOMException && (e.name === 'NotAllowedError' || e.name === 'SecurityError');
        setSt((s) => ({
          ...s,
          message: {
            id,
            tone: 'warn',
            text: denied
              ? 'The microphone is blocked. Allow it in the address bar, then try again.'
              : e instanceof DOMException && e.name === 'NotFoundError'
                ? 'No microphone found on this device.'
                : 'This browser cannot record here. Try Chrome or Firefox.',
          },
        }));
      }
    },
    [],
  );

  const toggle = useCallback(
    (id: string, text: string, phraseKey?: string) => {
      if (st.saving) return;
      if (st.recording === id) void stop();
      else if (!st.recording) void start(id, text, phraseKey);
    },
    [st.recording, st.saving, start, stop],
  );

  const play = useCallback(
    async (id: string) => {
      if (st.playing === id) {
        stopPlayback();
        return;
      }
      const url = urlFor(id);
      if (!url) return;
      setSt((s) => ({ ...s, playing: id }));
      await playUrl(url);
      if (alive.current) setSt((s) => (s.playing === id ? { ...s, playing: null } : s));
    },
    [st.playing, urlFor],
  );

  return { st, toggle, play, has: (id: string) => clips.has(id) };
}
