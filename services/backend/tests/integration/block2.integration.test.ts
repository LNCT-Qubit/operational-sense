/**
 * GATED: runs when US07_PG_URL (opsense_app) and US07_PG_ADMIN_URL (superuser) are set.
 * Exercises real Express routing, PostgreSQL RLS, migrations 012 & 013, drafts, attachments,
 * audio/webm upload + streaming, cases (with FTS), assets (with cycle trigger), and taxonomy.
 */
import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import type { AddressInfo } from 'node:net';
import { createApp } from '../../src/app';
import { loadConfig } from '../../src/config/env';
import { withTenant } from '../../src/database/tenant';
import { silentLogger } from '../../src/http/logger';
import { signJwtHs256 } from '../../src/middleware/auth';
import { LocalAudioStorage } from '../../src/modules/recordings/audio-storage';
import { PostgresPipelineStore } from '../../src/modules/recordings/recording.repository';
import { CaptureService } from '../../src/modules/recordings/recording.service';
import { Us06DraftCreator } from '../../src/modules/extraction/extraction.gateway';
import { LocalAttachmentStorage } from '../../src/modules/drafts/attachment-storage';
import { PostgresDraftSyncStore } from '../../src/modules/drafts/draft.repository';
import { TechnicianDraftService } from '../../src/modules/drafts/draft.service';
import { PostgresCaseStore } from '../../src/modules/cases/case.repository';
import { CaseService } from '../../src/modules/cases/case.service';
import { PostgresAssetStore } from '../../src/modules/assets/asset.repository';
import { AssetService } from '../../src/modules/assets/asset.service';
import { PostgresTaxonomyStore, TaxonomyService } from '../../src/modules/taxonomy/taxonomy.routes';
import { FakeTranscriber } from '../helpers/fakes';

const URL = process.env.US07_PG_URL;
const ADMIN = process.env.US07_PG_ADMIN_URL;
let pg: any = null;
try { pg = require('pg'); } catch { /* not installed */ }
const skip = !(URL && ADMIN && pg) && 'set US07_PG_URL + US07_PG_ADMIN_URL and install pg to run live Block 2 tests';

const SECRET = 'k'.repeat(40);
const orgA = randomUUID();
const orgB = randomUUID();
const techA = randomUUID();
const supA = randomUUID();
const adminB = randomUUID();
const EQ_CLASS_ID = `EQ-B2-${randomUUID().slice(0, 6).toUpperCase()}`;

let pool: any;
let admin: any;
let server: any;
let baseUrl: string;
let uploadDir: string;

const mint = (sub: string, org: string, role: string) =>
  signJwtHs256({ sub, org, role, exp: Math.floor(Date.now() / 1000) + 3600 }, SECRET);

after(async () => {
  server?.close();
  if (admin) {
    await admin.query('DELETE FROM draft_attachment WHERE organization_id = ANY($1)', [[orgA, orgB]]);
    await admin.query('DELETE FROM technician_draft WHERE organization_id = ANY($1)', [[orgA, orgB]]);
    await admin.query('DELETE FROM operational_case WHERE organization_id = ANY($1)', [[orgA, orgB]]);
    await admin.query('DELETE FROM asset_node WHERE organization_id = ANY($1)', [[orgA, orgB]]);
    await admin.query('DELETE FROM extraction_draft WHERE organization_id = ANY($1)', [[orgA, orgB]]);
    await admin.query('DELETE FROM transcription WHERE organization_id = ANY($1)', [[orgA, orgB]]);
    await admin.query('DELETE FROM recording WHERE organization_id = ANY($1)', [[orgA, orgB]]);
    await admin.query('DELETE FROM audit_log WHERE organization_id = ANY($1)', [[orgA, orgB]]);
    await admin.query('DELETE FROM organization WHERE organization_id = ANY($1)', [[orgA, orgB]]);
    await admin.query('DELETE FROM equipment_class WHERE equipment_class_id = $1', [EQ_CLASS_ID]);
  }
  await pool?.end();
  await admin?.end();
  if (uploadDir) rmSync(uploadDir, { recursive: true, force: true });
});

