import unittest

from retrieval import eligibility as e


class EligibilityTests(unittest.TestCase):
    def test_only_verified_and_eligible_is_trusted(self):
        self.assertEqual(e.evidence_level("VERIFIED", "eligible", include_demo=False), e.TRUSTED)

    def test_draft_demo_case_hidden_by_default(self):
        self.assertIsNone(e.evidence_level("DRAFT", "demo_only_until_expert_review", include_demo=False))

    def test_draft_demo_case_visible_only_when_requested_and_flagged(self):
        self.assertEqual(e.evidence_level("DRAFT", "demo_only_until_expert_review", include_demo=True),
                         e.DEMO_UNVERIFIED)
        self.assertEqual(e.evidence_level("SUBMITTED", "demo_only_until_expert_review", include_demo=True),
                         e.DEMO_UNVERIFIED)

    def test_never_returned_combinations(self):
        for status, elig in [("REJECTED", "eligible"), ("REVOKED", "eligible"), ("VERIFIED", "excluded"),
                             ("VERIFIED", "demo_only_until_expert_review"), ("DRAFT", "eligible"),
                             ("SUBMITTED", "eligible"), ("REJECTED", "demo_only_until_expert_review"),
                             ("DRAFT", "excluded"), (None, None), ("verified", "eligible")]:
            for demo in (False, True):
                self.assertIsNone(e.evidence_level(status, elig, include_demo=demo), (status, elig, demo))

    def test_sql_fragment_mirrors_python_rule(self):
        trusted_only = e.sql_condition("c", False)
        self.assertIn("c.case_status IN ('VERIFIED')", trusted_only)
        self.assertIn("c.retrieval_eligibility = 'eligible'", trusted_only)
        self.assertNotIn("DRAFT", trusted_only)
        with_demo = e.sql_condition("c", True)
        self.assertIn("'DRAFT', 'SUBMITTED'", with_demo)
        self.assertIn("demo_only_until_expert_review", with_demo)
        self.assertNotIn("REJECTED", with_demo)
        self.assertNotIn("REVOKED", with_demo)


if __name__ == "__main__":
    unittest.main()
