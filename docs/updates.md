# Optional updates and error reports

**Your messages never leave this phone. If you switch them on, SabiTori can download updates and
send error reports, never your messages.**

Both features are off by default. A build has them only if its owner set the keys in
`apps/app/.env` (see `apps/app/.env.example`); a build without keys has no settings row, no code
that runs and no network request. A person switches each on in Settings after a plain explanation.

## 1. Update channel

A static HTTPS directory, hosted anywhere (GitHub Pages or Releases, S3, Netlify, any web server):

```
<UPDATE_URL>/index.json
<UPDATE_URL>/index.json.sig        base64 Ed25519 signature over the exact bytes of index.json
<UPDATE_URL>/packs/fr/phrases.json
<UPDATE_URL>/regions/CM/region.json
...
```

The host must send `Access-Control-Allow-Origin: *` (GitHub Pages does; the publisher also writes a
`_headers` file for Netlify/Cloudflare). The Android WebView needs it as much as a browser does.

`index.json`:

```json
{
  "formatVersion": 1,
  "channel": "stable",
  "sequence": 7,
  "issuedAt": "2026-11-01T09:00:00Z",
  "files": [{ "path": "packs/fr/phrases.json", "sha256": "<hex>", "size": 18234 }]
}
```

Rules the client enforces (all of them before a single file is kept):

- The signature must verify with the public key pinned in the app build (`VITE_UPDATE_PUBLIC_KEY`).
- `sequence` must not be lower than the installed one (rollback protection). Equal means "up to date".
- Paths must match `^(packs|regions)/[a-z0-9_.\-/]+$`, contain no `..`, and be one of the files the
  app already reads: `packs/index.json`, `packs/<tag>/{manifest,phrases,rules,reading}.json`,
  `packs/<tag>/audio/index.json`, `packs/<tag>/audio/<clip>.webm|.m4a`,
  `packs/<tag>/voice/<model id>.onnx` and `.onnx.json` (Piper voices), `regions/<CODE>/region.json`.
  Region codes are upper case (`CM`), so that one segment may use A-Z, as the app's own file does.
- At most 20 MB per file (80 MB for a `voice/*.onnx` model) and 300 MB in total (checked from the
  signed sizes, and again on download).

### Delivering a voice by update

The app bundles only the voices in `SABITORI_BUNDLE_VOICES` (French by default). To give English its
Piper voice, or a language its community-trained voice, publish `packs/<tag>/voice/<id>.onnx` and
`<id>.onnx.json` together with a `manifest.json` whose voice is `{ "kind": "tts", "engine": "piper",
"voiceHint": "<id>" }`. On the next start the voice engine loads the downloaded copy; until both files
have arrived, and whenever loading fails, that language keeps the phone's own voice.
- Every downloaded file must match its signed size and sha256.
- Downloads go to a staging area. Only when all files verified is the active set switched, in one
  IndexedDB transaction. A failed or partial update leaves the previous set active. A file the
  active set lost (damaged storage) is simply downloaded again by the next update.
- A response is read only up to its signed size (or the index limit) and cut there, so a server
  cannot make the phone buffer a huge body. A connection that sends nothing for 30 s fails the
  check instead of hanging it. A redirect to another origin is refused. The address must be https.

What the client sends: `GET <UPDATE_URL>/<path>` with no query string, no cookies
(`credentials: 'omit'`), no referrer, no custom headers. No message content, no identifier.

How it takes effect: the app reads packs, region, reading lexicons and audio clips through an
overlay that serves the downloaded file when there is one and the bundled file otherwise. Because
files are read at start, new content applies the next time the app starts. Files dropped from a
newer index fall back to the bundled ones.

When it runs: only when the person turned it on, at most once a day, on app start, in the
background, and not when `navigator.connection.type` says the phone is on mobile data (unknown is
allowed). Switching the feature on checks at once, and "Check now" in Settings always runs.

Switching the feature off stops the checks; the downloaded files stay in use. "Delete downloaded
updates" (same group in Settings, with a confirmation) cancels any running check, forgets every
downloaded file and the last-check memo: the app is back to its built-in languages, warnings and
numbers the next time it starts.

### Publishing

One time: make a keypair. The secret is printed, never saved.

```bash
node scripts/updates-keygen.mjs
```

Put the public key in `apps/app/.env` as `VITE_UPDATE_PUBLIC_KEY`, rebuild the app. Keep the secret
in a password manager or CI secret as `UPDATE_SIGNING_KEY`. If it is lost, apps already installed
cannot receive updates (a new key needs a new app release).

Each update:

```bash
UPDATE_SIGNING_KEY=<secret> node scripts/updates-publish.mjs --previous <previous index.json>
```

`--previous` is a path or an https URL of the index you published last; the new `sequence` is its
sequence + 1. (Without it the sequence is 1 and phones that have a higher one ignore the update.)
The output goes to `dist-updates/` (git-ignored). Upload the whole directory to the host, so that
`<UPDATE_URL>/index.json` is the file in `dist-updates/index.json`. Keep that `index.json` for the next
`--previous`. Only files the app reads are published; anything else in `packs/` (READMEs, drafts)
is listed as skipped.

## 2. Error reports

Only when `VITE_SENTRY_DSN` is set and the person switched "Send error reports" on; switching off
closes the client at once. The Sentry SDK is loaded only then (its own file).

- No session replay, no tracing, no breadcrumbs, no sessions, no page or request context:
  only unhandled errors and rejections, de-duplicated, with their causes.
- Every event is rebuilt from an allow-list in `apps/app/src/lib/scrub.ts` before it can be sent:
  error type, scrubbed message, stack frames (function, file, line), OS and device name, app and pack
  versions as tags. Dropped: request, user, extra, local variables, source lines, other contexts.
- Every kept string loses digit runs of 3 or more, amounts, phone numbers, dates, e-mails, links and
  USSD codes, and any stretch of 6 or more characters that appears in a message that was on screen
  (the last three messages are remembered in memory only, for this purpose).
- `connect-src` of the web build's Content-Security-Policy is `'self'` plus the update origin and the
  Sentry ingest origin from the DSN, computed at build time.

## Android

`INTERNET` is declared for these two features only. `network_security_config.xml` and
`usesCleartextTraffic="false"` allow HTTPS only.
