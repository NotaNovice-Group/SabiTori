# Browser harnesses

Two harnesses run SabiTori's understanding models in headless Chromium. Neither is a phone: their
numbers are relative stress tests on a desktop CPU. Phone latency is not yet measured on a phone.

## Default model: MiniLM encoder latency (`encoder-bench.mjs`)

Times `createEncoderClassifier(...).classify()` (encoder + rules, exactly the app's code path) on the
96 messages of the test split, on the page's **main thread** (where the app runs it), with Chromium's CPU
throttling. Chromium's throttle does not slow Web Workers, so main thread is also what makes the
throttle meaningful.

    pnpm install
    node packages/understand/harness/encoder-bench.mjs --throttle 4 [--chromium /path/to/chrome]

`--chromium` is needed when Playwright's bundled browser is not installed (for example
`/opt/pw-browsers/chromium-1243/chrome-linux64/chrome`). The script starts its own Vite server on a
free port, loads the model from `packages/understand/model/minilm/` and onnxruntime-web's wasm from
`node_modules`, and prints one JSON line: conditions, CPU model, model load time, median, p95 and max
milliseconds per message.

Report the result with its conditions: "headless Chromium, 4× CPU throttle, main thread, one wasm
thread, <CPU model>". Latency is deliberately not part of `eval/results.json`, because it depends on the
machine. The numbers quoted in `docs/model.md` come from this script.

## Optional LLM: Qwen2.5 GGUF (`run.mjs`, `prof.mjs`)

Runs the optional, side-loaded LLM classifier against a real GGUF. This model is never the default and
is not needed for SabiTori to work; the default path is the 33M-parameter encoder above.

    ln -s /path/to/qwen2.5-1.5b-instruct-q4_k_m.gguf public/model.gguf
    node prof.mjs   # timing: cold vs warm calls
    node run.mjs    # classify 8 example messages

Measured 2026-10-31, 4-core x86 desktop, wasm multi-thread (COOP/COEP), Qwen2.5-1.5B Q4_K_M:
model load 4.6 s, first call 140 s (prompt ~540 tokens), later calls 20–24 s. That is far too slow for
every message, which is one reason the LLM is only an optional second opinion.
