import { describe, expect, it } from 'vitest';
import { buildAudio, clipId, splitAtSlots, textPieces, validateSlots, slotsIn } from '../src/lib/slots';

describe('splitAtSlots', () => {
  it('cuts text at slots and numbers text pieces', () => {
    const p = splitAtSlots('deadline.by', 'Do it by {date}, please.');
    expect(p.map((x) => (x.kind === 'text' ? x.text : `{${x.name}}`))).toEqual(['Do it by', '{date}', 'please.']);
    expect(p.filter((x) => x.kind === 'text').map((x) => (x as any).id)).toEqual(['deadline.by.0', 'deadline.by.1']);
  });
  it('a phrase without slots is one piece', () => {
    expect(textPieces('urgency.soon', 'Do this soon.')).toHaveLength(1);
  });
  it('drops empty and punctuation-only pieces, keeps slot order', () => {
    const p = splitAtSlots('x.y', '{a} {b}.');
    expect(p).toEqual([{ kind: 'slot', name: 'a' }, { kind: 'slot', name: 'b' }]);
  });
  it('a slot at the start leaves piece 0 after it', () => {
    const p = splitAtSlots('x.y', '{sender} sent this.');
    expect(p[0]).toEqual({ kind: 'slot', name: 'sender' });
    expect((p[1] as any).id).toBe('x.y.0');
  });
  it('repeated slots are each kept', () => {
    expect(slotsIn('It says {sender}, but not {sender}.')).toEqual(['sender', 'sender']);
  });
});

describe('validateSlots', () => {
  it('accepts moved slots', () => {
    expect(validateSlots('{sender} a tɔ̂ɔ', ['sender']).ok).toBe(true);
  });
  it('reports missing and extra', () => {
    const r = validateSlots('Pay {sum}', ['amount']);
    expect(r).toMatchObject({ ok: false, missing: ['amount'], extra: ['sum'] });
  });
  it('accepts a slot used once when the source uses it twice', () => {
    expect(validateSlots('Ewondo {sender}', ['sender']).ok).toBe(true);
  });
  it('flags broken braces', () => {
    expect(validateSlots('Call {phone', ['phone']).malformed).toBe(true);
    expect(validateSlots('Call {}', []).malformed).toBe(true);
  });
  it('a sentence with no slots rejects invented ones', () => {
    expect(validateSlots('Hello {x}', []).ok).toBe(false);
    expect(validateSlots('Hello', []).ok).toBe(true);
  });
});

describe('clip ids', () => {
  it('are deterministic from key and piece index', () => {
    expect(clipId('scam.likely', 0)).toBe('scam.likely.0');
    expect(buildAudio('help.call', 'Call {phone} now')).toEqual([
      { clip: 'help.call.0' },
      { slot: 'phone' },
      { clip: 'help.call.1' },
    ]);
    expect(buildAudio('help.call', 'Call {phone} now')).toEqual(buildAudio('help.call', 'Call {phone} now'));
  });
});
