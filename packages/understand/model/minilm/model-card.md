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

- **Encoder.** The base encoder comes from its authors; SabiTori fine-tunes it (since `minilm-l12-int8@4`, see below).
  According to its authors (Reimers and Gurevych, "Sentence-BERT", 2019, and
  "Making Monolingual Sentence Embeddings Multilingual using Knowledge Distillation", 2020, and the Hugging Face model
  card), it was distilled from the English `paraphrase-MiniLM-L12-v2` model, trained on public English paraphrase
  datasets, into a multilingual student using public parallel sentences for 50+ languages. We have not audited
  those datasets. SabiTori then fine-tunes the transformer layers on its own train messages (the word-embedding
  table stays frozen), prunes the vocabulary and quantises the weights.
- **Vocabulary.** The 30,000 kept pieces are a subset of the original tokenizer: every piece the train messages and
  the fr/en pack lexicons use, every single Latin character, then every piece needed to spell the 50,000 most frequent
  French and the 50,000 most frequent English words of a general word-frequency list (Hermit Dave FrequencyWords,
  OpenSubtitles 2018, CC-BY-SA-4.0, pinned commit and sha256 in `train/export.py`), interleaved by rank, in
  lower case and Capitalised; the few remaining places go to the best-scoring Unigram pieces. The word list only
  chooses pieces; it is not redistributed and none of its content is in a shipped file.
- **Fine-tuning and heads.** The encoder and three linear heads are trained together (`train/finetune.py`: 8 epochs,
  lr 5e-5, label smoothing 0.05) on 2,115 synthetic train messages this project wrote and publishes under
  CC-BY-SA-4.0: the train split of `eval/messages.jsonl`, `eval/train-extra.jsonl` and `eval/train-gen/g1..g6.jsonl`.
  The test split and the unseen sets were not used for training, for any setting or for the thresholds; settings and
  thresholds come from 5-fold out-of-fold predictions on the train messages (`train/README.md`). The weights hold only
  numbers, no dataset text; as the dataset's authors we release the fine-tuned encoder and the heads under Apache-2.0,
  so ShareAlike does not carry over to the weights. (`oof.json`, a training artefact that is not shipped,
  quotes dataset text and stays CC-BY-SA-4.0.)

## Export

<!-- results:card-export -->
| | |
| --- | --- |
| Exported parameters | 33.0M (source model 117.7M; vocabulary pruned to 30,000 pieces, fill strategy `freq`) |
| `encoder.int8.onnx` | 34.2 MB |
| Fidelity (held-out text only) | mean cosine 0.989, min 0.945 between exported and original fp32 sentence embeddings, n=80 |

| Held-out set | n | mean cosine | min | below 0.95 | tokenised exactly as the original |
| --- | --- | --- | --- | --- | --- |
| heldout-sentences.txt | 80 | 0.989 | 0.945 | 1 | 78 |
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
| test split (n=96) | rules@1 (keyword rules) | 86.5% [79.2–92.7] | 77.1% [68.8–85.4] | 88.5% [81.3–94.8] | 63.5% [54.2–72.9] |
| test split (n=96) | encoder alone | 97.9% [94.8–100.0] | 96.9% [92.7–100.0] | 86.5% [79.2–92.7] | 81.3% [72.9–88.5] |
| test split (n=96) | **encoder + rules (default)** | 99.0% [96.9–100.0] | 95.8% [91.7–99.0] | 90.6% [84.4–95.8] | 88.5% [82.3–94.8] |
| unseen set (n=100) | rules@1 (keyword rules) | 90.0% [84.0–95.0] | 56.0% [46.0–66.0] | 88.0% [81.0–94.0] | 47.0% [37.0–57.0] |
| unseen set (n=100) | encoder alone | 97.0% [93.0–100.0] | 86.0% [79.0–92.0] | 71.0% [62.0–80.0] | 62.0% [52.0–71.0] |
| unseen set (n=100) | **encoder + rules (default)** | 98.0% [95.0–100.0] | 88.0% [81.0–94.0] | 86.0% [79.0–92.0] | 77.0% [69.0–85.0] |
| second unseen set (n=100) | rules@1 (keyword rules) | 84.0% [76.0–91.0] | 64.0% [54.0–73.0] | 85.0% [78.0–92.0] | 48.0% [38.0–58.0] |
| second unseen set (n=100) | encoder alone | 100.0% [100.0–100.0] | 88.0% [81.0–94.0] | 82.0% [74.0–89.0] | 75.0% [66.0–83.0] |
| second unseen set (n=100) | **encoder + rules (default)** | 98.0% [95.0–100.0] | 84.0% [77.0–91.0] | 90.0% [84.0–96.0] | 79.0% [71.0–87.0] |

