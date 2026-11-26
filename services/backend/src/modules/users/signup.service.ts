import { ApiError, conflict } from '../../http/errors';
import type { Logger } from '../../http/logger';
import { validateSignup } from './signup.validation';
import type { PasswordHasher, PublicUser, UserStore } from './user.types';

export interface SignupOptions {
  /** Name of the organization new users join. Comes from server config, never from the request. */
  organizationName: string;
}

export class SignupService {
  constructor(
    private readonly store: UserStore,
    private readonly hasher: PasswordHasher,
    private readonly options: SignupOptions,
    private readonly logger: Logger,
  ) {}

  async signup(body: unknown): Promise<PublicUser> {
    const input = validateSignup(body);                          // 400 with field details if anything is wrong

    const organizationId = await this.store.resolveSignupOrgId(this.options.organizationName);
    if (!organizationId) {
      // Misconfiguration (migration 010 not applied, or SIGNUP_ORG_NAME wrong). Log the cause, tell the client nothing internal.
      this.logger.error('signup organization not found', { organization_name: this.options.organizationName });
      throw new ApiError(503, 'SIGNUP_UNAVAILABLE', 'Sign-up is temporarily unavailable. Please try again later.');
    }

    const passwordHash = await this.hasher.hash(input.password);  // plain password goes no further than this line
    const result = await this.store.createUser(organizationId, {
      name: input.name, email: input.email, passwordHash, role: input.role,
    });
    if (!result.created) throw conflict('EMAIL_ALREADY_REGISTERED', 'An account with this email already exists.');

    this.logger.info('user signed up', { user_id: result.user.id, role: result.user.role });   // no email/name/password in logs
    return result.user;
  }
}
