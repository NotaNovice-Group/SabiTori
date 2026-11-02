# SabiTori privacy policy

Version 1.0.0. Last updated: [DATE].
Français: [privacy.fr.md](privacy.fr.md)

## In short (Easy Read)

1. SabiTori reads official papers out loud for you.
2. Your messages and photos stay on your phone. We never receive them.
3. We do not sell your data. We show no ads. We do not track you.
4. Two extra features are off. You can turn them on. They never send your messages.
5. You can turn them off at any time in Settings.

## 1. Who we are

SabiTori is published by NotaNovice Group, [LEGAL NAME], [ADDRESS], Germany.
Questions about privacy: [CONTACT EMAIL].
Data protection officer: [TO CONFIRM: whether one is required or appointed. If so, name and contact].

For the data described in section 5, we are the controller under the EU General Data Protection
Regulation (GDPR). We are not a controller of the messages and photos on your phone, because we
never receive them.

## 2. What SabiTori does

You photograph a paper, or share its text with SabiTori. The app then explains it out loud in your
language. It finds dates, amounts, phone numbers and codes. It warns you when a message may be a
scam. It never says that a message is safe.

SabiTori works offline. French and English are spoken now. Cameroonian Pidgin, Duala, Ewondo,
Adamawa Fulfulde, Lamnso', Limbum and Pinyin are being recorded with native speakers. They will be
added as updates when they are ready.

## 3. What stays on your phone

Everything in this section is processed on your phone only. We do not receive it.

- The photos you take, and the text you share with the app.
- The text read from a photo. The app reads photos on the phone, with offline OCR data built into the app.
- The explanation (the card) and the spoken voice.
- Your history of cards. It is kept for the period described in section 8.
- Your settings, such as language and speaking speed.
- Deadline reminders. If you tap "Remind me" on a card with a deadline, the app schedules up to two
  notifications on your phone: at 09:00 the day before the deadline, and at 08:00 on the day. They show the
  sender, the action and the date. They are not sent anywhere. In the web version of the app, "Remind me"
  saves a calendar file (.ics) where you choose instead. That file contains the deadline and a copy of the
  message text, so keep it as private as the paper itself.
- Text or photos that you share to SabiTori from another app. SabiTori keeps a private copy only while it
  reads them, then deletes it. [TO CONFIRM: exact deletion timing on the built app.]
- Downloaded language packs, scam warnings and official numbers, if you turned on updates.
- [TO CONFIRM: whether the photo is kept on the phone after its text is read.]

## 4. What we never collect

We do not collect or receive:

- your messages, the text of your photos, or your photos;
- your name, your account or your e-mail address (SabiTori has no accounts);
- your phone number, your location, your contacts or your calendar;
- mobile money, bank or other payment details;
- advertising identifiers, analytics or usage statistics;
- your phone model or brand.

SabiTori does not use tracking cookies or advertising identifiers.

## 5. The two optional features

Both features are off by default. A version of the app has them only if it was prepared with an
update address or an error-report address. You switch each one on in Settings, after a short
explanation. When a feature is off, the app sends nothing for it.

### 5.1 Updates ("Get new languages and scam warnings")

**What it does.** It downloads signed files: language packs, scam warnings and official numbers.
It checks at most once a day, when the app starts, in the background. It does not check when your
phone says it is on mobile data. You can also press "Check now" in Settings.

**What is sent.** A normal web request for each file listed in the update index. The request has no
message, no identifier, no cookie and no referrer. Like any internet request, the server can see your
IP address and the User-Agent header (the name of the web engine your phone uses).

**To whom.** The update server: [UPDATE HOST: TO CONFIRM: name, location and operator of the server
that hosts the updates]. Its access logs, if any: [TO CONFIRM: how long they are kept].

**Checks.** Every update is checked with a digital signature and a checksum before it is used. A
failed or partial update does not change what the app uses.

**Switching off.** Turning the feature off stops the checks. The downloaded files stay in use until
you choose "Delete downloaded updates" in Settings. That removes them. The app then uses the languages
and warnings built into it.

### 5.2 Error reports ("Send error reports")

**What it does.** When the app hits an unexpected error or crashes, it can send a report, so that we
can fix the problem.

**What is sent.**

- the type of error and a short error message, after removing personal details (see below);
- the stack trace: the names of functions and of the app's own files, and line numbers;
- the app version and the version of each language pack;
- the name and version of the operating system (for example, Android 14);
- the CPU architecture (for example, arm64);
- a label for the build (for example, production or beta);
- an event identifier and the time of the error.

**What is never sent.** Messages, photos, text from the screen, numbers of 3 or more digits, amounts,
dates, phone numbers, e-mail addresses, links, USSD codes, your phone's model or brand, user
identifiers, request details, screen recordings, sessions, performance traces, or the navigation
history of the app.

