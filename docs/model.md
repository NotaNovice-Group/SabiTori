# On-device models (@sabitori/understand)

SabiTori has two on-device understanding models. Both only **choose labels** from the closed lists in `@sabitori/core` (`kind`, `action`, `urgency`); dates, amounts, phone numbers and text always come from code.

| | Built-in small model (default, every message) | Optional "deeper" LLM |
| --- | --- | --- |
| Model | paraphrase-multilingual-MiniLM-L12-v2 encoder (Apache-2.0), int8 ONNX, plus 3 linear heads | Qwen2.5-1.5B-Instruct Q4_K_M GGUF |
| Size | about 35.6 MB, shipped inside the app | about 1 GB, side-loaded |
| Parameters | 117.7M base; 33.0M after pruning the vocabulary to 30k pieces | 1.5B |
| Speed | median about 60 ms per message on a laptop core; about 230 ms median, 400 ms p95 with the CPU throttled 4x (headless Chromium, one thread) | seconds |
| Runtime | onnxruntime-web (wasm, one thread, no COOP/COEP) | wllama |
| Classifier id | `minilm-l12-int8@1` | `qwen2.5-1.5b-q4@1` |

## Built-in model: how it plugs in

```
text -> tokenizer.json (Unigram, pure JS) -> encoder.int8.onnx (mean pooled, 384 numbers)
     -> L2 normalise -> heads.json (3 softmax-regression heads, temperature-calibrated)
     -> per field: encoder label if its probability >= that field's threshold, else the rules' label
```

- Code: `src/encoder.ts` (`createEncoderClassifier({ baseUrl, fallback, wasmBaseUrl, threshold?, readFile?, ort? })`), `src/encoder-math.ts` (pure head and combination maths).
- Files: `packages/understand/model/minilm/` (`encoder.int8.onnx`, `tokenizer.json`, `heads.json`, `model-card.md`); training and export in `packages/understand/train/` (see its README for the exact commands).
- Combination: thresholds per field (kind 0.85, action 0.55, urgency 0.65) are stored in `heads.json` and were picked on the train split only. Confidence is the lowest confidence among the sources used, capped at 0.95. Below that the rules answer. Any error (files missing, runtime fails) also gives the rules' answer. The encoder cannot create a fact.
- App: `apps/app/src/engine/encoder.ts` loads it once, lazily, when the app calls `engine.model.init()` after first paint (about 1.2 s after start); until it is ready `Engine.analyze` uses rules. `Engine.analyzeDeeper` and the optional LLM are unchanged. Settings shows "Understanding model: built in (MiniLM, 118M)" and its status.
- Assets (copied by `apps/app/vite.config.ts` into `public/`, all precached by the PWA service worker):
  `models/minilm/{encoder.int8.onnx,tokenizer.json,heads.json}` and `ort/ort-wasm-simd-threaded.{wasm,mjs}` (onnxruntime-web 1.22.0, 11.2 MB wasm, shared with the Piper voices). A vite plugin maps `onnxruntime-web/wasm` to its "extern wasm" build so the wasm is not bundled twice. The app passes an absolute `wasmBaseUrl` (the runtime imports its loader from there).
  Added to the APK: about 50 MB uncompressed (35.6 MB model + 14.9 MB runtime).
- Node (tests, eval): the same code runs with onnxruntime-web's Node entry; pass `readFile` to read the files from disk.

Evaluate: `node packages/understand/eval/run-encoder.mjs` (test split, writes `eval/results-encoder.md`; baseline numbers in `eval/results-rules.md`).

Known limits: the encoder runs on the main thread (about 0.2 to 0.4 s of CPU per message on a slow phone); `env.wasm.proxy` could move it to a worker later. Training data is synthetic and small; see `model/minilm/model-card.md`.

---

# Optional deeper model: Qwen2.5 LLM

## What it is

- Default: **Qwen2.5-1.5B-Instruct, GGUF Q4_K_M** (about 1 GB). Optional: Qwen2.5-3B-Instruct Q4_K_M (about 2 GB; pass `id: 'qwen2.5-3b-q4@1'`).
- Licence: Qwen2.5-1.5B-Instruct is **Apache-2.0**. Qwen2.5-3B is published under the Qwen Research licence (not Apache-2.0; check commercial terms before shipping it). Always verify the model card of the exact file you distribute. wllama is MIT.
- Runs in the browser through `@wllama/wllama` (llama.cpp compiled to WebAssembly) in a worker. No network at runtime.
- It is not a frontier model. It is a small open model used as a **classifier only**: it picks one label from each closed list in `@sabitori/core` (`kind`, `action`, `urgency`) and a confidence. A GBNF grammar makes any other output impossible. It never produces dates, amounts, phone numbers or free text; those come from code. If the model fails, times out (default 25 s) or the output does not validate, the rule-based classifier answers instead.
- Confidence: model value capped at 0.9; multiplied by 0.6 when the rules classifier picks a different `kind`.

