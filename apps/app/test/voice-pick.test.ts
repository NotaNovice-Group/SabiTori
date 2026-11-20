import { describe, expect, it } from 'vitest';
import { pickVoice, voiceRank } from '../src/engine/voice-pick';

const v = (voiceURI: string, name: string, lang: string) => ({ voiceURI, name, lang });
const IOS = [
  v('com.apple.voice.compact.fr-FR.Thomas', 'Thomas', 'fr-FR'),
  v('com.apple.speech.synthesis.voice.Zarvox', 'Zarvox', 'en-US'),
  v('com.apple.eloquence.fr-FR.Jacques', 'Jacques', 'fr-FR'),
  v('com.apple.voice.compact.en-GB.Daniel', 'Daniel', 'en-GB'),
  v('com.apple.voice.enhanced.fr-FR.Amelie', 'Amélie (Enhanced)', 'fr-FR'),
  v('com.apple.voice.premium.en-US.Zoe', 'Zoe (Premium)', 'en-US'),
  v('com.apple.voice.enhanced.fr-CA.Amelie', 'Amélie (Enhanced)', 'fr-CA'),
];

describe('phone voice choice', () => {
  it('ranks premium over enhanced over compact, and never novelty or Eloquence voices', () => {
    expect(IOS.map(voiceRank)).toEqual([0, -1, -1, 0, 2, 3, 2]);
  });
  it('picks the smoothest voice of the language, same region first', () => {
    expect(pickVoice(IOS, 'fr-FR')).toEqual({ index: 4, rank: 2 });
    expect(pickVoice(IOS, 'en-GB')).toEqual({ index: 5, rank: 3 }); // a premium US voice beats a compact British one
  });
  it('returns null when the phone has no voice for the language', () => {
    expect(pickVoice(IOS, 'pcm')).toBeNull();
  });
});
