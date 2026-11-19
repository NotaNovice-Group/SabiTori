# Training the built-in understanding model

The app ships a small neural model that reads every message on the phone: the multilingual sentence
encoder `sentence-transformers/paraphrase-multilingual-MiniLM-L12-v2` (Apache-2.0), fine-tuned on the train
messages together with three linear heads (kind, action, urgency), then exported to int8 ONNX.
Since `minilm-l12-int8@4` the encoder itself is fine-tuned (`finetune.py`, below); up to `@3` it was frozen and
only the heads were trained (`train.py`, kept for comparison). The fine-tune takes about 65 minutes on a 4-core
CPU; everything else runs in a few minutes.

## Fine-tune (what ships since `minilm-l12-int8@4`)

From the repository root, after the setup lines of "Reproduce" below:

```bash
cd packages/understand/train
EXTRA="--extra ../eval/train-extra.jsonl $(for g in ../eval/train-gen/g*.jsonl; do echo --extra $g; done)"

# 1. 5-fold out-of-fold run on TRAIN rows, then the shipped model on all train rows (writes st/, heads.json, oof.json)
python finetune.py --data ../eval/messages.jsonl $EXTRA --out ../model/minilm-ft --epochs 12 --lr 5e-5
# (or: --cv-only into one folder to compare settings, then --final-only <that folder> to train only the shipped model)

# 2. export the fine-tuned encoder (vocabulary from TRAIN texts and the packs; fidelity on held-out sentences)
python export.py --base ../model/minilm-ft/st --out ../model/minilm \
  --corpus ../eval/messages.jsonl $(echo $EXTRA | sed 's/--extra/--corpus/g') \
  --corpus ../../../packs/fr/reading.json --corpus ../../../packs/en/reading.json \
  --heldout heldout-sentences.txt
cp ../model/minilm-ft/heads.json ../model/minilm-ft/oof.json ../model/minilm/
cp ../model/minilm-ft/finetune-report.json ../model/minilm/train-report.json

# 3. thresholds from the out-of-fold predictions, through the app's combine code; then the parity fixture
cd ../../..
node packages/understand/eval/run-encoder.mjs --select-threshold --write
cd packages/understand/train && python make_fixtures.py --model ../model/minilm --out ../test/fixtures/encoder-parity.json
```

Then step 4 of "Reproduce" (the one-time evaluation on the test split and the unseen sets) and `model-card.mjs`.

How it trains: mean-pooled, L2-normalised embedding, three linear heads (logits scaled by 20), summed cross-entropy
with label smoothing 0.05, AdamW (encoder lr 5e-5, heads 2e-3), 10% warm-up then linear decay, batch 16, 12 epochs,
max 128 tokens. The word-embedding table (96M of 118M parameters) stays frozen: it is pruned to 30k rows at export
anyway, and freezing it makes a CPU step about 3x cheaper. The calibration temperature per field is fitted on the
out-of-fold logits. Settings were compared only on out-of-fold "all three right" through `combineWithRules`
(`run-encoder.mjs --select-threshold --model <dir>`, which reads `oof.json` and never the test or unseen sets):

| Setting (5-fold, train rows) | encoder alone: kind / action / urgency | combined: kind / action / urgency | combined: all three |
|---|---|---|---|
| frozen encoder + logistic heads (`@3`, old guard input), 1,953 rows | n/a | 91.4 / 83.7 / 93.4 | 74.2 |
| 5 epochs, lr 4e-5, 1,953 rows | 93.7 / 94.0 / 84.9 | 95.7 / 89.0 / 92.1 | 83.8 |
| 8 epochs, lr 5e-5, 1,953 rows | 95.3 / 95.0 / 85.0 | 95.8 / 89.8 / 92.2 | 84.6 |
| 8 epochs, lr 5e-5, action loss x2, smoothing 0.1, 1,953 rows | 94.9 / 95.0 / 85.6 | 95.9 / 89.7 / 92.1 | 84.4 |
| 8 epochs, lr 5e-5, + `g6.jsonl`, 2,115 rows | 96.0 / 95.0 / 83.1 | 97.1 / 89.5 / 92.6 | 85.3 (84.0 on the original 1,953) |
| same, with the dated-notice guard (below) | 96.0 / 95.0 / 83.1 | 97.1 / 93.0 / 95.9 | 88.8 |
| **shipped**: 12 epochs, lr 5e-5, + `g6.jsonl`, dated-notice guard | 96.3 / 95.8 / 83.7 | 97.0 / 93.9 / 95.8 | 89.6 |

