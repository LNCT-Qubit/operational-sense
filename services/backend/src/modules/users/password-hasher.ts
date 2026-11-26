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
  return {
    hash: (plain: string) => bcrypt.hash(plain, rounds) as Promise<string>,
    // bcrypt.compare re-hashes `plain` with the salt and cost stored INSIDE `hash` and compares the results in
    // constant time. We never hash the login password ourselves and compare strings.
    compare: async (plain: string, hash: string) => {
      try {
        return (await bcrypt.compare(plain, hash)) === true;
      } catch {
        return false; // malformed hash in the database must look like "wrong password", not crash the request
      }
    },
  };
}
