"""
US-05 – Whisper Speech-to-Text Integration
Transcription quality-report primitives.

This module extends the existing WER evaluation layer with:
  - CER (Character Error Rate) calculation.
  - Levenshtein word-alignment for readable diff output.
  - Segment-level diagnostics (avg_logprob, no_speech_prob) from faster-whisper.
  - A structured QualityReport dataclass consumed by the CLI.

Design principles
-----------------
* All reference-based metrics (WER / CER) require a human ground-truth
  reference.  If no reference is supplied the report clearly states that WER
  and CER cannot be measured.
* "Word Accuracy Proxy" = max(0, 1 - WER) × 100 is **labelled explicitly** as
  a WER-derived proxy, not an independently measured probability.
* Confidence signals (avg_logprob, no_speech_prob) are taken directly from the
  faster-whisper segment objects; they are reported as-is and **not** marketed
  as an overall accuracy percentage.
* Hinglish normalization is applied before metric computation but the original
  transcript is always preserved alongside the normalized form.
* The normalizer in :mod:`app.transcription.evaluation` is reused unchanged so
  there is no duplicated normalization logic.
"""
from __future__ import annotations

import unicodedata
from dataclasses import dataclass, field
from typing import Optional

from app.transcription.evaluation import normalize_text


# ---------------------------------------------------------------------------
# CER
# ---------------------------------------------------------------------------


def _char_edit_distance(ref: str, hyp: str) -> int:
    """Standard character-level Levenshtein distance."""
    r, h = list(ref), list(hyp)
    if not r:
        return len(h)
    if not h:
        return len(r)
    prev = list(range(len(h) + 1))
    for i, rc in enumerate(r, start=1):
        cur = [i] + [0] * len(h)
        for j, hc in enumerate(h, start=1):
            cost = 0 if rc == hc else 1
            cur[j] = min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + cost)
        prev = cur
    return prev[-1]


def character_error_rate(reference: str, hypothesis: str) -> float:
    """Return the CER of a single pair (0.0 = perfect; may exceed 1.0).

    Both strings are normalised before comparison.  An empty reference
    yields 0.0 if the hypothesis is also empty, else 1.0.
    """
    ref = normalize_text(reference)
    hyp = normalize_text(hypothesis)
    if not ref:
        return 0.0 if not hyp else 1.0
    return _char_edit_distance(ref, hyp) / len(ref)


# ---------------------------------------------------------------------------
# Word-alignment (Levenshtein back-trace)
# ---------------------------------------------------------------------------


def _levenshtein_ops(ref: list[str], hyp: list[str]) -> list[tuple[str, str, str]]:
    """Return an aligned list of (operation, ref_word, hyp_word) triples.

    Operations: ``"C"`` correct, ``"S"`` substitution, ``"D"`` deletion,
    ``"I"`` insertion.  Deleted words have ``hyp_word=""`` and inserted words
    have ``ref_word=""``.
    """
    n, m = len(ref), len(hyp)
    # Build cost + backpointer table.
    dp = [[0] * (m + 1) for _ in range(n + 1)]
    for i in range(n + 1):
        dp[i][0] = i
    for j in range(m + 1):
        dp[0][j] = j

    for i in range(1, n + 1):
        for j in range(1, m + 1):
            if ref[i - 1] == hyp[j - 1]:
                dp[i][j] = dp[i - 1][j - 1]
            else:
                dp[i][j] = 1 + min(
                    dp[i - 1][j],      # deletion
                    dp[i][j - 1],      # insertion
                    dp[i - 1][j - 1],  # substitution
                )

    # Back-trace.
    ops: list[tuple[str, str, str]] = []
    i, j = n, m
    while i > 0 or j > 0:
        if i > 0 and j > 0 and ref[i - 1] == hyp[j - 1]:
            ops.append(("C", ref[i - 1], hyp[j - 1]))
            i -= 1
            j -= 1
        elif i > 0 and j > 0 and dp[i][j] == dp[i - 1][j - 1] + 1:
            ops.append(("S", ref[i - 1], hyp[j - 1]))
            i -= 1
            j -= 1
        elif i > 0 and dp[i][j] == dp[i - 1][j] + 1:
            ops.append(("D", ref[i - 1], ""))
            i -= 1
        else:
            ops.append(("I", "", hyp[j - 1]))
            j -= 1

    ops.reverse()
    return ops


