/** Composition root: reads config, wires real implementations together, starts listening. */
import { loadConfig } from './config/env';
import { createLogger } from './http/logger';
import { createPool, assertAppRoleSafe } from './database/pool';
import { PostgresPipelineStore } from './modules/recordings/recording.repository';
import { LocalAudioStorage } from './modules/recordings/audio-storage';
import { CaptureService } from './modules/recordings/recording.service';
import { HttpTranscriptionClient } from './modules/transcription/transcription.client';
import { Us06DraftCreator } from './modules/extraction/extraction.gateway';
import { createApp } from './app';
import { PostgresUserStore } from './modules/users/user.repository';
import { createBcryptHasher } from './modules/users/password-hasher';
import { SignupService } from './modules/users/signup.service';

async function main(): Promise<void> {
  try { require('dotenv').config(); } catch { /* dotenv is optional: real environments inject variables */ }
  const config = loadConfig();
  const logger = createLogger(config.logLevel);

  const pool = createPool(config.databaseUrl);
  await assertAppRoleSafe(pool, logger);           // refuse to start as superuser/BYPASSRLS

  // US-06's Gemini client builds itself at import time, so it is loaded only here, never in unit tests.
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const { callLLM } = require('./modules/extraction/llm');

  const service = new CaptureService(
    new PostgresPipelineStore(pool),
    new LocalAudioStorage(config.uploadDir),
    new HttpTranscriptionClient(config.transcriber),
    new Us06DraftCreator(pool, callLLM),
    { autoProcess: config.autoProcess, staleClaimSeconds: config.staleClaimSeconds, maxTranscriptionAttempts: config.maxTranscriptionAttempts },
    logger,
  );

  const userStore = new PostgresUserStore(pool);
  const signupService = new SignupService(userStore, createBcryptHasher(config.signup.bcryptRounds), { organizationName: config.signup.organizationName }, logger);
  // Friendly startup hint for beginners: signup cannot work until migration 010 has created the organization.
  try {
    if (!(await userStore.resolveSignupOrgId(config.signup.organizationName))) {
      logger.warn('signup organization not found: run migration 010_users.sql (or fix SIGNUP_ORG_NAME)', { organization_name: config.signup.organizationName });
    }
  } catch { logger.warn('could not check the signup organization: has migration 010_users.sql been applied?'); }

  const app = createApp({ config, service, logger, signup: { service: signupService, corsAllowedOrigins: config.signup.corsAllowedOrigins }, ping: async () => { await pool.query('SELECT 1'); } });
  const server = app.listen(config.port, () => logger.info('backend listening', { port: config.port }));

  const shutdown = async (signal: string) => {
    logger.info('shutting down', { signal });
    server.close();
    await service.idle();                          // let in-flight processing finish and persist its state
    await pool.end();
    process.exit(0);
  };
  process.on('SIGTERM', () => void shutdown('SIGTERM'));
  process.on('SIGINT', () => void shutdown('SIGINT'));
}

main().catch((err) => {
  // eslint-disable-next-line no-console
  console.error('startup failed:', (err as Error).message);
  process.exit(1);
});
