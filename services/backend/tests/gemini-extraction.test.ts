/**
 * Sprint 2 Block 3 - Gemini extraction without credentials: the real Extractor (AJV schema validation + one
 * correction retry) and the real llm-guard (timeout/retry) run against a MOCKED model call. Nothing here talks to
 * Gemini; see the README "Live Gemini check" for the credentialed procedure.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import Extractor from '../src/modules/extraction/extractor';
import { classify, DraftAlreadyExistsError, ExtractionError } from '../src/modules/extraction/extraction.gateway';
import { ClaimLostError } from '../src/modules/recordings/recording.types';

// eslint-disable-next-line @typescript-eslint/no-var-requires
const guard = require('../src/modules/extraction/llm-guard');

const GOOD = { equipment: 'centrifugal pump', symptom: 'vibration', operating_condition: null, observation: 'noise from bearing', uncertain_fields: [] };
const noSleep = async () => { /* do not really wait between retries in tests */ };
const httpErr = (status: number, message = 'boom') => Object.assign(new Error(message), { status });

// ---------------------------------------------------------------- llm-guard
test('guard: a call that never settles is abandoned with a 504 LlmTimeoutError and the signal is aborted', async () => {
  let seen: AbortSignal | undefined;
  await assert.rejects(
    guard.withTimeout((signal: AbortSignal) => { seen = signal; return new Promise(() => { /* hangs forever */ }); }, 30),
    (e: any) => e.name === 'LlmTimeoutError' && e.status === 504,
  );
  assert.equal(seen?.aborted, true);
});

test('guard: fast success returns the value and leaves no pending timer behind', async () => {
  assert.equal(await guard.withTimeout(async () => 'ok', 5_000), 'ok');   // would keep the process alive 5 s if the timer leaked
});

test('guard: 503 then 429 then success -> 3 calls, back-off 5 s then 10 s (injected sleep, no real wait)', async () => {
  const waits: number[] = []; let calls = 0;
  const out = await guard.callWithRetry(async () => { calls++; if (calls === 1) throw httpErr(503); if (calls === 2) throw httpErr(429); return 'fine'; },
    { timeoutMs: 1000, maxTries: 3, baseDelayMs: 5000, sleep: async (ms: number) => { waits.push(ms); } });
  assert.equal(out, 'fine'); assert.equal(calls, 3); assert.deepEqual(waits, [5000, 10000]);
});

test('guard: a timeout is retried; after maxTries the last error is thrown', async () => {
  let calls = 0;
  await assert.rejects(
    guard.callWithRetry(() => { calls++; return new Promise(() => { /* hang */ }); }, { timeoutMs: 20, maxTries: 2, baseDelayMs: 1, sleep: noSleep }),
    (e: any) => e.name === 'LlmTimeoutError',
  );
  assert.equal(calls, 2);
});

test('guard: non-transient errors (400, 401, config) are NOT retried', async () => {
  for (const err of [httpErr(400), httpErr(401), new guard.LlmConfigError('GEMINI_MODEL is not configured')]) {
    let calls = 0;
    await assert.rejects(guard.callWithRetry(async () => { calls++; throw err; }, { timeoutMs: 1000, maxTries: 3, sleep: noSleep }));
    assert.equal(calls, 1);
  }
});

test('guard: GEMINI_TIMEOUT_MS is bounded and falls back to 30 s on junk', () => {
  assert.equal(guard.timeoutFromEnv({}), 30000);
  assert.equal(guard.timeoutFromEnv({ GEMINI_TIMEOUT_MS: '45000' }), 45000);
  for (const bad of ['abc', '10', '999999', '-5', '1.5']) assert.equal(guard.timeoutFromEnv({ GEMINI_TIMEOUT_MS: bad }), 30000);
});

// ---------------------------------------------------------------- Extractor with a mocked model
test('extract: valid JSON is accepted; missing fields stay null (never guessed); N/A-style words become null', async () => {
  const raw = JSON.stringify({ equipment: ' conveyor motor ', symptom: 'N/A', operating_condition: 'unknown', observation: null, uncertain_fields: [] });
  const r = await new Extractor(async () => raw).extract('conveyor motor ...');
  assert.equal(r.ok, true);
  assert.deepEqual(r.data, { equipment: 'conveyor motor', symptom: null, operating_condition: null, observation: null, uncertain_fields: [] });
});