test('setup Block 2 live integration server', { skip }, async () => {
  pool = new pg.Pool({ connectionString: URL });
  admin = new pg.Pool({ connectionString: ADMIN });
  uploadDir = mkdtempSync(path.join(tmpdir(), 'opsense-b2-it-'));

  await admin.query('INSERT INTO organization (organization_id, name) VALUES ($1, $2), ($3, $4)', [
    orgA, `B2 Org A ${orgA.slice(0, 6)}`,
    orgB, `B2 Org B ${orgB.slice(0, 6)}`,
  ]);
  await admin.query('INSERT INTO equipment_class (equipment_class_id, class_name) VALUES ($1, $2)', [
    EQ_CLASS_ID, `B2 Test Class ${EQ_CLASS_ID}`,
  ]);

  const cfg = loadConfig({ DATABASE_URL: URL, JWT_SECRET: SECRET, UPLOAD_DIR: uploadDir });
  const captureSvc = new CaptureService(
    new PostgresPipelineStore(pool),
    new LocalAudioStorage(uploadDir),
    new FakeTranscriber(),
    new Us06DraftCreator(pool, async () => '{}'),
    { autoProcess: false, staleClaimSeconds: 600, maxTranscriptionAttempts: 3 },
    silentLogger,
  );

  const app = createApp({
    config: cfg,
    service: captureSvc,
    logger: silentLogger,
    drafts: {
      service: new TechnicianDraftService(new PostgresDraftSyncStore(pool), new LocalAttachmentStorage(uploadDir), silentLogger),
    },
    cases: { service: new CaseService(new PostgresCaseStore(pool)) },
    assets: { service: new AssetService(new PostgresAssetStore(pool)) },
    taxonomy: { service: new TaxonomyService(new PostgresTaxonomyStore(pool)) },
    ping: async () => { await pool.query('SELECT 1'); },
  });

  server = app.listen(0);
  baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});

