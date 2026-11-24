"""
US-05 – Whisper Speech-to-Text Integration
Unit tests for domain model dataclasses and enumerations.
"""
from __future__ import annotations

import dataclasses

import pytest

from app.transcription.models import (
    TranscriptionError,
    TranscriptionRequest,
    TranscriptionResult,
    TranscriptionSegment,
    TranscriptionStatus,
)


class TestTranscriptionStatusEnum:

    def test_transcription_status_values(self) -> None:
        """All expected status values must be defined."""
        expected = {"QUEUED", "PROCESSING", "COMPLETED", "EMPTY", "FAILED"}
        actual = {s.value for s in TranscriptionStatus}
        assert actual == expected

    def test_status_is_string_enum(self) -> None:
        """TranscriptionStatus must inherit from str for JSON compatibility."""
        assert isinstance(TranscriptionStatus.COMPLETED, str)
        assert TranscriptionStatus.COMPLETED == "COMPLETED"


class TestTranscriptionErrorEnum:

    def test_transcription_error_codes(self) -> None:
        """All expected error codes must be defined."""
        expected = {
            "UNSUPPORTED_FORMAT",
            "FILE_NOT_FOUND",
            "FILE_EMPTY",
            "FILE_TOO_LARGE",
            "INVALID_AUDIO",
            "NO_SPEECH_DETECTED",
            "MODEL_INIT_FAILURE",
            "INFERENCE_FAILURE",
            "VALIDATION_ERROR",
            "UNKNOWN_ERROR",
        }
        actual = {e.value for e in TranscriptionError}
        assert actual == expected

    def test_error_is_string_enum(self) -> None:
        assert isinstance(TranscriptionError.FILE_NOT_FOUND, str)
        assert TranscriptionError.FILE_NOT_FOUND == "FILE_NOT_FOUND"


class TestTranscriptionSegment:

    def test_segment_creation(self) -> None:
        """Segment must store start, end, and text exactly as supplied."""
        seg = TranscriptionSegment(start=0.0, end=3.5, text=" Hello world. ")
        assert seg.start == 0.0
        assert seg.end == 3.5
        assert seg.text == " Hello world. "

    def test_segment_duration(self) -> None:
        """duration() must return end - start."""
        seg = TranscriptionSegment(start=1.0, end=4.0, text="test")
        assert seg.duration() == pytest.approx(3.0)


class TestTranscriptionResult:

    def _make_result(self, **overrides) -> TranscriptionResult:
        defaults = dict(
            transcription_id="test-id-123",
            recording_id="rec-001",
            attempt_number=1,
            status=TranscriptionStatus.COMPLETED,
            transcript="Hello world.",
            detected_language="en",
            language_probability=0.98,
            segments=[TranscriptionSegment(start=0.0, end=2.5, text="Hello world.")],
            processing_duration_seconds=0.42,
            error_code=None,
            error_message=None,
            model_name="tiny",
            created_at="2026-01-01T00:00:00+00:00",
        )
        defaults.update(overrides)
        return TranscriptionResult(**defaults)

    def test_transcription_result_defaults(self) -> None:
        """A fully constructed result must expose all expected attributes."""
        result = self._make_result()
        assert result.transcription_id == "test-id-123"
        assert result.recording_id == "rec-001"
        assert result.attempt_number == 1
        assert result.status == TranscriptionStatus.COMPLETED
        assert result.transcript == "Hello world."
        assert result.detected_language == "en"
        assert result.language_probability == pytest.approx(0.98)
        assert len(result.segments) == 1
        assert result.processing_duration_seconds == pytest.approx(0.42)
        assert result.error_code is None
        assert result.error_message is None
        assert result.model_name == "tiny"
        assert "2026" in result.created_at

    def test_result_to_dict(self) -> None:
        """to_dict() must return a JSON-serialisable dict with string enums."""
        result = self._make_result()
        d = result.to_dict()
        assert isinstance(d, dict)
        # Status must be a plain string, not an enum instance.
        assert d["status"] == "COMPLETED"
        assert isinstance(d["status"], str)
        # error_code should be None, not present as enum.
        assert d["error_code"] is None
        # Segments must be dicts (asdict converts nested dataclasses).
        assert isinstance(d["segments"], list)
        assert isinstance(d["segments"][0], dict)
        assert d["segments"][0]["text"] == "Hello world."

    def test_result_to_dict_with_error(self) -> None:
        """to_dict() must convert error_code enum to string when present."""
        result = self._make_result(
            status=TranscriptionStatus.FAILED,
            transcript=None,
            error_code=TranscriptionError.FILE_NOT_FOUND,
            error_message="Audio file not found.",
            segments=[],
        )
        d = result.to_dict()
        assert d["status"] == "FAILED"
        assert d["error_code"] == "FILE_NOT_FOUND"
        assert isinstance(d["error_code"], str)

    def test_result_dataclass_is_mutable(self) -> None:
        """Results must be regular (mutable) dataclasses."""
        result = self._make_result()
        result.status = TranscriptionStatus.EMPTY
        assert result.status == TranscriptionStatus.EMPTY


class TestTranscriptionRequest:

    def test_request_defaults(self) -> None:
        """Optional fields must default to None / 1 as specified."""
        req = TranscriptionRequest(audio_path="/tmp/audio.wav")
        assert req.audio_path == "/tmp/audio.wav"
        assert req.recording_id is None
        assert req.transcription_id is None
        assert req.attempt_number == 1
        assert req.language_hint is None

    def test_request_with_all_fields(self) -> None:
        req = TranscriptionRequest(
            audio_path="/tmp/audio.wav",
            recording_id="rec-99",
            transcription_id="txn-abc",
            attempt_number=3,
            language_hint="fr",
        )
        assert req.recording_id == "rec-99"
        assert req.transcription_id == "txn-abc"
        assert req.attempt_number == 3
        assert req.language_hint == "fr"

