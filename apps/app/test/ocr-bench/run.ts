/** Benchmark engine: preprocessing variants x tesseract.js (Node) x fact extraction. */
import { createCanvas, loadImage } from '@napi-rs/canvas';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { createWorker, type Worker } from 'tesseract.js';
import { extractFacts, type FactsContext, type ReadingLexicon, type RegionConfig } from '@sabitori/core';
import { greyToRgba, preprocessGrey, rgbaToGrey, resize, type GreyImage, type PrepOptions, type PrepReport } from '../../src/lib/ocr-prep';
import type { TruthEntry } from './generate';

const ROOT = resolve(__dirname, '../../../..');
const json = <T>(p: string) => JSON.parse(readFileSync(resolve(ROOT, p), 'utf8')) as T;
export const FACTS_CTX: FactsContext = {
  region: json<RegionConfig>('regions/CM/region.json'),
  lexicons: ['fr', 'en'].map((t) => json<ReadingLexicon>(`packs/${t}/reading.json`)),
  receivedAt: '2026-10-31',
};
export const LANG_PATH = resolve(__dirname, '../../public/ocr');

/* ------------------------------ metrics ------------------------------ */

const squash = (s: string) => s.replace(/\s+/g, ' ').trim();

export function levenshtein(a: string, b: string): number {
  if (!a.length) return b.length;
  if (!b.length) return a.length;
  let prev = new Uint32Array(b.length + 1);
  let cur = new Uint32Array(b.length + 1);
  for (let j = 0; j <= b.length; j++) prev[j] = j;
  for (let i = 1; i <= a.length; i++) {
    cur[0] = i;
    const ai = a.charCodeAt(i - 1);
    for (let j = 1; j <= b.length; j++) {
      const cost = ai === b.charCodeAt(j - 1) ? 0 : 1;
      cur[j] = Math.min(prev[j]! + 1, cur[j - 1]! + 1, prev[j - 1]! + cost);
    }
    [prev, cur] = [cur, prev];
  }
  return prev[b.length]!;
}

export const cer = (truth: string, got: string) => levenshtein(squash(truth), squash(got)) / Math.max(1, squash(truth).length);

export function factKeys(text: string): Set<string> {
  const f = extractFacts(text, FACTS_CTX);
  const s = new Set<string>();
  f.dates.forEach((x) => s.add(`d:${x.value}`));
  f.amounts.forEach((x) => s.add(`a:${x.value.amount}`));
  f.phones.forEach((x) => s.add(`p:${x.value}`));
  return s;
}

export interface FactScore {
  tp: number;
  fn: number;
  fp: number;
}
export function scoreFacts(expected: Set<string>, got: Set<string>): FactScore {
  let tp = 0;
  for (const k of expected) if (got.has(k)) tp++;
  return { tp, fn: expected.size - tp, fp: got.size - tp };
}

/* ------------------------------ pipelines ------------------------------ */

export interface Variant {
  name: string;
  /** null = the app's previous prepare(): downscale to 1800, grayscale, contrast 1.25 */
  prep: Partial<PrepOptions> | 'legacy';
  langs?: string[] | ((e: TruthEntry) => string[]);
  psm?: string;
}

export async function loadRgba(file: string): Promise<{ data: Uint8ClampedArray; width: number; height: number }> {
  const img = await loadImage(readFileSync(file));
  const c = createCanvas(img.width, img.height);
  const x = c.getContext('2d');
  x.drawImage(img, 0, 0);
  const d = x.getImageData(0, 0, img.width, img.height);
  return { data: d.data, width: img.width, height: img.height };
}

export function legacyPrep(rgba: Uint8ClampedArray, w: number, h: number): GreyImage {
  let g = rgbaToGrey(rgba, w, h);
  const k = Math.min(1, 1800 / Math.max(w, h));
  if (k < 1) g = resize(g, w * k, h * k);
  const out = new Uint8ClampedArray(g.data.length);
  for (let i = 0; i < out.length; i++) out[i] = (g.data[i]! - 128) * 1.25 + 128;
  return { data: out, width: g.width, height: g.height };
}

export function toPng(g: GreyImage): Buffer {
  const c = createCanvas(g.width, g.height);
  const x = c.getContext('2d');
  const id = x.createImageData(g.width, g.height);
  id.data.set(greyToRgba(g));
  x.putImageData(id, 0, 0);
  return c.toBuffer('image/png');
}

export interface Prepared {
  png: Buffer;
  prepMs: number;
  report: PrepReport | null;
}

