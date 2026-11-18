import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { analyze } from '../src/index.js';
import { lexicons, msg, region } from './helpers.js';

/**
 * The 30 documents of the OCR benchmark (apps/app/test/ocr-bench), read from their ground-truth text: the card must
 * pick the right amount to pay, the right date and, for appointments, the time. Bills, school-fee notices with
 * several instalments and an annual total, hospital letters with a fee and a time, mobile-money receipts with a fee
 * and a balance.
 */
interface Truth {
  id: string;
  kind: string;
  text: string;
  must: { dates: string[]; amounts: number[] };
}
const truth = JSON.parse(readFileSync(resolve(__dirname, '../../../apps/app/test/ocr-bench/images/truth.json'), 'utf8')) as Truth[];
/** Appointment times in the hospital letters (read off the documents). */
const TIMES: Record<string, string> = {
  '19-hospital-fr': '11:30', '20-hospital-fr': '10:00', '21-hospital-fr': '08:30',
  '22-hospital-en': '09:30', '23-hospital-en': '13:30', '30-hospital-fr': '11:30',
};

describe('cards for the benchmark documents (ground-truth text)', () => {
  for (const e of truth) {
    it(`${e.id}: the right amount, date and time`, async () => {
      const c = await analyze(msg(e.text, undefined, '2026-10-31'), { region, lexicons });
      expect(c.mode).toBe('full');
      // The first amount and date in "must" are the ones the document asks for (bill total, first instalment, fee,
      // amount received); the rest are instalments, totals, fees and balances.
      expect(c.amount?.value.amount).toBe(e.must.amounts[0]);
      if (e.kind !== 'momo') expect(c.deadline?.value).toBe(e.must.dates[0]);
      if (e.kind === 'hospital') expect(c.deadlineTime?.value).toBe(TIMES[e.id]);
      if (e.kind === 'momo') expect(c.understanding.action).toBe('nothing');
    });
  }
});
