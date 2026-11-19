import { describe, expect, it } from 'vitest';
import { analyze, extractFacts } from '../src/index.js';
import { ctx, lexicons, msg, region } from './helpers.js';

const dates = (t: string) => extractFacts(t, ctx).dates.map((d) => d.value);

describe('"fin novembre" / "end of November": the last day of that month', () => {
  it('reads the end of a month as its last day', () => {
    expect(dates('Frais à payer avant fin novembre.')).toEqual(['2026-11-30']);
    expect(dates('à régler avant la fin du mois de décembre 2026')).toEqual(['2026-12-31']);
    expect(dates('Please pay by the end of December.')).toEqual(['2026-12-31']);
    expect(dates('due end of February 2028')).toEqual(['2028-02-29']);
  });
  it('a month alone or a weekend is not a date', () => {
    expect(dates('Bonne fin de semaine')).toEqual([]);
    expect(dates('Facture du mois de novembre')).toEqual([]);
  });
  it('a card uses it as the deadline', async () => {
    const c = await analyze(msg('Collège: la 2ème tranche de 40 000 FCFA est à payer avant fin novembre.', { kind: 'name', value: 'Collège' }, '2026-11-19'), { region, lexicons });
    expect(c.deadline?.value).toBe('2026-11-30');
    expect(c.amount?.value.amount).toBe(40000);
  });
});
