import React, { useState } from 'react';
import { useNavigate } from 'react-router';
import { ApiRequestError, loginRequest, signupRequest, workspacePathForRole } from '../api/auth';
import { clearSession, setSession } from '../api/session';

export type UserRole = 'supervisor' | 'technician';
export type AuthMode = 'login' | 'signup';

interface LandingPageProps {
  appName?: string;
  initialMode?: AuthMode;
  onAuthSuccess?: (email: string, role: UserRole, mode: AuthMode) => void;
}

export const LandingPage: React.FC<LandingPageProps> = ({
  appName = 'Operational Sense',
  initialMode = 'login',
  onAuthSuccess,
}) => {
  const [authMode, setAuthMode] = useState<AuthMode>(initialMode);
  const [name, setName] = useState<string>('');
  const [email, setEmail] = useState<string>('');
  const [password, setPassword] = useState<string>('');
  const [showPassword, setShowPassword] = useState<boolean>(false);
  const [selectedRole, setSelectedRole] = useState<UserRole>('supervisor');
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [formMessage, setFormMessage] = useState<{ kind: 'error' | 'success'; text: string } | null>(null);

  const navigate = useNavigate();

  const handleSignup = async () => {
    setFormMessage(null);
    setIsLoading(true);
    try {
      await signupRequest({ name: name.trim(), email: email.trim(), password, role: selectedRole });
      // Account created. Login/session handling is a separate task, so send the user to the sign-in form.
      setPassword('');
      setName('');
      setAuthMode('login');
      setFormMessage({ kind: 'success', text: 'Account created successfully. Please sign in.' });
    } catch (err) {
      const issues = err instanceof ApiRequestError ? err.fieldIssues : [];
      const text = issues.length > 0 ? issues.join(' ') : err instanceof Error ? err.message : 'Sign-up failed. Please try again.';
      setFormMessage({ kind: 'error', text });
    } finally {
      setIsLoading(false);
    }
  };

  const handleLogin = async () => {
    setFormMessage(null);
    setIsLoading(true);
    try {
      // Only email + password are sent. The backend looks the account up and decides the role.
      const result = await loginRequest(email, password);
      const target = workspacePathForRole(result.user.role);
      if (!target) {
        clearSession();
        setFormMessage({ kind: 'error', text: 'Your account does not have a workspace in this app yet.' });
        return;
      }
      setSession(result);          // token is kept in memory only (see api/session.ts)
      setPassword('');
      if (onAuthSuccess) {
        onAuthSuccess(result.user.email, result.user.role === 'SUPERVISOR' ? 'supervisor' : 'technician', 'login');
      }
      navigate(target);            // workspace comes from the role stored in the database, never from the screen
    } catch (err) {
      const issues = err instanceof ApiRequestError ? err.fieldIssues : [];
      const text = issues.length > 0 ? issues.join(' ') : err instanceof Error ? err.message : 'Sign-in failed. Please try again.';
      setFormMessage({ kind: 'error', text });
    } finally {
      setIsLoading(false);
    }
  };

  const handleAuthSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (isLoading) return; // ignore repeated submissions while a request is running
    if (authMode === 'signup') {
      void handleSignup();
      return;
    }
    void handleLogin();
  };

  const bgImageUrl =
    'https://encrypted-tbn0.gstatic.com/images?q=tbn:ANd9GcS5kHAcMWLoZoDgq2KN_kYBDxsco5iLK53T7WC8O3sBnPIPMTnahBBZl2w&s=10';

  return (
    <div className="min-h-screen w-full flex flex-col lg:flex-row bg-[#FAFCFD] text-[#132535] font-sans antialiased">
      {/* ========================================================= */}
      {/* LEFT PANEL: HERO & BRANDING WITH BACKGROUND IMAGE         */}
      {/* ========================================================= */}
      <div
        className="w-full lg:w-[54%] min-h-[560px] lg:min-h-screen relative flex flex-col justify-between p-6 sm:p-10 lg:p-12 xl:p-14 overflow-hidden text-white"
        style={{
          backgroundImage: `linear-gradient(135deg, rgba(8, 103, 122, 0.92) 0%, rgba(40, 54, 61, 0.94) 60%, rgba(19, 37, 53, 0.98) 100%), url("${bgImageUrl}")`,
          backgroundSize: 'cover',
          backgroundPosition: 'center',
          backgroundColor: '#28363D',
        }}
      >
        {/* Subtle decorative pattern overlay */}
        <div className="absolute inset-0 opacity-10 pointer-events-none bg-[radial-gradient(#fff_1px,transparent_1px)] [background-size:20px_20px]" />

        {/* TOP: Brand Lockup & Live Status Badge */}
        <div className="relative z-10 flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <span
              className="w-10 h-10 rounded-xl flex items-center justify-center text-white shadow-md"
              style={{ backgroundColor: '#F47720' }}
            >
              {/* Gear icon */}
              <svg className="w-5 h-5 fill-current" viewBox="0 0 24 24">
                <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z" />
                <circle cx="12" cy="12" r="3" />
              </svg>
            </span>
            <div>
              <span className="block text-sm font-bold tracking-wider uppercase text-white leading-tight">
                Workshop Note
              </span>
              <span className="block text-[11px] font-medium tracking-widest uppercase text-white/70">
                Operational Sense Platform
              </span>
            </div>
          </div>

          {/* Live Online Badge */}
          <div className="hidden sm:inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-white/10 backdrop-blur-sm border border-white/15 text-xs text-white/90">
            <span className="w-2 h-2 rounded-full bg-[#65C78C] animate-pulse" />
            <span>Field & Supervisor Mesh Active</span>
          </div>
        </div>

        {/* CENTER: Main Value Proposition */}
        <div className="relative z-10 my-auto py-8 lg:py-10">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full text-xs font-bold tracking-wider uppercase mb-5 bg-[#F47720]/25 text-[#F47720] border border-[#F47720]/40">
            <span>PMS Failure Prevention</span>
            <span>·</span>
            <span>Knowledge Preservation</span>
          </div>

          <h1 className="text-3xl sm:text-4xl lg:text-5xl font-extrabold tracking-tight leading-tight text-white max-w-xl">
            Every machine has a story.
            <span className="block mt-1 text-[#F47720]">Capture it before it's lost.</span>
          </h1>

          <p className="mt-4 text-white/85 text-sm sm:text-base max-w-lg leading-relaxed">
            Operational Sense bridges on-site technician field capture with structured supervisor review.
            Turn troubleshooting insights into verified organizational knowledge.
          </p>

          {/* TWO WORKSPACE PREVIEW CARDS (Technician & Supervisor) */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5 mt-8 max-w-xl">
            {/* Technician Card Reference */}
            <div className="p-4 rounded-xl bg-white/10 backdrop-blur-md border border-white/15 hover:bg-white/15 transition-all">
              <div className="flex items-center justify-between mb-2">
                <span className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-white">
                  <svg className="w-4 h-4 text-[#F47720]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <rect x="9" y="2.5" width="6" height="11" rx="3" strokeWidth="2" />
                    <path d="M5.5 10a6.5 6.5 0 0 0 13 0M12 17v4m-3 0h6" strokeWidth="2" strokeLinecap="round" />
                  </svg>
                  Technician
                </span>
                <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-[#F47720]/30 text-white">
                  30s Audio Note
                </span>
              </div>
              <p className="text-xs text-white/80 leading-normal">
                Hands-free voice capture in the field, offline local draft persistence, and instant equipment context tagging.
              </p>
            </div>

            {/* Supervisor Card Reference */}
            <div className="p-4 rounded-xl bg-white/10 backdrop-blur-md border border-white/15 hover:bg-white/15 transition-all">
              <div className="flex items-center justify-between mb-2">
                <span className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-white">
                  <svg className="w-4 h-4 text-[#65C78C]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
                  </svg>
                  Supervisor
                </span>
                <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-[#08677A] text-white">
                  Review Queue
                </span>
              </div>
              <p className="text-xs text-white/80 leading-normal">
                Structured approve/reject decision desk, case history audit, and verified maintenance case indexing.
              </p>
            </div>
          </div>
        </div>

        {/* BOTTOM: Step Pipeline & Copyright */}
        <div className="relative z-10 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs text-white/60 pt-4 border-t border-white/15">
          <div className="flex items-center gap-2">
            <span className="font-semibold text-white/90">Standard Pipeline:</span>
            <span>01 Capture → 02 Review → 03 Archive</span>
          </div>
          <div>© {new Date().getFullYear()} {appName}. All rights reserved.</div>
        </div>
      </div>

      {/* ========================================================= */}
      {/* RIGHT PANEL: AUTHENTICATION & DIRECT NAVIGATION           */}
      {/* ========================================================= */}
      <div className="w-full lg:w-[46%] flex flex-col justify-between p-6 sm:p-10 lg:p-12 xl:p-14 min-h-screen bg-[#FAFCFD]">
        {/* Top Header: Brand & Mode Toggle */}
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-2">
            <span
              className="w-3 h-3 rounded-full"
              style={{ backgroundColor: '#08677A' }}
            />
            <span className="text-xl font-bold tracking-tight text-[#132535]">
              {appName}
            </span>
          </div>

          {authMode === 'login' ? (
            <button
              type="button"
              onClick={() => setAuthMode('signup')}
              className="text-xs sm:text-sm font-semibold px-4 py-2 rounded-xl transition cursor-pointer"
              style={{
                color: '#08677A',
                backgroundColor: '#E8F1F6',
              }}
            >
              Create Account &rarr;
            </button>
          ) : (
            <button
              type="button"
              onClick={() => setAuthMode('login')}
              className="text-xs sm:text-sm font-semibold text-gray-700 bg-gray-100 hover:bg-gray-200 px-4 py-2 rounded-xl transition cursor-pointer"
            >
              &larr; Back to Login
            </button>
          )}
        </div>

        {/* Main Form Container */}
        <div className="my-auto w-full max-w-md mx-auto py-2">
          {/* Section Heading */}
          <div>
            <span
              className="text-xs font-extrabold uppercase tracking-widest"
              style={{ color: '#08677A' }}
            >
              Authentication
            </span>
            <h2 className="text-2xl sm:text-3xl font-extrabold text-[#132535] tracking-tight mt-1">
              {authMode === 'login' ? 'Welcome Back!' : 'Join the Team'}
            </h2>
            <p className="mt-1 text-xs sm:text-sm text-[#64747C]">
              {authMode === 'login'
                ? 'Sign in to access your supervisor or technician workspace.'
                : 'Register your account to begin documenting and reviewing field operations.'}
            </p>
          </div>

          {/* Role picker is for SIGN UP only. At login the role comes from the database, never from this screen. */}
          {authMode === 'signup' && (
            <>
          {/* ========================================================= */}
          {/* ROLE SELECTOR (Supervisor vs Technician)                  */}
          {/* ========================================================= */}
          <div className="mt-5">
            <label className="block text-xs font-bold text-[#28363D] uppercase tracking-wider mb-2">
              Select Your Role
            </label>
            <div
              className="grid grid-cols-2 gap-2 p-1.5 rounded-xl border"
              style={{ backgroundColor: '#E8F1F6', borderColor: '#D5E0E5' }}
            >
              {/* Supervisor Tab */}
              <button
                type="button"
                onClick={() => setSelectedRole('supervisor')}
                className={`flex items-center justify-center gap-2 py-2.5 px-3 rounded-lg text-xs sm:text-sm font-bold transition-all duration-150 cursor-pointer ${
                  selectedRole === 'supervisor'
                    ? 'text-white shadow-sm'
                    : 'text-[#64747C] hover:text-[#132535]'
                }`}
                style={
                  selectedRole === 'supervisor'
                    ? { backgroundColor: '#08677A' }
                    : {}
                }
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
                </svg>
                Supervisor
              </button>

              {/* Technician Tab */}
              <button
                type="button"
                onClick={() => setSelectedRole('technician')}
                className={`flex items-center justify-center gap-2 py-2.5 px-3 rounded-lg text-xs sm:text-sm font-bold transition-all duration-150 cursor-pointer ${
                  selectedRole === 'technician'
                    ? 'text-white shadow-sm'
                    : 'text-[#64747C] hover:text-[#132535]'
                }`}
                style={
                  selectedRole === 'technician'
                    ? { backgroundColor: '#F47720' }
                    : {}
                }
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <rect x="9" y="2.5" width="6" height="11" rx="3" strokeWidth="2" />
                  <path d="M5.5 10a6.5 6.5 0 0 0 13 0M12 17v4m-3 0h6" strokeWidth="2" strokeLinecap="round" />
                </svg>
                Technician
              </button>
            </div>
          </div>
            </>
          )}

          {/* FORM */}
          <form onSubmit={handleAuthSubmit} className="mt-4 space-y-3.5">
            {/* Full Name Field (Sign Up mode only) */}
            {authMode === 'signup' && (
              <div>
                <label className="block text-xs font-semibold text-[#64747C] mb-1">Full Name</label>
                <input
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="e.g. Alex Morgan"
                  className="w-full px-3.5 py-2.5 text-sm rounded-xl border border-[#D5E0E5] bg-white text-[#132535] outline-none transition focus:border-[#08677A] focus:ring-2 focus:ring-[#08677A]/20"
                  required
                />
              </div>
            )}

            {/* Email Input */}
            <div>
              <label className="block text-xs font-semibold text-[#64747C] mb-1">Company Email</label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="name@company.com"
                className="w-full px-3.5 py-2.5 text-sm rounded-xl border border-[#D5E0E5] bg-white text-[#132535] outline-none transition focus:border-[#08677A] focus:ring-2 focus:ring-[#08677A]/20"
                required
              />
            </div>

            {/* Password Input */}
            {/* Password Input */}
<div>
  <label className="block text-xs font-semibold text-[#64747C] mb-1">Password</label>

  <div className="relative">
    <input
      type={showPassword ? 'text' : 'password'}
      value={password}
      onChange={(e) => setPassword(e.target.value)}
      placeholder={authMode === 'signup' ? 'Create a secure password' : 'Enter your password'}
      className="w-full px-3.5 py-2.5 pr-11 text-sm rounded-xl border border-[#D5E0E5] bg-white text-[#132535] outline-none transition focus:border-[#08677A] focus:ring-2 focus:ring-[#08677A]/20"
      required
    />

    <button
      type="button"
      onClick={() => setShowPassword((current) => !current)}
      className="absolute right-3 top-1/2 -translate-y-1/2 text-[#64747C] hover:text-[#08677A]"
      aria-label={showPassword ? 'Hide password' : 'Show password'}
    >
      {showPassword ? (
        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M3 3l18 18M10.6 10.6a2 2 0 002.8 2.8M9.9 5.2A10.9 10.9 0 0112 5c5 0 9.3 3.1 11 7-0.7 1.7-1.9 3.1-3.4 4.3M6.2 6.2C4.4 7.3 3.1 9 2 12c1.7 3.9 6 7 10 7 1.2 0 2.3-.2 3.3-.6" />
        </svg>
      ) : (
        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12z" />
          <circle cx="12" cy="12" r="3" strokeWidth="2" />
        </svg>
      )}
    </button>
  </div>
</div>

            {/* Result of the last sign-up / sign-in attempt (renders only after one) */}
            {formMessage && (
              <p
                role={formMessage.kind === 'error' ? 'alert' : 'status'}
                className={`text-xs font-semibold ${formMessage.kind === 'error' ? 'text-red-600' : 'text-[#2E7D4F]'}`}
              >
                {formMessage.text}
              </p>
            )}

            {/* Submit Action Button */}
            <button
              type="submit"
              disabled={isLoading}
              className="w-full text-white font-bold py-3 px-4 rounded-xl text-center text-sm transition-all duration-200 mt-5 shadow-md active:scale-[0.99] disabled:opacity-70 cursor-pointer flex items-center justify-center gap-2"
              style={{
                backgroundColor: authMode === 'login' || selectedRole === 'supervisor' ? '#08677A' : '#F47720',
              }}
            >
              {isLoading ? (
                <span>{authMode === 'login' ? 'Signing in…' : 'Authorizing…'}</span>
              ) : (
                <>
                  <span>
                    {authMode === 'signup'
                      ? `Sign Up as ${selectedRole === 'supervisor' ? 'Supervisor' : 'Technician'}`
                      : 'Sign In'}
                  </span>
                  <span>&rarr;</span>
                </>
              )}
            </button>

            {/* Google Social Login */}
            <button
              type="button"
              className="w-full border border-[#D5E0E5] bg-white hover:bg-[#E8F1F6] text-[#132535] font-semibold py-2.5 px-4 rounded-xl flex items-center justify-center gap-2.5 text-xs sm:text-sm transition duration-150 cursor-pointer shadow-xs"
            >
              <svg className="w-4 h-4" viewBox="0 0 24 24">
                <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
                <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
                <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z" />
                <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z" />
              </svg>
              <span>{authMode === 'signup' ? 'Sign up with Google SSO' : 'Continue with Google SSO'}</span>
            </button>

            {/* New User / Sign Up Toggle Link */}
            <div className="pt-3 text-center text-xs sm:text-sm text-[#64747C]">
              {authMode === 'login' ? (
                <p>
                  New user?{' '}
                  <button
                    type="button"
                    onClick={() => setAuthMode('signup')}
                    className="font-bold text-[#08677A] hover:text-[#06505F] hover:underline cursor-pointer transition-colors"
                  >
                    Sign up to create an account &rarr;
                  </button>
                </p>
              ) : (
                <p>
                  Already have an account?{' '}
                  <button
                    type="button"
                    onClick={() => setAuthMode('login')}
                    className="font-bold text-[#08677A] hover:text-[#06505F] hover:underline cursor-pointer transition-colors"
                  >
                    Sign in here &rarr;
                  </button>
                </p>
              )}
            </div>

            {/* Additional Security & Support Info */}
            <div className="pt-4 border-t border-[#E8F1F6] text-center text-[11px] text-[#8A9BA8] space-y-1">
              <p>Protected by Enterprise Role-Based Access Control · Operational Sense</p>
              <p className="text-[10px] text-[#A0B0BC]">
                Need help accessing your workspace? Contact your system administrator.
              </p>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
};

export default LandingPage;
