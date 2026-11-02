# English voice (Piper)

| | |
| --- | --- |
| Model id | `en_GB-alba-medium` (manifest `voiceHint`) |
| Engine | [Piper](https://github.com/rhasspy/piper), VITS, run with onnxruntime-web (see `docs/model.md`, "Voices") |
| Speaker | 1 (female, Scottish accent), 22.05 kHz, quality "medium" |
| Source | https://huggingface.co/rhasspy/piper-voices/tree/main/en/en_GB/alba/medium (pinned revision in `scripts/fetch-voices.mjs`) |
| Training data | https://datashare.ed.ac.uk/handle/10283/3270 (University of Edinburgh DataShare). Fine-tuned from the Piper `en_US-lessac-medium` model. |
| Licence | **CC BY 4.0**, https://creativecommons.org/licenses/by/4.0/ (from `MODEL_CARD`) |
| Attribution | "English voice: Piper `en_GB-alba-medium`, trained on a University of Edinburgh speech dataset, CC BY 4.0." Repeated in `THIRD_PARTY_NOTICES.md`. |
| Size | 63,201,294 bytes |
| sha256 `en_GB-alba-medium.onnx` | `401369c4a81d09fdd86c32c5c864440811dbdcc66466cde2d64f7133a66ad03b` |
| sha256 `en_GB-alba-medium.onnx.json` | `aa965a2f02ecced632c2694e1fc72bbff6d65f265fab567ca945918c73dd89f4` |
| sha256 `MODEL_CARD` | `fa166b1779404c470b0b6b4ba0238bc4a35bf89d2cd130c6788f697188b737d6` |

The `.onnx` file is not in git. `node scripts/fetch-voices.mjs` downloads it and checks the sha256;
the app build runs that for you.

Why this voice: among the English voices whose model cards were read (ryan, hfc_female, southern_english_female,
jenny_dioco, ljspeech, kristin, cori, alba), the others are non-commercial (ryan, hfc_*: CC BY-NC-SA), share-alike (southern_english_female: CC BY-SA), without a
stated licence on the card (jenny_dioco: "See URL"), or public domain but US English and the same 63 MB
(ljspeech, kristin; cori is public domain en-GB but also 63 MB). Alba is CC BY, matches the pack's
`en-GB` tag and needs only attribution. None of the English voices checked has an `x_low` variant. Size is the open problem for
cheap phones: see "Voices" in `docs/model.md`.

`en_GB-alba-medium.onnx.json` has `phoneme_type: "espeak"` with espeak voice `en-gb-x-rp`.
