"""M09 dataset tests on the canonical JSON dataset (+ round-trip against the SQL it came from)."""
import collections
import json
import os
import unittest

from case_schema import case_validation as cv
from case_schema.reference_data import load_reference
from m09 import loaders as L
from tests.common import ROOT

DB = os.path.join(ROOT, "database")
DATA = json.load(open(os.path.join(ROOT, "synthetic_dataset", "synthetic_cases.json"), encoding="utf-8"))
CASES = DATA["cases"]
REF = load_reference(DB)
ISSUES = cv.validate_dataset(CASES, REF)


class DatasetValidity(unittest.TestCase):
    def test_all_50_records_present_and_valid(self):
        self.assertEqual(len(CASES), 50)
        self.assertEqual([i for i in ISSUES if i.severity == "ERROR"], [])

    def test_equipment_coverage(self):
        self.assertEqual(dict(collections.Counter(c["equipment_class_id"] for c in CASES)),
                         {"EQ-COMP": 16, "EQ-MOTOR": 17, "EQ-PUMP": 17})

    def test_unique_ids_and_step_references(self):
        refs = [c["case_reference"] for c in CASES]
        self.assertEqual(len(refs), len(set(refs)))
        steps = [s["step_reference"] for c in CASES for s in c["troubleshooting_steps"]]
        self.assertEqual(len(steps), 350); self.assertEqual(len(set(steps)), 350)

    def test_duplicate_detection_works_and_finds_none(self):
        self.assertEqual(cv.near_duplicates(CASES), [])
        twin = dict(CASES[0], case_reference="CASE-PUMP-998")
        self.assertTrue(cv.near_duplicates([CASES[0], twin]))
        self.assertIn("DUP-ID", {i.code for i in cv.validate_dataset([CASES[0], CASES[0]], REF)})

    def test_step_ordering_and_tier_pattern(self):
        for c in CASES:
            self.assertEqual([s["step_number"] for s in c["troubleshooting_steps"]], list(range(1, 8)), c["case_reference"])
            self.assertEqual([s["tier"] for s in c["troubleshooting_steps"]], [1, 1, 1, 2, 2, 2, 3], c["case_reference"])
            self.assertTrue(c["troubleshooting_steps"][6]["supervisor_approval_required"])


class LifecycleEnforced(unittest.TestCase):
    def test_all_synthetic_demo_only_and_unreviewed(self):
        for c in CASES:
            self.assertTrue(c["is_synthetic"]); self.assertTrue(c["model_is_illustrative"])
            self.assertEqual(c["case_status"], "DRAFT")
            self.assertEqual(c["retrieval_eligibility"], "demo_only_until_expert_review")
            v = c["verification"]
            self.assertEqual(v["overall_decision"], "PENDING"); self.assertIsNone(v["reviewer"]); self.assertIsNone(v["review_date"])
            self.assertIsNone(c["asset_id"]); self.assertIsNone(c["created_at"])

    def test_promoting_without_evidence_is_rejected(self):
        c = json.loads(json.dumps(CASES[0])); c["case_status"] = "VERIFIED"; c["retrieval_eligibility"] = "eligible"
        self.assertTrue([i for i in cv.validate_case(c, REF) if i.severity == "ERROR"])


