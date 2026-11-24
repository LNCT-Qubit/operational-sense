"""
US-05 – WER / evaluation helper tests (pure Python, no audio or model).
"""
from __future__ import annotations

from pathlib import Path
from types import SimpleNamespace

import pytest

from app.transcription.evaluation import (
    devanagari_ratio,
    evaluate_rows,
    load_manifest,
    normalize_text,
    word_error_rate,
    word_errors,
)


class TestNormalize:
    def test_lowercase_and_punctuation(self) -> None:
        assert normalize_text("Pump, VIBRATE kar raha hai!") == "pump vibrate kar raha hai"

    def test_devanagari_marks_and_danda(self) -> None:
        assert normalize_text("बैरिंग से noise।") == "बैरिंग से noise"

    def test_empty_and_none(self) -> None:
        assert normalize_text(None) == ""
        assert normalize_text("  ") == ""

    def test_apostrophe_kept(self) -> None:
        assert normalize_text("don't") == "don't"


class TestWer:
    def test_perfect_match_is_zero(self) -> None:
        assert word_error_rate("a b c", "A, b. c!") == 0.0

    def test_one_deletion(self) -> None:
        assert word_error_rate("a b c d e", "a b c d") == pytest.approx(0.2)

    def test_substitution_and_insertion(self) -> None:
        errors, n = word_errors("a b c d", "a x c d e")
        assert (errors, n) == (2, 4)

    def test_empty_reference(self) -> None:
        assert word_error_rate("", "") == 0.0
        assert word_error_rate("", "x") == 1.0

    def test_empty_hypothesis_is_all_wrong(self) -> None:
        assert word_error_rate("a b", "") == 1.0


class TestScriptRatio:
    def test_ratio(self) -> None:
        assert devanagari_ratio("pump") == 0.0
        assert devanagari_ratio("पंप") == 1.0
        assert 0.0 < devanagari_ratio("पंप pump") < 1.0
        assert devanagari_ratio("") == 0.0


class TestManifestAndLoop:
    def test_load_manifest_resolves_relative_paths(self, tmp_path) -> None:
        m = tmp_path / "manifest.csv"
        m.write_text("audio,reference\nclips/a.wav,pump chal raha hai\n", encoding="utf-8")
        rows = load_manifest(str(m))
        assert len(rows) == 1
        assert rows[0].audio_path == str(tmp_path / "clips" / "a.wav")
        assert rows[0].reference == "pump chal raha hai"

    def test_manifest_requires_columns(self, tmp_path) -> None:
        m = tmp_path / "bad.csv"
        m.write_text("file,text\nx,y\n", encoding="utf-8")
        with pytest.raises(ValueError, match="audio"):
            load_manifest(str(m))

    def test_evaluate_rows_corpus_wer(self, tmp_path) -> None:
        m = tmp_path / "m.csv"
        m.write_text("audio,reference\na.wav,one two three four\nb.wav,five six\n", encoding="utf-8")
        outputs = {
            "a.wav": SimpleNamespace(status="COMPLETED", transcript="one two three", error_code=None,
                                     processing_duration_seconds=0.5),
            "b.wav": SimpleNamespace(status="FAILED", transcript=None, error_code="INVALID_AUDIO",
                                     processing_duration_seconds=None),
        }

        def fake(path: str):
            return outputs[Path(path).name]

        report = evaluate_rows(load_manifest(str(m)), fake)
        # a.wav: 1 error / 4 words; b.wav (failed -> empty hypothesis): 2 / 2
        assert report.total_errors == 3
        assert report.total_ref_words == 6
        assert report.corpus_wer == pytest.approx(0.5)
        assert report.items[1].error_code == "INVALID_AUDIO"
        assert report.to_dict()["samples"] == 2
