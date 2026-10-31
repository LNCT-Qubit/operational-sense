-- poc/similarity_search.sql  -- STATUS: the equivalent SQL in retrieval/repository.py was EXECUTED live with mock vectors (tools/live_pg_check.py); this standalone file was not run by psql with a real-model vector.
-- Run AS opsense_app (RLS applies), after:  python -m retrieval.embed_cases --include-demo
--
--   psql -U opsense_app -d opsense -v org_id="'b2a7dce7-b449-4381-ba3b-b520f2c88c2e'" \
--        -v qvec="'[0.01,0.02,...384 numbers...]'" -v model="'intfloat/multilingual-e5-small'" -v cls="'EQ-PUMP'" -v include_demo=true -f poc/similarity_search.sql
-- The query vector comes from the SAME model and prefix as the stored vectors:
--   python -c "from retrieval.embedder import *; from retrieval.embedding_config import *; s=EmbeddingService(load_embedding_settings()); print(to_pgvector_literal(s.embed_query('seal se paani leak')))"
-- Similarity is NOT diagnosis: rows are similar HISTORICAL cases.
\if :{?include_demo} \else \set include_demo false \endif
\if :{?cls} \else \set cls NULL \endif
BEGIN;
SELECT set_config('app.current_org_id', :org_id, true);       -- tenant context for RLS (transaction-local)
SELECT c.case_id,
       c.case_reference                                   AS original_case_reference,
       c.equipment_class_id,
       coalesce(s.subsystem_name, '(unresolved) ' || coalesce(c.subsystem_source_label, '')) AS subsystem,
       coalesce(c.symptom_structured, c.symptom_text)      AS case_summary,
       c.case_status, c.retrieval_eligibility, c.is_synthetic,
       round((1 - (h.embedding <=> :qvec::vector))::numeric, 4) AS similarity   -- cosine similarity, 1 = identical direction
FROM historical_case h
JOIN operational_case c ON c.case_id = h.case_id
LEFT JOIN subsystem s ON s.subsystem_id = c.subsystem_id
WHERE h.embedding IS NOT NULL
  AND h.status = c.case_status                               -- ignore a stale status copy
  AND h.embedding_model = :model                             -- never rank vectors from a different model (migration 008)
  AND ( (c.case_status = 'VERIFIED' AND c.retrieval_eligibility = 'eligible')                           -- trusted
        OR (:include_demo AND c.case_status IN ('DRAFT','SUBMITTED')
            AND c.retrieval_eligibility = 'demo_only_until_expert_review') )                            -- demo, explicit opt-in
  AND (:cls IS NULL OR c.equipment_class_id = :cls)
ORDER BY h.embedding <=> :qvec::vector, c.case_reference
LIMIT 3;
COMMIT;
