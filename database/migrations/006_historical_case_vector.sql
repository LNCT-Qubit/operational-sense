-- 006_historical_case_vector.sql
 
BEGIN;

CREATE TABLE IF NOT EXISTS historical_case (
    case_id             UUID PRIMARY KEY REFERENCES operational_case (case_id) ON DELETE RESTRICT,
    organization_id     UUID NOT NULL REFERENCES organization (organization_id) ON DELETE RESTRICT,
    equipment_class_id  TEXT NOT NULL REFERENCES equipment_class (equipment_class_id) ON DELETE RESTRICT,
    subsystem_id        BIGINT REFERENCES subsystem (subsystem_id) ON DELETE RESTRICT,
    equipment_model_id  UUID REFERENCES equipment_model (equipment_model_id) ON DELETE RESTRICT,
    status              TEXT NOT NULL
        CHECK (status IN ('DRAFT', 'SUBMITTED', 'VERIFIED', 'REJECTED', 'REVOKED')),
    embedding           vector(384),
    promoted_at         TIMESTAMPTZ
);

-- Supports the STRICT filter: class AND subsystem AND status
CREATE INDEX IF NOT EXISTS idx_hc_strict ON historical_case (equipment_class_id, subsystem_id, status);
CREATE INDEX IF NOT EXISTS idx_hc_org    ON historical_case (organization_id);

-- Full-text baseline for the Sprint 4 evaluation (tsvector / ts_rank)
CREATE INDEX IF NOT EXISTS idx_case_fts ON operational_case USING GIN (
    to_tsvector('simple',
        coalesce(symptom_text, '') || ' ' ||
        coalesce(symptom_structured, '') || ' ' ||
        coalesce(failure_effect, '') || ' ' ||
        coalesce(primary_suspected_cause, '')));

COMMIT;
