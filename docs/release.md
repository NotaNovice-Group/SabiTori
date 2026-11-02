# Release runbook: SabiTori on Google Play

This is the step-by-step guide for a release of the Android app, and for publishing language and scam-warning updates between releases. Follow it in order. Items marked [TO CONFIRM] need a decision or a check by the owner.

## 0. Known gaps in the repository (read first)

Checked against the repository when this runbook was written. Fix or accept each one before the first release.

1. **There is no release workflow yet.** `.github/workflows/release.yml` does not exist. The secrets in section 4 are for that workflow, and they are needed once it is written. Until then the AAB is built by hand (section 5).
2. **There is no keystore script yet.** `scripts/android-keystore.sh` does not exist. Section 3 uses `keytool` directly.
3. **The release build is not signed.** `apps/app/android/app/build.gradle` has a `release` build type with no `signingConfig`. Add one that reads the four keystore values from environment variables before running `bundleRelease`.
4. **Version numbers do not match 1.0.0.** `build.gradle` has `versionCode 1` and `versionName "1.0"`. `apps/app/package.json` has `"version": "0.1.0"`. Set `versionName "1.0.0"` and `version` to `1.0.0`, and keep the `versionCode` above any version already uploaded to Play.
5. **Permissions are not yet in a commit.** The committed `AndroidManifest.xml` declares only `INTERNET`. The uncommitted work in the tree adds Capacitor plugins for the camera (`CAMERA`, asked only when the person taps the camera button), local notifications (`POST_NOTIFICATIONS`, asked only when the person taps "Remind me") and the share target. Check the merged manifest of the built APK, and update `docs/privacy.md` section 6 and the Data safety form to match.
6. **Official numbers are not verified.** Every entry in `regions/CM/region.json` has `"verified": false`. Do not publish until they are confirmed (section 1).
7. **French text is still a draft.** `packs/fr/phrases.json` is marked `draft` until a native speaker reviews it (section 1).
8. **Native work is uncommitted.** The camera, notifications, share target and splash screen files are in the working tree, not in a commit. The release must be built from a commit that includes them, and then tagged (section 10).
9. **Two optional features need build settings.** Without `VITE_UPDATE_URL` and `VITE_UPDATE_PUBLIC_KEY`, updates are absent. Without `VITE_SENTRY_DSN`, crash reports are absent. Decide before the build which features the release offers.

## 1. Pre-release checklist

Tick every line before you build the release.

**Content and safety**

- [ ] Official sender names, help lines and balance codes in `regions/CM/region.json` are confirmed from the operators' or agencies' own pages. Set `verified: true` and fill in `source` for each one. (README: "Before a public release".)
- [ ] A native speaker has reviewed every French phrase in `packs/fr/phrases.json` and set its status to `reviewed`. A second person checked it.
- [ ] English text reviewed by a second person. [TO CONFIRM: is English review required, or is it covered by the same check?]
- [ ] `node scripts/check-packs.mjs` passes.

**Device tests** (README: "Test on real low-cost Android phones")

