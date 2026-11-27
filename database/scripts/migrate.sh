#!/usr/bin/env bash
# Applies all unapplied migrations in sorted order to the opsense database running in Docker,
# tracking applied filenames in schema_migrations so re-runs are observable and idempotent.
# Usage: ./database/scripts/migrate.sh (or ./scripts/migrate.sh)
set -euo pipefail

export LC_ALL=C

CONTAINER="${CONTAINER:-opsense-db}"
DB_USER="${DB_USER:-postgres}"
DB_NAME="${DB_NAME:-opsense}"
DIR="$(cd "$(dirname "$0")/.." && pwd)/migrations"

run_psql() {
  docker exec -i "$CONTAINER" psql -v ON_ERROR_STOP=1 -U "$DB_USER" -d "$DB_NAME" "$@"
}

# Ensure the migration tracking table exists before inspecting or applying migrations.
run_psql >/dev/null <<'SQL'
CREATE TABLE IF NOT EXISTS schema_migrations (
    filename   TEXT PRIMARY KEY,
    applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
SQL

shopt -s nullglob
migration_files=("$DIR"/*.sql)
if [[ ${#migration_files[@]} -eq 0 ]]; then
  echo "No migration files found in $DIR."
  exit 0
fi

for f in "${migration_files[@]}"; do
  base="$(basename "$f")"
  escaped_base="${base//\'/\'\'}"

  already_applied="$(
    run_psql -tAc "SELECT 1 FROM schema_migrations WHERE filename = '${escaped_base}'" < /dev/null
  )"

  if [[ "$already_applied" == "1" ]]; then
    echo ">> Skipping $base (already applied)"
    continue
  fi

  echo ">> Applying $base"
  run_psql --single-transaction < "$f"
  run_psql -c "INSERT INTO schema_migrations (filename) VALUES ('${escaped_base}') ON CONFLICT (filename) DO NOTHING;" < /dev/null >/dev/null
  echo ">> Recorded $base in schema_migrations"
done

echo "All migrations up to date."
