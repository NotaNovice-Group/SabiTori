# SabiTori built-in understanding model: minilm-l12-int8

Reads every message on the phone and picks three labels from closed lists: message kind, action,
urgency. It never produces a date, amount, phone number or text; those come from code.

| | |
| --- | --- |
| Base model | `sentence-transformers/paraphrase-multilingual-MiniLM-L12-v2` (Reimers and Gurevych, Sentence-BERT; distilled multilingual MiniLM) |
| Licence | Apache-2.0 (base model and this derivative, heads included). onnxruntime-web is MIT, `@huggingface/tokenizers` is Apache-2.0 |
| Parameters | 117.7M in the base model, of which about 96M are the 250k-piece vocabulary table. Exported: 33.0M (vocabulary pruned to 30,000 pieces: 21.3M transformer, 11.5M embeddings), plus heads of 4 x 384 x classes (about 8k weights). "33M" everywhere in SabiTori means the exported model |
| Precision | int8 (dynamic MatMul quantisation; embedding table int8 with per-row scale), fp32 layer norms and biases |
| Files | `encoder.int8.onnx` (size below), `tokenizer.json` 1.3 MB (pruned Unigram), `heads.json` 0.07 MB. About 35.6 MB in total |
| Input | up to 128 tokens (longer text is cut); French, English and (poorly tested) Cameroonian Pidgin |
| Pooling | mean over tokens, then L2 normalisation, then three linear heads, softmax with a fitted temperature |
| Runtime | onnxruntime-web, wasm, one thread (no COOP/COEP needed): Android WebView and desktop browsers; also runs in Node for tests |

## Where the weights come from

- **Encoder.** We did not train the encoder. According to its authors (Reimers and Gurevych, "Sentence-BERT", 2019, and
  "Making Monolingual Sentence Embeddings Multilingual using Knowledge Distillation", 2020, and the Hugging Face model
  card), it was distilled from the English `paraphrase-MiniLM-L12-v2` model, trained on public English paraphrase
  datasets, into a multilingual student using public parallel sentences for 50+ languages. We have not audited
  those datasets. SabiTori only prunes its vocabulary and quantises its weights; no SabiTori data changes them.
- **Vocabulary.** The 30,000 kept pieces are a subset of the original tokenizer: every piece the train messages and
  the fr/en pack lexicons use, every single Latin character, then every piece needed to spell the 50,000 most frequent
  French and the 50,000 most frequent English words of a general word-frequency list (Hermit Dave FrequencyWords,
  OpenSubtitles 2018, CC-BY-SA-4.0, pinned commit and sha256 in `train/export.py`), interleaved by rank, in
  lower case and Capitalised; the few remaining places go to the best-scoring Unigram pieces. The word list only
  chooses pieces; it is not redistributed and none of its content is in a shipped file.
- **Heads.** Three logistic regressions trained by this project on the train split (224 messages) of
  `eval/messages.jsonl`, a synthetic dataset this project wrote and publishes under CC-BY-SA-4.0. `heads.json`
  holds only numbers, no dataset text; as the dataset's authors we release the heads under Apache-2.0 with the
  encoder, so ShareAlike does not carry over to the weights. (`oof.json`, a training artefact that is not shipped,
  quotes dataset text and stays CC-BY-SA-4.0.)

## Export

<!-- results:card-export -->
| | |
| --- | --- |
| Exported parameters | 33.0M (source model 117.7M; vocabulary pruned to 30,000 pieces, fill strategy `freq`) |
| `encoder.int8.onnx` | 34.2 MB |
| Fidelity (held-out text only) | mean cosine 0.982, min 0.861 between exported and original fp32 sentence embeddings, n=276 |

| Held-out set | n | mean cosine | min | below 0.95 | tokenised exactly as the original |
| --- | --- | --- | --- | --- | --- |
| messages.jsonl:test | 96 | 0.982 | 0.908 | 4 | 55 |
| unseen.jsonl | 100 | 0.976 | 0.861 | 9 | 53 |
| heldout-sentences.txt | 80 | 0.990 | 0.941 | 2 | 77 |
<!-- /results:card-export -->

Fidelity is measured only on text that chose nothing in the export: the test split, the unseen set and
`train/heldout-sentences.txt` (80 general French and English sentences). The cosine includes both the
pruning and the int8 quantisation.

### Vocabulary fill: frequency list vs Unigram score

