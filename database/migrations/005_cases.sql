-- 005_cases.sql
 
BEGIN;

CREATE TABLE IF NOT EXISTS operational_case (
    case_id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    case_reference        TEXT NOT NULL,                 -- e.g. CASE-PUMP-001
    organization_id       UUID NOT NULL REFERENCES organization (organization_id) ON DELETE RESTRICT,
    client_capture_id     UUID,                          -- idempotency key (Sprint 2); NULL for seed data

    -- equipment context (denormalized for retrieval)
    equipment_class_id    TEXT NOT NULL REFERENCES equipment_class (equipment_class_id) ON DELETE RESTRICT,
    subsystem_id          BIGINT,
    subsystem_source_label TEXT,                         -- original wording from the source workbook, always kept
    component_name        TEXT,
    equipment_model_id    UUID REFERENCES equipment_model (equipment_model_id) ON DELETE RESTRICT,
    asset_id              BIGINT REFERENCES asset_node (asset_id) ON DELETE RESTRICT,  -- NULL for synthetic cases (M04)
    plant_facility        TEXT,
    production_line       TEXT,

    -- symptom and operating context
    symptom_category      TEXT,
    symptom_text          TEXT NOT NULL,                 -- technician wording (Import_View: symptom_reported_hinglish)
    symptom_structured    TEXT,
    operating_status      TEXT,
    symptom_frequency     TEXT,
    severity_proposed     TEXT,

    -- cause, effect, diagnosis, action
    primary_suspected_cause TEXT,
    alternative_causes    TEXT,
    confirmed_cause       TEXT,                          -- NULL until confirmed
    root_cause_confirmation TEXT,
    failure_mechanism     TEXT,
    failure_effect        TEXT,
    differential_diagnosis TEXT,
    corrective_action_text TEXT,                         -- Import_View: tier3_action
    required_spares_text  TEXT,
    post_repair_verification TEXT,
    acceptance_criteria   TEXT,
    recurrence_prevention TEXT,
    early_warning         TEXT,

    -- provenance and quality
    case_origin           TEXT,
    evidence_type         TEXT,
    source_reliability    TEXT CHECK (source_reliability IN ('A', 'B', 'C', 'D')),
    is_synthetic          BOOLEAN NOT NULL DEFAULT TRUE,
    model_is_illustrative BOOLEAN NOT NULL DEFAULT TRUE,
    needs_depth_expansion BOOLEAN NOT NULL DEFAULT FALSE,

    -- lifecycle
    case_status           TEXT NOT NULL DEFAULT 'DRAFT'
        CHECK (case_status IN ('DRAFT', 'SUBMITTED', 'VERIFIED', 'REJECTED', 'REVOKED')),
    retrieval_eligibility TEXT NOT NULL DEFAULT 'demo_only_until_expert_review'
        CHECK (retrieval_eligibility IN ('demo_only_until_expert_review', 'eligible', 'excluded')),
    verification_duration_seconds INTEGER CHECK (verification_duration_seconds >= 0),
    created_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at            TIMESTAMPTZ NOT NULL DEFAULT now(),

    CONSTRAINT uq_case_reference UNIQUE (organization_id, case_reference),
    CONSTRAINT uq_org_capture    UNIQUE (organization_id, client_capture_id),
    CONSTRAINT chk_symptom_not_blank CHECK (length(btrim(symptom_text)) > 0),
    -- subsystem must belong to the class; skipped automatically when subsystem_id is NULL
    CONSTRAINT fk_case_class_subsystem FOREIGN KEY (equipment_class_id, subsystem_id)
        REFERENCES class_subsystem (equipment_class_id, subsystem_id) ON DELETE RESTRICT
);

CREATE TABLE IF NOT EXISTS troubleshooting_step (
    step_id             BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    step_reference      TEXT,                            -- e.g. DS-PUMP-001-01
    case_id             UUID NOT NULL REFERENCES operational_case (case_id) ON DELETE RESTRICT,
    step_number         INTEGER NOT NULL CHECK (step_number > 0),
    tier                SMALLINT NOT NULL CHECK (tier IN (1, 2, 3)),
    diagnostic_question TEXT,
    check_measurement   TEXT NOT NULL,
    required_instrument TEXT,
    expected_observation TEXT,
    interpretation      TEXT,
    possible_failure_indication TEXT,
    next_step           TEXT,
    safety_warning      TEXT,
    supervisor_approval_required BOOLEAN NOT NULL DEFAULT FALSE,
    UNIQUE (case_id, step_number),
    -- Tier 3 always needs supervisor approval (proposal Section 7)
    CONSTRAINT chk_tier3_needs_approval CHECK (tier <> 3 OR supervisor_approval_required)
);

CREATE TABLE IF NOT EXISTS case_failure_mapping (
    mapping_id          BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    case_id             UUID NOT NULL REFERENCES operational_case (case_id) ON DELETE RESTRICT,
    taxonomy_code       TEXT REFERENCES failure_mode_taxonomy (taxonomy_code) ON DELETE RESTRICT,
    failure_mode_id     TEXT REFERENCES failure_mode_vocabulary (failure_mode_id) ON DELETE RESTRICT,
    mapping_status      TEXT,                            -- e.g. 'MAPPED - cross-link provisional'
    review_note         TEXT
);

