# French voice (Piper)

| | |
| --- | --- |
| Model id | `fr_FR-siwis-medium` (manifest `voiceHint`) |
| Engine | [Piper](https://github.com/rhasspy/piper), VITS, run with onnxruntime-web (see `docs/model.md`, "Voices") |
| Speaker | 1 (female), 22.05 kHz, quality "medium" (replaced `fr_FR-siwis-low` on 2026-11-20: the low model sounded robotic) |
| Source | https://huggingface.co/rhasspy/piper-voices/tree/main/fr/fr_FR/siwis/medium (pinned revision in `scripts/fetch-voices.mjs`) |
| Training data | SIWIS French Speech Synthesis Database, https://datashare.is.ed.ac.uk/handle/10283/2353 |
| Licence | **CC-BY 4.0**, https://creativecommons.org/licenses/by/4.0/ (from `MODEL_CARD`: "License: CC-BY 4.0") |
| Attribution | "French voice: Piper `fr_FR-siwis-medium`, trained on the SIWIS French Speech Synthesis Database (University of Edinburgh), CC BY 4.0." Repeated in `THIRD_PARTY_NOTICES.md`. |
| Size | 63,201,294 bytes |
| sha256 `fr_FR-siwis-medium.onnx` | `641d1ab097da2b81128c076810edb052b385decc8be3381814802a64a73baf99` |
| sha256 `fr_FR-siwis-medium.onnx.json` | `39479916c2db192b5ac9764daddd0c744d83e023ad890c6976c0633ae4df8959` |
| sha256 `MODEL_CARD` | `bd8b8d079d4d3d2c4cc20345889bbcd586d72f021a132f93357a763eb5232cce` |

The `.onnx` file is not in git (it would push the repository past 80 MB with the English voice).
`node scripts/fetch-voices.mjs` downloads it and checks the sha256; the app build runs that for you.

`fr_FR-siwis-medium.onnx.json` has no `phoneme_type`, so it is an espeak model (voice `fr`).

## Adding a community voice to a pack

1. Train or fine-tune a Piper model on the community's recordings. Export `<id>.onnx` and `<id>.onnx.json`.
2. Put both files in `packs/<tag>/voice/`. If the config says `"phoneme_type": "text"`, no espeak-ng
   is used at all (the model reads the letters of the language directly), which is the right choice
   for a language espeak-ng does not have.
3. In `packs/<tag>/manifest.json` set `"voice": { "kind": "tts", "engine": "piper", "bcp47": "<tag>", "voiceHint": "<id>" }`.
4. Write `packs/<tag>/voice/VOICE.md` (speakers, consent, licence chosen by the community, sha256) and add the voice to `THIRD_PARTY_NOTICES.md`.

No code change is needed. If the model does not load, the phone's own voice speaks instead.
