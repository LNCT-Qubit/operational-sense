"""Which cases may be shown as historical evidence (single source of truth for M08).

Rules come ONLY from migration 005_cases.sql:
  case_status           : DRAFT, SUBMITTED, VERIFIED, REJECTED, REVOKED
  retrieval_eligibility : demo_only_until_expert_review, eligible, excluded

The schema does not say which combination means "trusted". M08 therefore uses the
strictest reading and writes it down here so the team can confirm or change it:

  TRUSTED          = case_status VERIFIED  AND retrieval_eligibility 'eligible'
  DEMO_UNVERIFIED  = case_status DRAFT/SUBMITTED AND retrieval_eligibility
                     'demo_only_until_expert_review'  (only when include_demo=True)
  everything else (REJECTED, REVOKED, 'excluded', VERIFIED-but-not-'eligible', ...) is never returned.

Both the Python check and the SQL fragment are built from the same constants.
"""
from __future__ import annotations

from typing import Optional

TRUSTED = "TRUSTED"
DEMO_UNVERIFIED = "DEMO_UNVERIFIED"

TRUSTED_STATUSES = ("VERIFIED",)
TRUSTED_ELIGIBILITY = "eligible"
DEMO_STATUSES = ("DRAFT", "SUBMITTED")
DEMO_ELIGIBILITY = "demo_only_until_expert_review"


def evidence_level(case_status: object, retrieval_eligibility: object, *, include_demo: bool) -> Optional[str]:
    """Return TRUSTED, DEMO_UNVERIFIED, or None (= not allowed to be returned)."""
    if case_status in TRUSTED_STATUSES and retrieval_eligibility == TRUSTED_ELIGIBILITY:
        return TRUSTED
    if include_demo and case_status in DEMO_STATUSES and retrieval_eligibility == DEMO_ELIGIBILITY:
        return DEMO_UNVERIFIED
    return None


def _in_list(values: tuple) -> str:
    return ", ".join("'" + v + "'" for v in values)  # constants only, never user input


def sql_condition(alias: str, include_demo: bool) -> str:
    """SQL WHERE fragment on operational_case (alias) matching evidence_level()."""
    trusted = (
        f"({alias}.case_status IN ({_in_list(TRUSTED_STATUSES)}) "
        f"AND {alias}.retrieval_eligibility = '{TRUSTED_ELIGIBILITY}')"
    )
    if not include_demo:
        return trusted
    demo = (
        f"({alias}.case_status IN ({_in_list(DEMO_STATUSES)}) "
        f"AND {alias}.retrieval_eligibility = '{DEMO_ELIGIBILITY}')"
    )
    return f"({trusted} OR {demo})"
