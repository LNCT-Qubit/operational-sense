# M08 Audit Report — Operational Sense Backend/Database ZIP

Scope: what the uploaded `Operational_Sense_Backend_Database.zip` actually contains, as it affects **M08 — Embedding Strategy & Retrieval Readiness**.
Method: extracted the ZIP and read the files. Nothing was assumed from earlier conversations.

Legend: **[V]** verified by reading the file or running a command here · **[D]** claimed in a project document but *not* re-verified here · **[A]** assumption/inference.

## 1. Environment used for this audit
| Item | Result |
|---|---|
| Python | 3.12.3 [V] |
| Installed: `python-dotenv`, `numpy` | yes [V] |
| NOT installed: `psycopg`, `pgvector`, `sentence-transformers`, `torch`, `pytest` | [V] |
| PostgreSQL / `psql` / Docker | not available [V] |
| Network (pip, model download) | disabled [V] |

Consequence: a real embedding model and a live PostgreSQL/pgvector database could **not** be run. See "Blocked items" in `M08_FINAL_REPORT.md`.

## 2. Structure [V]
The ZIP has a doubled top-level folder (`Operational_Sense_Backend_Database/Operational_Sense_Backend_Database/`), plus `__MACOSX` junk and a `.git` directory (branches `main`, `feature/m05-postgresql-schema`; one commit "Implement PostgreSQL Schema & Constraints"). Project root contents:

- `migrations/001…007_*.sql` (extensions, taxonomy, reference, hierarchy/assets, cases, historical_case vector, RLS)
- `seed_data/010_seed_reference_from_m06.sql`, `020_seed_asset_hierarchy.sql`
- `Operational_Sense_Step4_*.sql`, `step4_01_import_sources.sql` (workbook imports at the project root)
- `scripts/` (`migrate.sh`, `seed.sh`, `verify_pgvector.sql`, `test_schema.sql`, `validate_step5.sql`, `check_step4.sql`, `load_steps_links_verification.sql`)
- `retrieval/` (`config.py`, `db.py`, `check_connection.py`, `text_builder.py`) and `tests/test_text_builder.py`
- `documentation/`, `schema/current_schema_snapshot.sql`, `docker-compose.yml`, `requirements.txt`, `README.md`, `.gitignore`
- `diagrams/` is empty.

There is **no application entry point** (no web app/API). The only runnable Python entry point was `python -m retrieval.check_connection`.

## 3. Database facts relevant to M08
**`operational_case` (005)** [V]: `case_id` UUID PK; `case_reference` unique per organisation; `organization_id`; `equipment_class_id` (EQ-PUMP, EQ-MOTOR, EQ-COMP); `subsystem_id` (nullable, composite FK to `class_subsystem`) plus `subsystem_source_label`; `component_name`; symptom fields (`symptom_text` NOT NULL, `symptom_structured`, `symptom_category`, `operating_status`, `symptom_frequency`); cause/action fields; `is_synthetic`; `source_reliability` (A–D).
**Status rules** [V]: `case_status` ∈ DRAFT, SUBMITTED, VERIFIED, REJECTED, REVOKED (default DRAFT). `retrieval_eligibility` ∈ `demo_only_until_expert_review` (default), `eligible`, `excluded`.
**`historical_case` (006)** [V]: `case_id` PK (one row per case), `organization_id`, `equipment_class_id`, `subsystem_id`, `equipment_model_id`, `status`, `embedding vector(384)` (nullable), `promoted_at`. Comments in the file call 384 a **placeholder** that M08 must confirm, and say the vector index is to be created later. Index `idx_hc_strict (class, subsystem, status)` exists; no vector index.
**RLS (007)** [V]: `operational_case` and `historical_case` have tenant policies on `app.current_org_id`; the app role `opsense_app` has SELECT, INSERT, UPDATE (no DELETE); `audit_log` is insert/select only. The retrieval code must therefore run through `db.tenant_connection()`.
**Seed data** [V]: 50 synthetic cases (17 PUMP, 17 MOT, 16 COMP) in `Operational_Sense_Step4_5_Import_Operational_Cases.sql`; **all** are `DRAFT` + `demo_only_until_expert_review`, `is_synthetic = TRUE`. `subsystem_id` is left NULL for all of them (original wording in `subsystem_source_label`). In the ~14 cases I read in full, technician `symptom_text` is romanised Hinglish and `symptom_structured` is English (the other cases were not all read in full).
**Project docs claim** [D]: pgvector 0.8.7 installed, zero `historical_case` rows and zero embeddings at the time of that document.

