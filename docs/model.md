# On-device models (@sabitori/understand)

SabiTori has two on-device understanding models. Both only **choose labels** from the closed lists in `@sabitori/core` (`kind`, `action`, `urgency`); dates, amounts, phone numbers and text always come from code.

| | Built-in small model (default, every message) | Optional "deeper" LLM |
| --- | --- | --- |
| Model | paraphrase-multilingual-MiniLM-L12-v2 encoder (Apache-2.0), fine-tuned on the train messages, int8 ONNX, plus 3 linear heads | Qwen2.5-1.5B-Instruct Q4_K_M GGUF |
| Size | about 35.6 MB, shipped inside the app | about 1 GB, side-loaded |
| Parameters | 33.0M as shipped (the base model has 117.7M, 96M of them in its 250k-piece vocabulary; pruned to 30k pieces) | 1.5B |
| Speed | 235 ms median, 367 ms p95 per message in headless Chromium, 4× CPU throttle, main thread, one wasm thread (Intel Xeon 2.1 GHz desktop CPU; `packages/understand/harness/encoder-bench.mjs`). Not yet measured on a phone | 20–24 s per message on a desktop (wasm); not for every message |
| Runtime | onnxruntime-web (wasm, one thread, no COOP/COEP) | wllama |
| Classifier id | `minilm-l12-int8@2` | `qwen2.5-1.5b-q4@1` |

## Built-in model: how it plugs in

```
text -> tokenizer.json (Unigram, pure JS) -> encoder.int8.onnx (mean pooled, 384 numbers)
     -> L2 normalise -> heads.json (3 softmax-regression heads, temperature-calibrated)
     -> per field: encoder label if its probability >= that field's threshold, else the rules' label
```

- Code: `src/encoder.ts` (`createEncoderClassifier({ baseUrl, fallback, wasmBaseUrl, threshold?, readFile?, ort? })`), `src/encoder-math.ts` (pure head and combination maths).
- Files: `packages/understand/model/minilm/` (`encoder.int8.onnx`, `tokenizer.json`, `heads.json`, `model-card.md`); training and export in `packages/understand/train/` (see its README for the exact commands).
- Combination: thresholds per field are stored in `heads.json` and were picked on the train split only, out-of-fold (values and the full grid: `model/minilm/model-card.md`). Confidence is the lowest confidence among the sources used, capped at 0.95. Below that the rules answer. Any error (files missing, runtime fails) also gives the rules' answer. The encoder cannot create a fact.
- App: `apps/app/src/engine/encoder.ts` loads it once, lazily, when the app calls `engine.model.init()` after first paint (about 1.2 s after start); until it is ready `Engine.analyze` uses rules. `Engine.analyzeDeeper` and the optional LLM are unchanged. Settings shows "Understanding model: built in (MiniLM, 33M)" and its status.
- Assets (copied by `apps/app/vite.config.ts` into `public/`, all precached by the PWA service worker):
  `models/minilm/{encoder.int8.onnx,tokenizer.json,heads.json}` and `ort/ort-wasm-simd-threaded.{wasm,mjs}` (onnxruntime-web 1.22.0, 11.2 MB wasm, shared with the Piper voices). A vite plugin maps `onnxruntime-web/wasm` to its "extern wasm" build so the wasm is not bundled twice. The app passes an absolute `wasmBaseUrl` (the runtime imports its loader from there).
  Added to the APK: about 50 MB uncompressed (35.6 MB model + 14.9 MB runtime).
- Node (tests, eval): the same code runs with onnxruntime-web's Node entry; pass `readFile` to read the files from disk.

Evaluate: `node packages/understand/eval/run-encoder.mjs` (test split and unseen set; writes `eval/results.json` and `eval/results-encoder.md`), then `node packages/understand/eval/model-card.mjs` (regenerates the tables below, in the README and in the model card from `results.json`).

<!-- results:model-summary -->
| | test split | unseen set | second unseen set |
| --- | --- | --- | --- |
| messages | 96 | 100 | 100 |
| rules alone, all three labels | 63.5% [54.2–72.9] | 47.0% [37.0–57.0] | 49.0% [39.0–59.0] |
| encoder + rules (default), all three labels | 88.5% [82.3–94.8] | 77.0% [68.0–85.0] | 82.0% [74.0–89.0] |
| paired difference | +25.0 pts [15.6–34.4], 26 vs 2, p < 0.001 | +30.0 pts [19.0–41.0], 35 vs 5, p < 0.001 | +33.0 pts [23.0–43.0], 34 vs 1, p < 0.001 |

Generated from `packages/understand/eval/results.json`; full tables, per-language rows and calibration in `packages/understand/model/minilm/model-card.md`.
<!-- /results:model-summary -->

