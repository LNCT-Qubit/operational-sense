# FMEA Methodology

**FMEA & Failure Classification** · Epic 1 · Owner: Group 1
> Source workbook: [`services/backend/src/modules/taxonomy/G1_Failure_Mode_and_FMEA_Taxonomy_v1.0.xlsx`](../../services/backend/src/modules/taxonomy/G1_Failure_Mode_and_FMEA_Taxonomy_v1.0.xlsx)

## 1. Scope

Failure Mode and Effects Analysis (FMEA) is used here as a **knowledge-structuring method**, not as a formal plant risk assessment. It gives every troubleshooting case in the knowledge base a consistent skeleton:

> component → failure mode → effect → cause → corrective action

Coverage in v1.0: 3 equipment classes (centrifugal pump, three-phase induction motor, rotary screw air compressor), 10 failure modes each, 30 rows in total.

Reference method: **IEC 60812:2018** (FMEA/FMECA planning, performance, documentation). The standard is used as a reference for process and prioritisation concepts; full tailoring requires an authorised copy and expert approval.

## 2. FMEA record structure

Each row in the `FMEA_Taxonomy` sheet has 11 fields:

| # | Field | Content |
|---|---|---|
| 1 | Equipment Category | Pump / Motor / Compressor |
| 2 | Equipment Class | Specific machine type |
| 3 | Subsystem / Assembly | Functional block (e.g. Bearing Assembly, Air End) |
| 4 | Component / Maintainable Item | Replaceable part the failure is attributed to |
| 5 | Failure Mode | Name of the way the item fails |
| 6 | Failure Mode Description | Physical mechanism in one or two sentences |
| 7 | Failure Effect | **Local:** what is observed at the machine. **Plant:** consequence for the process and operation |
| 8 | Failure Cause | Typical root and contributing causes (semicolon-separated) |
| 9 | Corrective Action | Ordered technician actions, including verification after restart |
| 10 | Taxonomy Code / Reference | Project hierarchy code + ISO 14224 failure-mode abbreviation |
| 11 | Data Source / Reference | Standards, books and OEM manuals the row is based on |

### Writing rules used for v1.0

- One failure mode per row; mechanism, not symptom.
- Effects are always split into **Local** and **Plant** levels.
- Causes list several candidate causes, because the diagnostic value of a case is in telling them apart.
- Corrective actions are written as actions a technician can perform, and end with a verification step where relevant.
- Sources are cited at document level only.
- Every cell in every row is populated.

## 3. Prioritisation: severity, occurrence, detection

The `FMEA_Scoring_Guide` sheet defines a proposed 1–5 scale for three dimensions. The scale is a **proposed local scale – approval required**.

**Risk Priority Number (RPN)** = Severity × Occurrence × Detection (range 1–125).

### Severity

| Score | Label | Criterion |
|---|---|---|
| 1 | Negligible | No meaningful operational impact; no injury/environmental consequence; negligible repair. |
| 2 | Minor | Minor localized degradation; short planned intervention; no expected safety/environmental consequence. |
| 3 | Moderate | Partial function loss or production interruption requiring corrective maintenance; limited consequence. |
| 4 | Major | Major equipment or process interruption; substantial repair; credible safety/environmental or quality consequence requiring formal review. |
| 5 | Critical | Potential for fatality/serious injury, major environmental harm, catastrophic asset damage, or major production loss. Escalate regardless of RPN. |

### Occurrence

| Score | Label | Criterion |
|---|---|---|
| 1 | Rare | Demonstrably rare in a defined population and exposure period. |
| 2 | Uncommon | Infrequent; supported by relevant site/OEM/industry history. |
| 3 | Occasional | Has occurred sometimes in the defined operating context. |
| 4 | Frequent | Repeated occurrence in the defined operating context. |
| 5 | Very frequent | Recurring or persistent occurrence supported by records. |

### Detection

