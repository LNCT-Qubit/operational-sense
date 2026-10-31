import json
import unittest

from retrieval import evaluate
from retrieval.embedder import EmbeddingService
from retrieval.ingest import run_ingestion
from retrieval.metrics import hit_at_k, mean, recall_at_k, reciprocal_rank
from tests.fakes import HashingBackend, InMemoryRepository, make_case, small_settings


class MetricTests(unittest.TestCase):
    def test_recall_hit_and_mrr(self):
        ranked = ["B", "A", "C"]
        self.assertEqual(recall_at_k(ranked, ["A", "Z"]), 0.5)
        self.assertTrue(hit_at_k(ranked, ["A"]))
        self.assertFalse(hit_at_k(ranked, ["Z"]))
        self.assertEqual(reciprocal_rank(ranked, ["A"]), 0.5)
        self.assertEqual(reciprocal_rank(ranked, ["Z"]), 0.0)

    def test_no_expected_ids_gives_none_not_zero(self):
        self.assertIsNone(recall_at_k(["A"], []))
        self.assertIsNone(hit_at_k(["A"], []))
        self.assertIsNone(reciprocal_rank(["A"], []))
        self.assertIsNone(mean([None, None]))

    def test_cutoff_is_three(self):
        self.assertEqual(recall_at_k(["x", "y", "z", "A"], ["A"]), 0.0)


class DatasetTests(unittest.TestCase):
    """These run against the REAL dataset file and the REAL seed SQL file (no model needed)."""
    def test_dataset_is_valid_and_ids_exist_in_seed_data(self):
        ds = evaluate.load_dataset()
        refs = evaluate.known_seed_references()
        self.assertEqual(len(refs), 50)
        self.assertEqual(evaluate.validate_dataset(ds, refs), [])

    def test_dataset_covers_required_scenarios(self):
        cats = {q["category"] for q in evaluate.load_dataset()["queries"]}
        for needed in ("near_exact", "paraphrase_english", "cross_equipment_context", "irrelevant"):
            self.assertIn(needed, cats)

    def test_validation_catches_unknown_expected_case(self):
        bad = {"queries": [{"id": "Q1", "query": "x", "expected_case_ids": ["CASE-NOPE-001"]}]}
        self.assertTrue(evaluate.validate_dataset(bad, {"CASE-PUMP-001"}))


class MockRunnerTests(unittest.TestCase):
    """Runner LOGIC with a fake model (MOCK). The numbers produced here are NOT model quality."""
    def test_runner_computes_metrics_and_report_is_labelled(self):
        cases = [make_case("CASE-PUMP-001", "seal leaking shaft"), make_case("CASE-PUMP-002", "bearing hot noise")]
        service = EmbeddingService(small_settings(), HashingBackend())
        repo = InMemoryRepository(cases)
        run_ingestion(repo, service)
        ds = {"queries": [
            {"id": "A", "category": "near_exact", "query": "seal leaking shaft", "expected_case_ids": ["CASE-PUMP-001"]},
            {"id": "B", "category": "irrelevant", "query": "printer jam", "expected_case_ids": []}]}
        result = evaluate.run_evaluation(repo, service, ds, include_demo=False)
        self.assertEqual(result["n_scored"], 1)
        self.assertEqual(result["overall"]["recall_at_3"], 1.0)
        self.assertIsNone(next(r for r in result["rows"] if r["id"] == "B")["hit_at_3"])

    def test_not_run_report_contains_no_metrics(self):
        text = evaluate.render_report("NOT RUN", dataset_sha="abc", reason="no database")
        self.assertIn("NOT RUN", text)
        for forbidden in ("Recall@3:", "MRR:", "Hit@3:"):
            self.assertNotIn(forbidden, text)


if __name__ == "__main__":
    unittest.main()
