import { describe, expect, it } from 'vitest';
import { extractFacts } from '../src/index.js';
import { ctx, region, fr, en } from './helpers.js';

const f = (t: string, receivedAt = '2026-10-31') => extractFacts(t, { ...ctx, receivedAt });
const dates = (t: string, r?: string) => f(t, r).dates.map((d) => d.value);
const amounts = (t: string) => f(t).amounts.map((a) => a.value.amount);

describe('dates', () => {
  it('reads dd/mm/yyyy', () => expect(dates('Payer avant le 15/11/2026')).toEqual(['2026-11-15']));
  it('reads dd-mm-yy', () => expect(dates('Date: 05-12-26')).toEqual(['2026-12-05']));
  it('reads dd.mm.yyyy', () => expect(dates('Echeance 03.01.2027')).toEqual(['2027-01-03']));
  it('reads ISO dates', () => expect(dates('Due 2026-11-20')).toEqual(['2026-11-20']));
  it('reads French month names with accents', () => {
    expect(dates('Rendez-vous le 12 novembre 2026 a 9h')).toEqual(['2026-11-12']);
    expect(dates('le 3 décembre 2026')).toEqual(['2026-12-03']);
    expect(dates('le 1er février 2027')).toEqual(['2027-02-01']);
  });
  it('reads abbreviated month with dot', () => {
    const r = f('Avant le 12 nov. 2026 SVP');
    expect(r.dates[0]?.value).toBe('2026-11-12');
    expect(r.dates[0]?.raw).toBe('12 nov. 2026');
  });
  it('reads English dates', () => {
    expect(dates('Due November 12, 2026')).toEqual(['2026-11-12']);
    expect(dates('Pay by 12th Nov')).toEqual(['2026-11-12']);
    expect(dates('on the 5th of December 2026')).toEqual(['2026-12-05']);
  });
  it('infers the year of "avant le 15/11"', () => {
    expect(dates('avant le 15/11', '2026-10-31')).toEqual(['2026-11-15']);
  });
  it('rolls a yearless date that already passed into next year', () => {
    expect(dates('avant le 10 mars', '2026-10-31')).toEqual(['2027-03-10']);
  });
  it('keeps a yearless date inside the grace window', () => {
    expect(dates('le 28 octobre', '2026-10-31')).toEqual(['2026-10-28']);
  });
  it('rejects impossible dates', () => {
    expect(dates('Ref 31/02/2026 et 45/13/2026')).toEqual([]);
  });
  it('reads relative words in both languages', () => {
    expect(dates('Venez demain')).toEqual(['2026-11-01']);
    expect(dates('Pay today')).toEqual(['2026-10-31']);
    expect(dates('apres-demain')).toEqual(['2026-11-02']);
    expect(dates('tomorrow')).toEqual(['2026-11-01']);
  });
  it('reads a weekday only after a lead word', () => {
    expect(dates('avant vendredi', '2026-10-31')).toEqual(['2026-11-06']);
    expect(dates('ouvert du lundi au vendredi')).toEqual([]);
  });
  it('does not take an amount after a month for a date', () => {
    const r = f('Echeance novembre 15 000 FCFA');
    expect(r.dates).toEqual([]);
    expect(r.amounts[0]?.value.amount).toBe(15000);
  });
});

describe('amounts', () => {
  it('reads an all-zero minor unit as exact, and still refuses real decimals', () => {
    expect(amounts('Montant: 18 450,00 FCFA')).toEqual([18450]);
    expect(amounts('Total 18.450,00 F CFA')).toEqual([18450]);
    expect(amounts('Total 18,450.00 XAF')).toEqual([18450]);
    expect(amounts('Total 2 500,0 FCFA')).toEqual([2500]);
    expect(amounts('Prix 15,50 FCFA')).toEqual([]);
    expect(amounts('Prix 1 250,5 FCFA')).toEqual([]);
  });
  it('reads the usual Cameroonian spellings', () => {
    expect(amounts('15 000 FCFA')).toEqual([15000]);
    expect(amounts('15.000 F CFA')).toEqual([15000]);
    expect(amounts('XAF 15000')).toEqual([15000]);
    expect(amounts('15000F')).toEqual([15000]);
    expect(amounts('15 000 frs')).toEqual([15000]);
    expect(amounts('12 500 francs CFA')).toEqual([12500]);
  });
  it('handles non-breaking space thousand separators', () => {
    expect(amounts('Total: 1 250 000 FCFA')).toEqual([1250000]);
    expect(amounts('Total: 15 000 FCFA')).toEqual([15000]);
  });
  it('reads a labelled amount near a currency', () => {
    const r = f('Montant: 2 500 (FCFA)');
    expect(r.amounts.map((a) => a.value.amount)).toEqual([2500]);
  });
  it('does not read a labelled number without a currency', () => {
    expect(f('Total: 3 articles').amounts).toEqual([]);
  });
  it('sets the currency from the region', () => {
    expect(f('500 FCFA').amounts[0]?.value.currency).toBe('XAF');
  });
  it('does not read phone numbers as money', () => {
    expect(f('Appelez le 677 12 34 56 pour info').amounts).toEqual([]);
    expect(f('Appelez 699123456 maintenant').amounts).toEqual([]);
    expect(f('+237 677 123 456').amounts).toEqual([]);
  });
  it('does not read dates as money', () => {
    expect(f('le 15/11/2026').amounts).toEqual([]);
    expect(f('le 12 novembre 2026').amounts).toEqual([]);
    expect(f('12.11.2026 F').amounts).toEqual([]);
  });
  it('does not read a year or a number in a word as money', () => {
    expect(f('En 2026 les frais').amounts).toEqual([]);
    expect(f('5 frais de dossier').amounts).toEqual([]);
  });
  it('rejects amounts with a minor unit instead of rounding them', () => {
    expect(amounts('2,50 FCFA')).toEqual([]);
  });
  it('finds several amounts in order', () => {
    expect(amounts('Total 10 000 FCFA dont taxe 1 500 FCFA')).toEqual([10000, 1500]);
  });
});

