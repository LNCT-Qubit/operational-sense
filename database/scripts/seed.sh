#!/usr/bin/env bash
# Loads seed data files in order. Run AFTER ./scripts/migrate.sh
set -euo pipefail
CONTAINER="${CONTAINER:-opsense-db}"; DB_USER="${DB_USER:-postgres}"; DB_NAME="${DB_NAME:-opsense}"
DIR="$(cd "$(dirname "$0")/.." && pwd)/seed_data"
for f in "$DIR"/*.sql; do
  echo ">> Seeding $(basename "$f")"
  docker exec -i "$CONTAINER" psql -v ON_ERROR_STOP=1 -U "$DB_USER" -d "$DB_NAME" < "$f"
done
echo "Seed data loaded."
