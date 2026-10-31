"""Builds the text that gets embedded for one case, and extracts structured filter metadata.

STRATEGY "symptom-side-v2" (see embedding_strategy/EMBEDDING_STRATEGY.md)
  Embedded (semantic similarity)   : technician symptom text, structured symptom summary,
                                     equipment class, subsystem, component, symptom category,
                                     operating status, frequency.
  NOT embedded (kept structured)   : class id, subsystem id, model, status, eligibility,
                                     synthetic flag, taxonomy / failure-mode ids, review state.
  NOT embedded (information leak)  : suspected / alternative / confirmed cause, failure mechanism,
                                     differential diagnosis, steps, corrective action, spares,
                                     acceptance criteria, outcome. A technician's NEW query can never contain
                                     them, so embedding them would make similarity depend on text the query
                                     cannot match (and would blur "similar symptoms" into "same cause").
v1 -> v2 change: adds the "Equipment" and "Subsystem" context lines. No embeddings existed
when this was changed, so no stored vector is invalidated. PROVISIONAL until measured.
"""
from __future__ import annotations

import hashlib
import re
from typing import Mapping, Optional

TEXT_BUILDER_VERSION = "symptom-side-v2"

# (column in operational_case, label in the text). Order matters twice: it keeps the text identical on
# every run, and embedding models cut off long input at the end, so the most informative fields come first.
EMBEDDING_FIELDS = (
    ("symptom_text", "Symptom (technician)"),
    ("symptom_structured", "Symptom (summary)"),
    ("equipment_class_id", "Equipment"),          # rendered through EQUIPMENT_LABELS
    ("subsystem_source_label", "Subsystem"),      # source wording; equals the approved name when resolved
    ("component_name", "Component"),
    ("symptom_category", "Category"),
    ("operating_status", "Operating status"),
    ("symptom_frequency", "Frequency"),
)

# Human-readable class names = equipment_class.class_name in database/seed_data/010 (cross-checked by a test).
EQUIPMENT_LABELS = {
    "EQ-PUMP": "Centrifugal Pump",
    "EQ-MOTOR": "Three-Phase Induction Motor",
    "EQ-COMP": "Rotary Screw Air Compressor",
}

# At least one of these must have text, otherwise the case is not embedded.
REQUIRED_ANY = ("symptom_text", "symptom_structured")

# Seed data tags values like "(illustrative)" or "(illustrative; no recorded readings)".
# Every case carries it, so it adds no meaning; only that marker is removed.
_ILLUSTRATIVE = re.compile(r"\s*\(illustrative[^)]*\)", re.IGNORECASE)
_WHITESPACE = re.compile(r"\s+")


def _clean(value: object) -> str:
    if value is None:
        return ""
    text = _ILLUSTRATIVE.sub("", str(value))
    return _WHITESPACE.sub(" ", text).strip()


def build_case_text(row: Mapping[str, object]) -> Optional[str]:
    """Return the text to embed, or None if the case has no usable symptom text. Deterministic."""
    if not any(_clean(row.get(col)) for col in REQUIRED_ANY):
        return None
    lines = []
    for column, label in EMBEDDING_FIELDS:
        raw = row.get(column)
        value = EQUIPMENT_LABELS.get(_clean(raw), "") if column == "equipment_class_id" else _clean(raw)
        if value:
            lines.append(f"{label}: {value}")
    return "\n".join(lines)


def text_sha256(text: str) -> str:
    """Fingerprint of the exact text that was embedded (for stale-vector detection)."""
    return hashlib.sha256(text.encode("utf-8")).hexdigest()


# --- structured metadata (filters) -------------------------------------------------------------
METADATA_FIELDS = (
    "case_id", "case_reference", "organization_id", "equipment_class_id", "subsystem_id",
    "subsystem_source_label", "equipment_model_id", "model_designation", "taxonomy_code",
    "failure_mode_id", "case_status", "retrieval_eligibility", "is_synthetic", "review_status",
    "source_reliability",
)


def extract_metadata(row: Mapping[str, object]) -> dict:
    """Structured, independently filterable metadata for one case (never embedded).

    Accepts either a DB row (flat columns) or a canonical JSON case (nested lists). Missing values
    become None and are listed in 'missing_metadata'; this function never raises on absent fields.
    """
    meta = {k: row.get(k) for k in METADATA_FIELDS}
    mappings = row.get("failure_mappings") or []
    if isinstance(mappings, list) and mappings and isinstance(mappings[0], Mapping):
        meta["taxonomy_code"] = meta["taxonomy_code"] or mappings[0].get("taxonomy_code")
        meta["failure_mode_id"] = meta["failure_mode_id"] or mappings[0].get("failure_mode_id")
    ver = row.get("verification")
    if isinstance(ver, Mapping):
        meta["review_status"] = meta["review_status"] or ver.get("overall_decision")
    if meta["subsystem_id"] is None and row.get("subsystem_name"):
        meta["subsystem_name"] = row.get("subsystem_name")     # JSON-side stand-in until the id is resolved
    tracked = ("equipment_class_id", "subsystem_id", "taxonomy_code", "failure_mode_id", "case_status", "is_synthetic", "review_status")
    meta["missing_metadata"] = [k for k in tracked if meta.get(k) in (None, "")]
    return meta