## Size and RAM

| Model | File | Peak RAM while loaded (approx.) |
| --- | --- | --- |
| Qwen2.5-1.5B Q4_K_M | about 1.0 GB | 1.5 to 2 GB |
| Qwen2.5-3B Q4_K_M | about 2.0 GB | 3 to 3.5 GB |

Phones with 3 GB RAM or less should use the 1.5B model, or rules only. Context is 2048 tokens; the prompt (system plus 6 short examples plus the message, truncated to 1200 characters keeping start and end) is roughly 900 tokens. Expect a few seconds per message on a mid-range phone with single thread; multi-thread needs cross-origin isolation headers. Files over 2 GB must be split with `llama-gguf-split` (wllama limitation); the default models are under that.

## Wasm assets (app build step)

The app is offline, so it must bundle wllama's wasm. wllama 3.8 ships one wasm file:

```
node_modules/@wllama/wllama/esm/wasm/wllama.wasm      (about 8.7 MB)
```

Copy it to the app's public folder at build time, for example in `apps/app/package.json`:

```json
"prebuild": "mkdir -p public/wllama && cp ../../node_modules/@wllama/wllama/esm/wasm/wllama.wasm public/wllama/wllama.wasm"
```

(adjust the source path to where pnpm links the package, e.g. `node_modules/.pnpm/@wllama+wllama@3.8.1/node_modules/@wllama/wllama/esm/wasm/wllama.wasm`; a Vite static-copy plugin works too). Then pass the same URL base to the classifier: `wasmBaseUrl: import.meta.env.BASE_URL + 'wllama/'`. `wllamaAssetPaths(baseUrl)` returns the config wllama expects (`{ default, 'single-thread/wllama.wasm', 'multi-thread/wllama.wasm' }`, all pointing to `<baseUrl>/wllama.wasm`). Add the wasm to the service worker precache. Do not use `@wllama/wllama/esm/wasm-from-cdn.js`: it needs the internet.

## Side-loading the GGUF

1. A support worker downloads the GGUF once (on their own connection) and puts it on the phone (USB, SD card, Bluetooth, WhatsApp document).
2. In **Settings, Smart reading**, the person taps "Add model file" (a file picker, `<input type="file" accept=".gguf">`).
3. The app calls `modelStore.save(file)`. It checks the "GGUF" magic bytes (`isGgufBlob`), asks for persistent storage (`navigator.storage.persist()`), and writes the file to OPFS (`sabitori-model.gguf`). Errors have a `code`: `not_gguf`, `unavailable` (no OPFS), `write_failed` (usually full storage).
4. On start: `if (await modelStore.has()) classifier = await createLlmClassifier({ model: (await modelStore.load())!, fallback: rules, onProgress, wasmBaseUrl })`, else use the rules classifier. "Remove model" calls `modelStore.remove()`.

OPFS `createWritable` is missing in some older WebViews; then `save` throws `unavailable`/`write_failed` and the app stays on rules. Check `modelStore.available()` to hide the option.

## Evaluating

`evaluate(classifier, cases)` is a pure function over a labelled JSON set:

```ts
interface EvalCase { id?: string; input: MessageInput; facts?: Facts;
                     expected: { kind?: MessageKind; action?: ActionKind; urgency?: Urgency } }
const report = await evaluate(classifier, cases);
// report.accuracy.{kind,action,urgency}, report.accuracyAll, report.meanConfidence,
// report.confusion[field][expected][predicted], report.failures[], report.errors
```

Run it for the rules classifier and the LLM classifier on the same set and compare. Build the set from real, consented, anonymised messages in French and English across bills, mobile money, hospital, school and administration; keep some ambiguous and scam-like messages. Fields without an `expected` value are skipped. Ship the model only if it beats the rules on `kind` and `action` accuracy and does not lower `accuracyAll`; use `meanConfidence` and `failures` to tune `prompt.ts` (few-shots, wording) and the card builder's `CONFIDENCE_THRESHOLD`. Re-run after any change to `prompt.ts`.

## Voices

SabiTori speaks with small open neural voices that run on the phone, replacing the phone maker's closed TTS as the default. The phone's own TTS stays underneath as an automatic fallback.

### Runtime

Chosen: **onnxruntime-web 1.22 (MIT, CPU/wasm, single thread) + the espeak-ng/piper-phonemize wasm from `@diffusionstudio/piper-wasm` 1.0.0 (MIT wrapper, GPL-3.0-or-later espeak-ng)**, driven by our own code in `packages/speech/src/piper/` inside a module Web Worker. No COOP/COEP is needed.