describe('phones', () => {
  const phones = (t: string) => f(t).phones.map((p) => p.value);
  it('normalises every spelling to E.164', () => {
    expect(phones('677123456')).toEqual(['+237677123456']);
    expect(phones('6 77 12 34 56')).toEqual(['+237677123456']);
    expect(phones('677.12.34.56')).toEqual(['+237677123456']);
    expect(phones('677-12-34-56')).toEqual(['+237677123456']);
    expect(phones('+237 677 12 34 56')).toEqual(['+237677123456']);
    expect(phones('+237677123456')).toEqual(['+237677123456']);
    expect(phones('00237 677123456')).toEqual(['+237677123456']);
    expect(phones('237677123456')).toEqual(['+237677123456']);
  });
  it('accepts landlines starting with 2', () => {
    expect(phones('Tel 233 42 12 34')).toEqual(['+237233421234']);
  });
  it('ignores numbers that are not Cameroon phones', () => {
    expect(phones('Ref 12345678')).toEqual([]);
    expect(phones('le 15-11-2026')).toEqual([]);
    expect(phones('code 123456789')).toEqual([]);
  });
  it('finds a phone next to an amount', () => {
    const r = f('Envoyez 5000F au 677123456');
    expect(r.phones.map((p) => p.value)).toEqual(['+237677123456']);
    expect(r.amounts.map((a) => a.value.amount)).toEqual([5000]);
  });
  it('includes the + in the span', () => {
    const r = f('Call +237677123456 now');
    expect(r.phones[0]?.raw).toBe('+237677123456');
  });
});

describe('references, urls, ussd, short codes', () => {
  it('reads references after lexicon labels', () => {
    expect(f('N° facture: FAC-2026/0042').references.map((r) => r.value)).toEqual(['FAC-2026/0042']);
    expect(f('Ref: 8821993').references.map((r) => r.value)).toEqual(['8821993']);
    expect(f('Transaction ID 55412099').references.map((r) => r.value)).toEqual(['55412099']);
    expect(f('Invoice number INV778123').references.map((r) => r.value)).toEqual(['INV778123']);
  });
  it('does not take a date as a reference', () => {
    expect(f('Ref 15/11/2026').references).toEqual([]);
  });
  it('reads urls, www and short links', () => {
    expect(f('Cliquez http://eneo-pay.xyz/a1.').urls.map((u) => u.value)).toEqual(['http://eneo-pay.xyz/a1']);
    expect(f('voir www.camwater.cm pour plus').urls.map((u) => u.value)).toEqual(['www.camwater.cm']);
    expect(f('Gagnez ici: bit.ly/3xYzAb').urls.map((u) => u.value)).toEqual(['bit.ly/3xYzAb']);
  });
  it('does not read a date as a url', () => {
    expect(f('le 12.11.2026/').urls).toEqual([]);
  });
  it('reads ussd codes', () => {
    expect(f('Tapez *126# ou #150*1# puis OK').ussdCodes.map((u) => u.value)).toEqual(['*126#', '#150*1#']);
  });
  it('reads a short number after a label', () => {
    expect(f('Appelez le 8080 pour info').ussdCodes.map((u) => u.value)).toEqual(['8080']);
    expect(f('Dial 8010 for help').ussdCodes.map((u) => u.value)).toEqual(['8010']);
  });
});

describe('language detection', () => {
  it('detects French and English', () => {
    expect(f('Votre facture est disponible pour le mois de novembre').lang).toBe('fr');
    expect(f('Your bill is ready and you must pay before the date').lang).toBe('en');
  });
  it('says unknown for noise', () => {
    expect(f('asdf qwer zxcv').lang).toBe('unknown');
    expect(f('123').lang).toBe('unknown');
  });
  it('works with one lexicon only', () => {
    expect(extractFacts('Votre facture et vos frais pour le mois', { region, lexicons: [fr], receivedAt: '2026-10-31' }).lang).toBe('fr');
    expect(extractFacts('Votre facture et vos frais pour le mois', { region, lexicons: [en], receivedAt: '2026-10-31' }).lang).toBe('unknown');
  });
});
