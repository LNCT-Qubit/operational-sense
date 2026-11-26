/**
 * Cross-language test: Node CaptureService + HttpTranscriptionClient  <->  REAL Python US-05 code behind
 * services/ai-engine/app/transcription/server.py. Whisper itself is not required for these cases (they stop in
 * US-05's validation stage or fail model loading), so this runs anywhere python3 is available.
 */
import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import { spawn, spawnSync, type ChildProcess } from 'node:child_process';
import { createServer } from 'node:net';
import { mkdtempSync, writeFileSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { CaptureService } from '../../src/modules/recordings/recording.service';
import { HttpTranscriptionClient } from '../../src/modules/transcription/transcription.client';
import { silentLogger } from '../../src/http/logger';
import { InMemoryStore, FakeStorage, FakeDrafts, ctx, ORG_A, WAV } from '../helpers/fakes';

const AI_ENGINE = path.resolve(__dirname, '../../../ai-engine');
const hasPython = spawnSync('python3', ['--version']).status === 0;
let proc: ChildProcess; let root: string; let base: string;

const freePort = () => new Promise<number>((res) => { const s = createServer().listen(0, '127.0.0.1', () => { const p = (s.address() as any).port; s.close(() => res(p)); }); });

before(async () => {
  if (!hasPython) return;
  root = mkdtempSync(path.join(tmpdir(), 'us07-audio-'));
  const port = await freePort(); base = `http://127.0.0.1:${port}`;
  proc = spawn('python3', ['-m', 'app.transcription.server'], { cwd: AI_ENGINE, env: { ...process.env, TRANSCRIPTION_AUDIO_ROOT: root, AI_ENGINE_PORT: String(port), AI_ENGINE_HOST: '127.0.0.1' }, stdio: 'ignore' });
  for (let i = 0; i < 100; i++) { try { if ((await fetch(base + '/health')).ok) return; } catch { /* not up yet */ } await new Promise((r) => setTimeout(r, 100)); }
  throw new Error('python transcription server did not start');
});
after(() => { proc?.kill(); });

function pipeline(storageRoot: string) {
  const store = new InMemoryStore(); const drafts = new FakeDrafts(store);
  const storage = new FakeStorage(); storage.absolutePath = (uri: string) => path.join(storageRoot, uri);
  const svc = new CaptureService(store, storage, new HttpTranscriptionClient({ baseUrl: base, timeoutMs: 60_000, internalToken: null }), drafts, { autoProcess: false, staleClaimSeconds: 600, maxTranscriptionAttempts: 3 }, silentLogger);
  return { store, storage, drafts, svc };
}
const put = async (p: ReturnType<typeof pipeline>, bytes: Buffer, root_: string) => {
  const { recording } = await p.svc.upload(ctx(), { clientRecordingId: 'c0000000-0000-4000-8000-000000000001', body: bytes, ext: 'wav', mime: 'audio/wav', durationMs: null, recordedAt: null });
  mkdirSync(path.join(root_, ORG_A), { recursive: true });
  writeFileSync(path.join(root_, recording.storage_uri), bytes);   // the FakeStorage kept bytes in memory; materialise them where Python can read
  return recording;
};

test('missing audio file: real US-05 returns FAILED/FILE_NOT_FOUND -> recording TRANSCRIPTION_FAILED, no draft', { skip: !hasPython }, async () => {
  const p = pipeline(root); const rec = await put(p, WAV, root);
  const fs = await import('node:fs'); fs.rmSync(path.join(root, rec.storage_uri));
  const { state } = await p.svc.process(ctx(), rec.recording_id);
  assert.equal(state.recording.processing_status, 'TRANSCRIPTION_FAILED'); assert.equal(state.recording.failure_code, 'FILE_NOT_FOUND');
  assert.equal(state.draft, null); assert.equal(p.drafts.calls.length, 0);
});
test('empty file: real US-05 returns FILE_EMPTY (non-retryable class)', { skip: !hasPython }, async () => {
  const p = pipeline(root); const rec = await put(p, WAV, root);
  writeFileSync(path.join(root, rec.storage_uri), Buffer.alloc(0));
  const { state } = await p.svc.process(ctx(), rec.recording_id);
  assert.equal(state.recording.failure_code, 'FILE_EMPTY');
});
test('a path outside the audio root is refused by the wrapper (403) and surfaces as TRANSCRIPTION_SERVICE_UNAVAILABLE, with the real file never read', { skip: !hasPython }, async () => {
  const outside = mkdtempSync(path.join(tmpdir(), 'us07-outside-'));
  const p = pipeline(outside); const rec = await put(p, WAV, outside);       // backend thinks files live in `outside`, python only allows `root`
  const { state } = await p.svc.process(ctx(), rec.recording_id);
  assert.equal(state.recording.processing_status, 'TRANSCRIPTION_FAILED'); assert.equal(state.recording.failure_code, 'TRANSCRIPTION_SERVICE_UNAVAILABLE');
});
test('a structurally valid WAV reaches the Whisper stage: without a model it must FAIL cleanly (or EMPTY with a model), never "succeed" with no transcript', { skip: !hasPython }, async () => {
  const hdr = Buffer.alloc(44); hdr.write('RIFF', 0); hdr.writeUInt32LE(36 + 32000, 4); hdr.write('WAVEfmt ', 8); hdr.writeUInt32LE(16, 16); hdr.writeUInt16LE(1, 20); hdr.writeUInt16LE(1, 22);
  hdr.writeUInt32LE(16000, 24); hdr.writeUInt32LE(32000, 28); hdr.writeUInt16LE(2, 32); hdr.writeUInt16LE(16, 34); hdr.write('data', 36); hdr.writeUInt32LE(32000, 40);
  const wav = Buffer.concat([hdr, Buffer.alloc(32000)]);                      // 1 s of digital silence, 16 kHz mono PCM16
  const p = pipeline(root); const rec = await put(p, wav, root);
  const { state } = await p.svc.process(ctx(), rec.recording_id);
  assert.equal(state.recording.processing_status, 'TRANSCRIPTION_FAILED');
  assert.ok(state.recording.failure_code);                                    // observed value is reported in the testing report
  console.log(`      observed failure_code for silent WAV in this environment: ${state.recording.failure_code}`);
});