class KnownGapsStayVisible(unittest.TestCase):
    def count(self, code):
        return sum(1 for i in ISSUES if i.code == code)

    def test_missing_component_mappings_reported(self):
        self.assertEqual(self.count("COMPONENT-MISSING"), 11)
        # Group 3 Final: CASE-PUMP-010 resolved by a documented, unambiguous M06 rule (10 remain unresolved, was 11)
        self.assertEqual(self.count("SUBSYS-UNRESOLVED"), 10)
        self.assertEqual(self.count("SUBSYS-CURATED"), 1)

    def test_missing_taxonomy_codes_reported_not_guessed(self):
        self.assertEqual(self.count("TAXONOMY-MISSING"), 11)

    def test_resolved_subsystems_39_exact_plus_1_curated(self):
        self.assertEqual(sum(1 for c in CASES if c["subsystem_name"]), 40)
        exact = [c for c in CASES if c["subsystem_name"] and c["subsystem_name"].lower() == (c["subsystem_source_label"] or "").lower()]
        self.assertEqual(len(exact), 39)

    def test_invalid_taxonomy_reference_would_be_reported(self):
        c = json.loads(json.dumps(CASES[0])); c["failure_mappings"][0]["taxonomy_code"] = "PUMP.NOPE.NONE"
        self.assertIn("TAXONOMY-INVALID", {i.code for i in cv.validate_case(c, REF)})

    def test_unresolved_register_matches_data(self):
        import csv
        rows = list(csv.DictReader(open(os.path.join(ROOT, "synthetic_dataset", "unresolved_mappings.csv"), encoding="utf-8")))
        by = collections.Counter(r["item_type"] for r in rows)
        self.assertEqual((by["SUBSYS"], by["SUBSYS-CONFIRM"], by["COMP"], by["TAX"], by["GENERIC-STEP"], by["SAFETY"], by["DEPTH"], by["ACCEPT"]),
                         (10, 1, 11, 11, 14, 14, 15, 50))
        self.assertTrue(all(r["status"] in ("OPEN", "PROVISIONAL") for r in rows))
        self.assertEqual([r["status"] for r in rows if r["item_type"] == "SUBSYS-CONFIRM"], ["PROVISIONAL"])
        for r in rows:   # every register row names a reviewer and a reason
            self.assertTrue(r["needs_decision_from"] and r["issue"], r["item_id"])


class RoundTrip(unittest.TestCase):
    CURATED_CASE_FIELDS = {"acceptance_criteria"}
    CURATED_STEP_FIELDS = {"check_measurement", "safety_warning"}

    def test_dataset_roundtrip_no_information_loss(self):
        """JSON == SQL import for every field EXCEPT the documented Group 3 curation fields (checked separately below)."""
        cases, _, _, _ = L.load_cases(DB)
        steps = L.load_steps(DB)
        by = {c["case_reference"]: c for c in CASES}
        self.assertEqual(len(cases), len(by))
        for sql in cases:
            js = by[sql["case_reference"]]
            for k, v in sql.items():
                if k in self.CURATED_CASE_FIELDS:
                    continue
                if k == "model_designation":
                    self.assertEqual(js[k], v, (sql["case_reference"], k)); continue
                want = None if isinstance(v, str) and not v.strip() else v
                self.assertEqual(js[k], want, (sql["case_reference"], k))
        for s in steps:
            js = by[s["case_reference"]]["troubleshooting_steps"][int(s["step_number"]) - 1]
            for k in ("check_measurement", "step_reference", "tier", "supervisor_approval_required", "safety_warning", "interpretation"):
                if k in self.CURATED_STEP_FIELDS:
                    continue
                want = None if isinstance(s[k], str) and not s[k].strip() else s[k]
                self.assertEqual(js[k], want if k != "tier" else int(want), (s["step_reference"], k))

    def test_curation_changes_only_the_documented_fields(self):
        from tools.export_synthetic_cases import build
        raw = {c["case_reference"]: c for c in build(DB, curate=False)["cases"]}
        for c in CASES:
            r = raw[c["case_reference"]]
            changed = {k for k in c if c[k] != r[k]} - {"troubleshooting_steps"}
            self.assertLessEqual(changed, {"subsystem_name", "acceptance_criteria", "provenance"}, c["case_reference"])
            for a, b in zip(c["troubleshooting_steps"], r["troubleshooting_steps"]):
                self.assertLessEqual({k for k in a if a[k] != b[k]}, {"check_measurement", "safety_warning"}, a["step_reference"])
                self.assertEqual((a["tier"], a["step_number"], a["supervisor_approval_required"]), (b["tier"], b["step_number"], b["supervisor_approval_required"]))
            self.assertEqual(c["failure_mappings"], r["failure_mappings"])      # taxonomy never touched
            self.assertEqual(c["component_name"], r["component_name"])          # components never invented
            self.assertEqual((c["case_status"], c["retrieval_eligibility"], c["is_synthetic"]), (r["case_status"], r["retrieval_eligibility"], r["is_synthetic"]))

    def test_export_is_deterministic(self):
        from tools.export_synthetic_cases import build
        a = json.dumps(build(DB)["cases"], sort_keys=True); b = json.dumps(build(DB)["cases"], sort_keys=True)
        self.assertEqual(a, b)
        self.assertEqual(json.loads(a), json.loads(json.dumps(CASES, sort_keys=True)))


