import { PREP_OFF, PREP_DEFAULT, type PrepOptions } from '../../src/lib/ocr-prep';
import type { Variant } from './run';

export const OFF = PREP_OFF;
const p = (o: Partial<PrepOptions>): Partial<PrepOptions> => ({ ...PREP_OFF, ...o });

export const VARIANT_SETS: Record<string, Variant[]> = {
  smoke: [{ name: 'legacy', prep: 'legacy' }, { name: 'default', prep: PREP_DEFAULT }],
  steps: [
    { name: 'A legacy (grey+contrast)', prep: 'legacy' },
    { name: 'B grey only', prep: p({}) },
    { name: 'C +normalise', prep: p({ normalise: true }) },
    { name: 'D +crop', prep: p({ normalise: true, crop: true }) },
    { name: 'E +orient', prep: p({ normalise: true, crop: true, orient: true }) },
    { name: 'F +deskew', prep: p({ normalise: true, crop: true, orient: true, deskew: true }) },
    { name: 'G +scale', prep: p({ normalise: true, crop: true, orient: true, deskew: true, scale: true }) },
    { name: 'H +sauvola', prep: p({ normalise: true, crop: true, orient: true, deskew: true, scale: true, binarise: true }) },
  ],
  tune: [
    { name: 'T1 no-scale', prep: { ...PREP_DEFAULT, scale: false, maxSide: 1800 } },
    { name: 'T2 scale t28 max1800', prep: { ...PREP_DEFAULT, targetLine: 28, maxSide: 1800 } },
    { name: 'T3 scale t34 max2000', prep: { ...PREP_DEFAULT, targetLine: 34, maxSide: 2000 } },
    { name: 'T4 scale t40 max2400', prep: { ...PREP_DEFAULT, targetLine: 40, maxSide: 2400 } },
    { name: 'T5 t28 no-deskew', prep: { ...PREP_DEFAULT, targetLine: 28, maxSide: 1800, deskew: false } },
    { name: 'T6 t28 no-normalise', prep: { ...PREP_DEFAULT, targetLine: 28, maxSide: 1800, normalise: false } },
    { name: 'T7 t28 no-crop', prep: { ...PREP_DEFAULT, targetLine: 28, maxSide: 1800, crop: false } },
  ],
  psm: [
    { name: 'P3 rim+t34 psm3', prep: { ...PREP_DEFAULT, targetLine: 34, maxSide: 2000 } },
    { name: 'P6 rim+t34 psm6', prep: { ...PREP_DEFAULT, targetLine: 34, maxSide: 2000 }, psm: '6' },
    { name: 'P4 rim+t34 psm4', prep: { ...PREP_DEFAULT, targetLine: 34, maxSide: 2000 }, psm: '4' },
    { name: 'P6L legacy psm6', prep: 'legacy', psm: '6' },
    { name: 'P4L legacy psm4', prep: 'legacy', psm: '4' },
  ],
  final: [
    { name: 'legacy fra+eng', prep: 'legacy' },
    { name: 'default fra+eng', prep: PREP_DEFAULT },
    { name: 'default fra+eng +retry', prep: PREP_DEFAULT, retry: true },
    { name: 'default fra only', prep: PREP_DEFAULT, langs: ['fra'] },
    { name: 'default eng only', prep: PREP_DEFAULT, langs: ['eng'] },
    { name: 'default by-page lang (oracle)', prep: PREP_DEFAULT, langs: (e) => [e.lang === 'fr' ? 'fra' : 'eng'] },
  ],
  /**
   * Traineddata comparison, shipped pipeline (default prep + half-turn retry), fra+eng. The two alternative dirs are
   * given by env (each holds fra.traineddata.gz and eng.traineddata.gz): OCR_DIR_BEST_INT (the `4.0.0_best_int`
   * folders of @tesseract.js-data/*) and OCR_DIR_FAST (tessdata_fast, gzipped). The first entry is what public/ocr held
   * before (the float "best" models, 4.0.0).
   */
  models: [
    { name: 'best float (4.0.0)', prep: PREP_DEFAULT, retry: true, langPath: process.env.OCR_DIR_BEST },
    { name: 'best_int (4.0.0_best_int)', prep: PREP_DEFAULT, retry: true, langPath: process.env.OCR_DIR_BEST_INT },
    { name: 'fast (tessdata_fast)', prep: PREP_DEFAULT, retry: true, langPath: process.env.OCR_DIR_FAST },
  ],
  /** Table ruling lines erased before OCR (school-fee tables were the weakest document type). */
  rules: [
    { name: 'before: no rule erasing (capped retry)', prep: { ...PREP_DEFAULT, rules: false }, retry: 'capped' },
    { name: 'shipped: erase table rules (capped retry)', prep: PREP_DEFAULT, retry: 'capped' },
  ],
  /** Review 3: dark-mode detection at working resolution (both rows) and the capped half-turn retry. Run with OCR_PAR=1. */
  review3: [
    { name: 'default fra+eng +retry (every page < 55)', prep: PREP_DEFAULT, retry: true },
    { name: 'default fra+eng +capped retry (shipped)', prep: PREP_DEFAULT, retry: 'capped' },
  ],
  /** The reviewer's SMS screenshots (light, dark, dark without a bubble): OCR_BENCH=screens OCR_BENCH_DIR=screens. */
  screens: [
    { name: 'screens: default +capped retry', prep: PREP_DEFAULT, retry: 'capped' },
    { name: 'screens: no invert step', prep: { ...PREP_DEFAULT, invert: false }, retry: 'capped' },
  ],
  timing: [
    { name: 'legacy fra+eng', prep: 'legacy' },
    { name: 'default fra+eng +retry', prep: PREP_DEFAULT, retry: true },
    { name: 'default fra only', prep: PREP_DEFAULT, langs: ['fra'] },
  ],
};
