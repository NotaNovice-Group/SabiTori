import type { Worker as TessWorker } from 'tesseract.js';
import { loadBitmap } from './sharpness';

/** Fully offline OCR: worker, core and traineddata are served from /ocr (copied at build, precached). */
let worker: Promise<TessWorker> | null = null;
let onProgress: ((f: number) => void) | null = null;

function ocrBase(): string {
  return new URL(import.meta.env.BASE_URL + 'ocr/', location.href).href;
}

async function getWorker(): Promise<TessWorker> {
  worker ??= (async () => {
    const { createWorker } = await import('tesseract.js');
    const base = ocrBase();
    return createWorker(['fra', 'eng'], 1, {
      workerPath: base + 'worker.min.js',
      corePath: base,
      langPath: base,
      gzip: true,
      workerBlobURL: false,
      logger: (m: { status: string; progress: number }) => {
        if (m.status === 'recognizing text') onProgress?.(m.progress);
      },
    });
  })();
  try {
    return await worker;
  } catch (e) {
    worker = null;
    throw e;
  }
}

/** Scale down very large photos and lift contrast a little: faster and more accurate on cheap cameras. */
async function prepare(file: Blob): Promise<HTMLCanvasElement> {
  const bmp = await loadBitmap(file);
  const w0 = 'naturalWidth' in bmp ? bmp.naturalWidth : bmp.width;
  const h0 = 'naturalHeight' in bmp ? bmp.naturalHeight : bmp.height;
  const scale = Math.min(1, 1800 / Math.max(w0, h0));
  const c = document.createElement('canvas');
  c.width = Math.round(w0 * scale);
  c.height = Math.round(h0 * scale);
  const ctx = c.getContext('2d')!;
  ctx.filter = 'grayscale(1) contrast(1.25)';
  ctx.drawImage(bmp, 0, 0, c.width, c.height);
  return c;
}

export async function recognise(file: Blob, progress: (f: number) => void): Promise<string> {
  onProgress = progress;
  const w = await getWorker();
  const canvas = await prepare(file);
  const { data } = await w.recognize(canvas);
  onProgress = null;
  return data.text.replace(/[ \t]+\n/g, '\n').replace(/\n{3,}/g, '\n\n').trim();
}
