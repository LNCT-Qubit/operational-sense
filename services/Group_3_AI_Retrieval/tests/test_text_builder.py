import unittest

from retrieval.text_builder import build_case_text


class BuildCaseTextTests(unittest.TestCase):
    def test_fixed_order_and_labels(self):
        row = {
            "symptom_frequency": "Intermittent",
            "symptom_text": "Pump awaaz kar raha hai",
            "component_name": "Rolling Element Bearing",
        }
        self.assertEqual(
            build_case_text(row),
            "Symptom (technician): Pump awaaz kar raha hai\n"
            "Component: Rolling Element Bearing\n"
            "Frequency: Intermittent",
        )

    def test_same_input_gives_same_text(self):
        row = {"symptom_text": "leak at seal", "symptom_category": "Leakage"}
        self.assertEqual(build_case_text(row), build_case_text(dict(row)))

    def test_missing_and_blank_values_are_skipped(self):
        row = {"symptom_text": "  hot   bearing ", "component_name": None, "symptom_category": "   "}
        self.assertEqual(build_case_text(row), "Symptom (technician): hot bearing")

    def test_no_symptom_text_returns_none(self):
        self.assertIsNone(build_case_text({"component_name": "Impeller", "symptom_text": " "}))
        self.assertIsNone(build_case_text({}))

    def test_structured_symptom_alone_is_enough(self):
        self.assertEqual(
            build_case_text({"symptom_structured": "Seal leakage"}),
            "Symptom (summary): Seal leakage",
        )

    def test_cause_and_repair_fields_never_appear(self):
        row = {
            "symptom_text": "noise",
            "primary_suspected_cause": "CAUSE-TEXT",
            "alternative_causes": "ALT-TEXT",
            "confirmed_cause": "CONFIRMED-TEXT",
            "failure_mechanism": "MECH-TEXT",
            "differential_diagnosis": "DIFF-TEXT",
            "corrective_action_text": "REPAIR-TEXT",
            "required_spares_text": "SPARES-TEXT",
            "acceptance_criteria": "ACCEPT-TEXT",
        }
        text = build_case_text(row)
        for leaked in ("CAUSE", "ALT-", "CONFIRMED", "MECH", "DIFF", "REPAIR", "SPARES", "ACCEPT"):
            self.assertNotIn(leaked, text)

    def test_illustrative_marker_removed_but_content_kept(self):
        row = {
            "symptom_text": "noise",
            "operating_status": "Running, normal duty point (illustrative; no recorded readings)",
            "symptom_frequency": "Continuous after warm-up (illustrative)",
        }
        text = build_case_text(row)
        self.assertIn("Operating status: Running, normal duty point", text)
        self.assertIn("Frequency: Continuous after warm-up", text)
        self.assertNotIn("illustrative", text)


if __name__ == "__main__":
    unittest.main()
