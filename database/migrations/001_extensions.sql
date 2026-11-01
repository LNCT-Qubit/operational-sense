-- 001_extensions.sql
-- STATUS: DRAFT, pending Common Data Model v1.0
-- Enables PostgreSQL extensions used by Operational Sense.

CREATE EXTENSION IF NOT EXISTS vector;     -- pgvector (semantic retrieval, later sprints)
CREATE EXTENSION IF NOT EXISTS pgcrypto;   -- gen_random_uuid() for tenant/case tables
j
