"""Offline data-quality tests over the SQL files. They prove the FILES are consistent, not the database."""
import unittest
from m09 import loaders as L, quality
from tests.common import PROJECT


class DataQuality(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.findings, cls.ctx = quality.run(PROJECT)
        cls.by_id = {f["id"]: f for f in cls.findings}
        cls.cases, cls.models, cls.defaults, cls.sets_sub = L.load_cases(PROJECT)
        cls.steps = L.load_steps(PROJECT)

    def test_counts_50_cases_350_steps(self):
        self.assertEqual(len(self.cases), 50)
        self.assertEqual(len(self.steps), 350)

    def test_case_references_unique_and_classes(self):
        refs = [c["case_reference"] for c in self.cases]
        self.assertEqual(len(refs), len(set(refs)))
        from collections import Counter
        self.assertEqual(dict(Counter(c["equipment_class_id"] for c in self.cases)),
                         {"EQ-PUMP": 17, "EQ-MOTOR": 17, "EQ-COMP": 16})

    def test_each_case_has_seven_ordered_steps_tier_pattern(self):
        for i in ("Q07", "Q08", "Q11"):
            self.assertEqual(self.by_id[i]["status"], "PASS", self.by_id[i])

    def test_tier3_requires_supervisor_and_loto(self):
        for i in ("Q09", "Q10"):
            self.assertEqual(self.by_id[i]["status"], "PASS", self.by_id[i])

    def test_taxonomy_vocab_sources_consistent(self):
        for i in ("Q12", "Q14"):
            self.assertEqual(self.by_id[i]["status"], "PASS", self.by_id[i])

    def test_every_case_model_defined(self):
        self.assertEqual(self.by_id["Q06"]["status"], "PASS")

    def test_no_exact_or_same_class_near_duplicates(self):
        self.assertEqual(self.by_id["Q20"]["status"], "PASS", self.by_id["Q20"])

    def test_subsystem_resolution_is_39_and_11(self):
        self.assertEqual(len(self.ctx["resolved"]), 39)
        self.assertEqual(sorted(self.ctx["unresolved"]), sorted([
            "CASE-PUMP-010", "CASE-PUMP-011", "CASE-PUMP-012", "CASE-MOT-004", "CASE-MOT-007", "CASE-MOT-010",
            "CASE-MOT-017", "CASE-COMP-006", "CASE-COMP-007", "CASE-COMP-010", "CASE-COMP-016"]))

    def test_known_open_gap_component_blank_is_reported_not_hidden(self):
        # The 11 blank components have no taxonomy code either; they are NOT invented, they stay FAIL/WARN.
        self.assertEqual(self.by_id["Q05"]["status"], "FAIL")
        self.assertEqual(sorted(self.ctx["no_taxonomy"]),
                         sorted(c["case_reference"] for c in self.cases if not c["component_name"]))

    def test_placeholder_acceptance_criteria_is_reported(self):
        self.assertEqual(self.by_id["Q17"]["status"], "WARN")

    def test_lifecycle_defaults_in_import(self):
        self.assertEqual(self.defaults, {"case_status": "DRAFT", "retrieval_eligibility": "demo_only_until_expert_review"})
        self.assertEqual(self.by_id["Q24"]["status"], "PASS")


if __name__ == "__main__":
    unittest.main()
