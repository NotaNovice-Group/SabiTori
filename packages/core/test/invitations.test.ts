import { describe, expect, it } from 'vitest';
import { analyze } from '../src/index.js';
import { lexicons, msg, region } from './helpers.js';

const card = (t: string) => analyze(msg(t, { kind: 'name', value: 'Paroisse' }, '2026-11-18'), { region, lexicons });

describe('invitations are a place to go', () => {
  it('"veillée ... à 19h30 à l église. Venez nombreux" says when to be there', async () => {
    const c = await card("Paroisse: veillée de prière le 28/11/2026 à 19h30 à l'église. Venez nombreux.");
    expect(c.understanding.action).toBe('go_to_place');
    expect(c.deadlineTime?.value).toBe('19:30');
    // (No message kind fits a church event, so this card is facts only, which speaks the date without the time.)
  });
  it('English: "All members are invited"', async () => {
    const c = await card('Presbyterian Church Molyko: Thanksgiving service on 22/11/2026 at 9am. All members are invited.');
    expect(c.understanding.action).toBe('go_to_place');
  });
});
