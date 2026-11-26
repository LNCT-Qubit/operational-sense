import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import type { AddressInfo } from 'node:net';
import { HttpTranscriptionClient, TranscriptionUnavailableError, parseTranscriptionResult } from '../src/modules/transcription/transcription.client';

async function withServer(handler: http.RequestListener, fn: (url: string) => Promise<void>) {
  const s = http.createServer(handler); await new Promise<void>((r) => s.listen(0, '127.0.0.1', r));
  try { await fn(`http://127.0.0.1:${(s.address() as AddressInfo).port}`); } finally { s.closeAllConnections?.(); await new Promise((r) => s.close(r)); }
}
const REQ = { audioPath: '/x/a.wav', recordingId: 'r', transcriptionId: 't', attemptNumber: 2 };
const ok = { transcription_id: 't', recording_id: 'r', attempt_number: 2, status: 'COMPLETED', transcript: ' hello ', detected_language: 'en', language_probability: 0.9, segments: [{ start: 0, end: 1, text: 'hello' }], processing_duration_seconds: 1.2, model_name: 'tiny', created_at: '2026-01-01T00:00:00Z' };

test('success: sends the documented request, parses and trims the result, forwards the token', async () => {
  let seen: any;
  await withServer((req, res) => { let b = ''; req.on('data', (c) => (b += c)); req.on('end', () => { seen = { body: JSON.parse(b), token: req.headers['x-internal-token'], url: req.url }; res.setHeader('content-type', 'application/json'); res.end(JSON.stringify(ok)); }); }, async (url) => {
    const r = await new HttpTranscriptionClient({ baseUrl: url, timeoutMs: 2000, internalToken: 'tok' }).transcribe(REQ);
    assert.equal(r.transcript, 'hello'); assert.equal(r.status, 'COMPLETED');
    assert.deepEqual(seen.body, { audio_path: '/x/a.wav', recording_id: 'r', transcription_id: 't', attempt_number: 2 });
    assert.equal(seen.token, 'tok'); assert.equal(seen.url, '/transcribe');
  });
});
test('HTTP 500, malformed JSON, contract violations -> TranscriptionUnavailableError', async () => {
  for (const reply of [(res: http.ServerResponse) => { res.statusCode = 500; res.end('{}'); }, (res: http.ServerResponse) => res.end('<html>'), (res: http.ServerResponse) => res.end(JSON.stringify({ status: 'COMPLETED', transcription_id: 't', transcript: '  ' })), (res: http.ServerResponse) => res.end(JSON.stringify({ status: 'WEIRD', transcription_id: 't' }))]) {
    await withServer((_q, res) => reply(res), async (url) => {
      await assert.rejects(new HttpTranscriptionClient({ baseUrl: url, timeoutMs: 2000, internalToken: null }).transcribe(REQ), TranscriptionUnavailableError);
    });
  }
});
test('timeout and unreachable host -> TranscriptionUnavailableError', async () => {
  await withServer(() => { /* never answers */ }, async (url) => {
    await assert.rejects(new HttpTranscriptionClient({ baseUrl: url, timeoutMs: 150, internalToken: null }).transcribe(REQ), /timed out/);
  });
  await assert.rejects(new HttpTranscriptionClient({ baseUrl: 'http://127.0.0.1:1', timeoutMs: 1000, internalToken: null }).transcribe(REQ), TranscriptionUnavailableError);
});
test('parse: FAILED needs error_code; EMPTY drops transcript; junk segments are filtered', () => {
  assert.throws(() => parseTranscriptionResult({ status: 'FAILED', transcription_id: 't' }), TranscriptionUnavailableError);
  const e = parseTranscriptionResult({ status: 'EMPTY', transcription_id: 't', transcript: 'ignored' }); assert.equal(e.transcript, null);
  assert.equal(parseTranscriptionResult({ ...ok, segments: [null, { text: 5 }, { start: 0, end: 1, text: 'a' }] }).segments.length, 1);
});
