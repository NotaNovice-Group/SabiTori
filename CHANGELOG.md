# Changelog

All notable changes to SabiTori are listed here. The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and the version numbers follow [Semantic Versioning](https://semver.org/).

## [Unreleased]

### Added

- Evaluation on real messages, ready for the pilot: a first-pass anonymiser for consented messages
  (`packages/understand/eval/anonymise.ts`) and `run-rules.mjs --split=real`. No real message has been added yet.
- Accessibility checks in the browser tests: axe-core (WCAG 2.1 A and AA, contrast included) on eight screens in the
  light and dark theme, and 200% text on a 320 px screen with no sideways scrolling.
- CI builds a pilot APK (`sabitori-pilot-apk`, debug-signed) on every push to `main`.
- A guide for speakers who write a reading word list for their language (`docs/reading-lexicon.md`); the rules
  evaluation can measure a draft list (`--packs`, `--lang`) without changing the published results.
- Voice training recipe (`packages/speech/train-voice/`): a Recorder export becomes a Piper training list
  (needs the community's agreement for an unlicensed pack), and a check says whether the app can use a trained
  voice for a pack. No trained local-language voice exists yet.
- Pilot builds (`VITE_PILOT=1`): on-phone weekly counts of messages explained, scam warnings, listens and reminders,
  shown in Settings and shared only by the participant. No message content is kept. Store builds have no counter.
- Pilot builds also count how long the phone took (photo to card, text to card, Listen to first sound) in time
  bands, for the pilot's phone-performance measure. Only band counts are kept, never the times.

### Changed

- Scam checks: a utility's own switchboard number, a school closing for a holiday and real exam results no longer
  raise a warning; a message from a mobile number that opens with a bank's short name ("SGC: ...") now does.
- Photos: ruled tables (school-fee notices, bills) are read again. Table lines are erased before OCR, which lifts
  the facts recovered on the benchmark photos from 75% to 84% (school notices from 33% to 64%) with no type worse.
- Store builds no longer include the optional LLM (Qwen2.5 via wllama): it is only in research builds
  (`VITE_LLM=1`), and the APK is about 8.7 MB smaller.
- About screen: long links and file names in the licence text wrap at 200% text instead of scrolling sideways.
- Recorder: a recording interrupted by a call, another app, leaving the page, or running past 30 seconds now
  stops, keeps what was recorded and says why, instead of staying on "saving".
- Faster first card: word-list matching skips words that are not in the message, so the first pasted bill
  becomes a card about 2.6 times faster on a 4x-throttled CPU (docs/model.md, "App start and card time").
- Scam checks: a message that delivers a one-time code ("Your confirmation code is 482913") is no longer read as
  asking for the code; requests for a code are still caught.
- Rules: a dated task within 7 days is now `urgent` (was 2 days), matching the card's calibration and the evaluation
  labels; more French and English action phrases (fees, collection, invitations, replies to scams, information
  notices); a message that asks for nothing is never `soon` or `urgent`. Rules alone, all three labels right: test 44.8% -> 51.0%, unseen 25.0% -> 30.0%; with the encoder: test
  69.8% -> 75.0%, unseen 41.0% -> 44.0% (`packages/understand/eval/results.json`), after re-selecting the encoder
  thresholds on the train split (kind 0.85, action 0.6, urgency 0.85; were 0.85, 0.4, 0.6). With the old thresholds the
  unseen figure was 46.0%; it was not used to choose.
- Amounts written with an all-zero minor unit ("18 450,00 FCFA") are read; real decimals are still refused.
- Understanding model: the vocabulary of the bundled MiniLM encoder is now chosen with a general French and English
  word-frequency list instead of Unigram scores. Same size (34.2 MB); much higher fidelity to the original model on
  held-out text; accuracy changes are not statistically significant. The fidelity check now uses held-out text only.
- Evaluation: a second, independent evaluation set (`packages/understand/eval/unseen.jsonl`, 100 messages written to
  avoid the generator's templates); 95% bootstrap intervals, paired McNemar tests, per-language rows and calibration
  in every published table; one machine-readable source of truth (`eval/results.json`) from which the README, docs and
  model card tables are generated and checked by a test. Machine-specific latency removed from the results; the
  latency harness is committed (`packages/understand/harness/encoder-bench.mjs`).
- Dataset labels: genuine operator promotions are labelled `telecom`/`nothing`/`info`, and the Pidgin MTN prize-fee scam
  `telecom` (see `packages/understand/eval/README.md`). The test split is now 96 messages.
- `packages/speech/bench/run.mjs` exits with an error when any voice fallback happens during a benchmark.
- Documentation: publisher placeholder instead of a company name, non-commercial sustainability plan
  (`docs/sustainability.md`), pilot metrics (`docs/impact.md`), owner checklist (`docs/OWNER-TODO.md`).

## [1.0.0] - [YYYY-MM-DD]

Planned first public release on Google Play. Not released yet: there is no published build, no store listing
and no users. [OWNER: release date, once released.]

### Added

- Explains official messages out loud, in the person's language: bills, mobile money SMS, hospital, school and administrative papers.
- Takes a photo of a paper with the phone's camera app, or reads text the person shares with the app.
- Finds the facts in a message with code: dates, FCFA amounts, phone numbers, USSD codes and links. Each fact is checked against the original text.
- Warns about likely scams. The app never says that a message is safe.
- Speaks French with a bundled Piper neural voice that runs on the phone (the phone's offline voice is the automatic fallback). English uses the phone's offline voice; an English Piper voice (63 MB) is not bundled and can be delivered once an update server is set up. Speaking speed can be changed.
- Understands every message on the phone with a small bundled neural model (multilingual MiniLM encoder, 33M parameters, int8), combined with keyword rules. It only chooses labels; facts come from code.
- Reads photos of papers on the phone with Tesseract OCR (French and English).
- Works fully offline. Reading, speaking and checks run on the phone.
- Language folders for Cameroonian Pidgin, Duala, Ewondo, Adamawa Fulfulde, Lamnso', Limbum and Pinyin, waiting for native speakers to translate and record them. Until then they speak their fallback language.
- Deadline reminders: "Remind me" schedules notifications on Android, the day before at 09:00 and on the day at 08:00. The web version saves a calendar file (`.ics`) instead.
- Share a message or a photo to SabiTori from another app.
- Practice message, to try the app without a real paper.
- History of cards on the phone, kept for 30 days by default. The person can choose 7 days or keep nothing.
- Optional signed updates (off by default, and only in a build given an update address; no update server is set up yet). Once one is, they can deliver new languages, voices, scam warnings and official numbers. Each file is checked with a signature and a checksum before use.
- Optional error reports (off by default). They are sent to Sentry, scrubbed on the phone, and contain no messages, numbers, amounts, dates, phone numbers or device model.
- "Delete downloaded updates" in Settings.

### Privacy and security

- No accounts, no ads, no analytics and no sale of data.
- Messages and photos never leave the phone.
- Android permissions: internet access (only for the two optional features), camera (only when the person taps the camera button), notifications (only when the person taps "Remind me"), and two that come with the notification component so that reminders survive a restart: receive boot completed and wake lock.
- HTTPS only. Cleartext traffic is not allowed.
- Privacy policy in English and French: `docs/privacy.md` and `docs/privacy.fr.md`.

### Notes

- French and English texts are complete. The French text is awaiting review by a native speaker. [OWNER: French review status; resolve before release.]
- Some official sender names and help numbers are still being verified. [OWNER: official numbers verification in `regions/CM/region.json`; remove this note once every entry is verified.]
