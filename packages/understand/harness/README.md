# Real-model harness

Runs the classifier against a real GGUF in headless Chromium.

    ln -s /path/to/qwen2.5-1.5b-instruct-q4_k_m.gguf public/model.gguf
    node prof.mjs   # timing: cold vs warm calls
    node run.mjs    # classify 8 example messages

Measured 2026-10-31, 4-core x86 desktop, wasm multi-thread (COOP/COEP), Qwen2.5-1.5B Q4_K_M:
model load 4.6 s, first call 140 s (prompt ~540 tokens), later calls 20–24 s.
=> wasm inference is a background second opinion, not the default path. Native llama.cpp on
Android is the production path for speed.
