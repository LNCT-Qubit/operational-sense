-- Rolls back 011_login_lookup.sql. Removes only the login_org_id() function; no data is touched.
BEGIN;
DROP FUNCTION IF EXISTS login_org_id(TEXT);
COMMIT;
