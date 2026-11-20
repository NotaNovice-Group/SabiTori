# Third-party notices

SabiTori's own code is MPL-2.0 (`LICENSE`); language packs are under the licence in each manifest.
This file lists the third-party components that ship inside the app, with their licences. Add a row here
whenever you bundle another component.

## Models and engines that run on the phone

| Component | What it does in SabiTori | Licence | Source |
| --- | --- | --- | --- |
| `paraphrase-multilingual-MiniLM-L12-v2` (vocabulary pruned to 30k pieces, int8; `packages/understand/model/minilm/`) | Understands every message (kind, action, urgency) | Apache-2.0 | https://huggingface.co/sentence-transformers/paraphrase-multilingual-MiniLM-L12-v2 |
| onnxruntime-web (runs MiniLM, the Kokoro voice and the Piper voices; versions in `packages/understand/package.json` and `packages/speech/package.json`) | Model runtime, WebAssembly, single thread | MIT | https://github.com/microsoft/onnxruntime |
| Kokoro-82M v1.0, ONNX export `model_quantized.onnx` and voice files `af_heart.bin`, `ff_siwis.bin` (`voices/kokoro/`, served from `public/kokoro/`) | Primary voice for English and French | Apache-2.0 | https://huggingface.co/onnx-community/Kokoro-82M-v1.0-ONNX , https://huggingface.co/hexgrad/Kokoro-82M |
| `@huggingface/tokenizers` 0.2.0 | Tokenizer for MiniLM | Apache-2.0 | https://github.com/huggingface/tokenizers |
| tesseract.js 7.0.0 and tesseract.js-core 7.0.0 | Text recognition (OCR) of photos | Apache-2.0 | https://github.com/naptha/tesseract.js |
| Tesseract LSTM models `eng` and `fra`, integer-quantised `best_int` variant (`4.0.0_best_int`, packaged as `@tesseract.js-data/eng` and `/fra` 1.0.0, MIT packaging) | OCR language data | Apache-2.0 | https://github.com/tesseract-ocr/tessdata_best (via the `4.0.0_best_int` folder of the npm packages) |
| `@wllama/wllama` 3.8.1, a WebAssembly build of llama.cpp | Runs the optional, side-loaded Qwen model. Only in research builds (`VITE_LLM=1`); not in store builds | MIT (llama.cpp: MIT) | https://github.com/ngxson/wllama , https://github.com/ggml-org/llama.cpp |
| Qwen2.5-1.5B-Instruct (NOT bundled; a person may side-load it) | Optional second opinion on unclear messages | Apache-2.0 | https://huggingface.co/Qwen/Qwen2.5-1.5B-Instruct |

Notes on the understanding model:

- The MiniLM files in the app (`encoder.int8.onnx`, `tokenizer.json`) contain only weights and vocabulary pieces
  of the original Apache-2.0 model (a subset, quantised). The three heads (`heads.json`) are trained by this project
  on its own synthetic dataset (`packages/understand/eval/messages.jsonl`, CC-BY-SA-4.0, written by this project);
  they contain numbers, no text from the dataset, and the project releases them under Apache-2.0 with the encoder.
  `model/minilm/oof.json` (a training artefact, not shipped in the app) quotes dataset text and stays CC-BY-SA-4.0.
- Which vocabulary pieces are kept is chosen with general word-frequency lists (Hermit Dave, FrequencyWords,
  OpenSubtitles 2018, content CC-BY-SA-4.0, https://github.com/hermitdave/FrequencyWords, pinned commit and sha256 in
  `packages/understand/train/export.py`). The lists are downloaded at export time and not redistributed; no word or
  count from them is in any shipped file.

## App, fonts and libraries

