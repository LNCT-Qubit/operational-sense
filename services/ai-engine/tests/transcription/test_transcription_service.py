"""
US-05 – Whisper Speech-to-Text Integration
Unit tests for :class:`~app.transcription.transcription_service.TranscriptionService`.

All 15 acceptance requirements are covered here.  The Whisper model is never
loaded; a mock provider is injected via dependency injection.
"""
from __future__ import annotations

import os
import time
import uuid
from pathlib import Path
from unittest.mock import MagicMock, patch, call

import pytest

from app.transcription.config import TranscriptionConfig
from app.transcription.exceptions import (
    CorruptedAudioError,
    InferenceError,
    ModelInitializationError,
)
from app.transcription.models import (
    TranscriptionError,
    TranscriptionRequest,
    TranscriptionResult,
    TranscriptionStatus,
)
from app.transcription.transcription_service import TranscriptionService


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


def _make_service(
    config: TranscriptionConfig,
    provider: MagicMock,
) -> TranscriptionService:
    return TranscriptionService(config=config, provider=provider)


def _make_segment(text: str = "Hello world.", start: float = 0.0, end: float = 2.5) -> MagicMock:
    seg = MagicMock()
    seg.start = start
    seg.end = end
    seg.text = text
    return seg


def _make_info(language: str = "en", probability: float = 0.98) -> MagicMock:
    info = MagicMock()
    info.language = language
    info.language_probability = probability
    return info


# ---------------------------------------------------------------------------
# Tests – requirement 1: valid audio → COMPLETED
# ---------------------------------------------------------------------------


class TestValidAudioCompletedResult:
    """Requirement 1: test_valid_audio_returns_completed"""

    def test_valid_audio_returns_completed(
        self,
        sample_config: TranscriptionConfig,
        mock_whisper_provider: MagicMock,
        valid_wav_file: Path,
    ) -> None:
        service = _make_service(sample_config, mock_whisper_provider)
        req = TranscriptionRequest(audio_path=str(valid_wav_file))
        result = service.transcribe(req)

        assert result.status == TranscriptionStatus.COMPLETED
        assert result.transcript is not None
        assert len(result.transcript) > 0
        assert result.error_code is None
        assert result.error_message is None


# ---------------------------------------------------------------------------
# Tests – requirement 2: empty file → FAILED validation
# ---------------------------------------------------------------------------


class TestEmptyFileValidationFailed:
    """Requirement 2: test_empty_audio_file_returns_failed_validation"""

    def test_empty_audio_file_returns_failed_validation(
        self,
        sample_config: TranscriptionConfig,
        mock_whisper_provider: MagicMock,
        empty_wav_file: Path,
    ) -> None:
        service = _make_service(sample_config, mock_whisper_provider)
        req = TranscriptionRequest(audio_path=str(empty_wav_file))
        result = service.transcribe(req)

        assert result.status == TranscriptionStatus.FAILED
        assert result.error_code == TranscriptionError.FILE_EMPTY
        # Provider must NOT have been called.
        mock_whisper_provider.transcribe.assert_not_called()


# ---------------------------------------------------------------------------
# Tests – requirement 3: missing file → FAILED
# ---------------------------------------------------------------------------


class TestMissingFileFailed:
    """Requirement 3: test_missing_file_returns_failed"""

    def test_missing_file_returns_failed(
        self,
        sample_config: TranscriptionConfig,
        mock_whisper_provider: MagicMock,
        tmp_path: Path,
    ) -> None:
        missing = str(tmp_path / "ghost.wav")
        service = _make_service(sample_config, mock_whisper_provider)
        req = TranscriptionRequest(audio_path=missing)
        result = service.transcribe(req)

        assert result.status == TranscriptionStatus.FAILED
        assert result.error_code == TranscriptionError.FILE_NOT_FOUND


# ---------------------------------------------------------------------------
# Tests – requirement 4: unsupported format → FAILED
# ---------------------------------------------------------------------------


