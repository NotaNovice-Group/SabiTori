# SabiTori

SabiTori ("understand the story" in Cameroonian Pidgin) explains official messages out loud.
A person photographs or shares a bill, a mobile money SMS, a hospital or school paper, and
SabiTori tells them, in their own language: who sent it, what it is about, what to do, by when,
how much, who to call, and whether it looks like a scam.

It is built for people with disabilities and people who cannot read French or English, on
low-cost Android phones, and it works fully offline. Your messages never leave this phone. If you
switch them on, SabiTori can download updates and send error reports, never your messages. Both are
off by default and only exist in a build that has been given an update address or an error-report
address ([`docs/updates.md`](docs/updates.md)).

## How it works

Small neural models run on the phone, and none of them needs the internet: text recognition for photos, an
understanding model for every message, and a neural voice:

```
photo ─► OCR (Tesseract LSTM, French + English) ─┐
shared text ─────────────────────────────────────┤
                                                 ├─► facts found by code (dates, FCFA, phones, codes)
                                                 ├─► message understood: multilingual MiniLM encoder
                                                 │   (33M parameters, 36 MB; ~0.25 s per message at 4x CPU throttling,
                                                 │   phone measurements pending)
                                                 │   with keyword rules as the safety net
                                                 ├─► scam signals checked (code)
                                                 └─► card built; every fact verified against the text
card ─► spoken from the language pack: Piper neural voice (French, English, and community-trained
        voices later) or community recordings
```

**A small model chooses labels, code finds and verifies facts, and a voice from the community speaks.**
The model decides what kind of message it is, what the person must do and how urgent it is. It never
produces a date, an amount or a phone number: code reads those and every one is checked against the
original text. SabiTori never calls a message safe.

On our evaluation set, the on-device model plus rules gets all three labels right on about 70% of held-out
messages, against 44% for keyword rules alone
([`packages/understand/eval`](packages/understand/eval)). The set is synthetic for now; real,
consented messages from the pilot will replace it.

## Languages

Every word SabiTori says comes from a language pack in [`packs/`](packs/). Adding a language is
adding a folder: translations, recorded voice clips and a rules file for numbers and dates. No
code change. Communities build packs with the Recorder app ([`apps/recorder`](apps/recorder)).
See [`packs/README.md`](packs/README.md).

| Pack | Status |
| --- | --- |
| French | Text complete, spoken by the bundled Piper neural voice (phone voice as fallback) |
| English | Text complete, spoken with the phone's offline voice; its Piper voice is delivered by signed update |
| Cameroonian Pidgin, Duala, Ewondo, Adamawa Fulfulde, Lamnso', Limbum, Pinyin | Waiting for native speakers to translate and record; speak their fallback language meanwhile |

Add any language with one command (`node scripts/new-language.mjs`). How languages are recorded,
and when we train our own voices: [`docs/languages.md`](docs/languages.md).

## Repository

| Path | What |
| --- | --- |
| `packages/core` | Contracts, phrase catalog, the pipeline (facts, scam, card, speech plan) |
| `packages/speech` | Language-pack rules, rendering, audio player |
| `packages/understand` | On-device understanding: MiniLM encoder (default), optional Qwen2.5-1.5B second opinion, evaluation set and training code |
| `packages/connect` | Optional signed-update client and overlay (no message content, ever) |
| `apps/app` | The SabiTori app (React PWA, wrapped for Android with Capacitor) |
| `apps/recorder` | Tool for communities to translate and record a language |
| `packs/`, `regions/` | Language and country data |
| `docs/` | Architecture, pack rules, model notes |
| `DESIGN.md` | Design system |

## Develop

Node 22 and pnpm 10.

```bash
pnpm install
```

```bash
pnpm test
```

```bash
pnpm dev
```

Android APK (needs the Android SDK, platform 36):

```bash
pnpm --filter @sabitori/app build && cd apps/app && npx cap sync android && cd android && ./gradlew assembleDebug
```

## Before a public release

- Confirm official sender names, help lines and balance codes in `regions/CM/region.json`
  (all are marked unverified; SabiTori never vouches for a sender until they are).
- Native review of the French text (`packs/fr/phrases.json`, status `draft`).
- Test on real low-cost Android phones: voices, camera, OCR speed, model speed.
- Release signing key for the Play Store build.

## Contributing

Read [`CONTRIBUTING.md`](CONTRIBUTING.md) to set up, run the tests and add a language. Please follow our
[Code of Conduct](CODE_OF_CONDUCT.md). Report security problems privately, as described in
[`SECURITY.md`](SECURITY.md).

## License

- Code: [MPL-2.0](LICENSE).
- Language packs (`packs/`): CC-BY-SA-4.0 by default. A language community can choose another licence in
  its pack manifest. See [`packs/LICENSE.md`](packs/LICENSE.md).
- Third-party models, fonts and libraries: see [`THIRD_PARTY_NOTICES.md`](THIRD_PARTY_NOTICES.md).
