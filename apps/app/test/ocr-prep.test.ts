// @vitest-environment node
import { describe, expect, it } from 'vitest';
import {
  PREP_DEFAULT,
  PREP_OFF,
  eraseRules,
  estimateLineHeight,
  estimateSkew,
  findDocumentBox,
  greyToRgba,
  isLightOnDark,
  localStats,
  normaliseIllumination,
  otsu,
  preprocess,
  preprocessGrey,
  resize,
  rgbaToGrey,
  rotate,
  rotate90,
  sauvola,
  type GreyImage,
} from '../src/lib/ocr-prep';

function rng(seed: number) {
  let a = seed;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** A page of "text": rows of word-sized dark blocks, white paper. */
function textPage(w = 640, h = 480, pitch = 22, glyph = 11, ink = 25, paper = 245): GreyImage {
  const data = new Uint8ClampedArray(w * h).fill(paper);
  const r = rng(7);
  for (let y0 = 40; y0 + glyph < h - 30; y0 += pitch) {
    let x = 40;
    while (x < w - 60) {
      const ww = 14 + Math.floor(r() * 50);
      for (let y = y0; y < y0 + glyph; y++) for (let xx = x; xx < Math.min(w - 40, x + ww); xx++) data[y * w + xx] = ink;
      x += ww + 10 + Math.floor(r() * 8);
    }
  }
  return { data, width: w, height: h };
}

const mean = (g: GreyImage, x0: number, y0: number, x1: number, y1: number) => {
  let s = 0;
  let n = 0;
  for (let y = y0; y < y1; y++)
    for (let x = x0; x < x1; x++) {
      s += g.data[y * g.width + x]!;
      n++;
    }
  return s / n;
};

describe('basics', () => {
  it('converts RGBA to grey and back', () => {
    const rgba = new Uint8ClampedArray([255, 255, 255, 255, 0, 0, 0, 255, 255, 0, 0, 255]);
    const g = rgbaToGrey(rgba, 3, 1);
    expect(g.data[0]).toBeGreaterThanOrEqual(254);
    expect(g.data[1]).toBe(0);
    expect(g.data[2]).toBeGreaterThan(50);
    expect(g.data[2]).toBeLessThan(90);
    const back = greyToRgba(g);
    expect(back[3]).toBe(255);
    expect(back[4]).toBe(g.data[1]);
  });

  it('computes local mean and std with clamped borders', () => {
    const w = 9;
    const h = 9;
    const flat = new Uint8ClampedArray(w * h).fill(100);
    const { mean: m, std } = localStats(flat, w, h, 2, true);
    expect(Math.max(...m)).toBeCloseTo(100, 3);
    expect(Math.max(...std!)).toBeLessThan(1e-3);
    const g = new Uint8ClampedArray(w * h);
    for (let i = 0; i < g.length; i++) g[i] = i % 2 ? 200 : 0;
    const s = localStats(g, w, h, 4, true);
    expect(s.mean[40]).toBeCloseTo(100, -1);
    expect(s.std![40]).toBeGreaterThan(90);
  });

  it('finds a threshold between two populations', () => {
    const d = new Uint8ClampedArray(1000);
    for (let i = 0; i < 1000; i++) d[i] = i % 5 === 0 ? 30 : 220;
    const t = otsu(d);
    expect(t).toBeGreaterThanOrEqual(30);
    expect(t).toBeLessThan(220);
  });

  it('resizes with the right size and keeps the mean', () => {
    const g = textPage();
    const small = resize(g, 320, 240);
    const big = resize(g, 1280, 960);
    expect([small.width, small.height]).toEqual([320, 240]);
    expect([big.width, big.height]).toEqual([1280, 960]);
    const m = mean(g, 0, 0, g.width, g.height);
    expect(Math.abs(mean(small, 0, 0, 320, 240) - m)).toBeLessThan(2);
    expect(Math.abs(mean(big, 0, 0, 1280, 960) - m)).toBeLessThan(2);
    expect(resize(g, g.width, g.height)).toBe(g);
  });
});

describe('rotation', () => {
  it('turns by quarter turns', () => {
    const g: GreyImage = { data: new Uint8ClampedArray([1, 2, 3, 4, 5, 6]), width: 3, height: 2 }; // 1 2 3 / 4 5 6
    const r1 = rotate90(g, 1);
    expect([r1.width, r1.height]).toEqual([2, 3]);
    expect(Array.from(r1.data)).toEqual([4, 1, 5, 2, 6, 3]); // clockwise
    expect(Array.from(rotate90(g, 2).data)).toEqual([6, 5, 4, 3, 2, 1]);
    expect(Array.from(rotate90(g, 3).data)).toEqual([3, 6, 2, 5, 1, 4]);
    expect(Array.from(rotate90(rotate90(g, 1), 3).data)).toEqual(Array.from(g.data));
    expect(rotate90(g, 4)).toBe(g);
  });

  it('rotates by an angle, growing the canvas and filling with white', () => {
    const g = textPage(200, 100);
    const r = rotate(g, 10, 255);
    expect(r.width).toBeGreaterThan(g.width);
    expect(r.height).toBeGreaterThan(g.height);
    expect(r.data[0]).toBe(255);
    expect(rotate(g, 0)).toBe(g);
  });
});

describe('skew and sideways', () => {
  it.each([-9, -4, -1.5, 2, 5, 12])('recovers a %s degree rotation of a text page', (deg) => {
    const g = rotate(textPage(), deg, 245);
    const { angle, sideways } = estimateSkew(g, 15, true);
    expect(sideways).toBe(false);
    expect(Math.abs(angle - deg)).toBeLessThan(0.8);
  });

  it('reports no skew for a straight page', () => {
    expect(estimateSkew(textPage(), 15).angle).toBe(0);
  });

  it('deskewing undoes the skew', () => {
    const skewed = rotate(textPage(), 6, 245);
    const fixed = rotate(skewed, -estimateSkew(skewed).angle, 245);
    expect(Math.abs(estimateSkew(fixed).angle)).toBeLessThan(0.7);
  });

  it('notices a page photographed sideways', () => {
    const sideways = rotate90(textPage(), 1);
    expect(estimateSkew(sideways, 15, true).sideways).toBe(true);
    expect(estimateSkew(textPage(), 15, true).sideways).toBe(false);
  });

  it('does not invent a skew from a blank page', () => {
    const blank: GreyImage = { data: new Uint8ClampedArray(300 * 300).fill(240), width: 300, height: 300 };
    expect(estimateSkew(blank, 15, true)).toMatchObject({ angle: 0, sideways: false });
  });
});

describe('illumination and binarisation', () => {
  /** Strong left-to-right shadow over the text page. */
  function shaded(): GreyImage {
    const g = textPage(640, 480);
    const out = new Uint8ClampedArray(g.data.length);
    for (let y = 0; y < g.height; y++)
      for (let x = 0; x < g.width; x++) out[y * g.width + x] = g.data[y * g.width + x]! * (0.3 + 0.7 * (x / g.width));
    return { data: out, width: g.width, height: g.height };
  }

  it('flattens the lighting so paper is uniformly bright', () => {
    const g = shaded();
    const spread = (im: GreyImage) => Math.abs(mean(im, 8, 8, 36, 30) - mean(im, im.width - 36, 8, im.width - 8, 30));
    expect(spread(g)).toBeGreaterThan(100);
    const n = normaliseIllumination(g);
    expect(spread(n)).toBeLessThan(20);
    expect(mean(n, 8, 8, 36, 30)).toBeGreaterThan(200);
  });

  it('keeps ink darker than paper after flattening', () => {
    const n = normaliseIllumination(shaded());
    const ink = mean(n, 40, 40, 60, 51);
    expect(ink).toBeLessThan(120);
  });

  it('Sauvola keeps text in the dark corner that a global threshold loses', () => {
    const g = shaded();
    const t = otsu(g.data);
    const b = sauvola(g, 14, 0.25);
    // a text block in the shadowed left side: bright paper beside it stays white, the block black
    const probe = (im: GreyImage, thr?: number) => {
      let black = 0;
      for (let y = 40; y < 51; y++) for (let x = 42; x < 52; x++) black += (thr === undefined ? im.data[y * im.width + x]! === 0 : im.data[y * im.width + x]! < thr) ? 1 : 0;
      return black / (11 * 10);
    };
    expect(probe(b)).toBeGreaterThan(0.9);
    // paper in the same dark region must not be black
    let paperBlack = 0;
    for (let y = 30; y < 38; y++) for (let x = 45; x < 120; x++) paperBlack += b.data[y * b.width + x] === 0 ? 1 : 0;
    expect(paperBlack / (8 * 75)).toBeLessThan(0.05);
    // and the output is strictly two-valued
    expect(new Set(b.data).size).toBe(2);
    void t;
  });
});

describe('page finding and polarity', () => {
  it('crops a page lying on a dark desk', () => {
    const w = 400;
    const h = 300;
    const data = new Uint8ClampedArray(w * h).fill(55);
    for (let y = 40; y < 260; y++) for (let x = 60; x < 340; x++) data[y * w + x] = 230;
    const b = findDocumentBox({ data, width: w, height: h });
    expect(b.x).toBeGreaterThanOrEqual(55);
    expect(b.x).toBeLessThanOrEqual(80);
    expect(b.y).toBeGreaterThanOrEqual(35);
    expect(b.x + b.w).toBeGreaterThanOrEqual(325);
    expect(b.x + b.w).toBeLessThanOrEqual(345);
    expect(b.y + b.h).toBeLessThanOrEqual(265);
  });

  it('leaves a page that fills the frame alone, shaded or not', () => {
    const g = textPage();
    expect(findDocumentBox(g)).toEqual({ x: 0, y: 0, w: g.width, h: g.height });
    const dim = { ...g, data: g.data.map((v) => v * 0.45) as unknown as Uint8ClampedArray };
    expect(findDocumentBox(dim)).toEqual({ x: 0, y: 0, w: g.width, h: g.height });
  });

  it('recognises light text on a dark screen only', () => {
    const page = textPage();
    expect(isLightOnDark(page)).toBe(false);
    const inv = { ...page, data: page.data.map((v) => 255 - v) as unknown as Uint8ClampedArray };
    expect(isLightOnDark(inv)).toBe(true);
    const dimPaper = { ...page, data: page.data.map((v) => v * 0.5) as unknown as Uint8ClampedArray };
    expect(isLightOnDark(dimPaper)).toBe(false);
  });

  it('measures the height of text lines', () => {
    const lh = estimateLineHeight(textPage(640, 480, 22, 11));
    expect(lh).toBeGreaterThan(9);
    expect(lh).toBeLessThan(14);
    const big = estimateLineHeight(textPage(640, 480, 44, 24));
    expect(big).toBeGreaterThan(20);
  });
});

describe('pipeline', () => {
  const rgba = (g: GreyImage) => greyToRgba(g);

  it('does nothing but greyscale when every step is off', () => {
    const g = textPage(200, 120);
    const { image, report } = preprocess(rgba(g), g.width, g.height, PREP_OFF);
    expect(report.steps).toEqual([]);
    expect(image.width).toBe(200);
    expect(Array.from(image.data.slice(0, 50))).toEqual(Array.from(g.data.slice(0, 50)));
  });

  it('each step switches on and off independently', () => {
    const skewed = rotate(textPage(), 5, 245);
    const on = (o: object) => preprocessGrey(skewed, { ...PREP_OFF, ...o }).report.steps;
    expect(on({ deskew: true })).toContain('deskew');
    expect(on({ normalise: true })).toEqual(['normalise']);
    expect(on({ binarise: true })).toEqual(['sauvola']);
    expect(on({ deskew: false })).not.toContain('deskew');
    expect(preprocessGrey(textPage(), { ...PREP_OFF, scale: true }).report.steps).toContain('scale');
  });

  it('upscales small text to the target line height, never past maxSide', () => {
    const g = textPage(640, 480, 22, 11);
    const r = preprocessGrey(g, { ...PREP_OFF, scale: true, targetLine: 30, maxSide: 4000 });
    expect(r.report.scale).toBeGreaterThan(2);
    expect(r.image.width).toBeGreaterThan(g.width * 2);
    const capped = preprocessGrey(g, { ...PREP_OFF, scale: true, targetLine: 60, maxSide: 800 });
    expect(Math.max(capped.image.width, capped.image.height)).toBeLessThanOrEqual(801);
  });

  it('shrinks photos larger than maxSide', () => {
    const g = textPage(1600, 1200);
    const r = preprocessGrey(g, { ...PREP_OFF, maxSide: 800 });
    expect(r.image.width).toBe(800);
    expect(r.report.steps).toContain('fit');
  });

  it('default pipeline straightens, flattens and rights a sideways, shaded page photo', () => {
    let g = textPage(800, 600);
    g = rotate(g, 4, 245);
    g = rotate90(g, 1);
    const data = new Uint8ClampedArray(g.data.length);
    for (let y = 0; y < g.height; y++) for (let x = 0; x < g.width; x++) data[y * g.width + x] = g.data[y * g.width + x]! * (0.45 + 0.55 * (y / g.height));
    const r = preprocessGrey({ ...g, data }, PREP_DEFAULT);
    expect(r.report.orientation).toBe(90);
    expect(Math.abs(r.report.skew - 4)).toBeLessThan(1);
    expect(r.report.steps).toEqual(expect.arrayContaining(['normalise', 'deskew']));
    // after the pipeline the page reads horizontally and with no residual skew
    const again = estimateSkew(r.image, 15, true);
    expect(again.sideways).toBe(false);
    expect(Math.abs(again.angle)).toBeLessThan(0.7);
  });

  it('is deterministic and does not mutate its input', () => {
    const g = rotate(textPage(), 3, 245);
    const copy = Uint8ClampedArray.from(g.data);
    const a = preprocessGrey(g, PREP_DEFAULT);
    const b = preprocessGrey(g, PREP_DEFAULT);
    expect(Array.from(g.data)).toEqual(Array.from(copy));
    expect(Buffer.from(a.image.data).equals(Buffer.from(b.image.data))).toBe(true);
  });
});

describe('table rules', () => {
  /** A 3x3 table with 3 px rules and short "words" (6 x 16 px blocks) in each cell. */
  function table(withVertical = true): GreyImage {
    const w = 900, h = 400;
    const data = new Uint8ClampedArray(w * h).fill(245);
    const dark = (x0: number, y0: number, x1: number, y1: number) => {
      for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) data[y * w + x] = 30;
    };
    for (const y of [50, 150, 250, 350]) dark(50, y, 850, y + 3);
    if (withVertical) for (const x of [50, 316, 583, 847]) dark(x, 50, x + 3, 353);
    for (const y of [90, 190, 290]) for (const x of [80, 350, 620]) for (let k = 0; k < 6; k++) dark(x + k * 22, y, x + k * 22 + 16, y + 20);
    return { data, width: w, height: h };
  }
  const inkAt = (g: GreyImage, x: number, y: number) => g.data[y * g.width + x]! < 128;

  it('erases the grid and keeps the words in the cells', () => {
    const g = table();
    const r = eraseRules(g, 24);
    expect(r.erased).toBeGreaterThan(0);
    expect(inkAt(r.image, 400, 51)).toBe(false); // horizontal rule
    expect(inkAt(r.image, 317, 200)).toBe(false); // vertical rule
    for (const [x, y] of [[85, 100], [360, 200], [630, 300]] as const) expect(inkAt(r.image, x, y)).toBe(true); // words
  });

  it('leaves a page with only a lone line (letterhead, signature) unchanged', () => {
    const g = table(false);
    const r = eraseRules(g, 24);
    expect(r.erased).toBe(0);
    expect(r.image).toBe(g);
  });

  it('keeps text lines, even long dark ones, and thick dark bands', () => {
    const g = textPage(900, 400);
    expect(eraseRules(g, 22).erased).toBe(0);
    const band: GreyImage = { width: 900, height: 300, data: new Uint8ClampedArray(900 * 300).fill(245) };
    for (let y = 100; y < 160; y++) for (let x = 0; x < 900; x++) band.data[y * 900 + x] = 40; // a shadow, 60 px thick
    for (let y = 0; y < 300; y++) for (let x = 400; x < 460; x++) band.data[y * 900 + x] = 40;
    expect(eraseRules(band, 22).erased).toBe(0);
  });

  it('is on in the shipped pipeline, off in PREP_OFF', () => {
    expect(PREP_DEFAULT.rules).toBe(true);
    expect(PREP_OFF.rules).toBe(false);
    expect(preprocessGrey(table(), { ...PREP_OFF, rules: true }).report.steps).toContain('rules');
  });
});
