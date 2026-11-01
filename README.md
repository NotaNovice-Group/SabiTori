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

```
photo / shared text ─► facts found by code (dates, FCFA amounts, phones, codes)
                    ─► message understood (rules, optional small on-device model)
                    ─► scam signals checked (code)
                    ─► card built; every fact verified against the original text
                    ─► card spoken from the language pack (TTS or community recordings)
```

The AI never produces a fact, and SabiTori never calls a message safe.

## Languages

Every word SabiTori says comes from a language pack in [`packs/`](packs/). Adding a language is
adding a folder: translations, recorded voice clips and a rules file for numbers and dates. No
code change. Communities build packs with the Recorder app ([`apps/recorder`](apps/recorder)).
See [`packs/README.md`](packs/README.md).

| Pack | Status |
| --- | --- |
| French, English | Text complete, spoken with the phone's offline voice |
| Cameroonian Pidgin, Duala, Ewondo, Adamawa Fulfulde, Lamnso', Limbum, Pinyin | Waiting for native speakers to translate and record; speak their fallback language meanwhile |

Add any language with one command (`node scripts/new-language.mjs`). How languages are recorded,
and when we train our own voices: [`docs/languages.md`](docs/languages.md).

## Repository

| Path | What |
| --- | --- |
| `packages/core` | Contracts, phrase catalog, the pipeline (facts, scam, card, speech plan) |
| `packages/speech` | Language-pack rules, rendering, audio player |
| `packages/understand` | Optional on-device classifier (Qwen2.5-1.5B via wllama) |
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
