# Non-Functional Requirements (NFR)

*Operational Sense — Team Qubit (EPAM × LNCT Center of Excellence Program)*

---

### 1. Performance & Latency
- **NFR-01 (Offline-to-Online Sync):** An offline audio recording of 20 seconds shall sync and return structured JSON in < 5 seconds upon network reconnection.
- **NFR-02 (Hybrid Retrieval Latency):** Two-stage hybrid search (graph filtering + pgvector cosine similarity) shall execute in < 250 ms at p95 for a database of 100,000 cases.
- **NFR-03 (PWA Load Time):** First Contentful Paint (FCP) shall be < 1.5 seconds on a 3G mobile connection; subsequent visits shall load instantly from Service Worker cache.

---

### 2. Reliability & Offline Durability
- **NFR-04 (Offline Durability):** IndexedDB shall buffer pending voice recordings and observations with quota monitoring and storage persistence requests.
- **NFR-05 (Network Resilience):** The PWA shall handle intermittent 0–1 bar connections, dropped packets, and abrupt connection loss without corrupting local recordings.
- **NFR-06 (Idempotent Ingestion):** Re-sending a queued sync packet multiple times due to lost network ACKs shall produce exactly one logical case record.

---

### 3. Security, Privacy & Multi-Tenancy
- **NFR-07 (Database-Level Isolation):** Cross-tenant data leakage shall be prevented via PostgreSQL Row-Level Security (RLS) with 100% test pass rates on live tenant switching.
- **NFR-08 (Credential Protection):** API keys, JWT secrets, and database credentials shall never be exposed in client code, public Git branches, or client bundles.
- **NFR-09 (Audio Privacy):** Technician audio notes shall be encrypted in transit (TLS 1.3) and at rest, scoped strictly to the recording organization.

---

### 4. Retrieval Precision & Evaluation Quality
- **NFR-10 (Retrieval Superiority vs Baseline):** Hybrid retrieval shall achieve > 35% relative improvement in Mean Reciprocal Rank (MRR) and Recall@3 over standard full-text search (PostgreSQL GIN `tsvector`).
- **NFR-11 (Zero Hallucination Guarantee):** The system shall never generate synthetic operational guidance or recommend checks without citing verified historical cases.
- **NFR-12 (Safety Invariance):** Mathematical vector similarity scores shall never automatically modify or downgrade an action's safety tier.