| Component | Version | Licence | Source |
| --- | --- | --- | --- |
| Andika typeface (SIL), full font, unmodified, in `apps/app/src/fonts/` (the Recorder uses `@fontsource/andika` 5.3.0) | 7.000 | SIL Open Font License 1.1 | https://software.sil.org/andika/ |
| lucide-react icons | 1.65.0 | ISC | https://lucide.dev |
| React, React DOM | 19.3.1 | MIT | https://react.dev |
| Capacitor core, camera, local notifications, splash screen | 8.x | MIT | https://capacitorjs.com |
| `@capacitor-community/text-to-speech` | 8.0.2 | MIT | https://github.com/capacitor-community/text-to-speech |
| `@capgo/capacitor-share-target` | 8.0.64 | MPL-2.0 | https://github.com/Cap-go/capacitor-share-target |
| Google Play services, `play-services-auth-api-phone` (Android only: the consent sheet for "Read my next SMS") | 18.1.0 | Android Software Development Kit License (not open source; the app works without it, minus this one button) | https://developers.google.com/identity/sms-retriever/user-consent/overview |
| `@noble/ed25519` (update signatures) | 3.2.0 | MIT | https://github.com/paulmillr/noble-ed25519 |
| `@sentry/browser` (only loaded if crash reports are configured and switched on) | 11.10.0 | MIT | https://github.com/getsentry/sentry-javascript |

The full dependency list, with every transitive package and its licence, is in `pnpm-lock.yaml`; run
`pnpm licenses list --prod` for a report.

## On-device voices (Piper)

How they fit together: `packages/speech/src/piper/` (SabiTori code, MPL-2.0) runs a Piper voice model
with onnxruntime-web, after turning text into phonemes with espeak-ng. All of it runs on the phone,
offline. See `docs/model.md`, section "Voices".

| Component | Where | Version | Licence | Source |
| --- | --- | --- | --- | --- |
| espeak-ng (phonemizer, compiled to WebAssembly) and its language data | `public/piper/piper_phonemize.{wasm,mjs,data}` | rhasspy/espeak-ng fork, as built in `@diffusionstudio/piper-wasm` 1.0.0 | **GPL-3.0-or-later** | https://github.com/espeak-ng/espeak-ng , https://github.com/rhasspy/espeak-ng |
| piper-phonemize (the layer that calls espeak-ng and maps phonemes) | compiled into `piper_phonemize.wasm` | as built in `@diffusionstudio/piper-wasm` 1.0.0 | MIT | https://github.com/rhasspy/piper-phonemize |
| `@diffusionstudio/piper-wasm` (the WebAssembly build of the two above) | build input; files copied by `scripts/piper-assets.mjs` | 1.0.0 | MIT | https://github.com/diffusion-studio/piper-wasm |
| onnxruntime-web (runs the voice model; CPU/WebAssembly, single thread) | `public/piper/ort.wasm.min.mjs`, `ort-wasm-simd-threaded.{mjs,wasm}` | 1.22.0 | MIT | https://github.com/microsoft/onnxruntime , third-party notices of ONNX Runtime: https://github.com/microsoft/onnxruntime/blob/main/ThirdPartyNotices.txt |
| Piper voice model `fr_FR-siwis-medium` | `packs/fr/voice/` | rhasspy/piper-voices at the revision pinned in `scripts/fetch-voices.mjs` | **CC BY 4.0** | https://huggingface.co/rhasspy/piper-voices/tree/main/fr/fr_FR/siwis/low |
| Piper voice model `en_GB-alba-medium` | `packs/en/voice/` | same revision | **CC BY 4.0** | https://huggingface.co/rhasspy/piper-voices/tree/main/en/en_GB/alba/medium |

