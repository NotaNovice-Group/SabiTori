# Training the built-in understanding model

The app ships a small neural model that reads every message on the phone: the multilingual sentence
encoder `sentence-transformers/paraphrase-multilingual-MiniLM-L12-v2` (Apache-2.0), exported to int8
ONNX, plus three small logistic-regression heads (kind, action, urgency) trained on its embeddings.
Everything below runs on a CPU in a few minutes.

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
python train.py --model ../model/minilm --data ../eval/messages.jsonl

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
