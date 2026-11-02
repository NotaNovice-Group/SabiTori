/** A pack file could not be fetched or failed validation. */
export class PackLoadError extends Error {
  readonly tag?: string;
  constructor(message: string, tag?: string) {
    super(message);
    this.tag = tag;
    this.name = 'PackLoadError';
  }
}

/** The rules cannot express this value (bad input, missing section, missing word). Triggers language fallback. */
export class SpeechRuleError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'SpeechRuleError';
  }
}

/** A phrase, slot value or clip needed to render in this language is not available. Triggers language fallback. */
export class MissingResourceError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'MissingResourceError';
  }
}

/**
 * The phone has no text-to-speech voice for this language. Thrown by the system TTS backend instead of
 * speaking the text with a voice of another language (which would sound like nonsense). The player passes it
 * to `onError(sectionIndex, error)`; the app should then re-render that section in the next language of the
 * fallback chain (`renderPhrase`/`renderPlan` with that tag) and play it again.
 */
export class TtsVoiceUnavailableError extends Error {
  readonly bcp47: string;
  constructor(bcp47: string) {
    super(`this phone has no voice for ${bcp47}`);
    this.name = 'TtsVoiceUnavailableError';
    this.bcp47 = bcp47;
  }
}
