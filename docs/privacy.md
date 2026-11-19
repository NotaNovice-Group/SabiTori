# SabiTori privacy policy

Version 1.0.0. Last updated: 19 November 2026.
Français: [privacy.fr.md](privacy.fr.md)

## In short (Easy Read)

1. SabiTori reads official papers out loud for you.
2. Your messages and photos stay on your phone. We never receive them.
3. We do not sell your data. We show no ads. We do not track you.
4. Two extra features are off. You can turn them on. They never send your messages.
5. You can turn them off at any time in Settings.

## 1. Who we are

SabiTori is published by NotaNovice UG (haftungsbeschränkt), 58256 Ennepetal, Germany.
Questions about privacy: legal@usesabitori.com.
Data protection officer: none appointed; write to the address above.

For the data described in section 5, we are the controller under the EU General Data Protection
Regulation (GDPR). We are not a controller of the messages and photos on your phone, because we
never receive them.

## 2. What SabiTori does

You photograph a paper, or share its text with SabiTori. The app then explains it out loud in your
language. It finds dates, amounts, phone numbers and codes. It warns you when a message may be a
scam. It never says that a message is safe.

SabiTori works offline. French and English are spoken now. Cameroonian Pidgin, Duala, Ewondo,
Adamawa Fulfulde, Lamnso', Limbum and Pinyin are waiting for native speakers to translate and record
them. Until then they speak French or English.

## 3. What stays on your phone

Everything in this section is processed on your phone only. We do not receive it.

- The photos you take, and the text you share with the app.
- The text read from a photo. The app reads photos on the phone, with offline OCR data built into the app.
- The explanation (the card) and the spoken voice.
- Your history of cards, with the text of each message that was read. It is kept for the period described in section 8. With the setting "Do not keep", no card is saved.
- Your settings, such as language and speaking speed.
- Deadline reminders. If you tap "Remind me" on a card with a deadline, the app schedules up to two
  notifications on your phone: at 09:00 the day before the deadline, and at 08:00 on the day. They show the
  sender, the action and the date. They are not sent anywhere. In the web version of the app, "Remind me"
  saves a calendar file (.ics) where you choose instead. That file contains the deadline and a copy of the
  message text, so keep it as private as the paper itself.
- Text or photos that you share to SabiTori from another app. SabiTori keeps a private copy only while it
  reads them, then deletes it. For a shared photo, the private copy is deleted as soon as the app has loaded the photo into its working memory, before the text is read. Shared text is not copied to a file: it stays in working memory only.
- Downloaded language packs, scam warnings and official numbers, if you turned on updates.
- The photo itself is not kept by SabiTori. It is held in working memory while its text is read. It is not saved to your gallery and not added to your history. Only the text read from it is kept, in the history card, for the period in section 8. A photo taken with the camera first passes through a temporary file that Android's camera component writes in the app's own storage. SabiTori does not delete that temporary file itself. Other apps do not get it from SabiTori, Android may clear it, and uninstalling the app removes it.

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

**To whom.** The update server: none in version 1.0.0. This version is built without an update server, so the app makes no update request.
Like most servers, it may keep standard server logs of requests (for example IP address, time, file
requested and User-Agent). The app adds no identifier of its own to these requests. How long the logs
are kept: not applicable in version 1.0.0.

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
- the name and version of the error-reporting library;
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

**Identifiers.** The app does not give Sentry a user, a device identifier, a session or an installation
identifier. Session tracking, performance tracing and session replay are all off. The only identifier in
a report is a random event identifier, created for that one report.

**To whom.** Sentry, Inc. (United States), which processes the reports for us. Version 1.0.0 is built without crash reporting, so no report is sent. Before this feature is switched on in a later version, this page will name the data region and the legal basis for the transfer. Sentry's servers receive the request like any internet
request, so they see your IP address and User-Agent header. Sentry may record the IP address of the
sender unless the project setting "Prevent Storing of IP Addresses" is enabled. Our release checklist
requires that setting to be enabled before the error-report feature is offered.

**Switching off.** Turning the feature off closes the reporting at once. Nothing more is sent.

## 6. Permissions

The app declares these six Android permissions. Camera and Notifications are asked for only when you use the feature. The other four are granted by Android when the app is installed, and are not shown as a question.

