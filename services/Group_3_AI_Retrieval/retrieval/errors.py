"""Exceptions used by the M08 embedding and retrieval code (plain, beginner-friendly)."""


class RetrievalError(Exception):
    """Base class for all M08 errors."""


class InvalidQueryError(RetrievalError, ValueError):
    """The search text is empty, not text, or too long."""


class EmbeddingUnavailableError(RetrievalError):
    """The embedding library/model could not be loaded or failed while encoding."""


class DimensionMismatchError(RetrievalError):
    """A vector (or the configured dimension) does not match the database column."""


class StorageError(RetrievalError):
    """A database read/write failed."""


class MockEmbeddingError(RetrievalError):
    """A MOCK / test-only embedding backend was used where real embeddings are required (e.g. a real database)."""
