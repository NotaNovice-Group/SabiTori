# Google Play Data safety form: SabiTori answers

Status: draft for the owner's review. Answer the Play Console form with these answers, and re-check them whenever a feature changes. Items marked [OWNER: ...] are for the owner to fill in from the Play Console or the Sentry project before submission.

Facts behind every answer (from the code and docs, not from policy wishes):

- Messages and photos are processed on the phone and never sent anywhere (apps/app, docs/updates.md, docs/ARCHITECTURE.md).
- Two optional features, both off by default and only present when the build was given their addresses: signed updates (GET requests for files named in a signed index, no query string, no cookies, no referrer, no custom headers) and crash reports via Sentry (scrubbed by apps/app/src/lib/scrub.ts; no session replay, no tracing, no session tracking, no breadcrumbs, no user, no request context, no device model; see apps/app/src/lib/crash.ts, where `defaultIntegrations` is off and only the unhandled-error integrations are added).
- Android permissions, read from the merged manifest of the built release APK (`aapt dump permissions app-release-unsigned.apk`): INTERNET (only for those two features), CAMERA (only when the person taps the camera button), POST_NOTIFICATIONS (only when the person taps "Remind me"), VIBRATE (the scam warning vibration, so a deaf person feels it), RECEIVE_BOOT_COMPLETED and WAKE_LOCK. The last two come from the Capacitor local-notifications plugin, so that reminders survive a restart of the phone and can wake the phone to show a reminder. They are granted at install, ask nothing, and the app uses them for nothing else. No location, contacts, microphone or storage permission, and no billing permission. Cleartext traffic is off.
- No accounts, no ads, no analytics, no data sale.

## 1. Data collection and security (overview)

**Does your app collect or share any of the required user data types?**
Yes, but only when the person turns on error reports (crash reports). With that feature off, the answer for every data type below is "not collected".

**Is all of the user data collected by your app encrypted in transit?**
Yes. All network traffic is HTTPS (`usesCleartextTraffic="false"` and the network security config allow HTTPS only).

