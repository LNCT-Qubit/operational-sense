import { isUuid } from '../middleware/auth';

// Structural types: node-postgres' Pool/PoolClient satisfy these, tests can fake them.
export interface QueryResult { rows: any[]; rowCount: number | null }
export interface Queryable { query(text: string, values?: unknown[]): Promise<QueryResult> }
export interface PoolClientLike extends Queryable { release(err?: unknown): void }
export interface PoolLike { connect(): Promise<PoolClientLike> }

/**
 * Runs `fn` inside ONE transaction whose first statement sets the tenant context for Row-Level Security.
 * `set_config(..., true)` is transaction-local, so the setting disappears at COMMIT/ROLLBACK and can never
 * leak to the next request that reuses the pooled connection (proposal Sec.6). The org id is passed as a bind
 * parameter, never concatenated into SQL. This is the same pattern US-06's PostgresDraftStore uses.
 */
export async function withTenant<T>(pool: PoolLike, organizationId: string, fn: (db: Queryable) => Promise<T>): Promise<T> {
  if (!isUuid(organizationId)) throw new TypeError('A valid organization UUID is required');
  const client = await pool.connect();
  let discard: unknown = undefined;
  try {
    await client.query('BEGIN');
    await client.query("SELECT set_config('app.current_org_id', $1, true)", [organizationId]);
    const result = await fn(client);
    await client.query('COMMIT');
    return result;
  } catch (err) {
    try {
      await client.query('ROLLBACK');
    } catch (rollbackErr) {
      discard = rollbackErr; // connection state unknown: tell the pool to destroy it, not reuse it
    }
    throw err;
  } finally {
    client.release(discard);
  }
}
