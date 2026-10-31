"""Group 3 Final regression tests: Fix 4 (embedding consistency), Fix 5 (trusted vs demo), Fix 6 (evaluation)."""
import json
import os
import re
import unittest

from retrieval import eligibility, ingest
from retrieval.embedder import EmbeddingService
from retrieval.embedding_config import ConfigError, check_known_dimension, load_embedding_settings, DEFAULT_MODEL, DEFAULT_DIMENSION
from retrieval.errors import DimensionMismatchError, MockEmbeddingError
from retrieval.repository import PostgresRepository
from retrieval.search import search_similar_cases
from tests.common import ROOT
from tests.fakes import HashingBackend, InMemoryRepository, WrongDimensionBackend, make_case, small_settings, DIM


def read(*p):
    return open(os.path.join(ROOT, *p), encoding="utf-8").read()


class Fix4EmbeddingConsistency(unittest.TestCase):
    def test_dimension_384_everywhere(self):
        self.assertEqual(DEFAULT_DIMENSION, 384)
        self.assertEqual(DEFAULT_MODEL, "intfloat/multilingual-e5-small")
        self.assertIn("vector(384)", read("database", "migrations", "006_historical_case_vector.sql"))
        self.assertIn("dimension: 384", read("embedding_strategy", "embedding_config.yaml"))
        self.assertIn("OPSENSE_EMBEDDING_DIM=384", read(".env.example"))
        self.assertIn("vector(384)", read("poc", "pgvector_setup.sql"))
        self.assertIn("384", read("embedding_strategy", "EMBEDDING_STRATEGY.md"))
        mig = read("database", "migrations", "008_embedding_metadata.sql")
        self.assertIn("vector_dims(embedding)", mig)        # stored dimension must equal the vector's real dimension

    def test_contradicting_dimension_for_known_model_is_rejected(self):
        with self.assertRaises(ConfigError):
            check_known_dimension("intfloat/multilingual-e5-small", 256)
        check_known_dimension("intfloat/multilingual-e5-small", 384)
        check_known_dimension("some-unknown-model", 123)    # unknown models are not second-guessed

    def test_real_mode_checks_actual_returned_dimension(self):
        svc = EmbeddingService(small_settings(dimension=384), backend=WrongDimensionBackend())
        with self.assertRaises(DimensionMismatchError) as cm:
            svc.embed_documents(["x"])
        self.assertIn("returned a 3-dimensional vector", str(cm.exception))

    def test_model_reported_dimension_is_checked(self):
        class B:
            is_mock = False
            def encode(self, t): return [[1.0] * 384 for _ in t]
            def reported_dimension(self): return 512
        with self.assertRaises(DimensionMismatchError):
            EmbeddingService(small_settings(dimension=384), backend=B()).verify_model_dimension()

    def test_mock_vectors_cannot_enter_a_real_database(self):
        svc = EmbeddingService(small_settings(), backend=HashingBackend())
        self.assertTrue(svc.is_mock)
        real_like = InMemoryRepository([make_case(None or _ref(), "x")])
        real_like.ALLOWS_MOCK_VECTORS = False            # behaves like PostgresRepository
        with self.assertRaises(MockEmbeddingError):
            ingest.run_ingestion(real_like, svc, include_demo=True)
        with self.assertRaises(MockEmbeddingError):
            search_similar_cases(real_like, svc, "bearing noise", include_demo=True)
        self.assertFalse(PostgresRepository.ALLOWS_MOCK_VECTORS)

    def test_database_rejects_mock_model_names_by_constraint(self):
        mig = read("database", "migrations", "008_embedding_metadata.sql")
        self.assertRegex(mig, r"chk_embedding_not_mock")
        self.assertRegex(mig, r"\(mock\|fake\|hashing\|test-only\)")

    def test_mock_provider_is_not_selectable_from_environment(self):
        from retrieval.embedder import build_backend
        from retrieval.errors import EmbeddingUnavailableError
        with self.assertRaises(EmbeddingUnavailableError):
            build_backend(small_settings(provider="mock"))

    def test_reingestion_creates_no_duplicates_and_preserves_ids(self):
        cases = [make_case(f"CASE-PUMP-{i:03d}", f"bearing noise {i}", status="DRAFT", elig="demo_only_until_expert_review") for i in range(1, 6)]
        repo = InMemoryRepository(cases); svc = EmbeddingService(small_settings(), backend=HashingBackend())
        ingest.run_ingestion(repo, svc, include_demo=True); first = set(repo.historical)
        ingest.run_ingestion(repo, svc, include_demo=True)
        self.assertEqual(set(repo.historical), first); self.assertEqual(len(repo.historical), 5)
        self.assertEqual(first, {c["case_id"] for c in cases})            # original identities preserved

    def test_model_change_is_detected_and_old_vectors_never_mixed(self):
        cases = [make_case(f"CASE-PUMP-{i:03d}", f"bearing noise {i}", status="DRAFT", elig="demo_only_until_expert_review") for i in range(1, 4)]
        repo = InMemoryRepository(cases)
        old = EmbeddingService(small_settings(model="fake-hashing-256"), backend=HashingBackend())
        ingest.run_ingestion(repo, old, include_demo=True)
        new = EmbeddingService(small_settings(model="fake-hashing-256-v2"), backend=HashingBackend())
        # before re-embedding: searching with the NEW model must not rank vectors made by the OLD model
        r = search_similar_cases(repo, new, "bearing noise", include_demo=True)
        self.assertEqual(r.results, [])
        s = ingest.run_ingestion(repo, new, include_demo=True)
        self.assertEqual(s.stale_replaced, 3)
        self.assertEqual({h["embedding_model"] for h in repo.historical.values()}, {"fake-hashing-256-v2"})
        self.assertEqual(len(search_similar_cases(repo, new, "bearing noise", include_demo=True).results), 3)

    def test_e5_prefixes_applied_consistently_to_documents_and_queries(self):
        b = HashingBackend(); svc = EmbeddingService(small_settings(), backend=b)
        svc.embed_documents(["bearing hot"]); svc.embed_query("bearing hot")
        self.assertTrue(b.seen_texts[0].startswith("passage: ")); self.assertTrue(b.seen_texts[1].startswith("query: "))
        s = load_embedding_settings(load_env_file=False)
        self.assertEqual((s.query_prefix, s.document_prefix), ("query: ", "passage: "))
        self.assertIn("NOT re-verified", read("embedding_strategy", "EMBEDDING_STRATEGY.md"))   # honesty about verification status

    def test_search_sql_filters_on_model_and_binds_it(self):
        src = read("retrieval", "repository.py")
        self.assertIn("h.embedding_model = %(emb_model)s", src)


