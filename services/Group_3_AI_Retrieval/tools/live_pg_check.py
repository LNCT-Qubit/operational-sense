"""LIVE check of the real PostgresRepository SQL on PostgreSQL + pgvector (needs PG* env vars; use a DISPOSABLE database).

Everything runs inside ONE transaction that is ROLLED BACK, so the database is unchanged afterwards.
Vectors are MOCK (TEST-ONLY hashing, 384-d) because no real model was available; the mock-model name is rejected by the
migration-008 CHECK, so the check is dropped INSIDE the transaction only to exercise the SQL mechanics. Similarity values and
rankings printed here say NOTHING about model quality and are NOT a benchmark.
Usage: python -m tools.live_pg_check [--out poc/execution_evidence/live_pg_check.json]
"""
from __future__ import annotations

import argparse
import json
import os

from retrieval import ingest
from retrieval.embedder import EmbeddingService
from retrieval.repository import PostgresRepository
from retrieval.search import search_similar_cases
from tests.fakes import HashingBackend, small_settings
from tools.psql_shim import PsqlConnection, ShimError

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
ORG = "b2a7dce7-b449-4381-ba3b-b520f2c88c2e"
OTHER_ORG = "00000000-0000-0000-0000-0000000000ff"


def conn_refs(repo, subsystem_id):
    """All demo cases of a subsystem (limit lifted to 50) to confirm membership independent of the top-3 cut."""
    from types import SimpleNamespace as NS
    rows = repo.search("[" + ",".join(["0.05"] * 384) + "]", include_demo=True, limit=50, equipment_class_id="EQ-PUMP", subsystem_id=subsystem_id)
    return [NS(case_reference=r["case_reference"]) for r in rows]


