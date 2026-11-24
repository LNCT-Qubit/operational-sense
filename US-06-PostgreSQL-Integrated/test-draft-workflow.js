const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const DraftStore = require('./draft-store');
const DraftService = require('./draft-service');

const complete = {
  equipment: 'conveyor motor',
  symptom: 'vibrating unusually',
  operating_condition: 'under heavy load',
  observation: 'rattling sound near motor housing',
  uncertain_fields: []
};

async function setup(data = complete) {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'us06-workflow-'));
  const extractor = { extract: async () => ({ ok: true, data: structuredClone(data) }) };
  const service = new DraftService(extractor, new DraftStore(directory));
  return { service, cleanup: () => fs.rm(directory, { recursive: true, force: true }) };
}

test('creates and retrieves a draft with a unique ID and DRAFT status', async () => {
  const ctx = await setup({ ...complete, equipment: null, operating_condition: null });
  try {
    const draft = await ctx.service.createFromTranscript('The machine is vibrating.');
    assert.match(draft.id, /^[0-9a-f-]{36}$/i);
    assert.equal(draft.status, 'DRAFT');
    assert.deepEqual(draft.missing_fields, ['equipment', 'operating_condition']);
    assert.equal((await ctx.service.getDraft(draft.id)).id, draft.id);
  } finally { await ctx.cleanup(); }
});

test('lists drafts and filters by status and transcription', async () => {
  const ctx = await setup();
  try {
    await ctx.service.createFromTranscript('Motor vibration', { transcription_id: 'tr-01' });
    assert.equal((await ctx.service.listDrafts({ status: 'DRAFT', transcription_id: 'tr-01' })).length, 1);
    assert.equal((await ctx.service.listDrafts({ status: 'APPROVED' })).length, 0);
  } finally { await ctx.cleanup(); }
});

test('reviewer can submit, edit missing field and approve', async () => {
  const ctx = await setup({ ...complete, equipment: null });
  try {
    const draft = await ctx.service.createFromTranscript('The machine is vibrating.');
    await ctx.service.submitForReview(draft.id, 'reviewer-01');
    const edited = await ctx.service.editDraft(draft.id, { equipment: 'conveyor motor' }, 'reviewer-01');
    assert.deepEqual(edited.missing_fields, []);
    const approved = await ctx.service.approve(draft.id, 'reviewer-01', 'Verified');
    assert.equal(approved.status, 'APPROVED');
    assert.equal(approved.review.decision, 'APPROVED');
    assert.ok(approved.history.some((event) => event.action === 'FIELDS_EDITED'));
  } finally { await ctx.cleanup(); }
});

test('approval is blocked while information is missing or uncertain', async () => {
  const ctx = await setup({ ...complete, equipment: null, uncertain_fields: ['symptom'] });
  try {
    const draft = await ctx.service.createFromTranscript('A machine has a problem.');
    await ctx.service.submitForReview(draft.id, 'reviewer-01');
    await assert.rejects(() => ctx.service.approve(draft.id, 'reviewer-01'), /fields are missing/);
  } finally { await ctx.cleanup(); }
});

test('reject requires a reason and retains review decision', async () => {
  const ctx = await setup();
  try {
    const draft = await ctx.service.createFromTranscript('Motor vibration under load.');
    await assert.rejects(() => ctx.service.reject(draft.id, 'reviewer-01', '  '), /reason is required/);
    const rejected = await ctx.service.reject(draft.id, 'reviewer-01', 'Insufficient evidence');
    assert.equal(rejected.status, 'REJECTED');
    assert.equal(rejected.review.comment, 'Insufficient evidence');
  } finally { await ctx.cleanup(); }
});

test('prevents edits after final decision and rejects unsupported fields', async () => {
  const ctx = await setup();
  try {
    const draft = await ctx.service.createFromTranscript('Motor vibration under load.');
    await assert.rejects(() => ctx.service.editDraft(draft.id, { extra: 'value' }), /Unsupported/);
    await ctx.service.reject(draft.id, 'reviewer-01', 'Rejected');
    await assert.rejects(() => ctx.service.editDraft(draft.id, { symptom: 'changed' }), /Invalid status transition/);
  } finally { await ctx.cleanup(); }
});

test('does not misclassify null values as uncertain fields', async () => {
  const ctx = await setup({ ...complete, equipment: null, uncertain_fields: [] });
  try {
    const draft = await ctx.service.createFromTranscript('There is unusual vibration.');
    assert.deepEqual(draft.missing_fields, ['equipment']);
    assert.deepEqual(draft.extraction.uncertain_fields, []);
  } finally { await ctx.cleanup(); }
});
