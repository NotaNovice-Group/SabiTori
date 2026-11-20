-- SabiTori community service (Cloudflare D1). Apply with:
--   npx wrangler d1 execute sabitori-community --remote --file=services/community/schema.sql
-- No IP address, device id or account is ever stored. A report or teaching holds only what the person saw
-- on the "what will be sent" screen and chose to send.

CREATE TABLE IF NOT EXISTS scam_reports (
  id TEXT PRIMARY KEY,
  created_at TEXT NOT NULL,
  region TEXT NOT NULL,
  lang TEXT NOT NULL,
  level TEXT NOT NULL CHECK (level IN ('likely_scam', 'caution')),
  text TEXT NOT NULL,
  sender_kind TEXT NOT NULL CHECK (sender_kind IN ('number', 'name', 'unknown')),
  sender_value TEXT,
  claimed TEXT,
  signals TEXT NOT NULL DEFAULT '[]',
  app_version TEXT,
  -- pending until a person reviews it; only 'published' reports are ever shown to anyone
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'published', 'rejected')),
  reviewed_at TEXT,
  -- SHA-256 of a secret only the sending phone keeps: lets that phone delete this report (POST /v1/delete)
  delete_hash TEXT
);
CREATE INDEX IF NOT EXISTS scam_reports_region_status ON scam_reports (region, status, created_at);
CREATE INDEX IF NOT EXISTS scam_reports_sender ON scam_reports (sender_value);

CREATE TABLE IF NOT EXISTS teachings (
  id TEXT PRIMARY KEY,
  created_at TEXT NOT NULL,
  lang TEXT NOT NULL,
  dialect TEXT,
  phrase TEXT,
  meaning TEXT NOT NULL,
  meaning_lang TEXT NOT NULL CHECK (meaning_lang IN ('en', 'fr')),
  prompt_id TEXT,
  audio_key TEXT,
  audio_type TEXT,
  app_version TEXT,
  status TEXT NOT NULL DEFAULT 'new' CHECK (status IN ('new', 'accepted', 'rejected')),
  delete_hash TEXT
);
CREATE INDEX IF NOT EXISTS teachings_lang ON teachings (lang, created_at);
-- Everything older than 90 days is deleted (docs/privacy.md, section 5.4): by date.
CREATE INDEX IF NOT EXISTS scam_reports_created ON scam_reports (created_at);
CREATE INDEX IF NOT EXISTS teachings_created ON teachings (created_at);

-- Per-day counters keyed by a salted hash of the address (the salt is a secret that changes daily): a limit,
-- never a record of who sent what. Rows from before yesterday are deleted on the next post and by the daily cron,
-- so a row lives three days at most.
CREATE TABLE IF NOT EXISTS rate (
  bucket TEXT PRIMARY KEY,
  day TEXT NOT NULL,
  n INTEGER NOT NULL DEFAULT 0
);
