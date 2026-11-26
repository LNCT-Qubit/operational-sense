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
