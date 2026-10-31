#!/usr/bin/env bash
# Sets (or rotates) the opsense_app password from the environment. Migration 007 contains NO password.
#
#   OPSENSE_APP_PASSWORD   required; read from the environment (e.g. from .env), never from an argument
#   OPSENSE_APP_USER       optional; default opsense_app
#
# The password is forwarded to the container as an environment variable (NOT on a command line, so it does
# not appear in `ps`) and applied with psql's \getenv + format(%L), which quotes it safely.
# Note: ALTER ROLE ... PASSWORD sends the statement to the server, so avoid log_statement=all on shared servers.
# Docker variant: NOT executed (no Docker available). The same \getenv/format(%L) SQL WAS executed on a scratch PostgreSQL via
# scripts/local_pg.sh password (see poc/execution_evidence/live_app_role_login_check.txt).
# Run from database/ after ./scripts/migrate.sh.
set -euo pipefail
SERVICE="${DB_SERVICE:-db}"; DB_USER="${DB_USER:-${POSTGRES_USER:-postgres}}"; DB_NAME="${DB_NAME:-${POSTGRES_DB:-opsense}}"
APP_USER="${OPSENSE_APP_USER:-opsense_app}"

[ -n "${OPSENSE_APP_PASSWORD:-}" ] || { echo "ERROR: OPSENSE_APP_PASSWORD is not set (put it in .env, see .env.example)." >&2; exit 2; }
case "$OPSENSE_APP_PASSWORD" in
  CHANGE_ME*) echo "ERROR: OPSENSE_APP_PASSWORD is still the placeholder; choose a real local value." >&2; exit 2;;
esac
[ "${#OPSENSE_APP_PASSWORD}" -ge 12 ] || { echo "ERROR: OPSENSE_APP_PASSWORD must be at least 12 characters." >&2; exit 2; }

export APP_USER
docker compose exec -T -e OPSENSE_APP_PASSWORD -e APP_USER "$SERVICE" \
  psql -X -v ON_ERROR_STOP=1 -U "$DB_USER" -d "$DB_NAME" <<'SQL'
\getenv app_pw OPSENSE_APP_PASSWORD
\getenv app_user APP_USER
SELECT format('ALTER ROLE %I WITH LOGIN PASSWORD %L NOSUPERUSER NOBYPASSRLS', :'app_user', :'app_pw') \gexec
SELECT rolname, rolsuper, rolbypassrls, (rolpassword IS NOT NULL) AS has_password
FROM pg_authid WHERE rolname = :'app_user';
SQL
echo "Password configured for ${APP_USER}. Expect rolsuper=f, rolbypassrls=f, has_password=t above."
