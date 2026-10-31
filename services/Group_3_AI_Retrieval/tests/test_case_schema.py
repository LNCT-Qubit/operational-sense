"""M07 schema tests: canonical JSON Schema + semantic rules + sample files."""
import copy
import json
import os
import unittest

from case_schema import case_validation as cv, validator
from case_schema.reference_data import load_reference
from integration import mapping
from tests.common import ROOT

REF = load_reference(os.path.join(ROOT, "database"))
SCHEMA = cv.load_schema()


def _samples(name):
    with open(os.path.join(ROOT, "sample_cases", name), encoding="utf-8") as fh:
        return json.load(fh)["samples"]


VALID = {s["id"]: s["case"] for s in _samples("valid_samples.json")}


def errors(case):
    return [i for i in cv.validate_case(case, REF, SCHEMA) if i.severity == "ERROR"]


class ValidatorUnit(unittest.TestCase):
    def test_types_and_bool_is_not_integer(self):
        self.assertTrue(validator.validate(True, {"type": "integer"}))
        self.assertFalse(validator.validate(3, {"type": "integer"}))
        self.assertFalse(validator.validate(None, {"type": ["string", "null"]}))

    def test_unsupported_keyword_fails_loudly(self):
        with self.assertRaises(validator.SchemaError):
            validator.validate({}, {"not": {"type": "string"}})

    def test_if_then(self):
        sch = {"if": {"properties": {"a": {"const": 1}}, "required": ["a"]}, "then": {"required": ["b"]}}
        self.assertTrue(validator.validate({"a": 1}, sch))
        self.assertFalse(validator.validate({"a": 2}, sch))

    def test_schema_itself_only_uses_supported_keywords(self):
        # would raise SchemaError if canonical_schema.json used an unimplemented keyword
        validator.validate(VALID["V1-pump"], SCHEMA)


class SchemaAccepts(unittest.TestCase):
    def test_every_valid_sample_has_no_errors(self):
        for sid, case in VALID.items():
            with self.subTest(sid):
                self.assertEqual(errors(case), [])

    def test_unknown_values_may_be_null_and_are_reported_as_warnings(self):
        w = {i.code for i in cv.validate_case(VALID["V4-unresolved-values"], REF) if i.severity == "WARNING"}
        self.assertEqual(w >= {"SUBSYS-UNRESOLVED", "COMPONENT-MISSING", "TAXONOMY-MISSING"}, True)

    def test_minimal_record_only_needs_required_fields(self):
        self.assertEqual(errors(VALID["V5-minimal"]), [])


class SchemaRejects(unittest.TestCase):
    def test_every_invalid_sample_is_rejected_for_the_documented_reason(self):
        for s in _samples("invalid_samples.json"):
            if s["layer"] == "dataset":
                continue
            with self.subTest(s["id"]):
                errs = errors(s["case"])
                self.assertTrue(errs, "was ACCEPTED")
                self.assertTrue(any(s["expect"] in i.message or s["expect"] == i.code for i in errs),
                                f"expected {s['expect']!r}, got {[(i.code, i.message) for i in errs]}")

    def test_duplicate_case_reference_in_dataset(self):
        s = [x for x in _samples("invalid_samples.json") if x["layer"] == "dataset"][0]
        issues = cv.validate_dataset([VALID["V1-pump"], s["case"]], REF)
        self.assertIn("DUP-ID", {i.code for i in issues})

    def test_each_required_field_is_enforced(self):
        for field in SCHEMA["required"]:
            with self.subTest(field):
                c = copy.deepcopy(VALID["V1-pump"]); c.pop(field)
                self.assertTrue(errors(c))

    def test_invalid_equipment_class(self):
        c = copy.deepcopy(VALID["V1-pump"]); c["equipment_class_id"] = "EQ-FAN"
        self.assertTrue(errors(c))

    def test_non_object_input(self):
        self.assertTrue(cv.validate_case([1, 2], REF))


class CauseSeparation(unittest.TestCase):
    def test_confirmed_cause_needs_evidence_and_is_distinct_field(self):
        c = copy.deepcopy(VALID["V1-pump"])
        self.assertIsNone(c["confirmed_cause"])
        self.assertIn("suspected", c["primary_suspected_cause"])
        c["confirmed_cause"] = "x"
        self.assertTrue(errors(c))

    def test_synthetic_cannot_carry_confirmed_cause(self):
        c = copy.deepcopy(VALID["V1-pump"]); c.update(confirmed_cause="x", root_cause_confirmation="y")
        self.assertIn("SYNTH-CONFIRMED", {i.code for i in errors(c)})

    def test_all_synthetic_cases_have_no_confirmed_cause(self):
        from tests.test_synthetic_dataset import CASES
        self.assertTrue(all(c["confirmed_cause"] is None for c in CASES))


class SubsystemReferences(unittest.TestCase):
    def test_subsystem_must_belong_to_class(self):
        c = copy.deepcopy(VALID["V1-pump"]); c["subsystem_name"] = "Stator & Windings"
        self.assertIn("SUBSYS-INVALID", {i.code for i in errors(c)})

    def test_subsystem_guessing_is_rejected(self):
        c = copy.deepcopy(VALID["V4-unresolved-values"]); c["subsystem_name"] = "Drive Train"
        self.assertIn("SUBSYS-GUESSED", {i.code for i in errors(c)})


class SchemaToDatabaseMapping(unittest.TestCase):
    def test_every_schema_property_is_mapped_or_explicitly_unstored(self):
        cov = mapping.schema_property_coverage(SCHEMA)
        self.assertEqual(cov["unaccounted"], [])
        self.assertEqual(cov["columns_without_property"], [])

    def test_mapped_columns_exist_in_migration_005(self):
        sql = open(os.path.join(ROOT, "database", "migrations", "005_cases.sql"), encoding="utf-8").read()
        for col in mapping.CASE_COLUMNS:
            self.assertIn(col, sql, col)

    def test_observed_outcome_is_refused_not_dropped(self):
        c = copy.deepcopy(VALID["V1-pump"]); c["observed_outcome"] = "Vibration normal after repair"
        with self.assertRaises(mapping.MappingError):
            mapping.case_to_db_rows(c, REF, "00000000-0000-0000-0000-000000000001")

    def test_identifiers_survive_mapping(self):
        c = VALID["V1-pump"]
        rows = mapping.case_to_db_rows(c, REF, "00000000-0000-0000-0000-000000000001")
        for k in ("case_reference", "equipment_class_id", "case_status", "retrieval_eligibility", "is_synthetic"):
            self.assertEqual(rows["operational_case"][k], c[k])
        self.assertEqual(len(rows["troubleshooting_step"]), len(c["troubleshooting_steps"]))

    def test_invalid_case_is_refused(self):
        c = copy.deepcopy(VALID["V1-pump"]); c["equipment_class_id"] = "EQ-FAN"
        with self.assertRaises(mapping.MappingError):
            mapping.case_to_db_rows(c, REF, "00000000-0000-0000-0000-000000000001")


class CrossCheckWithJsonschemaPackage(unittest.TestCase):
    def test_agrees_with_jsonschema_if_installed(self):
        try:
            import jsonschema
        except ImportError:
            self.skipTest("jsonschema not installed (optional; see requirements-dev.txt)")
        v = jsonschema.Draft202012Validator(SCHEMA)
        for sid, case in VALID.items():
            self.assertEqual(list(v.iter_errors(case)), [], sid)
        for s in _samples("invalid_samples.json"):
            if s["layer"] == "schema":
                self.assertTrue(list(v.iter_errors(s["case"])), s["id"])


if __name__ == "__main__":
    unittest.main()
