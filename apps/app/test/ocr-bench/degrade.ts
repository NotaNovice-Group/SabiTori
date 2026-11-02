/**
 * Turn a clean rendered page into something a cheap phone camera would produce:
 * perspective tilt (+-8 deg), in-plane rotation (+-5 deg), desk background, uneven light,
 * crumple shadows, low resolution, blur, sensor noise and JPEG artefacts. Seeded, so reproducible.
 */
import { createCanvas, loadImage, type Canvas } from '@napi-rs/canvas';
import { rng } from './docs';

type Pt = [number, number];

/** Solve 8x8 for the homography that maps `from` quad to `to` quad. Returns [a..h] with i = 1. */
function homography(from: Pt[], to: Pt[]): number[] {
  const A: number[][] = [];
  for (let i = 0; i < 4; i++) {
    const [x, y] = from[i]!;
    const [u, v] = to[i]!;
    A.push([x, y, 1, 0, 0, 0, -u * x, -u * y, u]);
    A.push([0, 0, 0, x, y, 1, -v * x, -v * y, v]);
  }
  for (let c = 0; c < 8; c++) {
    let p = c;
    for (let r = c + 1; r < 8; r++) if (Math.abs(A[r]![c]!) > Math.abs(A[p]![c]!)) p = r;
    [A[c], A[p]] = [A[p]!, A[c]!];
    for (let r = 0; r < 8; r++) {
      if (r === c) continue;
      const f = A[r]![c]! / A[c]![c]!;
      for (let k = c; k < 9; k++) A[r]![k]! -= f * A[c]![k]!;
    }
  }
  return A.map((row, i) => row[8]! / row[i]!);
}

export interface Params {
  tiltX: number;
  tiltY: number;
  rotate: number;
  shadow: number;
  crumple: number;
  blur: number;
  noise: number;
  jpeg: number;
  longSide: number;
  desk: boolean;
}

export function paramsFor(severity: number, seed: number, screen: boolean): Params {
  const r = rng(seed ^ 0x9e3779b9);
  const sign = () => (r() < 0.5 ? -1 : 1);
  const s = severity;
  if (screen) {
    return {
      tiltX: sign() * 1.5 * s * r(),
      tiltY: sign() * 1.5 * s * r(),
      rotate: sign() * 1.5 * s * r(),
      shadow: 0.1 * s,
      crumple: 0,
      blur: 0.4 + 0.8 * s,
      noise: 2 + 8 * s,
      jpeg: Math.round(78 - 40 * s),
      longSide: Math.round(1500 - 700 * s),
      desk: false,
    };
  }
  return {
    tiltX: sign() * (1 + 7 * s) * (0.5 + 0.5 * r()),
    tiltY: sign() * (1 + 7 * s) * (0.5 + 0.5 * r()),
    rotate: sign() * (0.5 + 4.5 * s) * (0.6 + 0.4 * r()),
    shadow: 0.12 + 0.4 * s,
    crumple: s > 0.3 ? 0.05 + 0.12 * s : 0,
    blur: 0.4 + 0.75 * s,
    noise: 3 + 11 * s,
    jpeg: Math.round(72 - 40 * s),
    longSide: Math.round(1600 - 650 * s),
    desk: true,
  };
}

