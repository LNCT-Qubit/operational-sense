const { randomUUID } = require('node:crypto');
const { FIELDS } = require('./extraction.schema');

const FINAL_STATUSES = ['APPROVED', 'REJECTED'];

class DraftService {
  constructor(extractor, store) {
    if (!extractor || typeof extractor.extract !== 'function') {
      throw new TypeError('A compatible Extractor instance is required');
    }
    if (!store || !['create', 'get', 'list', 'update'].every((method) => typeof store[method] === 'function')) {
      throw new TypeError('A compatible draft store is required');
    }
    this.extractor = extractor;
    this.store = store;
  }

  validateExtraction(data) {
    if (!data || typeof data !== 'object' || Array.isArray(data)) {
      throw new Error('Extraction result must be an object');
    }
    for (const field of FIELDS) {
      if (!(field in data) || (data[field] !== null && typeof data[field] !== 'string')) {
        throw new Error(`Invalid extraction field: ${field}`);
      }
    }
    if (!Array.isArray(data.uncertain_fields) ||
        data.uncertain_fields.some((field) => !FIELDS.includes(field)) ||
        data.uncertain_fields.some((field) => data[field] === null)) {
      throw new Error('Invalid uncertain_fields: only present but ambiguous fields may be listed');
    }
  }

  async createFromTranscript(transcript, metadata = {}) {
    if (typeof transcript !== 'string' || !transcript.trim()) {
      throw new Error('Transcript must be a non-empty string');
    }

    const result = await this.extractor.extract(transcript);
    if (!result.ok) throw new Error(`Extraction failed: ${result.error}`);
    this.validateExtraction(result.data);

    const now = new Date().toISOString();
    const missingFields = FIELDS.filter((field) => result.data[field] === null);
    const draft = {
      id: randomUUID(),
      transcription_id: metadata.transcription_id || null,
      transcript: transcript.trim(),
      extraction: result.data,
      missing_fields: missingFields,
      status: 'DRAFT',
      review: {
        reviewer_id: null,
        decision: null,
        comment: null,
        reviewed_at: null
      },
      history: [{
        action: 'CREATED',
        actor: metadata.created_by || 'system',
        timestamp: now
      }],
      created_at: now,
      updated_at: now
    };
    return this.store.create(draft);
  }

  async getDraft(id) {
    const draft = await this.store.get(id);
    if (!draft) throw new Error('Draft not found');
    return draft;
  }

  async listDrafts({ status, transcription_id } = {}) {
    let drafts = await this.store.list();
    if (status) drafts = drafts.filter((draft) => draft.status === status);
    if (transcription_id) drafts = drafts.filter((draft) => draft.transcription_id === transcription_id);
    return drafts;
  }

  async submitForReview(id, reviewerId) {
    const draft = await this.getDraft(id);
    this.assertStatus(draft, ['DRAFT']);
    draft.status = 'UNDER_REVIEW';
    this.record(draft, 'SUBMITTED_FOR_REVIEW', reviewerId);
    return this.store.update(draft);
  }

  async editDraft(id, changes, reviewerId) {
    const draft = await this.getDraft(id);
    this.assertStatus(draft, ['DRAFT', 'UNDER_REVIEW']);
    if (!changes || typeof changes !== 'object' || Array.isArray(changes) || !Object.keys(changes).length) {
      throw new Error('Provide at least one field to update');
    }

    for (const [field, value] of Object.entries(changes)) {
      if (!FIELDS.includes(field)) throw new Error(`Unsupported extraction field: ${field}`);
      if (value !== null && (typeof value !== 'string' || !value.trim())) {
        throw new Error(`${field} must be a non-empty string or null`);
      }
      draft.extraction[field] = typeof value === 'string' ? value.trim() : null;
    }

    // A reviewer edit resolves uncertainty for that specific field.
    draft.extraction.uncertain_fields =
      draft.extraction.uncertain_fields.filter((field) => !Object.hasOwn(changes, field));
    draft.missing_fields = FIELDS.filter((field) => draft.extraction[field] === null);
    this.record(draft, 'FIELDS_EDITED', reviewerId, { fields: Object.keys(changes) });
    return this.store.update(draft);
  }

  async approve(id, reviewerId, comment = null) {
    const draft = await this.getDraft(id);
    this.assertStatus(draft, ['UNDER_REVIEW']);
    if (draft.missing_fields.length) {
      throw new Error(`Cannot approve while fields are missing: ${draft.missing_fields.join(', ')}`);
    }
    if (draft.extraction.uncertain_fields.length) {
      throw new Error(`Cannot approve while fields are uncertain: ${draft.extraction.uncertain_fields.join(', ')}`);
    }
    draft.status = 'APPROVED';
    draft.review = {
      reviewer_id: reviewerId || null,
      decision: 'APPROVED',
      comment,
      reviewed_at: new Date().toISOString()
    };
    this.record(draft, 'APPROVED', reviewerId, { comment });
    return this.store.update(draft);
  }

  async reject(id, reviewerId, reason) {
    if (typeof reason !== 'string' || !reason.trim()) {
      throw new Error('A rejection reason is required');
    }
    const draft = await this.getDraft(id);
    this.assertStatus(draft, ['DRAFT', 'UNDER_REVIEW']);
    draft.status = 'REJECTED';
    draft.review = {
      reviewer_id: reviewerId || null,
      decision: 'REJECTED',
      comment: reason.trim(),
      reviewed_at: new Date().toISOString()
    };
    this.record(draft, 'REJECTED', reviewerId, { reason: reason.trim() });
    return this.store.update(draft);
  }

  assertStatus(draft, allowed) {
    if (!allowed.includes(draft.status)) {
      throw new Error(`Invalid status transition from ${draft.status}`);
    }
  }

  record(draft, action, actor, details = {}) {
    const timestamp = new Date().toISOString();
    draft.history.push({ action, actor: actor || 'system', timestamp, details });
    draft.updated_at = timestamp;
  }
}

module.exports = DraftService;
