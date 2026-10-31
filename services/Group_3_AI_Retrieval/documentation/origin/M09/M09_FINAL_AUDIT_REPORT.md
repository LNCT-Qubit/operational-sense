# M09 Final Audit Report - Synthetic Case Quality and Retrieval Readiness

## 1. Exact task status: **PARTIAL**
Offline data/schema work is done and tested. Everything that needs PostgreSQL, M08, embeddings or the evaluation set is **BLOCKED / NOT VERIFIED**.
The official acceptance-criteria list was **not supplied** (only the task description), so no completion percentage can be computed reliably.

## 2. Inventory: what actually existed
| Item | Found? |
|---|---|
| Uploaded `Operational_Sense_M09_Deliverables.zip` | 7 files: earlier M09 report, 2 audit CSVs, summary JSON, evidence note, 2 templates. **No case data, SQL, code, tests or evaluation files.** |
| Case/step/taxonomy SQL, migrations, seeds, validation scripts | Not in the M09 ZIP. Taken from the backend-database ZIP uploaded earlier in this conversation (the files the earlier M09 report names). |
| M08 retrieval source, `evaluation/m08_eval_dataset.json`, baseline code | **Missing** (referenced by the earlier report, never supplied) |
| M07 schema source | Missing; only migrations 001-007 and a schema-only `pg_dump` snapshot |
| Official acceptance criteria | Missing |
| PostgreSQL, Docker, pgvector, embedding model, network | Not available in this environment |
The earlier M09 report's numbers were re-derived and match (50 cases, 350 steps, 11 blank components, 15 depth flags, 141 generic steps, 0 subsystem FKs).

## 3. Findings
| ID | Severity | Finding (evidence) | Outcome |
|---|---|---|---|
| F1 | High | `subsystem_id` never set by Step 4.5 -> 0/50 resolved; strict class+subsystem filter could not work | Fix file `m09_010`: 39 resolve, 11 stay NULL. **Not run on PostgreSQL** |
| F2 | High | No script creates organization `b2a7dce7...`; fresh load fails on the FK | Fixed: `seed_data/005_...` |
| F3 | High | `seed_data/020` hard-coded 3 model UUIDs that exist only in the author's DB; runs before models exist | Fixed: models created/looked up by class + designation |
| F4 | High | Spare-part join on non-unique `part_name`: 100 intended links -> 120 rows (cross-case links); placeholder part `None typically` and link `None` loaded as spare parts | Fixed in files: case-specific join, placeholders removed -> 98 links |
| F5 | High | No master load order; `seed.sh` runs only 010/020; `scripts/load_steps_links_verification.sql` needs a non-existent column `reference_ids`, migration 008 and two absent seed files | Added `scripts/load_all_m09.sh`; stale file marked DO NOT RUN (kept, not deleted) |
| F6 | Medium | Docs disagree on status: README and `validate_step5.sql` expect SUBMITTED, import loads DRAFT | `validate_step5.sql` now expects DRAFT. Project README assumption 2 not edited |
| F7 | Medium | No DB guard stopping an unreviewed case from being marked retrievable; no trusted/demo entry points | Optional `m09_020_retrieval_guards.sql` (CHECKs + `security_invoker` views). **Not run** |
| F8 | Medium | 11 cases: blank component, no taxonomy code, subsystem label not approved | **Open.** Not inferable from the data; `data/m09_expert_review_queue.csv` |
| F9 | Medium | Acceptance criteria identical placeholder in 50/50 cases; 141 Tier-2 steps use generic measurement-point wording | **Open**, flagged only (values would be invented) |
| F10 | Medium | All 14 safety procedures are class-NULL -> every case links all 14 (700 links) | **Open**, flagged |
| F11 | Low | 15 depth-expansion flags; all sources reliability D | Info |
| F12 | Blocker | M08 code, eval dataset, DB, embeddings unavailable | **BLOCKED / NOT VERIFIED** |
Not changed: migrations 001-007, RLS policies, tenant isolation, the case/step/taxonomy data content, any case status. No existing data deleted.
The uploaded backend ZIP also contained a `.env` and `.git` history; both are excluded from this package.

