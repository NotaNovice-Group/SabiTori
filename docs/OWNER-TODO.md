# Owner checklist

Every `[OWNER: ...]` placeholder in the repository, with its file and line. Only the founder can fill these:
they are decisions, facts about the publisher, or results of steps outside the code. A reviewer who sees one
reads "unfinished", so fill or remove them before the repository is public. `packages/understand/test/model-card.test.ts`
checks that this list matches the files (regenerate it with `node scripts/owner-todo.mjs` after editing a document).

Total: 45 placeholders in 14 files.

## `CHANGELOG.md` (3)

- [ ] `CHANGELOG.md:164` release date, once released.
- [ ] `CHANGELOG.md:195` French review status; resolve before release.
- [ ] `CHANGELOG.md:196` official numbers verification in `regions/CM/region.json`; remove this note once every entry is verified.

## `CODE_OF_CONDUCT.md` (1)

- [ ] `CODE_OF_CONDUCT.md:39` contact email

## `SECURITY.md` (3)

- [ ] `SECURITY.md:6` security contact email
- [ ] `SECURITY.md:34` acknowledgement time, for example 3 working days
- [ ] `SECURITY.md:35` assessment time

## `docs/accessibility.md` (1)

- [ ] `docs/accessibility.md:45` name the disability organisation that will run or review these sessions, once one has agreed.

## `docs/impact.md` (1)

- [ ] `docs/impact.md:54` pilot partner, place and dates, once agreed

## `docs/ios.md` (2)

- [ ] `docs/ios.md:20` iOS app icon (1024 px) and launch screen
- [ ] `docs/ios.md:84` Apple developer account

## `docs/release.md` (16)

- [ ] `docs/release.md:3` ...
- [ ] `docs/release.md:15` ...
- [ ] `docs/release.md:27` whether a separate English review is required, or it is covered by the same check.
- [ ] `docs/release.md:32` device list.
- [ ] `docs/release.md:44` ...
- [ ] `docs/release.md:52` ...
- [ ] `docs/release.md:65` publisher — individual founder or charitable vehicle
- [ ] `docs/release.md:65` Play Console account type, and whether its verification is complete.
- [ ] `docs/release.md:66` default language.
- [ ] `docs/release.md:70` confirm
- [ ] `docs/release.md:70` target audience and age policy, content-rating questionnaire result, and each answer checked against the current Play policy.
- [ ] `docs/release.md:72` the testing requirement that applies to this account on the day you submit.
- [ ] `docs/release.md:90` the current upload-key reset process in the Play Console help.
- [ ] `docs/release.md:116` whether CI uploads to Play, or the AAB is uploaded by hand.
- [ ] `docs/release.md:145` Sentry organisation and project names.
- [ ] `docs/release.md:178` testing period.

## `docs/sms-ussd.md` (4)

- [ ] `docs/sms-ussd.md:84` legal review of that section
- [ ] `docs/sms-ussd.md:113` a partner organisation in one town to host a relay phone (route A) and tell people the number
- [ ] `docs/sms-ussd.md:114` talks with MTN Cameroon, Orange Cameroun and Camtel for a toll-free short code and a USSD code (routes B, C)
- [ ] `docs/sms-ussd.md:115` budget for the relay SIM's SMS bundle (NotaNovice pays the replies for now)

## `docs/store/data-safety.md` (1)

- [ ] `docs/store/data-safety.md:3` ...

## `docs/store/listing.en.md` (1)

- [ ] `docs/store/listing.en.md:3` ...

## `docs/store/listing.fr.md` (1)

- [ ] `docs/store/listing.fr.md:3` ...

## `docs/sustainability.md` (8)

- [ ] `docs/sustainability.md:23` pay rate per speaker per session, and total per language
- [ ] `docs/sustainability.md:24` estimate for extra recording sessions and GPU rental
- [ ] `docs/sustainability.md:25` estimate
- [ ] `docs/sustainability.md:27` hosting estimate, if an update server is run
- [ ] `docs/sustainability.md:28` maintainer time
- [ ] `docs/sustainability.md:46` publisher — individual founder or charitable vehicle
- [ ] `docs/sustainability.md:57` publisher — individual founder or charitable vehicle
- [ ] `docs/sustainability.md:58` first partner, once agreed in writing.

## `docs/updates.md` (1)

- [ ] `docs/updates.md:168` Firebase project, google-services.json, service account; APNs key for iPhone

## `docs/video-script.md` (2)

- [ ] `docs/video-script.md:24` one or two sentences: who you are, the person you saw struggle with an official message, why it matters to you
- [ ] `docs/video-script.md:31` what you ask for: the pilot, the partner, the first Cameroonian language.

## Checks without a placeholder

- [ ] Have a native speaker of Cameroonian Pidgin confirm the gloss of the name "SabiTori" in `README.md` line 3.
- [ ] Choose the applicant and publisher: an individual founder, a charitable vehicle (gUG or e.V.) or a fiscal sponsor; then replace every "publisher" placeholder above with the same name.
- [ ] Make the repository public (the GPL written offer in `THIRD_PARTY_NOTICES.md` points to it).
- [ ] Measure OCR, model and voice speed on at least two real low-cost Android phones, and replace "not yet measured on a phone" in `README.md` and `docs/model.md` with the measurements and the phone models.
- [ ] Verify the official senders in `regions/CM/region.json`; review `packs/fr/phrases.json` with a native French speaker.
