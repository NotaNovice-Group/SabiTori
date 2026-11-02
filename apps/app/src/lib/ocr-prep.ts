/**
 * Pre-processing for photographed paper before OCR.
 *
 * Pure typed-array code: no DOM, no canvas, no globals. It takes RGBA bytes (what
 * canvas.getImageData or node-canvas gives) and returns an 8-bit greyscale page, so it
 * runs unchanged on the main thread, in a Web Worker and in Node (tests / benchmark).
 *
 * Steps (each one can be switched off in PrepOptions):
 *   grey -> invert (dark mode) -> crop -> illumination -> sideways fix -> deskew -> rescale -> Sauvola
 *
 * Upside-down pages (180 degrees) cannot be told apart reliably from ink statistics, so ocr.ts handles
 * them by retrying with a half turn when Tesseract's own confidence is low.
 */

export interface GreyImage {
  data: Uint8ClampedArray;
  width: number;
  height: number;
}

export interface PrepOptions {
  /** Flip light-on-dark pages (dark-mode screenshots) to dark-on-light. */
  invert: boolean;
  /** Cut away desk / background around the page (edge peeling, only when clearly safe). */
  crop: boolean;
  /** Divide out uneven lighting and soft shadows. */
  normalise: boolean;
  /** Fix pages photographed sideways (90/270) by comparing horizontal and vertical line structure. */
  orient: boolean;
  /** Straighten small rotations (projection profile, +-maxSkew degrees). */
  deskew: boolean;
  /** Resample so text lines are about targetLine px tall (up to maxScale, down to fit maxSide). */
  scale: boolean;
  /** Sauvola adaptive threshold (output is pure black and white). */
  binarise: boolean;
  /** Longest side allowed for the working image (bounds time and memory on phones). */
  maxSide: number;
  /** Wanted height of a text line (ink band) in pixels. */
  targetLine: number;
  maxScale: number;
  maxSkew: number;
  sauvolaK: number;
}

export const PREP_OFF: PrepOptions = {
  invert: false,
  crop: false,
  normalise: false,
  orient: false,
  deskew: false,
  scale: false,
  binarise: false,
  maxSide: 1800,
  targetLine: 40,
  maxScale: 3,
  maxSkew: 15,
  sauvolaK: 0.2,
};

/** Chosen by fact accuracy on apps/app/test/ocr-bench (see RESULTS.md there). */
export const PREP_DEFAULT: PrepOptions = {
  ...PREP_OFF,
  invert: true,
  crop: true,
  normalise: true,
  orient: true,
  deskew: true,
  scale: true,
  binarise: false,
  maxSide: 2000,
  targetLine: 34,
};

export interface PrepReport {
  steps: string[];
  /** Rotation applied, degrees clockwise to the page (multiples of 90). */
  orientation: 0 | 90 | 180 | 270;
  /** Skew found in the text lines, degrees (positive = lines run down to the right). */
  skew: number;
  /** Final resample factor relative to the input. */
  scale: number;
  /** Median text-line height measured (output pixels), 0 if unknown. */
  lineHeight: number;
  cropped: boolean;
  inverted: boolean;
  width: number;
  height: number;
}

/* ------------------------------ basics ------------------------------ */

export function rgbaToGrey(rgba: ArrayLike<number>, width: number, height: number): GreyImage {
  const data = new Uint8ClampedArray(width * height);
  for (let i = 0, p = 0; i < data.length; i++, p += 4) {
    // integer BT.601 luma; alpha is ignored (camera frames are opaque)
    data[i] = (rgba[p]! * 77 + rgba[p + 1]! * 150 + rgba[p + 2]! * 29) >> 8;
  }
  return { data, width, height };
}

export function greyToRgba(g: GreyImage): Uint8ClampedArray {
  const out = new Uint8ClampedArray(g.width * g.height * 4);
  for (let i = 0, p = 0; i < g.data.length; i++, p += 4) {
    out[p] = out[p + 1] = out[p + 2] = g.data[i]!;
    out[p + 3] = 255;
  }
  return out;
}

export function invertGrey(g: GreyImage): GreyImage {
  const data = new Uint8ClampedArray(g.data.length);
  for (let i = 0; i < data.length; i++) data[i] = 255 - g.data[i]!;
  return { data, width: g.width, height: g.height };
}

