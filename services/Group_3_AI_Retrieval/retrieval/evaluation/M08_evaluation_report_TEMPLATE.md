# M08 Evaluation Report — TEMPLATE (blank; nothing here is a result)

Fill this in only from a real run of `python -m retrieval.evaluate --include-demo`
(the runner also writes `evaluation/reports/M08_evaluation_report.md` automatically).
Do not edit `evaluation/m08_eval_dataset.json` expected IDs after seeing results; record any proposed change below instead.

| Field | Value |
|---|---|
| Date / run by | |
| Dataset file sha256 | |
| Embedding model + dimension | |
| Prefixes used | |
| Database content (cases, how many embedded, demo mode?) | |
| Run status | COMPLETED / NOT RUN (reason) |

## Aggregate (queries with expected IDs)
| Hit@3 | Recall@3 | MRR |
|---|---|---|
| | | |

## Per query
| ID | Category | Expected | Actual top 3 (similarity) | Hit@3 |
|---|---|---|---|---|
| Q01 | near_exact | CASE-PUMP-002 | | |
| Q02 | near_exact | CASE-COMP-009 | | |
| Q03 | paraphrase_english | CASE-PUMP-002 | | |
| Q04 | paraphrase_english | CASE-PUMP-008 | | |
| Q05 | paraphrase_english | CASE-COMP-008 | | |
| Q06 | cross_equipment_context | CASE-MOT-006 | | |
| Q07 | cross_equipment_context | CASE-COMP-002, CASE-MOT-003 | | |
| Q08 | hinglish_variant | CASE-PUMP-005 | | |
| Q09 | hard_negative | CASE-PUMP-004 | | |
| Q10 | class_filter (EQ-MOTOR) | CASE-MOT-011 | | |
| Q11 | class_filter (EQ-COMP) | CASE-COMP-002, CASE-COMP-003 | | |
| Q12 | paraphrase_english | CASE-MOT-009 | | |
| Q13 | paraphrase_english | CASE-PUMP-016 | | |
| Q14 | hard_negative | CASE-COMP-003 | | |
| Q15 | paraphrase_english | CASE-MOT-016 | | |
| Q16 | irrelevant | none | | n/a (inspect similarity) |
| Q17 | irrelevant | none | | n/a (inspect similarity) |

## Notes for the team
- Highest similarity seen for Q16/Q17 vs lowest for correct matches (input for choosing `OPSENSE_MIN_SIMILARITY`):
- Failure analysis (which queries failed and why):
- Recommendation (keep model / try multilingual-e5-base or BGE-M3 / change text format):
- Limitations: expected IDs are the author's reading of synthetic cases, not expert-validated.