Paired differences against rules on the same messages (points, 95% bootstrap interval, messages only that system gets right vs only rules gets right, exact McNemar p; `*` = p < 0.05):

| Set | Comparison | kind | action | urgency | all three |
| --- | --- | --- | --- | --- | --- |
| test split | encoder + rules vs rules | +12.5 pts [6.3–19.8], 12 vs 0, p < 0.001 * | +18.8 pts [11.5–27.1], 18 vs 0, p < 0.001 * | +2.1 pts [0.0–5.2], 2 vs 0, p = 0.500 | +25.0 pts [16.7–34.4], 24 vs 0, p < 0.001 * |
| test split | encoder alone vs rules | +11.5 pts [5.2–18.8], 12 vs 1, p = 0.003 * | +19.8 pts [11.5–29.2], 21 vs 2, p < 0.001 * | -2.1 pts [-10.4–6.3], 7 vs 9, p = 0.804 | +17.7 pts [6.3–29.2], 25 vs 8, p = 0.005 * |
| unseen set | encoder + rules vs rules | +8.0 pts [2.0–15.0], 10 vs 2, p = 0.039 * | +32.0 pts [21.0–43.0], 36 vs 4, p < 0.001 * | -2.0 pts [-8.0–4.0], 4 vs 6, p = 0.754 | +30.0 pts [19.0–41.0], 34 vs 4, p < 0.001 * |
| unseen set | encoder alone vs rules | +7.0 pts [0.0–14.0], 10 vs 3, p = 0.092 | +30.0 pts [18.0–41.0], 37 vs 7, p < 0.001 * | -17.0 pts [-27.0–-7.0], 6 vs 23, p = 0.002 * | +15.0 pts [2.0–28.0], 31 vs 16, p = 0.040 * |
| second unseen set | encoder + rules vs rules | +14.0 pts [8.0–21.0], 14 vs 0, p < 0.001 * | +20.0 pts [11.0–29.0], 22 vs 2, p < 0.001 * | +5.0 pts [1.0–10.0], 5 vs 0, p = 0.063 | +31.0 pts [21.0–41.0], 33 vs 2, p < 0.001 * |
| second unseen set | encoder alone vs rules | +16.0 pts [9.0–24.0], 16 vs 0, p < 0.001 * | +24.0 pts [15.0–34.0], 27 vs 3, p < 0.001 * | -3.0 pts [-12.0–5.0], 8 vs 11, p = 0.648 | +27.0 pts [15.0–39.0], 35 vs 8, p < 0.001 * |

By message language (all three labels right):

