First signed build of SabiTori: offline Android app that reads official messages aloud as a short card (sender, action, deadline, amount, scam warning).

**Pre-release.** Not yet on Google Play. French and English work; local-language packs are scaffolded and waiting for native speakers. No pilot has run yet.

- Built from `main` at 632ce6d, version 1.0.0 (versionCode 1), minSdk 24
- Signed with the SabiTori upload key (APK Signature Scheme v2)
  - Certificate: `CN=SabiTori, O=NotaNovice Group, C=DE`
  - SHA-256: `a5fd2f604e18a14832ca56237e397aea59c910760a9da2d3f19d3e1bbc7996a9`
- Permissions: INTERNET (opt-in updates/crash reports only, both off), CAMERA, POST_NOTIFICATIONS, RECEIVE_BOOT_COMPLETED, WAKE_LOCK

| File | SHA-256 |
|---|---|
| SabiTori-1.0.0-release-signed.apk | `3b1eba30ee50aca38d74015a04b75614671de922dbf47f3d7e5c159779dbad66` |
| SabiTori-1.0.0-release-signed.aab | `74a08a0ecdf72a627421a2c213a47ecd60ad8071c3e33eb88c4ebc5bd1af49c8` |

Install the APK by sideloading it (allow "install unknown apps"). The AAB is for upload to Google Play.