class Fix2MappingAndFix3Quality(unittest.TestCase):
    """Regression tests for Group 3 Final Fix 2 (mapping) and Fix 3 (diagnostic step quality)."""

    def test_only_pump_010_was_resolved_and_only_by_documented_rule(self):
        from tools import curation
        raw = {c["case_reference"]: c for c in __import__("tools.export_synthetic_cases", fromlist=["build"]).build(DB, curate=False)["cases"]}
        newly = [c["case_reference"] for c in CASES if c["subsystem_name"] and not raw[c["case_reference"]]["subsystem_name"]]
        self.assertEqual(newly, ["CASE-PUMP-010"])
        c = next(x for x in CASES if x["case_reference"] == "CASE-PUMP-010")
        self.assertEqual(c["subsystem_name"], "Hydraulic End")
        self.assertIn(c["subsystem_name"], REF.class_subsystems["EQ-PUMP"])         # valid for the class (FK)
        self.assertIsNone(c["component_name"])                                        # not guessed
        self.assertIsNone(c["failure_mappings"][0]["taxonomy_code"])                  # not invented
        self.assertTrue(any(a.startswith("SUBSYSTEM-RESOLUTION:") for a in c["provenance"]["assumptions"]))
        self.assertEqual(set(curation.SUBSYSTEM_RESOLUTIONS), {"CASE-PUMP-010"})

    def test_undocumented_subsystem_guess_is_rejected(self):
        c = json.loads(json.dumps(next(x for x in CASES if x["case_reference"] == "CASE-COMP-006")))
        c["subsystem_name"] = "Capacity Control"            # plausible but a guess: must be an ERROR
        self.assertIn("SUBSYS-GUESSED", {i.code for i in cv.validate_case(c, REF) if i.severity == "ERROR"})

    def test_no_invalid_taxonomy_or_foreign_keys(self):
        from tools import validate_mappings as vm
        recs = vm.analyse(CASES)
        self.assertEqual([r["case_reference"] for r in recs if r["invalid"]], [])
        s = vm.summarise(recs)
        self.assertEqual(s["by_field"]["subsystem"], {"RESOLVED": 40, "UNRESOLVED": 10})
        self.assertEqual(s["by_field"]["taxonomy"], {"RESOLVED": 39, "UNRESOLVED": 11})
        for c in CASES:   # no invented taxonomy codes
            for m in c["failure_mappings"]:
                self.assertTrue(m["taxonomy_code"] is None or m["taxonomy_code"] in REF.taxonomy)

    def test_unresolved_cases_are_kept_not_deleted(self):
        self.assertEqual(len(CASES), 50)
        unresolved = [c for c in CASES if c["subsystem_name"] is None]
        self.assertEqual(len(unresolved), 10)

    ORIGINALLY_SPECIFIC = {"DS-PUMP-001-04", "DS-PUMP-001-05", "DS-PUMP-001-06", "DS-PUMP-002-04", "DS-PUMP-002-05",
                           "DS-PUMP-002-06", "DS-PUMP-003-04", "DS-PUMP-003-05", "DS-PUMP-004-04"}

    def test_no_generic_measurement_placeholder_remains(self):
        from tools import curation
        for c in CASES:
            for s in c["troubleshooting_steps"]:
                self.assertNotIn("(measurement point to be marked on equipment)", s["check_measurement"])
                if s["tier"] == 2 and s["step_reference"] not in self.ORIGINALLY_SPECIFIC:
                    # every formerly-generic Tier 2 step is either a labelled suggestion or explicitly pending
                    self.assertTrue(s["check_measurement"].endswith((curation.SUFFIX_SUGGESTED, curation.SUFFIX_PENDING)), s["step_reference"])
                elif s["tier"] == 2:   # the 9 steps that already named a point in the source stay byte-for-byte unchanged
                    self.assertNotIn("verification required", s["check_measurement"])

    def test_suggested_locations_are_labelled_and_contain_no_invented_numbers(self):
        import re
        from tools import curation
        n = 0
        for c in CASES:
            for s in c["troubleshooting_steps"]:
                if s["check_measurement"].endswith(curation.SUFFIX_SUGGESTED):
                    n += 1
                    body = s["check_measurement"][: -len(curation.SUFFIX_SUGGESTED)]
                    self.assertIn(" - measure at ", body)
                    self.assertIsNone(re.search(r"\d", body.split(" - measure at ", 1)[1]), s["step_reference"])   # no numeric limit in the location
        self.assertEqual(n, 127)

    def test_acceptance_criteria_case_specific_and_pending(self):
        import re
        from tools import curation
        texts = [c["acceptance_criteria"] for c in CASES]
        self.assertEqual(len(set(texts)), 50)                                         # no shared placeholder any more
        for c in CASES:
            t = c["acceptance_criteria"]
            self.assertTrue(t.startswith(curation.ACCEPT_PREFIX), c["case_reference"])
            self.assertIn("OEM", t); self.assertIn("verification", t.lower())
            self.assertIsNone(re.search(r"\d+(\.\d+)?\s?(bar|kpa|mpa|psi|°c|mm|nm|%|hz|rpm|amp|volt|ohm|mohm|v\b|a\b)", t, re.I), c["case_reference"])  # no numeric threshold invented
            for s in c["troubleshooting_steps"]:
                if s["tier"] == 2:
                    self.assertIn(s["check_measurement"].split(" - measure at ")[0].split(" [")[0], t)   # linked to its own Tier 2 checks

    def test_isolation_dependent_steps_have_isolation_warning_and_tier_unchanged(self):
        from tools import curation
        n = 0
        for c in CASES:
            for s in c["troubleshooting_steps"]:
                if s["tier"] == 2 and curation.needs_isolation(s["check_measurement"].split(" - measure at ")[0].split(" [")[0]):
                    n += 1
                    self.assertIn("proven-dead", s["safety_warning"]); self.assertIn("not an approved plant procedure", s["safety_warning"])
        self.assertEqual(n, 13)

    def test_tier3_thin_text_reworded_with_cause_link_and_oem_flag(self):
        for c in CASES:
            s = c["troubleshooting_steps"][6]
            self.assertGreaterEqual(len(s["check_measurement"].strip()), cv.TIER3_THIN_CHARS)
            self.assertTrue(s["supervisor_approval_required"])
        c = next(x for x in CASES if x["case_reference"] == "CASE-COMP-006")
        t = c["troubleshooting_steps"][6]["check_measurement"]
        self.assertIn("Linked to suspected cause", t); self.assertIn("OEM manual / site procedure", t)

    def test_safety_wording_never_claims_approval(self):
        sql = open(os.path.join(DB, "sql", "m09", "m09_040_apply_curation.sql"), encoding="utf-8").read()
        self.assertIn("NOT an approved plant procedure", sql)
        self.assertNotRegex(sql, r"(?i)approved plant procedure(?!;)[^'\n]*\bis\b")

    def test_curation_sql_is_fresh_and_idempotent_by_construction(self):
        from tools import build_curation_sql as b
        self.assertEqual(open(b.OUT, encoding="utf-8").read(), b.render())          # generated file matches the overlay
        sql = open(b.OUT, encoding="utf-8").read()
        self.assertNotRegex(sql, r"(?im)^\s*(DELETE|DROP|TRUNCATE|INSERT)\b")      # only UPDATEs, nothing destructive
        self.assertEqual(sql.count("UPDATE troubleshooting_step"), 155)
        self.assertEqual(sql.count("UPDATE operational_case SET acceptance_criteria"), 50)


if __name__ == "__main__":
    unittest.main()
