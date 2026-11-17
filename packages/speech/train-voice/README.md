# Training a voice for a language (recipe)

A recorded pack speaks by playing one clip per piece of a sentence. Once two speakers have recorded and checked
a pack, the same recordings can teach a small neural voice (Piper, VITS, about 20–60 MB, runs offline on the
phone) to say any sentence, including ones nobody recorded. This folder holds the steps and the tools.
**No trained voice exists yet for any local language**; nothing here claims one.

## What you need

- A recorded pack exported from the Recorder (`packs/<tag>/`, unzipped), with clips only from speakers who agreed
  to have their voice published (the Recorder leaves the others out of the export).
- The community's written agreement to train a voice from the recordings, if the pack has no licence yet
  (`LicenseRef-community-decides`). The tool refuses such a pack without `--community-agreed`.
- About an hour of speech for a usable single-speaker voice. One pack's phrases are a few minutes: plan more
  reading sessions (docs/languages.md, "Do we train our own models?").
- A computer with an NVIDIA GPU for training (a rented one is fine), Python, and Piper's training code. Local
  languages have no espeak-ng phonemizer, so the voice reads **letters** (`phoneme_type: "text"`), which the app's
  Piper runtime supports (`packages/speech/src/piper/config.ts`).

## Steps

1. **Build the training list** (from the repository root):

   ```bash
   VN=$(ls -d node_modules/.pnpm/vite-node@*/node_modules/vite-node/vite-node.mjs | head -1)
   node $VN packages/speech/train-voice/voice-tool.ts dataset packs/<tag> /tmp/<tag>-voice --community-agreed
   ```

   This writes `metadata.csv` (`<clip id>|<words>`, the format Piper's preprocessing reads as LJSpeech) and
   `wavs/<clip id>.wav` (22,050 Hz mono, converted with ffmpeg). Single-word number and date clips are not used.

2. **Train** with Piper's training code, starting from an existing voice of the same sample rate rather than
   from nothing (fine-tuning needs far less audio). The commands below follow Piper's training guide
   (`TRAINING.md` in the Piper repository); check them against the version you install:

   ```bash
   python3 -m piper_train.preprocess --language <tag> --input-dir /tmp/<tag>-voice --output-dir /tmp/<tag>-train --dataset-format ljspeech --single-speaker --sample-rate 22050 --phoneme-type text
   ```

   ```bash
   python3 -m piper_train --dataset-dir /tmp/<tag>-train --accelerator gpu --devices 1 --batch-size 16 --validation-split 0.0 --num-test-examples 0 --max_epochs <N> --resume_from_checkpoint <base voice .ckpt> --checkpoint-epochs 1 --precision 32 --quality low
   ```

   ```bash
   python3 -m piper_train.export_onnx <last .ckpt> /tmp/<tag>-voice.onnx && cp /tmp/<tag>-train/config.json /tmp/<tag>-voice.onnx.json
   ```

3. **Check that the app can use it**:

   ```bash
   node $VN packages/speech/train-voice/voice-tool.ts check /tmp/<tag>-voice.onnx.json packs/<tag>
   ```

   It parses the config with the app's own parser, requires `phoneme_type: "text"`, and lists any letter of the
   pack's sentences the voice cannot say (the app would drop it). Fix the training text and train again until it
   says OK.

4. **Listen with speakers.** Two native speakers listen to new sentences (not the training ones) and say whether
   they are understandable and sound right. Only then does the voice go in `packs/<tag>/voice/` with a
   `MODEL_CARD` (data, speakers who agreed to be named, hours, licence) like the French and English voices.

## Tests

`packages/speech/test/train-voice.test.ts` covers the training list and the check; the Recorder's clip naming
is checked against it in `apps/recorder/test/train-voice.test.ts`.
