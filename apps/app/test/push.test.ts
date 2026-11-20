import { describe, expect, it } from 'vitest';
import { acceptForeground, pushEnabled, topicFor } from '../src/lib/push';
// @ts-expect-error plain .mjs script without types
import { messagesFor } from '../../../scripts/lib/push-message.mjs';

describe('instant scam alerts', () => {
  it('only in push builds', () => {
    expect(pushEnabled({ VITE_PUSH: '1' })).toBe(true);
    expect(pushEnabled({})).toBe(false);
  });
  it('one topic per region and language, never per phone', () => {
    expect(topicFor('CM', 'fr')).toBe('alerts-CM-fr');
    expect(topicFor('CM', 'en')).toBe('alerts-CM-en');
    expect(topicFor('CM', 'wes')).toBe('alerts-CM-fr');
  });
  it('a push shown in the app follows the alert rules: short, no link, number or code', () => {
    expect(acceptForeground({ title: 'Faux SMS ENEO', body: 'ENEO ne demande jamais 2 000 FCFA par SMS.' })).toBeTruthy();
    expect(acceptForeground({ title: 'Faux SMS', body: 'Payez sur http://x.co' })).toBeNull();
    expect(acceptForeground({ title: 'Faux SMS', body: 'Appelez le 677 12 34 56' })).toBeNull();
    expect(acceptForeground({ title: '', body: 'x' })).toBeNull();
  });
  it('the publisher sends each language to its own topic', () => {
    const m = messagesFor({ id: 'a', title: { fr: 'T', en: 'T-en' }, body: { fr: 'B', en: 'B-en' } }, 'CM');
    expect(m.map((x: { message: { topic: string } }) => x.message.topic)).toEqual(['alerts-CM-fr', 'alerts-CM-en']);
    expect(m[1].message.notification).toEqual({ title: 'T-en', body: 'B-en' });
  });
});
