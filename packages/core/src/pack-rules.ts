/**
 * Rules that tell the speech package how a language says numbers, money,
 * dates and phone numbers. OWNED BY @sabitori/speech: that package defines
 * and documents the real shape. This placeholder keeps core compiling.
 */
export interface PackRules {
  formatVersion: 1;
  [section: string]: unknown;
}
