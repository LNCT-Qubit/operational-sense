# Expected Value & Pilot-Phase Success Metrics

*Operational Sense — Team Qubit (EPAM × LNCT Center of Excellence Program)*

## Business Value Drivers

1. **Faster Diagnosis:** Reduced mean time to resolution (MTTR) and mean time to diagnose (MTTD) by surfacing genuinely similar past verified cases instead of starting diagnostic investigations from zero.
2. **Reduced Repeat Failures:** Verified troubleshooting paths and root-cause analysis (RCA) findings get reused instead of re-investigated on each occurrence.
3. **Faster Onboarding:** Junior technicians inherit the plant's real empirical diagnostic history, rather than relying exclusively on generic equipment manuals.
4. **Reduced Expert Dependency:** Critical tacit knowledge survives attrition, employee transfers, and shift gaps instead of departing when senior personnel leave.
5. **Compounding Organizational Asset:** The verified case history grows more valuable, reliable, and defensible the longer the organization uses it.

---

## Pilot-Phase Evaluation Targets & Engineering KPIs

*All values below are proposed as pilot-phase KPIs to be measured against a real plant baseline — not pre-committed figures.*

| Metric / Target | Target Threshold | Baseline Benchmark & Evaluation Methodology |
|---|---|---|
| **Retrieval Recall@3** | **> 35% relative improvement** | Compared against standard PostgreSQL full-text search (`tsvector` / GIN index) on team-labeled colloquial/Hinglish technician queries. |
| **Mean Reciprocal Rank (MRR)** | **> 35% relative improvement** | Evaluated on the first relevant verified case rank using a top-3 cutoff. |
| **Offline Voice Capture & Sync** | **< 5 seconds** | A 20-second offline audio note parsed and structured into JSON within 5 seconds of reconnecting. |
| **Evidence Traceability** | **100% Citation** | Every recommendation surfaces exact historical case references, recorded model designations, and supporting evidence. |
| **Quarantine & Safety Gate** | **0 Unverified Leakage** | 100% of unverified cases remain quarantined; 100% of Tier 3 actions require explicit supervisor sign-off. |