- **Internet.** Used only for the two optional features in section 5.
- **Camera.** Asked only when you tap the camera button. The photo is taken for SabiTori and read on your phone. Choosing a photo from your gallery uses the phone's own photo picker, which needs no permission from SabiTori.
- **Notifications.** Asked only when you tap "Remind me" on a card with a deadline. Used only for the reminders in section 3.
- **Receive boot completed.** Lets the reminders you set survive a restart of your phone: Android tells the app that the phone has started, so it can schedule them again. It comes with the notification component of the app. It is not used for anything else.
- **Wake lock.** Lets the phone wake briefly to show a reminder at its time. It comes with the same notification component. It is not used for anything else.
- **Vibrate.** Makes the phone vibrate when a card warns about a likely scam (three long pulses) or asks for caution (one), so a person who cannot hear feels the warning. It is not used for anything else.

SabiTori does not ask for your location, contacts or microphone.

## 7. Legal basis (GDPR)

- **Optional features (section 5):** consent, under Article 6(1)(a) GDPR. You give consent by
  switching a feature on. You can withdraw it at any time by switching it off, without giving a
  reason. Withdrawing does not affect what was lawful before.
- **Crash reports:** Sentry processes them for us, as a processor under Article 28 GDPR.
  Not applicable in version 1.0.0, which sends no crash reports.
- **Health information:** a hospital paper may contain health information. This is a special category
  under Article 9 GDPR. We never receive it, so we do not process it. It stays on your phone, under your
  control.
- **Your messages:** we do not hold them, so we cannot find, change or delete them for you. You can
  delete them on your phone.

## 8. How long data is kept

On your phone:

- **History of cards:** 30 days by default. In Settings you can choose 7 days, or keep nothing.
  The app deletes cards older than the chosen period (counted from the time the card was made) each
  time it opens, each time you change this setting, and each time it saves a new card. It does not
  run in the background, so an expired card can stay on the phone until the next time you open the app.
  Choosing "Do not keep" deletes the existing cards at once and no new card is saved to the phone (the
  card on the screen stays in working memory until the app closes). "Delete all my messages" in
  Settings deletes the whole history immediately.
- **Downloaded updates:** until you delete them in Settings, or uninstall the app.
- **Uninstalling** the app removes its data from the phone. Android deletes an app's own storage when
  it is uninstalled, and the app switches off Android backup, so no copy of the history is stored in
  your Google account or moved to another phone.

On our side:

- We keep no messages and no photos, because we never receive them.
- **Crash reports:** Sentry keeps them for no time in version 1.0.0, because none are sent. We keep
  them for no time either and then delete them.
- **Update server logs:** the server may keep standard request logs (see section 5.1). Retention:
  none kept by us; version 1.0.0 has no update server.

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
SabiTori is made for adults and young people. It is not directed at children under 13 and is not part of the Google Play Families programme.

## 12. Your rights

Under the GDPR you have the right to:

- access the personal data we hold about you;
- have it corrected or deleted;
- restrict or object to its processing;
- receive it in a portable form;
- withdraw consent at any time (section 7);
- complain to a data protection authority. For Germany, this is the authority of the state where the
  publisher has its seat: Landesbeauftragte für Datenschutz und Informationsfreiheit Nordrhein-Westfalen, Kavalleriestraße 2-4, 40213 Düsseldorf, Germany, www.ldi.nrw.de.

To use these rights, write to legal@usesabitori.com. If you have the event identifier from a report, please
include it. We may need to check your identity before we act.

## 13. Users in Cameroon

Cameroon's Law No. 2024/017 of 23 December 2024 on the protection of personal data also applies to users in Cameroon. In version 1.0.0 SabiTori sends no personal data from your phone, so there is nothing for us to hand over, correct or delete. If you have a question or a complaint, write to legal@usesabitori.com and we will answer. You may also contact the data protection authority of Cameroon.

## 14. Changes

We update this page when the app's behaviour changes. The version and date at the top show the latest
change. If a change adds new data collection, we will ask for your consent again, in the app, before it
takes effect. We also announce changes on the SabiTori website (https://sabitori.pages.dev) and in the "What's new" text of the store listing.

## 15. Contact

NotaNovice UG (haftungsbeschränkt)
58256 Ennepetal
legal@usesabitori.com
