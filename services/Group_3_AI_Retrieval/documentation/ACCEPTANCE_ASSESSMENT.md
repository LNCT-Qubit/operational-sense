# Final acceptance matrix (Group 3 Final)

PASS = demonstrated by an executed check · PARTIAL = done, part open or only checked offline/on a scratch DB · NOT VERIFIED = written, never executed or not performed · FAIL = not met. **The package as a whole is PARTIAL**: required criteria 13 (on the target Docker image), real-model inference, 14 and 15 remain open.

| # | Criterion | Result | Evidence / reason |
|---|---|---|---|
| 1 | Canonical schema consistency | **PASS** | `canonical_schema.json` 1.0.0; 50 cases: 0 errors, 33 warnings (known gaps); validator tests |
| 2 | M07 / M08 / M09 compatibility | **PARTIAL** | JSON -> DB mapping, text, metadata, live repository SQL agree (tests + live check); M07's own original deliverable is absent (schema derived from the DB model) |
| 3 | 50-case dataset integrity | **PASS** | 50 cases / 350 steps, unique IDs, round-trip vs SQL, DB == JSON live (0 mismatches), no duplicates |
| 4 | Equipment coverage | **PASS** | pumps 17, motors 17, compressors 16 |
| 5 | Subsystem and taxonomy mapping | **PARTIAL** | 0 INVALID; 40/50 subsystems (39 exact + 1 provisional), 39/50 components and taxonomy codes; 10/11/11 unresolved with reasons and reviewers; 13 ambiguous cross-links; Group 1 review pending |
| 6 | Diagnostic quality | **PARTIAL** | 127 suggested locations (labelled), 14 pending, 50 case-specific pending acceptance texts, 13 isolation warnings, 14 Tier-3 rewrites; **no OEM values, limits or approved procedures exist**; expert/OEM verification required |
| 7 | Embedding configuration consistency | **PASS** (config) / **NOT VERIFIED** (real model) | 384 across model config, code, `vector(384)`, validation, SQL, tests, docs; mock/real separation enforced in code and by DB CHECKs (live); real returned dimension **NOT EXECUTED** |
| 8 | Metadata filtering | **PASS** | class/subsystem/taxonomy filters executed live (`live_pg_check`) and in unit tests |
| 9 | Trusted / demo lifecycle separation | **PASS** | 7 new tests + live: trusted 0 results, demo 3 labelled `DEMO_UNVERIFIED`; no lifecycle state changed |
| 10 | Evaluation readiness | **PARTIAL** | dataset validated (17 queries) and metric functions tested on controlled rankings; **no real benchmark, no baseline, no improvement claim** |
| 11 | Security and RLS | **PARTIAL** | no committed password; role not SUPERUSER/BYPASSRLS; USING/WITH CHECK present; cross-tenant SELECT/INSERT/UPDATE blocked; login fail-closed — all executed on a **scratch** PostgreSQL, not on the Docker image; no security certification |
| 12 | Automated test results | **PASS** | 270 passed, 3 skipped (live-DB tests, need OPSENSE_LIVE_PG=1; 15/15 of the new module pass with it), 0 failed (baseline 214) |
| 13 | Live PostgreSQL / pgvector verification | **PARTIAL** | PostgreSQL 16.15 + pgvector 0.8.0 (source build) executed everything except Docker scripts, psycopg path and real vectors |
| 14 | Expert review status | **NOT VERIFIED** | no expert review; all cases DRAFT / demo-only |
| 15 | Independent QA status | **NOT VERIFIED** | Group 4 QA not performed |

Pending: Group 1 (mappings, locations), Group 2 (migration 008, trusted definition, outcome column), Group 4 (QA, Docker run), industrial expert (all cases), OEM manuals (limits, acceptance values, Tier-3 instructions). This is not a claim of a diagnostic AI engine or production readiness.
