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
