# SabiTori community service

Opt-in, owner-run service behind two app features:

- **Report a scam**: when a card warns of a scam, the person can share it to warn others. The app shows exactly
  what will be sent (the message text, which they can edit, and the sender's number or name) before anything leaves
  the phone. Reports are stored as **pending** and are shown to nobody until you publish them.
- **Teach SabiTori**: people write and/or record a word or phrase in their language with its English or French
  meaning, to train better language support. Stored for you to export; never published by the service.

No IP address, device id or account is stored. A daily, salted hash of the address only counts posts for the rate
limit (30 per day by default). Everything else is in `schema.sql`.

## Retention and deletion

- **90 days.** A daily cron (`[triggers]` in `wrangler.toml`) deletes reports, teachings and their recordings older
  than 90 days (`purgeOld` in `src/handler.ts`).
- **From the app.** With each item the app sends a random `deleteKey` that only the phone keeps; the service stores
  its SHA-256 (`delete_hash`). Settings, "Delete everything I sent" calls `POST /v1/delete {kind, id, key}` for each
  item: 200 deleted (with its recording), 404 already gone or a wrong key.
- **By email** (legal@usesabitori.com): find the item with the admin list (`GET /v1/admin/scams`,
  `GET /v1/admin/teachings`) and delete it in D1:
  `npx wrangler d1 execute sabitori-community --remote --command "DELETE FROM scam_reports WHERE id = '<id>'"`
  (for a teaching, also `npx wrangler r2 object delete sabitori-teach-audio/<audio_key>`).

A database created before this change needs the migration once:

```bash
npx wrangler d1 execute sabitori-community --remote --file=services/community/migrations/0002_retention_and_deletion.sql
```

## Deploy (Cloudflare, free tier is enough)

You need a Cloudflare account and Node 22. From the repository root:

```bash
npx wrangler login
npx wrangler d1 create sabitori-community        # copy the database_id it prints into wrangler.toml
npx wrangler r2 bucket create sabitori-teach-audio
npx wrangler d1 execute sabitori-community --remote --file=services/community/schema.sql
cd services/community
npx wrangler secret put ADMIN_TOKEN               # a long random string; keep it private
npx wrangler secret put RATE_SALT                 # another long random string
npx wrangler deploy
```

`wrangler deploy` prints the service URL (`https://sabitori-community.<you>.workers.dev`). Build the app with it:

```bash
VITE_COMMUNITY_URL=https://sabitori-community.<you>.workers.dev pnpm --filter @sabitori/app build
```

Without `VITE_COMMUNITY_URL` the app still saves scam warnings and teachings on the phone; the "share" buttons
explain that sharing is not set up.

## Review and export (owner)

```bash
# reports waiting for review
curl -H "Authorization: Bearer $ADMIN_TOKEN" https://<service>/v1/admin/scams
# publish (or "rejected")
curl -X POST -H "Authorization: Bearer $ADMIN_TOKEN" -d '{"status":"published"}' https://<service>/v1/admin/scams/<id>
# teachings since a date (JSON); audio files are in the R2 bucket under teach/<lang>/<day>/<id>.<ext>
curl -H "Authorization: Bearer $ADMIN_TOKEN" "https://<service>/v1/admin/teachings?since=2026-11-01"
```

Publish a report only when it really is a scam and contains no personal details of the person who received it.
A published report lists the sender's number publicly: when in doubt, reject.

## API

| Method | Path | Body / query | Answer |
| --- | --- | --- | --- |
| GET | `/v1/health` | | `{ ok: true }` |
| GET | `/v1/scams` | `?region=CM&limit=100` | published reports, newest first, with `reports` = published reports from the same number |
| POST | `/v1/scams` | `{ region, lang, level, text, sender: { kind, value? }, signals[], claimed?, appVersion? }` | `201 { id, status: 'pending' }` |
| POST | `/v1/teach` | `{ lang, dialect?, phrase?, meaning, meaningLang: 'en'\|'fr', promptId?, audio?: { base64, type }, appVersion? }` | `201 { id }` |
| GET | `/v1/admin/scams` | Bearer token | pending reports |
| POST | `/v1/admin/scams/:id` | Bearer token, `{ status: 'published' \| 'rejected' }` | `{ ok: true }` |
| GET | `/v1/admin/teachings` | Bearer token, `?since=` | teachings |

Tests: `pnpm --filter @sabitori/community test` (pure handler and validation, in-memory store).
