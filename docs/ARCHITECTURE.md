# SabiTori architecture

Offline-first, on-device. One pipeline, language-neutral code, data-driven languages and regions.

```
packages/core        types, phrase catalog, pack + region contracts, the pipeline (pure TS, no DOM)
packages/speech      pack rules (numbers/dates/money/phones), pack loading, plan rendering, audio player
packages/understand  on-device understanding: MiniLM encoder classifier (default, bundled, 33M parameters,
                     onnxruntime-web); optional side-loaded LLM second opinion (wllama, GGUF, OPFS storage);
                     evaluation set and training code
packages/connect     optional update channel: signature check, atomic install, overlay fetch
packs/<tag>/         language packs: manifest.json, phrases.json, rules.json, audio/
regions/<CODE>/      region.json: currency, phone format, official senders, offered languages
apps/app             the SabiTori app (Vite + React PWA, wrapped for Android with Capacitor)
apps/recorder        tool for translators and speakers to build language packs
```

Pipeline (all on the phone):

```
photo ─► OCR (Tesseract LSTM, on the phone) ─► text
MessageInput ─► extractFacts (code) ─► rules classifier (always: baseline and guard)
             ─► classifier.classify (MiniLM encoder + rules by default; rules alone until the
                encoder has loaded or if it fails) ─► guard against the facts ─► assessScam (code)
             ─► buildCard (choose + verify facts, decide full vs facts_only) ─► Card
Card ─► buildSpeechPlan (language-neutral Utterances) ─► renderPlan(pack) ─► Player
```

The default classifier is the bundled MiniLM encoder with three linear heads, combined field by field
with the keyword rules (`createEncoderClassifier`, `docs/model.md`). An LLM is never needed: the optional
Qwen2.5-1.5B model is only used when a person side-loads it and asks for a "deeper" second reading
(`Engine.analyzeDeeper`). No model ever produces a fact; facts come from code.

`analyze` always runs the rules classifier, as the baseline and as a guard, whatever classifier is
passed. The encoder's answer goes through `guardUnderstanding` (`packages/core/src/guard.ts`, applied
in `combineWithRules`): never "nothing to do" next to a deadline or a payment, urgency never below
what the dates say, no `pay` under a scam caution, and when the text was cut at the token budget the
encoder's action and urgency are ignored. When another classifier answered, the card keeps what the
rules read as `Card.rulesKind`; safety text such as the balance-check advice keys on it.

## Cross-package API (binding: implement exactly these names and shapes)

### @sabitori/core

```ts
analyze(input: MessageInput, deps: { region: RegionConfig; lexicons: ReadingLexicon[]; classifier?: Classifier }): Promise<Card>
extractFacts(text: string, ctx: { region: RegionConfig; lexicons: ReadingLexicon[]; receivedAt: IsoDate }): Facts
matchSender(input: MessageInput, region: RegionConfig, lexicons?: ReadingLexicon[]): { sender: Sender; claimedSenderId?: string }
assessScam(input: MessageInput, facts: Facts, region: RegionConfig, lexicons?: ReadingLexicon[]): ScamAssessment
createRulesClassifier(region: RegionConfig, lexicons?: ReadingLexicon[]): Classifier   // always available, id "rules@1"
buildCard(args: { input; facts; understanding; scam; sender; lexicons?: ReadingLexicon[] }): Card
buildSpeechPlan(card: Card, opts?: { today?: IsoDate }): SpeechPlan
CONFIDENCE_THRESHOLD: number                                       // 0.55; below → facts_only
```

Reading lexicons: every word used to READ a message (month and weekday names, "demain",
currency words, classification keywords, scam phrases, reference labels) lives in
`packs/<tag>/reading.json`, typed `ReadingLexicon` (`packages/core/src/reading.ts`).
The app loads the lexicons of the languages it can read (today fr and en) and passes them
to the pipeline as data. Code contains no language words. Without lexicons the pipeline
still extracts amounts, phones, URLs and USSD codes, but cannot classify or detect
phrase-based scam signals.

Core behaviours worth knowing:
- Scam level `likely_scam` suppresses the message's own action, deadline, amount and urgency in the
  speech plan (they are the trap), and `contactPhone` is never set unless the sender is verified.
- `facts_only` plans still speak scam warnings first, then `facts_only.intro`, then fact sections.
- `Facts.ussdCodes` also holds short numbers such as 8080 when introduced by a lexicon label.

### @sabitori/speech

```ts
type RenderedPart = { kind: 'tts'; text: string; bcp47: string; tag?: string; voice?: string } | { kind: 'clip'; url: string };
// tts parts carry the pack tag and voice that should speak them
interface RenderedSection { section: CardSection; text: string; parts: RenderedPart[]; lang: LangTag }

createPackRegistry(opts: { baseUrl: string }): PackRegistry       // fetches /packs/<tag>/...
interface PackRegistry { get(tag: LangTag): Promise<LanguagePack>; list(): Promise<PackManifest[]>;
  manifests?(): Promise<{ manifests: PackManifest[]; errors; complete: boolean }> }  // every valid manifest, with status
// render context: includeDrafts?: boolean (tester builds only: also speak phrases still marked draft)
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
class TtsVoiceUnavailableError extends Error { bcp47: string }   // the phone has no voice for this language:
// passed to the player's onError; the app re-renders that section in the next fallback language
```

English dates are spoken as ordinals ("the eleventh of November"), from `packs/en/rules.json`.

### @sabitori/understand

```ts
// default, bundled: MiniLM int8 encoder + heads, combined with the rules (fallback) field by field
createEncoderClassifier(opts: { baseUrl: string; fallback: Classifier; threshold?: Thresholds; wasmBaseUrl?: string;
                                onProgress?: (f: number) => void; readFile?; ort? }): Promise<Classifier>   // id "minilm-l12-int8@1"
loadEncoder(opts): Promise<Encoder>                                // embeddings, for tests and evaluation
// optional, side-loaded LLM second opinion (never the default)
createLlmClassifier(opts: { model: Blob | string; fallback: Classifier; onProgress?: (f: number) => void }): Promise<Classifier>
modelStore: { has(): Promise<boolean>; save(file: Blob): Promise<void>; load(): Promise<Blob | null>; remove(): Promise<void> }
```

## Rules

- No language or country words in code. UI text = catalog keys rendered through packs.
- Facts come from code only; the card builder rejects any fact without a source span.
- Never call a message safe. Scam level `no_signs` is spoken as "no warning signs found".
- Message text and photos never leave the phone, in any mode. The app works fully offline: packs, fonts,
  OCR data and models are bundled or side-loaded.
- Two OPTIONAL network features exist, both off by default, both absent unless the build was configured
  (apps/app/.env.example): signed updates (`packages/connect`, docs/updates.md: GET of files named in a
  signed index, nothing else) and scrubbed crash reports (apps/app/src/lib/scrub.ts). The Android app
  uses the INTERNET permission only for these, HTTPS only, and a CSP limits `connect-src`. Other Android
  permissions: CAMERA (photos of papers), POST_NOTIFICATIONS (reminders), and RECEIVE_BOOT_COMPLETED +
  WAKE_LOCK from the local-notifications plugin so reminders survive a restart.
- Tests: vitest, next to each package in `test/`.
