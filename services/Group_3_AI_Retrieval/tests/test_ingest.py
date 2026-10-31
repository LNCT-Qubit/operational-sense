"""Pipeline tests. Fake backend + in-memory repository (MOCK): they check pipeline logic
(selection, idempotency, error handling), not SQL and not embedding quality."""
import unittest

from retrieval.embedder import EmbeddingService
from retrieval.errors import DimensionMismatchError, EmbeddingUnavailableError, StorageError
from retrieval.ingest import run_ingestion
from tests.fakes import (BrokenBackend, DIM, HashingBackend, InMemoryRepository, WrongDimensionBackend,
                         make_case, small_settings)


def svc(backend=None):
    return EmbeddingService(small_settings(), backend or HashingBackend())


def sample_cases():
    return [
        make_case("CASE-A-001", "bearing hot grease dry"),
        make_case("CASE-A-002", "seal leaking at shaft", status="DRAFT", elig="demo_only_until_expert_review"),
        make_case("CASE-A-003", "old rejected case", status="REJECTED", elig="eligible"),
        make_case("CASE-A-004", "revoked case", status="REVOKED", elig="excluded"),
        make_case("CASE-A-005", "   ", status="VERIFIED"),  # blank symptom text: cannot be embedded
    ]


class MockIngestionTests(unittest.TestCase):
    def test_only_trusted_cases_embedded_by_default(self):
        repo = InMemoryRepository(sample_cases())
        summary = run_ingestion(repo, svc())
        self.assertEqual(summary.embedded, 1)
        self.assertEqual(summary.skipped_no_text, ["CASE-A-005"])
        self.assertEqual(len(repo.historical), 1)

    def test_demo_flag_adds_draft_but_never_rejected_or_revoked(self):
        repo = InMemoryRepository(sample_cases())
        run_ingestion(repo, svc(), include_demo=True)
        refs = {c["case_reference"] for c in repo.cases if c["case_id"] in repo.historical}
        self.assertEqual(refs, {"CASE-A-001", "CASE-A-002"})

    def test_rerun_is_idempotent_no_duplicates(self):
        repo = InMemoryRepository(sample_cases())
        run_ingestion(repo, svc(), include_demo=True)
        first = {k: list(v["embedding"]) for k, v in repo.historical.items()}
        run_ingestion(repo, svc(), include_demo=True)
        run_ingestion(repo, svc(), include_demo=True)
        self.assertEqual(len(repo.historical), 2)
        self.assertEqual({k: v["embedding"] for k, v in repo.historical.items()}, first)
        self.assertEqual(len(repo.cases), 5)   # case rows untouched

    def test_dry_run_loads_no_model_and_writes_nothing(self):
        repo = InMemoryRepository(sample_cases())
        summary = run_ingestion(repo, svc(BrokenBackend()), dry_run=True)   # would fail if called
        self.assertEqual((summary.selected, summary.embedded, len(repo.historical)), (2, 0, 0))

    def test_dimension_mismatch_with_database_column_stops_run(self):
        repo = InMemoryRepository(sample_cases(), column_dim=384)   # service dimension is 256
        with self.assertRaises(DimensionMismatchError):
            run_ingestion(repo, svc())
        self.assertEqual(repo.historical, {})

    def test_model_returns_wrong_dimension_nothing_stored(self):
        repo = InMemoryRepository(sample_cases())
        with self.assertRaises(DimensionMismatchError):
            run_ingestion(repo, svc(WrongDimensionBackend()))
        self.assertEqual(repo.historical, {})

    def test_provider_failure_nothing_stored(self):
        repo = InMemoryRepository(sample_cases())
        with self.assertRaises(EmbeddingUnavailableError):
            run_ingestion(repo, svc(BrokenBackend()))
        self.assertEqual(repo.historical, {})

    def test_storage_failure_is_raised_not_swallowed(self):
        for method in ("fetch_cases_for_embedding", "upsert_embedding", "record_run"):
            repo = InMemoryRepository(sample_cases())
            repo.fail_on = {method}
            with self.assertRaises(StorageError, msg=method):
                run_ingestion(repo, svc())

    def test_run_is_recorded_with_model_and_dimension(self):
        repo = InMemoryRepository(sample_cases())
        run_ingestion(repo, svc())
        details = repo.audit[0]["details"]
        self.assertEqual((repo.audit[0]["action"], details["model"], details["dimension"]),
                         ("EMBEDDING_RUN", "fake-hashing-256", DIM))

    def test_withdraw_clears_vectors_of_cases_that_became_ineligible(self):
        repo = InMemoryRepository(sample_cases())
        run_ingestion(repo, svc())
        repo.cases[0]["case_status"] = "REVOKED"
        summary = run_ingestion(repo, svc(), withdraw_ineligible=True)
        self.assertEqual(summary.withdrawn, 1)
        self.assertIsNone(repo.historical[repo.cases[0]["case_id"]]["embedding"])

    def test_no_eligible_cases_is_not_an_error(self):
        repo = InMemoryRepository([make_case("CASE-X-001", "text", status="DRAFT", elig="demo_only_until_expert_review")])
        summary = run_ingestion(repo, svc())
        self.assertEqual((summary.selected, summary.embedded), (0, 0))


if __name__ == "__main__":
    unittest.main()