def _ref():
    return "CASE-PUMP-001"


class Fix5TrustedVsDemo(unittest.TestCase):
    def _repo(self):
        c = [make_case("CASE-PUMP-001", "bearing noise hot", status="DRAFT", elig="demo_only_until_expert_review", is_synthetic=True),
             make_case("CASE-PUMP-002", "bearing noise hot loud", status="VERIFIED", elig="demo_only_until_expert_review", is_synthetic=True),
             make_case("CASE-PUMP-003", "bearing noise hot grinding", status="DRAFT", elig="eligible", is_synthetic=True),
             make_case("CASE-PUMP-004", "bearing noise hot whine", status="REVOKED", elig="eligible", is_synthetic=False),
             make_case("CASE-PUMP-005", "bearing noise hot hum", status="VERIFIED", elig="eligible", is_synthetic=False)]
        repo = InMemoryRepository(c); svc = EmbeddingService(small_settings(), backend=HashingBackend())
        # force-store vectors for every row, bypassing eligibility, to prove FILTERING (not ingestion) protects trusted mode
        for row in c:
            repo.upsert_embedding(row, __import__("retrieval.embedder", fromlist=["x"]).to_pgvector_literal(svc.embed_documents([row["symptom_text"]])[0]),
                                  {"model": svc.model_name})
        return repo, svc

    def test_synthetic_and_draft_never_enter_trusted_retrieval(self):
        repo, svc = self._repo()
        refs = [r.case_reference for r in search_similar_cases(repo, svc, "bearing noise hot", include_demo=False).results]
        self.assertEqual(refs, ["CASE-PUMP-005"])                   # only VERIFIED + eligible; synthetic/draft/revoked excluded
        for r in search_similar_cases(repo, svc, "bearing noise hot", include_demo=False).results:
            self.assertEqual(r.evidence_level, "TRUSTED")

    def test_all_synthetic_demo_records_return_zero_in_trusted_mode(self):
        cases = [make_case(f"CASE-PUMP-{i:03d}", f"bearing noise {i}", status="DRAFT", elig="demo_only_until_expert_review") for i in range(1, 6)]
        repo = InMemoryRepository(cases); svc = EmbeddingService(small_settings(), backend=HashingBackend())
        ingest.run_ingestion(repo, svc, include_demo=True)
        self.assertEqual(search_similar_cases(repo, svc, "bearing noise", include_demo=False).results, [])

    def test_approved_requires_explicit_status_and_eligibility(self):
        ev = eligibility.evidence_level
        self.assertEqual(ev("VERIFIED", "eligible", include_demo=False), "TRUSTED")
        for st, el in (("VERIFIED", "demo_only_until_expert_review"), ("DRAFT", "eligible"), ("SUBMITTED", "eligible"),
                       ("VERIFIED", "excluded"), ("VERIFIED", None), (None, "eligible"), ("REVOKED", "eligible")):
            self.assertIsNone(ev(st, el, include_demo=False), (st, el))
            self.assertIsNone(ev(st, el, include_demo=True) if st not in ("DRAFT", "SUBMITTED") or el != "demo_only_until_expert_review" else None)

    def test_demo_mode_retrieves_eligible_demo_records_and_labels_them(self):
        repo, svc = self._repo()
        res = search_similar_cases(repo, svc, "bearing noise hot", include_demo=True).results
        by = {r.case_reference: r.evidence_level for r in res}
        self.assertEqual(by.get("CASE-PUMP-001"), "DEMO_UNVERIFIED"); self.assertEqual(by.get("CASE-PUMP-005"), "TRUSTED")
        self.assertNotIn("CASE-PUMP-002", by); self.assertNotIn("CASE-PUMP-004", by)

    def test_results_keep_original_reference_and_are_not_diagnoses(self):
        repo, svc = self._repo()
        resp = search_similar_cases(repo, svc, "bearing noise hot", include_demo=True)
        self.assertIn("not a diagnosis", resp.notice.lower())
        self.assertEqual(sorted(r.case_reference for r in resp.results), sorted(set(r.case_reference for r in resp.results)))
        for r in resp.results:
            self.assertRegex(r.case_reference, r"^CASE-PUMP-\d{3}$")

    def test_sql_lifecycle_fragment_matches_python_rule(self):
        self.assertIn("VERIFIED", eligibility.sql_condition("c", False)); self.assertNotIn("demo_only", eligibility.sql_condition("c", False))
        self.assertIn("demo_only_until_expert_review", eligibility.sql_condition("c", True))

    def test_shipped_dataset_has_zero_trusted_eligible_cases(self):
        data = json.load(open(os.path.join(ROOT, "synthetic_dataset", "synthetic_cases.json"), encoding="utf-8"))["cases"]
        self.assertEqual([c for c in data if eligibility.evidence_level(c["case_status"], c["retrieval_eligibility"], include_demo=False)], [])
        self.assertTrue(all(c["is_synthetic"] and c["case_status"] == "DRAFT" for c in data))