export async function degrade(page: Canvas, p: Params, seed: number): Promise<Buffer> {
  const r = rng(seed);
  const W = page.width;
  const H = page.height;
  // photo canvas is a bit larger than the page so the desk shows
  const PW = Math.round(W * (p.desk ? 1.22 : 1.0));
  const PH = Math.round(H * (p.desk ? 1.16 : 1.0));
  // project the page rotated in 3D (x/y tilt) and in-plane, camera focal length ~ 1.1 W
  const f = 1.1 * W;
  const rad = (d: number) => (d * Math.PI) / 180;
  const ax = rad(p.tiltX);
  const ay = rad(p.tiltY);
  const az = rad(p.rotate);
  const proj = (x: number, y: number): Pt => {
    let X = x - W / 2;
    let Y = y - H / 2;
    let Z = 0;
    // rotate about x
    let y1 = Y * Math.cos(ax) - Z * Math.sin(ax);
    let z1 = Y * Math.sin(ax) + Z * Math.cos(ax);
    Y = y1;
    Z = z1;
    // rotate about y
    const x1 = X * Math.cos(ay) + Z * Math.sin(ay);
    z1 = -X * Math.sin(ay) + Z * Math.cos(ay);
    X = x1;
    Z = z1;
    // in-plane
    const x2 = X * Math.cos(az) - Y * Math.sin(az);
    y1 = X * Math.sin(az) + Y * Math.cos(az);
    const k = f / (f + Z);
    return [x2 * k, y1 * k];
  };
  const corners: Pt[] = [proj(0, 0), proj(W, 0), proj(W, H), proj(0, H)];
  const minX = Math.min(...corners.map((c) => c[0]));
  const maxX = Math.max(...corners.map((c) => c[0]));
  const minY = Math.min(...corners.map((c) => c[1]));
  const maxY = Math.max(...corners.map((c) => c[1]));
  const fit = Math.min((PW * (p.desk ? 0.9 : 0.99)) / (maxX - minX), (PH * (p.desk ? 0.92 : 0.99)) / (maxY - minY));
  const jx = p.desk ? (r() - 0.5) * 0.04 * PW : 0;
  const jy = p.desk ? (r() - 0.5) * 0.03 * PH : 0;
  const dest: Pt[] = corners.map(([x, y]) => [PW / 2 + (x - (minX + maxX) / 2) * fit + jx, PH / 2 + (y - (minY + maxY) / 2) * fit + jy]);
  const src: Pt[] = [[0, 0], [W, 0], [W, H], [0, H]];
  const hm = homography(dest, src); // dest pixel -> source page coordinate

  const sctx = page.getContext('2d');
  const sdata = sctx.getImageData(0, 0, W, H).data;
  const out = createCanvas(PW, PH);
  const octx = out.getContext('2d');
  const img = octx.createImageData(PW, PH);
  const d = img.data;
  const deskBase = [58 + r() * 30, 42 + r() * 20, 30 + r() * 15];
  const [a, b, c, e, g, h, i2, j2] = hm as [number, number, number, number, number, number, number, number];
  // lighting model
  const dirA = r() * Math.PI * 2;
  const gx = Math.cos(dirA);
  const gy = Math.sin(dirA);
  const blobs = Array.from({ length: 2 }, () => ({ x: r() * PW, y: r() * PH, rx: PW * (0.2 + 0.25 * r()), ry: PH * (0.15 + 0.2 * r()), k: r() < 0.6 ? p.shadow * (0.5 + 0.5 * r()) : 0 }));
  // creases: a dark line with a bright shoulder, soft, long, at random angles; plus slow paper waviness
  const creases = p.crumple
    ? Array.from({ length: 3 + Math.floor(r() * 3) }, () => {
        const ang = r() * Math.PI;
        const nx = Math.cos(ang);
        const ny = Math.sin(ang);
        return { nx, ny, off: nx * r() * PW + ny * r() * PH, w: (5 + 9 * r()) * (PW / 1200), k: p.crumple * (0.5 + r()) * (r() < 0.5 ? -1 : 1) };
      })
    : [];
  const waveAng = r() * Math.PI;
  const waveF = (1 / (220 + 120 * r())) * 6.283;
  const waveP = r() * 6.28;
  for (let y = 0; y < PH; y++) {
    for (let x = 0; x < PW; x++) {
      const w = i2 * x + j2 * y + 1;
      const sx = (a * x + b * y + c) / w;
      const sy = (e * x + g * y + h) / w;
      const o = (y * PW + x) * 4;
      let R: number;
      let G: number;
      let B: number;
      if (sx >= 0 && sy >= 0 && sx < W - 1 && sy < H - 1) {
        const x0 = sx | 0;
        const y0 = sy | 0;
        const tx = sx - x0;
        const ty = sy - y0;
        const q = (y0 * W + x0) * 4;
        const q2 = q + W * 4;
        const ch = (k: number) => (sdata[q + k]! * (1 - tx) + sdata[q + 4 + k]! * tx) * (1 - ty) + (sdata[q2 + k]! * (1 - tx) + sdata[q2 + 4 + k]! * tx) * ty;
        R = ch(0);
        G = ch(1);
        B = ch(2);
      } else {
        const t = 0.92 + 0.12 * Math.sin(x * 0.011 + Math.sin(y * 0.007) * 3);
        R = deskBase[0]! * t;
        G = deskBase[1]! * t;
        B = deskBase[2]! * t;
      }
      // light: linear gradient + soft shadow blobs + crumple waves
      let L = 1 - p.shadow * 0.8 * (((x - PW / 2) * gx + (y - PH / 2) * gy) / Math.hypot(PW, PH) + 0.5);
      for (const bl of blobs) {
        if (!bl.k) continue;
        const dx = (x - bl.x) / bl.rx;
        const dy = (y - bl.y) / bl.ry;
        L -= bl.k * Math.exp(-(dx * dx + dy * dy) * 1.5);
      }
      if (p.crumple) {
        for (const c of creases) {
          const dd = x * c.nx + y * c.ny - c.off;
          L += c.k * (Math.exp(-(((dd - c.w) / c.w) ** 2)) - Math.exp(-(((dd + c.w) / c.w) ** 2)));
        }
        L += p.crumple * 0.35 * Math.sin((x * Math.cos(waveAng) + y * Math.sin(waveAng)) * waveF + waveP);
      }
      L = Math.max(0.25, L);
      d[o] = Math.min(255, R * L);
      d[o + 1] = Math.min(255, G * L * 0.97);
      d[o + 2] = Math.min(255, B * L * 0.92); // warm cast
      d[o + 3] = 255;
    }
  }
  octx.putImageData(img, 0, 0);

  // low resolution
  const k = Math.min(1, p.longSide / Math.max(PW, PH));
  const FW = Math.round(PW * k);
  const FH = Math.round(PH * k);
  const small = createCanvas(FW, FH);
  const sc = small.getContext('2d');
  sc.imageSmoothingQuality = 'low';
  sc.drawImage(out, 0, 0, FW, FH);
  // blur (separable box x2 ~ gaussian) at final resolution
  const px = sc.getImageData(0, 0, FW, FH);
  boxBlur(px.data, FW, FH, p.blur);
  // sensor noise
  const nr = rng(seed + 7);
  const D = px.data;
  for (let o = 0; o < D.length; o += 4) {
    const n = (nr() + nr() + nr() - 1.5) * 2 * p.noise;
    D[o]! += n + (nr() - 0.5) * p.noise * 0.3;
    D[o + 1]! += n;
    D[o + 2]! += n + (nr() - 0.5) * p.noise * 0.3;
  }
  sc.putImageData(px, 0, 0);
  return small.encode('jpeg', Math.max(10, p.jpeg));
}

