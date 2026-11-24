"""
US-05 – Whisper Speech-to-Text Integration
Accuracy evaluation helpers (Word Error Rate) for Hinglish and English.

Accuracy can only be claimed from measurements.  This module provides small,
dependency-free helpers to compute WER between reference transcripts written
by a human and the transcripts produced by the pipeline.

Important notes for Hinglish
----------------------------
* Hinglish has no standard spelling ("kya" / "kia", "nahi" / "nahin").  WER
  therefore over-counts harmless spelling variants.  Write references in the
  same script and a consistent spelling style that the model produces, and
  compare models *relative to each other* on the same reference set.
* Devanagari and Roman text must not be mixed between reference and
  hypothesis.  :func:`devanagari_ratio` helps to detect this.
"""
from __future__ import annotations

import csv
import unicodedata
from dataclasses import dataclass, field
from pathlib import Path
from typing import Callable, Iterable, Optional


# ---------------------------------------------------------------------------
# Text normalisation
# ---------------------------------------------------------------------------


def normalize_text(text: Optional[str]) -> str:
    """Normalise *text* for WER comparison.

    Lower-cases, applies Unicode NFKC, replaces punctuation (including the
    Devanagari danda) with spaces, keeps letters / combining marks / digits /
    apostrophes, and collapses whitespace.
    """
    if not text:
        return ""
    text = unicodedata.normalize("NFKC", text).lower()
    chars: list[str] = []
    for ch in text:
        cat = unicodedata.category(ch)
        if ch == "'" or cat[0] in ("L", "M", "N"):
            chars.append(ch)
        else:
            chars.append(" ")
    return " ".join("".join(chars).split())


def devanagari_ratio(text: Optional[str]) -> float:
    """Return the fraction of alphabetic characters that are Devanagari."""
    if not text:
        return 0.0
    letters = [c for c in text if c.isalpha()]
    if not letters:
        return 0.0
    dev = sum(1 for c in letters if "\u0900" <= c <= "\u097f")
    return dev / len(letters)


# ---------------------------------------------------------------------------
# WER
# ---------------------------------------------------------------------------


def _edit_distance(ref: list[str], hyp: list[str]) -> int:
    """Word-level Levenshtein distance (substitutions + insertions + deletions)."""
    if not ref:
        return len(hyp)
    if not hyp:
        return len(ref)
    prev = list(range(len(hyp) + 1))
    for i, r in enumerate(ref, start=1):
        cur = [i] + [0] * len(hyp)
        for j, h in enumerate(hyp, start=1):
            cost = 0 if r == h else 1
            cur[j] = min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + cost)
        prev = cur
    return prev[-1]


def word_errors(reference: str, hypothesis: str) -> tuple[int, int]:
    """Return ``(edit_errors, reference_word_count)`` after normalisation."""
    ref = normalize_text(reference).split()
    hyp = normalize_text(hypothesis).split()
    return _edit_distance(ref, hyp), len(ref)


def word_error_rate(reference: str, hypothesis: str) -> float:
    """Return the WER of a single pair (0.0 = perfect; may exceed 1.0).

    An empty reference yields ``0.0`` if the hypothesis is also empty, else
    ``1.0``.
    """
    errors, n_ref = word_errors(reference, hypothesis)
    if n_ref == 0:
        return 0.0 if errors == 0 else 1.0
    return errors / n_ref


# ---------------------------------------------------------------------------
# Manifest + evaluation loop
# ---------------------------------------------------------------------------


@dataclass
class EvalRow:
    """One evaluation sample: an audio file and its human reference text."""

    audio_path: str
    reference: str


@dataclass
class EvalItemResult:
    audio_path: str
    reference: str
    hypothesis: str
    status: str
    errors: int
    ref_words: int
    wer: float
    seconds: Optional[float] = None
    error_code: Optional[str] = None


@dataclass
class EvalReport:
    items: list[EvalItemResult] = field(default_factory=list)

    @property
    def total_errors(self) -> int:
        return sum(i.errors for i in self.items)

    @property
    def total_ref_words(self) -> int:
        return sum(i.ref_words for i in self.items)

    @property
    def corpus_wer(self) -> Optional[float]:
        """Corpus-level WER (total errors / total reference words)."""
        total = self.total_ref_words
        return None if total == 0 else self.total_errors / total

    def to_dict(self) -> dict:
        return {
            "corpus_wer": self.corpus_wer,
            "total_errors": self.total_errors,
            "total_reference_words": self.total_ref_words,
            "samples": len(self.items),
            "items": [i.__dict__ for i in self.items],
        }


def load_manifest(path: str) -> list[EvalRow]:
    """Load a CSV manifest with columns ``audio`` and ``reference``.

    Relative audio paths are resolved against the manifest's directory.
    Raises ``ValueError`` if the required columns are missing.
    """
    manifest = Path(path)
    rows: list[EvalRow] = []
    with manifest.open("r", encoding="utf-8-sig", newline="") as fh:
        reader = csv.DictReader(fh)
        cols = {c.strip().lower() for c in (reader.fieldnames or [])}
        if not {"audio", "reference"} <= cols:
            raise ValueError("Manifest must have 'audio' and 'reference' columns.")
        for raw in reader:
            row = {k.strip().lower(): (v or "") for k, v in raw.items() if k}
            audio = row["audio"].strip()
            if not audio:
                continue
            ap = Path(audio)
            if not ap.is_absolute():
                ap = manifest.parent / ap
            rows.append(EvalRow(audio_path=str(ap), reference=row["reference"].strip()))
    return rows


def evaluate_rows(
    rows: Iterable[EvalRow],
    transcribe_fn: Callable[[str], object],
) -> EvalReport:
    """Run *transcribe_fn* on every row and compute WER.

    ``transcribe_fn`` takes an audio path and returns an object with
    ``status`` (enum or str), ``transcript``, ``error_code`` and
    ``processing_duration_seconds`` attributes (i.e. a
    :class:`~app.transcription.models.TranscriptionResult`).  Failed or empty
    transcriptions count as a fully wrong (empty) hypothesis.
    """
    report = EvalReport()
    for row in rows:
        result = transcribe_fn(row.audio_path)
        status = getattr(result.status, "value", result.status)
        code = getattr(result.error_code, "value", result.error_code)
        hypothesis = result.transcript or ""
        errors, n_ref = word_errors(row.reference, hypothesis)
        report.items.append(
            EvalItemResult(
                audio_path=row.audio_path,
                reference=row.reference,
                hypothesis=hypothesis,
                status=str(status),
                errors=errors,
                ref_words=n_ref,
                wer=(errors / n_ref) if n_ref else (0.0 if errors == 0 else 1.0),
                seconds=getattr(result, "processing_duration_seconds", None),
                error_code=None if code is None else str(code),
            )
        )
    return report
