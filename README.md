# SabiTori

SabiTori ("understand the story" in Cameroonian Pidgin) explains official messages out loud.
A person photographs or shares a bill, a mobile money SMS, a hospital or school paper, and
SabiTori tells them, in French or English today (other languages as their communities record them):
who sent it, what it is about, what to do, by when, how much, who to call, and whether it looks like a scam.

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
                                                 │   (33M parameters, 36 MB), with keyword rules as the
                                                 │   safety net (speed: see below)
                                                 ├─► scam signals checked (code)
                                                 └─► card built; every fact verified against the text
card ─► spoken from the language pack: Piper neural voice (French today), the phone's offline
        voice (English today), community recordings or community-trained voices (planned)
```

**A small model chooses labels, code finds and verifies facts, and a voice from the community speaks.**
The model decides what kind of message it is, what the person must do and how urgent it is. It never
produces a date, an amount or a phone number: code reads those and every one is checked against the
original text. SabiTori never calls a message safe.

<!-- results:headline -->
On the 96 held-out test messages of our synthetic evaluation set, the on-device model plus rules gets all three
labels right on 88.5% [82.3–94.8] of messages, against 63.5% [54.2–72.9] for keyword rules alone:
higher (p < 0.001). On 100 further messages written to avoid the generator's templates (the unseen
set), it is 77.0% [68.0–85.0] against 47.0% [37.0–57.0]: higher (p < 0.001).
On a second unseen set of 100 messages, written by an independent author after the model was retrained and
evaluated once, it is 82.0% [74.0–89.0] against 49.0% [39.0–59.0]: higher (p < 0.001).
Brackets are 95% bootstrap intervals; p is an exact McNemar test on the same messages. All sets are synthetic and
small, so treat these as development numbers, not field accuracy
([`packages/understand/eval`](packages/understand/eval), generated from `eval/results.json`).
<!-- /results:headline -->

Scam warnings come from code, not from the model: all 22 scam or suspicious messages got a warning on the test
set, 18 of 21 on the first unseen set and 19 of 22 on the second, while 0 of 74, 2 of 79 and 5 of 78 genuine
messages got a false alarm (the rules were tuned on the train split only; the unseen sets, never used for tuning,
are the fairer numbers). For photos, every
fact is checked against the text the phone read, not against the paper itself: on 30 degraded synthetic photos of
bills, letters and SMS screenshots, on-device OCR recovers about five in six of the dates, amounts and phone numbers,
about one in forty facts it reads is wrong, and it gets every fact right on 20 of 30 pages ([`apps/app/test/ocr-bench/RESULTS.md`](apps/app/test/ocr-bench/RESULTS.md)).
That is why each fact on a card can show where it came from, and a card that is unsure falls back to facts only.

No real message has been evaluated yet: there is no pilot and no user so far. Real, consented, anonymised
messages from a first pilot are meant to replace the synthetic sets ([`docs/impact.md`](docs/impact.md)
lists what a pilot would measure).

Speed: the understanding model takes 235 ms median per message in headless Chromium with a 4× CPU throttle,
on the main thread, on a desktop CPU ([`docs/model.md`](docs/model.md)). Phone latency is not yet measured on a phone.

## Languages

Every word SabiTori says comes from a language pack in [`packs/`](packs/). Adding a language is
adding a folder: translations, recorded voice clips and a rules file for numbers and dates. No
code change. Communities build packs with the Recorder app ([`apps/recorder`](apps/recorder)).
See [`packs/README.md`](packs/README.md).

| Pack | Status |
| --- | --- |
| French | Text complete, spoken by the bundled Piper neural voice (phone voice as fallback) |
| English | Text complete, spoken with the phone's offline voice; its Piper voice (63 MB, not bundled) can be delivered once an update server is set up |
| Cameroonian Pidgin, Duala, Ewondo, Adamawa Fulfulde, Lamnso', Limbum, Pinyin | Waiting for native speakers to translate and record; speak their fallback language meanwhile |

Add any language with one command (`node scripts/new-language.mjs`). How languages are recorded,
and when we train our own voices: [`docs/languages.md`](docs/languages.md).

## Repository

| Path | What |
| --- | --- |
| `packages/core` | Contracts, phrase catalog, the pipeline (facts, scam, card, speech plan) |
| `packages/speech` | Language-pack rules, rendering, audio player |
| `packages/understand` | On-device understanding: MiniLM encoder (the only model in store builds), evaluation set and training code; an experimental LLM path (Qwen2.5-1.5B via wllama) exists only in research builds (`VITE_LLM=1`) |
| `packages/connect` | Optional signed-update client and overlay (no message content, ever) |
| `apps/app` | The SabiTori app (React PWA, wrapped for Android with Capacitor; an iOS project exists but is untested, see `docs/ios.md`) |
| `apps/recorder` | Tool for communities to translate and record a language |
| `packs/`, `regions/` | Language and country data |
| `docs/` | Architecture, pack rules, model notes, privacy policy, sustainability and impact plans |
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

iOS (needs a Mac with Xcode 26; not yet tested on any iPhone or simulator, see [docs/ios.md](docs/ios.md)):

```bash
pnpm --filter @sabitori/app build && cd apps/app && npx cap sync ios && npx cap open ios
```

## Accessibility

What is built in, what machines check on every change, and what has not been tested with people yet:
[`docs/accessibility.md`](docs/accessibility.md).

## Check our numbers

Every number to quote, with its conditions, is on one generated page: [`docs/numbers.md`](docs/numbers.md).
Every accuracy number in this repository comes from a script in it, on data in it. To re-run them all and check:

```bash
pnpm install && pnpm reproduce --ocr
```

It regenerates the understanding and scam results in place and says whether they came out byte-identical to the
committed ones (about 1 minute), then re-runs the 30-photo OCR benchmark and compares its accuracy (about 2 minutes
more). `pnpm e2e` (in `apps/app`, needs Chromium) runs the 37 browser tests, accessibility checks included, and
`node apps/app/bench/perf.mjs 4 5` measures the app on a 4x slowed CPU after a build.

## Before a public release

- Confirm official sender names, help lines and balance codes in `regions/CM/region.json`
  (all are marked unverified; SabiTori never vouches for a sender until they are).
- Native review of the French text (`packs/fr/phrases.json`, status `draft`).
- Test on real low-cost Android phones: voices, camera, OCR speed, model speed (nothing has been measured
  on a phone yet).
- Make the repository public, and fill the owner decisions listed in [`docs/OWNER-TODO.md`](docs/OWNER-TODO.md).
- Release signing key for the Play Store build.

## Free, non-commercial, community-owned

SabiTori is free for everyone, with no ads, no paid tier and no sale of data, and it stays that way. Language
packs belong to the communities that record them. How the work is meant to be funded (grants, partner
programmes that fund language recording, community stewardship): [`docs/sustainability.md`](docs/sustainability.md).

## Contributing

Read [`CONTRIBUTING.md`](CONTRIBUTING.md) to set up, run the tests and add a language. Please follow our
[Code of Conduct](CODE_OF_CONDUCT.md). Report security problems privately, as described in
[`SECURITY.md`](SECURITY.md).

## License

- Code: [MPL-2.0](LICENSE).
- Language packs (`packs/`): CC-BY-SA-4.0 by default, and each language community can choose another licence in its
  pack manifest. The French and English packs are CC-BY-4.0. The local-language packs have no licence yet
  (`LicenseRef-community-decides`): their communities will choose one when they record them. See
  [`packs/LICENSE.md`](packs/LICENSE.md).
- Evaluation messages (`packages/understand/eval`): CC-BY-SA-4.0.
- Third-party models, fonts and libraries: see [`THIRD_PARTY_NOTICES.md`](THIRD_PARTY_NOTICES.md).
