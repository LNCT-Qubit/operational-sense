#!/usr/bin/env bash
# Offline reproducibility checks (no database, no model). Run from the package root:  bash tools/run_static_checks.sh
set -u; fail=0
step() { echo; echo "== $1"; shift; "$@" || { echo "!! FAILED: $*"; fail=1; }; }
step "Python compilation"          python3 -m compileall -q case_schema integration m09 retrieval tools tests
step "Shell syntax"                bash -c 'for f in poc/run_poc.sh database/scripts/*.sh tools/*.sh; do bash -n "$f" || exit 1; done; echo ok'
step "JSON parsing"                python3 -c "import glob,json;[json.load(open(f,encoding='utf-8')) for f in glob.glob('**/*.json',recursive=True)];print('ok')"
step "JSON Schema (canonical, valid + invalid samples)" python3 -W ignore -m unittest tests.test_case_schema -q
step "Synthetic dataset validation (schema+semantic+dataset)" python3 -W ignore -m unittest tests.test_synthetic_dataset -q
step "Mapping validation (INVALID must be 0)" python3 -m tools.validate_mappings --check
step "Curation SQL is fresh"        python3 -m tools.build_curation_sql --check
step "Embedding-text generation"    python3 -W ignore -m unittest tests.test_text_builder tests.test_embedding_strategy -q
step "Evaluation dataset validation (NOT a benchmark)" python3 -m retrieval.evaluate --validate-only
step "Mock integration pipeline"    python3 -m integration.run_offline_pipeline --out /tmp/offline_pipeline_check.json
step "SQL static checks + security" python3 -W ignore -m unittest tests.test_sql_logic tests.test_seed_sql_contract tests.test_security_config tests.test_repository_sql -q
step "Full test suite"              python3 -W ignore -m unittest discover -s tests -t . -q
[ $fail -eq 0 ] && echo "ALL STATIC CHECKS PASSED" || echo "SOME CHECKS FAILED"; exit $fail
