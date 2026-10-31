"""M08 embedding-text / metadata tests (strategy symptom-side-v2)."""
import json
import os
import re
import unittest

from retrieval import text_builder as tb
from retrieval.embedder import EmbeddingService, to_pgvector_literal
from retrieval.embedding_config import DEFAULT_DIMENSION, DEFAULT_MODEL, EmbeddingSettings
from tests.common import ROOT
from tests.fakes import HashingBackend, small_settings
from tests.test_synthetic_dataset import CASES

LEAK_FIELDS = ("primary_suspected_cause", "alternative_causes", "failure_mechanism", "differential_diagnosis",
               "corrective_action_text", "required_spares_text", "acceptance_criteria", "recurrence_prevention", "early_warning")


class EmbeddingText(unittest.TestCase):
    def test_deterministic_for_all_50_cases(self):
        for c in CASES:
            self.assertEqual(tb.build_case_text(c), tb.build_case_text(json.loads(json.dumps(c))))

    def test_every_synthetic_case_yields_text_with_context_lines(self):
        for c in CASES:
            t = tb.build_case_text(c)
            self.assertTrue(t.startswith("Symptom (technician): "))
            self.assertIn("Equipment: " + tb.EQUIPMENT_LABELS[c["equipment_class_id"]], t)
            if c["subsystem_source_label"]:
                self.assertIn("Subsystem: " + c["subsystem_source_label"], t)

    def test_technician_wording_is_embedded_verbatim(self):
        c = CASES[0]
        self.assertIn(re.sub(r"\s+", " ", c["symptom_text"]).strip(), tb.build_case_text(c))

    def test_no_cause_action_or_step_text_leaks(self):
        for c in CASES:
            t = tb.build_case_text(c)
            for f in LEAK_FIELDS:
                if c[f]:
                    self.assertNotIn(c[f][:40], t, (c["case_reference"], f))
            self.assertNotIn("suspected, unconfirmed", t)

    def test_empty_and_missing_input_handled_safely(self):
        for row in ({}, {"symptom_text": None}, {"symptom_text": "   "}, {"equipment_class_id": "EQ-PUMP"}):
            self.assertIsNone(tb.build_case_text(row))
        self.assertEqual(tb.build_case_text({"symptom_text": "x", "equipment_class_id": "EQ-UNKNOWN"}), "Symptom (technician): x")

    def test_equipment_labels_match_the_database_seed(self):
        seed = open(os.path.join(ROOT, "database", "seed_data", "010_seed_reference_from_m06.sql"), encoding="utf-8").read()
        for cid, label in tb.EQUIPMENT_LABELS.items():
            self.assertIn(f"('{cid}', '{label}'", seed)

    def test_text_fingerprint_changes_with_text(self):
        a, b = tb.text_sha256("a"), tb.text_sha256("b")
        self.assertNotEqual(a, b); self.assertEqual(len(a), 64)


class Metadata(unittest.TestCase):
    def test_json_case_metadata(self):
        c = CASES[0]
        m = tb.extract_metadata(c)
        self.assertEqual(m["case_reference"], c["case_reference"])
        self.assertEqual(m["equipment_class_id"], c["equipment_class_id"])
        self.assertEqual(m["taxonomy_code"], c["failure_mappings"][0]["taxonomy_code"])
        self.assertEqual(m["review_status"], "PENDING")
        self.assertIs(m["is_synthetic"], True)

    def test_missing_metadata_never_crashes_and_is_listed(self):
        m = tb.extract_metadata({})
        self.assertIn("equipment_class_id", m["missing_metadata"])
        unresolved = [c for c in CASES if c["subsystem_name"] is None][0]
        self.assertIn("taxonomy_code", tb.extract_metadata(unresolved)["missing_metadata"])

    def test_metadata_contains_no_embedding_text_fields(self):
        self.assertNotIn("symptom_text", tb.extract_metadata(CASES[0]))


class VectorDimensions(unittest.TestCase):
    def test_configured_model_and_dimension_consistent(self):
        self.assertEqual((DEFAULT_MODEL, DEFAULT_DIMENSION), ("intfloat/multilingual-e5-small", 384))
        for path in ("database/migrations/006_historical_case_vector.sql", "retrieval/embedding_config.py",
                     "embedding_strategy/embedding_config.yaml", ".env.example"):
            txt = open(os.path.join(ROOT, path), encoding="utf-8").read()
            self.assertTrue("384" in txt, path)
        self.assertIn("vector(384)", open(os.path.join(ROOT, "database/migrations/006_historical_case_vector.sql"), encoding="utf-8").read())

    def test_service_output_has_configured_dimension_and_unit_length(self):
        s = small_settings(); svc = EmbeddingService(s, HashingBackend(s.dimension))
        vecs = svc.embed_documents([tb.build_case_text(c) for c in CASES[:5]])
        for v in vecs:
            self.assertEqual(len(v), s.dimension); self.assertAlmostEqual(sum(x * x for x in v), 1.0, places=6)
        lit = to_pgvector_literal(vecs[0])
        self.assertEqual(lit.count(",") + 1, s.dimension)

    def test_default_settings_would_use_384(self):
        self.assertEqual(EmbeddingSettings().dimension, 384)


if __name__ == "__main__":
    unittest.main()
