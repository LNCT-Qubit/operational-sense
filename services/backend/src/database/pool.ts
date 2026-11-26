import type { Logger } from '../http/logger';
import type { PoolLike } from './tenant';

/** Creates the shared node-postgres pool. `pg` is required lazily so other modules can be loaded (and tested) without it. */
export function createPool(databaseUrl: string): PoolLike & { end(): Promise<void>; query(text: string, values?: unknown[]): Promise<{ rows: any[] }> } {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const { Pool } = require('pg');
  return new Pool({
    connectionString: databaseUrl,
    max: Number(process.env.PG_POOL_MAX || 10),
    idleTimeoutMillis: 30_000,
    connectionTimeoutMillis: 10_000,
  });
}

/**
 * Fail-closed startup check (proposal Sec.6 "role check"): Row-Level Security is only a guarantee if the
 * application connects as a role that is neither SUPERUSER nor BYPASSRLS. Refuse to serve traffic otherwise.
 */
export async function assertAppRoleSafe(pool: { query(text: string): Promise<{ rows: any[] }> }, logger: Logger): Promise<void> {
  const { rows } = await pool.query('SELECT current_user AS name, rolsuper, rolbypassrls FROM pg_roles WHERE rolname = current_user');
  const role = rows[0];
  if (!role) throw new Error('Could not determine the database role in use');
  if (role.rolsuper || role.rolbypassrls) {
    throw new Error(`Database role "${role.name}" is SUPERUSER or BYPASSRLS, which silently disables tenant isolation. Connect as opsense_app.`);
  }
  logger.info('database role verified', { role: role.name });
}