@dataclass
class WordAlignment:
    """The result of aligning a reference against a hypothesis word-by-word."""

    ops: list[tuple[str, str, str]]  # (op, ref_word, hyp_word)

    @property
    def n_correct(self) -> int:
        return sum(1 for op, _, _ in self.ops if op == "C")

    @property
    def n_substitutions(self) -> int:
        return sum(1 for op, _, _ in self.ops if op == "S")

    @property
    def n_deletions(self) -> int:
        return sum(1 for op, _, _ in self.ops if op == "D")

    @property
    def n_insertions(self) -> int:
        return sum(1 for op, _, _ in self.ops if op == "I")

    @property
    def n_errors(self) -> int:
        return self.n_substitutions + self.n_deletions + self.n_insertions

    @property
    def n_ref_words(self) -> int:
        return sum(1 for op, _, _ in self.ops if op in ("C", "S", "D"))

    @property
    def n_hyp_words(self) -> int:
        return sum(1 for op, _, _ in self.ops if op in ("C", "S", "I"))

    def render(self, width: int = 90) -> str:
        """Return a human-readable two-line alignment table.

        Legend: ``[OK]`` correct  ``[SUB ref→hyp]`` substitution
                ``[DEL ref]`` deletion  ``[INS hyp]`` insertion.
        """
        lines: list[str] = []
        for op, ref_w, hyp_w in self.ops:
            if op == "C":
                token = f"[OK:{ref_w}]"
            elif op == "S":
                token = f"[SUB:{ref_w}→{hyp_w}]"
            elif op == "D":
                token = f"[DEL:{ref_w}]"
            else:
                token = f"[INS:{hyp_w}]"
            lines.append(token)
        # Wrap at width characters.
        result, cur = [], ""
        for tok in lines:
            if cur and len(cur) + 1 + len(tok) > width:
                result.append(cur)
                cur = tok
            else:
                cur = (cur + " " + tok).lstrip()
        if cur:
            result.append(cur)
        return "\n".join(result)


def align_words(reference: str, hypothesis: str) -> WordAlignment:
    """Return a :class:`WordAlignment` after normalizing both strings."""
    ref_words = normalize_text(reference).split()
    hyp_words = normalize_text(hypothesis).split()
    return WordAlignment(ops=_levenshtein_ops(ref_words, hyp_words))


# ---------------------------------------------------------------------------
# Segment diagnostics
# ---------------------------------------------------------------------------


@dataclass
class SegmentDiagnostics:
    """Whisper segment-level quality signals.

    These come directly from faster-whisper's output and are **not** an
    overall accuracy probability.  Treat them as diagnostic hints only.

    Attributes
    ----------
    avg_logprob:
        Average log-probability of the tokens in this segment.
        Closer to 0 = higher model confidence in its own output.
        Typical range: roughly −0.5 (confident) to −2.0 (uncertain).
    no_speech_prob:
        Probability that the segment contains no speech.
        Close to 1.0 → model thinks this is silence / noise.
    start, end:
        Segment timing in seconds.
    text:
        Raw segment text.
    """

    start: float
    end: float
    text: str
    avg_logprob: Optional[float]
    no_speech_prob: Optional[float]


# ---------------------------------------------------------------------------
# Quality report
# ---------------------------------------------------------------------------