test('extract: uncertain information is preserved in uncertain_fields', async () => {
  const raw = JSON.stringify({ ...GOOD, equipment: 'press', uncertain_fields: ['equipment'] });
  const r = await new Extractor(async () => raw).extract('press stops, maybe sensor or PLC');
  assert.equal(r.ok, true); assert.deepEqual(r.data.uncertain_fields, ['equipment']);
});

test('extract: malformed JSON on the first reply is corrected on the second (correction text is sent)', async () => {
  const systems: string[] = [];
  const replies = ['{"equipment": "pump",', JSON.stringify(GOOD)];
  const r = await new Extractor(async (system: string) => { systems.push(system); return replies.shift() as string; }).extract('pump vibrates');
  assert.equal(r.ok, true); assert.equal(systems.length, 2);
  assert.match(systems[1], /previous reply was invalid: not valid JSON/);
});

test('extract: an invented field (schema change) is rejected; two bad replies -> "LLM output invalid after retry", exactly 2 model calls', async () => {
  let calls = 0;
  const r = await new Extractor(async () => { calls++; return JSON.stringify({ ...GOOD, root_cause: 'bearing' }); }).extract('x');
  assert.deepEqual(r, { ok: false, error: 'LLM output invalid after retry' }); assert.equal(calls, 2);
});

test('extract: a null field listed as uncertain violates the contract', async () => {
  const bad = JSON.stringify({ ...GOOD, observation: null, uncertain_fields: ['observation'] });
  const r = await new Extractor(async () => bad).extract('x');
  assert.equal(r.ok, false);
});

test('extract: empty transcript never reaches the model', async () => {
  let calls = 0;
  const r = await new Extractor(async () => { calls++; return ''; }).extract('   ');
  assert.deepEqual(r, { ok: false, error: 'Empty transcript' }); assert.equal(calls, 0);
});

test('extract: provider error is reported as "LLM call failed" (no retry inside Extractor: retries live in llm-guard)', async () => {
  let calls = 0;
  const r = await new Extractor(async () => { calls++; throw httpErr(503, 'overloaded'); }).extract('x');
  assert.equal(r.ok, false);
  assert.match(r.error ?? '', /^LLM call failed: 503 overloaded/);
});

test('extract: a model timeout surfaces as LLM call failed 504', async () => {
  const slow = () => guard.withTimeout(() => new Promise(() => { /* hang */ }), 20);
  const r = await new Extractor(slow).extract('x');
  assert.equal(r.ok, false);
  assert.match(r.error ?? '', /^LLM call failed: 504 LLM call timed out/);
});

// ---------------------------------------------------------------- classify(): what the recording row will say
test('classify: provider/timeouts -> EXTRACTION_SERVICE_ERROR (retryable); bad model output -> EXTRACTION_INVALID_OUTPUT', () => {
  const svc = classify(new Error('Extraction failed: LLM call failed: 504 LLM call timed out after 30000ms')) as ExtractionError;
  assert.equal(svc.code, 'EXTRACTION_SERVICE_ERROR');
  for (const m of ['Extraction failed: not valid JSON', 'Extraction failed: LLM output invalid after retry', 'Extraction failed: Empty transcript']) {
    assert.equal((classify(new Error(m)) as ExtractionError).code, 'EXTRACTION_INVALID_OUTPUT');
  }
  assert.equal((classify(new Error('Invalid uncertain_fields: x')) as ExtractionError).code, 'EXTRACTION_INVALID_OUTPUT');
});

test('classify: raw error text is never exposed to clients; DB errors map to EXTRACTION_PERSISTENCE_FAILED', () => {
  const e = classify(new Error('connect ECONNREFUSED 10.0.0.5:5432 password=hunter2')) as ExtractionError;
  assert.equal(e.code, 'EXTRACTION_PERSISTENCE_FAILED');
  assert.doesNotMatch(e.message, /hunter2|10\.0\.0\.5/);
});

test('classify: unique violation -> DraftAlreadyExistsError; ClaimLostError passes through untouched', () => {
  assert.ok(classify(Object.assign(new Error('dup'), { code: '23505' })) instanceof DraftAlreadyExistsError);
  const lost = new ClaimLostError();
  assert.equal(classify(lost), lost);
});
