# Third-party notices

SabiTori's own code is MPL-2.0 (`LICENSE`); language packs are under the licence in each manifest.
This file lists the third-party components that ship inside the app, with their licences. It covers the
on-device voices (Piper) added so far; add a section here whenever you bundle another component.

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
| Piper voice model `fr_FR-siwis-low` | `packs/fr/voice/` | rhasspy/piper-voices at the revision pinned in `scripts/fetch-voices.mjs` | **CC BY 4.0** | https://huggingface.co/rhasspy/piper-voices/tree/main/fr/fr_FR/siwis/low |
| Piper voice model `en_GB-alba-medium` | `packs/en/voice/` | same revision | **CC BY 4.0** | https://huggingface.co/rhasspy/piper-voices/tree/main/en/en_GB/alba/medium |

Piper (https://github.com/rhasspy/piper) is the project that defined the voice model format and trained
these two voices; it is MIT-licensed. SabiTori does not include Piper's own C++ program.

### Voices: sources, attribution, checksums

Each voice has its own record in `packs/<tag>/voice/VOICE.md` (source URL, training data, licence, size,
sha256). Summary:

- **French**: `fr_FR-siwis-low`, trained on the SIWIS French Speech Synthesis Database
  (https://datashare.is.ed.ac.uk/handle/10283/2353), licence CC BY 4.0
  (https://creativecommons.org/licenses/by/4.0/legalcode). Model card: `packs/fr/voice/MODEL_CARD`.
  sha256 of the model `a7b7dcaf87229b32af8275cb1a719371234ea677bc0313d2289d5c50ab0ac53d`.
  Attribution: *French voice: Piper `fr_FR-siwis-low`, trained on the SIWIS French Speech Synthesis Database (University of Edinburgh), CC BY 4.0.*
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

### Considered and not used

- `@mintplex-labs/piper-tts-web` 1.0.5 (MIT): a thin wrapper that downloads voices from Hugging Face, keeps
  them in the browser's OPFS, creates a new espeak-ng instance for every sentence and has no `phoneme_type: "text"` support.
  We use the same two WebAssembly builds directly instead.
- sherpa-onnx WebAssembly TTS (Apache-2.0): works offline, but the npm package (2.0.1) is a Node.js build
  (one 15 MB wasm); a browser build has to be compiled with Emscripten with the model embedded as preloaded
  data. See `docs/model.md`.
- MMS-TTS voices (CC BY-NC 4.0): non-commercial, not bundled (see `docs/languages.md`).
