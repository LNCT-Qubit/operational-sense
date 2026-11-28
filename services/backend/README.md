# Operational Sense Backend

Express + TypeScript backend for Operational Sense. This service includes public account registration and login, JWT-protected API routes, tenant-aware PostgreSQL persistence, and the recording/transcription/extraction pipeline.

## Authentication 

### Implemented flow

1. **Signup** — `POST /api/v1/auth/signup` accepts `name`, `email`, `password`, and `role` (`technician` or `supervisor`). The organization is selected by backend configuration (`SIGNUP_ORG_NAME`); the client cannot choose an organization or privileged role.
2. **Password storage** — passwords are hashed with bcrypt (`bcryptjs`, configurable `BCRYPT_ROUNDS`). Plaintext passwords and password hashes are never included in API responses.
3. **Login** — `POST /api/v1/auth/login` accepts `email` and `password`. The backend finds the account under PostgreSQL RLS, compares the bcrypt hash, and issues an HS256 JWT. Invalid email, wrong password, and inactive account all return the same generic 401 response.
4. **Authentication** — protected API routes require `Authorization: Bearer <token>`. The JWT verifier pins HS256, verifies the signature and expiry, and obtains user, organization, and role claims from the signed token.
5. **Authorization** — backend `requireRole(...)` middleware restricts endpoints by role. The web client additionally guards supervisor and technician routes to prevent accidental navigation into the wrong workspace. Backend checks remain authoritative.
6. **Logout** — the web client clears its in-memory session and redirects to `/`. The access token is not persisted in localStorage or sessionStorage. This is client-side logout for the current stateless JWT design: a copied token remains valid until its `exp` time (default 8 hours). Server-side immediate token revocation is not implemented.

### Database setup

Apply the migrations in order, including:

- `database/migrations/010_users.sql` — creates `app_user`, seeds the development `Demo Org`, and adds the restricted signup organization lookup.
- `database/migrations/011_login_lookup.sql` — adds the restricted email-to-organization lookup required to locate a user before establishing tenant context.

Run migrations as the database owner/migration role, not as `opsense_app`. Run the backend itself using the least-privilege `opsense_app` role; startup refuses superuser/BYPASSRLS connections.

### Configuration

Copy `services/backend/.env.example` to `services/backend/.env` and set at least:

- `DATABASE_URL` — application-role PostgreSQL connection string.
- `JWT_SECRET` — random secret of at least 32 characters. Keep it private and never commit `.env`.
- `GEMINI_API_KEY` — required by the existing extraction module at runtime.
- `SIGNUP_ORG_NAME` — must match an existing organization (development default: `Demo Org`).
- `BCRYPT_ROUNDS` — bcrypt cost (default 12; accepted range 10–15).
- `JWT_EXPIRES_IN_SECONDS` — JWT lifetime (default 28,800 seconds / 8 hours).

### API contracts

**Signup request**

```json
{ "name": "Asha Sharma", "email": "asha@example.com", "password": "StrongPass123", "role": "technician" }
```

**Login request**

```json
{ "email": "asha@example.com", "password": "StrongPass123" }
```

**Successful login response** (illustrative shape; token value is generated at runtime)

```json
{
  "message": "Login successful.",
  "access_token": "<signed-jwt>",
  "token_type": "Bearer",
  "expires_in": 28800,
  "user": { "id": "<uuid>", "name": "Asha Sharma", "email": "asha@example.com", "role": "TECHNICIAN" }
}
```

### Run and verify

From the repository root:

```bash
npm --prefix services/backend ci
npm --prefix services/backend test
npm --prefix services/backend run build
npm --prefix apps/web ci
npm --prefix apps/web run build
```

Start the backend with `npm --prefix services/backend run dev`. Start the web app in another terminal with `npm --prefix apps/web run dev`. The Vite development server proxies `/api` to `http://localhost:3000` by default; set `VITE_DEV_API_TARGET` if the backend runs elsewhere.

The backend test suite covers signup validation, bcrypt-hash handling through the hasher abstraction, login success/failure, JWT signing and verification, role middleware, and the HTTP login route. A live PostgreSQL environment is needed to verify the migrations and full database-backed signup/login flow end to end.

## Existing capture pipeline

The backend also implements recording upload, transcription (US-05), extraction draft (US-06), and PostgreSQL persistence. See the project-level `docs/06-api-and-integration/` documentation and the module-specific workflow documents for those contracts.

### Audio processing pipeline (Sprint 2, Block 3)

```
Browser (IndexedDB queue) --POST /api/v1/recordings (raw audio, JWT)--> backend
  -> validate (type, magic bytes, size, Idempotency-Key) -> save file under UPLOAD_DIR -> INSERT recording (RECEIVED)
  -> POST {TRANSCRIBER_URL}/transcribe  (Python wrapper around Whisper)  -> INSERT transcription
  -> Gemini extraction (schema-validated, 1 correction retry, timeout)   -> INSERT extraction_draft + recording EXTRACTED
Browser polls the server draft list and shows status, transcript, extracted fields and a retry button.
```

