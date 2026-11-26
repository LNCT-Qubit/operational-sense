# Backend Service

Backend scaffold for asset, taxonomy, case, source, search, feedback, and user modules. API routes, authentication, persistence, migrations, and tests require implementation and review.


## US-07: Capture pipeline (Sprint 2)
Express + TypeScript implementation of recording upload, transcription (US-05), extraction draft (US-06) and PostgreSQL
persistence. Start with `docs/06-api-and-integration/us-07/README.md` (setup, design, open items) and `api.md`.
Tests: `npm test` (unit), `npm run test:us06` (regression), `npm run test:integration` (needs live PostgreSQL/Express for the gated cases).
