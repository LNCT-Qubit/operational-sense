import type { PasswordHasher } from './user.types';

/**
 * bcrypt hashing via `bcryptjs` (pure JavaScript: no native build step, works on every machine).
 * Required lazily, exactly like `pg` in database/pool.ts, so unit tests that inject a fake hasher
 * can run without the package installed.
 * Each hash embeds its own random salt and the cost factor, so no separate salt column is needed.
 */
export function createBcryptHasher(rounds: number): PasswordHasher {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const bcrypt = require('bcryptjs');
  return { hash: (plain: string) => bcrypt.hash(plain, rounds) as Promise<string> };
}
