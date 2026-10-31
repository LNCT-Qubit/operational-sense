"""One regression test per fix made in this package."""
import os
import re
import unittest
from m09 import loaders as L, quality
from tests.common import PROJECT


def read(p):
    with open(os.path.join(PROJECT, p), encoding="utf-8") as fh:
        return fh.read()


class Regressions(unittest.TestCase):
    def test_R1_org_row_is_created_before_anything_needs_it(self):
        s = read("seed_data/005_seed_demo_organization.sql")
        self.assertIn("b2a7dce7-b449-4381-ba3b-b520f2c88c2e", s)
        self.assertIn("ON CONFLICT DO NOTHING", s)
        self.assertLess("005_seed_demo_organization.sql", "010_seed_reference_from_m06.sql")  # seed.sh sorts by name

    def test_R2_asset_seed_has_no_hard_coded_model_uuids(self):
        s = read("seed_data/020_seed_asset_hierarchy.sql")
        self.assertIsNone(re.search(r"'[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}'", s.replace("b2a7dce7-b449-4381-ba3b-b520f2c88c2e", "")))
        self.assertEqual(s.count("FROM public.equipment_model WHERE"), 3)

    def test_R3_asset_seed_models_match_case_import_models(self):
        _, models, _, _ = L.load_cases(PROJECT)
        s = read("seed_data/020_seed_asset_hierarchy.sql")
        for cls, name in re.findall(r"\('(EQ-[A-Z]+)', '([^']+)', TRUE\)", s):
            self.assertIn((cls, name), models)

    def test_R4_no_placeholder_spare_parts_or_links(self):
        f, _ = quality.run(PROJECT)
        self.assertEqual({x["id"]: x["status"] for x in f}["Q21"], "PASS")
        self.assertNotIn("INSERT INTO public.spare_part_reference (part_name, function, compatibility_note, source_id)\nSELECT 'None typically'",
                         read("Operational_Sense_Step4_4_Safety_and_Spare_Parts_FIXED.sql"))

    def test_R5_spare_join_is_case_specific_in_both_places(self):
        s = read("Operational_Sense_Step4_Links_and_Verification_FIXED.sql")
        self.assertEqual(s.count("position(sl.case_reference in coalesce(spr.compatibility_note, '')) > 0"), 2)

    def test_R6_validation_script_expects_draft_not_submitted(self):
        s = read("scripts/validate_step5.sql")
        self.assertNotIn("all 50 SUBMITTED", s)
        self.assertIn("all 50 DRAFT", s)

    def test_R7_stale_loader_is_marked_do_not_run(self):
        self.assertTrue(read("scripts/load_steps_links_verification.sql").startswith("-- ####"))

    def test_R8_subsystem_fix_never_changes_status_or_eligibility(self):
        s = re.sub(r"--[^\n]*", "", read("sql/m09/m09_010_resolve_subsystem_fk.sql"))
        self.assertNotIn("case_status", s)
        self.assertNotIn("retrieval_eligibility", s)
        self.assertNotIn("DELETE", s.upper())

    def test_R9_guards_do_not_weaken_security(self):
        s = re.sub(r"--[^\n]*", "", read("sql/m09/m09_020_retrieval_guards.sql"))
        self.assertNotRegex(s.upper(), r"DISABLE ROW LEVEL SECURITY|NO FORCE|BYPASSRLS|DROP POLICY|DROP TABLE|DELETE FROM")
        self.assertEqual(s.count("security_invoker = true"), 2)
        self.assertIn("case_status = 'VERIFIED' AND retrieval_eligibility = 'eligible'", s)

    def test_R10_no_secrets_in_package(self):
        root = os.path.dirname(PROJECT)
        for d, _, fs in os.walk(root):
            for f in fs:
                self.assertFalse(f.startswith(".env") and f != ".env.example", os.path.join(d, f))
        self.assertFalse(os.path.exists(os.path.join(PROJECT, ".git")))


if __name__ == "__main__":
    unittest.main()
