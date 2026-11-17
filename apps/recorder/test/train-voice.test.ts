/** The voice recipe's training list must cut phrases exactly as the Recorder names its clips. */
import { describe, expect, it } from 'vitest';
import { textPieces } from '../src/lib/slots';
import { phraseClipTexts } from '../../../packages/speech/train-voice/dataset';

const samples = [
  'Yu go pay {amount} bifo {date}.',
  '{amount} FCFA, {date}',
  '  , Vous devez payer {amount} avant le {date} ; merci.',
  'Appelez le {phone}.',
  'No giv yu kod to nobodi.',
  '{sender}: {amount} – {date}!',
];

describe('voice recipe and Recorder agree on clip ids and words', () => {
  for (const text of samples) {
    it(JSON.stringify(text), () => {
      expect(phraseClipTexts('k', text)).toEqual(textPieces('k', text).map((p) => ({ id: p.id, text: p.text })));
    });
  }
});
