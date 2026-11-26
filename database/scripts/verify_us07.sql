-- verify_us07.sql : live-database checks for migration 009 (US-07).
-- Run as a SUPERUSER after migrations 001-009 (it switches to opsense_app itself):
--   docker exec -i opsense-db psql -v ON_ERROR_STOP=1 -U postgres -d opsense < database/scripts/verify_us07.sql
-- Everything runs in ONE transaction that ends in ROLLBACK, so no data is left behind.
-- Any failed check raises an exception (non-zero exit with ON_ERROR_STOP).
BEGIN;

CREATE FUNCTION public.us07_expect_error(label TEXT, stmt TEXT, expected TEXT) RETURNS VOID LANGUAGE plpgsql AS $f$
DECLARE succeeded BOOLEAN := FALSE;
BEGIN
  BEGIN
    EXECUTE stmt;
    succeeded := TRUE;
  EXCEPTION WHEN OTHERS THEN
    IF SQLSTATE <> expected THEN
      RAISE EXCEPTION 'FAIL [%]: expected SQLSTATE % but got % (%)', label, expected, SQLSTATE, SQLERRM;
    END IF;
    RAISE NOTICE 'PASS [%]: rejected with %', label, expected;
  END;
  IF succeeded THEN RAISE EXCEPTION 'FAIL [%]: statement succeeded but SQLSTATE % was expected', label, expected; END IF;
END $f$;

CREATE FUNCTION public.us07_expect(label TEXT, ok BOOLEAN) RETURNS VOID LANGUAGE plpgsql AS $f$
BEGIN
  IF ok THEN RAISE NOTICE 'PASS [%]', label; ELSE RAISE EXCEPTION 'FAIL [%]', label; END IF;
END $f$;

-- Fixtures (as superuser; RLS does not apply to superusers)
INSERT INTO organization (organization_id, name) VALUES
  ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'US07 verify org A'),
  ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', 'US07 verify org B');

-- Structural checks
SELECT public.us07_expect('RLS enabled+forced on recording, transcription, extraction_draft',
  (SELECT bool_and(relrowsecurity AND relforcerowsecurity) FROM pg_class
    WHERE relname IN ('recording', 'transcription', 'extraction_draft')));
SELECT public.us07_expect('opsense_app is neither superuser nor BYPASSRLS',
  (SELECT NOT rolsuper AND NOT rolbypassrls FROM pg_roles WHERE rolname = 'opsense_app'));
SELECT public.us07_expect('extraction_draft.transcription_id is uuid',
  (SELECT data_type = 'uuid' FROM information_schema.columns
    WHERE table_name = 'extraction_draft' AND column_name = 'transcription_id'));

SET LOCAL ROLE opsense_app;

