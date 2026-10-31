"""Search tests. MOCK embedding backend + in-memory repository.
They verify ranking MECHANICS, eligibility, filters, limits, traceability and error handling.
They are NOT evidence that a real model handles paraphrase, Hinglish or irrelevant queries well."""
import unittest

from retrieval.embedder import EmbeddingService
from retrieval.errors import (DimensionMismatchError, EmbeddingUnavailableError, InvalidQueryError, StorageError)
from retrieval.ingest import run_ingestion
from retrieval.search import NOTICE, TOP_K, search_similar_cases
from tests.fakes import (BrokenBackend, HashingBackend, InMemoryRepository, WrongDimensionBackend,
                         make_case, small_settings)

BEARING = "pump bearing hot grinding noise grease contaminated vibration"
SEAL = "seal leaking water dripping shaft baseplate wet dry run"
DRAIN = "receiver water collecting condensate drain not discharging"


def build(cases, include_demo=False, settings=None):
    service = EmbeddingService(settings or small_settings(), HashingBackend())
    repo = InMemoryRepository(cases)
    run_ingestion(repo, service, include_demo=include_demo)
    return repo, service


def trusted_cases():
    return [
        make_case("CASE-PUMP-001", BEARING),
        make_case("CASE-PUMP-002", SEAL, component="Seal Faces", category="Leakage"),
        make_case("CASE-COMP-009", DRAIN, cls="EQ-COMP", component="Automatic Condensate Drain",
                  category="Moisture"),
        make_case("CASE-MOT-006", "motor bearing hot grease dry black squeal hot weather", cls="EQ-MOTOR"),
    ]


class MockRankingTests(unittest.TestCase):
    def setUp(self):
        self.repo, self.service = build(trusted_cases())

    def test_near_exact_query_ranks_source_case_first(self):
        r = search_similar_cases(self.repo, self.service, SEAL)
        self.assertEqual(r.results[0].case_reference, "CASE-PUMP-002")
        self.assertGreater(r.results[0].similarity, 0.6)   # not 1.0: stored text also has Equipment/Subsystem/Component/Category lines (v2 text; threshold relaxed from 0.7 for the hashing MOCK only)
        self.assertGreater(r.results[0].similarity, r.results[1].similarity)

    def test_paraphrase_sharing_key_words_still_finds_case(self):
        r = search_similar_cases(self.repo, self.service, "water dripping from shaft seal after the pump ran dry")
        self.assertEqual(r.results[0].case_reference, "CASE-PUMP-002")

    def test_similar_symptom_in_different_equipment_context_is_found_without_class_filter(self):
        r = search_similar_cases(self.repo, self.service, "bearing hot dry black grease squeal worse in hot weather")
        self.assertEqual(r.results[0].case_reference, "CASE-MOT-006")   # motor case for a pump-style query

    def test_class_filter_restricts_results(self):
        r = search_similar_cases(self.repo, self.service, "bearing hot grease", equipment_class_id="EQ-PUMP")
        self.assertTrue(r.results)
        self.assertTrue(all(x.equipment_class_id == "EQ-PUMP" for x in r.results))

    def test_irrelevant_query_scores_low_and_threshold_gives_empty_result(self):
        plain = search_similar_cases(self.repo, self.service, "printer paper jam blank pages")
        self.assertTrue(all(x.similarity < 0.2 for x in plain.results))
        cut = search_similar_cases(self.repo, self.service, "printer paper jam blank pages", min_similarity=0.5)
        self.assertEqual((cut.status, cut.results), ("NO_RESULTS", []))
        self.assertIn("does not mean the problem is new or safe", " ".join(cut.warnings))

    def test_top_three_limit_and_ranks(self):
        many = [make_case(f"CASE-PUMP-{i:03d}", f"bearing hot noise variant{i}") for i in range(1, 8)]
        repo, service = build(many)
        r = search_similar_cases(repo, service, "bearing hot noise", limit=10)
        self.assertEqual(len(r.results), TOP_K)
        self.assertEqual([x.rank for x in r.results], [1, 2, 3])
        self.assertEqual(repo.last_search_args["limit"], 3)

    def test_every_result_is_traceable(self):
        r = search_similar_cases(self.repo, self.service, BEARING)
        for x in r.results:
            self.assertTrue(x.case_id and x.case_reference)
            self.assertIn(x.case_id, {c["case_id"] for c in self.repo.cases})
            self.assertEqual(x.evidence_level, "TRUSTED")
            self.assertIsNotNone(x.case_status)
            self.assertIsNotNone(x.similarity)
        self.assertEqual(r.embedding_model, "fake-hashing-256")
        self.assertEqual(r.notice, NOTICE)
        self.assertIn("not a diagnosis", r.notice)

    def test_empty_index_returns_no_results_not_error(self):
        repo = InMemoryRepository(trusted_cases())   # nothing embedded yet
        r = search_similar_cases(repo, EmbeddingService(small_settings(), HashingBackend()), BEARING)
        self.assertEqual((r.status, r.results), ("NO_RESULTS", []))