| Option | Verdict |
| --- | --- |
| `@mintplex-labs/piper-tts-web` 1.0.5 | Same two wasm builds underneath, but it fetches voices from Hugging Face, caches them in OPFS, creates a new espeak instance per sentence and cannot do `phoneme_type: "text"`. Its wasm paths can be local, the model loading cannot. Not used. |
| sherpa-onnx wasm TTS (Apache-2.0) | Offline, but the npm package is a Node build (15 MB wasm); a browser build means compiling with Emscripten and embedding the model. More build burden, not smaller. Not used. |
| onnxruntime-web + espeak-ng wasm (ours) | About 13 MB of runtime files, loads model and config from local URLs, phonemizes once per instance, supports `phoneme_type: "text"` (no espeak at all). Chosen. |

Runtime files (staged into `public/piper/` by `scripts/piper-assets.mjs`): ORT wasm 11.2 MB, phonemizer wasm 0.6 MB, espeak-ng data trimmed from 18.1 MB to 1.05 MB (only the dictionaries the bundled voices need, derived from `packs/*/voice/*.onnx.json`). Note that `public/ort/` (the understanding model) holds a second copy of the ORT wasm; the two can be unified later when both use the same onnxruntime-web version.

### Voices

| Pack | Voice | Licence | Size |
| --- | --- | --- | --- |
| fr | `fr_FR-siwis-low` (16 kHz) | CC BY 4.0 | 28.1 MB |
| en | `en_GB-alba-medium` (22.05 kHz) | CC BY 4.0 | 63.2 MB |

Together over 80 MB, so the `.onnx` files are git-ignored: `node scripts/fetch-voices.mjs` restores them from a pinned Hugging Face revision and verifies sha256, and the app build runs it when a model is missing (offline build: it warns and the app uses the phone voice). No English voice at or below about 30 MB with a redistributable licence exists in rhasspy/piper-voices (no `x_low`; all `low` English voices are 63 MB). Records: `packs/<tag>/voice/VOICE.md`, `THIRD_PARTY_NOTICES.md`.

A pack points to its own model with `voice: { kind: 'tts', engine: 'piper', bcp47, voiceHint: '<model id>' }` and files `packs/<tag>/voice/<id>.onnx` + `.onnx.json`. Models with `phoneme_type: "text"` (planned for Cameroonian languages) skip espeak-ng.

### Behaviour

- Rate maps to Piper `length_scale` (multiplier of the model's own value, 1/rate, clamped 0.4 to 2.5). Rate 0.7 made speech about 1.3x longer in tests.
- Text is split into sentences; the next sentence is synthesized while the current one plays; progress callbacks are per character weight.
- Synthesized sentences are cached in memory (32 MB cap, per voice and rate), so "Again" starts immediately (0 to 1 ms measured).
- Fallback to the system voice, never silence: no Piper voice for the language, model/config fails to load, model still loading after 6 s (this utterance only), first synthesis of the session over 6 s (Piper off for the session), a synthesis error (the unplayed rest is spoken by the system voice), blocked audio output. Covered by `packages/speech/test/piper-tts.test.ts`.
- The voice of the phone's language is loaded in the background at start; at most 2 models stay in RAM.

### Measurements

Headless Chromium (`/opt/pw-browsers/chromium`), real audio output, voices loaded, 3 sentences per language (`packages/speech/bench/`). Time to first audio (TTFA) is from `speak()` to the first sample reaching the audio device. RTF is synthesis time divided by audio length (below 1 means faster than real time). The CPU of the test machine is not a phone; treat the 4x column as a relative stress test.

Chromium's 4x CPU throttling does not slow Web Workers, so the 4x rows run the same runtime on the main thread (the real app uses a worker).

| Condition | Language | Model load | TTFA (3 sentences) | RTF |
| --- | --- | --- | --- | --- |
| Worker, no throttling | fr | 2.7 s | 665 / 498 / 607 ms | 0.27 / 0.18 / 0.17 |
| Worker, no throttling | en | 2.5 s | 1344 / 753 / 1458 ms | 0.43 / 0.30 / 0.41 |
| Main thread, 4x CPU throttling | fr | 9.9 s | 2736 / 2435 / 2481 ms | 1.06 / 0.84 / 0.78 |
| Main thread, 4x CPU throttling | en | 8.3 s | 5292 / 4018 / 5118 ms | 1.53 / 1.56 / 1.29 |

Sentences: "Vous avez reçu 5 000 francs de votre opérateur.", "Ne partagez jamais votre code secret avec personne.", "Le rendez-vous est prévu demain à dix heures au centre de santé."; "You have received 5,000 francs from your operator.", "Never share your secret code with anyone.", "Your appointment is tomorrow at ten o'clock at the health centre."

Reading: French (low) stays under the 6 s limit with margin at 4x; English (medium) is within about 1 s of it on the first sentence, and at RTF above 1 there are pauses between sentences. On slower phones the 6 s rule switches to the system voice. Loading takes 2 to 10 s, which is why the phone-language voice is warmed at start. No system-fallback utterances occurred in any run.
