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
import { LoginService } from './modules/users/login.service';
import { LocalAttachmentStorage } from './modules/drafts/attachment-storage';
import { PostgresDraftSyncStore } from './modules/drafts/draft.repository';
import { TechnicianDraftService } from './modules/drafts/draft.service';
import { PostgresCaseStore } from './modules/cases/case.repository';
import { CaseService } from './modules/cases/case.service';
import { PostgresAssetStore } from './modules/assets/asset.repository';
import { AssetService } from './modules/assets/asset.service';
import { PostgresTaxonomyStore, TaxonomyService } from './modules/taxonomy/taxonomy.routes';

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

  const draftService = new TechnicianDraftService(
    new PostgresDraftSyncStore(pool),
    new LocalAttachmentStorage(config.uploadDir),
    logger,
  );
  const caseService = new CaseService(new PostgresCaseStore(pool));
  const assetService = new AssetService(new PostgresAssetStore(pool));
  const taxonomyService = new TaxonomyService(new PostgresTaxonomyStore(pool));

  const userStore = new PostgresUserStore(pool);
  const hasher = createBcryptHasher(config.signup.bcryptRounds);   // one hasher shared by signup (hash) and login (compare)
  const signupService = new SignupService(userStore, hasher, { organizationName: config.signup.organizationName }, logger);
  const loginService = new LoginService(userStore, hasher, { jwtSecret: config.jwtSecret, tokenTtlSeconds: config.login.tokenTtlSeconds }, logger);
  // Friendly startup hint for beginners: signup cannot work until migration 010 has created the organization.
  try {
    if (!(await userStore.resolveSignupOrgId(config.signup.organizationName))) {
      logger.warn('signup organization not found: run migration 010_users.sql (or fix SIGNUP_ORG_NAME)', { organization_name: config.signup.organizationName });
    }
  } catch { logger.warn('could not check the signup organization: has migration 010_users.sql been applied?'); }

  const app = createApp({
    config,
    service,
    logger,
    signup: { service: signupService, loginService, corsAllowedOrigins: config.signup.corsAllowedOrigins },
    drafts: { service: draftService },
    cases: { service: caseService },
    assets: { service: assetService },
    taxonomy: { service: taxonomyService },
    ping: async () => { await pool.query('SELECT 1'); },
  });
  const server = app.listen(config.port, () => logger.info('backend listening', { port: config.port }));

  const shutdown = async (signal: string) => {
    logger.info('shutting down', { signal });
    await new Promise<void>((resolve) => server.close(() => resolve()));
    await service.idle();                          // let in-flight processing finish and persist its state
    await pool.end();
    process.exit(0);
  };
  process.on('SIGTERM', () => void shutdown('SIGTERM'));
  process.on('SIGINT', () => void shutdown('SIGINT'));
}

function startupErrorMessage(error: unknown): string {
  if (error instanceof AggregateError) {
    const causes = error.errors.map(startupErrorMessage);
    return causes.length ? `${error.name}: ${causes.join(', ')}` : error.name;
  }
  if (error instanceof Error) {
    const code = 'code' in error && typeof error.code === 'string' ? error.code : '';
    return error.message || code || error.name;
  }
  return String(error);
}

main().catch((err: unknown) => {
  // eslint-disable-next-line no-console
  console.error('startup failed:', startupErrorMessage(err));
  process.exit(1);
});
