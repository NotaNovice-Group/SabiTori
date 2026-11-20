#!/usr/bin/env bash
# Build the SMS relay APK (docs/sms-ussd.md, route A): the store app plus relay mode and the two SMS permissions.
# Installed by hand on the relay phone (adb install), never uploaded to a store.
set -euo pipefail
cd "$(dirname "$0")/../apps/app"
VITE_RELAY=1 pnpm build
npx cap sync android
(cd android && ./gradlew assembleRelay --no-daemon -q)
echo "Relay APK: apps/app/android/app/build/outputs/apk/relay/app-relay.apk (id cm.sabitori.app.relay)"