export function otsu(data: ArrayLike<number>): number {
  const hist = new Float64Array(256);
  for (let i = 0; i < data.length; i++) hist[data[i]! | 0]!++;
  const total = data.length;
  let sumAll = 0;
  for (let t = 0; t < 256; t++) sumAll += t * hist[t]!;
  let wB = 0;
  let sumB = 0;
  let best = 0;
  let thr = 127;
  for (let t = 0; t < 256; t++) {
    wB += hist[t]!;
    if (wB === 0) continue;
    const wF = total - wB;
    if (wF === 0) break;
    sumB += t * hist[t]!;
    const d = sumB / wB - (sumAll - sumB) / wF;
    const between = wB * wF * d * d;
    if (between > best) {
      best = between;
      thr = t;
    }
  }
  return thr;
}

/** Box mean (and optionally std) over a (2r+1) window, clamped at the borders. O(n), O(w) extra memory. */
export function localStats(
  g: ArrayLike<number>,
  w: number,
  h: number,
  r: number,
  withStd = false,
): { mean: Float32Array; std: Float32Array | null } {
  const mean = new Float32Array(w * h);
  const std = withStd ? new Float32Array(w * h) : null;
  const col = new Float64Array(w);
  const col2 = new Float64Array(w);
  const P = new Float64Array(w + 1);
  const P2 = new Float64Array(w + 1);
  const addRow = (y: number, sign: 1 | -1) => {
    const o = y * w;
    for (let x = 0; x < w; x++) {
      const v = g[o + x]!;
      col[x]! += sign * v;
      if (withStd) col2[x]! += sign * v * v;
    }
  };
  for (let y = 0; y <= Math.min(r, h - 1); y++) addRow(y, 1);
  for (let y = 0; y < h; y++) {
    if (y > 0) {
      if (y + r < h) addRow(y + r, 1);
      if (y - r - 1 >= 0) addRow(y - r - 1, -1);
    }
    const rows = Math.min(h - 1, y + r) - Math.max(0, y - r) + 1;
    for (let x = 0; x < w; x++) {
      P[x + 1] = P[x]! + col[x]!;
      if (withStd) P2[x + 1] = P2[x]! + col2[x]!;
    }
    const o = y * w;
    for (let x = 0; x < w; x++) {
      const lo = Math.max(0, x - r);
      const hi = Math.min(w - 1, x + r);
      const n = (hi - lo + 1) * rows;
      const m = (P[hi + 1]! - P[lo]!) / n;
      mean[o + x] = m;
      if (std) {
        const v = (P2[hi + 1]! - P2[lo]!) / n - m * m;
        std[o + x] = v > 0 ? Math.sqrt(v) : 0;
      }
    }
  }
  return { mean, std };
}

/* ------------------------------ resampling ------------------------------ */

/** Area-average along one axis (for shrinking). */
function shrinkAxis(src: Float32Array, w: number, h: number, nw: number, nh: number): Float32Array {
  let cur = src;
  let cw = w;
  let ch = h;
  if (nw < w) {
    const out = new Float32Array(nw * ch);
    const k = w / nw;
    for (let y = 0; y < ch; y++) {
      for (let x = 0; x < nw; x++) {
        const a = x * k;
        const b = a + k;
        let i = Math.floor(a);
        let s = 0;
        while (i < b && i < w) {
          const cover = Math.min(b, i + 1) - Math.max(a, i);
          s += cur[y * cw + i]! * cover;
          i++;
        }
        out[y * nw + x] = s / k;
      }
    }
    cur = out;
    cw = nw;
  }
  if (nh < ch) {
    const out = new Float32Array(cw * nh);
    const k = ch / nh;
    for (let y = 0; y < nh; y++) {
      const a = y * k;
      const b = a + k;
      for (let x = 0; x < cw; x++) {
        let i = Math.floor(a);
        let s = 0;
        while (i < b && i < ch) {
          const cover = Math.min(b, i + 1) - Math.max(a, i);
          s += cur[i * cw + x]! * cover;
          i++;
        }
        out[y * cw + x] = s / k;
      }
    }
    cur = out;
    ch = nh;
  }
  return cur;
}