test('drafts: idempotency, recording audio/webm link, attachments, supervisor decision & 409 lock, RLS isolation', { skip }, async () => {
  const techTok = mint(techA, orgA, 'TECHNICIAN');
  const supTok = mint(supA, orgA, 'SUPERVISOR');
  const orgBTok = mint(adminB, orgB, 'ADMIN');

  // 1. Upload audio/webm;codecs=opus recording and stream it back
  const webm = Buffer.from([0x1a, 0x45, 0xdf, 0xa3, 0x9f, 0x42, 0x86, 0x81, 0x01, 0x02]);
  const recRes = await fetch(`${baseUrl}/api/v1/recordings`, {
    method: 'POST',
    headers: {
      authorization: `Bearer ${techTok}`,
      'content-type': 'audio/webm;codecs=opus',
      'idempotency-key': randomUUID(),
      'x-duration-ms': '1500',
    },
    body: webm,
  });
  assert.equal(recRes.status, 201);
  const recId = ((await recRes.json()) as any).recording.id;

  const playRes = await fetch(`${baseUrl}/api/v1/recordings/${recId}/audio`, {
    headers: { authorization: `Bearer ${techTok}` },
  });
  assert.equal(playRes.status, 200);
  assert.deepEqual(Buffer.from(await playRes.arrayBuffer()), webm);

  // 2. Create draft linked to recording (case-insensitive 'Voice' -> 'voice') + idempotent retry
  const clientDraftId = randomUUID();
  const draftPayload = {
    clientDraftId,
    recordingId: recId,
    mode: 'Voice',
    equipment: 'Centrifugal Pump P-101',
    subsystem: 'Bearing Assembly',
    symptom: 'High vibration',
    observation: 'Bearing housing hot during load',
    cause: 'Misalignment',
    action: 'Checked coupling',
    parts: '6308 bearing',
    safety: 'LOTO applied',
    durationMs: 1500,
  };
  const d1 = await fetch(`${baseUrl}/api/v1/drafts`, {
    method: 'POST',
    headers: { authorization: `Bearer ${techTok}`, 'content-type': 'application/json' },
    body: JSON.stringify(draftPayload),
  });
  assert.equal(d1.status, 201);
  const d1Body: any = await d1.json();
  assert.equal(d1Body.duplicate, false);
  assert.equal(d1Body.draft.capture_mode, 'voice');
  assert.equal(d1Body.draft.recording_id, recId);
  const draftId = d1Body.draft.id;

  const d2 = await fetch(`${baseUrl}/api/v1/drafts`, {
    method: 'POST',
    headers: { authorization: `Bearer ${techTok}`, 'content-type': 'application/json' },
    body: JSON.stringify({ ...draftPayload, observation: 'Updated before approval' }),
  });
  assert.equal(d2.status, 200);
  const d2Body: any = await d2.json();
  assert.equal(d2Body.duplicate, true);
  assert.equal(d2Body.draft.id, draftId);
  assert.equal(d2Body.draft.observation, 'Updated before approval');

  // 3. Upload & retrieve attachment
  const imgBytes = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  const a1 = await fetch(`${baseUrl}/api/v1/drafts/${draftId}/attachments`, {
    method: 'POST',
    headers: {
      authorization: `Bearer ${techTok}`,
      'content-type': 'image/png',
      'idempotency-key': 'att-key-0',
      'x-file-name': 'bearing.png',
    },
    body: imgBytes,
  });
  assert.equal(a1.status, 201);
  const attId = ((await a1.json()) as any).attachment.id;

  const aDup = await fetch(`${baseUrl}/api/v1/drafts/${draftId}/attachments`, {
    method: 'POST',
    headers: {
      authorization: `Bearer ${techTok}`,
      'content-type': 'image/png',
      'idempotency-key': 'att-key-0',
      'x-file-name': 'bearing.png',
    },
    body: imgBytes,
  });
  assert.equal(aDup.status, 200);
  assert.equal(((await aDup.json()) as any).duplicate, true);

  const aGet = await fetch(`${baseUrl}/api/v1/drafts/${draftId}/attachments/${attId}`, {
    headers: { authorization: `Bearer ${supTok}` },
  });
  assert.equal(aGet.status, 200);
  assert.deepEqual(Buffer.from(await aGet.arrayBuffer()), imgBytes);

  // 4. Cross-tenant isolation (Org B admin cannot read or update Org A draft)
  assert.equal((await fetch(`${baseUrl}/api/v1/drafts/${draftId}`, { headers: { authorization: `Bearer ${orgBTok}` } })).status, 404);
  assert.equal(
    (await fetch(`${baseUrl}/api/v1/drafts/${draftId}/decision`, {
      method: 'POST',
      headers: { authorization: `Bearer ${orgBTok}`, 'content-type': 'application/json' },
      body: JSON.stringify({ decision: 'APPROVED' }),
    })).status,
    404,
  );
  const rlsCount = await withTenant(pool, orgB, (db) => db.query('SELECT COUNT(*)::int AS n FROM technician_draft WHERE draft_id = $1', [draftId]));
  assert.equal(rlsCount.rows[0].n, 0);

  // 5. Technician cannot approve; supervisor approves; duplicate decision returns 409; late offline retry returns 409
  const techDecide = await fetch(`${baseUrl}/api/v1/drafts/${draftId}/decision`, {
    method: 'POST',
    headers: { authorization: `Bearer ${techTok}`, 'content-type': 'application/json' },
    body: JSON.stringify({ decision: 'APPROVED' }),
  });
  assert.equal(techDecide.status, 403);

  const supDecide = await fetch(`${baseUrl}/api/v1/drafts/${draftId}/decision`, {
    method: 'POST',
    headers: { authorization: `Bearer ${supTok}`, 'content-type': 'application/json' },
    body: JSON.stringify({ decision: 'APPROVED', comment: 'Verified alignment note' }),
  });
  assert.equal(supDecide.status, 200);
  assert.equal(((await supDecide.json()) as any).draft.status, 'APPROVED');

  const supDecideDup = await fetch(`${baseUrl}/api/v1/drafts/${draftId}/decision`, {
    method: 'POST',
    headers: { authorization: `Bearer ${supTok}`, 'content-type': 'application/json' },
    body: JSON.stringify({ decision: 'REJECTED' }),
  });
  assert.equal(supDecideDup.status, 409);

  const lateRetry = await fetch(`${baseUrl}/api/v1/drafts`, {
    method: 'POST',
    headers: { authorization: `Bearer ${techTok}`, 'content-type': 'application/json' },
    body: JSON.stringify({ ...draftPayload, observation: 'Stale offline edit' }),
  });
  assert.equal(lateRetry.status, 409);
});

