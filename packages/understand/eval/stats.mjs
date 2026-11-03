// Small, dependency-free statistics for the evaluation tables. Deterministic: every bootstrap uses a
// fixed seed, so the same per-row results always give the same intervals.
//
// - accuracy with a 95% percentile bootstrap interval (10,000 resamples of the rows)
// - paired comparison of two systems on the same rows: difference with a paired bootstrap interval,
//   discordant counts and the exact two-sided McNemar p-value (binomial test on the discordant pairs)
// - expected calibration error (ECE, 10 equal-width bins) and reliability bins

export const SEED = 20261102;
export const RESAMPLES = 10000;

export function mulberry32(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const quantile = (sorted, q) => {
  const i = (sorted.length - 1) * q;
  const lo = Math.floor(i);
  const hi = Math.ceil(i);
  return sorted[lo] + (sorted[hi] - sorted[lo]) * (i - lo);
};
const r4 = (x) => Math.round(x * 10000) / 10000;

/** ok: array of 0/1. Returns { n, k, acc, lo, hi } (fractions, 4 decimals). */
export function accuracyCI(ok, { seed = SEED, resamples = RESAMPLES } = {}) {
  const n = ok.length;
  const k = ok.reduce((a, b) => a + b, 0);
  if (!n) return { n, k, acc: null, lo: null, hi: null };
  const rng = mulberry32(seed);
  const means = new Float64Array(resamples);
  for (let b = 0; b < resamples; b++) {
    let s = 0;
    for (let i = 0; i < n; i++) s += ok[Math.floor(rng() * n)];
    means[b] = s / n;
  }
  means.sort();
  return { n, k, acc: r4(k / n), lo: r4(quantile(means, 0.025)), hi: r4(quantile(means, 0.975)) };
}

function logChoose(n, k) {
  let s = 0;
  for (let i = 1; i <= k; i++) s += Math.log(n - k + i) - Math.log(i);
  return s;
}

/** Exact two-sided McNemar test: b = A right and B wrong, c = A wrong and B right. */
export function mcnemarExact(b, c) {
  const n = b + c;
  if (n === 0) return 1;
  const m = Math.min(b, c);
  let p = 0;
  for (let k = 0; k <= m; k++) p += Math.exp(logChoose(n, k) - n * Math.LN2);
  return Math.min(1, 2 * p);
}

/** Paired comparison of system A against system B on the same rows (okA, okB: arrays of 0/1). */
export function paired(okA, okB, { seed = SEED, resamples = RESAMPLES } = {}) {
  const n = okA.length;
  let b = 0;
  let c = 0;
  for (let i = 0; i < n; i++) {
    if (okA[i] && !okB[i]) b++;
    else if (!okA[i] && okB[i]) c++;
  }
  const rng = mulberry32(seed);
  const diffs = new Float64Array(resamples);
  for (let r = 0; r < resamples; r++) {
    let s = 0;
    for (let i = 0; i < n; i++) {
      const j = Math.floor(rng() * n);
      s += okA[j] - okB[j];
    }
    diffs[r] = s / n;
  }
  diffs.sort();
  const p = mcnemarExact(b, c);
  return { n, diff: r4((b - c) / n), lo: r4(quantile(diffs, 0.025)), hi: r4(quantile(diffs, 0.975)), aOnly: b, bOnly: c, p: r4(p), significant: p < 0.05 };
}

/** conf: predicted-label probabilities, ok: 0/1. ECE with `bins` equal-width bins over [0, 1]. */
export function calibration(conf, ok, bins = 10) {
  const n = conf.length;
  const B = Array.from({ length: bins }, (_, i) => ({ lo: i / bins, hi: (i + 1) / bins, n: 0, conf: 0, acc: 0 }));
  for (let i = 0; i < n; i++) {
    const j = Math.min(bins - 1, Math.floor(conf[i] * bins));
    B[j].n++;
    B[j].conf += conf[i];
    B[j].acc += ok[i];
  }
  let ece = 0;
  for (const x of B) {
    if (!x.n) continue;
    ece += (x.n / n) * Math.abs(x.acc / x.n - x.conf / x.n);
  }
  return {
    n,
    ece: r4(ece),
    meanConf: r4(conf.reduce((a, b) => a + b, 0) / n),
    acc: r4(ok.reduce((a, b) => a + b, 0) / n),
    bins: B.filter((x) => x.n).map((x) => ({ lo: x.lo, hi: r4(x.hi), n: x.n, conf: r4(x.conf / x.n), acc: r4(x.acc / x.n) })),
  };
}

/** "69.1% [59.8–78.4]" */
export const fmtCI = (a) => (a.acc === null ? 'n/a' : `${(100 * a.acc).toFixed(1)}% [${(100 * a.lo).toFixed(1)}–${(100 * a.hi).toFixed(1)}]`);
/** "+24.7 pts [15.5–35.1], 27 vs 3, p < 0.001" */
export const fmtP = (p) => (p < 0.001 ? 'p < 0.001' : `p = ${p.toFixed(3)}`);
export const fmtDiff = (d) =>
  `${d.diff >= 0 ? '+' : ''}${(100 * d.diff).toFixed(1)} pts [${(100 * d.lo).toFixed(1)}–${(100 * d.hi).toFixed(1)}], ${d.aOnly} vs ${d.bOnly}, ${fmtP(d.p)}`;