def main(argv=None):
    ap = argparse.ArgumentParser(); ap.add_argument("--out", default=os.path.join(ROOT, "poc", "execution_evidence", "live_pg_check.json"))
    a = ap.parse_args(argv)
    conn = PsqlConnection(); res = {"checks": []}
    def check(name, ok, detail=""):
        res["checks"].append({"check": name, "result": "PASS" if ok else "FAIL", "detail": detail}); print(("PASS " if ok else "FAIL ") + name, detail)
    res["server"] = conn.execute("SELECT version()").fetchone()[0]
    res["pgvector"] = conn.execute("SELECT extversion FROM pg_extension WHERE extname='vector'").fetchone()[0]
    conn.execute("BEGIN")
    # DB-level guards, exercised BEFORE the harness drops the mock-name check
    cid = conn.execute("SELECT case_id FROM operational_case ORDER BY case_reference LIMIT 1").fetchone()[0]
    vec384 = "[" + ",".join(["0.05"] * 384) + "]"
    def try_insert(model, dim, vec):
        conn.execute("SAVEPOINT sp")
        try:
            conn.execute("INSERT INTO historical_case (case_id, organization_id, equipment_class_id, status, embedding, embedding_model, embedding_dimension, embedding_text_sha256) "
                         f"SELECT case_id, organization_id, equipment_class_id, case_status, '{vec}'::vector, '{model}', {dim}, 'x' FROM operational_case WHERE case_id = '{cid}'")
            conn.execute("ROLLBACK TO sp"); return None
        except ShimError as e:
            conn.execute("ROLLBACK TO sp"); return str(e)
    err = try_insert("fake-hashing-384", 384, vec384)
    check("DB rejects a mock-named model (chk_embedding_not_mock)", err is not None and "chk_embedding_not_mock" in err, str(err))
    err = try_insert("real-model", 256, "[" + ",".join(["0.05"] * 256) + "]")
    check("DB rejects a 256-d vector in vector(384)", err is not None and "384" in err, str(err))
    err = try_insert("intfloat/multilingual-e5-small", 384, vec384)
    check("DB accepts a correctly-labelled 384-d vector (sanity)", err is None, str(err))
    conn.execute("ALTER TABLE historical_case DROP CONSTRAINT chk_embedding_not_mock")     # transaction-local, rolled back
    conn.execute("SET LOCAL ROLE opsense_app")
    conn.execute(f"SELECT set_config('app.current_org_id', '{ORG}', true)")
    repo = PostgresRepository(conn, ORG)
    check("column dimension read from database", repo.get_embedding_column_dimension() == 384)
    svc = EmbeddingService(small_settings(model="fake-hashing-384", dimension=384), backend=HashingBackend(384))
    try:
        ingest.run_ingestion(repo, svc, include_demo=True); check("mock refused by PostgresRepository", False)
    except Exception as e:
        check("mock vectors refused by PostgresRepository (MockEmbeddingError)", type(e).__name__ == "MockEmbeddingError")
    repo.ALLOWS_MOCK_VECTORS = True      # HARNESS OVERRIDE: scratch DB, rolled back
    s1 = ingest.run_ingestion(repo, svc, include_demo=False)
    check("trusted-only ingestion embeds 0 (all cases synthetic DRAFT)", s1.selected == 0 and s1.embedded == 0, f"selected={s1.selected}")
    s2 = ingest.run_ingestion(repo, svc, include_demo=True)
    n1 = int(conn.execute("SELECT count(*) FROM historical_case WHERE embedding IS NOT NULL").fetchone()[0])
    s3 = ingest.run_ingestion(repo, svc, include_demo=True)
    n2 = int(conn.execute("SELECT count(*) FROM historical_case WHERE embedding IS NOT NULL").fetchone()[0])
    check("demo ingestion embeds 50 cases", s2.embedded == 50 and n1 == 50, f"embedded={s2.embedded} rows={n1}")
    check("repeated ingestion creates no duplicates", n2 == 50 and s3.embedded == 50, f"rows after 2nd run={n2}")
    row = conn.execute("SELECT embedding_model, embedding_dimension, embedding_text_version FROM historical_case LIMIT 1").fetchone()
    check("provenance stored per row", row == ("fake-hashing-384", "384", "symptom-side-v2"), str(row))
    svc2 = EmbeddingService(small_settings(model="fake-hashing-384-v2", dimension=384), backend=HashingBackend(384))
    check("search with a different model ranks nothing from the old model", len(search_similar_cases(repo, svc2, "bearing garam awaaz", include_demo=True).results) == 0)
    s4 = ingest.run_ingestion(repo, svc2, include_demo=True)
    check("model change: all rows detected stale and re-embedded", s4.stale_replaced == 50, f"stale_replaced={s4.stale_replaced}")
    svc = svc2
    t = search_similar_cases(repo, svc, "bearing garam hai aur ghurr-ghurr awaaz", include_demo=False)
    check("TRUSTED mode returns 0 (no expert-approved cases exist)", len(t.results) == 0 and t.status != "", f"status={t.status}")
    d = search_similar_cases(repo, svc, "bearing garam hai aur ghurr-ghurr awaaz", include_demo=True)
    check("DEMO mode returns top 3 labelled DEMO_UNVERIFIED", len(d.results) == 3 and all(r.evidence_level == "DEMO_UNVERIFIED" for r in d.results))
    res["demo_top3_MOCK_VECTORS_NOT_MEANINGFUL"] = [(r.rank, r.case_reference, r.similarity) for r in d.results]
    dc = search_similar_cases(repo, svc, "seal leak", include_demo=True, equipment_class_id="EQ-PUMP")
    check("class filter applied in SQL", all(r.equipment_class_id == "EQ-PUMP" for r in dc.results) and len(dc.results) == 3)
    ds = search_similar_cases(repo, svc, "impeller", include_demo=True, equipment_class_id="EQ-PUMP", subsystem_id=1)
    check("subsystem filter applied: only subsystem 1 (Hydraulic End) rows; CASE-PUMP-010 included after curation",
          len(ds.results) == 3 and all(str(r.subsystem_id) == "1" for r in ds.results) and "CASE-PUMP-010" in [r.case_reference for r in conn_refs(repo, 1)],
          str([(r.case_reference, r.subsystem_id) for r in ds.results]))
    tc = search_similar_cases(repo, svc, "bearing noise", include_demo=True, taxonomy_code="PUMP.BRNG.ROLL")
    check("taxonomy filter applied", all(r.case_reference for r in tc.results) and len(tc.results) >= 1)
    refs = {r.case_reference for r in d.results}
    check("original case references preserved", all(x.startswith("CASE-") for x in refs))
    conn.execute(f"SELECT set_config('app.current_org_id', '{OTHER_ORG}', true)")
    other = PostgresRepository(conn, OTHER_ORG)
    check("RLS: another tenant context sees no vectors/cases via repository search", len(other.search("[" + ",".join(["0.05"] * 384) + "]", include_demo=True, limit=3)) == 0)
    conn.execute(f"SELECT set_config('app.current_org_id', '{ORG}', true)")
    conn.execute("ROLLBACK")
    left = int(conn.execute("SELECT count(*) FROM historical_case").fetchone()[0])
    check("transaction rolled back (database unchanged)", left == 0, f"historical_case rows={left}")
    conn.close()
    res["all_pass"] = all(c["result"] == "PASS" for c in res["checks"])
    os.makedirs(os.path.dirname(a.out), exist_ok=True)
    json.dump(res, open(a.out, "w", encoding="utf-8"), indent=2)
    return 0 if res["all_pass"] else 1


if __name__ == "__main__":
    raise SystemExit(main())
