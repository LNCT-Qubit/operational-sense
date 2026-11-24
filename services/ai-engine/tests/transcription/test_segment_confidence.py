"""
US-05 – Optional per-segment confidence fields.
"""
from __future__ import annotations

from types import SimpleNamespace
from unittest.mock import MagicMock

from app.transcription.config import TranscriptionConfig
from app.transcription.models import TranscriptionRequest, TranscriptionSegment
from app.transcription.transcription_service import TranscriptionService, _as_float


def _assemble(segments_raw: list):
    service = TranscriptionService(config=TranscriptionConfig(), provider=MagicMock())
    return service._assemble_result(
        transcription_id="t-1",
        request=TranscriptionRequest(audio_path="x.wav"),
        segments_raw=segments_raw,
        info=SimpleNamespace(language="en", language_probability=0.9),
        duration=0.1,
        created_at="2026-01-01T00:00:00+00:00",
    )


class TestSegmentConfidence:
    def test_new_fields_default_to_none(self) -> None:
        seg = TranscriptionSegment(start=0.0, end=1.0, text="hi")
        assert seg.avg_logprob is None and seg.no_speech_prob is None

    def test_values_are_copied_from_whisper_segments(self) -> None:
        raw = SimpleNamespace(start=0.0, end=1.0, text="pump ok", avg_logprob=-0.2, no_speech_prob=0.01)
        result = _assemble([raw])
        assert result.segments[0].avg_logprob == -0.2
        assert result.segments[0].no_speech_prob == 0.01
        assert result.to_dict()["segments"][0]["avg_logprob"] == -0.2

    def test_missing_or_non_numeric_values_become_none(self) -> None:
        mock_seg = MagicMock()  # attributes are MagicMock objects, not numbers
        mock_seg.start, mock_seg.end, mock_seg.text = 0.0, 1.0, "hello"
        result = _assemble([mock_seg])
        assert result.segments[0].avg_logprob is None
        assert result.segments[0].no_speech_prob is None

    def test_as_float_helper(self) -> None:
        assert _as_float(1) == 1.0
        assert _as_float(None) is None
        assert _as_float("x") is None
        assert _as_float(True) is None
