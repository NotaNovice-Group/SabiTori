#!/usr/bin/env bash
# Runs the same steps as .github/workflows/ci.yml on this machine. Used as the merge gate when GitHub
# Actions cannot start (for example when the Actions budget is used up). Prints one PASS/FAIL line per step.
set -uo pipefail
cd "$(dirname "$0")/.."
if [ -z "${ANDROID_HOME:-}" ]; then for d in "$HOME/android-sdk" /home/user/android-sdk "$HOME/Android/Sdk"; do [ -d "$d" ] && ANDROID_HOME="$d" && break; done; fi
export ANDROID_HOME="${ANDROID_HOME:-$HOME/android-sdk}"
fail=0
step() { local name="$1"; shift; if "$@" >"/tmp/ci-local-${name// /-}.log" 2>&1; then echo "PASS  $name"; else echo "FAIL  $name (log: /tmp/ci-local-${name// /-}.log)"; fail=1; fi; }
step "install" pnpm install --frozen-lockfile
step "test" pnpm -r test
step "typecheck" pnpm -r typecheck
step "packs" node scripts/check-packs.mjs
if [ -d "$ANDROID_HOME" ]; then
  step "web build" pnpm --filter @sabitori/app build
  step "cap sync" bash -c 'cd apps/app && npx cap sync android'
  step "android debug" bash -c 'cd apps/app/android && ./gradlew assembleDebug --no-daemon -q'
else
  echo "SKIP  android (no Android SDK at $ANDROID_HOME)"
fi
exit $fail