export function prepare(rgba: { data: Uint8ClampedArray; width: number; height: number }, v: Variant): Prepared {
  const t0 = performance.now();
  let g: GreyImage;
  let report: PrepReport | null = null;
  if (v.prep === 'legacy') g = legacyPrep(rgba.data, rgba.width, rgba.height);
  else {
    const r = preprocessGrey(rgbaToGrey(rgba.data, rgba.width, rgba.height), v.prep);
    g = r.image;
    report = r.report;
  }
  const prepMs = performance.now() - t0; // the app hands pixels to Tesseract directly, no PNG round trip
  return { png: toPng(g), prepMs, report };
}

/* ------------------------------ ocr pool ------------------------------ */

export async function makeWorker(langs: string[], psm?: string): Promise<Worker> {
  const w = await createWorker(langs, 1, { langPath: LANG_PATH, gzip: true, cacheMethod: 'none' });
  if (psm) await w.setParameters({ tessedit_pageseg_mode: psm as never });
  return w;
}

export interface ImageResult {
  id: string;
  kind: string;
  cer: number;
  facts: FactScore;
  prepMs: number;
  ocrMs: number;
  text: string;
  report: PrepReport | null;
}

export interface VariantResult {
  name: string;
  langs: string;
  images: ImageResult[];
  cer: number;
  recall: number;
  precision: number;
  f1: number;
  perfect: number;
  prepMs: number;
  ocrMs: number;
  totalMs: number;
  maxTotalMs: number;
}

const langsOf = (v: Variant, e: TruthEntry): string[] => (typeof v.langs === 'function' ? v.langs(e) : v.langs ?? ['fra', 'eng']);

export async function runVariant(v: Variant, entries: TruthEntry[], dir: string, parallel: number, cache: Map<string, Awaited<ReturnType<typeof loadRgba>>>): Promise<VariantResult> {
  const prepped = new Map<string, Prepared>();
  for (const e of entries) {
    let px = cache.get(e.id);
    if (!px) cache.set(e.id, (px = await loadRgba(resolve(dir, e.file))));
    prepped.set(e.id, prepare(px, v));
  }
  // group by language set so each worker holds one model set
  const groups = new Map<string, TruthEntry[]>();
  for (const e of entries) {
    const k = langsOf(v, e).join('+');
    (groups.get(k) ?? groups.set(k, []).get(k)!).push(e);
  }
  const results = new Map<string, ImageResult>();
  for (const [k, list] of groups) {
    const workers = await Promise.all(Array.from({ length: Math.min(parallel, list.length) }, () => makeWorker(k.split('+'), v.psm)));
    let next = 0;
    await Promise.all(
      workers.map(async (w) => {
        while (next < list.length) {
          const e = list[next++]!;
          const p = prepped.get(e.id)!;
          const t0 = performance.now();
          const { data } = await w.recognize(p.png);
          const ocrMs = performance.now() - t0;
          const text = data.text;
          results.set(e.id, {
            id: e.id,
            kind: e.kind,
            cer: cer(e.text, text),
            facts: scoreFacts(factKeys(e.text), factKeys(text)),
            prepMs: p.prepMs,
            ocrMs,
            text,
            report: p.report,
          });
        }
        await w.terminate();
      }),
    );
  }
  const images = entries.map((e) => results.get(e.id)!);
  const sum = (f: (r: ImageResult) => number) => images.reduce((a, r) => a + f(r), 0);
  const tp = sum((r) => r.facts.tp);
  const fn = sum((r) => r.facts.fn);
  const fp = sum((r) => r.facts.fp);
  const recall = tp / Math.max(1, tp + fn);
  const precision = tp / Math.max(1, tp + fp);
  return {
    name: v.name,
    langs: typeof v.langs === 'function' ? 'by page' : (v.langs ?? ['fra', 'eng']).join('+'),
    images,
    cer: sum((r) => r.cer) / images.length,
    recall,
    precision,
    f1: (2 * recall * precision) / Math.max(1e-9, recall + precision),
    perfect: images.filter((r) => r.facts.fn === 0 && r.facts.fp === 0).length,
    prepMs: sum((r) => r.prepMs) / images.length,
    ocrMs: sum((r) => r.ocrMs) / images.length,
    totalMs: sum((r) => r.prepMs + r.ocrMs) / images.length,
    maxTotalMs: Math.max(...images.map((r) => r.prepMs + r.ocrMs)),
  };
}
