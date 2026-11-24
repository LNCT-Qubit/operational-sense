"""
US-05 – Whisper Speech-to-Text Integration
Unit tests for :class:`~app.transcription.audio_validator.AudioValidator`.
"""
from __future__ import annotations

import struct
import wave
from pathlib import Path
from unittest.mock import patch

import pytest

from app.transcription.audio_validator import AudioValidator
from app.transcription.config import TranscriptionConfig
from app.transcription.exceptions import (
    AudioTooLongError,
    AudioValidationError,
    CorruptedAudioError,
    EmptyFileError,
    FileSizeError,
    UnsupportedFormatError,
)
from app.transcription.models import TranscriptionError


@pytest.fixture
def validator(sample_config: TranscriptionConfig) -> AudioValidator:
    return AudioValidator(sample_config)


# ---------------------------------------------------------------------------
# Tests
# ---------------------------------------------------------------------------


class TestAudioValidator:

    def test_valid_wav_passes(
        self, validator: AudioValidator, valid_wav_file: Path
    ) -> None:
        """A well-formed WAV file must pass all validation checks without
        raising any exception."""
        # Should complete without raising.
        validator.validate(str(valid_wav_file))

    def test_real_hinglish_audio_passes_validation(
        self, validator: AudioValidator, hinglish_audio_file: Path
    ) -> None:
        """The uploaded Hinglish operational sense audio fixture must pass validation."""
        assert hinglish_audio_file.exists(), f"Audio fixture missing at {hinglish_audio_file}"
        validator.validate(str(hinglish_audio_file))

    def test_missing_file_raises_file_not_found(
        self, validator: AudioValidator, tmp_path: Path
    ) -> None:
        """A path that does not exist must raise AudioValidationError with
        FILE_NOT_FOUND code."""
        missing = str(tmp_path / "does_not_exist.wav")
        with pytest.raises(AudioValidationError) as exc_info:
            validator.validate(missing)
        assert exc_info.value.error_code == TranscriptionError.FILE_NOT_FOUND

    def test_empty_file_raises_empty_error(
        self, validator: AudioValidator, empty_wav_file: Path
    ) -> None:
        """A 0-byte file must raise EmptyFileError."""
        with pytest.raises(EmptyFileError) as exc_info:
            validator.validate(str(empty_wav_file))
        assert exc_info.value.error_code == TranscriptionError.FILE_EMPTY

    def test_unsupported_format_raises(
        self, validator: AudioValidator, unsupported_format_file: Path
    ) -> None:
        """A file with an unsupported extension must raise UnsupportedFormatError."""
        with pytest.raises(UnsupportedFormatError) as exc_info:
            validator.validate(str(unsupported_format_file))
        assert exc_info.value.error_code == TranscriptionError.UNSUPPORTED_FORMAT
        assert ".xyz" in exc_info.value.extension

    def test_oversized_file_raises(
        self, validator: AudioValidator, tmp_path: Path
    ) -> None:
        """A file exceeding max_file_size_bytes must raise FileSizeError."""
        # Create a WAV file with RIFF/WAVE magic so it passes format check.
        # We need a valid-looking header but oversized body.
        big_path = tmp_path / "big.wav"
        limit = 15 * 1024 * 1024
        with big_path.open("wb") as fh:
            # Write valid RIFF/WAVE header bytes.
            fh.write(b"RIFF")
            fh.write(struct.pack("<I", limit + 100))
            fh.write(b"WAVE")
            # Seek past the limit to create sparse file.
            fh.seek(limit + 2)
            fh.write(b"\x00")

        with pytest.raises(FileSizeError) as exc_info:
            validator.validate(str(big_path))
        assert exc_info.value.error_code == TranscriptionError.FILE_TOO_LARGE
        assert exc_info.value.actual_bytes > limit

    def test_valid_mp3_format_accepted(
        self, validator: AudioValidator, tmp_path: Path
    ) -> None:
        """An MP3 file with a valid ID3 header must pass format and magic checks."""
        mp3_path = tmp_path / "audio.mp3"
        # Minimal ID3v2 header: "ID3" + version + flags + size.
        mp3_path.write_bytes(b"ID3\x03\x00\x00\x00\x00\x00\x1f" + b"\x00" * 100)
        # Should not raise.
        validator.validate(str(mp3_path))

    def test_corrupt_header_raises(
        self, validator: AudioValidator, corrupt_audio_file: Path
    ) -> None:
        """A .wav file with a non-WAVE header must raise CorruptedAudioError."""
        with pytest.raises(CorruptedAudioError) as exc_info:
            validator.validate(str(corrupt_audio_file))
        assert exc_info.value.error_code == TranscriptionError.INVALID_AUDIO

    def test_extension_content_mismatch_raises_corrupted_audio_error(
        self, validator: AudioValidator, tmp_path: Path
    ) -> None:
        """An MP3 file renamed to .wav must be rejected by magic bytes, not accepted by extension."""
        mismatch_path = tmp_path / "renamed_mp3.wav"
        # Write valid MP3 ID3 header into a .wav file
        mismatch_path.write_bytes(b"ID3\x03\x00\x00\x00\x00\x00\x1f" + b"\x00" * 100)
        with pytest.raises(CorruptedAudioError) as exc_info:
            validator.validate(str(mismatch_path))
        assert exc_info.value.error_code == TranscriptionError.INVALID_AUDIO
        assert "File header does not match .WAV format" in exc_info.value.safe_message

    def test_directory_path_raises_validation_error(
        self, validator: AudioValidator, tmp_path: Path
    ) -> None:
        """Passing a directory instead of a regular file must raise AudioValidationError."""
        dir_path = tmp_path / "audio_dir.wav"
        dir_path.mkdir()
        with pytest.raises(AudioValidationError) as exc_info:
            validator.validate(str(dir_path))
        assert exc_info.value.error_code == TranscriptionError.VALIDATION_ERROR


