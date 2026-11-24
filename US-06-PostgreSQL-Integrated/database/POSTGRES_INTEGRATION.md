# PostgreSQL integration

This integration persists US-06 extraction drafts in the existing `opsense`
PostgreSQL database. It does not write unreviewed extraction output into
`operational_case`.

## 1. Apply the additive migration

Copy `008_extraction_drafts.sql` into the database repository's `migrations`
directory. Apply it after `007_row_level_security.sql`:

```bash
docker exec -i opsense-db psql -v ON_ERROR_STOP=1 -U postgres -d opsense \
  < migrations/008_extraction_drafts.sql
```

The migration creates `extraction_draft`, indexes, tenant RLS policies and
`opsense_app` grants. It does not alter existing tables.

## 2. Install the PostgreSQL driver

From the US-06 project directory:

```bash
npm install pg
```

## 3. Configure environment

Set these values in the local environment (do not commit credentials):

```env
DATABASE_URL=postgresql://opsense_app:YOUR_PASSWORD@localhost:5432/opsense
ORGANIZATION_ID=YOUR-ORGANIZATION-UUID
GEMINI_API_KEY=YOUR-GEMINI-KEY
GEMINI_MODEL=YOUR-CONFIGURED-GEMINI-MODEL
```

Use the real organization UUID from the `organization` table. The supplied
database documentation's development tenant UUID is only a sample; confirm
that it exists in the database you are connecting to. The supplied RLS
migration's `opsense_app_dev` password is documented for local development
only and should be changed in any shared environment.

## 4. Use the PostgreSQL-backed workflow

```js
const { createPostgresDraftWorkflow } = require('./draft-workflow-postgres');

async function run(transcript, transcriptionId) {
  const workflow = createPostgresDraftWorkflow();

  try {
    const draft = await workflow.service.createFromTranscript(transcript, {
      transcription_id: transcriptionId,
      created_by: 'us06-service'
    });
    console.log('Saved draft:', draft.id, draft.status);
    return draft;
  } finally {
    await workflow.close();
  }
}
```

The returned `service` supports the existing methods:
`createFromTranscript`, `getDraft`, `listDrafts`, `submitForReview`,
`editDraft`, `approve`, and `reject`.

## 5. Verify the database row

After creating a draft, use a privileged local database session to inspect it:

```sql
SELECT id, organization_id, transcription_id, status,
       missing_fields, created_at, updated_at
FROM extraction_draft
ORDER BY created_at DESC
LIMIT 10;
```

For application access, each repository operation starts a transaction and
sets `app.current_org_id` using `set_config(..., true)`. The app role must be
`opsense_app`, not `postgres`, so RLS is actually enforced.

## Contract and integration notes

- `transcription_id` is nullable text for now because the supplied database
  package does not define a canonical US-05 transcription table.
- `organization_id` is mandatory and is supplied by the authenticated tenant
  context, not by the LLM.
- Missing fields are stored separately from `uncertain_fields`, preserving
  the existing US-06 extraction contract.
- `APPROVED` here means the extraction draft was reviewed. It does not
  automatically create or verify an `operational_case`.
- The adapter reuses the current `DraftService` interface; the local JSON
  adapter remains available for tests and offline development.
- A live database connection cannot be verified without access to the team's
  running PostgreSQL instance and its connection settings.