| Set | Lang | n | rules, all three | encoder + rules, all three | difference |
| --- | --- | --- | --- | --- | --- |
| test split | fr | 38 | 63.2% [47.4–79.0] | 89.5% [79.0–97.4] | +26.3 pts [13.2–42.1], 10 vs 0, p = 0.002 * |
| test split | en | 43 | 79.1% [65.1–90.7] | 95.3% [88.4–100.0] | +16.3 pts [7.0–27.9], 7 vs 0, p = 0.016 * |
| test split | wes | 15 | 20.0% [0.0–40.0] | 66.7% [40.0–86.7] | +46.7 pts [20.0–73.3], 7 vs 0, p = 0.016 * |
| unseen set | fr | 40 | 42.5% [27.5–57.5] | 72.5% [57.5–85.0] | +30.0 pts [12.4–47.5], 15 vs 3, p = 0.007 * |
| unseen set | en | 38 | 47.4% [31.6–63.2] | 81.6% [68.4–92.1] | +34.2 pts [21.1–50.0], 13 vs 0, p < 0.001 * |
| unseen set | wes | 22 | 54.5% [31.8–72.7] | 77.3% [59.1–95.5] | +22.7 pts [0.0–45.5], 6 vs 1, p = 0.125 |
| second unseen set | fr | 40 | 45.0% [30.0–60.0] | 77.5% [65.0–90.0] | +32.5 pts [17.5–47.5], 14 vs 1, p = 0.001 * |
| second unseen set | en | 38 | 63.2% [47.4–79.0] | 86.8% [76.3–97.4] | +23.7 pts [7.9–39.5], 10 vs 1, p = 0.012 * |
| second unseen set | wes | 22 | 27.3% [9.1–45.5] | 68.2% [50.0–86.4] | +40.9 pts [22.7–63.6], 9 vs 0, p = 0.004 * |

Scam level (`assessScam`, code, not changed by this model): test 100.0% [100.0–100.0], unseen 93.0% [88.0–98.0], second unseen 91.0% [85.0–96.0].
Training: 2115 train messages; 5-fold CV accuracy of the encoder heads alone: kind 96.0%, action 95.0%, urgency 83.1%.
Statistics: 95% percentile bootstrap over rows, 10000 resamples, seed 20261102; exact two-sided McNemar on discordant pairs.
<!-- /results:card-eval -->

### Calibration and thresholds

Expected calibration error (ECE) of each head alone (10 equal-width bins of the predicted label's
probability):

<!-- results:card-calibration -->
| Set | Head | ECE | mean confidence | accuracy |
| --- | --- | --- | --- | --- |
| test split | kind | 0.007 | 0.98 | 0.98 |
| test split | action | 0.046 | 0.95 | 0.97 |
| test split | urgency | 0.093 | 0.82 | 0.86 |
| unseen set | kind | 0.030 | 0.96 | 0.97 |
| unseen set | action | 0.062 | 0.89 | 0.86 |
| unseen set | urgency | 0.111 | 0.82 | 0.71 |
| second unseen set | kind | 0.041 | 0.96 | 1.00 |
| second unseen set | action | 0.087 | 0.93 | 0.88 |
| second unseen set | urgency | 0.064 | 0.81 | 0.82 |

Threshold grid (train split, out-of-fold, n=2115): accuracy of each field when the encoder's label is used at or above t, through the app's own combination code. Chosen: the middle of the plateau within half a point of the best.

| Field | 0.30 | 0.35 | 0.40 | 0.45 | 0.50 | 0.55 | 0.60 | 0.65 | 0.70 | 0.75 | 0.80 | 0.85 | 0.90 | 0.95 | never | chosen |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| kind | 95.9 | 96.0 | 96.3 | 96.5 | 96.7 | 96.8 | 96.9 | 97.1 | 96.9 | 96.9 | 96.6 | 96.1 | 95.7 | 94.8 | 87.0 | 0.65 |
| action | 89.9 | 89.8 | 89.8 | 89.6 | 89.5 | 89.5 | 89.5 | 89.5 | 89.5 | 89.2 | 88.6 | 87.7 | 87.0 | 84.9 | 63.0 | 0.5 |
| urgency | 92.5 | 92.5 | 92.4 | 92.4 | 92.4 | 92.6 | 92.6 | 92.6 | 92.7 | 92.6 | 92.6 | 92.5 | 92.5 | 92.5 | 92.5 | 0.65 |

Thresholds shipped in `heads.json`: kind 0.65, action 0.5, urgency 0.65.
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
