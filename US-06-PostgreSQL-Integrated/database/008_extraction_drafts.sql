-- 008_extraction_drafts.sql
-- US-06: persist structured extraction drafts separately from approved knowledge cases.
-- Apply after 007_row_level_security.sql.
-- transcription_id intentionally remains a nullable text reference until US-05
-- publishes its canonical transcription table/identifier contract.

BEGIN;

CREATE TABLE IF NOT EXISTS extraction_draft (
    id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id   UUID NOT NULL REFERENCES organization (organization_id) ON DELETE RESTRICT,
    transcription_id  TEXT,
    transcript        TEXT NOT NULL CHECK (length(btrim(transcript)) > 0),
    extraction        JSONB NOT NULL CHECK (jsonb_typeof(extraction) = 'object'),
    missing_fields    TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
    status            TEXT NOT NULL DEFAULT 'DRAFT'
                      CHECK (status IN ('DRAFT', 'UNDER_REVIEW', 'APPROVED', 'REJECTED')),
    review            JSONB NOT NULL DEFAULT '{}'::jsonb
                      CHECK (jsonb_typeof(review) = 'object'),
    history           JSONB NOT NULL DEFAULT '[]'::jsonb
                      CHECK (jsonb_typeof(history) = 'array'),
    created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT ck_extraction_draft_missing_fields
      CHECK (missing_fields <@ ARRAY['equipment','symptom','operating_condition','observation']::TEXT[])
);

CREATE INDEX IF NOT EXISTS ix_extraction_draft_org_created
    ON extraction_draft (organization_id, created_at DESC);
CREATE INDEX IF NOT EXISTS ix_extraction_draft_org_status
    ON extraction_draft (organization_id, status);
CREATE INDEX IF NOT EXISTS ix_extraction_draft_transcription
    ON extraction_draft (organization_id, transcription_id)
    WHERE transcription_id IS NOT NULL;

-- Match the existing tenant isolation pattern from migration 007.
ALTER TABLE extraction_draft ENABLE ROW LEVEL SECURITY;
ALTER TABLE extraction_draft FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS tenant_select ON extraction_draft;
DROP POLICY IF EXISTS tenant_insert ON extraction_draft;
DROP POLICY IF EXISTS tenant_update ON extraction_draft;

CREATE POLICY tenant_select ON extraction_draft
  FOR SELECT USING (
    organization_id = NULLIF(current_setting('app.current_org_id', true), '')::uuid
  );

CREATE POLICY tenant_insert ON extraction_draft
  FOR INSERT WITH CHECK (
    organization_id = NULLIF(current_setting('app.current_org_id', true), '')::uuid
  );

CREATE POLICY tenant_update ON extraction_draft
  FOR UPDATE USING (
    organization_id = NULLIF(current_setting('app.current_org_id', true), '')::uuid
  ) WITH CHECK (
    organization_id = NULLIF(current_setting('app.current_org_id', true), '')::uuid
  );

GRANT SELECT, INSERT, UPDATE ON extraction_draft TO opsense_app;

COMMIT;
