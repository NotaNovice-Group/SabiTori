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

# 1. encoder -> ONNX (vocabulary pruned to 30k pieces, int8 embeddings + int8 MatMuls), tokenizer.json
python export.py --out ../model/minilm \
  --corpus ../eval/messages.jsonl --corpus ../../../packs/fr/reading.json --corpus ../../../packs/en/reading.json

# 2. heads on the TRAIN split (5-fold CV picks C and the calibration temperature)
python train.py --model ../model/minilm --data ../eval/messages.jsonl

# 3. confidence thresholds from the train split's out-of-fold predictions (needs `pnpm install`)
cd ../../..
node packages/understand/eval/run-encoder.mjs --select-threshold --write

# 4. evaluate once on the TEST split (writes eval/results-encoder.md)
node packages/understand/eval/run-encoder.mjs

# 5. refresh the tokenizer/embedding parity fixture used by the vitest tests
cd packages/understand/train
python make_fixtures.py --model ../model/minilm --out ../test/fixtures/encoder-parity.json
```

`seed.jsonl` is a 39-message smoke set for testing the pipeline end to end before a real dataset exists
(`--data seed.jsonl`). Do not report numbers from it.

## What each step does

- `export.py`: loads the encoder, keeps the 30,000 vocabulary pieces French/English messages need
  (all pieces the train texts use, every single Latin character, then the best-scoring Latin pieces),
  stores the embedding table as int8 with one scale per row, exports encoder + mean pooling to ONNX
  (opset 17), and dynamically quantises the MatMuls to int8. The kept pieces keep their exact weights; a
  dropped piece is split into smaller kept ones. It checks the quantised model against the original
  (mean cosine of sentence embeddings is about 0.986).
  The encoder's 250k-piece vocabulary is 96 of its 118M parameters, so pruning it is what takes the
  file from about 120 MB to about 34 MB.
- `train.py`: embeds the train split with the exported int8 model (so the heads match what runs on the
  phone), L2-normalises, fits one multinomial logistic regression per field (C by 5-fold CV on
  log-loss), fits a temperature on the out-of-fold logits, refits on all train rows, and writes
  `heads.json` (weights, biases, labels in the order of `@sabitori/core`, temperatures) and `oof.json`.
  It also prints test accuracy once, for the model card. No choice depends on it.
- `eval/run-encoder.mjs --select-threshold --write`: for each field, picks the confidence at which the
  encoder's label replaces the rules' label, from the out-of-fold train predictions only.
- `make_fixtures.py`: token ids from the Python `tokenizers` library for 20 strings, and embeddings for
  5 of them, which `test/encoder.test.ts` compares with the TypeScript tokenizer and onnxruntime-web.

## Retraining with more data

Add rows to `eval/messages.jsonl` (same fields; real, consented, anonymised messages are best), then run
steps 1 to 5. Keep the `test` split untouched. The label lists must stay equal to `MESSAGE_KINDS`,
`ACTION_KINDS`, `URGENCIES`: the app refuses a `heads.json` whose labels differ.

The artefacts (`../model/minilm/`, about 35.6 MB) are committed to git; `.gitignore` does not exclude `*.onnx`
for this folder. Bump `ENCODER_ID` in `src/encoder.ts` when the files change in a way that changes answers.