function bilinear(src: ArrayLike<number>, w: number, h: number, nw: number, nh: number): Float32Array {
  const out = new Float32Array(nw * nh);
  const sx = w / nw;
  const sy = h / nh;
  for (let y = 0; y < nh; y++) {
    const fy = Math.min(h - 1, Math.max(0, (y + 0.5) * sy - 0.5));
    const y0 = Math.floor(fy);
    const y1 = Math.min(h - 1, y0 + 1);
    const ty = fy - y0;
    for (let x = 0; x < nw; x++) {
      const fx = Math.min(w - 1, Math.max(0, (x + 0.5) * sx - 0.5));
      const x0 = Math.floor(fx);
      const x1 = Math.min(w - 1, x0 + 1);
      const tx = fx - x0;
      const a = src[y0 * w + x0]! * (1 - tx) + src[y0 * w + x1]! * tx;
      const b = src[y1 * w + x0]! * (1 - tx) + src[y1 * w + x1]! * tx;
      out[y * nw + x] = a * (1 - ty) + b * ty;
    }
  }
  return out;
}

/** Resize with area averaging when shrinking and bilinear when growing. */
export function resize(g: GreyImage, nw: number, nh: number): GreyImage {
  nw = Math.max(1, Math.round(nw));
  nh = Math.max(1, Math.round(nh));
  if (nw === g.width && nh === g.height) return g;
  let f: Float32Array = Float32Array.from(g.data);
  let w = g.width;
  let h = g.height;
  if (nw < w || nh < h) {
    f = shrinkAxis(f, w, h, Math.min(nw, w), Math.min(nh, h));
    w = Math.min(nw, w);
    h = Math.min(nh, h);
  }
  if (nw > w || nh > h) {
    f = bilinear(f, w, h, nw, nh);
  }
  const data = new Uint8ClampedArray(nw * nh);
  for (let i = 0; i < data.length; i++) data[i] = f[i]!;
  return { data, width: nw, height: nh };
}

function fitSide(g: GreyImage, maxSide: number): GreyImage {
  const k = Math.min(1, maxSide / Math.max(g.width, g.height));
  return k < 1 ? resize(g, g.width * k, g.height * k) : g;
}

/* ------------------------------ rotation ------------------------------ */

/** Rotate by multiples of 90 degrees clockwise. */
export function rotate90(g: GreyImage, quarterTurns: number): GreyImage {
  const q = ((quarterTurns % 4) + 4) % 4;
  if (q === 0) return g;
  const { width: w, height: h, data } = g;
  if (q === 2) {
    const out = new Uint8ClampedArray(data.length);
    for (let i = 0; i < data.length; i++) out[data.length - 1 - i] = data[i]!;
    return { data: out, width: w, height: h };
  }
  const out = new Uint8ClampedArray(data.length);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      // q=1: (x,y) -> (h-1-y, x); q=3: (x,y) -> (y, w-1-x)
      if (q === 1) out[x * h + (h - 1 - y)] = data[y * w + x]!;
      else out[(w - 1 - x) * h + y] = data[y * w + x]!;
    }
  }
  return { data: out, width: h, height: w };
}

/** Rotate by `deg` clockwise (image coords) about the centre, growing the canvas, filling with `fill`. */
export function rotate(g: GreyImage, deg: number, fill = 255): GreyImage {
  if (Math.abs(deg) < 0.01) return g;
  const t = (deg * Math.PI) / 180;
  const c = Math.cos(t);
  const s = Math.sin(t);
  const { width: w, height: h, data } = g;
  const nw = Math.ceil(Math.abs(w * c) + Math.abs(h * s));
  const nh = Math.ceil(Math.abs(w * s) + Math.abs(h * c));
  const out = new Uint8ClampedArray(nw * nh).fill(fill);
  const cx = (w - 1) / 2;
  const cy = (h - 1) / 2;
  const ncx = (nw - 1) / 2;
  const ncy = (nh - 1) / 2;
  for (let y = 0; y < nh; y++) {
    const dy = y - ncy;
    for (let x = 0; x < nw; x++) {
      const dx = x - ncx;
      // inverse of a clockwise rotation by t (y points down)
      const sx = c * dx + s * dy + cx;
      const sy = -s * dx + c * dy + cy;
      if (sx < 0 || sy < 0 || sx > w - 1 || sy > h - 1) continue;
      const x0 = Math.floor(sx);
      const y0 = Math.floor(sy);
      const x1 = Math.min(w - 1, x0 + 1);
      const y1 = Math.min(h - 1, y0 + 1);
      const tx = sx - x0;
      const ty = sy - y0;
      const a = data[y0 * w + x0]! * (1 - tx) + data[y0 * w + x1]! * tx;
      const b = data[y1 * w + x0]! * (1 - tx) + data[y1 * w + x1]! * tx;
      out[y * nw + x] = a * (1 - ty) + b * ty;
    }
  }
  return { data: out, width: nw, height: nh };
}

