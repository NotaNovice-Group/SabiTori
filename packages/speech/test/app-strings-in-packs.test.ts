import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { validatePhrases } from '../src/validate.js';

describe('a pack may translate the app screen strings (app.*)', () => {
  it('accepts app.* entries as plain texts', () => {
    expect(() => validatePhrases({ 'app.next': { text: 'Next one', status: 'draft' } }, 'wes')).not.toThrow();
  });
  it('still checks their shape and refuses unknown spoken keys', () => {
    expect(() => validatePhrases({ 'app.next': { text: 3 } }, 'wes')).toThrow(/text must be a string/);
    expect(() => validatePhrases({ 'app.next': { text: 'x', status: 'final' } }, 'wes')).toThrow(/status/);
    expect(() => validatePhrases({ 'not.a.key': { text: 'x' } }, 'wes')).toThrow(/unknown phrase key/);
  });
  it('every pack in the repository loads, Pidgin with its app strings included', () => {
    for (const tag of ['fr', 'en', 'wes']) {
      const j = JSON.parse(readFileSync(resolve(__dirname, `../../../packs/${tag}/phrases.json`), 'utf8'));
      expect(() => validatePhrases(j, tag), tag).not.toThrow();
    }
  });
});
