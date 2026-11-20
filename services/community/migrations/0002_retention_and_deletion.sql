-- For a database created before 2026-11-20 (schema.sql already has these for new ones):
--   npx wrangler d1 execute sabitori-community --remote --file=services/community/migrations/0002_retention_and_deletion.sql
ALTER TABLE scam_reports ADD COLUMN delete_hash TEXT;
ALTER TABLE teachings ADD COLUMN delete_hash TEXT;
CREATE INDEX IF NOT EXISTS scam_reports_created ON scam_reports (created_at);
CREATE INDEX IF NOT EXISTS teachings_created ON teachings (created_at);