| Score | Label | Criterion |
|---|---|---|
| 1 | Almost certain detection | Existing automatic/interlocked monitoring reliably detects the condition early. |
| 2 | High detectability | Routine inspection or monitoring is likely to detect before functional effect. |
| 3 | Moderate detectability | Detection depends on planned checks or trend interpretation. |
| 4 | Low detectability | Condition is difficult to identify before functional effect; limited warning. |
| 5 | Very low detectability | No effective current control; likely to remain hidden until effect/failure. |

> **Rule:** Severity 5 (Critical) is escalated **regardless of RPN**. RPN alone must never suppress a high-severity item.

> **Detection direction:** a *higher* detection score means the condition is *harder* to detect (1 = almost certain detection, 5 = effectively hidden).

### Current state of scoring

The scales are defined, but **S / O / D scores have not yet been assigned** to the 30 rows; the `FMEA_Taxonomy` sheet has no score or RPN columns. Scoring needs site/OEM history for occurrence and agreed asset criticality (see Issue #3, Asset Criticality Framework) before numbers are entered. Do not infer scores from the descriptions.

## 4. Process

1. **Select equipment class** from `Equipment_Taxonomy`.
2. **Decompose** into subsystems and maintainable items.
3. **Identify failure modes** per item, using mechanism-level names.
4. **Describe effects** at local and plant level.
5. **List causes** and **corrective actions**.
6. **Assign taxonomy code** and ISO 14224 failure-mode abbreviation ([`iso-14224-mapping.md`](iso-14224-mapping.md)).
7. **Cite sources** for the row.
8. **Score** S/O/D and compute RPN *(not yet done in v1.0)*.
9. **Review**: domain expert validates the row against the cited source and promotes its status.

## 5. Validation status

| Status | Meaning | Rows in v1.0 |
|---|---|---|
| Engineering Assumption | Written from general reliability practice; not checked clause-by-clause | 30 |
| Verified | Checked against licensed standard / OEM manual by a reviewer | 0 |

Change a row to *Verified* only after the check. Until then, downstream artefacts (the 50-case knowledge base, retrieval evaluation) must not describe FMEA content as verified.

## 6. How the FMEA feeds the platform

| FMEA element | Used for |
|---|---|
| Equipment class, subsystem, component | Hard-filter stage of two-stage hybrid retrieval (before pgvector similarity) |
| Failure mode + ISO FM abbreviation | Case classification and cross-class comparison |
| Cause list | Candidate hypotheses for guided checks |
| Corrective action | Recommended action text, subject to risk-tiered checks and supervisor sign-off |
| Severity | Escalation and risk-tier input (Tier 1 visual / Tier 2 non-invasive measurement / Tier 3 intrusive, needs supervisor sign-off) |

## 7. Limitations

- Content is assumption-based and unverified (see §5).
- Occurrence and detection depend on site context; generic scores would be misleading.
- ISO 14224 is written for the petroleum, petrochemical and natural gas industries; applying it to general manufacturing assets is a **project extension** (see mapping document).
- The scoring scale has not been approved.

## 8. References

- **ISO 14224:2016** (ISO, 2016, Edition 3; confirmed current in ISO catalogue). Petroleum, petrochemical and natural gas industries; reliability and maintenance data collection/exchange. Use an authorized/licensed copy for detailed code-level mapping. <https://www.iso.org/standard/64076.html>
- **IEC 60812:2018** (IEC, 2018, Edition 3). FMEA/FMECA planning, performance, documentation and maintenance. Use an authorized/licensed copy for full methodology and tailoring. <https://webstore.iec.ch/en/publication/26359>
- Other row-level sources (ISO 281, API 610 / ISO 13709, API 682 / ISO 21049, API 619, ANSI/HI 9.6.x, IEEE Std 43, IEC 60034 series, NEMA MG 1, ISO 20816-1, ISO 21940-11, ISO 8573-1, and the cited books and OEM manuals) are listed per row in the workbook, column K. See also the Reference Register (Issue #6).
