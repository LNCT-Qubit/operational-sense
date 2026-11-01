-- 003_reference_tables.sql

BEGIN;

CREATE TABLE IF NOT EXISTS source_reference (
    source_id           TEXT PRIMARY KEY,                 -- e.g. S01
    title               TEXT NOT NULL,
    publisher           TEXT,
    identifier          TEXT,
    url                 TEXT,
    access_level        TEXT,
    reliability_class   TEXT CHECK (reliability_class IN ('A', 'B', 'C', 'D')),
    supports            TEXT,
    verification_status TEXT NOT NULL DEFAULT 'not_verified'
        CHECK (verification_status IN ('not_verified', 'verified', 'rejected'))
);

CREATE TABLE IF NOT EXISTS safety_procedure (
    safety_procedure_id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    equipment_class_id  TEXT REFERENCES equipment_class (equipment_class_id) ON DELETE RESTRICT,  -- NULL = applies to all
    hazard              TEXT NOT NULL,
    requirement         TEXT NOT NULL,
    scope_type          TEXT,                              -- e.g. General vs Site-specific
    source_id           TEXT REFERENCES source_reference (source_id) ON DELETE RESTRICT
);

CREATE TABLE IF NOT EXISTS measurement_reference (
    measurement_reference_id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    equipment_class_id       TEXT NOT NULL REFERENCES equipment_class (equipment_class_id) ON DELETE RESTRICT,
    subsystem_id             BIGINT REFERENCES subsystem (subsystem_id) ON DELETE RESTRICT,
    taxonomy_code            TEXT REFERENCES failure_mode_taxonomy (taxonomy_code) ON DELETE RESTRICT,
    source_id                TEXT REFERENCES source_reference (source_id) ON DELETE RESTRICT,
    parameter                TEXT NOT NULL,
    unit                     TEXT,
    instrument               TEXT,
    measurement_location     TEXT,
    reference_value_policy   TEXT,
    applicability_conditions TEXT,
    limitations              TEXT
);

CREATE TABLE IF NOT EXISTS spare_part_reference (
    spare_part_id       BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    part_name           TEXT NOT NULL,
    function            TEXT,
    compatibility_note  TEXT,                              -- part numbers not assigned in source data
    source_id           TEXT REFERENCES source_reference (source_id) ON DELETE RESTRICT
);

CREATE INDEX IF NOT EXISTS idx_safety_class     ON safety_procedure (equipment_class_id);
CREATE INDEX IF NOT EXISTS idx_meas_class       ON measurement_reference (equipment_class_id);
CREATE INDEX IF NOT EXISTS idx_meas_subsystem   ON measurement_reference (subsystem_id);
CREATE INDEX IF NOT EXISTS idx_meas_taxonomy    ON measurement_reference (taxonomy_code);

COMMIT;
