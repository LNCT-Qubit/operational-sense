import math
import sys
import unittest
from unittest import mock

from retrieval.embedder import (EmbeddingService, SentenceTransformerBackend, build_backend,
                                l2_normalize, to_pgvector_literal, validate_query)
from retrieval.errors import DimensionMismatchError, EmbeddingUnavailableError, InvalidQueryError
from tests.fakes import BrokenBackend, HashingBackend, WrongDimensionBackend, small_settings


class NormalizationTests(unittest.TestCase):
    def test_unit_length(self):
        v = l2_normalize([3.0, 4.0])
        self.assertAlmostEqual(math.sqrt(sum(x * x for x in v)), 1.0)

    def test_zero_vector_rejected(self):
        with self.assertRaises(EmbeddingUnavailableError):
            l2_normalize([0.0, 0.0])

    def test_nan_rejected(self):
        with self.assertRaises(EmbeddingUnavailableError):
            l2_normalize([1.0, float("nan")])

    def test_literal_format(self):
        self.assertEqual(to_pgvector_literal([1, 0.5]), "[1.0,0.5]")


class QueryValidationTests(unittest.TestCase):
    def test_empty_and_blank_rejected(self):
        for bad in ("", "   ", "\n\t"):
            with self.assertRaises(InvalidQueryError):
                validate_query(bad, 100)

    def test_non_string_rejected(self):
        for bad in (None, 5, ["a"]):
            with self.assertRaises(InvalidQueryError):
                validate_query(bad, 100)

    def test_too_long_rejected(self):
        with self.assertRaises(InvalidQueryError):
            validate_query("a" * 101, 100)

    def test_whitespace_collapsed(self):
        self.assertEqual(validate_query("  hot   bearing \n", 100), "hot bearing")


class MockEmbeddingServiceTests(unittest.TestCase):
    """Uses fake backends (MOCK). Verifies our wrapper logic only."""

    def test_prefixes_applied(self):
        backend = HashingBackend()
        svc = EmbeddingService(small_settings(), backend)
        svc.embed_documents(["bearing hot"])
        svc.embed_query("bearing hot")
        self.assertEqual(backend.seen_texts, ["passage: bearing hot", "query: bearing hot"])

    def test_prefixes_can_be_switched_off(self):
        backend = HashingBackend()
        svc = EmbeddingService(small_settings(query_prefix="", document_prefix=""), backend)
        svc.embed_query("x y")
        self.assertEqual(backend.seen_texts, ["x y"])

    def test_vectors_are_unit_length(self):
        svc = EmbeddingService(small_settings(), HashingBackend())
        v = svc.embed_query("pump seal leak")
        self.assertAlmostEqual(sum(x * x for x in v), 1.0)

    def test_batching_returns_all_vectors(self):
        svc = EmbeddingService(small_settings(batch_size=2), HashingBackend())
        self.assertEqual(len(svc.embed_documents([f"case {i}" for i in range(5)])), 5)

    def test_empty_query_rejected_before_provider_is_called(self):
        backend = HashingBackend()
        svc = EmbeddingService(small_settings(), backend)
        with self.assertRaises(InvalidQueryError):
            svc.embed_query("   ")
        self.assertEqual(backend.seen_texts, [])

    def test_empty_document_rejected(self):
        svc = EmbeddingService(small_settings(), HashingBackend())
        with self.assertRaises(InvalidQueryError):
            svc.embed_documents(["ok", "  "])

    def test_provider_failure_becomes_embedding_unavailable(self):
        svc = EmbeddingService(small_settings(), BrokenBackend())
        with self.assertRaises(EmbeddingUnavailableError) as ctx:
            svc.embed_query("anything")
        self.assertNotIn("outage", str(ctx.exception))  # raw provider text is not passed through

    def test_wrong_dimension_rejected(self):
        svc = EmbeddingService(small_settings(), WrongDimensionBackend())
        with self.assertRaises(DimensionMismatchError):
            svc.embed_query("anything")

    def test_wrong_vector_count_rejected(self):
        class Short:
            def encode(self, texts):
                return []
        with self.assertRaises(EmbeddingUnavailableError):
            EmbeddingService(small_settings(), Short()).embed_query("x")


class BackendSelectionTests(unittest.TestCase):
    def test_unknown_provider_has_clear_error(self):
        with self.assertRaises(EmbeddingUnavailableError) as ctx:
            build_backend(small_settings(provider="openai"))
        self.assertIn("not implemented", str(ctx.exception).lower())

    def test_missing_library_gives_install_hint(self):
        with mock.patch.dict(sys.modules, {"sentence_transformers": None}):  # makes the import fail
            backend = SentenceTransformerBackend("any-model")
            with self.assertRaises(EmbeddingUnavailableError) as ctx:
                backend.encode(["x"])
        self.assertIn("pip install", str(ctx.exception))


if __name__ == "__main__":
    unittest.main()
