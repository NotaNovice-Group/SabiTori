/** Short voice recordings for "Teach": the phone's own codec (AAC in MP4 on iPhone, Opus in WebM on Android). */
export interface Recording {
  blob: Blob;
  type: string;
  seconds: number;
}

export const MAX_SECONDS = 15;

export const canRecord = (): boolean =>
  typeof navigator !== 'undefined' && !!navigator.mediaDevices?.getUserMedia && typeof MediaRecorder !== 'undefined';

function pickType(): string {
  for (const t of ['audio/mp4', 'audio/webm;codecs=opus', 'audio/webm', 'audio/ogg;codecs=opus'])
    if (MediaRecorder.isTypeSupported?.(t)) return t;
  return '';
}

/** Starts recording; call stop() to get the clip. Stops by itself after MAX_SECONDS. */
export async function startRecording(onAutoStop: (r: Recording) => void): Promise<{ stop: () => Promise<Recording> }> {
  const stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true } });
  const type = pickType();
  const rec = new MediaRecorder(stream, type ? { mimeType: type, audioBitsPerSecond: 48_000 } : undefined);
  const chunks: Blob[] = [];
  const started = performance.now();
  rec.ondataavailable = (e) => e.data.size && chunks.push(e.data);
  let done: Promise<Recording> | null = null;
  const stop = () => {
    done ??= new Promise<Recording>((resolve) => {
      rec.onstop = () => {
        stream.getTracks().forEach((t) => t.stop());
        const mime = (rec.mimeType || type || 'audio/webm').split(';')[0]!;
        resolve({ blob: new Blob(chunks, { type: mime }), type: mime, seconds: (performance.now() - started) / 1000 });
      };
      if (rec.state !== 'inactive') rec.stop();
    });
    return done;
  };
  rec.start(250);
  window.setTimeout(() => {
    if (rec.state === 'recording') void stop().then(onAutoStop);
  }, MAX_SECONDS * 1000);
  return { stop };
}

export function blobToBase64(b: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result).replace(/^data:[^,]*,/, ''));
    r.onerror = () => reject(r.error ?? new Error('read failed'));
    r.readAsDataURL(b);
  });
}