- [ ] At least two low-cost Android phones, one of them near the oldest supported version (minSdk is 24, Android 7.0). [TO CONFIRM: device list.]
- [ ] Offline voice works for French and English on each device.
- [ ] Photo capture, OCR speed and the optional on-device model (if shipped) work at an acceptable speed.
- [ ] Airplane mode: the app reads a message completely with no network.
- [ ] With "Send error reports" and "Get new languages" both off, the app makes no network request (check with a proxy or the device's network log).
- [ ] With each feature on, requests go only to the update host and to Sentry, over HTTPS.
- [ ] "Delete downloaded updates" works and asks for confirmation.
- [ ] "Remind me" schedules notifications at 09:00 the day before and at 08:00 on the day, and cancelling removes them. Check on Android 13 or later, where the permission is asked.
- [ ] Text and photos shared into SabiTori from another app arrive correctly.

**Privacy and data**

- [ ] `docs/privacy.md` and `docs/privacy.fr.md` are hosted at public URLs (for example GitHub Pages). Every [TO CONFIRM] and placeholder is filled in or removed.
- [ ] The privacy policy matches the built app (permissions, what is sent, retention).
- [ ] The Data safety form is answered from `docs/store/data-safety.md`, and each answer is re-checked against the built app.
- [ ] The Sentry project is set up as described in section 6.
- [ ] Update host: served over HTTPS, sends `Access-Control-Allow-Origin: *`, and `index.json.sig` verifies with the public key in the build.

**Store listing**

- [ ] `docs/store/listing.en.md` and `docs/store/listing.fr.md` are final. Remove the [TO CONFIRM] line about the languages if the French review is not finished.
- [ ] Screenshots taken on a real phone, in both languages, with practice messages or invented names and numbers only (see the listing files).
- [ ] Feature graphic made (1024 x 500 px).
- [ ] Content rating questionnaire completed.

**Version**

- [ ] Version set to `1.0.0` in `package.json` and `build.gradle` (`versionName`). `versionCode` higher than any uploaded one.
- [ ] Date set in `CHANGELOG.md` (`## [1.0.0] - YYYY-MM-DD`).
- [ ] `pnpm test` and `pnpm --filter @sabitori/app typecheck` pass.

## 2. Play Console setup (one time)

1. **Developer account.** Create or use the NotaNovice Group developer account. Organisation accounts need identity and organisation verification, which can take several days. [TO CONFIRM: account type, and whether a company verification is complete.]
2. **Create the app.** Name `SabiTori`, default language English (United States) or French, app type App, free. [TO CONFIRM: default language.]
3. **Package name.** `cm.sabitori.app` (from `applicationId` in `build.gradle`). It cannot be changed after the first upload.
4. **Play App Signing.** Enrol in Play App Signing when prompted. Google keeps the app signing key. You keep only the upload key (section 3).
5. **Privacy policy URL.** Enter the public URL of `privacy.md` (English) and link the French version in the listing.
6. **App content.** Complete: Data safety (from `docs/store/data-safety.md`), content rating (IARC), target audience (adults and young people, not children), ads (no ads), app access (no login), government apps (not applicable: [TO CONFIRM]), news apps (no), financial features (no: SabiTori does not handle money, it explains messages). [TO CONFIRM: each answer against the current Play policy.]
7. **Store listing.** Paste the texts from `docs/store/listing.en.md` and `listing.fr.md` (add the French listing as a translation). Upload screenshots, icon (512 x 512 px) and the feature graphic.
8. **Personal accounts.** If the account is a personal one, Play may require a closed test with at least 12 testers for 14 days before production access. [TO CONFIRM: the requirement that applies to this account on the day you submit.]

## 3. Signing keys

Use an upload key that is separate from the app signing key, which Play keeps.

Create the upload key once, on a trusted computer. Keep the keystore file outside the repository.

```bash
keytool -genkeypair -v \
  -keystore sabitori-upload.jks \
  -alias sabitori-upload \
  -keyalg RSA -keysize 2048 -validity 10000
```

- Store the keystore file and both passwords in a password manager, and keep a second backup in a safe place.
- Never commit the `.jks` file, and never paste its contents into a chat, issue or log.
- To prepare the CI secret, encode the file as one line: `base64 -w0 sabitori-upload.jks > sabitori-upload.jks.b64`. Then paste the contents of the `.b64` file into `SABITORI_KEYSTORE_BASE64`. Delete the `.b64` file afterwards.
- If the upload key is lost, Play support can reset it. [TO CONFIRM: the current reset process in the Play Console help.]

## 4. Secrets

### For the app release (`.github/workflows/release.yml`, to be written)

| Secret | What it is |
| --- | --- |
| `SABITORI_KEYSTORE_BASE64` | The upload keystore, base64-encoded (section 3). |
| `SABITORI_KEYSTORE_PASSWORD` | The keystore password. |
| `SABITORI_KEY_ALIAS` | The key alias, for example `sabitori-upload`. |
| `SABITORI_KEY_PASSWORD` | The password of that key. |

### Build-time settings (`VITE_*`)

These are read when the web app is built, so the release build needs them. Keep them in CI secrets, or in `apps/app/.env` on the build machine. Never commit `.env`. The values are described in `apps/app/.env.example`.

| Variable | Needed when |
| --- | --- |
| `VITE_UPDATE_URL` | The release offers updates. https only, no query string. |
| `VITE_UPDATE_PUBLIC_KEY` | With `VITE_UPDATE_URL`. The public key from `node scripts/updates-keygen.mjs`. |
| `VITE_SENTRY_DSN` | The release offers crash reports. The DSN of the Sentry project. |
| `VITE_SENTRY_ENVIRONMENT` | Optional. Label for the build, for example `production`. Defaults to `production`. |

The update **signing secret** (`UPDATE_SIGNING_KEY`) is not an app release secret. Keep it separate (section 7).

Optional, if the release is uploaded by CI: a Google Play API service account key. [TO CONFIRM: whether CI uploads to Play, or the AAB is uploaded by hand.]

## 5. Build the release

Run these from the repository root. Each step must succeed.

```bash
pnpm install
pnpm test
pnpm --filter @sabitori/app build
cd apps/app && npx cap sync android
cd android && ./gradlew bundleRelease
```

- Use `bundleRelease` (an AAB), which Play requires. The README's `assembleDebug` builds a test APK only.
- The signed bundle is at `apps/app/android/app/build/outputs/bundle/release/`. This needs the signing config from section 0, item 3.
- Before uploading, check that the bundle's manifest declares only the permissions you expect (section 0, item 5).

## 6. Sentry setup (only if crash reports are offered)

1. Create a Sentry project for SabiTori (platform: browser JavaScript). [TO CONFIRM: organisation and project names.]
2. Choose the data region (EU or US) and write it in `docs/privacy.md` section 5.2 and in `docs/store/data-safety.md`.
3. In the project's data settings, decide whether IP addresses are stored or discarded, and write the choice into the privacy policy.
4. Set the retention period. Write it into the privacy policy (section 8) and the Data safety form.
5. Sign the data processing agreement with Sentry, and keep a copy with the company records.
6. Copy the DSN into `VITE_SENTRY_DSN` for the build.
7. Test once with a deliberate error in a debug build, and check that the event has no message text, numbers or device model.

## 7. Publishing language and scam-warning updates (no app release)

Updates can add or change the content the app reads, without a new Play release. Full details are in `docs/updates.md`. Summary:

1. **Keep the update keys safe.** The secret `UPDATE_SIGNING_KEY` belongs in a password manager or a CI secret. If it is lost, phones that already have the app cannot receive updates, and a new app release is needed. Never change it without a release.
2. **Prepare the files.** Change files under `packs/` or `regions/`. Run `node scripts/check-packs.mjs`.
3. **Sign and build the update.** Keep the `index.json` you published last. It is the `--previous` input.

   ```bash
   UPDATE_SIGNING_KEY=<secret> node scripts/updates-publish.mjs --previous <previous index.json (path or https URL)>
   ```

   The new `sequence` is the previous one plus 1. Without `--previous`, phones with a higher sequence ignore the update.
4. **Upload.** Upload everything in `dist-updates/` to the update host, so that `<VITE_UPDATE_URL>/index.json` is the new file. Check that `index.json.sig` is uploaded too.
5. **Keep the new `index.json`.** Store it for the next `--previous`. Losing it means the next sequence number is wrong.
6. **Test.** On a test phone with updates on: Settings, "Check now", then restart the app. Check the new language or warning appears. Check that a bad signature is refused. [TO CONFIRM: how a bad signature is tested without touching the live host.]
7. **Announce.** If the update changes what the app says about a scam, or adds a language, note it in `CHANGELOG.md` under `[Unreleased]`.

Things an update can never do: add code, change permissions, or add a new network host. Those need an app release.

## 8. Tracks and rollout

Play tracks, in the order you use them:

1. **Internal testing.** The team only. Upload the bundle here first, and test the Play-installed build on a real phone (install from Play, not from a file).
2. **Closed testing.** A small group of testers, including people who use the app in the field. Collect their feedback for at least a week. [TO CONFIRM: testing period.]
3. **Open testing** (optional). Anyone can join. Skip it if closed testing is enough.
4. **Production.** The public release. Use a staged rollout.

Staged rollout on production, a suggested schedule:

| Step | Share of users | Wait before the next step | Check first |
| --- | --- | --- | --- |
| 1 | 5% | 2 days | Crash rate and ANR rate in Play's Android vitals. Sentry (if on). |
| 2 | 20% | 3 days | Same checks, and the Play reviews. |
| 3 | 50% | 3 days | Same checks. |
| 4 | 100% | - | - |

At any step, press **Halt rollout** if crashes rise, or if the speech or scam content is wrong. Halting stops new installs of that release. It does not remove the app from people's phones.

## 9. Rollback

Play does not let you install an older `versionCode` over a newer one. So a rollback is a new release with a higher `versionCode`:

1. **Halt the rollout** of the bad release in the Play Console.
2. **Fix** the problem on a branch, or revert the commit that caused it.
3. **Bump** `versionCode` and the patch version (for example, `1.0.1`, tag `v1.0.1`).
4. **Release** the fixed build through the tracks, with a short staged rollout.

For content problems (a wrong scam warning, a wrong official number) you do not need an app release:

1. Publish a corrected update with a **higher** `sequence` (section 7). The sequence can never go down, so an old file cannot be restored by putting back an old index.
2. As a stop-gap, tell people to press **Delete downloaded updates** in Settings. The app then uses its built-in content from the next start. [TO CONFIRM: this is the right advice to give in the field.]

After a rollback, check Sentry and Play's Android vitals for the next few days.

## 10. Tag the release

After the release is published, tag the commit that produced the bundle:

```bash
git tag -a v1.0.0 -m "SabiTori 1.0.0"
git push origin v1.0.0
```

Use the version in `build.gradle` and `package.json`. Do not move a tag once it has been pushed. Make a new patch release instead.

## 11. After release

- Watch Play's Android vitals and reviews daily for the first week.
- Watch Sentry, if crash reports are on.
- Keep `CHANGELOG.md` up to date, with an `[Unreleased]` section for the next changes.
- When the privacy policy, the Data safety form or the permissions change, update all three in the same change.
