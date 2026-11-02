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
};
