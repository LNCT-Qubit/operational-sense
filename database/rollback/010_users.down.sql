-- Rolls back 010_users.sql. Destroys all user accounts. Leaves the 'Demo Org' organization in place.
BEGIN;
DROP FUNCTION IF EXISTS signup_org_id(TEXT);
DROP TABLE IF EXISTS app_user;
COMMIT;
