# M09 Data Quality Report

**Method:** offline parse of the project's SQL files (`python -m m09.run_audit project data`, log in `reports/audit_run_log.txt`).
**Scope limit:** this checks the *files*. No PostgreSQL was available, so nothing here says what is in a live database.
**Data source note:** the uploaded M09 ZIP contained only earlier M09 reports/CSVs. The case, step and taxonomy SQL came from the
backend-database ZIP uploaded earlier in this conversation (the same files the earlier M09 report cites).

## 1. Counts (confirmed from the files)
| Item | Result |
|---|---|
| Cases | **50** (17 pump, 17 motor, 16 compressor), all `case_reference` unique |
| Diagnostic steps | **350**, exactly 7 per case, numbered 1-7, tier pattern 1,1,1,2,2,2,3 (150 / 150 / 50) |
| Equipment models | 19 (7 compressor, 6 motor, 6 pump), all `is_illustrative = TRUE`; every case model exists; every model is used (1-4 cases each) |
| Taxonomy / vocabulary / sources | 30 / 29 / 14; no duplicate keys; every taxonomy code and failure-mode id a case uses exists; every source id exists |
| Case-source links implied | 286 |
| Spare parts | 80 after M09 fix (81 in the original; one was a placeholder) |

The earlier M09 report's numbers (11 blank components, 15 depth flags, 50/50 placeholder acceptance text, 141 generic steps) were
re-derived independently and **all match**.

## 2. Missing fields and placeholders
| Finding | Evidence | Status |
|---|---|---|
| `component_name` blank in 11 cases | PUMP-010/011/012, MOT-004/007/010/017, COMP-006/007/010/016 | **Open.** These same 11 also have no taxonomy code and a subsystem label outside the approved list, so nothing in the data supports a value. Not invented; listed in `data/m09_expert_review_queue.csv`. |
| `acceptance_criteria` identical in all 50 cases | one value: "within OEM specification or approved site baseline (source ... not stated in this workbook)" | **Open placeholder.** Not a limit. Needs a real OEM/site source per case. |
| Generic wording "Per OEM / site procedure" in measurement point | 141 of 350 steps (all Tier 2; 0 Tier 1) | **Open.** Needs asset-specific points/units. |
| Spare part row `None typically` + link to CASE-COMP-002; link `None` for CASE-COMP-006 | Step4_4 and Links files | **Fixed in the files** (rows removed). COMP-006 needs no spare per its own text. |
| All 50 cases: illustrative context, no recorded readings, reliability D | `operating_status`, `source_reliability` | Info. Consistent with synthetic data. |
| 15 cases `needs_depth_expansion = TRUE` | MOT-011/012/015, COMP-002/004/006/007/009/010/011/012/013/014 and others | Info (already flagged by authors). |
| No blank values in any other required case or step field | checked all case fields and all 14 step fields | Pass. |

## 3. Duplicates
- Exact duplicate symptom texts: **0**.
- Same-class near-duplicates (token Jaccard >= 0.6 on symptom + suspected cause): **0** (highest same-class pair 0.30).
- Cross-class pairs >= 0.6: none; highest is MOT-013 vs COMP-007 at 0.50 (loose mounting bolts), which is a plausible theme overlap, not a duplicate.
- Limit: lexical overlap only. Semantic near-duplicates in Hinglish text would need embeddings or human review.

## 4. Taxonomy and subsystem mapping
- 21 distinct subsystems, 23 class-subsystem pairs (pump 7, motor 8, compressor 8). All still `PENDING_REVIEW`.
- Taxonomy consistency: for the 39 cases that have a taxonomy code, class, subsystem and component all equal the taxonomy row. **0 mismatches.**
- **Original defect (confirmed):** Step 4.5 never sets `subsystem_id`, so FK resolution was 0/50 (also seen in the saved `step5_validation_output.txt`).
- **Fix:** `project/sql/m09/m09_010_resolve_subsystem_fk.sql` sets it only on an exact label match against a subsystem valid for the case's class.
  Result on the file data: **39 resolve, 11 stay NULL** (pump 3, motor 4, compressor 4). SQLite emulation of that exact UPDATE agrees (39/11, valid for the composite FK, idempotent).
  Not yet run on PostgreSQL.
- The 11 unresolved labels (need a Group 1 decision; no guess made): Impeller and casing; Impeller and drive assembly; Motor protection and pump system;
  Starter circuit and motor supply; Motor and overload protection; Variable-frequency drive and motor; Coupling; Pressure control system;
  Drive assembly and compressor element; Drive coupling and motor; Controls and Instrumentation.
- `measurement_reference`: 147 rows, 32 with no taxonomy code (known gaps, preserved by the authors).

## 5. Asset-model coverage
19 illustrative models, all brand + series strings flagged illustrative; no literal placeholders (TBD/XXX). A few are generic series names
(for example "Schneider Process Motors", "Ebara 3M Series"); they are not verified against any manufacturer catalogue and must stay labelled illustrative.
Demo assets (`seed_data/020`): 1 site + pump/motor/compressor (4 rows). Cases keep `asset_id` NULL by design (synthetic).
Original defect: 020 used model UUIDs that existed only in the author's database. Fixed (looks models up by class + designation).

## 6. Safety and lifecycle checks (files)
| Check | Result |
|---|---|
| Every case imported as `DRAFT` + `demo_only_until_expert_review`, `is_synthetic` and `model_is_illustrative` TRUE | Pass |
| Every Tier-3 step has `supervisor_approval_required = TRUE` and mentions LOTO/lock-out | Pass (50/50) |
| Verification rows: reviewer/date NULL, all decisions PENDING | Pass (50/50) |
| No script marks any case VERIFIED / eligible | Pass |
| Safety procedures are class-specific | **Weak.** All 14 are general (class NULL), so every case links to all 14 (700 links). Not wrong, but not case-specific. |
| Semantic safety review of step wording | **Not done.** Needs an expert. |
| Original contradiction between docs: README/`validate_step5.sql` expected SUBMITTED, import loads DRAFT | **Fixed** in `validate_step5.sql` (now expects DRAFT). Project README assumption 2 still mentions SUBMITTED (not edited; owned by another module). |

## 7. What this report cannot tell you
Live row counts, whether the scripts execute on PostgreSQL, whether RLS behaves with the new views, industrial correctness of any
symptom/cause/measurement, and whether the 11 open cases map to any approved subsystem.