# ---------------------------------------------------------------------------
# B1 Regression: Audio duration validation
# ---------------------------------------------------------------------------


def _write_wav_duration(path: Path, duration_seconds: float, sample_rate: int = 16_000) -> Path:
    """Write a real WAV file of the requested duration at 16 kHz mono PCM-16."""
    num_frames = int(sample_rate * duration_seconds)
    with wave.open(str(path), "w") as wf:
        wf.setnchannels(1)
        wf.setsampwidth(2)
        wf.setframerate(sample_rate)
        wf.writeframes(b"\x00\x00" * num_frames)
    return path


class TestAudioValidatorDuration:
    """Regression tests for Bug B1: missing 30-second duration check."""

    def test_wav_within_limit_passes(self, tmp_path: Path) -> None:
        """A WAV file at exactly 30 seconds (the limit) must pass validation."""
        config = TranscriptionConfig(max_duration_seconds=30.0)
        validator = AudioValidator(config)
        wav = _write_wav_duration(tmp_path / "30s.wav", duration_seconds=30.0)
        # Must not raise.
        validator.validate(str(wav))

    def test_wav_below_limit_passes(self, tmp_path: Path) -> None:
        """A WAV file shorter than the limit must pass duration validation."""
        config = TranscriptionConfig(max_duration_seconds=30.0)
        validator = AudioValidator(config)
        wav = _write_wav_duration(tmp_path / "short.wav", duration_seconds=5.0)
        validator.validate(str(wav))

    def test_wav_exceeds_limit_raises_audio_too_long(self, tmp_path: Path) -> None:
        """A WAV file exceeding max_duration_seconds must raise AudioTooLongError
        with VALIDATION_ERROR code and accurate duration metadata.

        This is the core B1 regression test.  Previously, a 31-second file would
        pass validation and proceed to full Whisper inference, violating the FR-08
        5-second SLA.
        """
        config = TranscriptionConfig(max_duration_seconds=30.0)
        validator = AudioValidator(config)
        wav = _write_wav_duration(tmp_path / "31s.wav", duration_seconds=31.0)

        with pytest.raises(AudioTooLongError) as exc_info:
            validator.validate(str(wav))

        err = exc_info.value
        assert err.error_code == TranscriptionError.VALIDATION_ERROR
        assert err.actual_seconds > 30.0
        assert err.limit_seconds == 30.0
        # Safe message must be human-readable and not leak internals.
        assert "31" in err.safe_message or "too long" in err.safe_message.lower()
        assert "30" in err.safe_message

    def test_duration_check_uses_configured_limit(self, tmp_path: Path) -> None:
        """Duration limit is read from config, not hardcoded.

        A 10-second clip is valid under the default 30s limit but must fail
        when max_duration_seconds is lowered to 5s.
        """
        config_strict = TranscriptionConfig(max_duration_seconds=5.0)
        validator = AudioValidator(config_strict)
        wav = _write_wav_duration(tmp_path / "10s.wav", duration_seconds=10.0)

        with pytest.raises(AudioTooLongError) as exc_info:
            validator.validate(str(wav))
        assert exc_info.value.limit_seconds == 5.0

    def test_duration_check_is_ordered_after_magic_check(self, tmp_path: Path) -> None:
        """A corrupt file must raise CorruptedAudioError, not AudioTooLongError.

        The validation order is: exists → format → size → magic → duration.
        A corrupt header must be caught by _check_magic before _check_duration runs.
        """
        config = TranscriptionConfig(max_duration_seconds=1.0)
        validator = AudioValidator(config)
        # Plausible RIFF header but invalid WAVE content — passes size but fails magic.
        corrupt = tmp_path / "corrupt.wav"
        corrupt.write_bytes(b"RIFF\x00\x00\x00\x00JUNK\x00\x00\x00\x00")

        with pytest.raises(CorruptedAudioError):
            validator.validate(str(corrupt))

    def test_duration_check_skips_gracefully_when_soundfile_fails(
        self, tmp_path: Path
    ) -> None:
        """If soundfile.info() raises, _check_duration must skip silently
        (not raise AudioTooLongError or any other error from the check itself).

        This guards the case where a container format (e.g. .m4a) cannot be
        parsed by soundfile's header reader.
        """
        config = TranscriptionConfig(max_duration_seconds=1.0)
        validator = AudioValidator(config)
        # Create a minimal valid WAV (passes all earlier checks).
        wav = _write_wav_duration(tmp_path / "ok.wav", duration_seconds=0.1)

        with patch("soundfile.info", side_effect=RuntimeError("cannot parse")):
            # Must not raise: the duration check is silently skipped.
            validator.validate(str(wav))

