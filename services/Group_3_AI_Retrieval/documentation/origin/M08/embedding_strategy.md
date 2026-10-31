# M08 Embedding Strategy

**Status: PROVISIONAL — not approved by the team.** Nothing below has been validated with a real model run (no model could be downloaded or executed in the environment where this was written). Model facts (dimensions, token limits, licences, prefixes) are quoted from my memory of the public model cards and **must be re-checked on the model pages before approval**.

## 1. Selected model (provisional)
| Item | Choice |
|---|---|
| Provider | `sentence-transformers` (open-source library, model runs locally) |
| Model | `intfloat/multilingual-e5-small` |
| Dimensions | **384** — equals the existing `historical_case.embedding vector(384)`; **no schema change** |
| Similarity | **Cosine** (pgvector `<=>`); `similarity = 1 − cosine_distance` |
| Normalisation | Vectors are L2-normalised in Python before storage and before querying |
| Prefixes | **Required** by the E5 family: documents `passage: `, queries `query: ` |
| Max input | about 512 tokens (longer text is silently cut by the model) |

### Why this model
The project's constraints: multilingual input (romanised Hinglish + English), 50 short cases now and small data later, a student MVP that should run on a laptop without paid APIs or sending plant data to a third party, and a column already sized at 384.

| Option | Dim | Fits column | Multilingual | Hosted? | Main trade-off |
|---|---|---|---|---|---|
| **multilingual-e5-small** (chosen, provisional) | 384 | yes | yes (~100 languages) | local | Small model; romanised Hinglish quality unknown; needs prefixes |
| paraphrase-multilingual-MiniLM-L12-v2 | 384 | yes | yes | local | Short input limit (~128 tokens): longer cases would be cut; no prefixes |
| multilingual-e5-base | 768 | **no** (needs `ALTER`) | yes | local | Likely better quality, larger/slower, schema change |
| BGE-M3 | 1024 | **no** | yes | local | Strong multilingual model, long input, but large (~2 GB) and schema change |
| OpenAI `text-embedding-3-small` | 1536 (can be shortened) | only if shortened to 384 | yes | **hosted API** | Cost, API key, sends case text to a third party; not implemented here |
| all-MiniLM-L6-v2 | 384 | yes | **English-focused** | local | Poor fit for Hinglish |

Chosen because it is the only listed option that is multilingual, local, free, and already 384-dimensional. **That is a fit argument, not a quality result.** The evaluation runner exists to test it; if recall is poor the next candidates to try are multilingual-e5-base or BGE-M3, which require the dimension decision below.

## 2. Text construction
- **Documents:** `retrieval/text_builder.build_case_text()` (unchanged). Symptom-side fields only, fixed order and labels: symptom text → symptom summary → component → category → operating status → frequency. Cause, repair and acceptance fields are excluded on purpose (a new problem report cannot contain them, and including them leaks the answer). On the 50 seed cases the built text is about 26–81 words (205–568 characters, measured without the status/frequency fields), well inside 512 tokens.
- **Queries:** the technician's text as typed, with whitespace collapsed; empty/blank/non-text input is rejected; length limit `OPSENSE_MAX_QUERY_CHARS` (default 2000). Queries are **not** wrapped in the "Symptom (technician):" label format. Whether doing so helps is an open experiment, not a decision.
- Prefixes are added by `EmbeddingService`, not by `text_builder`, so the stored/readable text stays model-independent.

## 3. Retrieval behaviour
- Exact scan ordered by cosine distance, `LIMIT 3` (hard maximum 3), tie-break by `case_reference`. No vector index: with ~50 rows an exact scan is fast and exact. If an approximate index (HNSW) is added later, filtered queries can return fewer than 3 rows — retest then.
- **Filters:** `equipment_class_id`, `subsystem_id`, `equipment_model_id` (all optional). A subsystem filter excludes cases whose `subsystem_id` is NULL (schema assumption A7); the response warns about this.
- **No similarity cut-off by default.** Nearest-neighbour search always returns the nearest cases, even for an irrelevant query. A cut-off (`OPSENSE_MIN_SIMILARITY`) is supported but **no value is approved or invented**; pick it from evaluation results (queries Q16/Q17 are included for this).
- **Eligibility** (single definition in `retrieval/eligibility.py`): trusted = `VERIFIED` and `eligible`. Optional demo mode adds `DRAFT`/`SUBMITTED` + `demo_only_until_expert_review`, flagged `DEMO_UNVERIFIED`, with causes/actions/steps withheld. `REJECTED`, `REVOKED`, `excluded`, and any other combination are never returned.

