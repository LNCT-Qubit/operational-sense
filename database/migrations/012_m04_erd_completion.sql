-- 012_m04_erd_completion.sql
-- Completes M04 v1.2 ER diagram entities and attribute deltas identified in Part 1:
--   * Column deltas on operational_case, case_failure_mapping, source_reference, spare_part_reference
--   * Composite tenant key on asset_node for tenant-safe FKs
--   * Tenant-scoped assessment tables:
--       - asset_criticality_assessment
--       - criticality_factor_score
--       - fmea_assessment
-- Apply AFTER 011_login_lookup.sql. Additive and idempotent.
-- Matches repository security rules: ON DELETE RESTRICT, composite tenant FKs,
-- ENABLE + FORCE ROW LEVEL SECURITY on tenant tables, no DELETE grant to opsense_app.

BEGIN;

-- ---------------------------------------------------------------------------
-- 1. M04 v1.2 Column Deltas on Existing Tables
-- ---------------------------------------------------------------------------
ALTER TABLE operational_case
    ADD COLUMN IF NOT EXISTS case_title TEXT,
    ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_case_org_active
    ON operational_case (organization_id, created_at DESC)
    WHERE deleted_at IS NULL;

ALTER TABLE case_failure_mapping
    ADD COLUMN IF NOT EXISTS is_primary BOOLEAN NOT NULL DEFAULT FALSE;

ALTER TABLE source_reference
    ADD COLUMN IF NOT EXISTS publication_version TEXT,
    ADD COLUMN IF NOT EXISTS accessed_at TIMESTAMPTZ;

ALTER TABLE spare_part_reference
    ADD COLUMN IF NOT EXISTS associated_equipment TEXT;

-- Composite unique key on asset_node so tenant-scoped assessment tables can
-- reference (organization_id, asset_id) safely across tenants.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'uq_asset_node_org_id') THEN
    ALTER TABLE asset_node
      ADD CONSTRAINT uq_asset_node_org_id UNIQUE (organization_id, asset_id);
  END IF;
END $$;

-- ---------------------------------------------------------------------------
-- 2. asset_criticality_assessment (M04 v1.2)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS asset_criticality_assessment (
    assessment_id   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL REFERENCES organization (organization_id) ON DELETE RESTRICT,
    asset_id        BIGINT NOT NULL,
    method_version  TEXT NOT NULL CHECK (btrim(method_version) <> ''),
    assessed_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    assessed_by     TEXT,
    total_score     NUMERIC(10, 4) CHECK (total_score IS NULL OR total_score >= 0),
    category        TEXT,
    status          TEXT NOT NULL DEFAULT 'DRAFT'
        CHECK (status IN ('DRAFT', 'PENDING_REVIEW', 'SUBMITTED', 'APPROVED', 'REJECTED', 'REVOKED')),
    rationale       TEXT,
    deleted_at      TIMESTAMPTZ,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    CONSTRAINT uq_asset_criticality_org_id UNIQUE (organization_id, assessment_id),
    CONSTRAINT fk_asset_criticality_asset FOREIGN KEY (organization_id, asset_id)
        REFERENCES asset_node (organization_id, asset_id) ON DELETE RESTRICT
);

CREATE INDEX IF NOT EXISTS ix_asset_criticality_org_asset
    ON asset_criticality_assessment (organization_id, asset_id, assessed_at DESC)
    WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS ix_asset_criticality_org_status
    ON asset_criticality_assessment (organization_id, status)
    WHERE deleted_at IS NULL;

-- ---------------------------------------------------------------------------
-- 3. criticality_factor_score (M04 v1.2)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS criticality_factor_score (
    factor_score_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL REFERENCES organization (organization_id) ON DELETE RESTRICT,
    assessment_id   UUID NOT NULL,
    factor_code     TEXT NOT NULL CHECK (btrim(factor_code) <> ''),
    factor_name     TEXT,
    score           NUMERIC(10, 4) NOT NULL CHECK (score >= 0),
    weight          NUMERIC(10, 4) NOT NULL DEFAULT 1 CHECK (weight >= 0),
    rationale       TEXT,
    deleted_at      TIMESTAMPTZ,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    CONSTRAINT fk_criticality_factor_assessment FOREIGN KEY (organization_id, assessment_id)
        REFERENCES asset_criticality_assessment (organization_id, assessment_id) ON DELETE RESTRICT
);

