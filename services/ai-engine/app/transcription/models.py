"""
US-05 – Whisper Speech-to-Text Integration
Data models for the transcription subsystem.

This module defines the domain objects that flow between every layer of the
transcription pipeline: request inputs, segment-level output, and the
top-level result that is returned to callers.
"""
from __future__ import annotations

import dataclasses
from dataclasses import dataclass, field
from enum import Enum
from typing import Optional


# ---------------------------------------------------------------------------
# Enumerations
# ---------------------------------------------------------------------------


class TranscriptionStatus(str, Enum):
    """Lifecycle status of a transcription attempt.

    Attributes
    ----------
    QUEUED:
        The request has been accepted but processing has not started.
    PROCESSING:
        Inference is currently in progress.
    COMPLETED:
        Transcription finished and at least one segment of speech was found.
    EMPTY:
        Transcription finished successfully, but no speech was detected in
        the audio (e.g. a recording of silence).
    FAILED:
        A terminal error occurred; see ``error_code`` and ``error_message``
        on :class:`TranscriptionResult` for details.
    """

    QUEUED = "QUEUED"
    PROCESSING = "PROCESSING"
    COMPLETED = "COMPLETED"
    EMPTY = "EMPTY"
    FAILED = "FAILED"


class TranscriptionError(str, Enum):
    """Structured error codes for transcription failures.

    These codes allow callers to programmatically distinguish retryable
    infrastructure errors from permanent input validation errors without
    parsing human-readable messages.

    Attributes
    ----------
    UNSUPPORTED_FORMAT:
        The audio file has an extension that the pipeline does not accept.
    FILE_NOT_FOUND:
        The path supplied in the request does not point to an existing file.
    FILE_EMPTY:
        The file exists but contains zero bytes.
    FILE_TOO_LARGE:
        The file exceeds the configured ``max_file_size_bytes`` limit.
    INVALID_AUDIO:
        The file header / magic bytes do not match the declared format, or
        the audio is otherwise unreadable.
    NO_SPEECH_DETECTED:
        Inference succeeded but produced no speech segments.
    MODEL_INIT_FAILURE:
        The Whisper model could not be loaded (e.g. missing weights file or
        incompatible runtime).
    INFERENCE_FAILURE:
        The model was loaded but raised an error during forward inference.
    VALIDATION_ERROR:
        A generic validation error not covered by the more specific codes.
    UNKNOWN_ERROR:
        An unexpected error that does not map to any other code.
    """

    UNSUPPORTED_FORMAT = "UNSUPPORTED_FORMAT"
    FILE_NOT_FOUND = "FILE_NOT_FOUND"
    FILE_EMPTY = "FILE_EMPTY"
    FILE_TOO_LARGE = "FILE_TOO_LARGE"
    INVALID_AUDIO = "INVALID_AUDIO"
    NO_SPEECH_DETECTED = "NO_SPEECH_DETECTED"
    MODEL_INIT_FAILURE = "MODEL_INIT_FAILURE"
    INFERENCE_FAILURE = "INFERENCE_FAILURE"
    VALIDATION_ERROR = "VALIDATION_ERROR"
    UNKNOWN_ERROR = "UNKNOWN_ERROR"


# ---------------------------------------------------------------------------
# Segment model
# ---------------------------------------------------------------------------


@dataclass
class TranscriptionSegment:
    """A single timed speech segment produced by the Whisper model.

    Attributes
    ----------
    start:
        Start timestamp within the audio, in seconds.
    end:
        End timestamp within the audio, in seconds.
    text:
        Transcribed text for this segment.  Leading/trailing whitespace is
        preserved exactly as returned by faster-whisper.
    """

    start: float
    end: float
    text: str
    # Optional confidence signals reported by Whisper (None if unavailable).
    # ``avg_logprob`` closer to 0 = more confident; ``no_speech_prob`` closer
    # to 1 = more likely that the segment is not speech.
    avg_logprob: Optional[float] = None
    no_speech_prob: Optional[float] = None

    def duration(self) -> float:
        """Return the duration of this segment in seconds."""
        return self.end - self.start


# ---------------------------------------------------------------------------
# Top-level result
# ---------------------------------------------------------------------------


@dataclass
class TranscriptionResult:
    """Complete result for a single transcription attempt.

    Attributes
    ----------
    transcription_id:
        Unique identifier for this transcription attempt (UUID4 string).
    recording_id:
        Caller-supplied identifier linking this result to the originating
        audio recording in the backend.  May be ``None`` if the caller did
        not supply one.
    attempt_number:
        1-based attempt counter; incremented by the caller on retry.
    status:
        Final lifecycle status of this attempt.
    transcript:
        Full transcript text assembled from all segments, or ``None`` if
        status is ``FAILED`` or ``EMPTY``.
    detected_language:
        BCP-47 language code inferred by Whisper (e.g. ``"en"``), or
        ``None`` if detection did not run or status is ``FAILED``.
    language_probability:
        Confidence in the detected language in the range [0, 1], or ``None``.
    segments:
        Ordered list of :class:`TranscriptionSegment` objects.  Empty on
        ``FAILED`` and ``EMPTY`` results.
    processing_duration_seconds:
        Wall-clock time spent in inference, in seconds.  ``None`` if
        processing did not complete.
    error_code:
        Structured error code, populated only when ``status`` is ``FAILED``.
    error_message:
        Human-readable error description safe for external consumers.
        **Never** contains Python stack traces or raw exception messages.
    model_name:
        The Whisper model variant used for this attempt.
    created_at:
        ISO 8601 UTC timestamp at which this result was produced.
    """

    transcription_id: str
    recording_id: Optional[str]
    attempt_number: int
    status: TranscriptionStatus
    transcript: Optional[str]
    detected_language: Optional[str]
    language_probability: Optional[float]
    segments: list[TranscriptionSegment]
    processing_duration_seconds: Optional[float]
    error_code: Optional[TranscriptionError]
    error_message: Optional[str]
    model_name: str
    created_at: str  # ISO 8601 UTC

    def to_dict(self) -> dict:
        """Return a JSON-serialisable dictionary representation.

        Uses :func:`dataclasses.asdict` and coerces enum values to their
        string representations so the result is safe to pass to
        ``json.dumps`` without a custom encoder.
        """
        raw = dataclasses.asdict(self)
        # Coerce enum fields to their string values.
        raw["status"] = self.status.value
        if self.error_code is not None:
            raw["error_code"] = self.error_code.value
        return raw


# ---------------------------------------------------------------------------
# Request model
# ---------------------------------------------------------------------------


@dataclass
class TranscriptionRequest:
    """Input parameters for a single transcription attempt.

    Attributes
    ----------
    audio_path:
        Absolute (or resolvable) path to the audio file on the local
        filesystem.  The file must already be present; this interface does
        not perform any network retrieval.
    recording_id:
        Caller-supplied identifier to correlate the result with a backend
        recording entity.  Passed through unchanged to
        :class:`TranscriptionResult`.
    transcription_id:
        Pre-generated UUID for this attempt.  When ``None``, the service
        generates one automatically (UUID4).
    attempt_number:
        1-based retry counter supplied by the caller.  Recorded in the
        result for observability.
    language_hint:
        Optional BCP-47 language code to override automatic detection.
        Corresponds to :attr:`TranscriptionConfig.language` but applied
        per-request, allowing different recordings to use different hints
        without reconfiguring the service.
    """

    audio_path: str
    recording_id: Optional[str] = None
    transcription_id: Optional[str] = None
    attempt_number: int = 1
    language_hint: Optional[str] = None

