import { describe, expect, it } from 'vitest';
import { createRulesClassifier, extractFacts } from '../src/index.js';
import { ctx, lexicons, msg, region } from './helpers.js';

// README labelling rule: a genuine offer ("double your recharge today only") is nothing / info; "today only" is marketing.
const rules = createRulesClassifier(region, lexicons);
const read = (text: string) => rules.classify(msg(text), extractFacts(text, ctx));

describe('operator offers with "today only" are nothing / info', () => {
  it.each([
    "MTN: aujourd'hui seulement, rechargez dès 1 000 FCFA et recevez 100% de bonus! Offre valable jusqu'à minuit.",
    'MTN: buy 1,000 FCFA recharge today only and get double. No miss am!',
  ])('%s', async (t) => {
    const u = await read(t);
    expect([u.action, u.urgency]).toEqual(['nothing', 'info']);
  });
  it('a fake prize that asks for a fee is still "pay"', async () => {
    const u = await read('Congratulations! You won 500,000 FCFA, today only. Pay the 7,500 FCFA file fee to 699 00 77 12 to receive it.');
    expect(u.action).toBe('pay');
  });
});
