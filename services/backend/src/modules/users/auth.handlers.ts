import { asyncHandler, type Handler } from '../../http/types';
import type { SignupService } from './signup.service';

/** Public (unauthenticated) account endpoints. Only signup for now; login/JWT/logout come later. */
export function createAuthHandlers(signupService: SignupService) {
  /** POST /api/v1/auth/signup   body: { name, email, password, role: "technician" | "supervisor" } */
  const signup: Handler = asyncHandler(async (req, res) => {
    const user = await signupService.signup(req.body);
    res.status(201).json({ message: 'Account created successfully.', user });
  });
  return { signup };
}