**Do you provide a way for users to request that their data be deleted?**
Yes, in the app: turn off "Send error reports" (stops all reports at once), and "Delete downloaded updates" in Settings. Uninstalling removes data stored on the phone (Android deletes the app's storage, and Android backup is off: `allowBackup="false"` and `data_extraction_rules.xml`). The history can also be emptied in Settings ("Delete all my messages"). Crash reports that have already reached Sentry can be deleted on request by contacting legal@usesabitori.com. There are no reports to delete in version 1.0.0; for the web address field use https://sabitori.pages.dev/privacy.html#12-your-rights

## 2. Data types

Answer for each type. "Collected" means transmitted off the device by the app or by a service it uses. "Shared" would mean transferred to a third party for their own purposes (see section 3).

| Data type (Play category) | Collected | Optional | Why not or why yes |
| --- | --- | --- | --- |
| Location (approximate, precise) | No | - | The app never reads location. |
| Personal info (name, email, user IDs, address, phone, race, religion, political, sexual orientation, other) | No | - | No accounts. The app never reads contacts or any personal field. The phone number inside a message stays on the phone. |
| Financial info (user payment info, purchase history, credit score, other) | No | - | Mobile money and bill amounts are read on the phone and never sent. No purchases in the app. |
| Health and fitness | No | - | Health information in a hospital paper stays on the phone and is never sent. |
| Messages (emails, SMS or MMS, other in-app messages) | No | - | Messages the person reads with SabiTori stay on the phone. The app never sends or receives messages. "Read my next SMS" uses Android's SMS User Consent sheet for one message the person allows; the app holds no SMS permission. |
| Photos and videos | No | - | Photos are taken with the phone camera (only after the person taps the camera button) or chosen from the gallery. They are processed on the phone and not sent: the app code has no upload of any photo (the only network code is the update client, GET requests, and the optional Sentry reports, which carry no photo). SabiTori does not keep the photo after its text is read: it is held in memory, not saved to the gallery (`saveToGallery: false`) and not stored in the history, which keeps only the text read. A shared photo's private copy is deleted as soon as it is loaded. A camera photo passes through a temporary file written by the camera component in the app's own storage, which the app does not delete itself (removed on uninstall). |
| Audio files | No | - | Spoken output only. No recording. |
| Files and docs | No | - | No file upload. Text and photos shared into SabiTori from another app are read on the phone and not sent. In the web version, the "Remind me" calendar file is saved by the person; the app does not send it. |
| Calendar | No | - | The app does not read the calendar. Reminders are notifications on the phone (Android), or a calendar file the person saves (web). |
| Contacts | No | - | Not read. |
| App activity (app interactions, in-app search history, installed apps, other user-generated content, other actions) | No | - | No analytics, no usage tracking. The app keeps a history of cards on the phone only. |
| Web browsing | No | - | The app does not browse. |
| App info and performance: **Crash logs** | Yes, only when error reports are on | Yes | Sent to Sentry (processor) for fixing crashes. Scrubbed before sending (no messages, numbers, amounts, dates, phone numbers, emails, links, codes, device model). Contains the app version, pack versions, OS name and version, CPU architecture, and a stack trace. |
| App info and performance: **Diagnostics** | Yes, only when error reports are on | Yes | Same report: error type and scrubbed message, environment label, event ID, time. No other performance data: session tracking, tracing, replay and client reports are all off. |
| Device or other IDs (advertising ID, device ID, other) | No | - | No advertising ID. The Sentry SDK is set to send no user info (`setUser(null)`, every `dataCollection` category off), and no session integration is installed, so it creates no device, user or session identifier. The only identifier is a random event ID for each report. |

Note on IP addresses and User-Agent: any request to a server (the update host or Sentry) carries the phone's IP address and the User-Agent header to that server. These are standard request data. Play's form does not list IP addresses as a separate type. Answer as above, and disclose in the privacy policy (section 5). Sentry may record the sender IP address unless the project setting "Prevent Storing of IP Addresses" is enabled. That setting is a required step in docs/release.md (section 6). Either way, keep the answer "Diagnostics: yes (optional)". The update client sends no identifier, but the update host may keep standard server logs (see below).

## 3. Data sharing

**Is any user data shared with third parties?**
Crash reports are sent to Sentry, Inc., which processes them for the publisher as a service provider. Under Play's definitions, a service provider processing data only for the developer is not "sharing", so answer:

- Crash logs and diagnostics: **processed by a service provider, optional**, not shared. Not applicable in version 1.0.0: crash reporting is not in the build, so declare no data collected.

The update host is not a third party receiving data for its own purposes; it serves files. The update client sends no identifier, but the host may keep standard server logs (IP address, time, file, User-Agent), and the privacy policy says so. None in version 1.0.0.

**Is data sold?** No.

**Is data used for advertising?** No. No ads.

## 4. Data collection by purpose and justification

Use only these purposes, all optional and all with the person's consent:

- **App functionality:** crash logs and diagnostics, when on, only to find and fix crashes in the app.
- **Analytics:** not used. Do not select it.
- **Developer communications, advertising, fraud prevention, personalisation, account management:** not used.

## 5. Other answers

- **Does the app have user accounts?** No. Provide no account-deletion link.
- **Does the app use Android's advertising ID?** No.
- **Is the data processed ephemerally?** No. Sentry stores crash reports for no time in version 1.0.0, because none are sent.
- **Is there an independent security review?** No. Do not claim one. None done.
- **Families policy:** the app is not designed for children. Matches: 13 and over, not designed for children.

## 6. When to review these answers

Review this form before each release, and whenever any of these change:

- a new permission, or a new network request;
- a change in what the crash reports contain (`apps/app/src/lib/scrub.ts`);
- a new update host or a new error-report project;
- the Sentry project's data region, IP setting or retention;
- the optional features are made on by default (this would change every answer above).

The privacy policy (docs/privacy.md, docs/privacy.fr.md) must always say the same thing as this form.
