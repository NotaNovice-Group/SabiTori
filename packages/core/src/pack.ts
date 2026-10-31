/**
 * Language pack format. A pack is a folder in /packs/<tag>/:
 *
 *   manifest.json   PackManifest
 *   phrases.json    PackPhrases (catalog key -> text and audio parts)
 *   rules.json      PackRules (numbers, dates, money, phone reading)
 *   audio/          recorded clips (.webm/opus or .m4a), referenced by id
 *
 * Adding a language = adding a folder. No code change, no app release
 * beyond shipping the pack (packs can also be side-loaded as a .zip).
 */
import type { LangTag, RegionCode } from './types.js';
import type { PhraseKey } from './catalog.js';
import type { PackRules } from './pack-rules.js';

export type VoiceSource =
  /** Synthetic voice: the OS text-to-speech (offline Android voices) or Piper. */
  | { kind: 'tts'; engine: 'system' | 'piper'; bcp47: string; voiceHint?: string }
  /** Every sentence is a human recording; slots are stitched from recorded atoms. */
  | { kind: 'recorded' };

export type PackStatus =
  | 'stable' // reviewed text and voice for every catalog key
  | 'beta' // usable, some keys fall back
  | 'in_recording' // being translated / recorded; not offered to users yet
  | 'planned'; // listed so communities can claim it

export interface Contributor {
  /** Public display name, only with written consent. */
  name: string;
  role: 'translator' | 'speaker' | 'reviewer' | 'maintainer';
}

export interface PackManifest {
  formatVersion: 1;
  tag: LangTag;
  /** English name, for maintainers. */
  name: string;
  /** The language's own name for itself, shown to users. */
  autonym: string;
  script: string; // ISO 15924, e.g. "Latn"
  direction: 'ltr' | 'rtl';
  /** Ordered fallback for missing phrases or audio, e.g. ["fr"] for Ewondo. */
  fallback: LangTag[];
  voice: VoiceSource;
  /** Whether SabiTori can read messages written in this language (OCR + understanding). */
  reads: boolean;
  status: PackStatus;
  regions: RegionCode[];
  /** Licence chosen by the language community, SPDX id, e.g. "CC-BY-SA-4.0". */
  license: string;
  contributors: Contributor[];
  /** Semver of the pack content; bumps on every published change. */
  version: string;
}

/** A recorded clip or a slot to render, in speaking order. */
export type AudioPart = { clip: string } | { slot: string };

export interface PhraseEntry {
  text: string;
  /** Present for recorded languages. Omitted parts fall back to TTS of `text` if the pack's voice allows. */
  audio?: AudioPart[];
  status: 'draft' | 'reviewed';
}

export type PackPhrases = Partial<Record<PhraseKey, PhraseEntry>>;

export interface LanguagePack {
  manifest: PackManifest;
  phrases: PackPhrases;
  rules: PackRules;
  /** Resolves a clip id to a playable URL (bundled asset, OPFS file or blob URL). */
  clipUrl?: (clipId: string) => string;
}
