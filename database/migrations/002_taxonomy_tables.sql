-- 002_taxonomy_tables.sql
 
BEGIN;

CREATE TABLE IF NOT EXISTS equipment_class (
    equipment_class_id  TEXT PRIMARY KEY,                 -- e.g. EQ-PUMP, EQ-MOTOR, EQ-COMP
    class_name          TEXT NOT NULL UNIQUE,             -- e.g. Centrifugal Pump
    description         TEXT,
    review_status       TEXT NOT NULL DEFAULT 'PENDING_REVIEW'
        CHECK (review_status IN ('PENDING_REVIEW', 'APPROVED', 'REJECTED')),
    source_sheet        TEXT,                             -- provenance, as in M06 seed
    source_row_number   INTEGER,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS subsystem (
    subsystem_id        BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    subsystem_name      TEXT NOT NULL UNIQUE,             -- e.g. Bearing Assembly
    description         TEXT,
    review_status       TEXT NOT NULL DEFAULT 'PENDING_REVIEW'
        CHECK (review_status IN ('PENDING_REVIEW', 'APPROVED', 'REJECTED')),
    created_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Project-local failure-mode IDs (FM-xxx). These are NOT ISO 14224 codes.
CREATE TABLE IF NOT EXISTS failure_mode_vocabulary (
    failure_mode_id     TEXT PRIMARY KEY,                 -- e.g. FM-051
    preferred_label     TEXT NOT NULL,
    equipment_class_id  TEXT REFERENCES equipment_class (equipment_class_id) ON DELETE RESTRICT,
    note                TEXT,
    review_status       TEXT NOT NULL DEFAULT 'PENDING_REVIEW'
        CHECK (review_status IN ('PENDING_REVIEW', 'APPROVED', 'REJECTED'))
);

-- Taxonomy codes such as PUMP.BRNG.ROLL
CREATE TABLE IF NOT EXISTS failure_mode_taxonomy (
    taxonomy_code       TEXT PRIMARY KEY,
    equipment_class_id  TEXT NOT NULL REFERENCES equipment_class (equipment_class_id) ON DELETE RESTRICT,
    subsystem_id        BIGINT REFERENCES subsystem (subsystem_id) ON DELETE RESTRICT,
    component_name      TEXT,
    failure_mode_name   TEXT NOT NULL,
    description         TEXT,
    failure_effect      TEXT,
    failure_cause       TEXT,
    corrective_action   TEXT,
    review_status       TEXT NOT NULL DEFAULT 'PENDING_REVIEW'
        CHECK (review_status IN ('PENDING_REVIEW', 'APPROVED', 'REJECTED'))
);

CREATE INDEX IF NOT EXISTS idx_fm_vocab_class   ON failure_mode_vocabulary (equipment_class_id);
CREATE INDEX IF NOT EXISTS idx_fm_tax_class     ON failure_mode_taxonomy (equipment_class_id);
CREATE INDEX IF NOT EXISTS idx_fm_tax_subsystem ON failure_mode_taxonomy (subsystem_id);

COMMIT;