Known limits: the encoder runs on the main thread; `env.wasm.proxy` could move it to a worker later. Its cost on a real low-cost phone is not yet measured on a phone; the only figures are the headless Chromium, 4× CPU throttle, main thread ones above. Training data is synthetic and small; see `model/minilm/model-card.md`.

---

# Optional deeper model: Qwen2.5 LLM

## What it is

- Default: **Qwen2.5-1.5B-Instruct, GGUF Q4_K_M** (about 1 GB). Optional: Qwen2.5-3B-Instruct Q4_K_M (about 2 GB; pass `id: 'qwen2.5-3b-q4@1'`).
- Licence: Qwen2.5-1.5B-Instruct is **Apache-2.0**. Qwen2.5-3B is published under the Qwen Research licence (not Apache-2.0; its terms restrict redistribution, so check them before shipping it). Always verify the model card of the exact file you distribute. wllama is MIT.
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

The optional LLM is **not in store builds**. Build with `VITE_LLM=1` (see `apps/app/.env.example`) to include it:
the Vite config then copies wllama's single wasm (`@wllama/wllama/esm/wasm/wllama.wasm`, about 8.7 MB) to
`public/wllama/`, and Settings shows "Add model file". Without the flag the file is not copied, the Settings section
is hidden and the controller reports `unsupported`, so the built-in encoder and the rules do all the understanding.
The classifier gets `wasmBaseUrl: <app base> + 'wllama/'`; `wllamaAssetPaths(baseUrl)` returns the config wllama
expects. Do not use `@wllama/wllama/esm/wasm-from-cdn.js`: it needs the internet.

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

## App start and card time

`node apps/app/bench/perf.mjs <cpuThrottle> <runs>` (after `pnpm --filter @sabitori/app build`) serves the built app
and measures, in a fresh headless Chromium profile per run: start (navigation to the first screen drawn), card
(tap "Explain" on a pasted bill to the card on screen), model (until the built-in model and its runtime have
downloaded), the JavaScript heap once the card is shown, and the JavaScript loaded for the first screen. Chromium's
CPU throttling slows the page's main thread only, not Web Workers (OCR and Piper run in workers), and the test
machine is not a phone: the 4x rows are a stress test, not phone measurements. Medians of 5 runs, 2026-11-17.

| Build | Throttle | Start | Pasted bill to card | Model downloaded | Heap after card | JS for first screen |
| --- | --- | --- | --- | --- | --- | --- |
| Before | 1x | 308 ms | 858 ms | 2.9 s | 8.4 MB | 652 KB |
| Before | 4x | 719 ms | 3,371 ms | 5.1 s | 17.3 MB | 672 KB |
| After the term prefilter | 1x | 311 ms | 329 ms | 2.9 s | 6.3 MB | 652 KB |
| After the term prefilter | 4x | 729 ms | 1,300 ms | 3.9 s | 6.8 MB | 673 KB |

What was slow: the first message compiled and warmed up hundreds of word-list regular expressions, each with
Unicode-aware word boundaries (`\p{L}\p{N}`), most of them for words the message does not contain. Term matching
(`packages/core/src/text.ts`) now checks that a term's literal text is in the message before compiling or running
its regex. Results are identical: `packages/core/test/term-prefilter.test.ts` compares every lexicon list on every
evaluation message, and the published evaluation files regenerate unchanged. In Node, matching for the first
message went from about 660 ms to about 80 ms.

**Re-measured 2026-11-18 on a different, slower test container** (same commands, medians of 5, 4x throttle). The
gain is real but much smaller there, so read the table above as one machine, not as a general speed-up:

