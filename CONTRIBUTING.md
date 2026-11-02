# Contributing to SabiTori

Thank you for wanting to help. SabiTori is for people who cannot read the official paper in front of
them, so every change should be easy to check and easy to say out loud.

## Set up

You need Node 22 and pnpm 10.

```bash
pnpm install
pnpm test                       # vitest, in every package
pnpm typecheck
node scripts/check-packs.mjs    # format and completeness of the language packs
```

`pnpm dev` runs the app. `pnpm dev:recorder` runs the Recorder, the tool that speakers use to record
a language. The Android build is in the README under "Develop".

## Rules we do not bend

These come from [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md).

- **No language or country words in code.** Words go in `packs/<tag>/` and `regions/`.
- **Facts come from code only.** The AI never produces a fact. The card builder rejects any fact
  without a source span in the original text.
- **Never call a message safe.** The most SabiTori says is "no warning signs found".
- **Message text never leaves the phone.** Photos and messages stay on the device in every mode.
  The optional network features are off by default ([`docs/updates.md`](docs/updates.md)).

## Add a language

Read [`docs/languages.md`](docs/languages.md) first. Then start with one command:

```bash
node scripts/new-language.mjs --tag <ISO 639-3 code> --name "Language name"
```

Use the language's ISO 639-3 code, and never invent one. Speakers record with the Recorder app
([`apps/recorder`](apps/recorder)). The pack format is in [`packs/README.md`](packs/README.md) and
[`docs/pack-rules.md`](docs/pack-rules.md).

## Speakers are credited and paid

- A speaker or translator is named in `contributors` only after they agree in writing. Their voice
  is published only with that consent. They can ask for their recordings to be removed at any time.
- Speakers are paid for every session. Most of what a language costs is fair pay for the people
  who record it, so please budget for it.
- Pack content is CC-BY-SA-4.0 unless the community picks another licence. See
  [`packs/LICENSE.md`](packs/LICENSE.md).

## Pull request checklist

- [ ] `pnpm test`, `pnpm typecheck` and `node scripts/check-packs.mjs` pass.
- [ ] No language or country words added to code.
- [ ] Every new fact comes from code, with a source span. No AI-made facts.
- [ ] No new network call, and no message or photo data leaves the phone.
- [ ] No wording says a message is safe.
- [ ] For language packs: consent is in place, and `license` and `status` are set.
- [ ] Docs are updated if behaviour changed.

## Licence of your contribution

Code you contribute is released under the [MPL-2.0](LICENSE). Language content is released under
the licence of its pack (see [`packs/LICENSE.md`](packs/LICENSE.md)). You do not need to sign off
your commits.

## Be kind, and report security problems privately

Please follow our [Code of Conduct](CODE_OF_CONDUCT.md). For a security problem, do not open a
public issue. See [`SECURITY.md`](SECURITY.md).