/* ------------------------------ crop ------------------------------ */

export interface Box {
  x: number;
  y: number;
  w: number;
  h: number;
}

/**
 * Find the page inside a photo of a page on a darker surface by peeling background-looking rows
 * and columns off each edge. It only ever removes a border it is sure about: if the picture is
 * mostly paper, or lit unevenly, it returns the full frame.
 */
export function findDocumentBox(g: GreyImage): Box {
  const full = { x: 0, y: 0, w: g.width, h: g.height };
  const small = fitSide(g, 240);
  const { width: w, height: h, data } = small;
  // reference paper level: 80th percentile of the central half
  const hist = new Uint32Array(256);
  let n = 0;
  for (let y = h >> 2; y < h - (h >> 2); y++) {
    for (let x = w >> 2; x < w - (w >> 2); x++) {
      hist[data[y * w + x]!]!++;
      n++;
    }
  }
  let acc = 0;
  let ref = 255;
  for (let t = 255; t >= 0; t--) {
    acc += hist[t]!;
    if (acc >= n * 0.2) {
      ref = t;
      break;
    }
  }
  const lim = ref * 0.62;
  const rowBright = (y: number) => {
    let c = 0;
    for (let x = 0; x < w; x++) if (data[y * w + x]! >= lim) c++;
    return c / w;
  };
  const colBright = (x: number) => {
    let c = 0;
    for (let y = 0; y < h; y++) if (data[y * w + x]! >= lim) c++;
    return c / h;
  };
  const need = 0.3;
  let top = 0;
  while (top < h / 2 && rowBright(top) < need) top++;
  let bottom = h - 1;
  while (bottom > h / 2 && rowBright(bottom) < need) bottom--;
  let left = 0;
  while (left < w / 2 && colBright(left) < need) left++;
  let right = w - 1;
  while (right > w / 2 && colBright(right) < need) right--;
  const kx = g.width / w;
  const ky = g.height / h;
  // The found edge still carries a thin dark rim of desk and a ragged tilted corner: step inside it.
  const inset = 0.012 * Math.min(g.width, g.height);
  const x0 = Math.max(0, Math.floor(left * kx + inset));
  const y0 = Math.max(0, Math.floor(top * ky + inset));
  const x1 = Math.min(g.width, Math.ceil((right + 1) * kx - inset));
  const y1 = Math.min(g.height, Math.ceil((bottom + 1) * ky - inset));
  const box = { x: x0, y: y0, w: x1 - x0, h: y1 - y0 };
  const kept = (box.w * box.h) / (g.width * g.height);
  // not worth it for a few percent, and never trust a tiny result
  if (kept > 0.93 || kept < 0.3) return full;
  return box;
}

export function cropTo(g: GreyImage, b: Box): GreyImage {
  if (b.w === g.width && b.h === g.height) return g;
  const out = new Uint8ClampedArray(b.w * b.h);
  for (let y = 0; y < b.h; y++) {
    const o = (b.y + y) * g.width + b.x;
    out.set(g.data.subarray(o, o + b.w), y * b.w);
  }
  return { data: out, width: b.w, height: b.h };
}

/* ------------------------------ illumination ------------------------------ */

function maxFilter(src: Float32Array, w: number, h: number, r: number, min: boolean): Float32Array {
  const pick = min ? Math.min : Math.max;
  const tmp = new Float32Array(w * h);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      let v = src[y * w + x]!;
      for (let k = Math.max(0, x - r); k <= Math.min(w - 1, x + r); k++) v = pick(v, src[y * w + k]!);
      tmp[y * w + x] = v;
    }
  }
  const out = new Float32Array(w * h);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      let v = tmp[y * w + x]!;
      for (let k = Math.max(0, y - r); k <= Math.min(h - 1, y + r); k++) v = pick(v, tmp[k * w + x]!);
      out[y * w + x] = v;
    }
  }
  return out;
}

