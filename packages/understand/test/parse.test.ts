import { describe, expect, it } from 'vitest';
import { combineConfidence, parseModelOutput } from '../src/index.js';

const ok = '{"kind":"health","action":"call","urgency":"soon","confidence":0.8}';

describe('parseModelOutput', () => {
  it('accepts valid output, tolerates surrounding text', () => {
    expect(parseModelOutput(ok)).toEqual({ kind: 'health', action: 'call', urgency: 'soon', confidence: 0.8 });
    expect(parseModelOutput('```json\n' + ok + '\n```')?.kind).toBe('health');
  });
  it.each([
    ['malformed', '{"kind":"health",'],
    ['empty', ''],
    ['bad kind', ok.replace('health', 'weather')],
    ['bad action', ok.replace('call', 'dance')],
    ['bad urgency', ok.replace('soon', 'later')],
    ['confidence out of range', ok.replace('0.8', '1.7')],
    ['confidence string', ok.replace('0.8', '"high"')],
    ['array', '[1]'],
  ])('rejects %s', (_n, s) => expect(parseModelOutput(s)).toBeNull());
});

describe('combineConfidence', () => {
  it('caps at 0.9', () => expect(combineConfidence(1, 'bank', 'bank')).toBe(0.9));
  it('lowers on kind disagreement', () => expect(combineConfidence(0.8, 'bank', 'other')).toBe(0.48));
  it('clamps negatives', () => expect(combineConfidence(-1, 'bank', 'bank')).toBe(0));
});
