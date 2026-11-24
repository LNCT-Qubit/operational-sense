"""
US-05 – Whisper Speech-to-Text Integration
Configuration dataclass for the transcription subsystem.

All runtime tuning is captured here so that callers and tests can override
individual settings without touching environment variables.  Values may also
be sourced from the environment via :meth:`TranscriptionConfig.from_env`.
"""
from __future__ import annotations

import os
import re
from dataclasses import dataclass, field
from typing import Optional


# ---------------------------------------------------------------------------
# Supported model identifiers
# ---------------------------------------------------------------------------

SUPPORTED_MODELS: list[str] = [
    "tiny",
    "base",
    "small",
    "medium",
    "large-v2",
    "large-v3",
]

# ---------------------------------------------------------------------------
# Hinglish profile
# ---------------------------------------------------------------------------
# Stock Whisper handles Hindi and English as separate languages and is weak on
# mixed ("Hinglish") speech.  The Hinglish profile therefore swaps in
# community fine-tuned Whisper models that are already published in
# CTranslate2 format (loadable by faster-whisper) and that write Roman-script
# Hinglish when decoded with the English language token.
#
#   accurate -> Whisper Hindi2Hinglish "Prime" conversion (~1.5 GB, slower)
#   fast     -> Whisper Hindi2Hinglish "Swift" (Whisper-base) conversion
#              (~78 MB int8, much faster on CPU)
#
# These are third-party models: validate accuracy on your own recordings
# (see scripts/evaluate_wer.py) and check the model licence before shipping.
HINGLISH_MODELS: dict[str, str] = {
    "accurate": "Hub84/faster-whisper-hinglish-prime",
    "fast": "MSpider3/whisper-hindi2hinglish-swift-ct2",
}
HINGLISH_DEFAULT_QUALITY = "accurate"
SUPPORTED_PROFILES: tuple[str, ...] = ("default", "hinglish")

# Hugging Face repo id ("owner/name").
_HF_REPO_RE = re.compile(r"^[A-Za-z0-9][A-Za-z0-9._-]*/[A-Za-z0-9][A-Za-z0-9._-]*$")


def is_valid_model_identifier(name: str) -> bool:
    """Return ``True`` for an official size, a Hugging Face repo id or a local dir."""
    if not isinstance(name, str) or not name:
        return False
    if name in SUPPORTED_MODELS:
        return True
    if _HF_REPO_RE.match(name):
        return True
    return os.path.isdir(name)


# ---------------------------------------------------------------------------
# Configuration dataclass
# ---------------------------------------------------------------------------