The first published export filled the vocabulary budget with the best-scoring Unigram pieces. A review found
that it split common words ("samedi", "cousin", "pièce", "Tuesday") into fragments on unseen text and checked
fidelity on training text only. Both exports keep exactly the same train pieces, so the train embeddings, the
heads and the thresholds are identical, and only held-out tokenisation differs. Same size (34.2 MB, 30,000
pieces). Results of the two exports on the same rows are in [`eval/vocab-fill-comparison.md`](../../eval/vocab-fill-comparison.md)
(paired bootstrap and McNemar, from `eval/compare.mjs`). Summary: held-out fidelity is much higher with the
frequency fill (see that file); accuracy differences on the test split and the unseen set are small and not
statistically significant in either direction, and the test split is not hurt. The frequency fill was kept for
its fidelity; it is not claimed to improve accuracy.

## How it is used

For each field the encoder's label replaces the rules' label only if its calibrated probability is at
least that field's threshold; otherwise the rules' label stays. Thresholds are picked on the train split,
out-of-fold, never on the test split or the unseen set (grid below). The result's confidence is the
lowest confidence among the sources used (capped at 0.95), so a card that leans on an unsure rules match
still falls back to facts only. If the model cannot load or run, the rules answer. The combination code is
`combineWithRules` in `src/encoder-math.ts`.

## Evaluation

Two synthetic sets, both labelled by the rules in `eval/README.md`:

- **test split** of `eval/messages.jsonl`: held out from training, but written from the same generator
  templates as the train split (different wording per message; nearest-train-neighbour character 4-gram
  Jaccard median about 0.2, none above 0.5).
- **unseen set**, `eval/unseen.jsonl`: 100 messages written by a reviewer to avoid the generator's templates
  (new wording, senders, domains and Pidgin). Never used for training, thresholds or any model choice except
  the single documented fill-strategy decision above.

<!-- results:card-eval -->
| Set | System | kind | action | urgency | all three |
| --- | --- | --- | --- | --- | --- |
| test split (n=96) | rules@1 (keyword rules) | 86.5% [79.2–92.7] | 66.7% [57.3–76.0] | 87.5% [80.2–93.8] | 51.0% [40.6–61.5] |
| test split (n=96) | encoder alone | 88.5% [81.3–94.8] | 87.5% [80.2–93.8] | 84.4% [77.1–91.7] | 68.8% [59.4–77.1] |
| test split (n=96) | **encoder + rules (default)** | 93.8% [88.5–97.9] | 84.4% [77.1–91.7] | 88.5% [82.3–94.8] | 75.0% [65.6–83.3] |
| unseen set (n=100) | rules@1 (keyword rules) | 88.0% [81.0–94.0] | 49.0% [39.0–59.0] | 72.0% [63.0–81.0] | 30.0% [21.0–39.0] |
| unseen set (n=100) | encoder alone | 78.0% [70.0–86.0] | 58.0% [48.0–68.0] | 58.0% [48.0–67.0] | 34.0% [25.0–43.0] |
| unseen set (n=100) | **encoder + rules (default)** | 94.0% [89.0–98.0] | 59.0% [49.0–68.0] | 73.0% [64.0–81.0] | 46.0% [36.0–56.0] |

Paired differences against rules on the same messages (points, 95% bootstrap interval, messages only that system gets right vs only rules gets right, exact McNemar p; `*` = p < 0.05):

| Set | Comparison | kind | action | urgency | all three |
| --- | --- | --- | --- | --- | --- |
| test split | encoder + rules vs rules | +7.3 pts [2.1–13.5], 8 vs 1, p = 0.039 * | +17.7 pts [7.3–28.1], 23 vs 6, p = 0.002 * | +1.0 pts [-5.2–7.3], 5 vs 4, p = 1.000 | +24.0 pts [13.5–34.4], 28 vs 5, p < 0.001 * |
| test split | encoder alone vs rules | +2.1 pts [-5.2–9.4], 8 vs 6, p = 0.790 | +20.8 pts [9.4–32.3], 27 vs 7, p < 0.001 * | -3.1 pts [-12.5–5.2], 8 vs 11, p = 0.648 | +17.7 pts [5.2–30.2], 30 vs 13, p = 0.014 * |
| unseen set | encoder + rules vs rules | +6.0 pts [0.0–12.0], 8 vs 2, p = 0.109 | +10.0 pts [-3.0–23.0], 28 vs 18, p = 0.184 | +1.0 pts [-5.0–8.0], 6 vs 5, p = 1.000 | +16.0 pts [4.0–27.0], 26 vs 10, p = 0.011 * |
| unseen set | encoder alone vs rules | -10.0 pts [-20.0–0.0], 8 vs 18, p = 0.075 | +9.0 pts [-6.0–23.0], 32 vs 23, p = 0.281 | -14.0 pts [-26.0–-2.0], 12 vs 26, p = 0.034 * | +4.0 pts [-8.0–16.0], 22 vs 18, p = 0.636 |

