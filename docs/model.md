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
  `models/minilm/{encoder.int8.onnx,tokenizer.json,heads.json}` and `ort/ort-wasm-simd-threaded.{wasm,mjs}` (onnxruntime-web, 14.8 MB wasm). A vite plugin maps `onnxruntime-web/wasm` to its "extern wasm" build so the wasm is not bundled twice. The app passes an absolute `wasmBaseUrl` (the runtime imports its loader from there).
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