class TestUnsupportedFormatFailed:
    """Requirement 4: test_unsupported_format_returns_failed"""

    def test_unsupported_format_returns_failed(
        self,
        sample_config: TranscriptionConfig,
        mock_whisper_provider: MagicMock,
        unsupported_format_file: Path,
    ) -> None:
        service = _make_service(sample_config, mock_whisper_provider)
        req = TranscriptionRequest(audio_path=str(unsupported_format_file))
        result = service.transcribe(req)

        assert result.status == TranscriptionStatus.FAILED
        assert result.error_code == TranscriptionError.UNSUPPORTED_FORMAT


# ---------------------------------------------------------------------------
# Tests – requirement 5: corrupted audio → FAILED (not EMPTY)
# ---------------------------------------------------------------------------


class TestCorruptedAudioFailed:
    """Requirement 5: test_corrupted_audio_returns_failed"""

    def test_corrupted_audio_returns_failed(
        self,
        sample_config: TranscriptionConfig,
        mock_whisper_provider: MagicMock,
        corrupt_audio_file: Path,
    ) -> None:
        service = _make_service(sample_config, mock_whisper_provider)
        req = TranscriptionRequest(audio_path=str(corrupt_audio_file))
        result = service.transcribe(req)

        assert result.status == TranscriptionStatus.FAILED
        assert result.status != TranscriptionStatus.EMPTY
        assert result.error_code == TranscriptionError.INVALID_AUDIO


# ---------------------------------------------------------------------------
# Tests – requirement 6: no speech detected → EMPTY
# ---------------------------------------------------------------------------


class TestNoSpeechEmpty:
    """Requirement 6: test_no_speech_detected_returns_empty"""

    def test_no_speech_detected_returns_empty(
        self,
        sample_config: TranscriptionConfig,
        valid_wav_file: Path,
    ) -> None:
        # Provider returns no segments.
        provider = MagicMock()
        provider.transcribe.return_value = ([], _make_info())
        provider.is_model_loaded.return_value = True

        service = _make_service(sample_config, provider)
        req = TranscriptionRequest(audio_path=str(valid_wav_file))
        result = service.transcribe(req)

        assert result.status == TranscriptionStatus.EMPTY
        assert result.transcript is None


# ---------------------------------------------------------------------------
# Tests – requirement 7: segments joined correctly
# ---------------------------------------------------------------------------


class TestSegmentTextJoining:
    """Requirement 7: test_successful_transcription_text_joined"""

    def test_successful_transcription_text_joined(
        self,
        sample_config: TranscriptionConfig,
        valid_wav_file: Path,
    ) -> None:
        seg1 = _make_segment(text="Hello", start=0.0, end=1.0)
        seg2 = _make_segment(text="world.", start=1.0, end=2.0)
        provider = MagicMock()
        provider.transcribe.return_value = ([seg1, seg2], _make_info())
        provider.is_model_loaded.return_value = True

        service = _make_service(sample_config, provider)
        req = TranscriptionRequest(audio_path=str(valid_wav_file))
        result = service.transcribe(req)

        assert result.status == TranscriptionStatus.COMPLETED
        assert result.transcript == "Hello world."
        assert len(result.segments) == 2


# ---------------------------------------------------------------------------
# Tests – requirement 8: model init failure → FAILED
# ---------------------------------------------------------------------------


class TestModelInitFailed:
    """Requirement 8: test_model_init_failure_returns_failed"""

    def test_model_init_failure_returns_failed(
        self,
        sample_config: TranscriptionConfig,
        valid_wav_file: Path,
    ) -> None:
        provider = MagicMock()
        provider.transcribe.side_effect = ModelInitializationError(
            model_name="tiny",
            detail="Weights file missing.",
        )
        provider.is_model_loaded.return_value = False

        service = _make_service(sample_config, provider)
        req = TranscriptionRequest(audio_path=str(valid_wav_file))
        result = service.transcribe(req)

        assert result.status == TranscriptionStatus.FAILED
        assert result.error_code == TranscriptionError.MODEL_INIT_FAILURE
        assert "stack" not in (result.error_message or "").lower()
        assert "traceback" not in (result.error_message or "").lower()


