# iOS

SabiTori's iOS app is the same web app as Android, wrapped with Capacitor 8 (`apps/app/ios`). This page says what
exists, how to build it on a Mac, and, plainly, what has not been tested.

> **Status: not tested.** The Xcode project was generated and configured on Linux. Nothing has been built or run on an
> iPhone, an iPad or the iOS simulator yet. The `iOS` workflow (`.github/workflows/ios.yml`) is the first place it gets
> compiled; until that run is green and someone has used the app on a real iPhone, treat iOS as unverified.

## What exists

- `apps/app/ios/`: the Xcode project made by `npx cap add ios --packagemanager SPM` (Swift Package Manager, no
  CocoaPods). Plugins are listed in `ios/App/CapApp-SPM/Package.swift`, which `npx cap sync ios` rewrites; do not edit it
  by hand.
- Bundle id `cm.sabitori.app` (the same as the Android `applicationId`), display name SabiTori, iOS 15 or newer,
  version 1.0 (1). The version numbers are not yet tied to `apps/app/package.json` as on Android.
- `Info.plist` explains the camera and photo-library access in plain English: the photo is read on the phone and
  never leaves it. Reminders use local notifications; iOS asks for that permission at run time (only after the person
  taps "Remind me") and needs no `Info.plist` entry.
- App icon and launch screen are still Capacitor's placeholders. [OWNER: iOS app icon (1024 px) and launch screen]
- `.github/workflows/ios.yml`: on every push to `main` and on demand, builds the web app, runs `npx cap sync ios` and
  does an unsigned simulator build with `xcodebuild` on `macos-latest`. The simulator `App.app` is kept as a build
  artifact. No signing, no secrets, nothing goes to Apple.

## Native plugins on iOS

| Used for | Plugin | iOS |
| --- | --- | --- |
| Take or choose a photo | `@capacitor/camera` | Yes |
| Reminders | `@capacitor/local-notifications` | Yes. Notification channels are Android-only, so the app skips `createChannel` on iOS (it would reject there and the reminder would fail). |
| Splash screen | `@capacitor/splash-screen` | Yes |
| System voice under Piper | `@capacitor-community/text-to-speech` | Yes (AVSpeechSynthesizer). Which languages it offers is the phone's choice. |
| Status/navigation bars | Capacitor core `SystemBars` | Yes, as configured in `capacitor.config.ts` |
| Receive a photo or text from the share sheet | `@capgo/capacitor-share-target` | **Not set up.** On iOS this needs a Share Extension target and an App Group, which do not exist yet. The listener is registered but never fires; SabiTori simply does not appear in the iOS share sheet. People take or choose the photo inside the app instead. |
| Open this app's settings | `SabiToriNative.openSettings` (project's own Java plugin) | **No Swift port.** On iOS the app opens `app-settings:` instead, which Capacitor's web view hands to the system (SabiTori's page in the Settings app; notifications are switched there too). |
| Delete shared-file copies, report filtered shares | `SabiToriNative.forgetSharedFiles`, `takeShareNotes`, and `MainActivity.filterShare` (Java) | **Android-only.** They exist for the Android share intake; with no iOS share intake there is nothing to clean. The app does not call them on iOS. |

The checks are in `apps/app/src/lib/native.ts` (`nativePlatform()`), covered by `apps/app/test/native.test.ts` and
`apps/app/test/reminders.test.ts`.

## Build on a Mac

Needs macOS with Xcode 26 or newer (Capacitor 8), Node 22 and pnpm 10. No CocoaPods.

```bash
pnpm install
pnpm --filter @sabitori/app build && cd apps/app && npx cap sync ios && npx cap open ios
```

In Xcode, pick a simulator and press Run. Xcode fetches `capacitor-swift-pm` on the first build. To run on your own
iPhone, choose your team under Signing & Capabilities (a free Apple ID is enough for your own device).

The same unsigned simulator build as CI, from the command line:

```bash
cd apps/app/ios/App && xcodebuild -project App.xcodeproj -scheme App -sdk iphonesimulator \
  -destination 'generic/platform=iOS Simulator' CODE_SIGNING_ALLOWED=NO build
```

## Not tested

- Nothing was built or run on an iPhone, an iPad or a simulator when this was added. The CI workflow may still need
  fixes on its first run.
- Piper voices (Web Worker, WebAssembly, Web Audio) in iOS WebKit: unverified. iOS may need a tap before audio plays;
  if Piper cannot start, the system voice (`text-to-speech`) is the fallback.
- OCR (tesseract.js worker with WebAssembly SIMD, needs iOS 16.4 or newer) and the MiniLM encoder (onnxruntime-web
  WebAssembly) in iOS WebKit: unverified, including memory limits on older iPhones. On iOS 15 to 16.3 the app should
  say photos cannot be read and keep the paste-text path.
- Camera and photo picker permissions, the "denied" path and opening Settings by `app-settings:`.
- Local notifications: scheduling, the tap that opens the card (cold and warm start).
- Safe areas (notch, home indicator) with `viewport-fit=cover`, dark mode and the launch screen.
- iPad layout.

## App Store (needs the owner)

1. [OWNER: Apple developer account] An Apple Developer Program membership for the publisher, and the team id.
2. Register the bundle id `cm.sabitori.app` and create the app in App Store Connect (name SabiTori).
3. Signing: set the team in Xcode (automatic signing) or in CI with a distribution certificate and provisioning
   profile kept as GitHub secrets. Nothing in this repository signs iOS builds today.
4. Real icon and launch screen, iPhone screenshots, privacy details ("Data Not Collected" if that holds for the store
   build, matching `docs/privacy.md`), age rating and export compliance (no non-exempt encryption).
5. Test on real iPhones (TestFlight), above all the items under "Not tested".
6. Optional: a Share Extension for `@capgo/capacitor-share-target`, so SabiTori appears in the iOS share sheet.
