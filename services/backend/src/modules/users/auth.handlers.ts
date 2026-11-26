import { asyncHandler, type Handler } from '../../http/types';
import type { LoginService } from './login.service';
import type { SignupService } from './signup.service';

/** Public (unauthenticated) account endpoints: signup and login. Logout/password reset come later. */
export function createAuthHandlers(signupService: SignupService, loginService?: LoginService) {
  /** POST /api/v1/auth/signup   body: { name, email, password, role: "technician" | "supervisor" } */
  const signup: Handler = asyncHandler(async (req, res) => {
    const user = await signupService.signup(req.body);
    res.status(201).json({ message: 'Account created successfully.', user });
  });

  /** POST /api/v1/auth/login   body: { email, password }   ->  200 { message, access_token, token_type, expires_in, user } */
  const login: Handler | undefined = loginService && asyncHandler(async (req, res) => {
    const result = await loginService.login(req.body);
    res.setHeader('Cache-Control', 'no-store');   // the response holds a credential: never let a browser/proxy cache it
    res.status(200).json({
      message: 'Login successful.',
      access_token: result.accessToken,
      token_type: result.tokenType,
      expires_in: result.expiresIn,
      user: result.user,
    });
  });

  return { signup, login };
}