# ---------------------------------------------------------------------------
# Tests – requirement 9: inference failure → FAILED
# ---------------------------------------------------------------------------


class TestInferenceFailed:
    """Requirement 9: test_inference_failure_returns_failed"""

    def test_inference_failure_returns_failed(
        self,
        sample_config: TranscriptionConfig,
        valid_wav_file: Path,
    ) -> None:
        provider = MagicMock()
        provider.transcribe.side_effect = InferenceError(
            model_name="tiny",
            detail="CUDA out of memory.",
        )
        provider.is_model_loaded.return_value = True

        service = _make_service(sample_config, provider)
        req = TranscriptionRequest(audio_path=str(valid_wav_file))
        result = service.transcribe(req)

        assert result.status == TranscriptionStatus.FAILED
        assert result.error_code == TranscriptionError.INFERENCE_FAILURE


# ---------------------------------------------------------------------------
# Tests – requirement 10: temp file cleanup
# ---------------------------------------------------------------------------


class TestTempFileCleanup:
    """Requirement 10: test_temp_file_cleanup"""

    def test_temp_file_cleanup(
        self,
        sample_config: TranscriptionConfig,
        mock_whisper_provider: MagicMock,
        valid_wav_file: Path,
    ) -> None:
        """Decoder.cleanup() must be called after transcription (success or fail)."""
        with patch(
            "app.transcription.transcription_service.AudioDecoder"
        ) as MockDecoder:
            mock_decoder_instance = MagicMock()
            mock_decoder_instance.prepare_audio.return_value = str(valid_wav_file)
            mock_decoder_instance.__enter__ = MagicMock(return_value=mock_decoder_instance)
            mock_decoder_instance.__exit__ = MagicMock(return_value=False)
            MockDecoder.return_value = mock_decoder_instance

            service = _make_service(sample_config, mock_whisper_provider)
            req = TranscriptionRequest(audio_path=str(valid_wav_file))
            service.transcribe(req)

            # Context manager exit (cleanup) must have been invoked.
            mock_decoder_instance.__exit__.assert_called_once()


# ---------------------------------------------------------------------------
# Tests – requirement 11: original audio unchanged
# ---------------------------------------------------------------------------


class TestOriginalAudioUnchanged:
    """Requirement 11: test_original_audio_unchanged"""

    def test_original_audio_unchanged(
        self,
        sample_config: TranscriptionConfig,
        mock_whisper_provider: MagicMock,
        valid_wav_file: Path,
    ) -> None:
        original_content = valid_wav_file.read_bytes()
        original_size = valid_wav_file.stat().st_size

        service = _make_service(sample_config, mock_whisper_provider)
        req = TranscriptionRequest(audio_path=str(valid_wav_file))
        service.transcribe(req)

        assert valid_wav_file.read_bytes() == original_content
        assert valid_wav_file.stat().st_size == original_size


# ---------------------------------------------------------------------------
# Tests – requirement 12: retryable vs non-retryable errors
# ---------------------------------------------------------------------------


class TestRetryability:
    """Requirement 12: test_retryable_vs_non_retryable"""

    # For this codebase, retryable = INFERENCE_FAILURE, non-retryable = FILE_NOT_FOUND.
    # We confirm this via the error_code attached to the result.

    def test_inference_failure_error_code_is_retryable(
        self,
        sample_config: TranscriptionConfig,
        valid_wav_file: Path,
    ) -> None:
        """INFERENCE_FAILURE should be treated as retryable by the caller."""
        provider = MagicMock()
        provider.transcribe.side_effect = InferenceError(model_name="tiny")
        service = _make_service(sample_config, provider)
        result = service.transcribe(TranscriptionRequest(audio_path=str(valid_wav_file)))
        assert result.error_code == TranscriptionError.INFERENCE_FAILURE

    def test_file_not_found_error_code_is_not_retryable(
        self,
        sample_config: TranscriptionConfig,
        tmp_path: Path,
    ) -> None:
        """FILE_NOT_FOUND is permanent – retrying with the same path is pointless."""
        provider = MagicMock()
        service = _make_service(sample_config, provider)
        result = service.transcribe(
            TranscriptionRequest(audio_path=str(tmp_path / "missing.wav"))
        )
        assert result.error_code == TranscriptionError.FILE_NOT_FOUND
        # Provider must not have been called.
        provider.transcribe.assert_not_called()


