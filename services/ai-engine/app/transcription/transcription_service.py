"""
US-05 – Whisper Speech-to-Text Integration
Transcription orchestration service.

:class:`TranscriptionService` is the central coordinator of the transcription
pipeline.  It sequences validation → decoding → inference → result assembly
and maps every failure mode to a typed :class:`~app.transcription.models.TranscriptionResult`
so that callers never receive raw exceptions from the pipeline.

Error-mapping contract
----------------------
* ``FAILED`` status is returned for all unrecoverable and validation errors.
* ``EMPTY`` status is returned when inference succeeds but no speech segments
  are found (silent recording, music-only, etc.).
* Stack traces are **never** placed in ``TranscriptionResult.error_message``.
* All errors are logged at an appropriate level (``WARNING`` for validation,
  ``ERROR`` for infrastructure failures).
"""
from __future__ import annotations

import datetime
import logging
import uuid
from typing import Optional

from app.transcription.audio_decoder import AudioDecoder
from app.transcription.audio_validator import AudioValidator
from app.transcription.config import TranscriptionConfig
from app.transcription.exceptions import (
    AudioValidationError,
    InferenceError,
    ModelInitializationError,
    TranscriptionBaseError,
)
from app.transcription.models import (
    TranscriptionError,
    TranscriptionRequest,
    TranscriptionResult,
    TranscriptionSegment,
    TranscriptionStatus,
)
from app.transcription.whisper_provider import WhisperProvider

logger = logging.getLogger(__name__)


def _as_float(value: object) -> Optional[float]:
    """Return *value* as ``float`` if it is a real number, else ``None``."""
    if isinstance(value, bool) or not isinstance(value, (int, float)):
        return None
    return float(value)