12 against 8 epochs (same guard, same rows): 30 rows right only with 12, 15 only with 8, exact McNemar p = 0.036.
The last two rows also include the rules change merged from `main` (probe 17).

"Encoder alone" is the argmax of each head; "combined" is what the app shows (rules + encoder, thresholds chosen on
the same out-of-fold predictions). Urgency alone is low on purpose: code decides it from the action and the dates.
(Fine-tuned rows are with the corrected guard input described below; before it, the first row's 83.8 was 81.2.)

Two things cap the combined number below the encoder's own accuracy: urgency is decided by code from the chosen
action and the deadline cues (on purpose), and `guardUnderstanding` keeps the rules' action when the encoder says
"nothing" next to a future date. With a perfect encoder (gold labels at confidence 1) the combined "all three right"
on these train rows is 92.0%, so the 92% goal is not reachable by the encoder alone with the combine code as it is.
The combine step used to pass "any amount in the text" as the guard's `amountNearPay`; it now passes the precise
test (an amount within 40 characters of a pay/send verb, `amountNearPayIn` in core, the same one `card.ts` uses),
which on its own raised the perfect-encoder ceiling from 89.2% to 92.0%.

**Dated-notice guard.** A future date used to force the rules' action over the encoder's "nothing", so planned cuts and
holidays came out as "unclear, urgent". Now the date does not block "nothing" when the rules themselves found no task
(their answer is `unclear`), the text has no amount at all, and no alarm word ("today", "tonight", "within N hours"):
`timeAlarm` in `GuardContext`, computed the same way in `combineWithRules` and `buildCard`; unknown means the old strict
rule. Perfect-encoder ceiling 92.0% -> 96.2%. On the train rows out-of-fold, wrong "nothing" answers go from 7 to 10 of
2,115 for the 8-epoch model (9 for the shipped one); the added ones include "Votre ligne sera désactivée le 26/11 ...
faites une recharge" ("recharge" is not a pay verb in the lexicon). A looser version (no amount or alarm-word condition)
reached 89.7% but also said "nothing" to "Tuition balance of 25,000 FCFA must be cleared before ..." and "Recharge today
to avoid a blackout tonight", so it was not kept. Tests: `core/test/guard-dated-notice.test.ts`.

What still caps the number (perfect encoder, 81 rows): urgency treats any date as a deadline ("to dispute the transaction
of 29 October, call ..." becomes urgent), a receipt dated today has an amount next to a date, labels disagree on
`bring_document` against `go_to_place` ("Passez en agence avec votre CNI" is labelled both ways in the train files), and
"Prenez vos dispositions" reads as `take_medicine` in the rules.

`eval/train-gen/g6.jsonl` (162 rows, ids `ft-`, generator `eval/gen/g6-finetune.py`) adds messages where an optional
"call for info" line sits next to the real ask (pay, bring a document, go, collect, reply, take medicine; receipts are
`nothing`), plus rows where calling is the ask. They were written from the labelling rules after the 8-epoch model
answered `call` on the review test "school fees ... pay am before 20/11 ... Call ... for info"
(`test/review3.test.ts`); their urgency agrees with the code's deadline arithmetic on every row.

## Reproduce

From the repository root (Python 3.10+; tested with 3.13):

```bash
python3 -m venv ~/venv-ml && source ~/venv-ml/bin/activate
pip install torch --index-url https://download.pytorch.org/whl/cpu
pip install -r packages/understand/train/requirements.txt

cd packages/understand/train

# 1. encoder -> ONNX (vocabulary pruned to 30k pieces, int8 embeddings + int8 MatMuls), tokenizer.json,
#    fidelity check on held-out text. Downloads the pinned word-frequency lists into train/.cache/ once.
python export.py --out ../model/minilm \
  --corpus ../eval/messages.jsonl --corpus ../../../packs/fr/reading.json --corpus ../../../packs/en/reading.json \
  --heldout ../eval/messages.jsonl:test --heldout ../eval/unseen.jsonl --heldout heldout-sentences.txt

# 2. heads on the TRAIN split (5-fold CV picks C and the calibration temperature)
python train.py --model ../model/minilm --data ../eval/messages.jsonl --extra ../eval/train-extra.jsonl

# 3. confidence thresholds from the train split's out-of-fold predictions (needs `pnpm install`)
cd ../../..
node packages/understand/eval/run-encoder.mjs --select-threshold --write

# 4. evaluate once on the TEST split and the UNSEEN set (writes eval/results.json and eval/results-encoder.md),
#    then regenerate every published table (README, docs/model.md, model card, eval/README) from results.json
node packages/understand/eval/run-encoder.mjs
node packages/understand/eval/model-card.mjs

# 5. refresh the tokenizer/embedding parity fixture used by the vitest tests
cd packages/understand/train
python make_fixtures.py --model ../model/minilm --out ../test/fixtures/encoder-parity.json
```

`seed.jsonl` is a 39-message smoke set for testing the pipeline end to end before a real dataset exists
(`--data seed.jsonl`). Do not report numbers from it.

## What each step does

- `export.py`: loads the encoder and keeps 30,000 vocabulary pieces: all pieces the TRAIN texts and the
  fr/en pack lexicons use, every single Latin character, then (`--fill freq`, the default) every piece
  needed to spell the most frequent French and English words of a general word-frequency list
  (Hermit Dave FrequencyWords, OpenSubtitles 2018, CC-BY-SA-4.0; pinned commit and sha256 in the script;
  used only to choose pieces, never redistributed), and the best-scoring Unigram pieces if room is left.
  `--fill score` is the earlier strategy (Unigram scores only). It stores the embedding table as int8 with
  one scale per row, exports encoder + mean pooling to ONNX (opset 17), and dynamically quantises the
  MatMuls to int8. Kept pieces keep their exact weights; a dropped piece is split into smaller kept ones.
  The fidelity check compares the exported model with the original fp32 model on HELD-OUT text only
  (`--heldout`: the test split, the unseen set and `heldout-sentences.txt`), and writes it to
  `export-info.json` (values in the model card).
  The encoder's 250k-piece vocabulary is 96M of its 117.7M parameters; pruning it to 30k pieces gives the
  33.0M-parameter model the app ships, and takes the file from about 120 MB to about 34 MB.
- `train.py`: embeds the train split with the exported int8 model (so the heads match what runs on the
  phone), L2-normalises, fits one multinomial logistic regression per field (C by 5-fold CV on
  log-loss), fits a temperature on the out-of-fold logits, refits on all train rows, and writes
  `heads.json` (weights, biases, labels in the order of `@sabitori/core`, temperatures) and `oof.json`.
  It also prints test accuracy once, for the model card. No choice depends on it.
- `eval/run-encoder.mjs --select-threshold --write`: for each field, picks the confidence at which the
  encoder's label replaces the rules' label, from the out-of-fold train predictions only, through the
  app's own combination function (`combineWithRules`).
- `eval/compare.mjs A.json B.json`: paired comparison of two exports evaluated on the same rows (used for
  `eval/vocab-fill-comparison.md`: export twice with `--fill freq` and `--fill score` into two folders,
  run steps 2 to 4 with `--model <folder> --json <file>` for each, then compare).
- `make_fixtures.py`: token ids from the Python `tokenizers` library for 20 strings, and embeddings for
  5 of them, which `test/encoder.test.ts` compares with the TypeScript tokenizer and onnxruntime-web.

## Retraining with more data

Add rows to `eval/messages.jsonl` (same fields; real, consented, anonymised messages are best), then run
steps 1 to 5. Keep the `test` split untouched, and never train on `eval/unseen.jsonl`. The label lists must stay equal to `MESSAGE_KINDS`,
`ACTION_KINDS`, `URGENCIES`: the app refuses a `heads.json` whose labels differ.

The artefacts (`../model/minilm/`, about 35.6 MB) are committed to git; `.gitignore` does not exclude `*.onnx`
for this folder. Bump `ENCODER_ID` in `src/encoder.ts` when the files change in a way that changes answers.
