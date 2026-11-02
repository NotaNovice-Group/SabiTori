import type { Worker as TessWorker } from 'tesseract.js';
import { loadBitmap } from './sharpness';
import { greyToRgba, preprocess, rotate90, PREP_DEFAULT, type GreyImage, type PrepOptions, type PrepReport } from './ocr-prep';

/** Fully offline OCR: worker, core and traineddata are served from /ocr (copied at build, precached). */
let worker: Promise<TessWorker> | null = null;
let onProgress: ((f: number) => void) | null = null;

/** Languages loaded into the worker. Both: a bill is often French with English words and the other way round. */
export const OCR_LANGS = ['fra', 'eng'];
/** Below this mean word confidence (0..100) the page may be upside down: try a half turn too. */
export const LOW_CONFIDENCE = 55;

/** The one tesseract core the app ships (see vite.config.ts). Relaxed SIMD was measured no faster; no non-SIMD build is shipped. */
export const OCR_CORE_FILE = 'tesseract-core-simd-lstm.wasm.js';
/** Smallest module that uses a 128-bit SIMD instruction: WebAssembly.validate() is true only when the WebView supports it (Chrome / WebView 91+). */
const SIMD_PROBE = new Uint8Array([0, 97, 115, 109, 1, 0, 0, 0, 1, 5, 1, 96, 0, 1, 123, 3, 2, 1, 0, 10, 10, 1, 8, 0, 65, 0, 253, 15, 253, 98, 11]);

function ocrBase(): string {
  return new URL(import.meta.env.BASE_URL + 'ocr/', location.href).href;
}

async function getWorker(): Promise<TessWorker> {
  worker ??= (async () => {
    if (typeof WebAssembly === 'object' && !WebAssembly.validate(SIMD_PROBE)) throw new Error('OCR needs WebAssembly SIMD (Android System WebView or Chrome 91 or newer)');
    const { createWorker } = await import('tesseract.js');
    const base = ocrBase();
    return createWorker(OCR_LANGS, 1, {
      workerPath: base + 'worker.min.js',
      corePath: base + OCR_CORE_FILE, // a .js path is used as is: the loader's own SIMD detection (and its other core files) is bypassed
      langPath: base,
      gzip: false, // the data files are served as plain <lang>.traineddata (see vite.config.ts)
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

/** Draw a photo to a canvas no larger than maxSide (cheap native downscale) and read its pixels. */
async function readPixels(file: Blob, maxSide: number): Promise<{ data: Uint8ClampedArray; width: number; height: number }> {
  const bmp = await loadBitmap(file);
  const w0 = 'naturalWidth' in bmp ? bmp.naturalWidth : bmp.width;
  const h0 = 'naturalHeight' in bmp ? bmp.naturalHeight : bmp.height;
  const scale = Math.min(1, maxSide / Math.max(w0, h0));
  const c = document.createElement('canvas');
  c.width = Math.max(1, Math.round(w0 * scale));
  c.height = Math.max(1, Math.round(h0 * scale));
  const ctx = c.getContext('2d', { willReadFrequently: true })!;
  ctx.drawImage(bmp, 0, 0, c.width, c.height);
  return { data: ctx.getImageData(0, 0, c.width, c.height).data, width: c.width, height: c.height };
}

function toCanvas(g: GreyImage): HTMLCanvasElement {
  const c = document.createElement('canvas');
  c.width = g.width;
  c.height = g.height;
  const img = new ImageData(greyToRgba(g) as unknown as Uint8ClampedArray<ArrayBuffer>, g.width, g.height);
  c.getContext('2d')!.putImageData(img, 0, 0);
  return c;
}

export function tidy(text: string): string {
  return text.replace(/[ \t]+\n/g, '\n').replace(/\n{3,}/g, '\n\n').trim();
}

/** Anything of the Tesseract worker API that recognise needs (lets the Node benchmark pass its own worker). */
export interface Recogniser {
  recognize(image: never): Promise<{ data: { text: string; confidence: number } }>;
}

/**
 * Read a prepared page. A page photographed upside down comes back as low-confidence noise, and
 * ink statistics cannot tell it reliably (Tesseract's OSD data is not shipped offline), so when the
 * confidence is low the half-turned page is read too and the better of the two is kept.
 */
export async function recogniseGrey(
  w: Recogniser,
  g: GreyImage,
  toInput: (g: GreyImage) => unknown,
  lowConfidence = LOW_CONFIDENCE,
): Promise<{ text: string; confidence: number; turned: boolean }> {
  const first = (await w.recognize(toInput(g) as never)).data;
  if (first.confidence >= lowConfidence) return { text: first.text, confidence: first.confidence, turned: false };
  const second = (await w.recognize(toInput(rotate90(g, 2)) as never)).data;
  return second.confidence > first.confidence + 8
    ? { text: second.text, confidence: second.confidence, turned: true }
    : { text: first.text, confidence: first.confidence, turned: false };
}

export interface RecogniseOptions {
  prep?: Partial<PrepOptions> | false;
  onReport?: (r: PrepReport) => void;
}

export async function recognise(file: Blob, progress: (f: number) => void, opts: RecogniseOptions = {}): Promise<string> {
  onProgress = progress;
  try {
    const w = await getWorker();
    const prep = opts.prep === false ? { ...PREP_DEFAULT, crop: false, invert: false, normalise: false, orient: false, deskew: false, scale: false, binarise: false } : { ...PREP_DEFAULT, ...opts.prep };
    const px = await readPixels(file, prep.maxSide);
    const { image, report } = preprocess(px.data, px.width, px.height, prep);
    opts.onReport?.(report);
    const r = await recogniseGrey(w as unknown as Recogniser, image, toCanvas);
    return tidy(r.text);
  } finally {
    onProgress = null;
  }
}
