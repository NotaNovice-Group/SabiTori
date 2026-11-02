// Deterministic helpers for build-dataset.mjs. No dependencies.

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

export const RECEIVED = '2026-10-31';
const BASE = Date.UTC(2026, 9, 31);

export const MONTHS = {
  fr: ['janvier', 'février', 'mars', 'avril', 'mai', 'juin', 'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre'],
  en: ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'],
};
export const WEEKDAYS = {
  fr: ['dimanche', 'lundi', 'mardi', 'mercredi', 'jeudi', 'vendredi', 'samedi'],
  en: ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'],
};
const pad = (n) => String(n).padStart(2, '0');

/** Date `off` days after the reception date. */
export function dateOf(off) {
  return new Date(BASE + off * 86400000);
}
export function iso(off) {
  const d = dateOf(off);
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;
}

const FIRST = ['Jean', 'Marie', 'Paul', 'Esther', 'Samuel', 'Aïcha', 'Blaise', 'Nadège', 'Ruth', 'Emmanuel', 'Fatima', 'Clovis', 'Mercy', 'Ebenezer', 'Brenda', 'Patrice', 'Gisèle', 'Tabi', 'Ngono', 'Awah'];
const LAST = ['Exemple', 'Fictif', 'Modèle', 'Sample', 'Demo', 'Specimen', 'Factice', 'Test'];
const CITIES = ['Douala', 'Yaoundé', 'Bafoussam', 'Bamenda', 'Buea', 'Garoua', 'Limbe', 'Kumba', 'Bertoua', 'Ngaoundéré', 'Maroua', 'Ebolowa', 'Kribi'];
const QUARTERS = ['Bonamoussadi', 'Akwa', 'Bastos', 'Mvog-Mbi', 'Nkolbisson', 'Mile 4', 'Molyko', 'Tsinga', 'Biyem-Assi', 'Makepe'];