/**
 * Estimate the paper brightness (text removed by a grey closing on a small copy, then smoothed)
 * and divide it out: shadows and light gradients flatten, paper goes to white, ink stays dark.
 */
export function normaliseIllumination(g: GreyImage): GreyImage {
  const { width: w, height: h } = g;
  const small = fitSide(g, 320);
  const sw = small.width;
  const sh = small.height;
  const f = Float32Array.from(small.data);
  const rc = Math.max(2, Math.round(Math.max(sw, sh) / 70)); // wider than any stroke or small glyph
  const closed = maxFilter(maxFilter(f, sw, sh, rc, false), sw, sh, rc, true);
  const sm = localStats(closed, sw, sh, Math.max(2, rc), false).mean;
  const bgSmall: GreyImage = { data: new Uint8ClampedArray(sw * sh), width: sw, height: sh };
  const bg32 = bilinear(sm, sw, sh, w, h);
  void bgSmall;
  const out = new Uint8ClampedArray(w * h);
  for (let i = 0; i < out.length; i++) {
    const b = Math.max(24, bg32[i]!);
    out[i] = (g.data[i]! * 250) / b; // 250 not 255: leave a little headroom so paper noise does not clip to ink-free white speckle
  }
  return { data: out, width: w, height: h };
}

/* ------------------------------ sauvola ------------------------------ */

/** Sauvola adaptive threshold: T = m (1 + k (s/R - 1)). Output is 0 or 255. */
export function sauvola(g: GreyImage, radius: number, k = 0.2, R = 128): GreyImage {
  const { width: w, height: h, data } = g;
  const { mean, std } = localStats(data, w, h, Math.max(2, Math.round(radius)), true);
  const out = new Uint8ClampedArray(w * h);
  for (let i = 0; i < out.length; i++) {
    const t = mean[i]! * (1 + k * (std![i]! / R - 1));
    out[i] = data[i]! > t ? 255 : 0;
  }
  return { data: out, width: w, height: h };
}

/* ------------------------------ page analysis ------------------------------ */

interface Ink {
  w: number;
  h: number;
  /** 1 where ink */
  mask: Uint8Array;
}

export function inkMask(g: GreyImage, maxSide: number): Ink {
  const s = fitSide(g, maxSide);
  // threshold between ink and paper; clamp so a blank/uniform page does not turn to noise
  const thr = Math.min(165, Math.max(60, otsu(s.data)));
  const mask = new Uint8Array(s.width * s.height);
  // ignore a thin frame: leftovers of the desk edge there are not text
  const bx = Math.round(s.width * 0.015);
  const by = Math.round(s.height * 0.015);
  for (let y = by; y < s.height - by; y++) {
    for (let x = bx; x < s.width - bx; x++) mask[y * s.width + x] = s.data[y * s.width + x]! < thr ? 1 : 0;
  }
  return { w: s.width, h: s.height, mask };
}

/** Row ink counts after rotating the page by `deg` (nearest-bin projection of the ink pixels). */
export function projection(ink: Ink, deg: number, step: number): Float64Array {
  const t = (deg * Math.PI) / 180;
  const c = Math.cos(t);
  const s = Math.sin(t);
  const cx = ink.w / 2;
  const cy = ink.h / 2;
  const span = Math.ceil(Math.hypot(ink.w, ink.h)) + 2;
  const prof = new Float64Array(span);
  const off = span / 2;
  for (let y = 0; y < ink.h; y += step) {
    for (let x = 0; x < ink.w; x += step) {
      if (!ink.mask[y * ink.w + x]) continue;
      // y coordinate after rotating the page clockwise by deg
      const ry = -s * (x - cx) + c * (y - cy);
      prof[Math.round(ry + off)]!++;
    }
  }
  return prof;
}

export function sharpnessOf(prof: Float64Array): number {
  // sum of squared differences between neighbouring rows: large when ink is stacked into crisp lines
  let sum = 0;
  for (let i = 1; i < prof.length; i++) {
    const d = prof[i]! - prof[i - 1]!;
    sum += d * d;
  }
  return sum;
}