Piper (https://github.com/rhasspy/piper) is the project that defined the voice model format and trained
these two voices; it is MIT-licensed. SabiTori does not include Piper's own C++ program.

### Voices: sources, attribution, checksums

Each voice has its own record in `packs/<tag>/voice/VOICE.md` (source URL, training data, licence, size,
sha256). Summary:

- **French**: `fr_FR-siwis-medium`, trained on the SIWIS French Speech Synthesis Database
  (https://datashare.is.ed.ac.uk/handle/10283/2353), licence CC BY 4.0
  (https://creativecommons.org/licenses/by/4.0/legalcode). Model card: `packs/fr/voice/MODEL_CARD`.
  sha256 of the model `a7b7dcaf87229b32af8275cb1a719371234ea677bc0313d2289d5c50ab0ac53d`.
  Attribution: *French voice: Piper `fr_FR-siwis-medium`, trained on the SIWIS French Speech Synthesis Database (University of Edinburgh), CC BY 4.0.*
- **English**: `en_GB-alba-medium`, trained on a University of Edinburgh speech dataset
  (https://datashare.ed.ac.uk/handle/10283/3270), licence CC BY 4.0
  (https://creativecommons.org/licenses/by/4.0/legalcode). Model card: `packs/en/voice/MODEL_CARD`.
  sha256 of the model `401369c4a81d09fdd86c32c5c864440811dbdcc66466cde2d64f7133a66ad03b`.
  Attribution: *English voice: Piper `en_GB-alba-medium`, trained on a University of Edinburgh speech dataset, CC BY 4.0.*

The voice files are the unmodified files from `rhasspy/piper-voices`. SabiTori changes nothing in them.
The `.onnx` models are not stored in git; `scripts/fetch-voices.mjs` downloads them from the pinned
revision and checks the sha256.

Community voices added later (a pack's own `packs/<tag>/voice/` model) are licensed as the community
chooses; list each one here and in its `VOICE.md`.

### espeak-ng is GPL-3.0-or-later

espeak-ng is licensed under the GNU General Public License v3 or later
(https://www.gnu.org/licenses/gpl-3.0.txt). Its repository (https://github.com/espeak-ng/espeak-ng/blob/master/COPYING)
also lists a few smaller parts under other permissive licences. What this means for SabiTori:

- SabiTori's own code is MPL-2.0, and MPL-2.0 section 3.3 allows it to be combined with GPL-3.0 code in a
  larger work. The LICENSE file carries no "Incompatible With Secondary Licenses" notice (Exhibit B is the
  unfilled template), so the combination is allowed. SabiTori's files stay under MPL-2.0; the espeak-ng
  files stay under GPL-3.0-or-later.
- The espeak-ng code and data are separate files (`piper_phonemize.wasm`, `.data`) that the voice worker loads
  at run time. Anyone who distributes an app build that includes them must provide the GPL "corresponding
  source" for those files. The sources are: the espeak-ng repositories above (the build uses the
  rhasspy/espeak-ng fork), and the build recipe in https://github.com/diffusion-studio/piper-wasm
  (`README.md`). SabiTori's own source is this repository. Written offer: anyone who receives the app may
  ask the maintainers (through this repository) for these sources and we will supply them.
- espeak-ng is only used for voice models whose config says `"phoneme_type": "espeak"` (today French and
  English). A model with `"phoneme_type": "text"` (planned for community-trained voices of Cameroonian
  languages) never calls espeak-ng. An app build that ships only such voices can leave `piper_phonemize.*`
  out (`scripts/piper-assets.mjs`) and contains no GPL code from this list.
- `scripts/piper-assets.mjs` copies only the espeak-ng dictionaries the bundled voices need (French and
  English). The remaining language dictionaries from the upstream package are not shipped.

### MIT licence (onnxruntime-web, piper-phonemize, @diffusionstudio/piper-wasm, Piper)

Copyright (c) Microsoft Corporation (onnxruntime-web); Copyright (c) 2023 Michael Hansen (piper-phonemize);
Copyright (c) the `@diffusionstudio/piper-wasm` authors; Copyright (c) the Piper authors.

Permission is hereby granted, free of charge, to any person obtaining a copy of this software and
associated documentation files (the "Software"), to deal in the Software without restriction, including
without limitation the rights to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is furnished to do so, subject to the
following conditions:

The above copyright notice and this permission notice shall be included in all copies or substantial
portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR IMPLIED, INCLUDING BUT NOT
LIMITED TO THE WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO
EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER
IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE
USE OR OTHER DEALINGS IN THE SOFTWARE.

### CC BY 4.0 (the two voice models)

Creative Commons Attribution 4.0 International. You may share and adapt the material, including for
commercial use, if you give appropriate credit, provide a link to the licence and indicate if changes were
made. Full text: https://creativecommons.org/licenses/by/4.0/legalcode ; summary:
https://creativecommons.org/licenses/by/4.0/ .

## On-device voice (Kokoro)

`packages/speech/src/kokoro/` (SabiTori code, MPL-2.0) runs Kokoro-82M with onnxruntime-web in its own Web Worker,
after turning text into phonemes with the same espeak-ng files as Piper (above: GPL-3.0-or-later, separate files
loaded at run time). It is the first voice for English and French; when it is too slow on a phone or cannot load,
Piper speaks. No transformers.js or kokoro-js code is included. Record: `voices/kokoro/VOICE.md`.

| Component | Where | Version | Licence | Source |
| --- | --- | --- | --- | --- |
| Kokoro-82M model, ONNX export `onnx/model_quantized.onnx` (unmodified) | `voices/kokoro/model_quantized.onnx` -> `public/kokoro/` | onnx-community/Kokoro-82M-v1.0-ONNX at revision `1939ad2a8e416c0acfeecc08a694d14ef25f2231` (pinned in `scripts/fetch-kokoro.mjs`) | **Apache-2.0** | https://huggingface.co/onnx-community/Kokoro-82M-v1.0-ONNX , upstream https://huggingface.co/hexgrad/Kokoro-82M |
| Voice `af_heart` (English) | `voices/kokoro/voices/af_heart.bin` | same revision | **Apache-2.0** | same |
| Voice `ff_siwis` (French) | `voices/kokoro/voices/ff_siwis.bin` | same revision | **Apache-2.0**; trained on the SIWIS database, CC BY 4.0 (attribution below) | same; data https://datashare.ed.ac.uk/handle/10283/2353 |
| Kokoro vocabulary (115 phoneme symbols, copied into `packages/speech/src/kokoro/text.ts`) | source code | from `tokenizer.json` of the same revision | Apache-2.0 | same |

sha256: model `fbae9257e1e05ffc727e951ef9b9c98418e6d79f1c9b6b13bd59f5c9028a1478`, `af_heart.bin`
`d583ccff3cdca2f7fae535cb998ac07e9fcb90f09737b9a41fa2734ec44a8f0b`, `ff_siwis.bin`
`a35f5675ad08948e326ae75fd0ea16ba5d0042e4f76b5f3d1df77d0a48c54861`.

Attribution: *Voice: Kokoro-82M by hexgrad (Apache-2.0), ONNX export by onnx-community. The French voice `ff_siwis`
is trained on the SIWIS French Speech Synthesis Database (University of Edinburgh), CC BY 4.0.*

The phoneme spelling rules in `packages/speech/src/kokoro/text.ts` follow kokoro-js 1.2.1 (Apache-2.0,
https://github.com/hexgrad/kokoro/tree/main/kokoro.js) and misaki (Apache-2.0, https://github.com/hexgrad/misaki);
they are a few string replacements written for SabiTori, no code from either is included.

### Apache License 2.0 (Kokoro-82M and its voices)

Licensed under the Apache License, Version 2.0 (the "License"); you may not use these files except in compliance
with the License. You may obtain a copy of the License at https://www.apache.org/licenses/LICENSE-2.0 . Unless
required by applicable law or agreed to in writing, software distributed under the License is distributed on an
"AS IS" BASIS, WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied. See the License for the
specific language governing permissions and limitations under the License.

### Considered and not used

- `@mintplex-labs/piper-tts-web` 1.0.5 (MIT): a thin wrapper that downloads voices from Hugging Face, keeps
  them in the browser's OPFS, creates a new espeak-ng instance for every sentence and has no `phoneme_type: "text"` support.
  We use the same two WebAssembly builds directly instead.
- sherpa-onnx WebAssembly TTS (Apache-2.0): works offline, but the npm package (2.0.1) is a Node.js build
  (one 15 MB wasm); a browser build has to be compiled with Emscripten with the model embedded as preloaded
  data. See `docs/model.md`.
- MMS-TTS voices (CC BY-NC 4.0): non-commercial, not bundled (see `docs/languages.md`).
- kokoro-js 1.2.1 (Apache-2.0): pulls in transformers.js and its phonemizer has English only. SabiTori runs the
  Kokoro model directly with onnxruntime-web instead.
- Kokoro `onnx/model_q8f16.onnx` (86 MB): returned NaN audio (silence) for a French test sentence in single-thread
  WebAssembly; `model_quantized.onnx` is used (see `voices/kokoro/VOICE.md`).
