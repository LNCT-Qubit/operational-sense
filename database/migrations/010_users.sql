-- 010_users.sql
-- Public signup: user accounts. Apply AFTER 009_capture_pipeline.sql. Additive: nothing is dropped or deleted.
-- Rollback: rollback/010_users.down.sql
--
-- WHAT THIS ADDS
--   app_user          one row per account (name, email, bcrypt password hash, role, organization)
--   signup_org_id()   narrow lookup used by public signup to find the organization new users join
--   'Demo Org'        a development organization (seeded only if it does not exist yet)
--
-- DESIGN NOTES
--   * Table is called app_user because USER is a reserved word in PostgreSQL.
--   * Roles are the SAME four values the JWT verifier already accepts (middleware/auth.ts ROLES).
--     Public signup only ever creates TECHNICIAN or SUPERVISOR (enforced in the API, not here, so that an
--     administrator can later be created by a trusted process).
--   * Email is unique across ALL organizations (lower-cased index). Login does not know the organization
--     before it finds the user, so a global unique email keeps login unambiguous.
--   * RLS follows migration 007 exactly: ENABLE + FORCE, NULLIF(...,'') fails closed, SELECT + INSERT policies.
--     There is no UPDATE and no DELETE grant yet (login/last-login handling is a later task).
--   * Signup happens BEFORE anyone is authenticated, so the API cannot read the organization row through RLS
--     (a tenant can only see its own organization). signup_org_id() is a SECURITY DEFINER function that returns
--     ONLY the id of the organization with a given name. The backend decides the name (config SIGNUP_ORG_NAME);
--     the browser never supplies an organization.
--   * Run this migration as the owner/superuser (same as 007-009), NOT as opsense_app.

BEGIN;

CREATE TABLE IF NOT EXISTS app_user (
    user_id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL REFERENCES organization (organization_id) ON DELETE RESTRICT,
    full_name       TEXT NOT NULL CHECK (char_length(full_name) BETWEEN 1 AND 100),
    email           TEXT NOT NULL CHECK (char_length(email) BETWEEN 3 AND 254 AND email = lower(email)),
    password_hash   TEXT NOT NULL,
    role            TEXT NOT NULL CHECK (role IN ('TECHNICIAN', 'SUPERVISOR', 'RELIABILITY_ENGINEER', 'ADMIN')),
    is_active       BOOLEAN NOT NULL DEFAULT TRUE,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_app_user_email ON app_user (lower(email));
CREATE INDEX IF NOT EXISTS ix_app_user_org ON app_user (organization_id);

-- Row-Level Security (same expression as 007)
ALTER TABLE app_user ENABLE ROW LEVEL SECURITY;
ALTER TABLE app_user FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_select ON app_user;
DROP POLICY IF EXISTS tenant_insert ON app_user;
CREATE POLICY tenant_select ON app_user FOR SELECT
    USING (organization_id = NULLIF(current_setting('app.current_org_id', true), '')::uuid);
CREATE POLICY tenant_insert ON app_user FOR INSERT
    WITH CHECK (organization_id = NULLIF(current_setting('app.current_org_id', true), '')::uuid);

GRANT SELECT, INSERT ON app_user TO opsense_app;      -- no UPDATE, no DELETE

-- Narrow organization lookup for public signup
CREATE OR REPLACE FUNCTION signup_org_id(p_name TEXT) RETURNS UUID
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public, pg_temp
AS $$ SELECT organization_id FROM organization WHERE name = p_name $$;

REVOKE ALL ON FUNCTION signup_org_id(TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION signup_org_id(TEXT) TO opsense_app;

-- Development organization (organization.name is UNIQUE, so this is safe to re-run)
INSERT INTO organization (name) VALUES ('Demo Org') ON CONFLICT (name) DO NOTHING;

COMMIT;
