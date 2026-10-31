-- 008_embedding_metadata.sql
-- STATUS: PROVISIONAL (Group 3 Final). Promotes database/proposals/M08_proposal_historical_case_embedding_metadata.sql;
-- the schema owner (Group 2) must confirm. Nullable columns only; the vector(384) column is unchanged; RLS unchanged
-- (opsense_app already has INSERT/UPDATE on historical_case).
--
-- WHY: record WHICH model / text version / text produced each vector so a model or text-format change is detected per row,
-- old and new vectors are never mixed in one ranking (search filters on embedding_model), and MOCK vectors can never be
-- stored as real embeddings (CHECK below).
BEGIN;

ALTER TABLE historical_case
    ADD COLUMN IF NOT EXISTS embedding_model        TEXT,
    ADD COLUMN IF NOT EXISTS embedding_dimension    INTEGER,
    ADD COLUMN IF NOT EXISTS embedding_text_sha256  TEXT,
    ADD COLUMN IF NOT EXISTS embedding_text_version TEXT,
    ADD COLUMN IF NOT EXISTS embedded_at            TIMESTAMPTZ;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'chk_embedding_has_provenance') THEN
    -- a stored vector must say which model made it, with the matching dimension
    ALTER TABLE historical_case ADD CONSTRAINT chk_embedding_has_provenance CHECK (
      embedding IS NULL OR (embedding_model IS NOT NULL AND embedding_dimension = vector_dims(embedding)
                            AND embedding_text_sha256 IS NOT NULL));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'chk_embedding_not_mock') THEN
    -- mock / fake / test-only vectors must never be stored as real embeddings
    ALTER TABLE historical_case ADD CONSTRAINT chk_embedding_not_mock CHECK (
      embedding_model IS NULL OR embedding_model !~* '(mock|fake|hashing|test-only)');
  END IF;
END $$;

COMMIT;
