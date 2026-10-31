"""Embedding generation (M08).

Layers:
  * a "backend" turns a list of strings into raw vectors (real model, or a fake in tests)
  * EmbeddingService adds prefixes, validates, checks the dimension and L2-normalises.

Vectors are normalised to length 1, so cosine distance (pgvector's <=>) and
dot product rank results identically.
"""
from __future__ import annotations

import logging
import math
from typing import Protocol, Sequence

from .embedding_config import EmbeddingSettings
from .errors import DimensionMismatchError, EmbeddingUnavailableError, InvalidQueryError, MockEmbeddingError

log = logging.getLogger("retrieval.embedder")


class EmbeddingBackend(Protocol):
    def encode(self, texts: Sequence[str]) -> Sequence[Sequence[float]]: ...


def l2_normalize(vector: Sequence[float]) -> list[float]:
    values = [float(x) for x in vector]
    if any(not math.isfinite(x) for x in values):
        raise EmbeddingUnavailableError("The embedding contains NaN or infinite values.")
    norm = math.sqrt(sum(x * x for x in values))
    if norm == 0.0:
        raise EmbeddingUnavailableError("The embedding is all zeros and cannot be compared.")
    return [x / norm for x in values]


def to_pgvector_literal(vector: Sequence[float]) -> str:
    """'[0.1,0.2,...]' - passed to SQL as text and cast with ::vector."""
    return "[" + ",".join(repr(float(x)) for x in vector) + "]"


class SentenceTransformerBackend:
    """Real model backend. The library and model are loaded on first use only."""

    def __init__(self, model_name: str, batch_size: int = 16):
        self.model_name = model_name
        self.batch_size = batch_size
        self._model = None

    def _load(self):
        if self._model is None:
            try:
                from sentence_transformers import SentenceTransformer
            except ImportError:
                raise EmbeddingUnavailableError(
                    "The 'sentence-transformers' package is not installed. "
                    "Run: pip install -r requirements.txt"
                ) from None
            try:
                log.info("Loading embedding model %s", self.model_name)
                self._model = SentenceTransformer(self.model_name)
            except Exception as exc:  # download/offline/corrupt-cache errors vary a lot
                raise EmbeddingUnavailableError(
                    f"Could not load embedding model '{self.model_name}' "
                    f"({type(exc).__name__}). Check the model name and internet access "
                    "(first run downloads the model), or use a pre-downloaded copy."
                ) from None
        return self._model

    is_mock = False

    def reported_dimension(self):
        """Dimension the loaded model itself reports (loads the model on first use)."""
        return self._load().get_sentence_embedding_dimension()

    def encode(self, texts: Sequence[str]) -> Sequence[Sequence[float]]:
        model = self._load()
        try:
            return model.encode(list(texts), batch_size=self.batch_size,
                                convert_to_numpy=True, show_progress_bar=False).tolist()
        except Exception as exc:
            raise EmbeddingUnavailableError(
                f"The embedding model failed while encoding ({type(exc).__name__})."
            ) from None


def build_backend(settings: EmbeddingSettings) -> EmbeddingBackend:
    if settings.provider == "sentence-transformers":
        return SentenceTransformerBackend(settings.model, settings.batch_size)
    raise EmbeddingUnavailableError(
        f"Unknown embedding provider '{settings.provider}'. Supported: sentence-transformers. "
        "(A hosted API provider is NOT implemented; see embedding_strategy.md.)"
    )


class EmbeddingService:
    def __init__(self, settings: EmbeddingSettings, backend: EmbeddingBackend | None = None):
        self.settings = settings
        self.backend = backend if backend is not None else build_backend(settings)

    @property
    def is_mock(self) -> bool:
        """True for test doubles (backend.is_mock = True). Mock vectors must never reach a real database."""
        return bool(getattr(self.backend, "is_mock", False))

    def require_real(self, what: str = "this operation") -> None:
        if self.is_mock:
            raise MockEmbeddingError(f"A MOCK embedding backend ({self.settings.model}) cannot be used for {what}; real embeddings are required.")

    def verify_model_dimension(self) -> None:
        """Real mode: ask the model for its own dimension and compare with the configured one."""
        fn = getattr(self.backend, "reported_dimension", None)
        if fn is None:
            return
        got = fn()
        if got is not None and int(got) != self.settings.dimension:
            raise DimensionMismatchError(f"Model '{self.settings.model}' reports {got} dimensions but OPSENSE_EMBEDDING_DIM is {self.settings.dimension}. Nothing was stored.")

    @property
    def model_name(self) -> str:
        return self.settings.model

    @property
    def dimension(self) -> int:
        return self.settings.dimension

    def _encode(self, texts: list[str]) -> list[list[float]]:
        try:
            raw = self.backend.encode(texts)
        except (EmbeddingUnavailableError, DimensionMismatchError):
            raise
        except Exception as exc:
            raise EmbeddingUnavailableError(
                f"The embedding provider failed ({type(exc).__name__})."
            ) from None
        if len(raw) != len(texts):
            raise EmbeddingUnavailableError(
                f"The provider returned {len(raw)} vectors for {len(texts)} texts."
            )
        out = []
        for vec in raw:
            if len(vec) != self.settings.dimension:
                raise DimensionMismatchError(
                    f"Model '{self.settings.model}' returned a {len(vec)}-dimensional vector but "
                    f"OPSENSE_EMBEDDING_DIM is {self.settings.dimension}. Nothing was stored."
                )
            out.append(l2_normalize(vec))
        return out

    def embed_documents(self, texts: Sequence[str]) -> list[list[float]]:
        cleaned = []
        for text in texts:
            if not isinstance(text, str) or not text.strip():
                raise InvalidQueryError("Cannot embed an empty case text.")
            cleaned.append(self.settings.document_prefix + text)
        vectors: list[list[float]] = []
        step = self.settings.batch_size
        for start in range(0, len(cleaned), step):
            vectors.extend(self._encode(cleaned[start:start + step]))
        return vectors

    def embed_query(self, query: str) -> list[float]:
        query = validate_query(query, self.settings.max_query_chars)
        return self._encode([self.settings.query_prefix + query])[0]


def validate_query(query: object, max_chars: int) -> str:
    """Return the cleaned query or raise InvalidQueryError."""
    if not isinstance(query, str):
        raise InvalidQueryError("The search text must be a string.")
    cleaned = " ".join(query.split())
    if not cleaned:
        raise InvalidQueryError("The search text is empty. Describe the symptom you observed.")
    if len(cleaned) > max_chars:
        raise InvalidQueryError(
            f"The search text is {len(cleaned)} characters; the limit is {max_chars}. "
            "Please shorten it to the key symptoms."
        )
    return cleaned