## 4. Safety wording
Every response carries a notice: these are similar historical cases, not a diagnosis; similarity does not show that cause or action transfers; any action needs supervisor approval and site safety procedures (isolation/LOTO). Historical suspected cause and corrective-action text appear **only** for trusted cases and are labelled as historical/unconfirmed. Diagnostic steps (optional) come from the case's own `troubleshooting_step` rows, including their `safety_warning` and `supervisor_approval_required`. Nothing is presented as an automatically safe action.

## 5. Model tracking and re-embedding
`historical_case` has **no column** for model name or text version. M08 therefore records `model`, `dimension`, counts and flags in one `audit_log` row (`action = 'EMBEDDING_RUN'`) per run — an existing table, no migration. Limitation: this cannot mark individual rows stale.
**Rule:** all vectors in the table must come from the same model, prefixes and text format. After changing any of them, re-run `python -m retrieval.embed_cases` for every eligible case (it overwrites in place). Mixing old and new vectors gives meaningless rankings.
**Proposal (not applied):** `proposals/M08_proposal_historical_case_embedding_metadata.sql` adds three nullable columns (`embedding_model`, `embedding_text_sha256`, `embedded_at`).

## 6. Changing the dimension (needs approval)
The code never alters the column. `embed_cases` compares `OPSENSE_EMBEDDING_DIM` with the real column type and stops with an error on mismatch; the model's actual vector length is also checked. To move to a 768/1024-dimension model **before any vectors exist** (the migration 006 note): `ALTER TABLE historical_case ALTER COLUMN embedding TYPE vector(<N>);`, then set `OPSENSE_EMBEDDING_DIM`. If vectors already exist, clear them first and re-embed. This is a schema change owned by M05.

## 7. Dependencies and configuration
`sentence-transformers>=2.7` (pulls in PyTorch; the model, a few hundred MB, downloads on first use and needs internet once). Existing: `psycopg[binary]`, `python-dotenv`. Variables (see `.env.example`): `OPSENSE_EMBEDDING_PROVIDER`, `OPSENSE_EMBEDDING_MODEL`, `OPSENSE_EMBEDDING_DIM`, `OPSENSE_EMBEDDING_QUERY_PREFIX`, `OPSENSE_EMBEDDING_DOCUMENT_PREFIX`, `OPSENSE_EMBEDDING_BATCH_SIZE`, `OPSENSE_MAX_QUERY_CHARS`, `OPSENSE_MIN_SIMILARITY`. Only the `sentence-transformers` provider is implemented; any other value gives a clear error.

## 8. Privacy, cost, language, limitations
- **Privacy:** the local model sends no case text to external services (only the one-time model download uses the network). A hosted provider would send text out; it is deliberately not implemented. Use synthetic data only unless real data is authorised.
- **Cost:** no API fees; CPU is enough for 50 cases; first run is slow because of the download.
- **Language:** romanised Hinglish has no standard spelling; embedding quality on it is **unmeasured**. Mixed-script (Devanagari) input is untested.
- **Limits:** semantic similarity ≠ diagnosis; small synthetic data; expected IDs in the evaluation are the author's reading of synthetic cases, not expert ground truth; tests using fake embeddings prove mechanics only.

## 9. Decisions needed from the team
1. Approve (or replace) the embedding model and the 384 dimension.
2. Confirm the definition of "trusted" (VERIFIED + eligible), and whether an `APPROVED` `case_verification` row must also exist.
3. Approve or reject demo mode (`--include-demo`) for the MVP while all cases are DRAFT.
4. Approve the proposed metadata columns (M05).
5. Decide who promotes reviewed cases into `historical_case` and sets `promoted_at`.
6. Choose a similarity cut-off after the evaluation has actually been run.
