import { registerPlugin } from '@capacitor/core';
import { nativePlatform } from './native';

/**
 * iOS reads photos with Apple's Vision framework (SabiToriVisionPlugin.swift, on the device, no network):
 * tesseract.js in a Web Worker is unreliable in iOS WebKit (worker start-up, WebAssembly memory).
 * Android and the web keep tesseract.
 */
interface SabiToriVisionPlugin {
  recognize(opts: { image: string; languages?: string[] }): Promise<{ text: string; confidence: number; lines: number }>;
}

const Vision = registerPlugin<SabiToriVisionPlugin>('SabiToriVision');

/** Larger photos are scaled down before they cross the bridge as base64 (Vision reads 2400 px pages well). */
const MAX_SIDE = 2400;

export const hasNativeOcr = (): boolean => nativePlatform() === 'ios';

function blobToBase64(b: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result).replace(/^data:[^,]*,/, ''));
    r.onerror = () => reject(r.error ?? new Error('read failed'));
    r.readAsDataURL(b);
  });
}

/** A JPEG no larger than MAX_SIDE on its long side; the original when it cannot be decoded here (Vision decodes HEIC too). */
async function shrink(file: Blob): Promise<Blob> {
  try {
    const url = URL.createObjectURL(file);
    try {
      const img = new Image();
      img.src = url;
      await img.decode();
      const scale = Math.min(1, MAX_SIDE / Math.max(img.naturalWidth, img.naturalHeight));
      if (scale === 1 && file.size < 4_000_000) return file;
      const c = document.createElement('canvas');
      c.width = Math.max(1, Math.round(img.naturalWidth * scale));
      c.height = Math.max(1, Math.round(img.naturalHeight * scale));
      c.getContext('2d')!.drawImage(img, 0, 0, c.width, c.height);
      return await new Promise<Blob>((res) => c.toBlob((b) => res(b ?? file), 'image/jpeg', 0.9));
    } finally {
      URL.revokeObjectURL(url);
    }
  } catch {
    return file;
  }
}

export async function recogniseNative(file: Blob): Promise<{ text: string; confidence: number }> {
  const image = await blobToBase64(await shrink(file));
  const r = await Vision.recognize({ image, languages: ['fr-FR', 'en-US'] });
  return { text: r.text ?? '', confidence: r.confidence ?? 0 };
}
