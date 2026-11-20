# Changelog

All notable changes to SabiTori are listed here. The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and the version numbers follow [Semantic Versioning](https://semver.org/).

## [Unreleased]

### Added

- Community service retention and deletion: reports, teachings and recordings are deleted after 90 days (daily
  cron); "Delete everything I sent" in Settings deletes them sooner with a per-item secret only the phone keeps (the
  service stores its hash); or by email to legal@usesabitori.com. Migration `0002_retention_and_deletion.sql`.
- Instant scam alerts (opt-in, push builds): Firebase Cloud Messaging by region and language topic; no token until
  switched on, deleted when switched off. `scripts/push-alert.mjs` sends an alert.
- Scam alerts: short warnings published with a signed update reach phones that turned updates on, as a notification
  and on the Scams screen; no link, number or code allowed in an alert. The relay phone shows its status as a notification.
- Relay build (`scripts/build-relay.sh`): an Android phone with a local SIM answers SMS forwarded to it with the
  card, made on the phone, offline. The only build with SMS permissions; never in a store.
- Design and prototype for phones with no internet (`docs/sms-ussd.md`, `packages/gateway`): forward an SMS and get
  the card back by SMS; a USSD menu. Not deployed.
- Retrain of the understanding heads on 453 messages (224 plus 229 hand-written ones in `eval/train-extra.jsonl`),
  classifier `minilm-l12-int8@3`, and a second unseen set (`eval/unseen2.jsonl`, 100 messages by an independent author,
  labels reviewed before evaluation, evaluated once). All three labels right: 51.0% [41.0–61.0] on the second unseen
  set (rules alone 44.0%, not significantly different) and 51.0% on the first (was 49.0%). The retrain did not raise the
  headline number; `eval/README.md` says what was done and why the new heads ship anyway.
- "Read my next SMS" on the home screen (Android app): after one tap the app waits up to five minutes for the next
  incoming SMS, Android asks the person to allow that one message, and it opens ready to be explained. Uses the SMS
  User Consent API: no SMS permission, no inbox access, the text stays on the phone. Play services only offers a
  message that holds a 4 to 10 character code with a digit, from a sender who is not a saved contact, so a message
  already in the inbox still goes through Share. Not available on iOS or on phones without Google Play services.
  Compiles and is unit-tested; **not yet tried on a real phone**.
- New mark: a talking drum, in the app, the launcher icons, the site and the store graphics (`DESIGN.md`).
- Landing page in `site/` (static), ready for Cloudflare Pages (`docs/site.md`).
- Picture card for people who cannot read and cannot hear: the action, the deadline (calendar page, days left) and
  the amount (CFA notes and coins) as pictures; a scam card shows a stop sign only. A likely scam vibrates the phone.
- Probe 14 scam signals (French and English; both phrases are drafts until reviewed): `offer_fee` (likely scam) for a
  job, concours place, scholarship, visa or loan "granted" for a fee paid to a personal number ("Recrutement armée ...
  Contactez le 655..., prévoir 150 000 FCFA pour garantir votre place"); `distress_money` (a caution on its own) for an
  accident, arrest or stranded-abroad story that asks for money from a mobile number. A code "sent by mistake" and asked
  back in the next sentence, and "the code you will receive", now count as asking for the secret code.
- iOS project (`apps/app/ios`, Capacitor 8, Swift Package Manager) and a CI workflow that does an unsigned iOS
  simulator build. Not yet run on an iPhone or a simulator; the share sheet and the project's own Android plugin have
  no iOS version (see `docs/ios.md`). Reminders skip the Android-only notification channel on iOS.
- A one-minute demo video can be re-recorded from the code (`apps/app/bench/demo/record.mjs`): the real app, scripted,
  with captions and spoken words as subtitles.
- Scam signal `promised_return`: "Investissez 50 000 FCFA et recevez 200 000 FCFA dans 7 jours", "double your
  money", "guaranteed profit" now warn as likely scam (French and English; phrase is a draft until reviewed).
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

- Privacy policy (en, fr): instant alerts, scam reports and teachings, the microphone (Teach) and the full permission list.
- Scams written in SMS shorthand ("stp envoi 15 000f sur ce num", "snd me 10 000 for dis numba") now warn; a number
  grouped in thousands right after "send/envoie" is read as money even without "FCFA".
- A moved appointment written "initialement le 20/11, il est fixé au 27/11" or "now set for 4 December" shows the new date.
- "Avant fin novembre" / "by the end of November" is read as a deadline on the last day of that month.
- "5 mille", "30 mille FCFA" are read as amounts (5 000, 30 000 FCFA), the way people write them in an SMS.
- "Must be paid by" / "doit être payée avant" are read as a payment; a fine that is only a consequence ("late
  registration attracts a fine of 10,000 FCFA") is no longer shown as the amount to pay.
- "Amenez vos enfants au centre de santé" and "Présence des parents obligatoire" are read as "go there"; a near start
  date ("disponible à partir du 25 novembre") no longer makes a card urgent.
- In the message list a likely scam shows a stop sign and no amount or date, so it never reads like a bill to pay.
- Android: the VIBRATE permission is declared so the scam warning vibration works in the app (privacy policy updated).
- While a card is being prepared, its shape is shown instead of an empty page with only "Delete".
- New look: warm paper and ink, a deep green for what to do, saffron for listening, a picture tile for every kind of
  card section, softer shapes. Words are no longer split with hyphens.
- "Envoyez votre CV au 677..." next to a salary is no longer read as sending money to a personal number, and an
  operator's warning about the "code sent by mistake" trick ("... never do it") is no longer flagged.
- "Send 20,000 FCFA to this number" / "Envoie-moi 15 000 sur ce numéro" from a mobile number now warns (likely scam):
  the number to pay is the sender's own even when it is not written out.
- A mobile-money "you sent" receipt no longer gets a "call this number" caution because of the number of the person
  paid ("Vous avez envoyé 41 100 FCFA à SAMUEL FOTSO (677465100)").
- Photos: a month name the OCR garbled ("27 noveribwe 2026", "18 Decernber 2026") is read when it sits between a day
  and a year and is clearly one month. Fact recall on the 30 benchmark photos 83.6% -> 84.3%, precision unchanged.
- A school-fee notice's annual total ("Total annuel", "annual total") is no longer shown as the amount to
  pay when an instalment is due; with only the total legible, the card shows no amount rather than the wrong one.
- When SabiTori is not sure what a message asks (facts-only card), it says "Do it by {date}" only if the message itself
  says "before" / "avant le"; otherwise "It is on {date}".
- "Free" government aid or scholarships that ask for a fee are now warned as likely scams.
- Scam checks catch "my phone is broken, send money quickly", advance-fee ("millions to send you ... small fee")
  and credential phishing ("entrez vos identifiants"). Unseen set: 18 of 21 scams warned (was 17), false alarms unchanged.
- A one-time code that says when it expires ("Il expire dans 5 minutes") no longer gets a caution.
- A short bill ("Facture 15 000 FCFA avant le ...") gives a full card; "call me back urgently" from an unknown
  number now gets a warning.
- A moved appointment ("reporté au 27/11", "moved to 25 November") now gives the new date and time, not the old one.
- A late fee or penalty written next to the deadline is no longer shown as the amount to pay (the bill is), and
  "Frais: 1ère tranche" no longer reads an amount of 1.
- A date that is a start ("collect your slip from Monday 23rd", "à partir du 23/11") is said "From {date}", not
  "Do it by {date}".
- 12-hour times ("at 3pm") are read; a notice that asks for nothing (a planned water cut) says "It is on {date}"
  instead of "Do it by {date}".
- A court summons ("cité à comparaître à l'audience du ... à 8h30") now says when to be there.
- Reading: collecting a document ("retrait au bureau") is no longer mobile money, a CNPS pension is no longer school
  fees, and planned power interruptions ask for nothing. Unseen set, all three right: 47% -> 49%.
- A sender shown as a name but not on the official list ("Hôpital Régional") is now said as a claim: "This message
  says it is from Hôpital Régional" (it was "We do not know who sent this message"). Numbers stay unknown.
- The card shows an appointment's time next to its date ("dimanche 22 novembre, 09:00"), not only in speech.
- "Remind me" on an appointment with a time: the reminder comes two hours before it, and the calendar file is a
  timed event (it was all day, and an early appointment's 08:00 reminder could come too late).
- Appointment cards say the time written after the date ("Présentez-vous le vingt-deux novembre à neuf heures").
- Cards for appointments, convocations and hearings now say "Be there on {date}" instead of "Do it by {date}".
- Model thresholds re-chosen on the train split after the reading-word changes, as the evaluation method requires:
  action 0.6 -> 0.75. All three labels right: 75.0% on test (was 77.1%), 47.0% on the unseen set (unchanged).
- Facts: dates and amounts where OCR read 0 as O or 1 as l ("2O26", "59 O00 FCFA", "22/lO/2026") are read, only
  where the number is not in doubt; the card still shows the original characters.
- Reading: receipts and greetings are now "nothing to do", and "send 30 000 FCFA to ..." or "rembourser" are
  "pay". All three labels right on the unseen set: 44% -> 47% (encoder + rules).
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
  becomes a card faster on a 4x-throttled CPU: 2.6 times on one test machine, about a quarter on another
  (docs/model.md, "App start and card time").
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

### Fixed

- With the phone's storage full and no network, a scam report or teaching (with its recording) was lost but shown as sent; now an error, and the form keeps it for another try.
- The privacy policy on the website lagged the one in `docs/` (community reports, push alerts, 90-day retention); now regenerated and checked in CI.
- A scam report or teaching sent while an earlier one was still sending was lost and shown as sent.

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