CREATE TABLE IF NOT EXISTS case_source (
    case_id        UUID NOT NULL REFERENCES operational_case (case_id) ON DELETE RESTRICT,
    source_id      TEXT NOT NULL REFERENCES source_reference (source_id) ON DELETE RESTRICT,
    relation_note  TEXT,
    evidence_role  TEXT,
    PRIMARY KEY (case_id, source_id)
);

CREATE TABLE IF NOT EXISTS case_spare_part (
    case_id        UUID   NOT NULL REFERENCES operational_case (case_id) ON DELETE RESTRICT,
    spare_part_id  BIGINT NOT NULL REFERENCES spare_part_reference (spare_part_id) ON DELETE RESTRICT,
    usage_note     TEXT,
    PRIMARY KEY (case_id, spare_part_id)
);

CREATE TABLE IF NOT EXISTS case_safety_procedure (
    case_id             UUID   NOT NULL REFERENCES operational_case (case_id) ON DELETE RESTRICT,
    safety_procedure_id BIGINT NOT NULL REFERENCES safety_procedure (safety_procedure_id) ON DELETE RESTRICT,
    application_note    TEXT,
    PRIMARY KEY (case_id, safety_procedure_id)
);

-- Dated review events. A blank reviewer/date with PENDING is NOT approval.
CREATE TABLE IF NOT EXISTS case_verification (
    verification_id     BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    case_id             UUID NOT NULL REFERENCES operational_case (case_id) ON DELETE RESTRICT,
    reviewer            TEXT,
    review_date         DATE,
    technical_accuracy_status    TEXT NOT NULL DEFAULT 'PENDING',
    taxonomy_mapping_status      TEXT,
    source_verification_status   TEXT NOT NULL DEFAULT 'PENDING',
    safety_review_status         TEXT NOT NULL DEFAULT 'PENDING',
    measurement_validation_status TEXT NOT NULL DEFAULT 'PENDING',
    overall_decision    TEXT NOT NULL DEFAULT 'PENDING'
        CHECK (overall_decision IN ('PENDING', 'APPROVED', 'APPROVED WITH CHANGES', 'REJECTED')),
    comments            TEXT,
    -- an approval must name a reviewer and a date
    CONSTRAINT chk_approval_has_reviewer CHECK (
        overall_decision NOT IN ('APPROVED', 'APPROVED WITH CHANGES')
        OR (reviewer IS NOT NULL AND review_date IS NOT NULL))
);

CREATE TABLE IF NOT EXISTS media_evidence (
    media_id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id  UUID NOT NULL REFERENCES organization (organization_id) ON DELETE RESTRICT,
    case_id          UUID NOT NULL REFERENCES operational_case (case_id) ON DELETE RESTRICT,
    media_type       TEXT NOT NULL CHECK (media_type IN ('photo', 'video', 'audio')),
    storage_uri      TEXT NOT NULL,
    created_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Append-only for the application role (see 008)
CREATE TABLE IF NOT EXISTS audit_log (
    audit_id         BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    organization_id  UUID NOT NULL REFERENCES organization (organization_id) ON DELETE RESTRICT,
    actor            TEXT,
    action           TEXT NOT NULL,
    entity_type      TEXT NOT NULL,
    entity_id        TEXT,
    details          JSONB,
    created_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_case_org            ON operational_case (organization_id);
CREATE INDEX IF NOT EXISTS idx_case_class_sub      ON operational_case (equipment_class_id, subsystem_id, case_status);
CREATE INDEX IF NOT EXISTS idx_case_model          ON operational_case (equipment_model_id);
CREATE INDEX IF NOT EXISTS idx_case_asset          ON operational_case (asset_id);
CREATE INDEX IF NOT EXISTS idx_step_case           ON troubleshooting_step (case_id);
CREATE INDEX IF NOT EXISTS idx_mapping_case        ON case_failure_mapping (case_id);
CREATE INDEX IF NOT EXISTS idx_mapping_taxonomy    ON case_failure_mapping (taxonomy_code);
CREATE INDEX IF NOT EXISTS idx_mapping_vocab       ON case_failure_mapping (failure_mode_id);
CREATE INDEX IF NOT EXISTS idx_case_source_source  ON case_source (source_id);
CREATE INDEX IF NOT EXISTS idx_case_spare_part     ON case_spare_part (spare_part_id);
CREATE INDEX IF NOT EXISTS idx_case_safety_proc    ON case_safety_procedure (safety_procedure_id);
CREATE INDEX IF NOT EXISTS idx_verification_case   ON case_verification (case_id);
CREATE INDEX IF NOT EXISTS idx_media_case          ON media_evidence (case_id);
CREATE INDEX IF NOT EXISTS idx_media_org           ON media_evidence (organization_id);
CREATE INDEX IF NOT EXISTS idx_audit_org           ON audit_log (organization_id);

COMMIT;
