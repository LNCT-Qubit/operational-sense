"""
US-05 – Unit tests for the quality_report module.

Covers:
  - CER calculation correctness.
  - word-level Levenshtein alignment (correct, substitution, deletion, insertion).
  - WordAlignment property counts.
  - WordAlignment.render() output format.
  - align_words normalization behaviour.
  - QualityReport.word_accuracy_proxy.
  - QualityReport.avg_logprob / no_speech_prob aggregation.
  - QualityReport.build() with and without a reference.
  - Missing-reference handling (WER/CER reported as None).
  - Test01 and Test02 reference files exist and are non-empty.
"""
from __future__ import annotations

from pathlib import Path
from types import SimpleNamespace
from unittest.mock import MagicMock

import pytest

from app.transcription.quality_report import (
    QualityReport,
    SegmentDiagnostics,
    WordAlignment,
    _levenshtein_ops,
    align_words,
    character_error_rate,
)

# ---------------------------------------------------------------------------
# Fixture paths
# ---------------------------------------------------------------------------

FIXTURES = (
    Path(__file__).parent / "fixtures"
)


# ---------------------------------------------------------------------------
# CER
# ---------------------------------------------------------------------------


class TestCharacterErrorRate:
    def test_perfect_match_is_zero(self) -> None:
        assert character_error_rate("hello world", "HELLO WORLD") == pytest.approx(0.0)

    def test_all_wrong(self) -> None:
        # "ab" vs "" → 2 errors / 2 ref chars = 1.0
        assert character_error_rate("ab", "") == pytest.approx(1.0)

    def test_one_char_substitution(self) -> None:
        # "cat" vs "bat" → 1 sub / 3 ref = 0.333
        cer = character_error_rate("cat", "bat")
        assert 0.0 < cer < 1.0

    def test_empty_reference_empty_hyp(self) -> None:
        assert character_error_rate("", "") == pytest.approx(0.0)

    def test_empty_reference_nonempty_hyp(self) -> None:
        assert character_error_rate("", "extra") == pytest.approx(1.0)

    def test_punctuation_stripped(self) -> None:
        # Punctuation is removed by normalizer before CER comparison.
        assert character_error_rate("hello!", "hello.") == pytest.approx(0.0)

    def test_case_insensitive(self) -> None:
        assert character_error_rate("PUMP", "pump") == pytest.approx(0.0)

    def test_hinglish_pair(self) -> None:
        # "nahin" vs "nahi" should have a small CER (1 deletion).
        cer = character_error_rate("nahin", "nahi")
        assert 0.0 < cer < 0.5

    def test_cer_can_exceed_one(self) -> None:
        # Very short reference, long hypothesis → CER > 1.0 is valid.
        cer = character_error_rate("hi", "hello world")
        assert cer > 1.0


# ---------------------------------------------------------------------------
# Levenshtein alignment
# ---------------------------------------------------------------------------


class TestLevenshteinOps:
    def test_all_correct(self) -> None:
        ops = _levenshtein_ops(["a", "b", "c"], ["a", "b", "c"])
        assert all(op == "C" for op, _, _ in ops)
        assert len(ops) == 3

    def test_one_substitution(self) -> None:
        ops = _levenshtein_ops(["a", "b", "c"], ["a", "x", "c"])
        assert ops[1] == ("S", "b", "x")

    def test_one_deletion(self) -> None:
        # ref has "b" but hyp does not.
        ops = _levenshtein_ops(["a", "b", "c"], ["a", "c"])
        ops_map = {(r, h) for _, r, h in ops}
        assert any(op == "D" for op, _, _ in ops)

    def test_one_insertion(self) -> None:
        ops = _levenshtein_ops(["a", "c"], ["a", "b", "c"])
        assert any(op == "I" for op, _, _ in ops)

    def test_empty_ref_all_insertions(self) -> None:
        ops = _levenshtein_ops([], ["x", "y"])
        assert all(op == "I" for op, _, _ in ops)

    def test_empty_hyp_all_deletions(self) -> None:
        ops = _levenshtein_ops(["x", "y"], [])
        assert all(op == "D" for op, _, _ in ops)

    def test_total_error_count_matches_edit_distance(self) -> None:
        from app.transcription.evaluation import _edit_distance
        ref = ["pump", "vibrate", "kar", "raha", "hai"]
        hyp = ["pump", "vibrating", "kar", "hai"]
        ops = _levenshtein_ops(ref, hyp)
        errors = sum(1 for op, _, _ in ops if op != "C")
        assert errors == _edit_distance(ref, hyp)


