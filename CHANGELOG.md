# Changelog

All notable changes to SabiTori are listed here. The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and the version numbers follow [Semantic Versioning](https://semver.org/).

## [Unreleased]

## [1.0.0] - [YYYY-MM-DD]

First public release on Google Play.

### Added

- Explains official messages out loud, in the person's language: bills, mobile money SMS, hospital, school and administrative papers.
- Takes a photo of a paper with the phone's camera app, or reads text the person shares with the app.
- Finds the facts in a message with code: dates, FCFA amounts, phone numbers, USSD codes and links. Each fact is checked against the original text.
- Warns about likely scams. The app never says that a message is safe.
- Speaks in French and English with the phone's offline voice. Speaking speed can be changed.
- Works fully offline. Reading, speaking and checks run on the phone.
- Language folders for Cameroonian Pidgin, Duala, Ewondo, Adamawa Fulfulde, Lamnso', Limbum and Pinyin. The recordings are in progress with native speakers, and will arrive as updates.
- Deadline reminders: "Remind me" schedules notifications on Android, the day before at 09:00 and on the day at 08:00. The web version saves a calendar file (`.ics`) instead.
- Share a message or a photo to SabiTori from another app.
- Practice message, to try the app without a real paper.
- History of cards on the phone, kept for 30 days by default. The person can choose 7 days or keep nothing.
- Optional signed updates (off by default). They download new languages, scam warnings and official numbers. Each file is checked with a signature and a checksum before use.
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
