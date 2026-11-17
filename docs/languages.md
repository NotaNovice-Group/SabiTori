# Adding Cameroonian languages

SabiTori is built so that any of Cameroon's languages can be added as data, without changing
code. This page explains how, what it takes, and when we plan to train our own voices.

## What a language needs

Official messages mostly arrive in French or English, so a language mainly has to *speak* the card.
The exception is Cameroonian Pidgin, which people also write in (SMS, WhatsApp): a language that is
written in messages can also get a reading lexicon, written and checked by speakers
([`reading-lexicon.md`](reading-lexicon.md)). So a language needs:

| Part | What it is | Who makes it |
| --- | --- | --- |
| Phrases | About 70 short sentences ("You must pay.", "Do it by {date}.") | Two native speakers, with the Recorder app |
| Number and date words | About 60 recorded words (numbers, months, "francs CFA") plus rules for how they combine | Same speakers, guided by the Recorder app |
| A voice | Either those recordings, or a trained voice (below) | Speakers record; we train later |

A new language can start before any model is trained for it: the on-device models that read and
understand the message work the same whatever language the card is spoken in. A language is usable as
soon as its phrases and number words are recorded and checked by a second speaker; its own neural
voice follows once there are enough recordings (Phase 2 below).

## Start a language (5 minutes)

```bash
node scripts/new-language.mjs --tag lmp --name "Limbum" --fallback wes,en,fr
```

The tag is the language's ISO 639-3 code (look it up at https://iso639-3.sil.org; never invent
one). The language appears in the app straight away, speaking its fallback language and saying so,
until it is recorded. Languages started so far:

| Language | Code | Region | Status |
| --- | --- | --- | --- |
| Cameroonian Pidgin | `wes` | Nationwide | Waiting for speakers |
| Duala | `dua` | Littoral | Waiting for speakers |
| Ewondo | `ewo` | Centre | Waiting for speakers |
| Adamawa Fulfulde | `fub` | North, Adamawa | Waiting for speakers |
| Lamnso' | `lns` | Northwest | Waiting for speakers |
| Limbum | `lmp` | Northwest | Waiting for speakers |
| Pinyin | `pny` | Northwest | Waiting for speakers |

## Record a language (2–4 days per language)

1. Find two native speakers who read their language's standard spelling. Language committees,
   literacy programmes and Bible translation teams are the best places to ask: they already have
   trained readers and agreed spelling for many Cameroonian languages.
2. Each speaker gives written consent and chooses how their voice may be reused (the Recorder
   app explains the licences in plain words). The Recorder keeps two separate consents per speaker:
   to be named as a contributor, and to have their voice published in the pack, with the date it was
   given; a clip whose speaker has not agreed to publication is not exported. Speakers are paid for
   every session.
3. Speaker A translates and records with the Recorder app (`apps/recorder`). The app has a
   keyboard for the letters of the General Alphabet of Cameroonian Languages (ɓ ɗ ŋ ɛ ɔ ə ʉ ʼ)
   and tone marks.
4. Speaker A writes the number words and the rules for combining them. Many Cameroonian languages
   count differently depending on what is counted: the rules file can hold a separate number set for
   money, for days of the month and for years, bound forms (a number followed by more number words)
   and plural forms, each with its own recording when it sounds different, plus per-number
   exceptions (docs/pack-rules.md). It does not choose words by the class of an arbitrary counted
   noun: phrases that count a noun are recorded whole, in the agreement the speaker uses.
5. Speaker B listens to every sentence and marks it reviewed or sends it back.
6. Export the zip from the Recorder (a pack export, not a "working copy": working notes,
   `recorder-notes.json`, are off by default, are only for continuing work, and must never be put in
   `packs/` or shipped), drop it into `packs/<tag>/`, run
   `node scripts/check-packs.mjs`, and ship it in the next app release. Once an update server is
   set up, a pack can also be delivered as a signed update (docs/updates.md) without a new app
   release; no update server exists yet.

Effort: about 3–4 hours of recording per speaker plus review, so 2–4 days per language including
translation. The cost is mostly fair pay for the speakers (see `docs/sustainability.md` for how this
is meant to be funded; no language has been recorded yet).

## Do we train our own models?

Not to start, yes later, and only for voices.

**Phase 1: recordings (first; not started for any language yet).** Every sentence is a real person's voice. Nothing can be
mispronounced or invented, it works for every language, and the community owns the recordings.
Limits: only the sentences in the catalog can be said, and names of senders are read in French or
English.

**Phase 2: a voice trained on the community's recordings (planned for the first year; not built yet).**
The plan: once a language has about 1–2 hours of clean recordings (the phrase recordings plus extra
reading sessions), fine-tune a small open text-to-speech model (Piper, about 20–60 MB, runs offline on
cheap phones) on them, so the voice can say any sentence in that language, still in the speaker's voice.
The community owns the dataset and the trained voice and decides its licence. Fine-tuning Piper on
1–2 hours of speech is reported to work, but it is untested here: this repository has no training
script for voices yet. We expect a few hours on one rented GPU per language; the real work is collecting
good recordings.

*The runtime for this already exists.* SabiTori runs Piper models on the phone today (French and
English use open Piper voices; see `docs/model.md`, "Voices"). To ship a community voice:

1. Train or fine-tune a Piper model on the recordings. If espeak-ng has no support for the language,
   train it with `"phoneme_type": "text"` (the model reads the letters directly; no phonemizer, no GPL
   component). Export `<id>.onnx` and `<id>.onnx.json`.
2. Put both files in `packs/<tag>/voice/`, write `packs/<tag>/voice/VOICE.md` (speakers, consent, licence the
   community chose, sha256) and add the voice to `THIRD_PARTY_NOTICES.md`.
3. In `packs/<tag>/manifest.json` set `"voice": { "kind": "tts", "engine": "piper", "bcp47": "<tag>", "voiceHint": "<id>" }`.

No app code changes. A pack with a Piper voice is a `tts` pack (`voice.kind` is either `tts` or `recorded`,
not both), so switching a language from recordings to a trained voice means its manifest changes
from `recorded` to this. If the model cannot load or is too slow on a phone, the phone's own voice
speaks instead.

**Optional shortcut: existing open voices.** Meta's MMS project published synthetic voices for
about 1,100 languages, including Lamnso' (`lns`), Pinyin (`pny`) and Basaa (`bss`); we could not
confirm Limbum. They are licensed **non-commercial only** (CC-BY-NC-4.0), sound mechanical, and
were trained on Bible readings rather than everyday speech. They could help a first test or serve as
a starting point that native speakers check, but they cannot be SabiTori's long-term voices: a
non-commercial licence would stop the packs from being as freely reusable as the rest of the project
(packs are CC-BY-SA-4.0 by default, so anyone, including partner organisations and other projects, may
reuse them). SabiTori itself is free and non-commercial; see `docs/sustainability.md`.

**Reading messages written in local languages.** Official messages are in French or English, but SMS
between people are often in Cameroonian Pidgin. The on-device MiniLM encoder is multilingual, so we
plan to retrain its small classification heads once consented Pidgin messages exist (none have been
collected yet)
([`packages/understand/train`](../packages/understand/train)). Facts are still found by code, never by a model.

**Later: voice commands in local languages.** Small keyword-spotting models trained on the
community's own recordings of the few commands ("Again", "Call", "Help"), again owned by the
community.

## Orthography and fonts

The app's typeface, Andika (SIL), supports the African letters and tone marks used in Cameroonian
languages. Speakers type in their language's official spelling; where a language has no settled
spelling, the recording is what matters and the text is only a guide for reviewers.