**Removing personal details.** The app removes personal details before any report leaves the phone.
It removes numbers, amounts, dates, phone numbers, e-mail addresses, links and codes. It also removes
any text that matches a message you had on the screen recently. That memory is kept in the phone's
working memory only, not on disk. This is careful and automatic, but no automatic process is perfect.
If you see something personal in a report, contact us and we will delete it.

**To whom.** Sentry, Inc. (United States), which processes the reports for us. [TO CONFIRM: the data
region used by our Sentry project (EU or US). If US, the transfer basis, for example the EU-US Data
Privacy Framework or standard contractual clauses.] Sentry's servers receive the request like any
internet request, so they see your IP address and User-Agent header. [TO CONFIRM: whether Sentry
stores IP addresses for this project, or discards them.]

**Switching off.** Turning the feature off closes the reporting at once. Nothing more is sent.

## 6. Permissions

The app asks for these Android permissions. Each one serves only the purpose given, and is asked for only when you use that feature.

- **Internet.** Used only for the two optional features in section 5.
- **Camera.** Asked only when you tap the camera button. The photo is taken for SabiTori and read on your phone. Choosing a photo from your gallery uses the phone's own photo picker, which needs no permission from SabiTori.
- **Notifications.** Asked only when you tap "Remind me" on a card with a deadline. Used only for the reminders in section 3.

SabiTori does not ask for your location, contacts or microphone.

[TO CONFIRM: these permissions come from the app's current code, which is not yet in a committed release. The committed manifest declares only the Internet permission. Check the merged manifest of the built app before publishing, and correct this section if it differs.]

## 7. Legal basis (GDPR)

- **Optional features (section 5):** consent, under Article 6(1)(a) GDPR. You give consent by
  switching a feature on. You can withdraw it at any time by switching it off, without giving a
  reason. Withdrawing does not affect what was lawful before.
- **Crash reports:** Sentry processes them for us, as a processor under Article 28 GDPR.
  [TO CONFIRM: data processing agreement with Sentry in place.]
- **Health information:** a hospital paper may contain health information. This is a special category
  under Article 9 GDPR. We never receive it, so we do not process it. It stays on your phone, under your
  control.
- **Your messages:** we do not hold them, so we cannot find, change or delete them for you. You can
  delete them on your phone.

## 8. How long data is kept

On your phone:

- **History of cards:** 30 days by default. In Settings you can choose 7 days, or keep nothing.
- **Downloaded updates:** until you delete them in Settings, or uninstall the app.
- **Uninstalling** the app removes its data from the phone. [TO CONFIRM by a test on a device.]

On our side:

- We keep no messages and no photos, because we never receive them.
- **Crash reports:** Sentry keeps them for [TO CONFIRM: retention period set in the project]. We keep
  them for [TO CONFIRM: period] and then delete them.
- **Update server logs:** [TO CONFIRM: retention, or "none kept by us"].

## 9. Who receives data

- We do not sell data.
- We do not share data for advertising. There are no ads and no analytics.
- Service providers, only when the feature is on: Sentry, Inc. (crash reports, section 5.2), and the
  operator of the update server (update requests, section 5.1).
- Google Play handles the download and update of the app itself, under Google's own privacy policy.
- We give data to an authority only when the law requires it. We hold no data beyond what section 5
  describes.

## 10. Security

- Connections are HTTPS only. The app refuses unencrypted web connections.
- Messages and photos never leave the phone.
- Updates are checked with a digital signature and a checksum before use.
- Crash reports are cleaned before they leave the phone.
- There are no accounts, so there are no passwords to leak.
- Keep your phone's screen lock and system updates on.

## 11. Children

SabiTori is for anyone who needs help reading official messages, including young people. We collect no
personal data by default, from anyone, including children. If a parent or guardian believes that a
child's data was sent in a crash report, contact us and we will delete it.
[TO CONFIRM: minimum age policy, and the app's position under the Google Play Families policy.]

## 12. Your rights

Under the GDPR you have the right to:

- access the personal data we hold about you;
- have it corrected or deleted;
- restrict or object to its processing;
- receive it in a portable form;
- withdraw consent at any time (section 7);
- complain to a data protection authority. For Germany, this is the authority of the state where the
  publisher has its seat: [TO CONFIRM: name and contact].

To use these rights, write to [CONTACT EMAIL]. If you have the event identifier from a report, please
include it. We may need to check your identity before we act.

## 13. Users in Cameroon

[TO CONFIRM: Cameroonian personal data protection law that applies to users in Cameroon, the rights it
gives, and the authority to contact. This section must be checked against that law before publication.]

## 14. Changes

We update this page when the app's behaviour changes. The version and date at the top show the latest
change. If a change adds new data collection, we will ask for your consent again, in the app, before it
takes effect. [TO CONFIRM: how we announce changes outside the app, for example in the store listing.]

## 15. Contact

[LEGAL NAME]
[ADDRESS]
[CONTACT EMAIL]
