"""Recall@3 / MRR arithmetic. The numbers below are hand-made toy values, NOT retrieval results."""
import unittest
from m09.metrics import recall_at_k, reciprocal_rank, mean_metrics, relative_improvement, validate_eval_dataset


class Metrics(unittest.TestCase):
    def test_recall_at_3(self):
        self.assertEqual(recall_at_k(["a", "b", "c", "d"], ["a"], 3), 1.0)
        self.assertEqual(recall_at_k(["x", "y", "z", "a"], ["a"], 3), 0.0)
        self.assertEqual(recall_at_k(["a", "x", "b"], ["a", "b", "c", "d"], 3), 0.5)

    def test_recall_undefined_without_labels(self):
        self.assertIsNone(recall_at_k(["a"], [], 3))

    def test_reciprocal_rank(self):
        self.assertEqual(reciprocal_rank(["x", "a"], ["a"]), 0.5)
        self.assertEqual(reciprocal_rank(["x", "y"], ["a"]), 0.0)
        self.assertEqual(reciprocal_rank(["x", "b", "a"], ["a", "b"]), 0.5)  # first relevant hit counts

    def test_means(self):
        runs = {"q1": (["a", "x", "y"], ["a"]), "q2": (["x", "a", "y"], ["a"]), "q3": (["x", "y", "z"], ["a"])}
        r, m = mean_metrics(runs, 3)
        self.assertAlmostEqual(r, 2 / 3)
        self.assertAlmostEqual(m, (1 + 0.5 + 0) / 3)

    def test_relative_improvement_edges(self):
        self.assertAlmostEqual(relative_improvement(0.5, 0.7), 0.4)
        self.assertIsNone(relative_improvement(0, 0.7))
        self.assertIsNone(relative_improvement(None, 0.7))


class EvalDataset(unittest.TestCase):
    refs = {"CASE-PUMP-001", "CASE-MOT-001"}

    def test_valid(self):
        ds = {"queries": [{"query_id": "q1", "query": "pump bearing noise after start", "relevant_case_references": ["CASE-PUMP-001"]}]}
        self.assertEqual(validate_eval_dataset(ds, self.refs), [])

    def test_catches_problems(self):
        ds = {"queries": [
            {"query_id": "q1", "query": "pump bearing noise after start", "relevant_case_references": ["CASE-PUMP-001"]},
            {"query_id": "q1", "query": "pump bearing noise after start", "relevant_case_references": ["CASE-NOPE-9"]},
            {"query_id": "q3", "query": "noise", "relevant_case_references": []}]}
        p = " | ".join(validate_eval_dataset(ds, self.refs))
        for needle in ("duplicate query_id q1", "duplicate query text", "does not exist", "trivially short", "no relevant cases"):
            self.assertIn(needle, p)

    def test_class_mismatch(self):
        ds = {"queries": [{"query_id": "q1", "query": "motor winding burning smell", "equipment_class_id": "EQ-MOTOR",
                           "relevant_case_references": ["CASE-PUMP-001"]}]}
        self.assertIn("another equipment class", " ".join(validate_eval_dataset(ds, self.refs, {"CASE-PUMP-001": "EQ-PUMP"})))

    def test_empty_dataset(self):
        self.assertTrue(validate_eval_dataset({}, self.refs))


if __name__ == "__main__":
    unittest.main()
