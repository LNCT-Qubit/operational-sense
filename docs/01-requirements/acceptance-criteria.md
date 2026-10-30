# Acceptance Criteria

*Operational Sense — Team Qubit (EPAM × LNCT Center of Excellence Program)*

---

### Sprint 1: Schema, ISO 14224 Taxonomy & Synthetic Seed Corpus
- **AC-01 (Database Schema):** PostgreSQL 16 + pgvector schema deployed via 7 migrations (`001` through `007`).
- **AC-02 (Multi-Tenant RLS):** 11/11 automated Row-Level Security isolation tests pass on a live database, proving zero cross-organization read/write leakage.
- **AC-03 (ISO 14224 Taxonomy):** 3 core equipment classes (`EQ-PUMP`, `EQ-MOTOR`, `EQ-COMP`), 21 subsystems, and 30 component definitions loaded and queryable.
- **AC-04 (Curated Seed Corpus):** 50 curated historical operational cases and 350 diagnostic steps seeded, with all seed cases set to `retrieval_eligibility = 'demo_only_until_expert_review'`.
- **AC-05 (Safety Tier Constraint):** Database check constraint (`chk_tier3_needs_approval`) rejects any Tier 3 step where `supervisor_approval_required` is FALSE.

---

### Sprint 2: Offline-First Capture & Whisper Extraction
- **AC-06 (Offline Capture in IndexedDB):** Frontline technician can record a 20-second audio note and capture equipment barcode completely offline; stored durably in IndexedDB.
- **AC-07 (Background Sync SLA):** Upon network reconnect, queued payload syncs and parses via Whisper API / Whisper.cpp into structured JSON in < 5 seconds.
- **AC-08 (Idempotency):** Simulating network drops during sync does not create duplicate case rows (verified via `client_capture_id`).

---

### Sprint 3: Hybrid Search & Guided Verification Gate
- **AC-09 (Two-Stage Search):** Hybrid query filtering by exact equipment class and subsystem returns top 3 verified cases in < 250ms with exact machine model citations.
- **AC-10 (Zero-Leakage Quarantine):** Unverified cases (`DRAFT`, `SUBMITTED`, `REJECTED`, `REVOKED`) are 100% excluded from search results.
- **AC-11 (Supervisor Sign-Off):** Supervisor portal allows approval/rejection with mandatory review duration tracking (`verification_duration_seconds`).

---

### Sprint 4: Evaluation Benchmark vs. Keyword Baseline
- **AC-12 (Evaluation Corpus):** Labeled benchmark dataset of 20–30 industrial queries (including colloquial terms and Hinglish phrasing).
- **AC-13 (Benchmark Superiority):** Operational Sense hybrid retrieval demonstrates > 35% relative improvement in Mean Reciprocal Rank (MRR) and Recall@3 over PostgreSQL full-text search (`tsvector` / GIN index).