Status machine (`recording.processing_status`): `RECEIVED -> TRANSCRIBING -> TRANSCRIBED -> EXTRACTING -> EXTRACTED`, with
`TRANSCRIPTION_FAILED` / `EXTRACTION_FAILED` as retryable side exits. A retry from `EXTRACTION_FAILED` never re-transcribes.
The original audio file and transcript are kept on every failure. Failure codes are stored on the recording
(`failure_code`, `failure_message`); bad-input codes (`UNSUPPORTED_FORMAT`, `FILE_EMPTY`, `NO_SPEECH_DETECTED`, ...) are reported
as `retryable: false`.

| Method + path | Purpose |
| --- | --- |
| `POST /api/v1/recordings` | Upload audio. Headers: `Authorization: Bearer <jwt>`, `Idempotency-Key: <uuid>` (required), `Content-Type: audio/*`, optional `X-Duration-Ms`, `X-Recorded-At`. `201` new, `200` duplicate (`"duplicate": true`), `409 IDEMPOTENCY_KEY_REUSED` for the same key with different bytes. |
| `GET /api/v1/recordings/:id` | Recording + latest transcription + draft summary. |
| `POST /api/v1/recordings/:id/process[?wait=true]` | Start/resume/retry. `202` (background) or `200` with final state and stage timings (`wait=true`). `409 PROCESSING_IN_PROGRESS`, `422 RETRY_LIMIT_REACHED`. |
| `GET /api/v1/recordings/:id/draft` | Extraction draft summary (`404 DRAFT_NOT_FOUND` until extracted). |
| `GET /api/v1/drafts` / `GET /api/v1/drafts/:id` | Technician drafts with the linked `recording`, `transcription` and `extraction_draft` (used by the web UI). |

The organization and user always come from the verified JWT, never from the request body or headers. All SQL runs inside a
tenant transaction under PostgreSQL Row-Level Security; the server refuses to start as a superuser/BYPASSRLS role.

Extraction schema (unchanged, `src/modules/extraction/extraction.schema.js`): `equipment`, `symptom`, `operating_condition`,
`observation` (string or `null` = not mentioned, never guessed) and `uncertain_fields` (mentioned but unclear).

#### Environment variables (names only; never commit values)

Backend (`services/backend/.env`, see `.env.example`): `DATABASE_URL`, `JWT_SECRET`, `UPLOAD_DIR`, `MAX_UPLOAD_BYTES`,
`ALLOWED_AUDIO_MIME`, `AUTO_PROCESS`, `STALE_CLAIM_SECONDS`, `MAX_TRANSCRIPTION_ATTEMPTS`, `TRANSCRIBER_URL`,
`TRANSCRIBER_TIMEOUT_MS`, `TRANSCRIBER_INTERNAL_TOKEN`, `GEMINI_API_KEY`, `GEMINI_MODEL`, `GEMINI_TIMEOUT_MS` (new, default 30000).

Transcription service (`services/ai-engine`): `TRANSCRIPTION_AUDIO_ROOT` (**must equal the backend's `UPLOAD_DIR`**),
`AI_ENGINE_HOST` (default `127.0.0.1`), `AI_ENGINE_PORT` (default `8000`), `TRANSCRIBER_INTERNAL_TOKEN` (same value as the backend),
plus the existing `TRANSCRIPTION_*` model settings.

#### Run the whole prototype

```bash
# 1. Database (see database/README.md): apply migrations 001-013 as admin, connect the app as opsense_app
# 2. Transcription service (Terminal 1)
cd services/ai-engine && pip install -r requirements.txt
TRANSCRIPTION_AUDIO_ROOT=/abs/path/to/uploads python -m app.transcription.server
# 3. Backend (Terminal 2): cp .env.example .env, fill DATABASE_URL, JWT_SECRET, UPLOAD_DIR (same path), GEMINI_*
cd services/backend && npm ci && npm run dev
# 4. Web app (Terminal 3)
cd apps/web && npm ci && npm run dev
```

#### Tests

```bash
cd services/backend
npm test                      # unit tests, no external services (Whisper and Gemini are mocked)
npm run test:integration      # bridge test (needs python3) + live-DB tests, gated on US07_PG_URL / US07_PG_ADMIN_URL
cd ../ai-engine && python -m unittest tests.transcription.test_server -v
cd ../../apps/web && npm test # vitest
```

Live Gemini check (needs a real key; not run in CI): with `GEMINI_API_KEY` and `GEMINI_MODEL` set,
`node src/modules/extraction/extract-one.js "pump 3 vibrates at full load"` runs one real extraction, and `POST /recordings/:id/process?wait=true` runs the full chain.

