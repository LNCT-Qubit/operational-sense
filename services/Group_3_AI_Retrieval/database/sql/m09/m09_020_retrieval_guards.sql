-- m09_020_retrieval_guards.sql   (M09, OPTIONAL: review before applying)
-- Purpose: make it impossible for an unreviewed case to be marked retrievable, and give retrieval code two
--          explicit, separate entry points: trusted (reviewed only) and demo (explicit opt-in, labelled).
--   * chk_eligible_requires_verified : retrieval_eligibility = 'eligible' requires case_status = 'VERIFIED'
--   * chk_promoted_requires_verified : historical_case.promoted_at may only be set for status VERIFIED
--   * v_retrieval_trusted / v_retrieval_demo : views with security_invoker = true (PostgreSQL 15+; the
--     project uses pgvector/pgvector:pg16) so the caller's row-level security still applies. Without
--     security_invoker a view runs as its owner and would bypass tenant isolation.
-- Existing rows all have retrieval_eligibility = 'demo_only_until_expert_review' and status DRAFT, so the
-- constraints are satisfied by the current data. Nothing is deleted or relaxed.
-- STATUS: level 3 - applied via scripts/local_pg.sh on a scratch PostgreSQL 16.15 + pgvector 0.8.0 (see poc/execution_evidence/).
--         Not run on the pgvector/pgvector:pg16 Docker image. Apply on a disposable copy first.

BEGIN;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'chk_eligible_requires_verified') THEN
    ALTER TABLE operational_case ADD CONSTRAINT chk_eligible_requires_verified
      CHECK (retrieval_eligibility <> 'eligible' OR case_status = 'VERIFIED');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'chk_promoted_requires_verified') THEN
    ALTER TABLE historical_case ADD CONSTRAINT chk_promoted_requires_verified
      CHECK (promoted_at IS NULL OR status = 'VERIFIED');
  END IF;
END $$;

CREATE OR REPLACE VIEW v_retrieval_trusted WITH (security_invoker = true) AS
SELECT case_id, case_reference, organization_id, equipment_class_id, subsystem_id, subsystem_source_label,
       component_name, equipment_model_id, case_status, retrieval_eligibility, is_synthetic, model_is_illustrative
FROM operational_case
WHERE case_status = 'VERIFIED' AND retrieval_eligibility = 'eligible';

CREATE OR REPLACE VIEW v_retrieval_demo WITH (security_invoker = true) AS
SELECT case_id, case_reference, organization_id, equipment_class_id, subsystem_id, subsystem_source_label,
       component_name, equipment_model_id, case_status, retrieval_eligibility, is_synthetic, model_is_illustrative,
       TRUE AS demo_only_not_reviewed
FROM operational_case
WHERE is_synthetic
  AND case_status IN ('DRAFT', 'SUBMITTED')
  AND retrieval_eligibility = 'demo_only_until_expert_review';

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'opsense_app') THEN
    GRANT SELECT ON v_retrieval_trusted, v_retrieval_demo TO opsense_app;
  END IF;
END $$;

COMMIT;