# ---------------------------------------------------------------------------
# WordAlignment properties
# ---------------------------------------------------------------------------


class TestWordAlignment:
    def _make(self, ops: list[tuple[str, str, str]]) -> WordAlignment:
        return WordAlignment(ops=ops)

    def test_counts_correct(self) -> None:
        al = self._make([("C", "a", "a"), ("S", "b", "x"), ("D", "c", ""), ("I", "", "d")])
        assert al.n_correct == 1
        assert al.n_substitutions == 1
        assert al.n_deletions == 1
        assert al.n_insertions == 1
        assert al.n_errors == 3

    def test_ref_and_hyp_word_counts(self) -> None:
        al = self._make([("C", "a", "a"), ("S", "b", "x"), ("D", "c", ""), ("I", "", "d")])
        # ref words = C + S + D = 3
        assert al.n_ref_words == 3
        # hyp words = C + S + I = 3
        assert al.n_hyp_words == 3

    def test_render_contains_markers(self) -> None:
        al = self._make([("C", "pump", "pump"), ("S", "chal", "chala"), ("D", "raha", ""), ("I", "", "extra")])
        rendered = al.render()
        assert "[OK:pump]" in rendered
        assert "[SUB:chal→chala]" in rendered
        assert "[DEL:raha]" in rendered
        assert "[INS:extra]" in rendered

    def test_render_wraps_at_width(self) -> None:
        ops = [("C", f"word{i}", f"word{i}") for i in range(30)]
        al = WordAlignment(ops=ops)
        rendered = al.render(width=40)
        # Must have multiple lines.
        assert "\n" in rendered


# ---------------------------------------------------------------------------
# align_words normalization
# ---------------------------------------------------------------------------


class TestAlignWords:
    def test_normalizes_before_alignment(self) -> None:
        al = align_words("Pump, chal raha hai!", "pump chal raha hai")
        assert al.n_correct == 4
        assert al.n_errors == 0

    def test_case_insensitive(self) -> None:
        al = align_words("HELLO WORLD", "hello world")
        assert al.n_correct == 2

    def test_substitution_detected(self) -> None:
        al = align_words("nahin", "nahi")
        # Different tokens → substitution.
        assert al.n_errors >= 1


# ---------------------------------------------------------------------------
# QualityReport
# ---------------------------------------------------------------------------


def _make_result(
    transcript: str = "pump vibrate kar raha hai",
    status: str = "COMPLETED",
    model: str = "MSpider3/whisper-hindi2hinglish-swift-ct2",
    duration: float = 3.5,
    segments=None,
) -> SimpleNamespace:
    if segments is None:
        seg = SimpleNamespace(
            start=0.0, end=3.0, text=transcript,
            avg_logprob=-0.15, no_speech_prob=0.001,
        )
        segments = [seg]
    return SimpleNamespace(
        transcription_id="test-id",
        status=SimpleNamespace(value=status),
        transcript=transcript,
        detected_language="en",
        language_probability=1.0,
        segments=segments,
        processing_duration_seconds=duration,
        error_code=None,
        error_message=None,
        model_name=model,
        created_at="2026-01-01T00:00:00+00:00",
    )


def _make_config(profile: str = "hinglish", model: str = "MSpider3/whisper-hindi2hinglish-swift-ct2"):
    return SimpleNamespace(profile=profile, model_name=model)


