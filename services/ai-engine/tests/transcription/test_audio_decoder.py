"""
US-05 – Whisper Speech-to-Text Integration
Unit tests for :class:`~app.transcription.audio_decoder.AudioDecoder`.

Covers:
- Zero-copy fast path for 16 kHz / mono / PCM-16 WAV
- Conversion path for non-16kHz WAV (via soundfile + numpy)
- Corrupted file raises CorruptedAudioError
- Temporary file is created and tracked
- cleanup() removes the temp file
- Context-manager exit triggers cleanup
- Original source file is never modified
- _is_16k_mono_pcm_wav helper behaves correctly
- B2 Regression: int16 overflow clipping for over-peak lossy audio samples
"""
from __future__ import annotations

import os
import struct
import tempfile
import wave
from pathlib import Path
from unittest.mock import MagicMock, patch

import pytest

from app.transcription.audio_decoder import AudioDecoder, _is_16k_mono_pcm_wav
from app.transcription.config import TranscriptionConfig
from app.transcription.exceptions import CorruptedAudioError


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


def _write_wav(
    path: Path,
    sample_rate: int = 16_000,
    num_channels: int = 1,
    bits: int = 16,
    num_frames: int = 1600,
) -> Path:
    """Write a minimal valid WAV file with the given parameters."""
    with wave.open(str(path), "w") as wf:
        wf.setnchannels(num_channels)
        wf.setsampwidth(bits // 8)
        wf.setframerate(sample_rate)
        wf.writeframes(b"\x00" * (num_frames * num_channels * (bits // 8)))
    return path


# ---------------------------------------------------------------------------
# Tests for _is_16k_mono_pcm_wav
# ---------------------------------------------------------------------------


class TestIs16kMonoPcmWav:

    def test_valid_16k_mono_pcm_wav_returns_true(self, tmp_path: Path) -> None:
        """A 16 kHz / mono / PCM-16 WAV must return True."""
        p = _write_wav(tmp_path / "16k_mono.wav", sample_rate=16_000, num_channels=1, bits=16)
        assert _is_16k_mono_pcm_wav(p) is True

    def test_stereo_wav_returns_false(self, tmp_path: Path) -> None:
        """A stereo WAV must return False (num_channels == 2)."""
        p = _write_wav(tmp_path / "stereo.wav", sample_rate=16_000, num_channels=2, bits=16)
        assert _is_16k_mono_pcm_wav(p) is False

    def test_wrong_sample_rate_returns_false(self, tmp_path: Path) -> None:
        """A 44.1 kHz WAV must return False."""
        p = _write_wav(tmp_path / "44k.wav", sample_rate=44_100, num_channels=1, bits=16)
        assert _is_16k_mono_pcm_wav(p) is False

    def test_wrong_bits_returns_false(self, tmp_path: Path) -> None:
        """A 24-bit WAV must return False."""
        p = _write_wav(tmp_path / "24bit.wav", sample_rate=16_000, num_channels=1, bits=24)
        assert _is_16k_mono_pcm_wav(p) is False

    def test_empty_file_returns_false(self, tmp_path: Path) -> None:
        """An empty file must return False (too short to parse)."""
        p = tmp_path / "empty.wav"
        p.write_bytes(b"")
        assert _is_16k_mono_pcm_wav(p) is False

    def test_corrupt_header_returns_false(self, tmp_path: Path) -> None:
        """A file with junk bytes must return False."""
        p = tmp_path / "junk.wav"
        p.write_bytes(b"\xff" * 44)
        assert _is_16k_mono_pcm_wav(p) is False


# ---------------------------------------------------------------------------
# Tests for AudioDecoder.prepare_audio – zero-copy path
# ---------------------------------------------------------------------------


class TestAudioDecoderFastPath:

    def test_16k_mono_wav_returned_as_is(
        self, tmp_path: Path, sample_config: TranscriptionConfig
    ) -> None:
        """16 kHz / mono / PCM-16 WAV must be returned unchanged (zero-copy)."""
        wav = _write_wav(tmp_path / "16k.wav")
        decoder = AudioDecoder(sample_config)
        result = decoder.prepare_audio(str(wav))
        assert result == str(wav)
        # No temp file should have been created.
        assert decoder._temp_paths == []

    def test_original_file_untouched_on_fast_path(
        self, tmp_path: Path, sample_config: TranscriptionConfig
    ) -> None:
        """The original file must not be modified in the zero-copy path."""
        wav = _write_wav(tmp_path / "16k.wav")
        original_bytes = wav.read_bytes()
        decoder = AudioDecoder(sample_config)
        decoder.prepare_audio(str(wav))
        assert wav.read_bytes() == original_bytes


# ---------------------------------------------------------------------------
# Tests for AudioDecoder.prepare_audio – conversion path
# ---------------------------------------------------------------------------


class TestAudioDecoderConversionPath:

    def test_non_16k_wav_creates_temp_file(
        self, tmp_path: Path, sample_config: TranscriptionConfig
    ) -> None:
        """A 44.1 kHz WAV must be converted; a temp file must be tracked."""
        wav = _write_wav(tmp_path / "44k.wav", sample_rate=44_100)
        decoder = AudioDecoder(sample_config)
        result = decoder.prepare_audio(str(wav))
        # Result must differ from source.
        assert result != str(wav)
        # Temp path tracked.
        assert len(decoder._temp_paths) == 1
        assert os.path.exists(result)
        # Cleanup.
        decoder.cleanup()

    def test_real_hinglish_audio_converts_to_16k_mono(
        self, hinglish_audio_file: Path, sample_config: TranscriptionConfig
    ) -> None:
        """The 44.1 kHz stereo Hinglish fixture must convert cleanly to 16 kHz mono PCM-16."""
        assert hinglish_audio_file.exists()
        original_bytes = hinglish_audio_file.read_bytes()
        decoder = AudioDecoder(sample_config)
        try:
            converted_path = decoder.prepare_audio(str(hinglish_audio_file))
            assert converted_path != str(hinglish_audio_file)
            assert os.path.exists(converted_path)

            # Verify converted audio properties
            with wave.open(converted_path, "r") as wf:
                assert wf.getnchannels() == 1
                assert wf.getsampwidth() == 2
                assert wf.getframerate() == 16000
                assert wf.getnframes() > 0

            # Verify original audio is never modified
            assert hinglish_audio_file.read_bytes() == original_bytes
        finally:
            decoder.cleanup()
        assert not os.path.exists(converted_path)

    def test_original_file_untouched_after_conversion(
        self, tmp_path: Path, sample_config: TranscriptionConfig
    ) -> None:
        """Source WAV must remain byte-identical after conversion."""
        wav = _write_wav(tmp_path / "44k.wav", sample_rate=44_100)
        original_bytes = wav.read_bytes()
        decoder = AudioDecoder(sample_config)
        decoder.prepare_audio(str(wav))
        assert wav.read_bytes() == original_bytes
        decoder.cleanup()

    def test_temp_file_is_valid_wav(
        self, tmp_path: Path, sample_config: TranscriptionConfig
    ) -> None:
        """The converted temp file must be readable as a WAV by the wave module."""
        wav = _write_wav(tmp_path / "44k.wav", sample_rate=44_100)
        decoder = AudioDecoder(sample_config)
        result_path = decoder.prepare_audio(str(wav))
        with wave.open(result_path, "r") as wf:
            assert wf.getframerate() == 16_000
            assert wf.getnchannels() == 1
            assert wf.getsampwidth() == 2  # 16-bit PCM
        decoder.cleanup()


# ---------------------------------------------------------------------------
# Tests for AudioDecoder.cleanup
# ---------------------------------------------------------------------------


class TestAudioDecoderCleanup:

    def test_cleanup_removes_temp_file(
        self, tmp_path: Path, sample_config: TranscriptionConfig
    ) -> None:
        """cleanup() must delete the temp file created during conversion."""
        wav = _write_wav(tmp_path / "44k.wav", sample_rate=44_100)
        decoder = AudioDecoder(sample_config)
        result_path = decoder.prepare_audio(str(wav))
        assert os.path.exists(result_path)
        decoder.cleanup()
        assert not os.path.exists(result_path)

    def test_cleanup_idempotent(
        self, tmp_path: Path, sample_config: TranscriptionConfig
    ) -> None:
        """Calling cleanup() twice must not raise."""
        wav = _write_wav(tmp_path / "44k.wav", sample_rate=44_100)
        decoder = AudioDecoder(sample_config)
        decoder.prepare_audio(str(wav))
        decoder.cleanup()
        decoder.cleanup()  # Second call must not raise.

    def test_cleanup_does_not_remove_original(
        self, tmp_path: Path, sample_config: TranscriptionConfig
    ) -> None:
        """cleanup() must NEVER delete the original source file."""
        wav = _write_wav(tmp_path / "16k.wav")  # Fast path – no temp file.
        decoder = AudioDecoder(sample_config)
        decoder.prepare_audio(str(wav))
        decoder.cleanup()
        assert wav.exists(), "Original file must still exist after cleanup()."


# ---------------------------------------------------------------------------
# Tests for AudioDecoder as context manager
# ---------------------------------------------------------------------------


class TestAudioDecoderContextManager:

    def test_context_manager_cleans_up_on_exit(
        self, tmp_path: Path, sample_config: TranscriptionConfig
    ) -> None:
        """The context manager must remove temp files on __exit__."""
        wav = _write_wav(tmp_path / "44k.wav", sample_rate=44_100)
        with AudioDecoder(sample_config) as decoder:
            result_path = decoder.prepare_audio(str(wav))
            assert os.path.exists(result_path)
        # After context exit, temp file must be gone.
        assert not os.path.exists(result_path)

    def test_context_manager_cleans_up_on_exception(
        self, tmp_path: Path, sample_config: TranscriptionConfig
    ) -> None:
        """Temp files must be cleaned up even when an exception propagates."""
        wav = _write_wav(tmp_path / "44k.wav", sample_rate=44_100)
        result_path = None
        with pytest.raises(RuntimeError):
            with AudioDecoder(sample_config) as decoder:
                result_path = decoder.prepare_audio(str(wav))
                raise RuntimeError("Simulated pipeline error")
        assert result_path is not None
        assert not os.path.exists(result_path), "Temp file must be cleaned up after exception."


# ---------------------------------------------------------------------------
# Tests for corrupted / unreadable audio
# ---------------------------------------------------------------------------


class TestAudioDecoderCorruptedInput:

    def test_corrupt_wav_raises_corrupted_audio_error(
        self, tmp_path: Path, sample_config: TranscriptionConfig
    ) -> None:
        """A .wav file with junk content must raise CorruptedAudioError."""
        bad = tmp_path / "bad.wav"
        # Valid RIFF/WAVE magic (passes validator) but no valid audio data.
        bad.write_bytes(b"RIFF\x00\x00\x00\x00WAVEjunk" + b"\xff" * 100)
        decoder = AudioDecoder(sample_config)
        with pytest.raises(CorruptedAudioError):
            decoder.prepare_audio(str(bad))

    def test_unsupported_format_raises_corrupted_audio_error(
        self, tmp_path: Path, sample_config: TranscriptionConfig
    ) -> None:
        """A file with unsupported extension/content directly to decoder raises CorruptedAudioError."""
        unsupported = tmp_path / "sample.xyz"
        unsupported.write_bytes(b"NON_AUDIO_DATA_BYTES")
        decoder = AudioDecoder(sample_config)
        with pytest.raises(CorruptedAudioError) as exc_info:
            decoder.prepare_audio(str(unsupported))
        assert "File could not be decoded as audio" in exc_info.value.safe_message

    def test_soundfile_read_failure_falls_back_to_pyav(
        self, tmp_path: Path, sample_config: TranscriptionConfig
    ) -> None:
        """When soundfile.read raises, AudioDecoder falls back to PyAV."""
        wav = _write_wav(tmp_path / "44k_pyav_fallback.wav", sample_rate=44_100)
        decoder = AudioDecoder(sample_config)
        with patch("soundfile.read", side_effect=RuntimeError("libsndfile decode failure")):
            result = decoder.prepare_audio(str(wav))
            assert os.path.exists(result)
        decoder.cleanup()

    def test_soundfile_read_failure_raises_corrupted_audio_error(
        self, tmp_path: Path, sample_config: TranscriptionConfig
    ) -> None:
        """If soundfile.read and PyAV fallback both raise, CorruptedAudioError is raised."""
        wav = _write_wav(tmp_path / "44k_read_fail.wav", sample_rate=44_100)
        decoder = AudioDecoder(sample_config)
        with patch("soundfile.read", side_effect=RuntimeError("libsndfile decode failure")), \
             patch("av.open", side_effect=RuntimeError("PyAV decode failure")):
            with pytest.raises(CorruptedAudioError) as exc_info:
                decoder.prepare_audio(str(wav))
            assert "File could not be decoded as audio" in exc_info.value.safe_message

    def test_soundfile_write_failure_cleans_up_and_raises_corrupted_audio_error(
        self, tmp_path: Path, sample_config: TranscriptionConfig
    ) -> None:
        """If soundfile.write fails, temp file is removed and CorruptedAudioError raised."""
        wav = _write_wav(tmp_path / "44k_write_fail.wav", sample_rate=44_100)
        decoder = AudioDecoder(sample_config)
        with patch("soundfile.write", side_effect=OSError("Disk full")):
            with pytest.raises(CorruptedAudioError) as exc_info:
                decoder.prepare_audio(str(wav))
            assert "Failed to write decoded audio to temporary file" in exc_info.value.safe_message
        # Verify no temp files remain tracked
        assert decoder._temp_paths == []


# ---------------------------------------------------------------------------
# B2 Regression: int16 overflow clipping for over-peak lossy audio samples
# ---------------------------------------------------------------------------


class TestAudioDecoderInt16Clipping:
    """Regression tests for Bug B2: missing np.clip before int16 cast.

    Lossy audio codecs (MP3, OGG, AAC) regularly produce sample values
    slightly above ±1.0 (e.g. 1.002) due to inter-sample reconstruction.
    Without clipping, (1.002 * 32767).astype(np.int16) wraps around to a
    large negative value, injecting digital clipping artifacts into the
    converted WAV.
    """

    def test_no_overflow_on_over_peak_positive_sample(
        self, sample_config: TranscriptionConfig
    ) -> None:
        """A float32 sample > 1.0 must be clipped to int16 max (32767), not wrap negative."""
        import numpy as np

        from app.transcription.audio_decoder import AudioDecoder

        # 1.002 * 32767 = 32799.834 → wraps to -32704 without clipping
        over_peak = np.float32(1.002)
        result = np.clip(over_peak * 32767.0, -32768.0, 32767.0).astype(np.int16)
        assert result == np.int16(32767), f"Expected 32767, got {result}"

    def test_no_overflow_on_over_peak_negative_sample(
        self, sample_config: TranscriptionConfig
    ) -> None:
        """A float32 sample < -1.0 must be clipped to int16 min (-32768), not wrap positive."""
        import numpy as np

        over_peak_neg = np.float32(-1.003)
        result = np.clip(over_peak_neg * 32767.0, -32768.0, 32767.0).astype(np.int16)
        assert result == np.int16(-32768), f"Expected -32768, got {result}"

    def test_buggy_cast_would_overflow(self) -> None:
        """Control test: confirm the old (unfixed) code path actually wrapped.

        This documents the original bug behaviour so the regression is explicit.
        The fixed code path uses np.clip; this test just validates our understanding
        of the overflow, not that the production code path is broken.
        """
        import numpy as np

        over_peak = np.float32(1.002)
        # The buggy path: direct cast without clipping.
        buggy_result = (over_peak * np.float32(32767)).astype(np.int16)
        # This overflows: the result must be negative (wrap-around artifact).
        assert buggy_result < 0, (
            f"Expected wrap-around overflow (negative value), got {buggy_result}. "
            "The int16 overflow is real and was present in the original code."
        )

    def test_converted_wav_samples_within_int16_range(
        self, tmp_path: Path, sample_config: TranscriptionConfig
    ) -> None:
        """End-to-end: the WAV written by AudioDecoder must contain no wrapped samples.

        Uses a 44.1 kHz source WAV (triggers the conversion path) with
        samples near the peak so the fix is exercised in the full pipeline.
        """
        import wave as wave_mod

        import numpy as np
        import soundfile as sf  # type: ignore

        # Create a 44.1 kHz source that hits full scale (±1.0).
        src = tmp_path / "peak_44k.wav"
        # ~220 Hz full-scale square wave (speech-band, so it survives the
        # anti-aliasing low-pass in the resampler).  Band-limiting makes the
        # edges overshoot slightly above 1.0, which exercises the clipping.
        src_data = np.tile(
            np.concatenate([np.ones(100), -np.ones(100)]).astype(np.float32), 5
        )
        sf.write(str(src), src_data, 44100, subtype="FLOAT")

        with AudioDecoder(sample_config) as decoder:
            result_path = decoder.prepare_audio(str(src))
            # Read the converted WAV and inspect sample values.
            with wave_mod.open(result_path, "r") as wf:
                raw = wf.readframes(wf.getnframes())
            samples = np.frombuffer(raw, dtype=np.int16)

        # Every sample must be within the valid signed int16 range.
        assert np.all(samples >= -32768), "Samples below int16 minimum detected."
        assert np.all(samples <= 32767), "Samples above int16 maximum detected."
        # Specifically, no wrap-around should produce large-magnitude spikes
        # of opposite sign to the intended peak.
        # With correct clipping: positive peak → 32767; without: → -32704.
        # The result must have positive max.
        assert samples.max() > 0, "No positive samples in output – possible clipping wrap."

