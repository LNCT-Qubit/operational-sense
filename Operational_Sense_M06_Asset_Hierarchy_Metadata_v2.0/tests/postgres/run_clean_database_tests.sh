#!/usr/bin/env bash
set -euo pipefail

: "${M06_TEST_DATABASE_URL:?Set M06_TEST_DATABASE_URL to a disposable PostgreSQL test database URL}"
: "${M06_ALLOW_DATABASE_MUTATION:?Set M06_ALLOW_DATABASE_MUTATION=YES only after confirming the target is disposable}"
if [[ "$M06_ALLOW_DATABASE_MUTATION" != "YES" ]]; then
  echo "Refusing to mutate database: set M06_ALLOW_DATABASE_MUTATION=YES after verifying the target." >&2
  exit 2
fi
if ! command -v psql >/dev/null 2>&1; then
  echo "NOT RUN: psql is not installed." >&2
  exit 3
fi

db_name="$(psql "$M06_TEST_DATABASE_URL" -X -A -t -v ON_ERROR_STOP=1 -c 'SELECT current_database()')"
if [[ "${db_name,,}" != *test* ]]; then
  echo "Refusing to mutate database '$db_name': database name must contain 'test'." >&2
  exit 4
fi

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
echo "Target disposable database: $db_name"
echo "Applying migration (it intentionally fails if M05-owned target tables already exist)..."
psql "$M06_TEST_DATABASE_URL" -X -v ON_ERROR_STOP=1 --single-transaction -f "$ROOT/sql/migrations/0001_m06_asset_hierarchy.sql"
echo "Loading reference seed data twice to verify idempotency..."
psql "$M06_TEST_DATABASE_URL" -X -v ON_ERROR_STOP=1 --single-transaction -f "$ROOT/sql/seed_data/seed_m06_reference_data.sql"
psql "$M06_TEST_DATABASE_URL" -X -v ON_ERROR_STOP=1 --single-transaction -f "$ROOT/sql/seed_data/seed_m06_reference_data.sql"
echo "Running source seed integrity assertions..."
psql "$M06_TEST_DATABASE_URL" -X -v ON_ERROR_STOP=1 -f "$ROOT/sql/validation/03_seed_data_integrity.sql"
echo "Running constraint and hierarchy tests (test data is rolled back)..."
psql "$M06_TEST_DATABASE_URL" -X -v ON_ERROR_STOP=1 -f "$ROOT/tests/postgres/verify_m06.sql"
echo "PASS: PostgreSQL migration, double seed, integrity checks, and hierarchy constraints completed."
