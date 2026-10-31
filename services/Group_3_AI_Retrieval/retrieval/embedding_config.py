"""Embedding settings (M08). Read from environment variables / the project's .env file.

Kept separate from config.py (database settings) so the embedding model can be
changed without touching the connection code. No secrets are stored here.
"""
from __future__ import annotations

import os
from dataclasses import dataclass

from dotenv import load_dotenv

from .config import ENV_PATH

# PROVISIONAL defaults (not yet approved by the team; see documentation/m08/embedding_strategy.md).
DEFAULT_PROVIDER = "sentence-transformers"
DEFAULT_MODEL = "intfloat/multilingual-e5-small"
DEFAULT_DIMENSION = 384  # must equal historical_case.embedding vector(N) in migration 006
DEFAULT_QUERY_PREFIX = "query: "      # required by the E5 model family
DEFAULT_DOCUMENT_PREFIX = "passage: "  # required by the E5 model family
DEFAULT_BATCH_SIZE = 16
DEFAULT_MAX_QUERY_CHARS = 2000


# Published output dimensions of supported models. A configured dimension that contradicts a known model is rejected.
KNOWN_MODEL_DIMENSIONS = {
    "intfloat/multilingual-e5-small": 384,
    "multilingual-e5-small": 384,
}
# E5-family models expect "query: " / "passage: " prefixes (model-card convention; NOT re-verified from the source in
# the Group 3 Final build environment, see EMBEDDING_STRATEGY.md). Both sides use these constants through EmbeddingService.
E5_FAMILY_HINT = "e5"
PIPELINE_TEXT_VERSION_ENV = None


class ConfigError(RuntimeError):
    """An embedding setting is missing or invalid."""


@dataclass(frozen=True)
class EmbeddingSettings:
    provider: str = DEFAULT_PROVIDER
    model: str = DEFAULT_MODEL
    dimension: int = DEFAULT_DIMENSION
    query_prefix: str = DEFAULT_QUERY_PREFIX
    document_prefix: str = DEFAULT_DOCUMENT_PREFIX
    batch_size: int = DEFAULT_BATCH_SIZE
    max_query_chars: int = DEFAULT_MAX_QUERY_CHARS
    # None = no cut-off. There is no approved threshold yet; do not invent one.
    min_similarity: float | None = None


def _int(name: str, default: int, minimum: int = 1) -> int:
    raw = os.environ.get(name)
    if raw is None or raw.strip() == "":
        return default
    try:
        value = int(raw)
    except ValueError:
        raise ConfigError(f"{name} must be a whole number.") from None
    if value < minimum:
        raise ConfigError(f"{name} must be at least {minimum}.")
    return value


def _text(name: str, default: str) -> str:
    """Unset -> default. Set but empty -> empty string (needed to switch prefixes off)."""
    raw = os.environ.get(name)
    return default if raw is None else raw


def check_known_dimension(model: str, dim: int) -> None:
    known = KNOWN_MODEL_DIMENSIONS.get(model)
    if known is not None and known != dim:
        raise ConfigError(f"OPSENSE_EMBEDDING_DIM={dim} contradicts model '{model}', which produces {known}-dimensional vectors.")


def load_embedding_settings(load_env_file: bool = True) -> EmbeddingSettings:
    if load_env_file:
        load_dotenv(ENV_PATH)

    min_sim_raw = os.environ.get("OPSENSE_MIN_SIMILARITY")
    min_similarity = None
    if min_sim_raw is not None and min_sim_raw.strip() != "":
        try:
            min_similarity = float(min_sim_raw)
        except ValueError:
            raise ConfigError("OPSENSE_MIN_SIMILARITY must be a number.") from None
        if not -1.0 <= min_similarity <= 1.0:
            raise ConfigError("OPSENSE_MIN_SIMILARITY must be between -1 and 1.")

    provider = _text("OPSENSE_EMBEDDING_PROVIDER", DEFAULT_PROVIDER).strip().lower()
    model = _text("OPSENSE_EMBEDDING_MODEL", DEFAULT_MODEL).strip()
    if not provider or not model:
        raise ConfigError("OPSENSE_EMBEDDING_PROVIDER and OPSENSE_EMBEDDING_MODEL must not be empty.")

    dim = _int("OPSENSE_EMBEDDING_DIM", DEFAULT_DIMENSION)
    check_known_dimension(model, dim)
    return EmbeddingSettings(
        provider=provider,
        model=model,
        dimension=dim,
        query_prefix=_text("OPSENSE_EMBEDDING_QUERY_PREFIX", DEFAULT_QUERY_PREFIX),
        document_prefix=_text("OPSENSE_EMBEDDING_DOCUMENT_PREFIX", DEFAULT_DOCUMENT_PREFIX),
        batch_size=_int("OPSENSE_EMBEDDING_BATCH_SIZE", DEFAULT_BATCH_SIZE),
        max_query_chars=_int("OPSENSE_MAX_QUERY_CHARS", DEFAULT_MAX_QUERY_CHARS),
        min_similarity=min_similarity,
    )
