"""
US-05 – Whisper Speech-to-Text Integration
Custom exception hierarchy for the transcription subsystem.

All exceptions carry a structured :class:`~app.transcription.models.TranscriptionError`
code and a *safe* human-readable message that is guaranteed never to contain
Python stack traces or raw low-level error strings.  Callers may surface
``safe_message`` directly to end-users or logs.
"""
from __future__ import annotations

from app.transcription.models import TranscriptionError


# ---------------------------------------------------------------------------
# Base exception
# ---------------------------------------------------------------------------


class TranscriptionBaseError(Exception):
    """Base class for all transcription pipeline errors.

    Attributes
    ----------
    error_code:
        Structured :class:`~app.transcription.models.TranscriptionError`
        variant that allows callers to handle failures programmatically.
    safe_message:
        Human-readable message that is safe to surface externally.  Must
        **not** contain Python stack traces or sensitive system information.
    """

    def __init__(self, error_code: TranscriptionError, safe_message: str) -> None:
        super().__init__(safe_message)
        self.error_code: TranscriptionError = error_code
        self.safe_message: str = safe_message

    def __repr__(self) -> str:  # pragma: no cover
        return (
            f"{type(self).__name__}("
            f"error_code={self.error_code!r}, "
            f"safe_message={self.safe_message!r})"
        )


# ---------------------------------------------------------------------------
# Audio validation errors
# ---------------------------------------------------------------------------


class AudioValidationError(TranscriptionBaseError):
    """Raised when an audio file fails any pre-inference validation check.

    This is the parent of all format, size, and content validation errors.
    Catching this class captures *all* validation failures.
    """


class UnsupportedFormatError(AudioValidationError):
    """Raised when the audio file extension is not in ``supported_formats``.

    Parameters
    ----------
    path:
        The path whose extension was rejected.
    extension:
        The unsupported extension (e.g. ``".xyz"``).
    """

    def __init__(self, path: str, extension: str) -> None:
        super().__init__(
            error_code=TranscriptionError.UNSUPPORTED_FORMAT,
            safe_message=(
                f"Audio format '{extension}' is not supported. "
                "Accepted formats: .wav, .mp3, .flac, .ogg, .m4a, .webm."
            ),
        )
        self.path = path
        self.extension = extension


class FileSizeError(AudioValidationError):
    """Raised when the audio file exceeds the configured size limit.

    Parameters
    ----------
    path:
        The path that was too large.
    actual_bytes:
        Actual file size in bytes.
    limit_bytes:
        Configured ``max_file_size_bytes``.
    """

    def __init__(self, path: str, actual_bytes: int, limit_bytes: int) -> None:
        limit_mb = limit_bytes / (1024 * 1024)
        actual_mb = actual_bytes / (1024 * 1024)
        super().__init__(
            error_code=TranscriptionError.FILE_TOO_LARGE,
            safe_message=(
                f"Audio file is too large ({actual_mb:.1f} MB). "
                f"Maximum allowed size is {limit_mb:.0f} MB."
            ),
        )
        self.path = path
        self.actual_bytes = actual_bytes
        self.limit_bytes = limit_bytes


class EmptyFileError(AudioValidationError):
    """Raised when the audio file exists but contains zero bytes.

    Parameters
    ----------
    path:
        The path to the empty file.
    """

    def __init__(self, path: str) -> None:
        super().__init__(
            error_code=TranscriptionError.FILE_EMPTY,
            safe_message="Audio file is empty (0 bytes).",
        )
        self.path = path


class CorruptedAudioError(AudioValidationError):
    """Raised when the audio file exists but cannot be decoded.

    This covers both magic-byte mismatches detected during validation and
    decoding failures surfaced by the audio decoder (e.g. soundfile errors).

    Parameters
    ----------
    path:
        The path to the corrupted file.
    detail:
        A *safe* (non-stack-trace) description of why the file was rejected.
    """

    def __init__(self, path: str, detail: str = "File cannot be decoded.") -> None:
        super().__init__(
            error_code=TranscriptionError.INVALID_AUDIO,
            safe_message=f"Audio file appears to be corrupted or invalid: {detail}",
        )
        self.path = path


class AudioTooLongError(AudioValidationError):
    """Raised when the audio file's decoded duration exceeds the configured limit.

    This check protects the transcription worker from unbounded CPU inference
    caused by highly compressed audio that fits within the byte-size limit but
    contains far more audio than the 30-second operational ceiling.

    Parameters
    ----------
    path:
        The path to the audio file that was too long.
    actual_seconds:
        Measured or estimated audio duration in seconds.
    limit_seconds:
        Configured ``max_duration_seconds``.
    """

    def __init__(
        self, path: str, actual_seconds: float, limit_seconds: float
    ) -> None:
        super().__init__(
            error_code=TranscriptionError.VALIDATION_ERROR,
            safe_message=(
                f"Audio file is too long ({actual_seconds:.1f}s). "
                f"Maximum allowed duration is {limit_seconds:.0f}s."
            ),
        )
        self.path = path
        self.actual_seconds = actual_seconds
        self.limit_seconds = limit_seconds


# ---------------------------------------------------------------------------
# Infrastructure errors
# ---------------------------------------------------------------------------


class ModelInitializationError(TranscriptionBaseError):
    """Raised when the Whisper model cannot be loaded.

    This may happen if the model weights have not been downloaded, the
    CTranslate2 runtime is incompatible, or insufficient memory is available.

    Parameters
    ----------
    model_name:
        Identifier of the model that failed to load.
    detail:
        A *safe* description of the failure cause (no stack traces).
    """

    def __init__(self, model_name: str, detail: str = "") -> None:
        message = f"Failed to initialise Whisper model '{model_name}'."
        if detail:
            message = f"{message} {detail}"
        super().__init__(
            error_code=TranscriptionError.MODEL_INIT_FAILURE,
            safe_message=message,
        )
        self.model_name = model_name


class InferenceError(TranscriptionBaseError):
    """Raised when the model is loaded but raises during forward inference.

    Parameters
    ----------
    model_name:
        Identifier of the model in use at the time of the failure.
    detail:
        A *safe* description of the failure cause (no stack traces).
    """

    def __init__(self, model_name: str, detail: str = "") -> None:
        message = f"Inference failed using model '{model_name}'."
        if detail:
            message = f"{message} {detail}"
        super().__init__(
            error_code=TranscriptionError.INFERENCE_FAILURE,
            safe_message=message,
        )
        self.model_name = model_name

