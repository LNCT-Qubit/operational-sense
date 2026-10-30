# Product Requirements Document (PRD)

**Operational Sense — Preserving Technicians' Tacit Troubleshooting Knowledge**  
*Team Qubit | EPAM × LNCT Center of Excellence (CoE) Program*

---

## 1. Executive Summary & Vision

Operational Sense is a human-in-the-loop decision-support system designed to capture spoken, informal technician observations (<30s), extract structured symptom-cause cases, retrieve semantically similar historical failures, and suggest low-risk next checks with supervisor sign-off before case reuse.

The product targets the industrial "tribal knowledge gap": senior technicians hold decades of unwritten, sensory, and heuristic troubleshooting expertise. When seniors retire or rotate shifts, junior technicians re-investigate recurring machine faults from scratch because formal CMMS (SAP PM, Maximo) only capture rigid work orders, not diagnostic thought processes.

---

## 2. Target Users & Stakeholders

- **Frontline Maintenance Technicians & Operators (Primary Users):** Capture observations offline; receive guided next-check recommendations.
- **Maintenance & Reliability Engineers:** Own root-cause analysis (RCA) and ensure technical accuracy.
- **Shift Supervisors:** Authorize intrusive Tier 3 actions and sign off on submitted cases.
- **Plant / Operations Managers (Buyers):** Accountable for MTTR, downtime cost, and knowledge continuity.
- **IT & Security Stakeholders:** Own data residency, tenant isolation, and AI usage approval.

---

## 3. Product Scope & Architectural Boundaries

- **Complementary to CMMS:** Complements existing enterprise maintenance systems (SAP PM, IBM Maximo) by capturing diagnostic reasoning and sensory heuristics rather than replacing core work orders.
- **Offline-First PWA:** Operates seamlessly in basement boiler rooms, refinery pits, and offshore decks with zero connectivity.
- **Strict Two-Stage Hybrid Retrieval:** Combines ISO 14224 equipment graph filtering (hard constraint) with pgvector dense vector similarity (soft constraint).
- **Falsification-Based Guided Troubleshooting:** Tiers checks by Effort/Risk Ratio (Tier 1 visual → Tier 2 non-invasive → Tier 3 intrusive requiring supervisor sign-off).
- **Human-in-the-Loop Verification Gate:** Strictly quarantines unverified cases to prevent knowledge-base poisoning.

---

## 4. Expected Business Value & Pilot KPIs

- **Faster Diagnosis:** Measurable reduction in MTTR and MTTD by surfacing relevant historical cases instead of starting from zero.
- **Reduced Repeat Failures:** Reusing verified troubleshooting paths and RCA findings.
- **Accelerated Onboarding:** Junior technicians inherit real plant operational history.
- **Reduced Expert Dependency:** Preserving critical knowledge across retirements, transfers, and shift gaps.
- **Compounding Organizational Asset:** Case history value compounds as verified cases accumulate over time.
