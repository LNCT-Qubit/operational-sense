from pathlib import Path
import unittest

ROOT = Path(__file__).resolve().parents[1]


class SeedSqlContractTests(unittest.TestCase):
    def test_asset_seed_creates_org_and_models_before_assets(self):
        # Canonical design (M09 variant): organisation is created by seed 005, models + assets by 020.
        org = (ROOT / "database" / "seed_data" / "005_seed_demo_organization.sql").read_text(encoding="utf-8")
        self.assertIn("INSERT INTO organization", org)
        sql = (ROOT / "database" / "seed_data" / "020_seed_asset_hierarchy.sql").read_text(encoding="utf-8")
        self.assertIn("INSERT INTO public.equipment_model", sql)
        self.assertLess(sql.index("INSERT INTO public.equipment_model"), sql.index("INSERT INTO public.asset_node"))
        # models are looked up by class + designation, never by guessed UUIDs
        self.assertIn("model_designation = 'KSB MegaCPK'", sql)
        self.assertIn("model_designation = 'Siemens 1LE1'", sql)
        self.assertIn("model_designation = 'Atlas Copco GA-37'", sql)
        self.assertNotIn("9f028325-d313-472d-93b5-69dd6d970d56", sql)
        self.assertNotIn("630edff0-4b57-4bd3-a71b-24239a2de3fc", sql)
        self.assertNotIn("d7c0be19-2d55-4c90-9cb0-925db9287629", sql)

    def test_retrieval_schema_uses_operational_case_for_symptoms(self):
        repo = (ROOT / "retrieval" / "repository.py").read_text(encoding="utf-8")
        self.assertIn("JOIN operational_case c ON c.case_id = h.case_id", repo)
        self.assertIn("c.symptom_text", repo)
        verify = (ROOT / "database" / "scripts" / "verify_m08_retrieval.sql").read_text(encoding="utf-8")
        self.assertIn("symptom_text lives in operational_case", verify)
        self.assertNotIn("SELECT symptom_text FROM historical_case", verify)

    def test_loader_orders_cases_before_steps_and_links(self):
        script = (ROOT / "database" / "scripts" / "load_all_m09.sh").read_text(encoding="utf-8")
        cases = script.index("run Operational_Sense_Step4_5_Import_Operational_Cases.sql")
        steps = script.index("run Operational_Sense_Step4_6_Import_Diagnostic_Steps.sql")
        links = script.index("run Operational_Sense_Step4_Links_and_Verification_FIXED.sql")
        self.assertLess(cases, steps)
        self.assertLess(steps, links)


if __name__ == "__main__":
    unittest.main()
