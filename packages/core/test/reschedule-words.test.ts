import { describe, expect, it } from 'vitest';
import { analyze } from '../src/index.js';
import { lexicons, msg, region } from './helpers.js';

const card = (t: string) => analyze(msg(t, { kind: 'name', value: 'Hôpital' }, '2026-11-19'), { region, lexicons });

describe('a moved appointment: the new date counts', () => {
  it('"initialement le 20/11, il est fixé au 27/11"', async () => {
    const c = await card('Rendez-vous reporté: initialement le 20/11/2026, il est fixé au 27/11/2026 à 10h.');
    expect(c.deadline?.value).toBe('2026-11-27');
    expect(c.deadlineTime?.value).toBe('10:00');
  });
  it('"désormais le" and "now set for"', async () => {
    expect((await card('La réunion du 21/11/2026 aura désormais lieu le 28/11/2026.')).deadline?.value).toBe('2026-11-28');
    expect((await card('Your hearing on 20 November 2026 is now set for 4 December 2026.')).deadline?.value).toBe('2026-12-04');
  });
  it('a first appointment "fixé au" keeps its one date', async () => {
    expect((await card('Votre rendez-vous est fixé au 30/11/2026 à 9h.')).deadline?.value).toBe('2026-11-30');
  });
});