## 4. Existing retrieval code and tests
- `retrieval/text_builder.py` [V]: builds deterministic text from symptom-side fields only (symptom text, summary, component, category, status, frequency); deliberately **excludes** cause, repair, acceptance fields to avoid leakage; strips the "(illustrative…)" marker. Returns `None` if no symptom text. Reused unchanged by M08.
- `retrieval/config.py` / `db.py` [V]: read `.env`; require `POSTGRES_DB`, `OPSENSE_APP_PASSWORD`, `OPSENSE_ORG_ID`; connect as `opsense_app`; `tenant_connection()` sets the org per transaction. Reused unchanged.
- `retrieval/check_connection.py` [V]: read-only health check, prints the embedding column type.
- `tests/test_text_builder.py` [V]: 7 `unittest` tests.
- **Nothing** existed for embedding generation, vector storage, or similarity search.

### Commands run on the ORIGINAL code and actual results
```
cd <project root>
python3 -m unittest discover -s tests -v
→ Ran 7 tests in 0.000s — OK
```
`python -m retrieval.check_connection` was **not** run (needs PostgreSQL).

## 5. Findings, risks and inconsistencies
1. **No case is currently eligible as trusted evidence.** All 50 seed cases are DRAFT/demo-only. A search that returns only trusted cases returns nothing until a human review promotes cases (`VERIFIED` + `eligible`). M08 therefore adds an explicit, off-by-default `--include-demo` mode whose results are flagged `DEMO_UNVERIFIED`. *Needs team approval.*
2. **"Trusted" is not defined by the schema.** The schema lists the allowed values but not which combination means trusted. M08 uses the strictest reading (`VERIFIED` AND `eligible`). It also does not require an `APPROVED` row in `case_verification` — **open question**.
3. **No promotion/sync process** populates `historical_case` from `operational_case` or keeps `historical_case.status` in sync. M08's pipeline writes/refreshes rows for eligible cases and search ignores rows whose copied status differs. Who owns promotion (`promoted_at`) is not stated anywhere in the ZIP.
4. **Subsystem filter is currently unusable** because every seed case has `subsystem_id` NULL (pending Group 1 mapping). Class filters work.
5. **A `.env` file is inside the ZIP.** It contains three keys (`POSTGRES_USER`, `POSTGRES_PASSWORD`, `POSTGRES_DB`); values were not printed or packaged. It is git-ignored and was never committed (checked history). A boolean-only check showed the password is a short, common default word identical to the username, i.e. a local-Docker default rather than a strong secret; still, do not share the file, and do not reuse that password anywhere outside local development.
6. The `.env` in the ZIP **lacks** `OPSENSE_APP_PASSWORD` and `OPSENSE_ORG_ID`, which `retrieval/config.py` requires. Each developer must add them locally (see `.env.example`).
7. `migrations/007` creates `opsense_app` with a hard-coded **development** password in the SQL (the file says local-use-only). Not reproduced here. Change it for any shared environment.
8. `migrations/005` mentions "see 008" but no `008` migration exists. `scripts/load_steps_links_verification.sql` also expects a `008_loader_columns.sql` migration and a `seed_data/020_seed_group1_reference.sql` that are absent (the real `020` is `020_seed_asset_hierarchy.sql`). That script appears stale. **The full data-load order is not documented**; the order in the setup guide is inferred ([A]).
9. README says the schema was "not yet run against a live database by its author"; later documents in `documentation/` show validation output [D]. Treat the schema as only partly verified.
10. `requirements.txt` lists `pgvector` (Python package) but no code used it. M08 passes vectors as text cast with `::vector`, so it is not needed (left in place).
11. Language: technician text is romanised Hinglish, which needs a multilingual model and is a known weak spot for many models. No measured quality exists yet.
12. Dimension 384 is a placeholder; **no embeddings exist**, so choosing a model with 384 dimensions needs no schema change.

## 6. Compatibility constraints followed
Migrations 001–007 were **not** modified. `text_builder.py`, `config.py`, `db.py`, `check_connection.py` and the existing test were **not** modified. The only existing file changed is `requirements.txt` (one dependency appended). A schema addition is offered only as a **proposal**: `proposals/M08_proposal_historical_case_embedding_metadata.sql`.

## 7. Dependencies on other people
Verified from the ZIP: **M05** (schema owner; README is "M05 working folder"), **M06** (equipment hierarchy/reference seed), **M04** (ERD v1.2 referenced), **Group 1** (workbook, 50 cases, subsystem mapping, expert review). `README.md` and `006` explicitly say **M08 decides the embedding dimension**.
**M07 and M09 are not mentioned anywhere in the ZIP**, so no dependency on them is claimed.
Needed from others: expert review/promotion of cases (Group 1 / reviewers); approval of the "trusted" definition and demo mode (M05/team lead); approval of the proposed schema columns (M05); subsystem mapping (Group 1/M06).
