// Backend base URL comes from the environment (VITE_API_BASE_URL). When it is empty the app calls its own origin,
// and the Vite dev server proxies /api to the backend (see vite.config.ts), so no URL is hard-coded here.
const API_BASE_URL = (import.meta.env.VITE_API_BASE_URL ?? '').replace(/\/+$/, '');

export interface SignupInput {
  name: string;
  email: string;
  password: string;
  role: 'technician' | 'supervisor';
}

export class ApiRequestError extends Error {
  readonly fieldIssues: string[];
  constructor(message: string, fieldIssues: string[] = []) {
    super(message);
    this.fieldIssues = fieldIssues;
  }
}

export async function signupRequest(input: SignupInput): Promise<void> {
  let response: Response;
  try {
    response = await fetch(`${API_BASE_URL}/api/v1/auth/signup`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(input),
    });
  } catch {
    throw new ApiRequestError('Could not reach the server. Check your connection and try again.');
  }
  if (response.ok) return;

  let message = 'Sign-up failed. Please try again.';
  let issues: string[] = [];
  try {
    const body = await response.json();
    if (body?.error?.message) message = String(body.error.message);
    if (Array.isArray(body?.error?.details)) {
      issues = body.error.details.map((d: { issue?: unknown }) => String(d.issue ?? '')).filter(Boolean);
    }
  } catch {
    /* non-JSON error body: keep the generic message */
  }
  throw new ApiRequestError(message, issues);
}

// ---------------------------------------------------------------------------------------------------------------
// Login
// ---------------------------------------------------------------------------------------------------------------

/** Roles exactly as the backend stores them (services/backend/src/middleware/auth.ts ROLES). */
export type BackendRole = 'TECHNICIAN' | 'SUPERVISOR' | 'RELIABILITY_ENGINEER' | 'ADMIN';

/** Public account info returned by the backend. There is never a password or hash in it. */
export interface AuthUser {
  id: string;
  name: string;
  email: string;
  role: BackendRole;
}

export interface LoginResult {
  accessToken: string;
  /** Epoch milliseconds after which the token is no longer valid (computed from the backend's expires_in). */
  expiresAt: number;
  user: AuthUser;
}

/** Where each role's workspace lives. Roles without a workspace in this app yet map to null. */
export function workspacePathForRole(role: BackendRole): string | null {
  if (role === 'SUPERVISOR') return '/supervisor';
  if (role === 'TECHNICIAN') return '/technician';
  return null;
}

interface LoginResponseBody {
  error?: {
    message?: unknown;
    details?: Array<{ issue?: unknown }>;
  };
  access_token?: unknown;
  expires_in?: unknown;
  user?: {
    id?: unknown;
    name?: unknown;
    email?: unknown;
    role?: unknown;
  };
}

/**
 * POST /api/v1/auth/login. Sends ONLY email and password: the backend decides the user's role and organization.
 * Throws ApiRequestError with a message that is safe to show on screen.
 */
export async function loginRequest(email: string, password: string): Promise<LoginResult> {
  let response: Response;
  try {
    response = await fetch(`${API_BASE_URL}/api/v1/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: email.trim(), password }),   // password is sent exactly as typed
    });
  } catch {
    throw new ApiRequestError('Could not reach the server. Check your connection and try again.');
  }

  let body: LoginResponseBody | null = null;
  try {
    body = (await response.json()) as LoginResponseBody | null;
  } catch {
    /* non-JSON body: handled below */
  }

  if (!response.ok) {
    let message = 'Sign-in failed. Please try again.';
    let issues: string[] = [];
    if (body?.error?.message) message = String(body.error.message);
    if (Array.isArray(body?.error?.details)) {
      issues = body.error.details.map((d: { issue?: unknown }) => String(d.issue ?? '')).filter(Boolean);
    }
    throw new ApiRequestError(message, issues);
  }

  const u = body?.user;
  if (
    typeof body?.access_token !== 'string' ||
    typeof body?.expires_in !== 'number' ||
    !u ||
    typeof u.id !== 'string' ||
    typeof u.name !== 'string' ||
    typeof u.email !== 'string' ||
    typeof u.role !== 'string'
  ) {
    throw new ApiRequestError('Unexpected response from the server. Please try again.');
  }

  return {
    accessToken: body.access_token,
    expiresAt: Date.now() + body.expires_in * 1000,
    user: { id: u.id, name: u.name, email: u.email, role: u.role as BackendRole },
  };
}
