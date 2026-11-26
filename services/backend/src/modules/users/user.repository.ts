import { withTenant, type PoolLike } from '../../database/tenant';
import { isUuid } from '../../middleware/auth';
import type { LoginRecord, LoginStore, NewUser, PublicUser, UserStore } from './user.types';

type Pool = PoolLike & { query(text: string, values?: unknown[]): Promise<{ rows: any[] }> };

const iso = (v: unknown): string => new Date(v as string).toISOString();

function mapUser(r: any): PublicUser {
  return { id: r.user_id, name: r.full_name, email: r.email, role: r.role, created_at: iso(r.created_at) };
}

export class PostgresUserStore implements UserStore, LoginStore {
  constructor(private readonly pool: Pool) {}

  /** Uses the SECURITY DEFINER function from migration 010: signup has no tenant context yet. */
  async resolveSignupOrgId(organizationName: string): Promise<string | null> {
    const { rows } = await this.pool.query('SELECT signup_org_id($1) AS organization_id', [organizationName]);
    const id = rows[0]?.organization_id;
    return isUuid(id) ? id.toLowerCase() : null;
  }

  async createUser(organizationId: string, u: NewUser): Promise<{ created: true; user: PublicUser } | { created: false }> {
    // withTenant sets app.current_org_id for this transaction, so the RLS insert policy accepts the row
    // only for this organization. All values are bind parameters ($1..$5): nothing is concatenated into SQL.
    return withTenant(this.pool, organizationId, async (db) => {
      const existing = await db.query('SELECT 1 FROM app_user WHERE lower(email) = $1', [u.email]);
      if (existing.rows.length > 0) return { created: false as const };

      // ON CONFLICT DO NOTHING is the safety net for two signups with the same email at the same instant
      // (and for an email already used in a different organization: the unique index is global).
      const ins = await db.query(
        `INSERT INTO app_user (organization_id, full_name, email, password_hash, role)
         VALUES ($1, $2, $3, $4, $5)
         ON CONFLICT DO NOTHING
         RETURNING user_id, full_name, email, role, created_at`,
        [organizationId, u.name, u.email, u.passwordHash, u.role],
      );
      if (ins.rows.length === 0) return { created: false as const };
      return { created: true as const, user: mapUser(ins.rows[0]) };
    });
  }

  /**
   * Login lookup, in two steps because app_user is protected by Row-Level Security:
   *   1. login_org_id(email) (SECURITY DEFINER, migration 011) returns ONLY the organization id for that email.
   *   2. withTenant() sets app.current_org_id to that organization, and the normal RLS-protected SELECT reads the
   *      full row (including password_hash, which the caller must never serialise).
   * The client never supplies an organization. If step 1 finds nothing, or step 2 returns no row, the answer is null.
   */
  async findLoginRecord(email: string): Promise<LoginRecord | null> {
    const lookup = await this.pool.query('SELECT login_org_id($1) AS organization_id', [email]);
    const found = lookup.rows[0]?.organization_id;
    if (!isUuid(found)) return null;
    const organizationId = found.toLowerCase();

    return withTenant(this.pool, organizationId, async (db) => {
      const { rows } = await db.query(
        `SELECT user_id, organization_id, full_name, email, password_hash, role, is_active
           FROM app_user
          WHERE lower(email) = $1`,
        [email],
      );
      const r = rows[0];
      if (!r) return null;
      return {
        id: r.user_id,
        organizationId: String(r.organization_id).toLowerCase(),
        name: r.full_name,
        email: r.email,
        role: r.role,
        passwordHash: r.password_hash,
        isActive: r.is_active === true,
      } as LoginRecord;
    });
  }
}
