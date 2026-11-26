import { randomBytes } from 'node:crypto';
import { unauthorized } from '../../http/errors';
import type { Logger } from '../../http/logger';
import { signJwtHs256 } from '../../middleware/auth';
import { validateLogin } from './login.validation';
import type { LoginStore, PasswordHasher, PublicLoginUser } from './user.types';

export interface LoginOptions {
  /** HS256 signing secret: the SAME config.jwtSecret that authenticate() uses to verify tokens. */
  jwtSecret: string;
  /** Token lifetime in seconds (config JWT_EXPIRES_IN_SECONDS, default 8 hours). */
  tokenTtlSeconds: number;
}

export interface LoginResult {
  accessToken: string;
  tokenType: 'Bearer';
  expiresIn: number;
  user: PublicLoginUser;
}

/** One message + one code for EVERY authentication failure, so a caller cannot tell which check failed. */
const invalidCredentials = () => unauthorized('Invalid email or password.', 'INVALID_CREDENTIALS');

export class LoginService {
  /**
   * A real bcrypt hash (made with the configured cost) of a random value nobody knows. Used when the email is
   * unknown so that we still do one bcrypt.compare: otherwise "unknown email" would answer much faster than
   * "wrong password" and an attacker could use the response time to find out which emails are registered.
   */
  private readonly dummyHash: Promise<string>;

  constructor(
    private readonly store: LoginStore,
    private readonly hasher: PasswordHasher,
    private readonly options: LoginOptions,
    private readonly logger: Logger,
    private readonly clock: () => number = Date.now,
  ) {
    this.dummyHash = this.hasher.hash(randomBytes(24).toString('hex'));
    this.dummyHash.catch(() => { /* surfaced when awaited; avoids an unhandled-rejection crash at startup */ });
  }

  async login(body: unknown): Promise<LoginResult> {
    const { email, password } = validateLogin(body);                       // 400 for malformed requests

    const account = await this.store.findLoginRecord(email);               // null if the email is not registered

    // ALWAYS run exactly one bcrypt.compare (against the real hash, or the dummy one) before deciding.
    const passwordOk = await this.hasher.compare(password, account ? account.passwordHash : await this.dummyHash);

    if (!account || !passwordOk || !account.isActive) {
      // Reason goes to the server log only (never the email/password). The client gets the same 401 in all cases.
      const reason = !account ? 'unknown_email' : !passwordOk ? 'wrong_password' : 'inactive_account';
      this.logger.info('login rejected', { reason });
      throw invalidCredentials();
    }

    const nowSec = Math.floor(this.clock() / 1000);
    const expiresIn = this.options.tokenTtlSeconds;
    // Claims come ONLY from the database row. Nothing from the request body is used.
    const accessToken = signJwtHs256(
      { sub: account.id, org: account.organizationId, role: account.role, iat: nowSec, exp: nowSec + expiresIn },
      this.options.jwtSecret,
    );

    this.logger.info('user logged in', { user_id: account.id, role: account.role });   // no email/token/password in logs
    return {
      accessToken,
      tokenType: 'Bearer',
      expiresIn,
      user: { id: account.id, name: account.name, email: account.email, role: account.role },
    };
  }
}