# ---------------------------------------------------------------------------
# Tests – requirement 13: status mapping
# ---------------------------------------------------------------------------


class TestStatusMapping:
    """Requirement 13: test_status_mapping"""

    def test_all_status_values_reachable(
        self,
        sample_config: TranscriptionConfig,
        valid_wav_file: Path,
        tmp_path: Path,
    ) -> None:
        # COMPLETED
        provider = MagicMock()
        provider.transcribe.return_value = ([_make_segment()], _make_info())
        result = _make_service(sample_config, provider).transcribe(
            TranscriptionRequest(audio_path=str(valid_wav_file))
        )
        assert result.status == TranscriptionStatus.COMPLETED

        # EMPTY
        provider2 = MagicMock()
        provider2.transcribe.return_value = ([], _make_info())
        result2 = _make_service(sample_config, provider2).transcribe(
            TranscriptionRequest(audio_path=str(valid_wav_file))
        )
        assert result2.status == TranscriptionStatus.EMPTY

        # FAILED (file not found)
        provider3 = MagicMock()
        result3 = _make_service(sample_config, provider3).transcribe(
            TranscriptionRequest(audio_path=str(tmp_path / "missing.wav"))
        )
        assert result3.status == TranscriptionStatus.FAILED


# ---------------------------------------------------------------------------
# Tests – requirement 14: language metadata
# ---------------------------------------------------------------------------


class TestLanguageMetadata:
    """Requirement 14: test_language_metadata"""

    def test_language_metadata_populated(
        self,
        sample_config: TranscriptionConfig,
        valid_wav_file: Path,
    ) -> None:
        provider = MagicMock()
        provider.transcribe.return_value = (
            [_make_segment()],
            _make_info(language="fr", probability=0.91),
        )
        service = _make_service(sample_config, provider)
        result = service.transcribe(TranscriptionRequest(audio_path=str(valid_wav_file)))

        assert result.detected_language == "fr"
        assert result.language_probability == pytest.approx(0.91)


# ---------------------------------------------------------------------------
# Tests – requirement 15: processing duration measured
# ---------------------------------------------------------------------------


class TestProcessingDuration:
    """Requirement 15: test_processing_duration_measured"""

    def test_processing_duration_measured(
        self,
        sample_config: TranscriptionConfig,
        mock_whisper_provider: MagicMock,
        valid_wav_file: Path,
    ) -> None:
        service = _make_service(sample_config, mock_whisper_provider)
        result = service.transcribe(
            TranscriptionRequest(audio_path=str(valid_wav_file))
        )
        assert result.processing_duration_seconds is not None
        assert result.processing_duration_seconds >= 0.0


# ---------------------------------------------------------------------------
# B1 Regression: Service-level audio duration rejection
# ---------------------------------------------------------------------------


import wave as _wave_module  # noqa: E402


def _write_wav_seconds(path: Path, duration_seconds: float) -> Path:
    """Helper: write a real WAV file of the specified duration at 16 kHz mono."""
    num_frames = int(16_000 * duration_seconds)
    with _wave_module.open(str(path), "w") as wf:
        wf.setnchannels(1)
        wf.setsampwidth(2)
        wf.setframerate(16_000)
        wf.writeframes(b"\x00\x00" * num_frames)
    return path