CREATE INDEX IF NOT EXISTS ix_criticality_factor_org_assessment
    ON criticality_factor_score (organization_id, assessment_id)
    WHERE deleted_at IS NULL;

CREATE UNIQUE INDEX IF NOT EXISTS uq_criticality_factor_active_code
    ON criticality_factor_score (organization_id, assessment_id, factor_code)
    WHERE deleted_at IS NULL;

-- ---------------------------------------------------------------------------
-- 4. fmea_assessment (M04 v1.2)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS fmea_assessment (
    fmea_id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id    UUID NOT NULL REFERENCES organization (organization_id) ON DELETE RESTRICT,
    equipment_class_id TEXT NOT NULL REFERENCES equipment_class (equipment_class_id) ON DELETE RESTRICT,
    subsystem_id       BIGINT REFERENCES subsystem (subsystem_id) ON DELETE RESTRICT,
    asset_id           BIGINT,
    taxonomy_code      TEXT REFERENCES failure_mode_taxonomy (taxonomy_code) ON DELETE RESTRICT,
    component_label    TEXT,
    cause              TEXT,
    effects            TEXT,
    detection_method   TEXT,
    severity           SMALLINT NOT NULL CHECK (severity BETWEEN 1 AND 10),
    occurrence         SMALLINT NOT NULL CHECK (occurrence BETWEEN 1 AND 10),
    detection          SMALLINT NOT NULL CHECK (detection BETWEEN 1 AND 10),
    rpn                INTEGER GENERATED ALWAYS AS (severity * occurrence * detection) STORED,
    recommended_action TEXT,
    method_version     TEXT NOT NULL DEFAULT 'v1' CHECK (btrim(method_version) <> ''),
    review_status      TEXT NOT NULL DEFAULT 'PENDING_REVIEW'
        CHECK (review_status IN ('PENDING_REVIEW', 'APPROVED', 'REJECTED')),
    deleted_at         TIMESTAMPTZ,
    created_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    CONSTRAINT fk_fmea_assessment_asset FOREIGN KEY (organization_id, asset_id)
        REFERENCES asset_node (organization_id, asset_id) ON DELETE RESTRICT
);

CREATE INDEX IF NOT EXISTS ix_fmea_assessment_org_class
    ON fmea_assessment (organization_id, equipment_class_id)
    WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS ix_fmea_assessment_org_asset
    ON fmea_assessment (organization_id, asset_id)
    WHERE asset_id IS NOT NULL AND deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS ix_fmea_assessment_org_subsystem
    ON fmea_assessment (organization_id, subsystem_id)
    WHERE subsystem_id IS NOT NULL AND deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS ix_fmea_assessment_org_taxonomy
    ON fmea_assessment (organization_id, taxonomy_code)
    WHERE taxonomy_code IS NOT NULL AND deleted_at IS NULL;

-- ---------------------------------------------------------------------------
-- 5. Row-Level Security (matches 007/008/009) & Least-Privilege Grants
-- ---------------------------------------------------------------------------
DO $$
DECLARE
  t        TEXT;
  org_expr TEXT := $e$organization_id = NULLIF(current_setting('app.current_org_id', true), '')::uuid$e$;
BEGIN
  FOREACH t IN ARRAY ARRAY['asset_criticality_assessment', 'criticality_factor_score', 'fmea_assessment'] LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY', t);
    EXECUTE format('DROP POLICY IF EXISTS tenant_select ON %I', t);
    EXECUTE format('DROP POLICY IF EXISTS tenant_insert ON %I', t);
    EXECUTE format('DROP POLICY IF EXISTS tenant_update ON %I', t);
    EXECUTE format('CREATE POLICY tenant_select ON %I FOR SELECT USING (%s)', t, org_expr);
    EXECUTE format('CREATE POLICY tenant_insert ON %I FOR INSERT WITH CHECK (%s)', t, org_expr);
    EXECUTE format('CREATE POLICY tenant_update ON %I FOR UPDATE USING (%s) WITH CHECK (%s)', t, org_expr, org_expr);
  END LOOP;
END $$;

GRANT SELECT, INSERT, UPDATE ON
    asset_criticality_assessment,
    criticality_factor_score,
    fmea_assessment
TO opsense_app;

COMMIT;
