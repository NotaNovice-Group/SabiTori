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
