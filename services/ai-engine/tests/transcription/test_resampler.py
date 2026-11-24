"""
US-05 – Anti-aliased resampler tests (numpy only; no audio files needed).
"""
from __future__ import annotations

import numpy as np

from app.transcription.audio_decoder import AudioDecoder

_resample = AudioDecoder._resample


def _rms(x: np.ndarray) -> float:
    return float(np.sqrt(np.mean(np.square(x, dtype=np.float64))))


def _tone(freq: float, sr: int, seconds: float = 2.0, amp: float = 0.5) -> np.ndarray:
    t = np.arange(int(sr * seconds)) / sr
    return (amp * np.sin(2 * np.pi * freq * t)).astype(np.float32)


class TestResampler:
    def test_output_length_matches_ratio(self) -> None:
        x = _tone(440, 44100)
        assert len(_resample(x, 44100, 16000)) == int(len(x) * 16000 / 44100)

    def test_dtype_is_float32(self) -> None:
        assert _resample(_tone(440, 48000), 48000, 16000).dtype == np.float32

    def test_same_rate_is_passthrough(self) -> None:
        x = _tone(440, 16000)
        assert np.array_equal(_resample(x, 16000, 16000), x)

    def test_speech_band_tone_is_preserved(self) -> None:
        for sr in (44100, 48000, 22050):
            y = _resample(_tone(1000, sr), sr, 16000)
            core = y[400:-400]
            # A 0.5-amplitude sine has RMS 0.5/sqrt(2).
            assert abs(_rms(core) - 0.5 / np.sqrt(2)) < 0.01

    def test_out_of_band_tone_does_not_alias(self) -> None:
        """A 12 kHz tone (above the 8 kHz Nyquist of 16 kHz) must vanish.

        Plain linear interpolation folds it down to a loud 4 kHz tone
        (RMS ~0.35); the anti-aliased resampler must suppress it.
        """
        y = _resample(_tone(12000, 44100), 44100, 16000)
        assert _rms(y[400:-400]) < 0.01

    def test_upsampling_length(self) -> None:
        assert len(_resample(np.zeros(8000, dtype=np.float32), 8000, 16000)) == 16000

    def test_tiny_and_empty_inputs(self) -> None:
        assert len(_resample(np.ones(100, dtype=np.float32), 44100, 16000)) == 36
        assert len(_resample(np.zeros(0, dtype=np.float32), 44100, 16000)) == 0