-- ===== Tenant A context =====
SELECT set_config('app.current_org_id', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', true);

INSERT INTO recording (recording_id, organization_id, client_recording_id, uploaded_by, mime_type, size_bytes, sha256, storage_uri)
VALUES ('a0000000-0000-4000-8000-000000000001', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
        'c0000000-0000-4000-8000-000000000001', 'user-a', 'audio/wav', 100, repeat('a', 64), 'org/a1.wav');
SELECT public.us07_expect('A can insert and read its own recording',
  (SELECT count(*) = 1 FROM recording WHERE recording_id = 'a0000000-0000-4000-8000-000000000001'));

SELECT public.us07_expect_error('cross-tenant INSERT (org B id under context A)',
  $$INSERT INTO recording (organization_id, client_recording_id, uploaded_by, mime_type, size_bytes, sha256, storage_uri)
    VALUES ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', gen_random_uuid(), 'x', 'audio/wav', 1, repeat('b', 64), 'x')$$, '42501');
SELECT public.us07_expect_error('duplicate (org, client_recording_id)',
  $$INSERT INTO recording (organization_id, client_recording_id, uploaded_by, mime_type, size_bytes, sha256, storage_uri)
    VALUES ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'c0000000-0000-4000-8000-000000000001', 'x', 'audio/wav', 1, repeat('b', 64), 'x')$$, '23505');
SELECT public.us07_expect_error('failed status without failure_code',
  $$UPDATE recording SET processing_status = 'TRANSCRIPTION_FAILED' WHERE recording_id = 'a0000000-0000-4000-8000-000000000001'$$, '23514');
SELECT public.us07_expect_error('in-progress status without processing_started_at',
  $$UPDATE recording SET processing_status = 'TRANSCRIBING' WHERE recording_id = 'a0000000-0000-4000-8000-000000000001'$$, '23514');
SELECT public.us07_expect_error('DELETE recording is denied',
  $$DELETE FROM recording WHERE recording_id = 'a0000000-0000-4000-8000-000000000001'$$, '42501');

-- transcription rules
SELECT public.us07_expect_error('COMPLETED transcription with blank transcript',
  $$INSERT INTO transcription (transcription_id, organization_id, recording_id, attempt_number, status, transcript, model_name)
    VALUES (gen_random_uuid(), 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'a0000000-0000-4000-8000-000000000001', 1, 'COMPLETED', '   ', 'tiny')$$, '23514');
SELECT public.us07_expect_error('FAILED transcription without error_code',
  $$INSERT INTO transcription (transcription_id, organization_id, recording_id, attempt_number, status, model_name)
    VALUES (gen_random_uuid(), 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'a0000000-0000-4000-8000-000000000001', 1, 'FAILED', 'tiny')$$, '23514');

INSERT INTO transcription (transcription_id, organization_id, recording_id, attempt_number, status, transcript, model_name)
VALUES ('d0000000-0000-4000-8000-000000000001', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
        'a0000000-0000-4000-8000-000000000001', 1, 'COMPLETED', 'pump is vibrating', 'tiny');

SELECT public.us07_expect_error('second COMPLETED transcription for the same recording',
  $$INSERT INTO transcription (transcription_id, organization_id, recording_id, attempt_number, status, transcript, model_name)
    VALUES (gen_random_uuid(), 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'a0000000-0000-4000-8000-000000000001', 2, 'COMPLETED', 'again', 'tiny')$$, '23505');
SELECT public.us07_expect_error('UPDATE transcription is denied (append-only)',
  $$UPDATE transcription SET transcript = 'tampered' WHERE transcription_id = 'd0000000-0000-4000-8000-000000000001'$$, '42501');

-- draft linking
INSERT INTO extraction_draft (id, organization_id, recording_id, transcription_id, transcript, extraction, missing_fields)
VALUES ('e0000000-0000-4000-8000-000000000001', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
        'a0000000-0000-4000-8000-000000000001', 'd0000000-0000-4000-8000-000000000001',
        'pump is vibrating', '{"equipment":"pump","symptom":"vibrating","operating_condition":null,"observation":null,"uncertain_fields":[]}',
        ARRAY['operating_condition','observation']);
SELECT public.us07_expect_error('second live draft for the same transcription',
  $$INSERT INTO extraction_draft (organization_id, recording_id, transcription_id, transcript, extraction)
    VALUES ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'a0000000-0000-4000-8000-000000000001', 'd0000000-0000-4000-8000-000000000001', 't', '{}')$$, '23505');
SELECT public.us07_expect_error('draft naming a transcription but no recording',
  $$INSERT INTO extraction_draft (organization_id, transcription_id, transcript, extraction)
    VALUES ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'd0000000-0000-4000-8000-000000000001', 't', '{}')$$, '23514');
SELECT public.us07_expect_error('draft with a non-existent transcription',
  $$INSERT INTO extraction_draft (organization_id, recording_id, transcription_id, transcript, extraction)
    VALUES ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'a0000000-0000-4000-8000-000000000001', gen_random_uuid(), 't', '{}')$$, '23503');

-- a REJECTED draft frees the slot for a new one
UPDATE extraction_draft SET status = 'REJECTED' WHERE id = 'e0000000-0000-4000-8000-000000000001';
INSERT INTO extraction_draft (id, organization_id, recording_id, transcription_id, transcript, extraction)
VALUES ('e0000000-0000-4000-8000-000000000002', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
        'a0000000-0000-4000-8000-000000000001', 'd0000000-0000-4000-8000-000000000001', 't', '{}');
SELECT public.us07_expect('new draft allowed after previous was REJECTED', TRUE);

-- ===== Tenant B context: cannot see A, cannot link to A =====
SELECT set_config('app.current_org_id', 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', true);
SELECT public.us07_expect('B sees zero of A''s recordings', (SELECT count(*) = 0 FROM recording));
SELECT public.us07_expect('B sees zero of A''s transcriptions', (SELECT count(*) = 0 FROM transcription));
SELECT public.us07_expect('B sees zero of A''s drafts', (SELECT count(*) = 0 FROM extraction_draft));
SELECT public.us07_expect_error('B cannot attach a transcription to A''s recording',
  $$INSERT INTO transcription (transcription_id, organization_id, recording_id, attempt_number, status, error_code, model_name)
    VALUES (gen_random_uuid(), 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', 'a0000000-0000-4000-8000-000000000001', 9, 'FAILED', 'TEST_ERROR', 'tiny')$$, '23503');
-- ===== No context at all: fails closed =====
SELECT set_config('app.current_org_id', '', true);
SELECT public.us07_expect('empty tenant context sees nothing', (SELECT count(*) = 0 FROM recording));

RESET ROLE;
SELECT 'ALL US-07 DATABASE CHECKS PASSED' AS result;
ROLLBACK;
