# App Store listing (English (U.K.))

Ready to paste into App Store Connect. Lengths were counted by the script that wrote this file.

| Field | Limit | Value |
| --- | --- | --- |
| Name | 30 | `SabiTori` |
| Subtitle | 30 | `Hear your papers, offline` (25) |
| Bundle ID | | `cm.sabitori.app` |
| SKU | | `sabitori-ios-1` |
| Primary category | | Utilities |
| Secondary category | | Productivity |
| Price | | Free |
| Copyright | | `2026 NotaNovice UG (haftungsbeschränkt)` |
| Support URL | | https://sabitori.pages.dev |
| Marketing URL | | https://sabitori.pages.dev |
| Privacy policy URL | | https://sabitori.pages.dev/privacy.html |
| Contact email for review | | legal@usesabitori.com |

## Promotional text (170, 164 used)

```
Take a photo of a bill, a school letter or a mobile money SMS. SabiTori says who sent it, what to do, by when and how much. Scam warnings come first. Works offline.
```

## Keywords (100, 95 used)

```
read aloud,bill,letter,scam,sms,mobile money,offline,blind,low vision,cameroon,ocr,voice,french
```

## Description (4000, 1566 used)

```
SabiTori explains official messages out loud, in your language.

Take a photo of a bill, a mobile money SMS, or a hospital, school or admin paper. SabiTori tells you, out loud:
- who sent it, and what it is about
- what you must do, and by when
- how much money, and who to pay
- who to call
- whether it looks like a scam

SabiTori is made for people with disabilities, and for people who cannot read French or English. Every button says its name, and the card shows the action, the date and the amount as pictures.

WORKS OFFLINE
Once the app is installed, you do not need the internet to read a message. Reading, speaking and the scam check all happen on your phone.

YOUR MESSAGES STAY ON YOUR PHONE
Your photos and the text of your messages never leave your phone. SabiTori has no accounts, no ads and no analytics. We do not sell data.

LANGUAGES
French and English are available now. Cameroonian Pidgin, Duala, Ewondo, Adamawa Fulfulde, Lamnso', Limbum and Pinyin are waiting for native speakers to translate and record them. Until then they speak French or English.

DEADLINES
Tap "Remind me" on a card with a deadline. SabiTori reminds you the day before, and on the day. The reminder stays on your phone.

WHAT SABITORI DOES NOT DO
SabiTori explains a message. It does not replace the office that sent it, a doctor or a lawyer. It never says that a message is safe. If you are not sure, do not pay, and call the official number of the organisation, found on its own website.

Free and open source (MPL-2.0). Published by NotaNovice UG (haftungsbeschränkt).
```

## What's new in this version

```
First release.
```

## Screenshots

- 6.3 inch (1206 x 2622), the size App Store Connect asks for first: `docs/store/assets/ios-6.3/<language>/`.
- 6.9 inch (1320 x 2868): `docs/store/assets/ios-6.9/<language>/`, five images in order.
- 6.5 inch (1284 x 2778): `docs/store/assets/ios-6.5/<language>/`.
- App icon 1024 px: already in the Xcode project (`AppIcon.appiconset`), copy at `docs/store/assets/icon-1024.png`.

## App privacy ("nutrition label")

Answer **Data Not Collected**. This holds for version 1.0.0 only if it is built without `VITE_SENTRY_DSN` and
`VITE_UPDATE_URL` (see `docs/release.md`). If crash reports are switched on in a later build, declare
Diagnostics > Crash Data, not linked to the user, not used for tracking.

## Age rating

Answer "None" or "No" to every question (no violence, no gambling, no unrestricted web access, no user content).
Expected result: 4+.

## Export compliance

The app only uses HTTPS from the operating system. Answer "None of the algorithms mentioned above", and set
`ITSAppUsesNonExemptEncryption` to `NO` in `Info.plist` so the question is not asked on each upload.

## Notes for App Review

```
SabiTori needs no account and no login.

To test without a paper: on the home screen tap "Practice with an example". The app shows and speaks a card
for an invented electricity bill. To test with a photo: tap "Take a photo of a message" and photograph any
printed bill or letter in French or English.

Everything runs on the device. The app makes no network request in this version. The camera and photo library
are used only to read the text of the paper on the device; photos are not uploaded.

The app warns when a message looks like a scam. It never tells the user a message is safe.
```

## Not ready on iOS (be honest in the listing)

- Nothing has been run on a real iPhone yet (`docs/ios.md`). Build, run and test before submitting for review.
- Sharing a message from another app into SabiTori is Android-only, so this description does not mention it.
