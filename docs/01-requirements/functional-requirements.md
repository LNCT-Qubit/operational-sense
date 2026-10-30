# Functional Requirements (FR)

*Operational Sense — Team Qubit (EPAM × LNCT Center of Excellence Program)*

---

### Module 1: Offline-First Incident Capture
- **FR-01 (Voice Recording):** The PWA shall allow technicians to record audio notes of up to 30 seconds using the HTML5 MediaStream Recording API.
- **FR-02 (Offline Persistence):** Audio blobs, textual observations, client timestamps, and equipment barcode/identifiers shall be stored locally in IndexedDB before any network transmission.
- **FR-03 (Client Idempotency):** Each capture shall be assigned a client-generated UUID (`client_capture_id`) to ensure exactly-once ingestion upon synchronization retries.
- **FR-04 (Background Synchronization):** The PWA Service Worker shall automatically detect network restoration and flush queued captures to the backend ingestion endpoint.

---

### Module 2: Ingestion & Speech-to-Structured-Text
- **FR-05 (Audio Transcription):** The backend shall transcribe synchronized audio payloads via a Whisper speech-to-text pipeline (Whisper API or local Whisper.cpp).
- **FR-06 (Structured Extraction):** An LLM extraction prompt shall parse transcribed colloquial observations (including Hinglish/slang) into structured fields: symptom category, acoustic descriptors, operating context, suspected cause, and suggested check.
- **FR-07 (Technician Confirmation):** Technicians shall be presented with the extracted structured draft for verification or manual adjustment before submission.
- **FR-08 (Performance SLA):** A 20-second audio note shall be synced and parsed into structured JSON within 5 seconds of reconnecting.

---

### Module 3: Two-Stage Hybrid Retrieval
- **FR-09 (Graph Filter - Hard Constraint):** The retrieval engine shall deterministically filter candidate cases by `organization_id`, exact `equipment_class_id`, `subsystem_id`, and `status = 'VERIFIED'`.
- **FR-10 (Dense Vector Search - Soft Constraint):** The system shall compute pgvector cosine distance (`<=>`) over embedded symptom text and acoustic observations within the filtered candidate set.
- **FR-11 (Result Capping & Citation):** The top 3 ranked cases shall be returned with exact citations of historical case references, recorded machine models, and confirmed causes.
- **FR-12 (Abstention Policy):** If no verified cases match the strict equipment class and subsystem, the system shall explicitly communicate that no historical cases exist rather than fabricating advice.

---

### Module 4: Falsification-Based Guided Troubleshooting
- **FR-13 (Safety Tier Classification):** Every suggested diagnostic check shall be categorized into Tier 1 (Zero-Risk Visual/Sensory), Tier 2 (Non-Invasive Measurement), or Tier 3 (Intrusive Action).
- **FR-14 (Effort/Risk Prioritization):** Suggested checks shall be ordered by Effort/Risk ratio, guiding the technician to falsify low-effort visual checks before intrusive actions.
- **FR-15 (Tier 3 Authorization Gate):** Tier 3 intrusive interventions shall require explicit supervisor digital authorization before execution, enforced at the application and database constraint levels.

---

### Module 5: Knowledge Verification & Integrity Gate
- **FR-16 (Quarantine of Unverified Cases):** All newly submitted cases shall enter as `DRAFT` or `SUBMITTED` with `retrieval_eligibility = 'demo_only_until_expert_review'` and remain quarantined from the retrieval index.
- **FR-17 (Supervisor Review Workflow):** Supervisors shall review submitted cases, verify supporting evidence, and approve, reject, or request revisions.
- **FR-18 (Audit Telemetry):** Every verification event shall log the reviewer's ID, review timestamp, and review duration (`verification_duration_seconds`) to detect and discourage rubber-stamping.
- **FR-19 (Revocation Support):** Verified cases found faulty upon post-repair verification can be marked as `REVOKED`, instantly excluding them from retrieval while preserving audit logs.

---

### Module 6: Multi-Tenant Security & Equipment Registry
- **FR-20 (Row-Level Security):** All database operations on tenant tables shall be scoped by `organization_id` using PostgreSQL Row-Level Security policies.
- **FR-21 (Equipment Registry):** Maintain an ISO 14224-aligned equipment hierarchy (Plant -> Area -> Equipment Class -> Equipment Model -> Asset Instance -> Subsystem -> Component).
