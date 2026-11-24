# Structured Extraction Draft Workflow

This module extends the existing extraction project without changing its current files or dependencies.

## Components

- `draft-store.js`: local JSON-file persistence with create, retrieve, list and update operations.
- `draft-service.js`: creates drafts from the existing validated extractor output and manages review lifecycle.
- `draft-workflow.js`: connects the existing Gemini `Extractor` and `callLLM` to the draft workflow.
- `test-draft-workflow.js`: automated tests using a mock extractor; no API key is required.

## Run tests

From the project directory:

```bash
node --test test-draft-workflow.js
```

Existing project scripts and files are unchanged.

## Use the workflow

```js
const draftWorkflow = require('./draft-workflow');

const draft = await draftWorkflow.createFromTranscript(
  'The conveyor motor vibrates under heavy load.',
  { transcription_id: 'TRANSCRIPTION-ID', created_by: 'service' }
);

await draftWorkflow.submitForReview(draft.id, 'reviewer-id');
await draftWorkflow.editDraft(
  draft.id,
  { observation: 'Rattling sound near the motor housing' },
  'reviewer-id'
);
await draftWorkflow.approve(draft.id, 'reviewer-id', 'Verified');
```

Other methods: `getDraft(id)`, `listDrafts(filters)`, and `reject(id, reviewerId, reason)`.

## Data handling

The existing extraction contract is preserved exactly:
- A `null` field means that information was not stated.
- `uncertain_fields` contains fields that were stated but remain ambiguous.
- `missing_fields` is derived separately for reviewer visibility.

A draft starts as `DRAFT`, can move to `UNDER_REVIEW`, and then to `APPROVED` or `REJECTED`. Approval is blocked while missing or uncertain fields remain. Review actions are retained in the draft history.

## Integration boundary

The included JSON-file store is a local persistence adapter for development and demonstration. Connect the same store interface to the team's approved database persistence layer when available. This package does not claim PostgreSQL or frontend integration. Do not store unreviewed drafts as accepted troubleshooting knowledge.
