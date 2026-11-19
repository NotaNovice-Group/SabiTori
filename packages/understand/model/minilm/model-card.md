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
| test split (n=96) | rules@1 (keyword rules) | 86.5% [79.2–92.7] | 76.0% [67.7–84.4] | 88.5% [81.3–94.8] | 60.4% [51.0–69.8] |
| test split (n=96) | encoder alone | 89.6% [83.3–94.8] | 86.5% [79.2–92.7] | 80.2% [71.9–87.5] | 65.6% [56.3–75.0] |
| test split (n=96) | **encoder + rules (default)** | 93.8% [88.5–97.9] | 84.4% [77.1–91.7] | 88.5% [82.3–94.8] | 75.0% [66.7–83.3] |
| unseen set (n=100) | rules@1 (keyword rules) | 90.0% [84.0–95.0] | 56.0% [46.0–66.0] | 73.0% [64.0–81.0] | 36.0% [27.0–45.0] |
| unseen set (n=100) | encoder alone | 87.0% [80.0–93.0] | 72.0% [63.0–81.0] | 66.0% [57.0–75.0] | 42.0% [33.0–52.0] |
| unseen set (n=100) | **encoder + rules (default)** | 95.0% [90.0–99.0] | 74.0% [65.0–82.0] | 71.0% [62.0–80.0] | 51.0% [41.0–61.0] |
| second unseen set (n=100) | rules@1 (keyword rules) | 84.0% [76.0–91.0] | 63.0% [53.0–72.0] | 86.0% [79.0–92.0] | 44.0% [34.0–54.0] |
| second unseen set (n=100) | encoder alone | 91.0% [85.0–96.0] | 68.0% [59.0–77.0] | 71.0% [62.0–80.0] | 48.0% [38.0–58.0] |
| second unseen set (n=100) | **encoder + rules (default)** | 91.0% [85.0–96.0] | 68.0% [59.0–77.0] | 81.0% [73.0–88.0] | 51.0% [41.0–61.0] |

Paired differences against rules on the same messages (points, 95% bootstrap interval, messages only that system gets right vs only rules gets right, exact McNemar p; `*` = p < 0.05):

| Set | Comparison | kind | action | urgency | all three |
| --- | --- | --- | --- | --- | --- |
| test split | encoder + rules vs rules | +7.3 pts [2.1–13.5], 8 vs 1, p = 0.039 * | +8.3 pts [0.0–16.7], 12 vs 4, p = 0.077 | +0.0 pts [-5.2–5.2], 3 vs 3, p = 1.000 | +14.6 pts [6.3–22.9], 17 vs 3, p = 0.003 * |
| test split | encoder alone vs rules | +3.1 pts [-4.2–11.5], 9 vs 6, p = 0.607 | +10.4 pts [0.0–20.8], 18 vs 8, p = 0.075 | -8.3 pts [-18.8–2.1], 9 vs 17, p = 0.169 | +5.2 pts [-8.3–18.8], 24 vs 19, p = 0.542 |
| unseen set | encoder + rules vs rules | +5.0 pts [-1.0–12.0], 8 vs 3, p = 0.227 | +18.0 pts [9.0–27.0], 21 vs 3, p < 0.001 * | -2.0 pts [-8.0–4.0], 4 vs 6, p = 0.754 | +15.0 pts [6.0–24.0], 19 vs 4, p = 0.003 * |
| unseen set | encoder alone vs rules | -3.0 pts [-12.0–6.0], 9 vs 12, p = 0.664 | +16.0 pts [3.0–29.0], 32 vs 16, p = 0.029 * | -7.0 pts [-19.0–5.0], 15 vs 22, p = 0.324 | +6.0 pts [-7.0–19.0], 26 vs 20, p = 0.461 |
| second unseen set | encoder + rules vs rules | +7.0 pts [2.0–13.0], 8 vs 1, p = 0.039 * | +5.0 pts [-3.0–13.0], 11 vs 6, p = 0.332 | -5.0 pts [-10.0–0.0], 1 vs 6, p = 0.125 | +7.0 pts [-2.0–16.0], 15 vs 8, p = 0.210 |
| second unseen set | encoder alone vs rules | +7.0 pts [0.0–15.0], 11 vs 4, p = 0.118 | +5.0 pts [-7.0–17.0], 22 vs 17, p = 0.522 | -15.0 pts [-26.0–-4.0], 9 vs 24, p = 0.013 * | +4.0 pts [-9.0–17.0], 26 vs 22, p = 0.665 |

By message language (all three labels right):

