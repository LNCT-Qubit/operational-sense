"""Cross-package flow tests (M07 schema -> M09 data -> M08 retrieval), offline, MOCK embeddings + in-memory store."""
import copy
import unittest

from case_schema.reference_data import load_reference
from integration.pipeline import ORG_DEMO, offline_case_rows, prepare
from integration.run_offline_pipeline import run
from retrieval.embedder import EmbeddingService
from retrieval.ingest import run_ingestion
from retrieval.search import search_similar_cases
from tests.common import ROOT
from tests.fakes import HashingBackend, InMemoryRepository, small_settings
from tests.test_synthetic_dataset import CASES, DATA
import os

REF = load_reference(os.path.join(ROOT, "database"))


def stack(cases):
    rep = prepare(cases, REF)
    s = small_settings()
    svc = EmbeddingService(s, HashingBackend(s.dimension))
    repo = InMemoryRepository(offline_case_rows(rep.prepared), column_dim=s.dimension)
    return rep, svc, repo


class Flow(unittest.TestCase):
    def test_all_50_cases_prepared_with_no_rejections(self):
        rep, _, _ = stack(CASES)
        self.assertEqual((len(rep.prepared), len(rep.rejected), len(rep.skipped_no_text)), (50, 0, 0))
        self.assertTrue(all(p.text and p.text_sha256 for p in rep.prepared))

    def test_invalid_case_is_rejected_and_others_continue(self):
        bad = copy.deepcopy(CASES[0]); bad["equipment_class_id"] = "EQ-FAN"; bad["case_reference"] = "CASE-PUMP-999"
        rep = prepare(CASES[1:3] + [bad], REF)
        self.assertEqual([r[0] for r in rep.rejected], ["CASE-PUMP-999"]); self.assertEqual(len(rep.prepared), 2)

    def test_duplicate_ids_stop_the_batch(self):
        with self.assertRaises(ValueError):
            prepare([CASES[0], CASES[0]], REF)

    def test_trusted_mode_embeds_nothing_because_all_cases_are_draft(self):
        _, svc, repo = stack(CASES)
        self.assertEqual(run_ingestion(repo, svc, include_demo=False).embedded, 0)
        r = search_similar_cases(repo, svc, "bearing garam awaaz", include_demo=False)
        self.assertEqual((r.status, r.results), ("NO_RESULTS", []))

    def test_demo_opt_in_returns_cases_with_original_references_and_withholds_details(self):
        _, svc, repo = stack(CASES)
        run_ingestion(repo, svc, include_demo=True)
        r = search_similar_cases(repo, svc, "seal se paani leak ho raha hai", include_demo=True, equipment_class_id="EQ-PUMP")
        refs = {c["case_reference"]: c for c in CASES}
        self.assertEqual(len(r.results), 3)
        for x in r.results:
            self.assertIn(x.case_reference, refs)
            self.assertEqual(x.equipment_class_id, refs[x.case_reference]["equipment_class_id"])
            self.assertEqual(x.case_status, "DRAFT"); self.assertEqual(x.evidence_level, "DEMO_UNVERIFIED")
            self.assertIsNone(x.historical_suspected_cause); self.assertIsNone(x.historical_action_text)
        sims = [x.similarity for x in r.results]
        self.assertEqual(sims, sorted(sims, reverse=True))
        self.assertIn("not a diagnosis", r.notice)

    def test_top_k_never_exceeds_three(self):
        _, svc, repo = stack(CASES); run_ingestion(repo, svc, include_demo=True)
        self.assertLessEqual(len(search_similar_cases(repo, svc, "bearing", include_demo=True, limit=10).results), 3)

    def test_filters_class_subsystem_taxonomy_synthetic(self):
        rep, svc, repo = stack(CASES); run_ingestion(repo, svc, include_demo=True)
        for p in rep.prepared:
            repo.mappings[p.db_rows["operational_case"]["case_id"]] = [(m["taxonomy_code"], m["failure_mode_id"]) for m in p.db_rows["case_failure_mapping"]]
        q = "vibration noise temperature"
        by = {c["case_reference"]: c for c in CASES}
        r = search_similar_cases(repo, svc, q, include_demo=True, equipment_class_id="EQ-MOTOR")
        self.assertTrue(all(x.equipment_class_id == "EQ-MOTOR" for x in r.results))
        r = search_similar_cases(repo, svc, q, include_demo=True, subsystem_id="Bearing Assembly")   # offline stand-in: name
        self.assertTrue(r.results and all(by[x.case_reference]["subsystem_name"] == "Bearing Assembly" for x in r.results))
        r = search_similar_cases(repo, svc, q, include_demo=True, taxonomy_code="PUMP.BRNG.ROLL")
        self.assertTrue(r.results and all(by[x.case_reference]["failure_mappings"][0]["taxonomy_code"] == "PUMP.BRNG.ROLL" for x in r.results))
        self.assertEqual(search_similar_cases(repo, svc, q, include_demo=True, is_synthetic=False).results, [])
        self.assertTrue(search_similar_cases(repo, svc, q, include_demo=True, is_synthetic=True).results)

    def test_unresolved_subsystem_never_matches_subsystem_filter(self):
        rep, svc, repo = stack(CASES); run_ingestion(repo, svc, include_demo=True)
        r = search_similar_cases(repo, svc, "overload trip", include_demo=True, subsystem_id="Variable-frequency drive and motor")
        self.assertEqual(r.results, [])

    def test_reembedding_creates_no_duplicates(self):
        _, svc, repo = stack(CASES)
        run_ingestion(repo, svc, include_demo=True); n = len(repo.historical)
        run_ingestion(repo, svc, include_demo=True)
        self.assertEqual((n, len(repo.historical)), (50, 50))

    def test_rejected_or_revoked_never_returned_and_vectors_withdrawn(self):
        _, svc, repo = stack(CASES); run_ingestion(repo, svc, include_demo=True)
        target = repo.cases[0]; target["case_status"] = "REVOKED"
        self.assertEqual(run_ingestion(repo, svc, include_demo=True, withdraw_ineligible=True).withdrawn, 1)
        ids = {x.case_reference for x in search_similar_cases(repo, svc, target["symptom_text"], include_demo=True).results}
        self.assertNotIn(target["case_reference"], ids)

    def test_full_offline_run_has_no_identity_drift_and_no_duplicates(self):
        res = run(os.path.join(ROOT, "synthetic_dataset", "synthetic_cases.json"))
        self.assertEqual(res["identity_drift"], [])
        self.assertEqual(res["ingestion"]["duplicate_vectors_created"], 0)
        self.assertEqual(res["ingestion"]["trusted_only"]["embedded"], 0)
        self.assertFalse(res["environment"]["pgvector_executed"]); self.assertFalse(res["environment"]["model_inference_executed"])


if __name__ == "__main__":
    unittest.main()