| Commit | Card, tapped at once | Card, tapped after the built-in model has loaded |
| --- | --- | --- |
| Before the term prefilter | 2,409 ms | 2,077 ms |
| After the term prefilter (2026-11-17) | 2,251 ms | not measured |
| main on 2026-11-18 (all of today's reading words added) | 2,306 ms | 1,556 ms |
| main on 2026-11-20 (fine-tuned encoder, redesign, picture card) | 2,454 ms and 2,098 ms (two runs of 5; single runs 1,882 to 2,538 ms) | 1,773 ms |

On this machine the built-in model loading at the same time dominates a tap made right after start, and with the
model loaded the prefilter saves about a quarter. No regression from the words added since. On 2026-11-20 (a
different container again) a card took about 2.1 to 2.5 s when tapped at once and 1.8 s once the model had loaded:
the published range is now 1.3 to 2.5 s. None of this is a phone measurement.

## Voices

SabiTori speaks with small open neural voices that run on the phone, replacing the phone maker's closed TTS as the default. Order, each falling back to the next: **Kokoro-82M** (English and French, see "Kokoro" below), **Piper** (per pack), then the phone's own TTS. On iOS a smooth installed phone voice (Enhanced, Premium, Siri) is preferred over Piper, below Kokoro.

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
| fr | `fr_FR-siwis-medium` (22.05 kHz) | CC BY 4.0 | 63.2 MB |
| en | `en_GB-alba-medium` (22.05 kHz) | CC BY 4.0 | 63.2 MB |
| en, fr (and packs using the en voice files) | Kokoro-82M `model_quantized.onnx` + `af_heart` (en) / `ff_siwis` (fr) style files (24 kHz) | Apache-2.0 (ff_siwis trained on CC BY 4.0 data) | 92.4 MB + 0.5 MB per voice, one model for both languages (`voices/kokoro/`) |

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

Chromium's 4× CPU throttling does not slow Web Workers, so the two "Main thread, 4× CPU throttling" rows run the same runtime on the page's main thread, while the real app synthesizes in a worker. They are main-thread measurements, not measurements of the app's worker path, and none of these rows is a phone measurement: voice latency is not yet measured on a phone.

| Condition | Language | Model load | TTFA (3 sentences) | RTF |
| --- | --- | --- | --- | --- |
| Worker, no throttling | fr | 2.7 s | 665 / 498 / 607 ms | 0.27 / 0.18 / 0.17 |
| Worker, no throttling | en | 2.5 s | 1344 / 753 / 1458 ms | 0.43 / 0.30 / 0.41 |
| Main thread, 4× CPU throttling | fr | 9.9 s | 2736 / 2435 / 2481 ms | 1.06 / 0.84 / 0.78 |
| Main thread, 4× CPU throttling | en | 8.3 s | 5292 / 4018 / 5118 ms | 1.53 / 1.56 / 1.29 |

Sentences: "Vous avez reçu 5 000 francs de votre opérateur.", "Ne partagez jamais votre code secret avec personne.", "Le rendez-vous est prévu demain à dix heures au centre de santé."; "You have received 5,000 francs from your operator.", "Never share your secret code with anyone.", "Your appointment is tomorrow at ten o'clock at the health centre."

Reading: French (low) stays under the 6 s limit with margin at 4x; English (medium) is within about 1 s of it on the first sentence, and at RTF above 1 there are pauses between sentences. On slower phones the 6 s rule switches to the system voice. Loading takes 2 to 10 s, which is why the phone-language voice is warmed at start. No system-fallback utterances occurred in any run.

### Kokoro (primary voice for English and French)

Kokoro-82M v1.0 (Apache-2.0) sounds much smoother than the Piper voices. It runs in its own module Web Worker
(`packages/speech/src/kokoro/`) with the same onnxruntime-web 1.22 and the same espeak-ng phonemizer files as Piper,
without transformers.js or kokoro-js:

- Text: split into sentences (a long first sentence is cut at a comma so the first audio comes sooner); espeak-ng
  IPA (`en-us` for `af_heart`, `fr` for `ff_siwis`); the kokoro-js 1.2.1 spelling rules for English (checked: the
  same phoneme strings as kokoro-js for the two English benchmark sentences) and misaki's espeak rules for French;
  ids from the model's 115-symbol vocabulary, padded with 0, at most 510 per call (longer text is cut at clause marks).
- Model inputs: `input_ids` int64 [1, n], `style` = row n-2 of the voice file (float32 [510, 256]), `speed` = rate.
  Output `waveform`, 24 kHz. One loaded model serves both voices.
- Which packs: a part whose pack speaks with the `en` or `fr` Piper voice files gets the Kokoro voice of that
  language (so Pidgin, which uses the `en` files, gets `af_heart`, an American accent). Other packs are unchanged.
- Files: `scripts/fetch-kokoro.mjs` (pinned revision, sha256), staged by the app build into `public/kokoro/`
  (`SABITORI_BUNDLE_KOKORO=0` leaves them out). Web: the 0.5 MB voice files are precached; the model, like the Piper
  models, is cached on first load (it is over the precache size limit). Android: in the APK.

Speed guard (`packages/speech/src/kokoro/speed-guard.ts`), so nobody waits in silence:

1. While the person looks at the card, the app loads Kokoro for the phone's language and synthesizes one short test
   sentence (about 2.5 s of speech) that is never played.
2. It must be ready within 2.5 s and run faster than real time (real-time factor below 1.0). Without the test (a tap
   before it ran), the first real piece is judged the same way, with a deadline of 2.5 s, or 0.6 s per expected
   second of speech for a long piece, at most 5 s; past the deadline the fallback speaks it.
3. Too slow: Kokoro is off for the session for both languages, its worker is stopped, Piper is loaded and speaks.
   The verdict is kept in local storage for 30 days (same model version and thread count), so later starts do not
   load the 92 MB model at all. A model that fails to load or returns invalid audio (NaN) also falls back.

#### Kokoro measurements

Headless Chromium 153 (Chrome for Testing), on a 4-core Intel Xeon 2.10 GHz cloud VM (not a phone), the app's code
path (`createKokoroWorkerEngines`, `packages/speech/bench/kokoro-run.mjs`), onnxruntime-web WebAssembly. One run
each on a shared machine: expect noise of about 10 to 20 %. RTF is synthesis time divided by audio length (below 1
is faster than real time).

App setting: 1 thread (the app is not cross-origin isolated), `model_quantized.onnx`:

| Language | Model load | Sentence 1 (about 8 s of speech) | Sentence 2 |
| --- | --- | --- | --- |
| en (`af_heart`) | 1.4 s | 7.92 s of audio in 20.7 s: RTF 2.62 | 5.75 s in 15.8 s: RTF 2.75 |
| fr (`ff_siwis`) | 1.5 s | 7.25 s of audio in 19.6 s: RTF 2.71 | 6.85 s in 19.1 s: RTF 2.79 |

Sentences: "Your electricity bill of twelve thousand five hundred francs must be paid before the end of the month, at
any ENEO agency.", "Never share your secret code with anyone, not even with someone who says they work for your
bank."; "Votre facture d'électricité de douze mille cinq cents francs doit être payée avant la fin du mois, dans une
agence ENEO.", "Ne partagez jamais votre code secret avec personne, même pas avec quelqu'un qui dit travailler pour
votre banque."

With these speeds the speed guard did its job in the same runs: load plus speed test took 4.1 s (en and fr), Kokoro
was switched off before anything was spoken, and both utterances went to the fallback without waiting.

Model files compared on English sentence 1 (two runs each where shown; same machine):

| File | Size | RTF, 1 thread | RTF, 4 threads (cross-origin isolated page) | Note |
| --- | --- | --- | --- | --- |
| `model_q8f16.onnx` | 86.0 MB | 3.05 / 2.60 | 1.90 / 1.79 | NaN audio for French sentence 2 with 1 thread: not used |
| `model_quantized.onnx` | 92.4 MB | 2.95 / 3.02 | 1.85 / 1.68 | used |
| `model_uint8.onnx` | 177.5 MB | 2.51 / 2.29 | 0.94 / 0.85 | twice the size |
| `model.onnx` (fp32) | 325.5 MB | 2.68 / 2.72 | 1.14 / 1.04 | |

4 threads with `model_quantized.onnx`, both languages: en 1.70 / 1.72, fr 1.87 / 1.74.

For comparison, native onnxruntime 1.29 (CPU execution provider, Python) on the same machine and the same phonemes
(English sentence 1 / French sentence 1, two or three runs each):

| File | RTF, 1 thread | RTF, 4 threads |
| --- | --- | --- |
| `model_quantized.onnx` | en 1.74 / 1.74 / 1.72, fr 1.59 / 1.54 / 1.76 | en 1.40 / 1.42 / 1.25, fr 1.30 / 1.27 / 1.31 |
| `model_q8f16.onnx` | en 1.62 / 1.94, fr 1.73 / 1.68 | en 1.17 / 1.31, fr 1.23 / 1.34 |
| `model.onnx` (fp32) | en 0.71 / 0.67, fr 0.65 / 0.77 | en 0.30 / 0.33, fr 0.27 / 0.28 |
| `model_uint8.onnx` | en 0.65 / 0.68, fr 0.58 / 0.53 | en 0.21 / 0.23, fr 0.22 / 0.22 |

What this means: in WebAssembly with one thread Kokoro is about 2.6 to 2.8 times slower than real time on this
server CPU, and phones are slower than this CPU. As shipped, the speed guard will switch Kokoro off on this machine
and should be expected to do so on phones; Piper then speaks. Kokoro has not been run on a phone. Ways to make it
fast enough, not done: native onnxruntime on Android/iOS through a Capacitor plugin, with `model_uint8.onnx`
(177.5 MB; about 4 times faster natively than in single-thread WebAssembly on this machine, see the tables); a
cross-origin isolated WebView so onnxruntime-web can use several threads (needs COOP/COEP headers from the app's
local server; `kokoroThreads()` already uses up to 4 threads when the page is isolated; with 4 threads only
`model_uint8.onnx` got below RTF 1 here); or rendering the fixed sentences of the packs with Kokoro at build time.

Intelligibility check: the four sentences above, synthesized in Chromium with `model_quantized.onnx`, transcribed by
Whisper-small (ONNX, greedy) back to the input text apart from the acronym ENEO. Not a listening test: nobody has
yet judged by ear whether Kokoro or the iPhone's Enhanced/Premium voices sound better.