/** Best projection angle within +-range of `centre`: coarse 1 degree steps, then 0.15 refinement. */
export function searchAngle(ink: Ink, centre: number, range: number, step: number): { angle: number; score: number } {
  let best = centre;
  let bestS = -1;
  for (let a = centre - range; a <= centre + range + 1e-9; a += 1) {
    const sc = sharpnessOf(projection(ink, a, step));
    if (sc > bestS) {
      bestS = sc;
      best = a;
    }
  }
  for (let a = best - 0.9; a <= best + 0.9 + 1e-9; a += 0.15) {
    const sc = sharpnessOf(projection(ink, a, step));
    if (sc > bestS) {
      bestS = sc;
      best = a;
    }
  }
  return { angle: best, score: bestS };
}

export interface SkewResult {
  /** Skew of the text lines in degrees (positive = lines descend to the right); 0 when unclear. */
  angle: number;
  /** True when the lines run vertically (page photographed sideways). */
  sideways: boolean;
  /** Score of vertical lines over horizontal lines (0 when not checked). */
  ratio: number;
}

export const SIDEWAYS_RATIO = 3;

/** Skew by projection profile on a downscaled ink map; also tells whether the page is sideways. */
export function estimateSkew(g: GreyImage, maxSkew = 15, checkSideways = false): SkewResult {
  let sidewaysRatio = 0;
  const ink = inkMask(g, 700);
  let count = 0;
  for (let i = 0; i < ink.mask.length; i++) count += ink.mask[i]!;
  if (count < 200) return { angle: 0, sideways: false, ratio: 0 };
  const step = 1; // never subsample: a stride aliases with the 1-px projection bins and fakes crisp lines
  const h = searchAngle(ink, 0, maxSkew, step);
  const s0 = sharpnessOf(projection(ink, 0, step));
  if (checkSideways) {
    const v = searchAngle(ink, 90, maxSkew, step);
    // a page of vertical lines scores clearly higher at 90 than any upright reading does at 0
    sidewaysRatio = v.score / h.score;
    if (sidewaysRatio > SIDEWAYS_RATIO) return { angle: 0, sideways: true, ratio: sidewaysRatio };
  }
  // require a real peak: a page of rotated lines scores clearly above the unrotated reading
  if (Math.abs(h.angle) < 0.2 || h.score < s0 * 1.08) return { angle: 0, sideways: false, ratio: sidewaysRatio };
  return { angle: h.angle, sideways: false, ratio: sidewaysRatio };
}

/** Text-line bands (start,end) in ink-image rows from a row profile. */
function bands(prof: Float64Array): Array<[number, number]> {
  // reference level: upper quartile of the non-empty rows, so a ruled line or table border
  // (which fills a whole row) does not push every text row under the threshold
  const nz: number[] = [];
  for (let i = 0; i < prof.length; i++) if (prof[i]! > 0) nz.push(prof[i]!);
  if (nz.length < 5) return [];
  nz.sort((a, b) => a - b);
  const thr = nz[Math.floor(nz.length * 0.75)]! * 0.2;
  const out: Array<[number, number]> = [];
  let start = -1;
  for (let i = 0; i <= prof.length; i++) {
    const on = i < prof.length && prof[i]! > thr;
    if (on && start < 0) start = i;
    if (!on && start >= 0) {
      if (i - start >= 3) out.push([start, i - 1]);
      start = -1;
    }
  }
  return out;
}

/** Median height of the text-line ink bands, in pixels of `g`. 0 when unknown. */
export function estimateLineHeight(g: GreyImage): number {
  const ink = inkMask(g, 1000);
  const prof = new Float64Array(ink.h);
  for (let y = 0; y < ink.h; y++) {
    let c = 0;
    for (let x = 0; x < ink.w; x++) c += ink.mask[y * ink.w + x]!;
    prof[y] = c;
  }
  const bs = bands(prof);
  if (bs.length < 3) return 0;
  const hs = bs.map(([a, b]) => b - a + 1).sort((p, q) => p - q);
  const med = hs[hs.length >> 1]!;
  return (med * g.width) / ink.w;
}

