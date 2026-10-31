"""Ranking metrics for the M08 evaluation (pure functions; no model or database needed)."""
from __future__ import annotations

from typing import Optional, Sequence


def recall_at_k(ranked_refs: Sequence[str], expected: Sequence[str], k: int = 3) -> Optional[float]:
    """Share of expected cases found in the top k. None when nothing is expected."""
    if not expected:
        return None
    hits = len(set(ranked_refs[:k]) & set(expected))
    return hits / len(set(expected))


def hit_at_k(ranked_refs: Sequence[str], expected: Sequence[str], k: int = 3) -> Optional[bool]:
    """True if at least one expected case is in the top k. None when nothing is expected."""
    if not expected:
        return None
    return bool(set(ranked_refs[:k]) & set(expected))


def reciprocal_rank(ranked_refs: Sequence[str], expected: Sequence[str]) -> Optional[float]:
    """1/rank of the first expected case (0 if absent). None when nothing is expected."""
    if not expected:
        return None
    wanted = set(expected)
    for i, ref in enumerate(ranked_refs, start=1):
        if ref in wanted:
            return 1.0 / i
    return 0.0


def mean(values: Sequence[Optional[float]]) -> Optional[float]:
    kept = [float(v) for v in values if v is not None]
    return sum(kept) / len(kept) if kept else None
