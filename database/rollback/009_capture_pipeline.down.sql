-- 009_capture_pipeline.down.sql  (NOT part of migrations/*.sql, so migrate.sh never runs it by accident)
-- Reverts 009. DATA LOSS WARNING: drops every row in `recording` and `transcription`
-- (audio files on disk are NOT touched). Extraction drafts survive; their link columns are removed.
-- Take a backup first:  pg_dump -U postgres -d opsense -t recording -t transcription -t extraction_draft > backup_009.sql
BEGIN;

DROP INDEX IF EXISTS uq_extraction_draft_live_per_transcription;
DROP INDEX IF EXISTS ix_extraction_draft_recording;

ALTER TABLE extraction_draft DROP CONSTRAINT IF EXISTS chk_extraction_draft_transcription_has_recording;
ALTER TABLE extraction_draft DROP CONSTRAINT IF EXISTS fk_extraction_draft_transcription;
ALTER TABLE extraction_draft DROP CONSTRAINT IF EXISTS fk_extraction_draft_recording;

-- Back to the US-06 contract: transcription_id is free TEXT.
ALTER TABLE extraction_draft ALTER COLUMN transcription_id TYPE TEXT USING transcription_id::text;
UPDATE extraction_draft SET transcription_id = legacy_transcription_ref
 WHERE transcription_id IS NULL AND legacy_transcription_ref IS NOT NULL;

ALTER TABLE extraction_draft DROP COLUMN IF EXISTS recording_id;
ALTER TABLE extraction_draft DROP COLUMN IF EXISTS legacy_transcription_ref;

DROP TABLE IF EXISTS transcription;   -- policies, indexes and grants go with the table
DROP TABLE IF EXISTS recording;

COMMIT;