class MockEligibilityTests(unittest.TestCase):
    def draft_set(self):
        return [make_case("CASE-D-001", BEARING, status="DRAFT", elig="demo_only_until_expert_review"),
                make_case("CASE-D-002", BEARING, status="REJECTED", elig="eligible"),
                make_case("CASE-D-003", BEARING, status="VERIFIED", elig="excluded")]

    def test_draft_cases_not_returned_by_default_even_if_embedded(self):
        repo, service = build(self.draft_set(), include_demo=True)   # vectors exist for the draft case
        r = search_similar_cases(repo, service, BEARING)
        self.assertEqual((r.status, r.results), ("NO_RESULTS", []))

    def test_demo_mode_returns_draft_flagged_and_withholds_details(self):
        repo, service = build(self.draft_set(), include_demo=True)
        r = search_similar_cases(repo, service, BEARING, include_demo=True)
        self.assertEqual([x.case_reference for x in r.results], ["CASE-D-001"])
        item = r.results[0]
        self.assertEqual(item.evidence_level, "DEMO_UNVERIFIED")
        self.assertIsNone(item.historical_action_text)
        self.assertIsNone(item.historical_suspected_cause)
        self.assertTrue(item.details_withheld_reason)
        self.assertTrue(any("DEMO MODE" in w for w in r.warnings))

    def test_trusted_case_shows_historical_cause_and_action_with_notice(self):
        repo, service = build([make_case("CASE-T-001", BEARING)])
        item = search_similar_cases(repo, service, BEARING).results[0]
        self.assertEqual(item.historical_action_text, "action for CASE-T-001")
        self.assertIn("approval", NOTICE)

    def test_stale_status_copy_in_historical_case_is_ignored(self):
        repo, service = build([make_case("CASE-T-001", BEARING)])
        repo.cases[0]["case_status"] = "REVOKED"          # case revoked, historical_case copy still VERIFIED
        self.assertEqual(search_similar_cases(repo, service, BEARING).results, [])

    def test_steps_only_for_trusted_cases(self):
        cases = [make_case("CASE-T-001", BEARING),
                 make_case("CASE-D-001", BEARING + " extra", status="DRAFT", elig="demo_only_until_expert_review")]
        repo, service = build(cases, include_demo=True)
        for c in cases:
            repo.steps[c["case_id"]] = [{"step_number": 1, "tier": 1, "check_measurement": "listen",
                                         "safety_warning": "stay clear", "supervisor_approval_required": False}]
        r = search_similar_cases(repo, service, BEARING, include_demo=True, include_steps=True)
        by_ref = {x.case_reference: x for x in r.results}
        self.assertTrue(by_ref["CASE-T-001"].diagnostic_steps)
        self.assertEqual(by_ref["CASE-D-001"].diagnostic_steps, [])


class MockMetadataTests(unittest.TestCase):
    def test_missing_metadata_is_reported_not_hidden(self):
        case = make_case("CASE-M-001", BEARING, component=None, category=None, source_reliability=None)
        repo, service = build([case])
        item = search_similar_cases(repo, service, BEARING).results[0]
        self.assertEqual(set(item.missing_metadata),
                         {"subsystem_id", "component_name", "symptom_category", "source_reliability"})
        self.assertEqual(item.subsystem_source_label, "Bearing Assembly")   # fallback label still shown

    def test_subsystem_filter_excludes_null_subsystem_and_warns(self):
        cases = [make_case("CASE-S-001", BEARING, subsystem_id=7), make_case("CASE-S-002", BEARING)]
        repo, service = build(cases)
        r = search_similar_cases(repo, service, BEARING, subsystem_id=7)
        self.assertEqual([x.case_reference for x in r.results], ["CASE-S-001"])
        self.assertTrue(any("subsystem_id NULL" in w for w in r.warnings))


class MockFailureTests(unittest.TestCase):
    def setUp(self):
        self.repo, self.service = build([make_case("CASE-T-001", BEARING)])

    def test_empty_query(self):
        for bad in ("", "   ", None):
            with self.assertRaises(InvalidQueryError):
                search_similar_cases(self.repo, self.service, bad)

    def test_provider_failure(self):
        broken = EmbeddingService(small_settings(), BrokenBackend())
        with self.assertRaises(EmbeddingUnavailableError):
            search_similar_cases(self.repo, broken, BEARING)

    def test_incorrect_embedding_dimension(self):
        wrong = EmbeddingService(small_settings(), WrongDimensionBackend())
        with self.assertRaises(DimensionMismatchError):
            search_similar_cases(self.repo, wrong, BEARING)

    def test_database_failure(self):
        self.repo.fail_on = {"search"}
        with self.assertRaises(StorageError):
            search_similar_cases(self.repo, self.service, BEARING)

    def test_invalid_limit(self):
        with self.assertRaises(InvalidQueryError):
            search_similar_cases(self.repo, self.service, BEARING, limit=0)


if __name__ == "__main__":
    unittest.main()
