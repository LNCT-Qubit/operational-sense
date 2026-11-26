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
  /** True only if `plain` matches the stored bcrypt `hash`. Never throws for a malformed hash: returns false. */
  compare(plain: string, hash: string): Promise<boolean>;
}

/**
 * Everything login needs about an account. Includes passwordHash, so this type lives ONLY between the
 * repository and LoginService: it is never serialised into an API response (see PublicLoginUser below).
 */
export interface LoginRecord {
  id: string;
  organizationId: string;
  name: string;
  email: string;
  role: Role;
  passwordHash: string;
  isActive: boolean;
}

/** Storage port for login (separate from UserStore so signup code and its tests are untouched). */
export interface LoginStore {
  /** Finds the account by normalised email. Resolves the organization itself. Null when no such account. */
  findLoginRecord(email: string): Promise<LoginRecord | null>;
}

/** What the login response may reveal about the account. */
export interface PublicLoginUser {
  id: string;
  name: string;
  email: string;
  role: Role;
}