| Set | Lang | n | rules, all three | encoder + rules, all three | difference |
| --- | --- | --- | --- | --- | --- |
| test split | fr | 38 | 60.5% [44.7–76.3] | 79.0% [65.8–92.1] | +18.4 pts [7.9–31.6], 7 vs 0, p = 0.016 * |
| test split | en | 43 | 74.4% [60.5–86.1] | 76.7% [62.8–88.4] | +2.3 pts [-9.3–14.0], 4 vs 3, p = 1.000 |
| test split | wes | 15 | 20.0% [0.0–40.0] | 60.0% [33.3–86.7] | +40.0 pts [13.3–66.7], 6 vs 0, p = 0.031 * |
| unseen set | fr | 40 | 32.5% [17.5–47.5] | 57.5% [42.5–72.5] | +25.0 pts [7.5–42.5], 12 vs 2, p = 0.013 * |
| unseen set | en | 38 | 39.5% [23.7–55.3] | 50.0% [34.2–65.8] | +10.5 pts [0.0–23.7], 5 vs 1, p = 0.219 |
| unseen set | wes | 22 | 36.4% [18.2–54.5] | 40.9% [22.7–63.6] | +4.5 pts [-9.1–22.7], 2 vs 1, p = 1.000 |
| second unseen set | fr | 40 | 45.0% [30.0–60.0] | 47.5% [32.5–62.5] | +2.5 pts [-10.0–15.0], 4 vs 3, p = 1.000 |
| second unseen set | en | 38 | 52.6% [36.8–68.4] | 63.2% [47.4–79.0] | +10.5 pts [-5.3–26.3], 7 vs 3, p = 0.344 |
| second unseen set | wes | 22 | 27.3% [9.1–45.5] | 36.4% [18.2–59.1] | +9.1 pts [-13.6–31.8], 4 vs 2, p = 0.688 |

Scam level (`assessScam`, code, not changed by this model): test 100.0% [100.0–100.0], unseen 93.0% [88.0–98.0], second unseen 91.0% [85.0–96.0].
Training: 453 train messages; 5-fold CV accuracy of the encoder heads alone: kind 84.5%, action 81.7%, urgency 76.8%.
Statistics: 95% percentile bootstrap over rows, 10000 resamples, seed 20261102; exact two-sided McNemar on discordant pairs.
<!-- /results:card-eval -->

### Calibration and thresholds

Expected calibration error (ECE) of each head alone (10 equal-width bins of the predicted label's
probability):

<!-- results:card-calibration -->
| Set | Head | ECE | mean confidence | accuracy |
| --- | --- | --- | --- | --- |
| test split | kind | 0.017 | 0.90 | 0.90 |
| test split | action | 0.070 | 0.88 | 0.86 |
| test split | urgency | 0.100 | 0.78 | 0.80 |
| unseen set | kind | 0.054 | 0.89 | 0.87 |
| unseen set | action | 0.059 | 0.75 | 0.72 |
| unseen set | urgency | 0.126 | 0.75 | 0.66 |
| second unseen set | kind | 0.063 | 0.87 | 0.91 |
| second unseen set | action | 0.168 | 0.77 | 0.68 |
| second unseen set | urgency | 0.106 | 0.78 | 0.71 |

Threshold grid (train split, out-of-fold, n=453): accuracy of each field when the encoder's label is used at or above t, through the app's own combination code. Chosen: the middle of the plateau within half a point of the best.

| Field | 0.30 | 0.35 | 0.40 | 0.45 | 0.50 | 0.55 | 0.60 | 0.65 | 0.70 | 0.75 | 0.80 | 0.85 | 0.90 | 0.95 | never | chosen |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| kind | 84.3 | 84.8 | 85.2 | 86.8 | 87.0 | 89.2 | 89.8 | 90.7 | 91.0 | 91.4 | 91.8 | 91.2 | 90.7 | 89.6 | 84.1 | 0.75 |
| action | 78.6 | 79.0 | 80.1 | 80.6 | 81.0 | 81.2 | 81.7 | 82.6 | 83.4 | 82.8 | 81.2 | 80.6 | 79.0 | 77.5 | 70.6 | 0.7 |
| urgency | 83.2 | 83.2 | 83.2 | 83.9 | 84.5 | 86.8 | 86.8 | 86.8 | 86.5 | 86.8 | 86.5 | 86.3 | 87.2 | 86.8 | 86.8 | 0.75 |

Thresholds shipped in `heads.json`: kind 0.75, action 0.7, urgency 0.75.
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
