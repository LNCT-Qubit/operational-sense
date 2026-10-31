-- M08 PROPOSAL ONLY. NOT applied, NOT in migrations/ (so scripts/migrate.sh will not run it).
-- Needs approval from the schema owner (M05) before it becomes a numbered migration.
-- (The name avoids "008": migrations/005_cases.sql already refers to a file "008" that does not exist.)
--
-- WHY: historical_case has no place to record WHICH model produced a vector or WHICH text it came from.
-- Without it, a model/prefix/text-format change cannot be detected, and old and new vectors could be
-- silently mixed. M08 currently works around this by writing model, dimension and counts to
-- audit_log on every run, which is enough for the MVP but cannot flag individual stale rows.
--
-- SMALLEST COMPATIBLE CHANGE: three nullable columns, no change to the existing vector(384) column,
-- no change to RLS (opsense_app already has UPDATE on historical_case).

BEGIN;

ALTER TABLE historical_case
    ADD COLUMN IF NOT EXISTS embedding_model       TEXT,         -- e.g. intfloat/multilingual-e5-small
    ADD COLUMN IF NOT EXISTS embedding_text_sha256 TEXT,         -- hash of the exact text that was embedded
    ADD COLUMN IF NOT EXISTS embedded_at           TIMESTAMPTZ;

COMMIT;

-- OPTIONAL, LATER (only when there are thousands of vectors; with ~50 cases an exact scan is fast
-- and gives exact results):
-- CREATE INDEX idx_hc_embedding_hnsw ON historical_case USING hnsw (embedding vector_cosine_ops);
-- Note: an approximate index plus the WHERE filters in the search query can return fewer than 3 rows.
