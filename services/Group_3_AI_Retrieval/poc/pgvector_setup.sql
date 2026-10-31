-- poc/pgvector_setup.sql  -- STATUS: NOT executed as this file (Docker PoC path). The pgvector extension/index/cosine-search behaviour it checks WAS exercised
-- on a scratch PostgreSQL 16.15 + pgvector 0.8.0 (level 3, MOCK vectors; see poc/execution_evidence/). No real embeddings were generated.
-- Run as the superuser (postgres) AFTER database/scripts/migrate.sh and the data load. Read-only checks.
-- 1) pgvector extension present?
SELECT extname, extversion FROM pg_extension WHERE extname = 'vector';              -- expect 1 row
-- 2) vector column dimension must equal OPSENSE_EMBEDDING_DIM (384 for multilingual-e5-small)
SELECT format_type(atttypid, atttypmod) AS embedding_type
FROM pg_attribute WHERE attrelid = 'public.historical_case'::regclass AND attname = 'embedding';   -- expect vector(384)
-- 3) application role must NOT bypass row-level security
SELECT rolname, rolsuper, rolbypassrls FROM pg_roles WHERE rolname = 'opsense_app';  -- expect f, f
-- 4) RLS forced on the tenant tables
SELECT relname, relrowsecurity, relforcerowsecurity FROM pg_class
WHERE relname IN ('operational_case','historical_case','troubleshooting_step','case_failure_mapping') ORDER BY 1;  -- expect t, t
-- 5) No vector index yet: ~50 rows -> exact scan (exact results). Create only when thousands of vectors exist:
--    CREATE INDEX idx_hc_embedding_hnsw ON historical_case USING hnsw (embedding vector_cosine_ops);
--    (an approximate index combined with WHERE filters can return fewer than K rows)
