# Impact: what a pilot will measure

There has been no pilot yet, so there are no results on this page. It lists what we intend to measure
in the first pilot and how, so the numbers can be checked later. Nothing here may be filled in with an
estimate: a cell stays empty until it is measured.

## Principles

- **Nothing leaves the phone by default.** The app has no analytics. Pilot numbers come from what
  participants choose to tell us (interviews, a short questionnaire, a supervised session), or from a
  pilot build that counts events **on the phone** and shows them to the participant, who decides whether
  to share them. Message text is never collected for these metrics.
- **Consent first.** Every participant gives informed consent in a language they understand, can stop at
  any time, and is told what is recorded. Real messages are only collected under the separate, explicit
  consent described in `packages/understand/eval/README.md`.
- **Report everything with `n`.** Each number is published with the number of people it comes from, the
  dates, and how it was collected.

## Pilot build

Build the app with `VITE_PILOT=1` (see `apps/app/.env.example`) for pilot participants. The pilot build counts, on the
phone only and per ISO week: messages explained (from a photo, a share or a paste), cards that fell back to facts only,
scam warnings and cautions shown, times the person pressed Listen, reminders set and practice messages opened,
and how long the phone took, as counts per time band: photo to card, text to card, and Listen to the first sound. It
never stores message text, numbers, senders or dates of messages (`apps/app/src/lib/pilot.ts`). The participant sees
the totals in Settings, "Pilot numbers", and can share them as plain text they read first, or reset them. Store builds
leave `VITE_PILOT` empty and have no counter at all.

Every push to `main` builds a pilot APK in CI (artifact `sabitori-pilot-apk`, debug-signed, for side-loading on
pilot phones). It has the same app id as the store version but a different signature, so a phone that has the store version
must uninstall it first; after the pilot, uninstall the pilot APK and install the store version again.

## Metrics

| Metric | Definition | How it is collected |
| --- | --- | --- |
| Participants | People who installed the app and used it at least once | Pilot register (kept by the partner, not in the app) |
| Sessions | Messages explained (photo, share or paste) per participant per week | On-phone counter in the pilot build, shown to and shared by the participant |
| Return use | Share of participants who use it again in week 2 and week 4 | Same counter, or the participant's own answer |
| Comprehension | Share of messages for which the participant can correctly say what it is about, what to do and by when, after listening | Supervised session with prepared practice messages and the participant's own messages (read by them, not copied) |
| Scam warnings acted on | Times a participant heard a scam warning and then did not pay, called the official number, or asked someone | Follow-up interview |
| Errors that mattered | Cards that were wrong in a way that could have hurt (wrong amount, wrong deadline, a scam not warned about) | Participant reports and supervised sessions |
| Accessibility | Whether blind, low-vision and non-reading participants could use it without help | Supervised session, participant's own answer |
| Languages recorded | Language packs recorded and reviewed by two native speakers, with the speakers' consent | `packs/<tag>/manifest.json` status and contributors |
| Real-message accuracy | Labels right on consented, anonymised real messages, rules vs on-device model | `packages/understand/eval` with `messages.real.jsonl` |
| Phone performance | Seconds per photo (OCR), milliseconds per message (model), time to first audio, on the pilot phones | Time bands in the pilot build's counter (photo to card, text to card, Listen to first sound), and measured on the devices as in `docs/release.md` section 1 |

## Results

| Metric | Value | n | Dates |
| --- | --- | --- | --- |
| (none yet) | | | |

Pilot partner, place and dates: [OWNER: pilot partner, place and dates, once agreed].
