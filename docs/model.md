# On-device model (@sabitori/understand)

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
