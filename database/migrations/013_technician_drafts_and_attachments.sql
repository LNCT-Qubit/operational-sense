-- 013_technician_drafts_and_attachments.sql
-- Offline sync persistence for US-03 (IndexedDB draftStore) and US-04 (syncManager / uploadService).
-- Apply AFTER 012_m04_erd_completion.sql. Additive and idempotent.
--
-- WHAT THIS ADDS
--   technician_draft   idempotent server mirror of offline TechnicianDraft capture records
--                      (supports voice + text-only drafts, optional recording/extraction/case links)
--   draft_attachment   idempotent metadata/storage references for pre-case DraftAttachment files
--
-- DESIGN NOTES
--   * In TechnicianPage.tsx, draft.mode is saved as 'Voice' or 'Text'. capture_mode here
--     normalizes to lowercase ('voice', 'text') and backend validation normalizes case.
--   * created_by / reviewed_by / uploaded_by store UUID user identifiers WITHOUT an FK to
--     app_user(user_id) because:
--       1. Existing backend integration tests (tests/integration/postgres.integration.test.ts,
--          tests/helpers/fakes.ts) and database/scripts/verify_us07.sql seed only `organization`
--          without creating rows in `app_user` (and scripts/dev-token.ts mints synthetic sub IDs).
--       2. Block 1's `app_user` table (010_users.sql) is frozen and does not define a composite
--          UNIQUE (organization_id, user_id) constraint for a tenant-safe composite FK.
--       3. This matches recording.uploaded_by in 009_capture_pipeline.sql.
--   * All tenant FKs carry organization_id and use ON DELETE RESTRICT.
--   * Soft delete uses deleted_at TIMESTAMPTZ; opsense_app receives SELECT, INSERT, UPDATE only.

BEGIN;

-- ---------------------------------------------------------------------------
-- 1. Ensure composite tenant unique keys exist on referenced tenant tables
-- ---------------------------------------------------------------------------
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'uq_operational_case_org_id') THEN
    ALTER TABLE operational_case
      ADD CONSTRAINT uq_operational_case_org_id UNIQUE (organization_id, case_id);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'uq_extraction_draft_org_id') THEN
    ALTER TABLE extraction_draft
      ADD CONSTRAINT uq_extraction_draft_org_id UNIQUE (organization_id, id);
  END IF;
END $$;

-- ---------------------------------------------------------------------------
-- 2. technician_draft
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS technician_draft (
    draft_id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id     UUID NOT NULL REFERENCES organization (organization_id) ON DELETE RESTRICT,
    client_draft_id     UUID NOT NULL,
    created_by          UUID NOT NULL,
    recording_id        UUID NULL,
    extraction_draft_id UUID NULL,
    case_id             UUID NULL,

    -- Capture fields matching TechnicianDraft (apps/web/src/features/draftStore.ts)
    capture_mode        TEXT NOT NULL CHECK (capture_mode IN ('voice', 'text')),
    equipment           TEXT NOT NULL DEFAULT '',
    subsystem           TEXT NOT NULL DEFAULT '',
    symptom             TEXT NOT NULL DEFAULT '',
    observation         TEXT NOT NULL DEFAULT '',
    probable_cause      TEXT NOT NULL DEFAULT '',
    action_taken        TEXT NOT NULL DEFAULT '',
    parts_used          TEXT NOT NULL DEFAULT '',
    safety_notes        TEXT NOT NULL DEFAULT '',
    duration_ms         INTEGER NULL CHECK (duration_ms IS NULL OR duration_ms >= 0),
    recorded_at         TIMESTAMPTZ NULL,
    client_created_at   TIMESTAMPTZ NULL,
    client_updated_at   TIMESTAMPTZ NULL,

    -- Workflow & soft delete
    status              TEXT NOT NULL DEFAULT 'PENDING_REVIEW'
        CHECK (status IN ('DRAFT', 'PENDING_REVIEW', 'APPROVED', 'REJECTED')),
    reviewed_by         UUID NULL,
    reviewed_at         TIMESTAMPTZ NULL,
    review_comment      TEXT NULL,
    deleted_at          TIMESTAMPTZ NULL,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    CONSTRAINT uq_technician_draft_org_client UNIQUE (organization_id, client_draft_id),
    CONSTRAINT uq_technician_draft_org_id     UNIQUE (organization_id, draft_id),
    CONSTRAINT fk_technician_draft_recording  FOREIGN KEY (organization_id, recording_id)
        REFERENCES recording (organization_id, recording_id) ON DELETE RESTRICT,
    CONSTRAINT fk_technician_draft_extraction FOREIGN KEY (organization_id, extraction_draft_id)
        REFERENCES extraction_draft (organization_id, id) ON DELETE RESTRICT,
    CONSTRAINT fk_technician_draft_case       FOREIGN KEY (organization_id, case_id)
        REFERENCES operational_case (organization_id, case_id) ON DELETE RESTRICT
);

CREATE INDEX IF NOT EXISTS ix_technician_draft_org_created
    ON technician_draft (organization_id, created_at DESC)
    WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS ix_technician_draft_org_status
    ON technician_draft (organization_id, status)
    WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS ix_technician_draft_org_creator_created
    ON technician_draft (organization_id, created_by, created_at DESC)
    WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS ix_technician_draft_org_recording
    ON technician_draft (organization_id, recording_id)
    WHERE recording_id IS NOT NULL;

-- ---------------------------------------------------------------------------
-- 3. draft_attachment
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS draft_attachment (
    attachment_id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id       UUID NOT NULL REFERENCES organization (organization_id) ON DELETE RESTRICT,
    draft_id              UUID NOT NULL,
    client_attachment_key TEXT NOT NULL CHECK (btrim(client_attachment_key) <> ''),
    media_type            TEXT NOT NULL CHECK (media_type IN ('photo', 'video', 'audio', 'other')),
    file_name             TEXT NOT NULL CHECK (btrim(file_name) <> ''),
    mime_type             TEXT NOT NULL CHECK (btrim(mime_type) <> ''),
    size_bytes            BIGINT NOT NULL CHECK (size_bytes > 0),
    sha256                TEXT NOT NULL CHECK (sha256 ~ '^[0-9a-f]{64}$'),
    storage_uri           TEXT NOT NULL CHECK (btrim(storage_uri) <> ''),
    uploaded_by           UUID NOT NULL,
    deleted_at            TIMESTAMPTZ NULL,
    created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    CONSTRAINT fk_draft_attachment_draft FOREIGN KEY (organization_id, draft_id)
        REFERENCES technician_draft (organization_id, draft_id) ON DELETE RESTRICT,
    CONSTRAINT uq_draft_attachment_org_draft_key UNIQUE (organization_id, draft_id, client_attachment_key)
);

CREATE INDEX IF NOT EXISTS ix_draft_attachment_org_draft
    ON draft_attachment (organization_id, draft_id)
    WHERE deleted_at IS NULL;

-- ---------------------------------------------------------------------------
-- 4. Row-Level Security (matches 007/008/009) & Least-Privilege Grants
-- ---------------------------------------------------------------------------
DO $$
DECLARE
  t        TEXT;
  org_expr TEXT := $e$organization_id = NULLIF(current_setting('app.current_org_id', true), '')::uuid$e$;
BEGIN
  FOREACH t IN ARRAY ARRAY['technician_draft', 'draft_attachment'] LOOP
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

GRANT SELECT, INSERT, UPDATE ON technician_draft, draft_attachment TO opsense_app;

COMMIT;
