-- 011_login_lookup.sql
-- Login: narrow organization lookup by email. Apply AFTER 010_users.sql. Additive: nothing is dropped or changed.
-- Rollback: rollback/011_login_lookup.down.sql
--
-- WHAT THIS ADDS
--   login_org_id(email)   returns ONLY the organization_id of the account with that email (or NULL).
--
-- WHY IT IS NEEDED
--   app_user has ENABLE + FORCE ROW LEVEL SECURITY. A row is visible only when its organization_id equals
--   app.current_org_id. At login the backend has just an email, so it does not know the organization yet and a
--   plain SELECT would return zero rows. This function is the smallest safe bridge: it answers "which
--   organization does this email belong to?" and nothing else. The backend then opens a normal tenant
--   context (withTenant) for that organization and reads the full user row through RLS as usual.
--
-- WHAT IT DELIBERATELY DOES NOT DO
--   * It never returns password_hash, role, is_active or any other column.
--   * It does not change any RLS policy, grant, or table. RLS stays ENABLED and FORCED.
--   * It is not executable by PUBLIC, only by the application role opsense_app.
--
-- DESIGN NOTES (same hardening as signup_org_id in 010)
--   * SECURITY DEFINER: runs with the privileges of the function OWNER (the role that applies this migration:
--     postgres/superuser in the dev Docker setup), which is why it can see rows that RLS hides from opsense_app.
--     If the migration is ever applied by a role that is subject to RLS, the function would return NULL for
--     everyone; login would then fail closed (401), never open.
--   * SET search_path = public, pg_temp: a SECURITY DEFINER function must not trust the caller's search_path,
--     otherwise a caller could create a look-alike table/function in their own schema and hijack it.
--   * The email index is on lower(email) (uq_app_user_email), so comparing lower(email) = lower(p_email)
--     uses that index and is case-insensitive. Emails are globally unique, so there is at most one match.
--   * Run this migration as the owner/superuser (same as 007-010), NOT as opsense_app.

BEGIN;

CREATE OR REPLACE FUNCTION login_org_id(p_email TEXT) RETURNS UUID
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public, pg_temp
AS $$ SELECT organization_id FROM app_user WHERE lower(email) = lower(p_email) LIMIT 1 $$;

REVOKE ALL ON FUNCTION login_org_id(TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION login_org_id(TEXT) TO opsense_app;

COMMIT;
