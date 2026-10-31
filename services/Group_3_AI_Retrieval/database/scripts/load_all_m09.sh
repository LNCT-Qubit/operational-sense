#!/usr/bin/env bash
# M09: loads everything in an order derived from the foreign keys. Run AFTER ./scripts/migrate.sh.
# Needs the compose "db" service (run from the database/ directory). this Docker wrapper was NOT executed (no Docker available);
# the same file order WAS executed on a scratch PostgreSQL via scripts/local_pg.sh seed (see poc/execution_evidence/).
# Usage:  ./scripts/load_all_m09.sh
set -euo pipefail
SERVICE="${DB_SERVICE:-db}"; DB_USER="${DB_USER:-${POSTGRES_USER:-postgres}}"; DB_NAME="${DB_NAME:-${POSTGRES_DB:-opsense}}"
ROOT="$(cd "$(dirname "$0")/.." && pwd)"

run() {
  echo ">> $1"
  docker compose exec -T "$SERVICE" psql -X -v ON_ERROR_STOP=1 -U "$DB_USER" -d "$DB_NAME" < "$ROOT/$1"
}

run seed_data/005_seed_demo_organization.sql          # organization (FK target for everything below)
run seed_data/010_seed_reference_from_m06.sql         # equipment_class, subsystem, class_subsystem
run step4_01_import_sources.sql                       # source_reference
run Operational_Sense_Step4_Taxonomy_Vocabulary_FIXED.sql
run Operational_Sense_Step4_3_Measurement_References.sql
run Operational_Sense_Step4_4_Safety_and_Spare_Parts_FIXED.sql
run seed_data/020_seed_asset_hierarchy.sql            # demo assets (creates its 3 models itself)
run Operational_Sense_Step4_5_Import_Operational_Cases.sql
run Operational_Sense_Step4_6_Import_Diagnostic_Steps.sql
run Operational_Sense_Step4_Links_and_Verification_FIXED.sql
run sql/m09/m09_010_resolve_subsystem_fk.sql          # fills subsystem_id where the label matches exactly
run sql/m09/m09_040_apply_curation.sql                # Group 3 Final curation overlay (generated; idempotent): locations, acceptance text, 1 subsystem
run sql/m09/m09_020_retrieval_guards.sql              # DB-level guards: 'eligible' requires VERIFIED; v_retrieval_trusted / v_retrieval_demo
echo "Load finished. Now run: docker compose exec -T db psql -U $DB_USER -d $DB_NAME < sql/m09/m09_030_validate_live.sql"
