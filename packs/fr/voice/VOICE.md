# French voice (Piper)

| | |
| --- | --- |
| Model id | `fr_FR-siwis-low` (manifest `voiceHint`) |
| Engine | [Piper](https://github.com/rhasspy/piper), VITS, run with onnxruntime-web (see `docs/model.md`, "Voices") |
| Speaker | 1 (female), 16 kHz, quality "low" |
| Source | https://huggingface.co/rhasspy/piper-voices/tree/main/fr/fr_FR/siwis/low (pinned revision in `scripts/fetch-voices.mjs`) |
| Training data | SIWIS French Speech Synthesis Database, https://datashare.is.ed.ac.uk/handle/10283/2353 |
| Licence | **CC-BY 4.0**, https://creativecommons.org/licenses/by/4.0/ (from `MODEL_CARD`: "License: CC-BY 4.0") |
| Attribution | "French voice: Piper `fr_FR-siwis-low`, trained on the SIWIS French Speech Synthesis Database (University of Edinburgh), CC BY 4.0." Repeated in `THIRD_PARTY_NOTICES.md`. |
| Size | 28,130,791 bytes |
| sha256 `fr_FR-siwis-low.onnx` | `a7b7dcaf87229b32af8275cb1a719371234ea677bc0313d2289d5c50ab0ac53d` |
| sha256 `fr_FR-siwis-low.onnx.json` | `9722527d748c284f6dd7639c4b4e661853d4f7d4514079571f67d6a97a652b69` |
| sha256 `MODEL_CARD` | `ba5175f04dadf9ce2d0e19b9ae2164320f1ada740377166620259e321470d488` |

The `.onnx` file is not in git (it would push the repository past 80 MB with the English voice).
`node scripts/fetch-voices.mjs` downloads it and checks the sha256; the app build runs that for you.

`fr_FR-siwis-low.onnx.json` has no `phoneme_type`, so it is an espeak model (voice `fr`).

## Adding a community voice to a pack

1. Train or fine-tune a Piper model on the community's recordings. Export `<id>.onnx` and `<id>.onnx.json`.
2. Put both files in `packs/<tag>/voice/`. If the config says `"phoneme_type": "text"`, no espeak-ng
   is used at all (the model reads the letters of the language directly), which is the right choice
   for a language espeak-ng does not have.
3. In `packs/<tag>/manifest.json` set `"voice": { "kind": "tts", "engine": "piper", "bcp47": "<tag>", "voiceHint": "<id>" }`.
4. Write `packs/<tag>/voice/VOICE.md` (speakers, consent, licence chosen by the community, sha256) and add the voice to `THIRD_PARTY_NOTICES.md`.

No code change is needed. If the model does not load, the phone's own voice speaks instead.