/** Two-pass box blur with fractional radius (variance close to a gaussian of sigma = radius). */
function boxBlur(data: Uint8ClampedArray, w: number, h: number, sigma: number): void {
  if (sigma < 0.3) return;
  const r = Math.max(1, Math.round(sigma * 1.2));
  const tmp = new Float32Array(w * h * 3);
  for (let pass = 0; pass < 2; pass++) {
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        for (let c = 0; c < 3; c++) {
          let s = 0;
          let n = 0;
          for (let k = Math.max(0, x - r); k <= Math.min(w - 1, x + r); k++, n++) s += data[(y * w + k) * 4 + c]!;
          tmp[(y * w + x) * 3 + c] = s / n;
        }
      }
    }
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        for (let c = 0; c < 3; c++) {
          let s = 0;
          let n = 0;
          for (let k = Math.max(0, y - r); k <= Math.min(h - 1, y + r); k++, n++) s += tmp[(k * w + x) * 3 + c]!;
          data[(y * w + x) * 4 + c] = s / n;
        }
      }
    }
  }
}

/** Rotate a JPEG buffer by 90/180 degrees clockwise and re-encode. */
export async function turnJpeg(buf: Buffer, turn: 90 | 180, quality: number): Promise<Buffer> {
  const img = await loadImage(buf);
  const w = img.width;
  const h = img.height;
  const c = turn === 180 ? createCanvas(w, h) : createCanvas(h, w);
  const x = c.getContext('2d');
  if (turn === 180) {
    x.translate(w, h);
    x.rotate(Math.PI);
  } else {
    x.translate(h, 0);
    x.rotate(Math.PI / 2);
  }
  x.drawImage(img, 0, 0);
  return c.encode('jpeg', quality);
}
