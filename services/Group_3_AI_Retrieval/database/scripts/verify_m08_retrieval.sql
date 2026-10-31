-- Read-only checks to run AFTER case import and python -m retrieval.embed_cases --include-demo.
-- This script does not claim that vector retrieval is working by itself; run the Python search CLI too.

SELECT current_database() AS database_name, current_user AS database_user;

-- 1. pgvector and expected embedding dimension.
SELECT extname FROM pg_extension WHERE extname = 'vector';
SELECT format_type(atttypid, atttypmod) AS embedding_type
FROM pg_attribute
WHERE attrelid = 'public.historical_case'::regclass AND attname = 'embedding';

-- 2. Source corpus and embedding counts.
SELECT count(*) AS operational_cases,
       count(*) FILTER (WHERE case_status = 'DRAFT') AS draft_cases,
       count(*) FILTER (WHERE retrieval_eligibility = 'demo_only_until_expert_review') AS demo_only_cases
FROM operational_case;
SELECT count(*) AS historical_index_rows,
       count(embedding) AS rows_with_embedding,
       count(*) FILTER (WHERE embedding IS NULL) AS rows_without_embedding
FROM historical_case;

-- 3. Vector/status consistency. Expected: zero rows for mismatched status or ineligible vectors.
SELECT h.case_id, c.case_reference, h.status AS index_status, c.case_status AS source_status
FROM historical_case h JOIN operational_case c USING (case_id)
WHERE h.status <> c.case_status;
SELECT h.case_id, c.case_reference, c.case_status, c.retrieval_eligibility
FROM historical_case h JOIN operational_case c USING (case_id)
WHERE h.embedding IS NOT NULL
  AND NOT ((c.case_status = 'VERIFIED' AND c.retrieval_eligibility = 'eligible')
        OR (c.case_status IN ('DRAFT','SUBMITTED') AND c.retrieval_eligibility = 'demo_only_until_expert_review'));

-- 4. Self-similarity sanity check. Embedded rows should have distance 0 (within numeric precision).
SELECT c.case_reference, (h.embedding <=> h.embedding) AS self_distance
FROM historical_case h JOIN operational_case c USING (case_id)
WHERE h.embedding IS NOT NULL ORDER BY c.case_reference LIMIT 5;

-- NOTE: symptom_text lives in operational_case. Do not select it from historical_case.
