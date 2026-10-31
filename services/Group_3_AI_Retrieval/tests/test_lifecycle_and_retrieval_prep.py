"""Lifecycle / eligibility / metadata-filter / document-builder tests for the M09 helpers (offline)."""
import unittest
from m09 import loaders as L
from m09.retrieval_prep import (build_case_document, is_retrievable, filter_cases, format_results, SYNTHETIC_BANNER)
from tests.common import PROJECT


def mk(**kw):
    base = {"case_reference": "CASE-X-001", "equipment_class_id": "EQ-PUMP", "subsystem_id": 7, "case_status": "DRAFT",
            "retrieval_eligibility": "demo_only_until_expert_review", "is_synthetic": True}
    base.update(kw)
    return base


class Eligibility(unittest.TestCase):
    def test_every_imported_case_is_excluded_from_trusted_retrieval(self):
        cases, _, d, _ = L.load_cases(PROJECT)
        rows = [dict(c, **d, is_synthetic=True) for c in cases]
        self.assertEqual(filter_cases(rows, mode="trusted"), [])

    def test_demo_requires_explicit_opt_in(self):
        rows = [mk()]
        self.assertEqual(filter_cases(rows, mode="demo"), [])
        self.assertEqual(len(filter_cases(rows, mode="demo", include_demo=True)), 1)

    def test_draft_cannot_enter_trusted_even_if_flagged_eligible(self):
        self.assertFalse(is_retrievable(mk(retrieval_eligibility="eligible"), "trusted"))

    def test_only_verified_and_eligible_is_trusted(self):
        self.assertTrue(is_retrievable(mk(case_status="VERIFIED", retrieval_eligibility="eligible"), "trusted"))

    def test_rejected_and_revoked_never_retrievable(self):
        for st in ("REJECTED", "REVOKED"):
            for mode in ("trusted", "demo"):
                self.assertFalse(is_retrievable(mk(case_status=st), mode, include_demo=True))

    def test_non_synthetic_demo_row_not_served_through_demo_path(self):
        self.assertFalse(is_retrievable(mk(is_synthetic=False), "demo", include_demo=True))

    def test_missing_metadata_fails_closed(self):
        self.assertFalse(is_retrievable({"case_reference": "A"}, "trusted"))
        self.assertFalse(is_retrievable(mk(case_status=None), "demo", include_demo=True))
        self.assertFalse(is_retrievable(mk(case_status="BOGUS"), "demo", include_demo=True))


class Filters(unittest.TestCase):
    def test_null_subsystem_never_matches_a_subsystem_filter(self):
        rows = [mk(case_reference="A", subsystem_id=None), mk(case_reference="B", subsystem_id=7)]
        got = filter_cases(rows, mode="demo", include_demo=True, equipment_class_id="EQ-PUMP", subsystem_id=7)
        self.assertEqual([c["case_reference"] for c in got], ["B"])

    def test_class_filter(self):
        rows = [mk(case_reference="A"), mk(case_reference="B", equipment_class_id="EQ-MOTOR")]
        got = filter_cases(rows, mode="demo", include_demo=True, equipment_class_id="EQ-MOTOR")
        self.assertEqual([c["case_reference"] for c in got], ["B"])


class Documents(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.cases, cls.models, cls.d, _ = L.load_cases(PROJECT)
        cls.steps = L.load_steps(PROJECT)

    def _doc(self, ref):
        c = next(x for x in self.cases if x["case_reference"] == ref)
        c = dict(c, **self.d, is_synthetic=True, model_is_illustrative=True)
        return build_case_document(c, [s for s in self.steps if s["case_reference"] == ref])

    def test_document_labelled_synthetic_and_not_diagnosis(self):
        d = self._doc("CASE-PUMP-001")
        self.assertIn(SYNTHETIC_BANNER, d["text"])
        self.assertIn("Suspected cause (unconfirmed)", d["text"])
        self.assertIn("(illustrative)", d["text"])
        self.assertEqual(d["case_reference"], "CASE-PUMP-001")

    def test_tier3_work_not_in_embedding_text(self):
        d = self._doc("CASE-PUMP-001")
        t3 = next(s for s in self.steps if s["case_reference"] == "CASE-PUMP-001" and s["tier"] == 3)
        self.assertNotIn(t3["check_measurement"], d["text"])
        self.assertIn("supervisor approval", d["text"])

    def test_missing_component_is_flagged_not_invented(self):
        d = self._doc("CASE-PUMP-010")
        self.assertIn("Component: not recorded (flag for expert review)", d["text"])

    def test_deterministic(self):
        self.assertEqual(self._doc("CASE-MOT-001")["text"], self._doc("CASE-MOT-001")["text"])

    def test_all_50_documents_build_and_ids_stable_unique(self):
        ids = []
        for c in self.cases:
            c2 = dict(c, **self.d, is_synthetic=True, model_is_illustrative=True)
            doc = build_case_document(c2, [s for s in self.steps if s["case_reference"] == c["case_reference"]])
            self.assertIn("Diagnostic checks:", doc["text"])
            ids.append(doc["case_reference"])
        self.assertEqual(len(set(ids)), 50)


class Output(unittest.TestCase):
    def test_empty_results_message_is_safe(self):
        msg = format_results([])
        self.assertIn("No eligible historical cases", msg)
        self.assertIn("not evidence", msg)

    def test_results_say_similarity_not_diagnosis_and_trace_to_case(self):
        out = format_results([(mk(case_reference="CASE-PUMP-001"), 0.8123)])
        self.assertIn("CASE-PUMP-001", out)
        self.assertIn("SYNTHETIC DEMO - NOT REVIEWED", out)
        self.assertIn("not a diagnosis", out)
        self.assertIn("supervisor approval", out)


if __name__ == "__main__":
    unittest.main()