@dataclass
class TranscriptionConfig:
    """Runtime configuration for the Whisper transcription pipeline.

    Attributes
    ----------
    model_name:
        Whisper model variant to load.  Must be one of :data:`SUPPORTED_MODELS`.
        Defaults to ``"tiny"`` for fast, low-resource CPU inference.
    device:
        Compute device.  ``"cpu"`` is the only value tested in the current
        deployment; ``"cuda"`` may be used if a compatible GPU is present.
    compute_type:
        CTranslate2 quantisation type.  ``"int8"`` gives the best throughput
        on CPU-only deployments.
    max_duration_seconds:
        Hard ceiling on accepted audio length (FR-01: 30 s).
    max_file_size_bytes:
        Hard ceiling on accepted file size in bytes (handbook limit: 15 MB).
    supported_formats:
        Tuple of lower-case file extensions (including the leading dot) that
        the pipeline will accept.
    beam_size:
        Beam search width passed to ``faster-whisper``.  Larger values improve
        accuracy at the cost of speed.
    language:
        BCP-47 language code hint (e.g. ``"en"``).  ``None`` activates
        faster-whisper's automatic language detection.
    vad_filter:
        When ``True``, faster-whisper uses its built-in voice-activity
        detection to skip silent segments before running inference.
    vad_parameters:
        Dict of keyword arguments forwarded to the VAD filter.
    model_dir:
        Optional directory used as the model download/cache root
        (``download_root`` in faster-whisper).  ``None`` = library default.
    local_files_only:
        When ``True`` never touch the network; the model must already be in
        the cache / ``model_dir`` (or be a local directory).
    initial_prompt:
        Optional text used to bias decoding towards domain vocabulary.
    temperature:
        Sampling temperature.  ``None`` keeps the faster-whisper default
        fallback schedule; ``0.0`` forces deterministic decoding.
    profile:
        ``"default"`` (English-first, unchanged behaviour) or ``"hinglish"``
        (see :meth:`hinglish`).  Informational once the config is built.

    ``model_name`` may also be a Hugging Face repo id (``"owner/name"``) of a
    CTranslate2 model, or a path to a local CTranslate2 model directory.
    """

    model_name: str = "tiny"
    device: str = "cpu"
    compute_type: str = "int8"
    max_duration_seconds: float = 30.0
    max_file_size_bytes: int = 15 * 1024 * 1024  # 15 MB
    supported_formats: tuple[str, ...] = (
        ".wav",
        ".mp3",
        ".flac",
        ".ogg",
        ".m4a",
        ".webm",
        ".aac",
    )
    beam_size: int = 5
    language: Optional[str] = None  # None = auto-detect
    vad_filter: bool = True
    vad_parameters: dict = field(
        default_factory=lambda: {"min_silence_duration_ms": 500}
    )
    model_dir: Optional[str] = None
    local_files_only: bool = False
    initial_prompt: Optional[str] = None
    temperature: Optional[float] = None
    profile: str = "default"

    # ------------------------------------------------------------------
    # Validation
    # ------------------------------------------------------------------

    def __post_init__(self) -> None:
        """Validate configuration values after initialisation."""
        if not is_valid_model_identifier(self.model_name):
            raise ValueError(
                f"Unsupported model '{self.model_name}'. "
                f"Choose from: {', '.join(SUPPORTED_MODELS)}, a Hugging Face "
                f"repo id ('owner/name') or an existing local model directory."
            )
        if self.profile not in SUPPORTED_PROFILES:
            raise ValueError(
                f"Unsupported profile '{self.profile}'. "
                f"Choose from: {', '.join(SUPPORTED_PROFILES)}"
            )
        if self.temperature is not None and self.temperature < 0:
            raise ValueError("temperature must be >= 0 or None.")
        if self.max_duration_seconds <= 0:
            raise ValueError("max_duration_seconds must be positive.")
        if self.max_file_size_bytes <= 0:
            raise ValueError("max_file_size_bytes must be positive.")
        if self.beam_size < 1:
            raise ValueError("beam_size must be >= 1.")

    # ------------------------------------------------------------------
    # Factories
    # ------------------------------------------------------------------

    @classmethod
    def hinglish(
        cls, quality: str = HINGLISH_DEFAULT_QUALITY, **overrides: object
    ) -> "TranscriptionConfig":
        """Return a config tuned for Hinglish (Hindi + English mixed) speech.

        Parameters
        ----------
        quality:
            ``"accurate"`` (default, larger model) or ``"fast"`` (small model).
        **overrides:
            Any :class:`TranscriptionConfig` field to override.

        Notes
        -----
        * ``language`` is forced to ``"en"`` because the Hinglish fine-tuned
          models emit Roman-script Hinglish under the English language token
          (with ``"hi"`` they fall back to Devanagari).  Consequently
          ``result.detected_language`` will read ``"en"`` and must **not** be
          interpreted as "the speaker used English".
        * ``temperature=0.0`` makes decoding deterministic.
        """
        if quality not in HINGLISH_MODELS:
            raise ValueError(
                f"Unknown Hinglish quality '{quality}'. "
                f"Choose from: {', '.join(HINGLISH_MODELS)}"
            )
        params: dict = dict(
            model_name=HINGLISH_MODELS[quality],
            language="en",
            beam_size=5,
            temperature=0.0,
            vad_filter=True,
            profile="hinglish",
        )
        params.update(overrides)
        return cls(**params)

    @classmethod
    def from_env(cls) -> "TranscriptionConfig":
        """Construct a :class:`TranscriptionConfig` from environment variables.

        Each setting maps to a ``TRANSCRIPTION_<UPPER_SETTING_NAME>``
        environment variable.  Missing variables fall back to the defaults of
        the selected profile (``TRANSCRIPTION_PROFILE``), which in turn fall
        back to the dataclass defaults.  Explicit variables always win over
        the profile.

        Environment variables
        ---------------------
        ``TRANSCRIPTION_PROFILE``
            ``default`` (unchanged behaviour) or ``hinglish``.
        ``TRANSCRIPTION_HINGLISH_QUALITY``
            ``accurate`` (default) or ``fast``; only used by the Hinglish profile.
        ``TRANSCRIPTION_MODEL_NAME``
            Whisper size, Hugging Face repo id or local model directory
            (default: ``"tiny"``, or the Hinglish model for that profile).
        ``TRANSCRIPTION_MODEL_DIR``
            Model download / cache directory.
        ``TRANSCRIPTION_LOCAL_FILES_ONLY``
            ``"true"`` to forbid network access (model must already be cached).
        ``TRANSCRIPTION_DEVICE``
            Compute device (default: ``"cpu"``).
        ``TRANSCRIPTION_COMPUTE_TYPE``
            CTranslate2 quantisation type (default: ``"int8"``).
        ``TRANSCRIPTION_MAX_DURATION_SECONDS``
            Maximum audio duration in seconds (default: ``30.0``).
        ``TRANSCRIPTION_MAX_FILE_SIZE_BYTES``
            Maximum file size in bytes (default: ``15728640``).
        ``TRANSCRIPTION_BEAM_SIZE``
            Beam search width (default: ``5``).
        ``TRANSCRIPTION_LANGUAGE``
            Language code; set to an empty string for auto-detect.
        ``TRANSCRIPTION_INITIAL_PROMPT``
            Optional domain-vocabulary prompt.
        ``TRANSCRIPTION_TEMPERATURE``
            Sampling temperature; empty = faster-whisper default.
        ``TRANSCRIPTION_VAD_FILTER``
            ``"true"`` / ``"1"`` to enable VAD (default: enabled).
        ``TRANSCRIPTION_VAD_MIN_SILENCE_MS``
            Minimum silence duration in milliseconds for VAD (default: ``500``).

        Returns
        -------
        TranscriptionConfig
            Configuration populated from the environment.
        """
        env = os.environ

        def _bool(val: str) -> bool:
            return val.strip().lower() in ("1", "true", "yes", "on")

        profile = env.get("TRANSCRIPTION_PROFILE", "default").strip().lower() or "default"
        if profile not in SUPPORTED_PROFILES:
            raise ValueError(
                f"Unsupported profile '{profile}'. "
                f"Choose from: {', '.join(SUPPORTED_PROFILES)}"
            )

        base: dict = {}
        if profile == "hinglish":
            quality = (
                env.get("TRANSCRIPTION_HINGLISH_QUALITY", HINGLISH_DEFAULT_QUALITY)
                .strip()
                .lower()
                or HINGLISH_DEFAULT_QUALITY
            )
            base = dict(cls.hinglish(quality).__dict__)

        def _opt_str(name: str, fallback: Optional[str]) -> Optional[str]:
            if name in env:
                raw = env[name].strip()
                return raw if raw else None
            return fallback

        temperature: Optional[float]
        if "TRANSCRIPTION_TEMPERATURE" in env:
            raw_t = env["TRANSCRIPTION_TEMPERATURE"].strip()
            temperature = float(raw_t) if raw_t else None
        else:
            temperature = base.get("temperature")

        vad_min_silence_ms = int(env.get("TRANSCRIPTION_VAD_MIN_SILENCE_MS", "500"))

        return cls(
            model_name=env.get("TRANSCRIPTION_MODEL_NAME", "").strip()
            or base.get("model_name", "tiny"),
            device=env.get("TRANSCRIPTION_DEVICE", "cpu"),
            compute_type=env.get("TRANSCRIPTION_COMPUTE_TYPE", "int8"),
            max_duration_seconds=float(
                env.get("TRANSCRIPTION_MAX_DURATION_SECONDS", "30.0")
            ),
            max_file_size_bytes=int(
                env.get("TRANSCRIPTION_MAX_FILE_SIZE_BYTES", str(15 * 1024 * 1024))
            ),
            beam_size=int(env.get("TRANSCRIPTION_BEAM_SIZE", "5")),
            language=_opt_str("TRANSCRIPTION_LANGUAGE", base.get("language")),
            vad_filter=_bool(env.get("TRANSCRIPTION_VAD_FILTER", "true")),
            vad_parameters={"min_silence_duration_ms": vad_min_silence_ms},
            model_dir=_opt_str("TRANSCRIPTION_MODEL_DIR", None),
            local_files_only=_bool(env.get("TRANSCRIPTION_LOCAL_FILES_ONLY", "false")),
            initial_prompt=_opt_str("TRANSCRIPTION_INITIAL_PROMPT", None),
            temperature=temperature,
            profile=profile,
        )
