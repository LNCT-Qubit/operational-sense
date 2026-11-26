import type { AuthUser, LoginResult } from './auth';

/**
 * In-memory session. The JWT lives ONLY in this module-level variable (JavaScript memory of the current tab):
 *   + it is not in localStorage/sessionStorage/cookies, so a script injected by an XSS bug cannot simply read it
 *     back out of browser storage later;
 *   - it is lost on page refresh or when the tab closes, so the user signs in again.
 * Other code (for example a future recordings API module) reads the token with getAccessToken().
 */
let session: LoginResult | null = null;

export function setSession(result: LoginResult): void {
  session = result;
}

export function clearSession(): void {
  session = null;
}

export function getCurrentUser(): AuthUser | null {
  return getSessionIfValid()?.user ?? null;
}

/** The Bearer token for API calls, or null when signed out or expired. */
export function getAccessToken(): string | null {
  return getSessionIfValid()?.accessToken ?? null;
}

function getSessionIfValid(): LoginResult | null {
  if (session && session.expiresAt <= Date.now()) session = null;   // expired: behave as signed out
  return session;
}