## 4. Tests actually run (all in this environment, Python 3.12, stdlib only)
| Command | Result | What it proves |
|---|---|---|
| `python -m unittest discover -s tests -t . -v` | **53 tests, OK** (`reports/test_run_log.txt`) | below |
| `tests/test_data_quality.py` (11) | pass | counts 50/350, unique ids, class split, 7 ordered steps, tier pattern, Tier-3 approval+LOTO, taxonomy/vocab/source references, models, no near-dups, 39/11 split, open gaps stay reported |
| `tests/test_lifecycle_and_retrieval_prep.py` (16) | pass | all imported cases excluded from trusted retrieval; demo needs opt-in; draft cannot become trusted; REJECTED/REVOKED never; missing metadata fails closed; NULL subsystem never matches; documents labelled synthetic, 50 build, no invented component; result text says "not a diagnosis"; empty results safe |
| `tests/test_metrics.py` (9) | pass | Recall@3, MRR, improvement arithmetic and eval-dataset validator on toy values |
| `tests/test_sql_logic.py` (7) | pass | the fixed subsystem UPDATE and spare join, **run on SQLite** with the real data: 39/11, valid for the class, idempotent; 98 case-specific links; original join fans out; quotes/BEGIN-COMMIT pairing; `bash -n`; load order respects foreign keys |
| `tests/test_regressions.py` (10) | pass | one test per fix F1-F7 plus no secrets in package |
| `bash -n` on migrate.sh, seed.sh, load_all_m09.sh | OK | shell syntax only |
| `python -m m09.run_audit` on the **original** files | 4 FAIL (Q05, Q15, Q21, Q22) | the checks detect the defects; on the fixed files only Q05 (the open expert-review gap) fails |
**Limits:** SQLite is not PostgreSQL. No PostgreSQL syntax check, constraint/RLS/view test, pgvector test or load order execution happened.

## 5. Remaining dependencies
M08 source and its evaluation file; a PostgreSQL 16 + pgvector instance (Docker is the project's documented route; steps in `README_M09.md`);
the official acceptance criteria; Group 1 decisions for the 11 unresolved subsystem labels and missing components; expert review of
acceptance criteria, measurement points and safety wording; an embedding model decision (M08, `vector(384)` is a placeholder).

## 6. Criteria status
| Area | Label |
|---|---|
| 50 cases / 350 steps present in files | COMPLETE (files only) |
| Structure, FK/taxonomy consistency, lifecycle flags in files | COMPLETE (files only) |
| Subsystem FK mapping | PARTIAL (fix written; 39/11; live run pending) |
| Missing components, placeholders, generic steps | PARTIAL / open (expert input needed) |
| Seed/import order | PARTIAL (derived and statically tested; never executed) |
| Trusted retrieval protected from unreviewed cases | PARTIAL: data and helper tests pass; DB guard unexecuted; M08 enforcement NOT VERIFIED |
| Live DB counts, FK checks, RLS | NOT VERIFIED |
| M08 integration | BLOCKED |
| Embeddings and vector search | NOT VERIFIED |
| Recall@3 / MRR; >35% improvement target | NOT VERIFIED (nothing measured; target only) |

## 7. Direct answers
1. **Complete per official criteria?** No: PARTIAL. The official list was not supplied.
2. **Percentage?** Cannot be determined reliably.
3. **Fixed:** F1-F7 in the files (subsystem FK mechanism, organization seed, asset seed UUIDs, spare-part join and placeholders, load order, validation expectations, optional guards), plus tests and reports.
4. **Tests passed:** the 53 offline tests above and the three `bash -n` checks.
5. **Ready for demo retrieval?** Structurally yes, labelled as synthetic and only with explicit opt-in; unverified on a live DB and M08. 11 cases cannot strict-match a subsystem.
6. **Trusted retrieval protected?** In the data and helpers, yes (0 eligible). Not verified in M08 or the live DB.
7. **Embeddings/vector verified?** No.
8. **Recall@3 / MRR measured?** No.
9. **Left for you:** run `README_M09.md` Part B on PostgreSQL and fix any failure; supply M08 source and the eval JSON; get the 11 subsystem decisions and expert review; clean the live DB if it was loaded with the old scripts (it holds 120 spare links and the `None typically` row; I deleted nothing).
10. **Report as complete?** No. Honest status: PARTIAL; offline work done and tested; live-database, M08, embedding and metric parts NOT VERIFIED/BLOCKED.