@dataclass
class QualityReport:
    """Full quality report for one audio file and one model run.

    Reference-based metrics (WER, CER, alignment) are ``None`` when no
    ground-truth reference was provided.
    """

    # --- input / run metadata ---
    audio_path: str
    model_name: str
    profile: str
    quality: Optional[str]          # "fast" | "accurate" | None
    status: str                     # TranscriptionStatus value string
    transcript: Optional[str]       # raw transcript from the model
    processing_seconds: Optional[float]

    # --- reference-based metrics (None if no reference supplied) ---
    reference: Optional[str] = None
    wer: Optional[float] = None
    cer: Optional[float] = None
    alignment: Optional[WordAlignment] = field(default=None, repr=False)

    # --- segment diagnostics ---
    segments: list[SegmentDiagnostics] = field(default_factory=list)

    # --- error info ---
    error_code: Optional[str] = None
    error_message: Optional[str] = None

    # ------------------------------------------------------------------
    # Derived properties
    # ------------------------------------------------------------------

    @property
    def word_accuracy_proxy(self) -> Optional[float]:
        """max(0, 1 − WER) × 100.  None when WER is unavailable.

        This is a **WER-derived proxy**, not an independently measured
        probability of correctness.
        """
        if self.wer is None:
            return None
        return max(0.0, 1.0 - self.wer) * 100.0

    @property
    def avg_logprob(self) -> Optional[float]:
        """Mean avg_logprob across all segments; None if unavailable."""
        vals = [s.avg_logprob for s in self.segments if s.avg_logprob is not None]
        return sum(vals) / len(vals) if vals else None

    @property
    def no_speech_prob(self) -> Optional[float]:
        """Mean no_speech_prob across all segments; None if unavailable."""
        vals = [s.no_speech_prob for s in self.segments if s.no_speech_prob is not None]
        return sum(vals) / len(vals) if vals else None

    # ------------------------------------------------------------------
    # Factory
    # ------------------------------------------------------------------

    @classmethod
    def build(
        cls,
        result,          # TranscriptionResult
        config,          # TranscriptionConfig
        reference: Optional[str] = None,
    ) -> "QualityReport":
        """Build a :class:`QualityReport` from a pipeline result.

        Parameters
        ----------
        result:
            A :class:`~app.transcription.models.TranscriptionResult`.
        config:
            The :class:`~app.transcription.config.TranscriptionConfig` used.
        reference:
            Human ground-truth transcript.  Pass ``None`` when unavailable.
        """
        from app.transcription.config import HINGLISH_MODELS
        from app.transcription.models import TranscriptionStatus

        status_str = getattr(result.status, "value", str(result.status))
        error_code = getattr(result.error_code, "value", result.error_code)
        error_code = None if error_code is None else str(error_code)

        # Determine quality label.
        quality: Optional[str] = None
        if config.profile == "hinglish":
            for q, m in HINGLISH_MODELS.items():
                if m == config.model_name:
                    quality = q
                    break

        # Segment diagnostics.
        segs: list[SegmentDiagnostics] = []
        for seg in result.segments:
            segs.append(
                SegmentDiagnostics(
                    start=seg.start,
                    end=seg.end,
                    text=seg.text,
                    avg_logprob=getattr(seg, "avg_logprob", None),
                    no_speech_prob=getattr(seg, "no_speech_prob", None),
                )
            )

        transcript = result.transcript or ""

        # Reference-based metrics.
        wer: Optional[float] = None
        cer: Optional[float] = None
        alignment: Optional[WordAlignment] = None

        if reference:
            from app.transcription.evaluation import word_errors
            errors, n_ref = word_errors(reference, transcript)
            wer = (errors / n_ref) if n_ref else (0.0 if errors == 0 else 1.0)
            cer = character_error_rate(reference, transcript)
            alignment = align_words(reference, transcript)

        return cls(
            audio_path=result.transcription_id and str(config.profile) or "",
            model_name=result.model_name,
            profile=config.profile,
            quality=quality,
            status=status_str,
            transcript=result.transcript,
            processing_seconds=result.processing_duration_seconds,
            reference=reference if reference else None,
            wer=wer,
            cer=cer,
            alignment=alignment,
            segments=segs,
            error_code=error_code,
            error_message=result.error_message,
        )

