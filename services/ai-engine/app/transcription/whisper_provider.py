"""
US-05 – Whisper Speech-to-Text Integration
faster-whisper model provider for the transcription subsystem.

:class:`WhisperProvider` owns the lifecycle of the underlying
``faster_whisper.WhisperModel`` instance.  A module-level cache ensures that
the same model is not loaded more than once per process, regardless of how
many :class:`WhisperProvider` instances are created with the same
configuration.

Thread safety
-------------
Model loading is guarded by a per-model ``threading.Lock`` so that
concurrent callers do not each trigger a redundant (and expensive) load.
Inference itself is *not* serialised; the WhisperModel transcribe method is
re-entrant for read-only use.
"""
from __future__ import annotations

import logging
import threading
from typing import Optional, Tuple

from app.transcription.config import TranscriptionConfig
from app.transcription.exceptions import InferenceError, ModelInitializationError

logger = logging.getLogger(__name__)


# ---------------------------------------------------------------------------
# Module-level model cache
# ---------------------------------------------------------------------------

# Maps a cache key (model_name + device + compute_type) to a loaded model.
_model_cache: dict[str, object] = {}

# Per-key lock prevents simultaneous load attempts for the same model.
_cache_locks: dict[str, threading.Lock] = {}
_registry_lock = threading.Lock()


def _get_lock(key: str) -> threading.Lock:
    """Return (or create) the per-model threading.Lock for *key*."""
    with _registry_lock:
        if key not in _cache_locks:
            _cache_locks[key] = threading.Lock()
        return _cache_locks[key]


def _build_cache_key(config: TranscriptionConfig) -> str:
    return (
        f"{config.model_name}::{config.device}::{config.compute_type}"
        f"::{config.model_dir or ''}::{int(config.local_files_only)}"
    )


# ---------------------------------------------------------------------------
# Provider
# ---------------------------------------------------------------------------


class WhisperProvider:
    """Wraps a ``faster_whisper.WhisperModel`` with caching and error handling.

    Parameters
    ----------
    config:
        :class:`~app.transcription.config.TranscriptionConfig` that specifies
        which model to load and how to run inference.
    """

    def __init__(self, config: TranscriptionConfig) -> None:
        self._config = config
        self._cache_key = _build_cache_key(config)

    # ------------------------------------------------------------------
    # Model management
    # ------------------------------------------------------------------

    def _load_model(self) -> object:
        """Return a cached ``WhisperModel``, loading it if necessary.

        Returns
        -------
        WhisperModel
            faster-whisper model ready for inference.

        Raises
        ------
        ModelInitializationError
            If the model cannot be loaded for any reason.
        """
        lock = _get_lock(self._cache_key)
        with lock:
            if self._cache_key in _model_cache:
                logger.debug(
                    "Using cached Whisper model: %s", self._config.model_name
                )
                return _model_cache[self._cache_key]

            logger.info(
                "Loading Whisper model '%s' on %s (%s)…",
                self._config.model_name,
                self._config.device,
                self._config.compute_type,
            )
            try:
                from faster_whisper import WhisperModel  # type: ignore[import]

                model_kwargs: dict = dict(
                    device=self._config.device,
                    compute_type=self._config.compute_type,
                )
                if self._config.model_dir:
                    model_kwargs["download_root"] = self._config.model_dir
                if self._config.local_files_only:
                    model_kwargs["local_files_only"] = True

                model = WhisperModel(self._config.model_name, **model_kwargs)
            except ImportError:
                raise ModelInitializationError(
                    model_name=self._config.model_name,
                    detail=(
                        "The 'faster-whisper' package is not installed. "
                        "Run: pip install faster-whisper==1.1.0"
                    ),
                )
            except Exception:  # noqa: BLE001
                # Intentionally do not forward the original exception message
                # (it may contain local path information).
                raise ModelInitializationError(
                    model_name=self._config.model_name,
                    detail="Model weights could not be loaded. "
                           "Ensure the model has been downloaded (first run "
                           "needs internet) and that the model name/path is correct.",
                )

            _model_cache[self._cache_key] = model
            logger.info(
                "Whisper model '%s' loaded and cached.", self._config.model_name
            )
            return model

    def is_model_loaded(self) -> bool:
        """Return ``True`` if the model for the current config is in cache.

        Does **not** attempt to load the model.
        """
        return self._cache_key in _model_cache

    # ------------------------------------------------------------------
    # Inference
    # ------------------------------------------------------------------

    def transcribe(
        self,
        audio_path: str,
        language: Optional[str] = None,
    ) -> Tuple[list, object]:
        """Run Whisper inference on *audio_path*.

        Parameters
        ----------
        audio_path:
            Path to a 16 kHz mono PCM WAV file (as prepared by
            :class:`~app.transcription.audio_decoder.AudioDecoder`).
        language:
            BCP-47 language code hint, or ``None`` for auto-detection.
            When ``None`` the value from ``config.language`` is used.

        Returns
        -------
        tuple[list[Segment], TranscriptionInfo]
            Raw faster-whisper return values.  The ``Segment`` objects are
            consumed by :class:`~app.transcription.transcription_service.TranscriptionService`.

        Raises
        ------
        ModelInitializationError
            If the model could not be loaded.
        InferenceError
            If inference raises for any reason.
        """
        model = self._load_model()

        effective_language = language if language is not None else self._config.language

        # Ingest prepared audio. Passing the audio waveform as a float32 numpy
        # array avoids faster-whisper's internal PyAV-based decode_audio(),
        # which fails on Python 3.14 / PyAV 19+ due to the removed
        # 'metadata_errors' parameter in av.open().
        audio_input: object = audio_path
        try:
            import soundfile as sf  # type: ignore[import]

            audio_data, _ = sf.read(audio_path, dtype="float32")
            if hasattr(audio_data, "ndim") and audio_data.ndim > 1:
                audio_data = (
                    audio_data.mean(axis=1)
                    if audio_data.shape[1] > 1
                    else audio_data[:, 0]
                )
            audio_input = audio_data
        except Exception:  # noqa: BLE001
            audio_input = audio_path

        try:
            transcribe_kwargs: dict = dict(
                beam_size=self._config.beam_size,
                language=effective_language,
                vad_filter=self._config.vad_filter,
                vad_parameters=self._config.vad_parameters,
            )
            if self._config.initial_prompt:
                transcribe_kwargs["initial_prompt"] = self._config.initial_prompt
            if self._config.temperature is not None:
                transcribe_kwargs["temperature"] = self._config.temperature

            segments_generator, info = model.transcribe(  # type: ignore[union-attr]
                audio_input,
                **transcribe_kwargs,
            )
            # Materialise the generator so that any lazy errors are caught here.
            segments = list(segments_generator)
        except (ModelInitializationError,):
            raise
        except Exception:  # noqa: BLE001
            raise InferenceError(
                model_name=self._config.model_name,
                detail="An error occurred during audio inference.",
            )

        logger.debug(
            "Inference complete: %d segment(s) detected, language='%s' (p=%.2f).",
            len(segments),
            getattr(info, "language", "unknown"),
            getattr(info, "language_probability", 0.0),
        )
        return segments, info

