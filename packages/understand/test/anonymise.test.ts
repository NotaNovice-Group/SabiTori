import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { extractFacts } from '@sabitori/core';
import { anonymise } from '../eval/anonymise-lib';

const root = resolve(__dirname, '../../..');
const json = (p: string) => JSON.parse(readFileSync(resolve(root, p), 'utf8'));
const ctx = { region: json('regions/CM/region.json'), lexicons: ['fr', 'en'].map((t) => json(`packs/${t}/reading.json`)), receivedAt: '2026-11-17' };
let seed = 7;
const rand = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);

const BILL = 'ENEO: Mme NGONO Pauline, votre facture N° 0451233987 de 18 450 FCFA est à payer avant le 12/11/2026. Contrat 2001-445-778. Service client: 677 12 34 56.';
const MOMO = 'Vous avez reçu 25 000 FCFA de Jean Paul Mbarga (+237 699 88 77 66). Ref: MP261117.1234.A5678. Nouveau solde: 30 250 FCFA. Composez *126# ou visitez https://momo.mtn.cm/aide';

describe('anonymising a real message (first pass)', () => {
  it('moves phone numbers to the fictional ranges, keeping how they were written', () => {
    const a = anonymise(BILL + ' ' + MOMO, ctx, rand);
    expect(a.text).not.toContain('677 12 34 56');
    expect(a.text).not.toContain('699 88 77 66');
    expect(a.text).toMatch(/Service client: 677 00 \d\d \d\d\./);
    expect(a.text).toMatch(/\(\+237 699 00 \d\d \d\d\)/);
    expect(a.text).toMatch(/233 00|677 00|699 00/);
  });

  it('replaces reference, account and contract numbers with random digits of the same shape', () => {
    const a = anonymise(BILL + ' ' + MOMO, ctx, rand);
    for (const old of ['0451233987', '2001-445-778', 'MP261117.1234.A5678']) expect(a.text).not.toContain(old);
    expect(a.text).toMatch(/N° \d{10} /);
    expect(a.text).toMatch(/Contrat \d{4}-\d{3}-\d{3}\./);
    expect(a.text).toMatch(/Ref: MP\d{6}\.\d{4}\.A\d{4}\./);
  });

  it('keeps what a card must read: amounts, dates (even past or odd ones), times, menu codes and links', () => {
    const a = anonymise(BILL + ' ' + MOMO + ' RDV à 9h30.', ctx, rand);
    for (const kept of ['18 450 FCFA', '12/11/2026', '25 000 FCFA', '30 250 FCFA', '*126#', 'https://momo.mtn.cm/aide', '9h30']) expect(a.text).toContain(kept);
    const before = extractFacts(BILL, ctx);
    const after = extractFacts(anonymise(BILL, ctx, rand).text, ctx);
    expect(after.amounts.map((f) => f.value)).toEqual(before.amounts.map((f) => f.value));
    expect(after.dates.map((f) => f.value)).toEqual(before.dates.map((f) => f.value));
    expect(after.phones).toHaveLength(before.phones.length);
  });

  it('lists words that may be names for the reviewers, not common words or known senders', () => {
    const a = anonymise(BILL + ' ' + MOMO, ctx, rand);
    expect(a.check).toEqual(expect.arrayContaining(['NGONO', 'Pauline', 'Jean Paul Mbarga']));
    expect(a.check).not.toContain('FCFA');
    expect(a.check).not.toContain('ENEO');
    expect(a.changed.map((c) => c.kind).sort()).toEqual(['number', 'number', 'number', 'phone', 'phone']);
  });

  it('leaves a message with nothing personal unchanged', () => {
    const t = 'ENEO: coupure programmée le 20 novembre 2026 de 8h00 à 16h00 à Bonamoussadi.';
    const a = anonymise(t, ctx, rand);
    expect(a.text).toBe(t);
    expect(a.changed).toEqual([]);
  });
});
