import type { Role } from '../../middleware/auth';

/** Roles that public signup may create. Everything else (ADMIN, RELIABILITY_ENGINEER) is rejected. */
export const SIGNUP_ROLES = ['TECHNICIAN', 'SUPERVISOR'] as const;
export type SignupRole = (typeof SIGNUP_ROLES)[number] & Role;

export interface NewUser {
  name: string;
  email: string;          // already trimmed + lower-cased
  passwordHash: string;   // bcrypt hash; the plain password never reaches this layer
  role: SignupRole;
}

/** What the API may reveal about an account. Deliberately has no password_hash. */
export interface PublicUser {
  id: string;
  name: string;
  email: string;
  role: Role;
  created_at: string;
}

/** Storage port (same idea as PipelineStore): the service depends on this, tests fake it. */
export interface UserStore {
  /** Organization new accounts join, resolved on the server. Null when it does not exist. */
  resolveSignupOrgId(organizationName: string): Promise<string | null>;
  /** Inserts inside that organization's tenant context. `created:false` means the email is already registered. */
  createUser(organizationId: string, user: NewUser): Promise<{ created: true; user: PublicUser } | { created: false }>;
}

export interface PasswordHasher {
  hash(plain: string): Promise<string>;
}
