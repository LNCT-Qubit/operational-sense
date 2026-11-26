const { Pool } = require('pg');
const Extractor = require('./extractor');
const { callLLM } = require('./llm');
const DraftService = require('./draft-service');
const PostgresDraftStore = require('./draft-store-postgres');

function createPostgresDraftWorkflow({ organizationId, pool, connectionString } = {}) {
  const dbPool = pool || new Pool({
    connectionString: connectionString || process.env.DATABASE_URL,
    // Keep TLS policy controlled by the deployment environment.
    max: Number(process.env.PG_POOL_MAX || 5),
    idleTimeoutMillis: 30000,
    connectionTimeoutMillis: 10000
  });

  if (!pool && !connectionString && !process.env.DATABASE_URL) {
    throw new Error('Set DATABASE_URL or pass a PostgreSQL pool');
  }

  const tenantId = organizationId || process.env.ORGANIZATION_ID;
  if (!tenantId) throw new Error('Set ORGANIZATION_ID or pass organizationId');

  const store = new PostgresDraftStore({ pool: dbPool, organizationId: tenantId });
  const extractor = new Extractor(callLLM);
  const service = new DraftService(extractor, store);

  return {
    service,
    pool: dbPool,
    close: async () => { if (!pool) await dbPool.end(); }
  };
}

module.exports = { createPostgresDraftWorkflow };