test('cases CRUD + FTS search, assets CRUD + cycle check, and taxonomy endpoints', { skip }, async () => {
  const supTok = mint(supA, orgA, 'SUPERVISOR');
  const orgBTok = mint(adminB, orgB, 'ADMIN');

  // Assets CRUD + cycle protection
  const asset1 = await fetch(`${baseUrl}/api/v1/assets`, {
    method: 'POST',
    headers: { authorization: `Bearer ${supTok}`, 'content-type': 'application/json' },
    body: JSON.stringify({ assetLevel: 'Plant', assetName: 'Plant North', equipmentClassId: EQ_CLASS_ID }),
  });
  assert.equal(asset1.status, 201);
  const parentId = ((await asset1.json()) as any).asset.asset_id;

  const asset2 = await fetch(`${baseUrl}/api/v1/assets`, {
    method: 'POST',
    headers: { authorization: `Bearer ${supTok}`, 'content-type': 'application/json' },
    body: JSON.stringify({ parentAssetId: parentId, assetLevel: 'Equipment', assetName: 'Pump Alpha', equipmentClassId: EQ_CLASS_ID }),
  });
  assert.equal(asset2.status, 201);
  const childId = ((await asset2.json()) as any).asset.asset_id;

  const cycle = await fetch(`${baseUrl}/api/v1/assets/${parentId}`, {
    method: 'PATCH',
    headers: { authorization: `Bearer ${supTok}`, 'content-type': 'application/json' },
    body: JSON.stringify({ parentAssetId: childId }),
  });
  assert.equal(cycle.status, 400);

  // Cases CRUD + FTS
  const cRes = await fetch(`${baseUrl}/api/v1/cases`, {
    method: 'POST',
    headers: { authorization: `Bearer ${supTok}`, 'content-type': 'application/json' },
    body: JSON.stringify({
      equipmentClassId: EQ_CLASS_ID,
      assetId: childId,
      caseTitle: 'Cavitation noise on Pump Alpha',
      symptomText: 'Loud cavitation crackling on suction flange',
      primarySuspectedCause: 'Low NPSH margin',
      caseStatus: 'SUBMITTED',
    }),
  });
  assert.equal(cRes.status, 201);
  const caseId = ((await cRes.json()) as any).case.case_id;

  const searchRes = await fetch(`${baseUrl}/api/v1/cases?q=cavitation+suction`, {
    headers: { authorization: `Bearer ${supTok}` },
  });
  assert.equal(searchRes.status, 200);
  const searchBody: any = await searchRes.json();
  assert.equal(searchBody.items.some((x: any) => x.case_id === caseId), true);

  // Cross-tenant case isolation
  assert.equal((await fetch(`${baseUrl}/api/v1/cases/${caseId}`, { headers: { authorization: `Bearer ${orgBTok}` } })).status, 404);

  // Soft-delete case & asset
  const delCase = await fetch(`${baseUrl}/api/v1/cases/${caseId}`, {
    method: 'DELETE',
    headers: { authorization: `Bearer ${supTok}` },
  });
  assert.equal(delCase.status, 200);
  assert.equal((await fetch(`${baseUrl}/api/v1/cases/${caseId}`, { headers: { authorization: `Bearer ${supTok}` } })).status, 404);

  assert.equal((await fetch(`${baseUrl}/api/v1/assets/${childId}`, { method: 'DELETE', headers: { authorization: `Bearer ${supTok}` } })).status, 200);
  assert.equal((await fetch(`${baseUrl}/api/v1/assets/${childId}`, { headers: { authorization: `Bearer ${supTok}` } })).status, 404);

  // Taxonomy endpoints
  const taxClasses = await fetch(`${baseUrl}/api/v1/taxonomy/equipment-classes`, { headers: { authorization: `Bearer ${supTok}` } });
  assert.equal(taxClasses.status, 200);
  assert.equal(((await taxClasses.json()) as any).items.some((c: any) => c.equipment_class_id === EQ_CLASS_ID), true);
  assert.equal((await fetch(`${baseUrl}/api/v1/taxonomy/subsystems`, { headers: { authorization: `Bearer ${supTok}` } })).status, 200);
  assert.equal((await fetch(`${baseUrl}/api/v1/taxonomy/failure-modes`, { headers: { authorization: `Bearer ${supTok}` } })).status, 200);
});