class TestDurationValidationAtServiceLevel:
    """B1 Regression: TranscriptionService must surface VALIDATION_ERROR when
    audio exceeds max_duration_seconds, without calling the Whisper provider.

    Previously, a 31-second audio file would bypass the validator (which only
    checked byte size) and proceed to full model inference, violating FR-08.
    """

    def test_audio_exceeding_duration_returns_failed(
        self,
        mock_whisper_provider: MagicMock,
        tmp_path: Path,
    ) -> None:
        """A 31-second WAV with max_duration_seconds=30 must return FAILED."""
        config = TranscriptionConfig(
            model_name="tiny",
            device="cpu",
            compute_type="int8",
            max_duration_seconds=30.0,
            vad_filter=False,
        )
        wav = _write_wav_seconds(tmp_path / "31s.wav", duration_seconds=31.0)
        service = _make_service(config, mock_whisper_provider)
        result = service.transcribe(TranscriptionRequest(audio_path=str(wav)))

        assert result.status == TranscriptionStatus.FAILED
        assert result.error_code == TranscriptionError.VALIDATION_ERROR
        # The provider must NOT be called — the file never reached inference.
        mock_whisper_provider.transcribe.assert_not_called()
        # Safe message must be surfaced.
        assert result.error_message is not None
        assert len(result.error_message) > 0

    def test_audio_exactly_at_limit_passes(
        self,
        mock_whisper_provider: MagicMock,
        tmp_path: Path,
    ) -> None:
        """A WAV file at exactly max_duration_seconds must pass validation and proceed."""
        config = TranscriptionConfig(
            model_name="tiny",
            device="cpu",
            compute_type="int8",
            max_duration_seconds=30.0,
            vad_filter=False,
        )
        wav = _write_wav_seconds(tmp_path / "30s.wav", duration_seconds=30.0)
        service = _make_service(config, mock_whisper_provider)
        result = service.transcribe(TranscriptionRequest(audio_path=str(wav)))

        # Provider was called — the file was not rejected by the duration check.
        mock_whisper_provider.transcribe.assert_called_once()
        assert result.status == TranscriptionStatus.COMPLETED


class TestZeroFramesAudioContainer:
    """A3: Valid container with 0 audio frames returns EMPTY status."""

    def test_zero_frames_valid_container_returns_empty(
        self,
        sample_config: TranscriptionConfig,
        tmp_path: Path,
    ) -> None:
        """A valid WAV header with 0 audio frames must yield EMPTY status, not FAILED."""
        wav_path = tmp_path / "zero_frames.wav"
        with _wave_module.open(str(wav_path), "w") as wf:
            wf.setnchannels(1)
            wf.setsampwidth(2)
            wf.setframerate(16000)
            wf.writeframes(b"")

        # Mock provider that returns empty segments for zero-frame input
        empty_info = MagicMock()
        empty_info.language = "en"
        empty_info.language_probability = 1.0
        mock_provider = MagicMock()
        mock_provider.transcribe.return_value = ([], empty_info)

        service = _make_service(sample_config, mock_provider)
        result = service.transcribe(TranscriptionRequest(audio_path=str(wav_path)))

        assert result.status == TranscriptionStatus.EMPTY
        assert result.transcript is None
        assert result.error_code is None


class TestEnvironmentModelSelection:
    """Verifies environment-based model configuration."""

    def test_env_model_name_configuration(self, monkeypatch: pytest.MonkeyPatch) -> None:
        """Setting TRANSCRIPTION_MODEL_NAME=base picks up Base model config."""
        monkeypatch.setenv("TRANSCRIPTION_MODEL_NAME", "base")
        service = TranscriptionService()
        assert service._config.model_name == "base"


class TestRealAudioFixtureServicePipeline:
    """Verifies that real audio fixture flows through TranscriptionService with mock provider."""

    def test_real_hinglish_audio_passes_full_pipeline(
        self,
        sample_config: TranscriptionConfig,
        mock_whisper_provider: MagicMock,
        hinglish_audio_file: Path,
    ) -> None:
        """The uploaded Hinglish audio file successfully decodes, resamples, and produces COMPLETED status."""
        service = _make_service(sample_config, mock_whisper_provider)
        request = TranscriptionRequest(
            audio_path=str(hinglish_audio_file),
            recording_id="rec-hinglish-01",
        )
        result = service.transcribe(request)

        assert result.status == TranscriptionStatus.COMPLETED
        assert result.error_code is None
        assert result.transcript == "Hello world."
        assert result.processing_duration_seconds is not None
        assert result.processing_duration_seconds > 0.0
        mock_whisper_provider.transcribe.assert_called_once()

