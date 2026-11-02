# SabiTori built-in understanding model: minilm-l12-int8@1

Reads every message on the phone and picks three labels from closed lists: message kind, action,
urgency. It never produces a date, amount, phone number or text; those come from code.

| | |
| --- | --- |
| Base model | `sentence-transformers/paraphrase-multilingual-MiniLM-L12-v2` (Reimers and Gurevych, Sentence-BERT; distilled multilingual MiniLM) |
| Licence | Apache-2.0 (base model and this derivative). Heads: trained here on `eval/messages.jsonl` (CC-BY-SA-4.0, synthetic). onnxruntime-web is MIT, `@huggingface/tokenizers` is Apache-2.0 |
| Parameters | 117.7M in the base model (96M of them the 250k-piece vocabulary table). Exported: 33.0M (vocabulary pruned to 30,000 pieces; 21.3M transformer, 11.5M embeddings) plus heads 4 x 384 x classes (about 8k weights) |
| Precision | int8 (dynamic MatMul quantisation; embedding table int8 with per-row scale), fp32 layer norms and biases |
| Files | `encoder.int8.onnx` 34.2 MB, `tokenizer.json` 1.3 MB (pruned Unigram), `heads.json` 0.07 MB. Total about 35.6 MB |
| Input | up to 128 tokens (longer text is cut), French, English and (poorly tested) Pidgin |
| Pooling | mean over tokens, then L2 normalisation, then three linear heads, softmax with a fitted temperature |
| Runtime | onnxruntime-web, wasm, one thread (no COOP/COEP needed): Android WebView and desktop browsers; also runs in Node for tests |
| Quantised vs original | mean cosine of sentence embeddings 0.986, min 0.959 (203 messages) |

## How it is used

For each field the encoder's label replaces the rules' label only if its calibrated probability is at
least that field's threshold; otherwise the rules' label stays. Thresholds (picked on the train split,
out-of-fold, never on test): kind 0.85, action 0.55, urgency 0.65. The result's confidence is the lowest
confidence among the sources used (capped at 0.95), so a card that leans on an unsure rules match still
falls back to facts only. If the model cannot load or run, the rules answer.

## Evaluation (97 test messages, synthetic; see `eval/results-encoder.md`)

| System | kind | action | urgency | all three |
| --- | --- | --- | --- | --- |
| rules@1 | 86.6% | 63.9% | 75.3% | 44.3% |
| encoder alone | 87.6% | 83.5% | 79.4% | 62.9% |
| **encoder + rules (default)** | **92.8%** | **85.6%** | **84.5%** | **70.1%** |

Training: 223 train messages; 5-fold CV accuracy of the encoder heads alone on train: kind 88.3%, action 75.8%, urgency 75.3%.

## Limits

- The dataset is synthetic and small (223 train messages). Train and test messages share templates, so
  these numbers are probably optimistic for real mail. Re-measure on real, consented, anonymised messages.
- Urgency depends on dates relative to today, which a text embedding only approximates; the rules
  (which do the date arithmetic) stay in the loop.
- Pidgin rows were written without a native speaker; treat `wes` numbers as a smoke test.
- A scam message gets the kind of what it imitates; scam detection is separate code (`assessScam`) and is not
  changed by this model.
- Latency (headless Chromium, single thread, 4x CPU throttle): see `docs/model.md`.
