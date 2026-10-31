/**
 * Sharpness check: variance of the Laplacian on a small greyscale copy.
 * A blurred page has almost no edges, so the variance collapses.
 */
export const SHARPNESS_SIZE = 512;
/** Below this variance (on a 512px greyscale copy) the photo is asked to be retaken. */
export const SHARPNESS_MIN = 45;

export function toGrey(rgba: Uint8ClampedArray | Uint8Array, w: number, h: number): Float32Array {
  const g = new Float32Array(w * h);
  for (let i = 0, p = 0; i < g.length; i++, p += 4) {
    g[i] = 0.299 * rgba[p]! + 0.587 * rgba[p + 1]! + 0.114 * rgba[p + 2]!;
  }
  return g;
}

export function laplacianVariance(grey: Float32Array, w: number, h: number): number {
  if (w < 3 || h < 3) return 0;
  let sum = 0;
  let sumSq = 0;
  let n = 0;
  for (let y = 1; y < h - 1; y++) {
    for (let x = 1; x < w - 1; x++) {
      const i = y * w + x;
      const v = grey[i - w]! + grey[i + w]! + grey[i - 1]! + grey[i + 1]! - 4 * grey[i]!;
      sum += v;
      sumSq += v * v;
      n++;
    }
  }
  const mean = sum / n;
  return sumSq / n - mean * mean;
}

export function isSharp(variance: number): boolean {
  return variance >= SHARPNESS_MIN;
}

export async function loadBitmap(file: Blob): Promise<ImageBitmap | HTMLImageElement> {
  if (typeof createImageBitmap === 'function') {
    try {
      return await createImageBitmap(file, { imageOrientation: 'from-image' });
    } catch {
      /* fall through */
    }
  }
  const url = URL.createObjectURL(file);
  try {
    const img = new Image();
    img.src = url;
    await img.decode();
    return img;
  } finally {
    setTimeout(() => URL.revokeObjectURL(url), 10_000);
  }
}

/** Measure a photo. Resolves to Infinity if it cannot be measured (never block the person). */
export async function measureSharpness(file: Blob): Promise<number> {
  try {
    const bmp = await loadBitmap(file);
    const w0 = 'naturalWidth' in bmp ? bmp.naturalWidth : bmp.width;
    const h0 = 'naturalHeight' in bmp ? bmp.naturalHeight : bmp.height;
    const scale = Math.min(1, SHARPNESS_SIZE / Math.max(w0, h0));
    const w = Math.max(3, Math.round(w0 * scale));
    const h = Math.max(3, Math.round(h0 * scale));
    const c = document.createElement('canvas');
    c.width = w;
    c.height = h;
    const ctx = c.getContext('2d', { willReadFrequently: true });
    if (!ctx) return Infinity;
    ctx.drawImage(bmp, 0, 0, w, h);
    const data = ctx.getImageData(0, 0, w, h).data;
    return laplacianVariance(toGrey(data, w, h), w, h);
  } catch {
    return Infinity;
  }
}
