#!/usr/bin/env bash
# Docker-free runner: applies the SAME migrations / seeds / loaders to any reachable PostgreSQL (with the pgvector
# extension available) using plain psql and the standard PG* environment variables. Use a DISPOSABLE database.
#
#   export PGHOST=127.0.0.1 PGPORT=5432 PGUSER=postgres PGPASSWORD=... PGDATABASE=opsense
#   export OPSENSE_APP_PASSWORD='<12+ chars>'          # for the "password" step (never committed)
#   bash database/scripts/local_pg.sh all              # migrate -> password -> seed -> verify
#   bash database/scripts/local_pg.sh migrate|password|seed|verify
#
# FAIL-FAST CONTRACT (regression-tested by tests/test_local_pg_failure_handling.py):
#   * every psql call is `psql -X -v ON_ERROR_STOP=1`;
#   * psql output goes to a temp file, so the psql EXIT STATUS is read directly (no pipe can hide it);
#   * the first failing migration / seed / verification file stops the run with a non-zero exit (1);
#   * verification output containing a FAIL result or an ERROR line, or containing no PASS line at all, exits non-zero;
#   * NOTICE lines are filtered from the DISPLAY only, after the exit status has been captured.
# Status: executed against a scratch PostgreSQL 16.15 + pgvector 0.8.0 (source build) - see poc/execution_evidence/.
# It has NOT been run against the pgvector/pgvector:pg16 Docker image.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
PSQL=(psql -X -v ON_ERROR_STOP=1)
command -v psql >/dev/null 2>&1 || { echo "ERROR: psql not found on PATH" >&2; exit 2; }
: "${PGDATABASE:?set PGDATABASE (and PGHOST/PGPORT/PGUSER/PGPASSWORD)}"
TMP="$(mktemp -d)"; trap 'rm -rf "$TMP"' EXIT

die() { echo "ERROR: $*" >&2; exit 1; }

# run_sql_file <path> <label> [show-all]  -> runs the file; on failure prints the full psql output and exits 1.
run_sql_file() {
  local file="$1" label="$2" out="$TMP/out.$$.txt" rc=0
  echo ">> $label"
  "${PSQL[@]}" -q -f "$file" >"$out" 2>&1 || rc=$?
  sed '/NOTICE:/d' "$out"                        # display only; sed always exits 0 and cannot mask $rc
  if [ "$rc" -ne 0 ]; then
    die "psql exited with status $rc while applying $label; stopping (later steps NOT run)"
  fi
  if grep -Eq '(^|[[:space:]:])ERROR:' "$out"; then die "ERROR reported while applying $label"; fi
}

step_migrate() {
  local f n=0
  for f in "$ROOT"/migrations/*.sql; do run_sql_file "$f" "$(basename "$f")"; n=$((n+1)); done
  [ "$n" -gt 0 ] || die "no migrations found in $ROOT/migrations"
}

step_password() {
  [ -n "${OPSENSE_APP_PASSWORD:-}" ] || die "OPSENSE_APP_PASSWORD not set"
  case "$OPSENSE_APP_PASSWORD" in CHANGE_ME*) die "OPSENSE_APP_PASSWORD is still the placeholder";; esac
  [ "${#OPSENSE_APP_PASSWORD}" -ge 12 ] || die "OPSENSE_APP_PASSWORD must be at least 12 characters"
  export APP_USER="${OPSENSE_APP_USER:-opsense_app}"
  local out="$TMP/pw.txt" rc=0
  # \getenv reads the environment inside psql: the secret never appears on a command line or in a file.
  "${PSQL[@]}" -q >"$out" 2>&1 <<'SQL' || rc=$?
\getenv app_pw OPSENSE_APP_PASSWORD
\getenv app_user APP_USER
SELECT format('ALTER ROLE %I WITH LOGIN PASSWORD %L NOSUPERUSER NOBYPASSRLS', :'app_user', :'app_pw') \gexec
SELECT rolname, rolsuper, rolbypassrls, (rolpassword IS NOT NULL) AS has_password FROM pg_authid WHERE rolname = :'app_user';
SQL
  sed '/NOTICE:/d' "$out"
  [ "$rc" -eq 0 ] || die "psql exited with status $rc while setting the application password"
  grep -Eq '(^|[[:space:]|])opsense_app[[:space:]]*\|[[:space:]]*f[[:space:]]*\|[[:space:]]*f[[:space:]]*\|[[:space:]]*t' "$out" \
    || die "application role check failed (expected rolsuper=f, rolbypassrls=f, has_password=t)"
}

step_seed() {   # identical order to scripts/load_all_m09.sh
  local f
  for f in seed_data/005_seed_demo_organization.sql seed_data/010_seed_reference_from_m06.sql \
           step4_01_import_sources.sql Operational_Sense_Step4_Taxonomy_Vocabulary_FIXED.sql \
           Operational_Sense_Step4_3_Measurement_References.sql Operational_Sense_Step4_4_Safety_and_Spare_Parts_FIXED.sql \
           seed_data/020_seed_asset_hierarchy.sql Operational_Sense_Step4_5_Import_Operational_Cases.sql \
           Operational_Sense_Step4_6_Import_Diagnostic_Steps.sql Operational_Sense_Step4_Links_and_Verification_FIXED.sql \
           sql/m09/m09_010_resolve_subsystem_fk.sql sql/m09/m09_040_apply_curation.sql sql/m09/m09_020_retrieval_guards.sql; do
    [ -f "$ROOT/$f" ] || die "missing seed file $f"
    run_sql_file "$ROOT/$f" "$f"
  done
}

# verify_file <path> <label>: run a validation script; fail on psql error, ERROR line, any FAIL result, or no PASS at all.
verify_file() {
  local file="$1" label="$2" out="$TMP/ver.txt" rc=0
  echo ">> $label"
  "${PSQL[@]}" -f "$file" >"$out" 2>&1 || rc=$?
  sed -n -E '/PASS|FAIL|ERROR/p' "$out"          # display only; sed exits 0 and psql's status is already in $rc
  [ "$rc" -eq 0 ] || die "psql exited with status $rc in $label"
  if grep -Eq '(^|[^A-Za-z])ERROR:' "$out"; then die "ERROR reported in $label"; fi
  if grep -Eq '(^|[^A-Za-z])FAIL([^A-Za-z]|$)' "$out"; then die "$label reported FAIL; RLS/data checks are NOT verified"; fi
  grep -Eq '(^|[^A-Za-z])PASS([^A-Za-z]|$)' "$out" || die "$label produced no PASS line (nothing was verified)"
}

step_verify() {
  verify_file "$ROOT/sql/m09/m09_030_validate_live.sql" "m09_030_validate_live.sql (every row must PASS)"
  verify_file "$ROOT/scripts/test_schema.sql" "test_schema.sql"
  verify_file "$ROOT/scripts/verify_rls.sql" "verify_rls.sql"
  echo "All verification scripts reported PASS and no FAIL/ERROR."
}

case "${1:-all}" in
  migrate) step_migrate;; password) step_password;; seed) step_seed;; verify) step_verify;;
  all) step_migrate; step_password; step_seed; step_verify;;
  *) echo "usage: $0 all|migrate|password|seed|verify" >&2; exit 2;;
esac
echo "local_pg.sh ${1:-all}: OK"