/**
 * Light text on a dark background (dark-mode screenshots). A photographed page is never this dark:
 * cameras expose for the paper, so its median stays well above the median of a dark UI.
 *
 * Measured at the working resolution, not on a thumbnail: thin light strokes on a large dark screen are a
 * fraction of a percent of the pixels, and a 200 px thumbnail averages them away (the reviewer's dark SMS
 * screenshot: 99.8th percentile 238 at full size, under 130 at 200 px). Conditions: most of the image is
 * dark (median < 80 and at least half the pixels under 80), and there is a real amount of clearly bright
 * ink (at least 0.1 % of the pixels above max(130, 2.2 x median)).
 */
export function isLightOnDark(g: GreyImage): boolean {
  const n = g.data.length;
  if (!n) return false;
  const hist = new Uint32Array(256);
  for (let i = 0; i < n; i++) hist[g.data[i]!]!++;
  let acc = 0;
  let med = 255;
  for (let t = 0; t < 256; t++) {
    acc += hist[t]!;
    if (acc >= n * 0.5) {
      med = t;
      break;
    }
  }
  if (med >= 80) return false;
  let dark = 0;
  for (let t = 0; t < 80; t++) dark += hist[t]!;
  const brightFrom = Math.max(130, Math.ceil(med * 2.2));
  let bright = 0;
  for (let t = brightFrom; t < 256; t++) bright += hist[t]!;
  return dark >= n * 0.5 && bright >= n * 0.001;
}

/* ------------------------------ pipeline ------------------------------ */

export function preprocessGrey(input: GreyImage, opts: Partial<PrepOptions> = {}): { image: GreyImage; report: PrepReport } {
  const o: PrepOptions = { ...PREP_DEFAULT, ...opts };
  const steps: string[] = [];
  const report: PrepReport = {
    steps,
    orientation: 0,
    skew: 0,
    scale: 1,
    lineHeight: 0,
    cropped: false,
    inverted: false,
    width: input.width,
    height: input.height,
  };
  let g = fitSide(input, o.maxSide);
  if (g !== input) steps.push('fit');
  if (o.invert && isLightOnDark(g)) {
    g = invertGrey(g);
    report.inverted = true;
    steps.push('invert');
  }
  if (o.crop) {
    const box = findDocumentBox(g);
    if (box.w !== g.width || box.h !== g.height) {
      g = cropTo(g, box);
      report.cropped = true;
      steps.push('crop');
    }
  }
  if (o.normalise) {
    g = normaliseIllumination(g);
    steps.push('normalise');
  }
  if (o.orient || o.deskew) {
    let quarter = 0;
    let sk = estimateSkew(g, o.maxSkew, o.orient);
    if (sk.sideways) {
      g = rotate90(g, 1);
      quarter = 1;
      sk = estimateSkew(g, o.maxSkew, false);
    }
    if (o.deskew && sk.angle) {
      g = rotate(g, -sk.angle, 255);
      report.skew = sk.angle;
      steps.push('deskew');
    }
    if (quarter) {
      report.orientation = (quarter * 90) as 90 | 180 | 270;
      steps.push(`orient${quarter * 90}`);
    }
  }
  if (o.scale || o.binarise) {
    report.lineHeight = estimateLineHeight(g);
  }
  if (o.scale && report.lineHeight > 0) {
    let k = o.targetLine / report.lineHeight;
    k = Math.min(o.maxScale, Math.max(0.6, k));
    // do not exceed maxSide when growing
    k = Math.min(k, o.maxSide / Math.max(g.width, g.height));
    if (Math.abs(k - 1) > 0.12) {
      g = resize(g, g.width * k, g.height * k);
      report.scale = k;
      report.lineHeight *= k;
      steps.push('scale');
    }
  }
  if (o.binarise) {
    const lh = report.lineHeight || 30;
    g = sauvola(g, Math.max(8, Math.round(lh * 0.9)), o.sauvolaK);
    steps.push('sauvola');
  }
  report.width = g.width;
  report.height = g.height;
  return { image: g, report };
}

/** Pre-process RGBA pixels (canvas ImageData.data). */
export function preprocess(
  rgba: ArrayLike<number>,
  width: number,
  height: number,
  opts: Partial<PrepOptions> = {},
): { image: GreyImage; report: PrepReport } {
  return preprocessGrey(rgbaToGrey(rgba, width, height), opts);
}