By message language (all three labels right):

| Set | Lang | n | rules, all three | encoder + rules, all three | difference |
| --- | --- | --- | --- | --- | --- |
| test split | fr | 38 | 50.0% [34.2–65.8] | 71.0% [55.3–84.2] | +21.1 pts [5.3–36.8], 10 vs 2, p = 0.039 * |
| test split | en | 43 | 62.8% [48.8–76.7] | 81.4% [69.8–93.0] | +18.6 pts [2.3–34.9], 11 vs 3, p = 0.057 |
| test split | wes | 15 | 20.0% [0.0–40.0] | 66.7% [40.0–86.7] | +46.7 pts [20.0–73.3], 7 vs 0, p = 0.016 * |
| unseen set | fr | 40 | 25.0% [12.5–40.0] | 47.5% [32.5–62.5] | +22.5 pts [2.5–40.0], 13 vs 4, p = 0.049 * |
| unseen set | en | 38 | 36.8% [21.1–52.6] | 44.7% [28.9–60.5] | +7.9 pts [-10.5–26.3], 8 vs 5, p = 0.581 |
| unseen set | wes | 22 | 27.3% [9.1–45.5] | 45.5% [27.3–68.2] | +18.2 pts [0.0–40.9], 5 vs 1, p = 0.219 |

Scam level (`assessScam`, code, not changed by this model): test 94.8% [89.6–99.0], unseen 92.0% [86.0–97.0].
Training: 224 train messages; 5-fold CV accuracy of the encoder heads alone: kind 89.3%, action 74.6%, urgency 73.7%.
Statistics: 95% percentile bootstrap over rows, 10000 resamples, seed 20261102; exact two-sided McNemar on discordant pairs.
<!-- /results:card-eval -->

### Calibration and thresholds

Expected calibration error (ECE) of each head alone (10 equal-width bins of the predicted label's
probability):

<!-- results:card-calibration -->
| Set | Head | ECE | mean confidence | accuracy |
| --- | --- | --- | --- | --- |
| test split | kind | 0.057 | 0.94 | 0.89 |
| test split | action | 0.081 | 0.81 | 0.88 |
| test split | urgency | 0.088 | 0.77 | 0.84 |
| unseen set | kind | 0.096 | 0.87 | 0.78 |
| unseen set | action | 0.108 | 0.69 | 0.58 |
| unseen set | urgency | 0.190 | 0.77 | 0.58 |

Threshold grid (train split, out-of-fold, n=224): accuracy of each field when the encoder's label is used at or above t, through the app's own combination code. Chosen: the middle of the plateau within half a point of the best.

| Field | 0.30 | 0.35 | 0.40 | 0.45 | 0.50 | 0.55 | 0.60 | 0.65 | 0.70 | 0.75 | 0.80 | 0.85 | 0.90 | 0.95 | never | chosen |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| kind | 89.3 | 90.2 | 90.6 | 90.6 | 91.1 | 92.0 | 92.0 | 92.0 | 92.4 | 93.8 | 92.4 | 93.3 | 93.8 | 93.3 | 87.1 | 0.85 |
| action | 76.8 | 77.7 | 78.6 | 78.6 | 77.7 | 80.8 | 80.8 | 80.4 | 79.9 | 79.9 | 79.5 | 77.7 | 76.8 | 75.4 | 74.1 | 0.6 |
| urgency | 83.9 | 83.9 | 83.9 | 84.4 | 86.6 | 89.7 | 91.5 | 90.6 | 92.0 | 93.3 | 93.3 | 93.8 | 93.8 | 93.8 | 93.8 | 0.85 |

Thresholds shipped in `heads.json`: kind 0.85, action 0.4, urgency 0.6.
<!-- /results:card-calibration -->

## Limits

- Both sets are synthetic, small and written by people who know the labelling rules; the unseen set is
  the better guide to new wording, and it is much harder. Re-measure on real, consented, anonymised messages.
- On the unseen set the encoder alone scores lower than the rules on `kind` (see the paired table; the
  difference is not significant at 0.05, but it points the wrong way), and its urgency head is poorly
  calibrated there (ECE above). The default combination keeps the rules' label unless the encoder is confident.
- Urgency depends on dates relative to today, which a text embedding only approximates; the rules
  (which do the date arithmetic) stay in the loop.
- Pidgin rows were written without a native speaker; treat `wes` numbers as a smoke test.
- A scam message gets the kind of what it imitates; scam detection is separate code (`assessScam`) and is not
  changed by this model.
- Latency: measured only in headless Chromium with a 4× CPU throttle on the main thread (see `docs/model.md`);
  not yet measured on a phone.