class TranscriptionService:
    """Orchestrates the full transcription pipeline for a single audio file.

    Parameters
    ----------
    config:
        :class:`~app.transcription.config.TranscriptionConfig` to use.
        Defaults to :class:`~app.transcription.config.TranscriptionConfig`
        constructed with its own defaults (tiny model, CPU, int8).
    provider:
        :class:`~app.transcription.whisper_provider.WhisperProvider` instance.
        Defaults to a new ``WhisperProvider(config)``.  Pass a mock here for
        unit testing.
    """

    def __init__(
        self,
        config: Optional[TranscriptionConfig] = None,
        provider: Optional[WhisperProvider] = None,
    ) -> None:
        self._config = config or TranscriptionConfig.from_env()
        self._provider = provider or WhisperProvider(self._config)
        self._validator = AudioValidator(self._config)

    # ------------------------------------------------------------------
    # Public API
    # ------------------------------------------------------------------

    def transcribe(self, request: TranscriptionRequest) -> TranscriptionResult:
        """Execute the full transcription pipeline for *request*.

        Parameters
        ----------
        request:
            :class:`~app.transcription.models.TranscriptionRequest` carrying
            the audio path and optional metadata.

        Returns
        -------
        TranscriptionResult
            Always returned (never raises).  Inspect ``.status`` to determine
            the outcome.
        """
        transcription_id = request.transcription_id or str(uuid.uuid4())
        created_at = _utc_now_iso()
        start_time = _monotonic()

        logger.info(
            "Starting transcription [id=%s, attempt=%d, recording_id=%s].",
            transcription_id,
            request.attempt_number,
            request.recording_id or "N/A",
        )

        def _failed(
            error_code: TranscriptionError,
            error_message: str,
            duration: Optional[float] = None,
        ) -> TranscriptionResult:
            return TranscriptionResult(
                transcription_id=transcription_id,
                recording_id=request.recording_id,
                attempt_number=request.attempt_number,
                status=TranscriptionStatus.FAILED,
                transcript=None,
                detected_language=None,
                language_probability=None,
                segments=[],
                processing_duration_seconds=duration,
                error_code=error_code,
                error_message=error_message,
                model_name=self._config.model_name,
                created_at=created_at,
            )

        # ----- 1. Validate audio ----------------------------------------
        try:
            self._validator.validate(request.audio_path)
        except AudioValidationError as exc:
            logger.warning(
                "Audio validation failed [id=%s]: %s",
                transcription_id,
                exc.safe_message,
            )
            return _failed(
                error_code=exc.error_code,
                error_message=exc.safe_message,
                duration=_elapsed(start_time),
            )

        # ----- 2. Decode / prepare audio --------------------------------
        decoder = AudioDecoder(self._config)
        try:
            with decoder:
                prepared_path = decoder.prepare_audio(request.audio_path)
                logger.debug(
                    "Audio prepared [id=%s]: %s", transcription_id, prepared_path
                )

                # ----- 3. Inference -------------------------------------
                try:
                    segments_raw, info = self._provider.transcribe(
                        prepared_path,
                        language=request.language_hint,
                    )
                except ModelInitializationError as exc:
                    logger.error(
                        "Model init failed [id=%s]: %s",
                        transcription_id,
                        exc.safe_message,
                    )
                    return _failed(
                        error_code=exc.error_code,
                        error_message=exc.safe_message,
                        duration=_elapsed(start_time),
                    )
                except InferenceError as exc:
                    logger.error(
                        "Inference failed [id=%s]: %s",
                        transcription_id,
                        exc.safe_message,
                    )
                    return _failed(
                        error_code=exc.error_code,
                        error_message=exc.safe_message,
                        duration=_elapsed(start_time),
                    )
                except TranscriptionBaseError as exc:
                    logger.error(
                        "Pipeline error [id=%s]: %s",
                        transcription_id,
                        exc.safe_message,
                    )
                    return _failed(
                        error_code=exc.error_code,
                        error_message=exc.safe_message,
                        duration=_elapsed(start_time),
                    )
                except Exception:  # noqa: BLE001
                    logger.exception(
                        "Unexpected error during inference [id=%s].", transcription_id
                    )
                    return _failed(
                        error_code=TranscriptionError.UNKNOWN_ERROR,
                        error_message="An unexpected error occurred during transcription.",
                        duration=_elapsed(start_time),
                    )

                # ----- 4. Assemble result --------------------------------
                duration = _elapsed(start_time)
                return self._assemble_result(
                    transcription_id=transcription_id,
                    request=request,
                    segments_raw=segments_raw,
                    info=info,
                    duration=duration,
                    created_at=created_at,
                )

        except AudioValidationError as exc:
            # Raised by AudioDecoder (CorruptedAudioError).
            logger.warning(
                "Audio decoding failed [id=%s]: %s",
                transcription_id,
                exc.safe_message,
            )
            return _failed(
                error_code=exc.error_code,
                error_message=exc.safe_message,
                duration=_elapsed(start_time),
            )
        except Exception:  # noqa: BLE001
            logger.exception(
                "Unexpected error during audio preparation [id=%s].", transcription_id
            )
            return _failed(
                error_code=TranscriptionError.UNKNOWN_ERROR,
                error_message="An unexpected error occurred while preparing audio.",
                duration=_elapsed(start_time),
            )

    def is_ready(self) -> bool:
        """Return ``True`` if the Whisper model is loaded and ready.

        Does not trigger a model load; purely observational.
        """
        return self._provider.is_model_loaded()

    # ------------------------------------------------------------------
    # Internal helpers
    # ------------------------------------------------------------------

    def _assemble_result(
        self,
        *,
        transcription_id: str,
        request: TranscriptionRequest,
        segments_raw: list,
        info: object,
        duration: float,
        created_at: str,
    ) -> TranscriptionResult:
        """Build a :class:`~app.transcription.models.TranscriptionResult`
        from raw faster-whisper output.

        Parameters
        ----------
        transcription_id:
            UUID for this attempt.
        request:
            Original :class:`~app.transcription.models.TranscriptionRequest`.
        segments_raw:
            List of ``Segment`` objects returned by faster-whisper.
        info:
            ``TranscriptionInfo`` object returned by faster-whisper.
        duration:
            Wall-clock processing time in seconds.
        created_at:
            ISO 8601 timestamp at which the result is being assembled.

        Returns
        -------
        TranscriptionResult
            Fully populated result with COMPLETED or EMPTY status.
        """
        segments: list[TranscriptionSegment] = [
            TranscriptionSegment(
                start=seg.start,
                end=seg.end,
                text=seg.text,
                avg_logprob=_as_float(getattr(seg, "avg_logprob", None)),
                no_speech_prob=_as_float(getattr(seg, "no_speech_prob", None)),
            )
            for seg in segments_raw
        ]

        # Join segment texts; strip outer whitespace only.
        transcript_parts = [seg.text for seg in segments if seg.text.strip()]
        full_transcript = " ".join(transcript_parts).strip() if transcript_parts else ""

        is_empty = not segments or not full_transcript
        status = TranscriptionStatus.EMPTY if is_empty else TranscriptionStatus.COMPLETED

        detected_language: Optional[str] = getattr(info, "language", None)
        language_probability: Optional[float] = getattr(
            info, "language_probability", None
        )

        if status == TranscriptionStatus.COMPLETED:
            logger.info(
                "Transcription COMPLETED [id=%s, lang=%s, segments=%d, duration=%.2fs].",
                transcription_id,
                detected_language,
                len(segments),
                duration,
            )
        else:
            logger.info(
                "Transcription EMPTY (no speech detected) [id=%s, duration=%.2fs].",
                transcription_id,
                duration,
            )

        return TranscriptionResult(
            transcription_id=transcription_id,
            recording_id=request.recording_id,
            attempt_number=request.attempt_number,
            status=status,
            transcript=full_transcript if status == TranscriptionStatus.COMPLETED else None,
            detected_language=detected_language,
            language_probability=language_probability,
            segments=segments,
            processing_duration_seconds=duration,
            error_code=None,
            error_message=None,
            model_name=self._config.model_name,
            created_at=created_at,
        )


# ---------------------------------------------------------------------------
# Timing helpers
# ---------------------------------------------------------------------------


def _monotonic() -> float:
    """Return the current monotonic clock value in seconds."""
    import time
    return time.monotonic()


def _elapsed(start: float) -> float:
    """Return elapsed seconds since *start* (monotonic)."""
    import time
    return time.monotonic() - start


def _utc_now_iso() -> str:
    """Return the current UTC time as an ISO 8601 string."""
    return datetime.datetime.now(datetime.timezone.utc).isoformat()

