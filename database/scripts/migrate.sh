#!/usr/bin/env bash
# Applies all migrations in order to the opsense database running in Docker.
# Usage: ./scripts/migrate.sh
set -euo pipefail

CONTAINER="${CONTAINER:-opsense-db}"
DB_USER="${DB_USER:-postgres}"
DB_NAME="${DB_NAME:-opsense}"
DIR="$(cd "$(dirname "$0")/.." && pwd)/migrations"

for f in "$DIR"/*.sql; do
  echo ">> Applying $(basename "$f")"
  docker exec -i "$CONTAINER" psql -v ON_ERROR_STOP=1 -U "$DB_USER" -d "$DB_NAME" < "$f"
done

echo "All migrations applied."
