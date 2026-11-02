import type { Card, CardSection, Classifier, LangTag, MessageInput, PackManifest, PhraseKey, RegionConfig, Utterance } from '@sabitori/core';
import type { ExtraKey } from './extra';

export type UiKey = PhraseKey | ExtraKey;

/** Same shape as @sabitori/speech RenderedPart / RenderedSection. */
export type RenderedPart = { kind: 'tts'; text: string; bcp47: string } | { kind: 'clip'; url: string };
export interface RenderedSection {
  section: CardSection;
  text: string;
  parts: RenderedPart[];
  lang: LangTag;
}
/** A rendered section plus its sentences one by one (for the card's own layout). */
export interface SectionView extends RenderedSection {
  lines: { key: PhraseKey; text: string; lang: LangTag }[];
  /** The plan this section was rendered from, so it can be rendered again in another language. */
  utterances?: Utterance[];
}
export interface Rendered {
  text: string;
  parts: RenderedPart[];
  lang: LangTag;
}

export type Bundle = Record<UiKey, { text: string; lang: LangTag }>;

export interface PlayOptions {
  rate: number;
  from?: number;
  onSection?: (index: number | null) => void;
  onProgress?: (index: number, fraction: number) => void;
  /** A part of section `index` could not be played; the engine then tries the next language of the chain. */
  onError?: (index: number, error: Error) => void;
  /** Section `index` is now spoken from `section` (rendered in a fallback language) instead of the one given. */
  onFallback?: (index: number, section: SectionView) => void;
}

export type ModelStatus = 'unsupported' | 'none' | 'loading' | 'ready' | 'failed';
export interface ModelState {
  status: ModelStatus;
  size: number;
  progress: number;
}

/** Everything the UI needs from the packages, behind one door. */
export interface Engine {
  readonly region: RegionConfig;
  readonly source: 'packages' | 'stand-in';
  /** Languages the region offers, in display order, with their manifests. */
  languages(): Promise<PackManifest[]>;
  /** Every interface string rendered in `lang` (keys that need slots are skipped). */
  bundle(lang: LangTag): Promise<Bundle>;
  /** One interface string with optional text slots, rendered with the pack's fallback chain. */
  phrase(key: UiKey, lang: LangTag, slots?: Record<string, string>): Promise<Rendered>;
  /** Instant card from the rules classifier. */
  analyze(input: MessageInput): Promise<Card>;
  /** Re-read with the on-device model (null when there is no model or it timed out). */
  analyzeDeeper(input: MessageInput, timeoutMs: number): Promise<Card | null>;
  renderCard(card: Card, lang: LangTag): Promise<SectionView[]>;
  /** Dates, amounts and phone numbers the pipeline finds in a text (decides the OCR half-turn retry). */
  countFacts(text: string): number;
  playSections(sections: RenderedSection[], opts: PlayOptions): void;
  speak(rendered: Rendered, rate?: number): void;
  stop(): void;
  readonly playing: boolean;
  /** Understanding model (optional on-device classifier). */
  model: {
    state(): ModelState;
    subscribe(fn: (s: ModelState) => void): () => void;
    available(): Promise<boolean>;
    init(): Promise<void>;
    save(file: Blob): Promise<void>;
    remove(): Promise<void>;
  };
  /** The built-in small neural classifier that reads every message (rules until it has loaded). */
  understanding: {
    state(): { status: 'idle' | 'loading' | 'ready' | 'failed'; progress: number };
    subscribe(fn: (s: { status: 'idle' | 'loading' | 'ready' | 'failed'; progress: number }) => void): () => void;
  };
  /** Exposed for tests. */
  classifier(): Classifier;
}
