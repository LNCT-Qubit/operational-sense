import path from 'node:path';

export class ConfigError extends Error {}

export interface AppConfig {
  port: number;
  databaseUrl: string;
  jwtSecret: string;
  uploadDir: string;
  maxUploadBytes: number;
  allowedMimeTypes: ReadonlySet<string>;
  autoProcess: boolean;
  staleClaimSeconds: number;
  maxTranscriptionAttempts: number;
  transcriber: { baseUrl: string; timeoutMs: number; internalToken: string | null };
  logLevel: 'debug' | 'info' | 'warn' | 'error';
  /** Public signup (POST /auth/signup). The organization is chosen HERE, never by the browser. */
  signup: { organizationName: string; bcryptRounds: number; corsAllowedOrigins: string[] };
  /** Login (POST /auth/login). `tokenTtlSeconds` = lifetime of the JWT access token. */
  login: { tokenTtlSeconds: number };
}

const DEFAULT_MIME =
  'audio/wav,audio/x-wav,audio/wave,audio/mpeg,audio/flac,audio/x-flac,audio/ogg';

function int(env: NodeJS.ProcessEnv, name: string, fallback: number, min: number, max: number, errors: string[]): number {
  const raw = env[name];
  if (raw === undefined || raw === '') return fallback;
  const n = Number(raw);
  if (!Number.isInteger(n) || n < min || n > max) {
    errors.push(`${name} must be an integer between ${min} and ${max}`);
    return fallback;
  }
  return n;
}

/** Reads and validates configuration. Error messages name the variable, never its value (secrets). */
export function loadConfig(env: NodeJS.ProcessEnv = process.env): AppConfig {
  const errors: string[] = [];

  const databaseUrl = env.DATABASE_URL ?? '';
  if (!databaseUrl) errors.push('DATABASE_URL is required');

  const jwtSecret = env.JWT_SECRET ?? '';
  if (jwtSecret.length < 32) errors.push('JWT_SECRET is required and must be at least 32 characters');

  const mimeList = (env.ALLOWED_AUDIO_MIME || DEFAULT_MIME)
    .split(',').map((s) => s.trim().toLowerCase()).filter(Boolean);
  if (mimeList.some((m) => !/^audio\/[a-z0-9.+-]+$/.test(m))) errors.push('ALLOWED_AUDIO_MIME must be a comma-separated list of audio/* types');

  const logLevel = (env.LOG_LEVEL || 'info') as AppConfig['logLevel'];
  if (!['debug', 'info', 'warn', 'error'].includes(logLevel)) errors.push('LOG_LEVEL must be debug, info, warn or error');

  const autoRaw = (env.AUTO_PROCESS ?? 'true').toLowerCase();
  if (!['true', 'false'].includes(autoRaw)) errors.push('AUTO_PROCESS must be true or false');

  const cfg: AppConfig = {
    port: int(env, 'PORT', 3000, 1, 65535, errors),
    databaseUrl,
    jwtSecret,
    uploadDir: path.resolve(env.UPLOAD_DIR || './var/uploads'),
    maxUploadBytes: int(env, 'MAX_UPLOAD_BYTES', 15 * 1024 * 1024, 1024, 200 * 1024 * 1024, errors),
    allowedMimeTypes: new Set(mimeList),
    autoProcess: autoRaw === 'true',
    staleClaimSeconds: int(env, 'STALE_CLAIM_SECONDS', 600, 30, 86400, errors),
    maxTranscriptionAttempts: int(env, 'MAX_TRANSCRIPTION_ATTEMPTS', 3, 1, 20, errors),
    transcriber: {
      baseUrl: (env.TRANSCRIBER_URL || 'http://127.0.0.1:8000').replace(/\/+$/, ''),
      timeoutMs: int(env, 'TRANSCRIBER_TIMEOUT_MS', 120000, 1000, 600000, errors),
      internalToken: env.TRANSCRIBER_INTERNAL_TOKEN || null,
    },
    logLevel,
    signup: {
      organizationName: (env.SIGNUP_ORG_NAME || 'Demo Org').trim(),
      bcryptRounds: int(env, 'BCRYPT_ROUNDS', 12, 10, 15, errors),
      corsAllowedOrigins: (env.CORS_ALLOWED_ORIGINS || '').split(',').map((o) => o.trim()).filter(Boolean),
    },
    login: {
      // 8 hours = one work shift. Allowed range: 60 s .. 7 days.
      tokenTtlSeconds: int(env, 'JWT_EXPIRES_IN_SECONDS', 28800, 60, 604800, errors),
    },
  };
  if (cfg.signup.organizationName === '') errors.push('SIGNUP_ORG_NAME must not be blank');
  if (cfg.signup.corsAllowedOrigins.some((o) => !/^https?:\/\/[^/\s]+$/.test(o))) errors.push('CORS_ALLOWED_ORIGINS must be a comma-separated list of origins such as http://localhost:5173 (no path, no trailing slash)');
  if (errors.length) throw new ConfigError(`Invalid configuration: ${errors.join('; ')}`);
  return cfg;
}
