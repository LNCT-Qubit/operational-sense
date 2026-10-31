"""M09 retrieval preparation helpers: embedding text, eligibility gate, strict filters, safe result labels.

These are M09-side helpers and a REFERENCE for what M08 should enforce. They are NOT the M08 retrieval
pipeline (its source code was not in the supplied package) and they do not create embeddings.
"""

SYNTHETIC_BANNER = ("SYNTHETIC DEMO CASE - not reviewed by an expert, not plant data. "
                    "Historical similarity only; not a diagnosis.")
ALLOWED_STATUSES = ("DRAFT", "SUBMITTED", "VERIFIED", "REJECTED", "REVOKED")
DEMO_STATUSES = ("DRAFT", "SUBMITTED")
NOT_RECORDED = "not recorded (flag for expert review)"


def _v(x):
    if x is None or (isinstance(x, str) and not x.strip()):
        return NOT_RECORDED
    return str(x).strip()


def build_case_document(case, steps=None, failure_mode_label=None, taxonomy_code=None):
    """Deterministic retrieval text + metadata for one case.

    * Tier 1 / Tier 2 checks are included (observations a technician can compare).
    * Tier 3 corrective work is NOT put into the embedding text and is never presented as advice;
      the outcome line states that approval and lock-out/tag-out are required.
    * Missing fields are written as an explicit marker, never invented.
    """
    steps = sorted(steps or [], key=lambda s: s["step_number"])
    checks = [s["check_measurement"] for s in steps if s["tier"] in (1, 2) and s.get("check_measurement")]
    lines = [
        SYNTHETIC_BANNER if case.get("is_synthetic", True) else "",
        "Case: %s" % case["case_reference"],
        "Equipment class: %s" % _v(case.get("equipment_class_id")),
        "Model: %s%s" % (_v(case.get("model_designation")), " (illustrative)" if case.get("model_is_illustrative", True) else ""),
        "Subsystem: %s" % _v(case.get("subsystem_source_label")),
        "Component: %s" % _v(case.get("component_name")),
        "Symptom: %s" % _v(case.get("symptom_text")),
        "Symptom summary: %s" % _v(case.get("symptom_structured")),
        "Operating status: %s" % _v(case.get("operating_status")),
        "Failure mode: %s%s" % (_v(failure_mode_label), " [%s]" % taxonomy_code if taxonomy_code else ""),
        "Suspected cause (unconfirmed): %s" % _v(case.get("primary_suspected_cause")),
        "Alternative causes: %s" % _v(case.get("alternative_causes")),
        "Diagnostic checks: %s" % ("; ".join(checks) if checks else NOT_RECORDED),
        "Outcome: corrective action is for a qualified person with supervisor approval and lock-out/tag-out; "
        "not an instruction from this system.",
        "Provenance: origin=%s; evidence=%s; reliability=%s; status=%s; eligibility=%s" % (
            _v(case.get("case_origin")), _v(case.get("evidence_type")), _v(case.get("source_reliability")),
            _v(case.get("case_status")), _v(case.get("retrieval_eligibility"))),
    ]
    text = "\n".join(l for l in lines if l)
    meta = {k: case.get(k) for k in ("case_reference", "equipment_class_id", "subsystem_id", "subsystem_source_label",
                                     "component_name", "model_designation", "case_status", "retrieval_eligibility",
                                     "is_synthetic", "model_is_illustrative")}
    return {"case_reference": case["case_reference"], "text": text, "metadata": meta}


def is_retrievable(case, mode="trusted", include_demo=False):
    """Fail-closed eligibility gate.

    trusted : VERIFIED and retrieval_eligibility == 'eligible'.
    demo    : only when include_demo is True (explicit opt-in) AND the case is synthetic, still demo-only,
              and DRAFT/SUBMITTED. REJECTED / REVOKED are never retrievable. Missing fields -> False.
    """
    status, elig = case.get("case_status"), case.get("retrieval_eligibility")
    if status not in ALLOWED_STATUSES or elig is None:
        return False
    if status in ("REJECTED", "REVOKED"):
        return False
    if mode == "trusted":
        return status == "VERIFIED" and elig == "eligible"
    if mode == "demo":
        return bool(include_demo) and case.get("is_synthetic") is True \
            and elig == "demo_only_until_expert_review" and status in DEMO_STATUSES
    return False


def filter_cases(cases, mode="trusted", include_demo=False, equipment_class_id=None, subsystem_id=None):
    """Eligibility first, then metadata filters. A NULL subsystem_id never satisfies a subsystem filter."""
    out = []
    for c in cases:
        if not is_retrievable(c, mode, include_demo):
            continue
        if equipment_class_id is not None and c.get("equipment_class_id") != equipment_class_id:
            continue
        if subsystem_id is not None and (c.get("subsystem_id") is None or c.get("subsystem_id") != subsystem_id):
            continue
        out.append(c)
    return out


def format_results(results):
    """results: list of (case, score). Always labelled as historical similarity; empty list is handled."""
    if not results:
        return "No eligible historical cases matched. This is not evidence that no fault exists."
    lines = []
    for rank, (case, score) in enumerate(results, 1):
        tag = "SYNTHETIC DEMO - NOT REVIEWED" if case.get("is_synthetic") else "reviewed case"
        lines.append("#%d %s [%s] historical similarity %.3f (not a diagnosis; verify on site, "
                     "supervisor approval for any corrective work)" % (rank, case["case_reference"], tag, score))
    return "\n".join(lines)
