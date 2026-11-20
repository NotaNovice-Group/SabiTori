# Kokoro voice (English and French)

The primary on-device voice for English (and Cameroonian Pidgin, which uses the English voice files) and French.
One model serves both languages; each language adds one small style file. When Kokoro is too slow on a phone or
cannot load, Piper speaks instead (`packs/<tag>/voice/`), then the phone's own voice. See `docs/model.md`, "Voices".

| | |
| --- | --- |
| Model | Kokoro-82M v1.0 (StyleTTS 2 architecture, 82 million parameters), ONNX export by onnx-community, file `onnx/model_uint8.onnx` (8-bit quantised), served as `kokoro/model_uint8.onnx` |
| Voices | `af_heart` (English, American accent, female; overall grade "A" in the upstream VOICES.md), `ff_siwis` (French, female; grade "B-") |
| Output | 24 kHz mono |
| Runtime | Phone apps: native onnxruntime 1.28.0 in the `SabiToriKokoro` plugin (iOS Swift, Android Java), up to 4 threads. Web: onnxruntime-web 1.22.0 (WebAssembly) in its own Web Worker, only on a cross-origin isolated page. Text work in `packages/speech/src/kokoro/`; phonemes from the same espeak-ng files as Piper (`en-us`, `fr`) |
| Source | https://huggingface.co/onnx-community/Kokoro-82M-v1.0-ONNX at revision `1939ad2a8e416c0acfeecc08a694d14ef25f2231` (pinned in `scripts/fetch-kokoro.mjs`); upstream model https://huggingface.co/hexgrad/Kokoro-82M |
| Licence (model and voice files) | **Apache-2.0** (model card of both repositories: `license: apache-2.0`), https://www.apache.org/licenses/LICENSE-2.0 |
| Training data (upstream model card) | "permissive/non-copyrighted audio data": public domain audio, audio under Apache, MIT etc., synthetic audio from closed TTS models. French: the SIWIS French Speech Synthesis Database (under 11 h), CC BY 4.0, https://datashare.ed.ac.uk/handle/10283/2353 |
| Attribution | "Voice: Kokoro-82M by hexgrad (Apache-2.0), ONNX export by onnx-community. The French voice `ff_siwis` is trained on the SIWIS French Speech Synthesis Database (University of Edinburgh), CC BY 4.0." Repeated in `THIRD_PARTY_NOTICES.md`. |
| Size | `model_uint8.onnx` 177,464,632 bytes; `af_heart.bin` and `ff_siwis.bin` 522,240 bytes each (float32 [510, 256]) |
| sha256 `model_uint8.onnx` | `6607a397d77b8514065420b7c1e7320117f7aabfdb45ce15f0050c5b0fe75aea` |
| sha256 `voices/af_heart.bin` | `d583ccff3cdca2f7fae535cb998ac07e9fcb90f09737b9a41fa2734ec44a8f0b` |
| sha256 `voices/ff_siwis.bin` | `a35f5675ad08948e326ae75fd0ea16ba5d0042e4f76b5f3d1df77d0a48c54861` |

The files are not in git. `node scripts/fetch-kokoro.mjs` downloads them and checks the sha256; the app build runs
that for you and copies them to `public/kokoro/` (`SABITORI_BUNDLE_KOKORO=0` leaves them out). SabiTori changes
nothing in them.

Why `model_uint8.onnx` and not a smaller file: natively (onnxruntime CPU, 4 threads, x86 test machine) it ran at
a real-time factor of about 0.23, while `model_quantized.onnx` (92 MB) stayed above 1.3 and `model_q8f16.onnx` (86 MB)
above 1.1; `model_q8f16.onnx` also returned NaN audio (silence) for a French test sentence in single-thread
WebAssembly. With `model_uint8.onnx` all four test sentences gave audio and Whisper-small transcribed them back to
the input text apart from the acronym ENEO. Numbers: `docs/model.md`, "Kokoro". The app also refuses NaN audio at
run time (the fallback voice speaks).

Which pack gets Kokoro: the packs decide. A part whose pack speaks with the `en` or `fr` Piper voice files gets the
Kokoro voice of that language (`packages/speech/src/kokoro/voices.ts`); every other pack keeps its own voice.
