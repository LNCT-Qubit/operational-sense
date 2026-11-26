/**
 * DEVELOPMENT ONLY: mints a bearer token for manual testing, because no login/user module exists yet.
 *   JWT_SECRET=... npx tsx scripts/dev-token.ts <organization-uuid> <ROLE> [user-id]
 */
import { signJwtHs256, ROLES, isUuid } from '../src/middleware/auth';

const [org, role, user = 'dev-user'] = process.argv.slice(2);
const secret = process.env.JWT_SECRET ?? '';
if (!isUuid(org) || !(ROLES as readonly string[]).includes(role) || secret.length < 32) {
  console.error(`usage: JWT_SECRET=<32+ chars> tsx scripts/dev-token.ts <org-uuid> <${ROLES.join('|')}> [user-id]`);
  process.exit(2);
}
console.log(signJwtHs256({ sub: user, org, role, exp: Math.floor(Date.now() / 1000) + 8 * 3600 }, secret));
