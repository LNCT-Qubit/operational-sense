#!/usr/bin/env bash
# Applies migrations 001..007 to the configured database in the compose PostgreSQL service.
# Safe for repeatable local development migrations; does not drop data.
set -euo pipefail

DB_USER="${DB_USER:-${POSTGRES_USER:-postgres}}"
DB_NAME="${DB_NAME:-${POSTGRES_DB:-opsense}}"
SERVICE="${DB_SERVICE:-db}"

if ! command -v docker >/dev/null 2>&1; then
  echo "ERROR: Docker CLI not found. Install/start Docker Desktop, then retry." >&2
  exit 2
fi
if ! docker compose ps --status running --services | grep -Fxq "$SERVICE"; then
  echo "ERROR: compose service '$SERVICE' is not running. Start it with: docker compose up -d --wait" >&2
  exit 2
fi

# A named volume can pre-date POSTGRES_DB. In that case the image will not create the
# requested database on restart. Ensure the target exists in the running cluster.
docker compose exec -T "$SERVICE" psql -X -v ON_ERROR_STOP=1 -U "$DB_USER" -d postgres -v db_name="$DB_NAME" <<'SQL'
SELECT format('CREATE DATABASE %I', :'db_name')
WHERE NOT EXISTS (SELECT 1 FROM pg_database WHERE datname = :'db_name')
\gexec
SQL

DIR="$(cd "$(dirname "$0")/.." && pwd)/migrations"
echo "Target: service=$SERVICE database=$DB_NAME user=$DB_USER"
for f in "$DIR"/*.sql; do
  echo ">> Applying $(basename "$f") to $DB_NAME"
  docker compose exec -T "$SERVICE" psql -X -v ON_ERROR_STOP=1 -U "$DB_USER" -d "$DB_NAME" < "$f"
done

echo ">> Verifying target database and expected relations"
docker compose exec -T "$SERVICE" psql -X -v ON_ERROR_STOP=1 -U "$DB_USER" -d "$DB_NAME" -c \
  "SELECT current_database() AS database, current_user AS user, to_regclass('public.operational_case') AS operational_case, to_regclass('public.historical_case') AS historical_case, to_regclass('public.asset_node') AS asset_node;"
echo "Migrations applied. Confirm all expected relation names are non-NULL above."
