#!/usr/bin/env bash
# Reproducible live PoC (needs Docker + internet for the model download). NOT executed (no Docker/network). Its SQL was exercised via database/scripts/local_pg.sh on a scratch PostgreSQL; real embedding inference never ran.
# Run from the package root. Creates ./.env from .env.example if missing (you must set real local passwords first).
set -euo pipefail
[ -f .env ] || { echo "Copy .env.example to .env and set passwords, then re-run."; exit 2; }
set -a; . ./.env; set +a
cd database
docker compose up -d --wait
./scripts/migrate.sh
./scripts/set_app_password.sh        # reads OPSENSE_APP_PASSWORD from the environment (.env); migration 007 has no password
./scripts/seed.sh
./scripts/load_all_m09.sh
docker compose exec -T db psql -U "${POSTGRES_USER}" -d "${POSTGRES_DB}" -f - < ../poc/pgvector_setup.sql
docker compose exec -T db psql -U "${POSTGRES_USER}" -d "${POSTGRES_DB}" < sql/m09/m09_030_validate_live.sql
docker compose exec -T db psql -X -U "${POSTGRES_USER}" -d "${POSTGRES_DB}" < scripts/verify_rls.sql   # any FAIL line = RLS not verified
cd ..
python -m retrieval.embed_cases --include-demo          # downloads multilingual-e5-small on first use
python -m retrieval.search_cases "bearing garam hai aur ghurr-ghurr awaaz" --include-demo --json | tee poc/execution_evidence/live_search_$(date +%Y%m%dT%H%M%S).json
