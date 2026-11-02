#!/usr/bin/env bash
# Creates the SabiTori Android upload keystore OUTSIDE the repository and prints the environment
# variables that the release build reads. It never writes a key, a password or a path into the repo.
#
#   scripts/android-keystore.sh [directory]
#
# directory defaults to ~/.sabitori-keys. Keep the keystore and its passwords safe and backed up:
# if the upload key is lost it can only be replaced through Google Play support.
set -euo pipefail

command -v keytool >/dev/null 2>&1 || { echo "keytool not found. Install a JDK (21) first." >&2; exit 1; }

DIR="${1:-$HOME/.sabitori-keys}"
REPO="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
mkdir -p "$DIR"
DIR="$(cd "$DIR" && pwd)"
case "$DIR/" in
  "$REPO"/*) echo "Refusing to put a keystore inside the repository ($REPO). Choose another directory." >&2; exit 1 ;;
esac
chmod 700 "$DIR"

KEYSTORE="$DIR/sabitori-upload.jks"
ALIAS="${SABITORI_KEY_ALIAS:-sabitori-upload}"
if [ -e "$KEYSTORE" ]; then
  echo "$KEYSTORE already exists. Not overwriting it." >&2
  exit 1
fi

# Passwords: use the ones already in the environment, or generate strong random ones.
rand() { head -c 24 /dev/urandom | od -An -tx1 | tr -d ' \n'; }
STORE_PASS="${SABITORI_KEYSTORE_PASSWORD:-$(rand)}"
KEY_PASS="${SABITORI_KEY_PASSWORD:-$STORE_PASS}"
DNAME="${SABITORI_DNAME:-CN=SabiTori, OU=Mobile, O=SabiTori, C=CM}"

keytool -genkeypair -v \
  -keystore "$KEYSTORE" -storetype PKCS12 \
  -alias "$ALIAS" -keyalg RSA -keysize 4096 -validity 10000 \
  -storepass "$STORE_PASS" -keypass "$KEY_PASS" \
  -dname "$DNAME" >/dev/null
chmod 600 "$KEYSTORE"

cat <<OUT

Upload keystore created: $KEYSTORE

Set these for a local release build (do NOT commit them):

  export SABITORI_KEYSTORE_PATH="$KEYSTORE"
  export SABITORI_KEYSTORE_PASSWORD="$STORE_PASS"
  export SABITORI_KEY_ALIAS="$ALIAS"
  export SABITORI_KEY_PASSWORD="$KEY_PASS"

For GitHub Actions (Settings > Secrets and variables > Actions), add:

  SABITORI_KEYSTORE_BASE64     the output of: base64 -w0 "$KEYSTORE"
  SABITORI_KEYSTORE_PASSWORD   (the value above)
  SABITORI_KEY_ALIAS           $ALIAS
  SABITORI_KEY_PASSWORD        (the value above)

Back up $KEYSTORE and the passwords somewhere safe (a password manager). Then build with:

  cd apps/app && pnpm build && npx cap sync android && cd android && ./gradlew bundleRelease assembleRelease
OUT