/** Build the per-message helper object `c` handed to every text function. */
export function makeCtx(rng, spec) {
  const lang = spec.lang === 'fr' ? 'fr' : 'en';
  const pick = (a) => a[Math.floor(rng() * a.length)];
  const int = (lo, hi) => lo + Math.floor(rng() * (hi - lo + 1));
  const digits = (n) => Array.from({ length: n }, () => int(0, 9)).join('');
  let off = null;
  if (spec.due === 'u') off = int(1, 7);
  else if (spec.due === 's') off = int(8, 60);
  else if (spec.due === 'L') off = -int(1, 9);
  else if (typeof spec.due === 'number') off = spec.due;

  const num = (lo, hi, step = 500) => lo + step * Math.floor(rng() * ((hi - lo) / step + 1));
  const group = (n, style) => {
    const s = String(n);
    if (style === 2 || n < 1000) return s;
    const sep = style === 0 ? ' ' : style === 1 ? '.' : ',';
    return s.replace(/\B(?=(\d{3})+(?!\d))/g, sep);
  };
  const cur = lang === 'fr' ? ['FCFA', 'FCFA', 'F CFA', 'F', 'francs CFA'] : ['FCFA', 'FCFA', 'F CFA', 'XAF'];

  const c = {
    lang,
    off,
    pick,
    int,
    digits,
    num,
    n: (v) => group(v, 0),
    /** amount with currency, random number style */
    A: (lo, hi, step = 500) => `${group(num(lo, hi, step), int(0, 3))} ${pick(cur)}`,
    ref: (prefix = '', len = 7) => prefix + digits(len),
    name: () => `${pick(FIRST)} ${pick(LAST)}`,
    fn: () => pick(FIRST),
    city: () => pick(CITIES),
    quarter: () => pick(QUARTERS),
    time: () => {
      const h = int(7, 17);
      const m = pick([0, 0, 30, 15]);
      if (lang === 'fr') return m ? `${pad(h)}h${pad(m)}` : pick([`${h}h`, `${pad(h)}h00`]);
      const h12 = h > 12 ? h - 12 : h;
      return pick([`${h12}${m ? ':' + pad(m) : ''}${h >= 12 ? 'pm' : 'am'}`, `${pad(h)}:${pad(m)}`, `${h12}:${pad(m)} ${h >= 12 ? 'PM' : 'AM'}`]);
    },
    /** date `o` days after reception (default: the message's own deadline), random style */
    D: (o = off, style = int(0, 3)) => {
      const d = dateOf(o);
      const dd = d.getUTCDate(), mm = d.getUTCMonth(), yy = d.getUTCFullYear();
      if (style === 0) return `${pad(dd)}/${pad(mm + 1)}/${yy}`;
      if (style === 1) return `${dd} ${MONTHS[lang][mm]} ${yy}`;
      if (style === 2) return lang === 'fr' ? `${pad(dd)}-${pad(mm + 1)}-${yy}` : `${pad(dd)}/${pad(mm + 1)}/${yy}`;
      return lang === 'fr' ? `${dd} ${MONTHS.fr[mm]} ${yy}` : `${MONTHS.en[mm]} ${dd}, ${yy}`;
    },
    /** date with weekday, e.g. "samedi 7 novembre 2026" */
    DW: (o = off) => {
      const d = dateOf(o);
      return `${WEEKDAYS[lang][d.getUTCDay()]} ${d.getUTCDate()} ${MONTHS[lang][d.getUTCMonth()]} ${d.getUTCFullYear()}`;
    },
    /** fictional phone, 9 digits, 677 00 xx xx or 699 00 xx xx */
    ph9: () => pick(['677', '699']) + '00' + digits(4),
    fmtPh: (p9) => {
      const s = pick([0, 0, 1, 2]);
      if (s === 0) return `${p9.slice(0, 3)} ${p9.slice(3, 5)} ${p9.slice(5, 7)} ${p9.slice(7)}`;
      if (s === 1) return p9;
      return `${p9[0]} ${p9.slice(1, 3)} ${p9.slice(3, 5)} ${p9.slice(5, 7)} ${p9.slice(7)}`;
    },
    /** fictional landline: 233 00 xx xx */
    land: () => `233 00 ${digits(2)} ${digits(2)}`,
  };
  c.ph = () => c.fmtPh(c.ph9());
  const sn9 = c.ph9();
  c.sn9 = sn9;
  c.sn = c.fmtPh(sn9);
  c.url = (host, path = '') => `${pick(['http://', 'https://', ''])}${host}${path}`;
  c.code = (n = 6) => digits(n);
  return c;
}

/** OCR-style damage: O/0 and l/1 swaps, dropped accents, stray spaces, broken lines. */
export function ocrNoise(text, rng) {
  const pick = (a) => a[Math.floor(rng() * a.length)];
  let out = text.replace(/\d+/g, (m) => {
    let r = '';
    for (const ch of m) {
      const x = rng();
      r += ch === '0' && x < 0.25 ? 'O' : ch === '1' && x < 0.25 ? 'l' : ch === '5' && x < 0.06 ? 'S' : ch;
    }
    return r;
  });
  out = out.replace(/\b[A-Za-zÀ-ÿ]{4,}\b/g, (w) => {
    const x = rng();
    if (x < 0.07) return w.replace(/i/, 'l');
    if (x < 0.11) return w.replace(/l/, '1');
    if (x < 0.14) return w.replace(/[éèêà]/, pick(['e', 'c', 'a']));
    if (x < 0.17 && w.length > 6) {
      const k = 2 + Math.floor(rng() * (w.length - 4));
      return w.slice(0, k) + ' ' + w.slice(k);
    }
    return w;
  });
  // broken lines: wrap at ~32-44 characters, sometimes hyphenating mid-word
  const words = out.split(/ +/);
  const lines = [];
  let cur = '';
  let limit = 32 + Math.floor(rng() * 12);
  for (const w of words) {
    if (w.includes('\n')) {
      lines.push(cur + (cur ? ' ' : '') + w);
      cur = '';
      continue;
    }
    if ((cur + ' ' + w).length > limit && cur) {
      lines.push(cur);
      cur = w;
      limit = 32 + Math.floor(rng() * 12);
    } else cur = cur ? cur + ' ' + w : w;
  }
  if (cur) lines.push(cur);
  return lines.join('\n');
}
