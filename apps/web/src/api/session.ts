import type { AuthUser, LoginResult } from './auth';

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

export function getAccessToken(): string | null {
  return getSessionIfValid()?.accessToken ?? null;
}

function getSessionIfValid(): LoginResult | null {
  if (session && session.expiresAt <= Date.now()) {
    session = null;
  }

  return session;
}

export function getSessionUser(): AuthUser | null {
  return getSessionIfValid()?.user ?? null;
}