if __name__ == "__main__":
    unittest.main()


class Fix6EvaluationReadiness(unittest.TestCase):
    """Three separate things: (a) dataset validation, (b) metric implementation, (c) real benchmark (NOT run)."""

    def setUp(self):
        from retrieval import evaluate
        self.ev = evaluate
        self.ds = evaluate.load_dataset()
        self.cases = json.load(open(os.path.join(ROOT, "synthetic_dataset", "synthetic_cases.json"), encoding="utf-8"))["cases"]
        self.classes = {c["equipment_class_id"] for c in self.cases}

    # (a) dataset validation
    def test_dataset_valid_against_canonical_cases(self):
        self.assertEqual(self.ev.validate_dataset(self.ds, self.ev.known_seed_references(), self.cases, self.classes), [])
        self.assertEqual(len(self.ds["queries"]), 17)

    def test_invalid_references_classes_filters_detected(self):
        refs = self.ev.known_seed_references()
        def bad(**kw):
            q = {"id": "QX", "category": "x", "query": "q", "filters": {}, "expected_case_ids": ["CASE-PUMP-001"]}; q.update(kw)
            return self.ev.validate_dataset({"queries": [q]}, refs, self.cases, self.classes)
        self.assertTrue(any("not in the seed" in p for p in bad(expected_case_ids=["CASE-PUMP-999"])))
        self.assertTrue(any("unknown equipment class" in p for p in bad(filters={"equipment_class_id": "EQ-NOPE"})))
        self.assertTrue(any("unsupported filter" in p for p in bad(filters={"subsystem_id": 1})))
        self.assertTrue(any("filter is EQ-MOTOR" in p for p in bad(filters={"equipment_class_id": "EQ-MOTOR"})))
        self.assertTrue(any("duplicate expected" in p for p in bad(expected_case_ids=["CASE-PUMP-001", "CASE-PUMP-001"])))
        self.assertTrue(any("empty query" in p for p in bad(query="  ")))

    def test_query_filters_match_expected_case_class(self):
        by = {c["case_reference"]: c for c in self.cases}
        for q in self.ds["queries"]:
            cls = q["filters"].get("equipment_class_id")
            for ref in q["expected_case_ids"]:
                self.assertIn(ref, by)
                if cls: self.assertEqual(by[ref]["equipment_class_id"], cls, q["id"])

    # (b) metric implementation with controlled rankings
    def test_metrics_on_controlled_rankings(self):
        from retrieval.metrics import hit_at_k, mean, recall_at_k, reciprocal_rank
        r = ["A", "B", "C", "D"]
        self.assertEqual(reciprocal_rank(r, ["A"]), 1.0); self.assertEqual(reciprocal_rank(r, ["C"]), 1 / 3)
        self.assertEqual(reciprocal_rank(r, ["D"]), 1 / 4); self.assertEqual(reciprocal_rank(r, ["Z"]), 0.0)
        self.assertEqual(reciprocal_rank(r, ["C", "B"]), 0.5)           # first expected hit counts
        self.assertEqual(recall_at_k(r, ["A", "D"], 3), 0.5); self.assertEqual(recall_at_k(r, ["A", "B", "C"], 3), 1.0)
        self.assertTrue(hit_at_k(r, ["C"], 3)); self.assertFalse(hit_at_k(r, ["D"], 3))
        self.assertIsNone(recall_at_k(r, [], 3)); self.assertIsNone(reciprocal_rank(r, []))
        self.assertEqual(recall_at_k(r, ["A", "A"], 3), 1.0)            # duplicates in expected do not inflate
        self.assertEqual(mean([1.0, None, 0.0]), 0.5)

    def test_aggregate_metrics_on_controlled_ranking_via_runner(self):
        from types import SimpleNamespace as NS
        ds = {"queries": [
            {"id": "A", "category": "c1", "query": "q", "filters": {}, "expected_case_ids": ["R1"]},
            {"id": "B", "category": "c1", "query": "q", "filters": {}, "expected_case_ids": ["R2", "R9"]},
            {"id": "C", "category": "c2", "query": "q", "filters": {}, "expected_case_ids": []}]}
        rankings = {"A": ["R1", "X", "Y"], "B": ["X", "R2", "Y"], "C": ["X", "Y", "Z"]}
        calls = iter(["A", "B", "C"])
        orig = self.ev.search_similar_cases
        self.ev.search_similar_cases = lambda *a, **k: NS(results=[NS(case_reference=c, similarity=0.5) for c in rankings[next(calls)]])
        try:
            res = self.ev.run_evaluation(None, None, ds, include_demo=True)
        finally:
            self.ev.search_similar_cases = orig
        self.assertEqual(res["n_scored"], 2)                         # irrelevant query excluded
        self.assertAlmostEqual(res["overall"]["mrr"], (1.0 + 0.5) / 2)
        self.assertAlmostEqual(res["overall"]["recall_at_3"], (1.0 + 0.5) / 2)
        self.assertAlmostEqual(res["overall"]["hit_at_3"], 1.0)

    # (c) no benchmark claim
    def test_no_benchmark_report_or_numbers_are_shipped(self):
        rep = os.path.join(ROOT, "retrieval", "evaluation", "reports")
        self.assertFalse(os.path.exists(os.path.join(rep, "M08_evaluation_results.json")))
        t = read("retrieval", "evaluation", "M08_evaluation_report_TEMPLATE.md")
        self.assertNotRegex(t, r"Recall@3:\s*0\.\d")
