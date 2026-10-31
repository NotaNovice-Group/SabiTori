# SabiTori architecture

Offline-first, on-device. One pipeline, language-neutral code, data-driven languages and regions.

```
packages/core        types, phrase catalog, pack + region contracts, the pipeline (pure TS, no DOM)
packages/speech      pack rules (numbers/dates/money/phones), pack loading, plan rendering, audio player
packages/understand  on-device LLM classifier (wllama, GGUF), model storage in OPFS
packs/<tag>/         language packs: manifest.json, phrases.json, rules.json, audio/
regions/<CODE>/      region.json: currency, phone format, official senders, offered languages
apps/app             the SabiTori app (Vite + React PWA, wrapped for Android with Capacitor)
apps/recorder        tool for translators and speakers to build language packs
```

Pipeline (all on the phone):

```
MessageInput ─► extractFacts (code) ─► classifier.classify (LLM or rules) ─► assessScam (code)
             ─► buildCard (choose + verify facts, decide full vs facts_only) ─► Card
Card ─► buildSpeechPlan (language-neutral Utterances) ─► renderPlan(pack) ─► Player
```

## Cross-package API (binding: implement exactly these names and shapes)

### @sabitori/core

```ts
analyze(input: MessageInput, deps: { region: RegionConfig; classifier?: Classifier }): Promise<Card>
extractFacts(text: string, ctx: { region: RegionConfig; receivedAt: IsoDate }): Facts
matchSender(input: MessageInput, region: RegionConfig): { sender: Sender; claimedSenderId?: string }
assessScam(input: MessageInput, facts: Facts, region: RegionConfig): ScamAssessment
createRulesClassifier(region: RegionConfig): Classifier            // always available, id "rules@1"
buildCard(args: { input; facts; understanding; scam; sender }): Card
buildSpeechPlan(card: Card, opts?: { today?: IsoDate }): SpeechPlan
CONFIDENCE_THRESHOLD: number                                       // below → facts_only
```

### @sabitori/speech

```ts
type RenderedPart = { kind: 'tts'; text: string; bcp47: string } | { kind: 'clip'; url: string };
interface RenderedSection { section: CardSection; text: string; parts: RenderedPart[]; lang: LangTag }

createPackRegistry(opts: { baseUrl: string }): PackRegistry       // fetches /packs/<tag>/...
interface PackRegistry { get(tag: LangTag): Promise<LanguagePack>; list(): Promise<PackManifest[]> }
renderPlan(plan: SpeechPlan, tag: LangTag, registry: PackRegistry, ctx: { region: RegionConfig; today: IsoDate }): Promise<RenderedSection[]>
renderPhrase(key: PhraseKey, slots: Record<string, SlotValue> | undefined, tag: LangTag, registry, ctx): Promise<{ text: string; parts: RenderedPart[]; lang: LangTag }>
requiredClips(pack: LanguagePack): string[]                         // every clip id a complete recorded pack needs
createBrowserPlayer(): Player
interface Player {
  play(sections: RenderedSection[], opts: { rate: number; from?: number;
       onSection?: (index: number | null) => void; onProgress?: (index: number, fraction: number) => void }): void;
  stop(): void;
  readonly playing: boolean;
}
```

### @sabitori/understand

```ts
createLlmClassifier(opts: { model: Blob | string; fallback: Classifier; onProgress?: (f: number) => void }): Promise<Classifier>
modelStore: { has(): Promise<boolean>; save(file: Blob): Promise<void>; load(): Promise<Blob | null>; remove(): Promise<void> }
```

## Rules

- No language or country words in code. UI text = catalog keys rendered through packs.
- Facts come from code only; the card builder rejects any fact without a source span.
- Never call a message safe. Scam level `no_signs` is spoken as "no warning signs found".
- No network calls at runtime. Packs, fonts, OCR data and models are bundled or side-loaded.
- Tests: vitest, next to each package in `test/`.
