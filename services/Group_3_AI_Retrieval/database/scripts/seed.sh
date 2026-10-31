#!/usr/bin/env bash
# Loads idempotent reference and asset-hierarchy seeds. Run after scripts/migrate.sh.
set -euo pipefail
CONTAINER_SERVICE="${DB_SERVICE:-db}"
DB_USER="${DB_USER:-${POSTGRES_USER:-postgres}}"
DB_NAME="${DB_NAME:-${POSTGRES_DB:-opsense}}"
DIR="$(cd "$(dirname "$0")/.." && pwd)/seed_data"

if ! docker compose exec -T "$CONTAINER_SERVICE" psql -X -v ON_ERROR_STOP=1 -U "$DB_USER" -d "$DB_NAME" -c "SELECT to_regclass('public.asset_node')" | grep -q asset_node; then
  echo "ERROR: expected schema not found in database '$DB_NAME'. Run ./scripts/migrate.sh first and confirm the target database." >&2
  exit 2
fi
for f in "$DIR"/*.sql; do
  echo ">> Seeding $(basename "$f") into $DB_NAME"
  docker compose exec -T "$CONTAINER_SERVICE" psql -X -v ON_ERROR_STOP=1 -U "$DB_USER" -d "$DB_NAME" < "$f"
done
echo "Reference and asset-hierarchy seeds loaded."
