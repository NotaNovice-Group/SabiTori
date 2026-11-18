import { describe, expect, it } from 'vitest';
import { analyze, buildSpeechPlan } from '../src/index.js';
import { lexicons, msg, region } from './helpers.js';

const read = (t: string, v: string) => analyze(msg(t, { kind: 'name', value: v }, '2026-11-18'), { region, lexicons });
const keys = (c: Awaited<ReturnType<typeof read>>) => buildSpeechPlan(c, { today: '2026-11-18' }).sections.flatMap((s) => s.utterances.map((u) => u.key));

describe('English-region notices', () => {
  it('"Second term starts on Monday 4 January" is a start date, and being in school is a place to go', async () => {
    const c = await read('GBHS Kumba: Second term starts on Monday 4 January 2027. Students must be in school by 7:30am in full uniform.', 'GBHS Kumba');
    expect(c.deadlineFrom).toBe(true);
    expect(keys(c)).not.toContain('deadline.by');
    expect(c.understanding.action).toBe('go_to_place');
  });
  it('a water cut for maintenance asks for nothing', async () => {
    const c = await read('CDC: Water will be off in Buea town on Saturday 21/11/2026 from 6am to 2pm for maintenance works. We regret any inconvenience.', 'CDC');
    expect(c.understanding.action).toBe('nothing');
    expect(keys(c)).not.toContain('deadline.by');
  });
});