class TestQualityReport:
    def test_no_reference_gives_none_wer(self) -> None:
        result = _make_result()
        config = _make_config()
        rpt = QualityReport.build(result, config, reference=None)
        assert rpt.wer is None
        assert rpt.cer is None
        assert rpt.alignment is None
        assert rpt.word_accuracy_proxy is None

    def test_with_reference_computes_wer_cer(self) -> None:
        result = _make_result(transcript="pump vibrate kar raha hai")
        config = _make_config()
        rpt = QualityReport.build(result, config, reference="pump vibrate kar raha hai")
        assert rpt.wer == pytest.approx(0.0)
        assert rpt.cer == pytest.approx(0.0)
        assert rpt.word_accuracy_proxy == pytest.approx(100.0)

    def test_word_accuracy_proxy_clamped_at_zero(self) -> None:
        result = _make_result(transcript="x x x x x x x x x x x x")
        config = _make_config()
        rpt = QualityReport.build(result, config, reference="a b")
        # WER > 1 → proxy clamped at 0.
        assert rpt.word_accuracy_proxy == pytest.approx(0.0)

    def test_avg_logprob_aggregated(self) -> None:
        segs = [
            SimpleNamespace(start=0.0, end=1.0, text="a", avg_logprob=-0.2, no_speech_prob=0.01),
            SimpleNamespace(start=1.0, end=2.0, text="b", avg_logprob=-0.4, no_speech_prob=0.02),
        ]
        result = _make_result(segments=segs)
        config = _make_config()
        rpt = QualityReport.build(result, config)
        assert rpt.avg_logprob == pytest.approx(-0.3)
        assert rpt.no_speech_prob == pytest.approx(0.015)

    def test_no_speech_prob_none_when_unavailable(self) -> None:
        segs = [
            SimpleNamespace(start=0.0, end=1.0, text="a", avg_logprob=None, no_speech_prob=None),
        ]
        result = _make_result(segments=segs)
        config = _make_config()
        rpt = QualityReport.build(result, config)
        assert rpt.avg_logprob is None
        assert rpt.no_speech_prob is None

    def test_quality_label_fast(self) -> None:
        result = _make_result(model="MSpider3/whisper-hindi2hinglish-swift-ct2")
        config = _make_config(model="MSpider3/whisper-hindi2hinglish-swift-ct2")
        rpt = QualityReport.build(result, config)
        assert rpt.quality == "fast"

    def test_quality_label_accurate(self) -> None:
        result = _make_result(model="Hub84/faster-whisper-hinglish-prime")
        config = _make_config(model="Hub84/faster-whisper-hinglish-prime")
        rpt = QualityReport.build(result, config)
        assert rpt.quality == "accurate"

    def test_quality_label_none_for_default_profile(self) -> None:
        result = _make_result(model="tiny")
        config = _make_config(profile="default", model="tiny")
        rpt = QualityReport.build(result, config)
        assert rpt.quality is None

    def test_failed_status_preserved(self) -> None:
        result = _make_result(status="FAILED", transcript="")
        result.error_code = SimpleNamespace(value="INVALID_AUDIO")
        result.error_message = "Corrupted file"
        config = _make_config()
        rpt = QualityReport.build(result, config)
        assert rpt.status == "FAILED"
        assert rpt.error_code == "INVALID_AUDIO"
        assert rpt.error_message == "Corrupted file"

    def test_alignment_counts_substitutions(self) -> None:
        result = _make_result(transcript="pump vibrating raha hai")
        config = _make_config()
        rpt = QualityReport.build(result, config, reference="pump vibrate kar raha hai")
        assert rpt.alignment is not None
        assert rpt.alignment.n_errors >= 1


# ---------------------------------------------------------------------------
# Reference-file fixtures exist
# ---------------------------------------------------------------------------


class TestReferenceFilesExist:
    def test_test01_ref_file_exists_and_nonempty(self) -> None:
        p = FIXTURES / "Test01_ref.txt"
        assert p.exists(), f"Test01_ref.txt not found at {p}"
        assert len(p.read_text(encoding="utf-8").strip()) > 0

    def test_test02_ref_file_exists_and_nonempty(self) -> None:
        p = FIXTURES / "Test02_ref.txt"
        assert p.exists(), f"Test02_ref.txt not found at {p}"
        assert len(p.read_text(encoding="utf-8").strip()) > 0

    def test_test01_audio_exists(self) -> None:
        assert (FIXTURES / "Test01.wav").exists()

    def test_test02_audio_exists(self) -> None:
        assert (FIXTURES / "Test02.wav").exists()

