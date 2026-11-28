// Sprint 2 Block 3: timeout + retry policy around a single LLM call.
// Kept free of any SDK import so it can be unit-tested without Gemini credentials or the @google/genai package.
//
// Error contract (consumed by Extractor.extract, which formats `LLM call failed: <status> <message>`, and by
// extraction.gateway.classify, which maps that prefix to EXTRACTION_SERVICE_ERROR = retryable by the user):
//   every error thrown from here carries a numeric `status` when one is known.

class LlmTimeoutError extends Error {
  constructor(ms) {
    super(`LLM call timed out after ${ms}ms`);
    this.name = 'LlmTimeoutError';
    this.status = 504;
  }
}

class LlmConfigError extends Error {
  constructor(message) {
    super(message);
    this.name = 'LlmConfigError';
    this.status = 500; // not retryable: retrying cannot fix a missing setting
  }
}

// Transient provider problems only: overloaded (503), rate limited (429), gateway timeout (504 incl. our own timeout).
const RETRYABLE_STATUS = new Set([429, 503, 504]);
const isRetryable = (err) => RETRYABLE_STATUS.has(err && err.status);

const defaultSleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

// Rejects with LlmTimeoutError if `run` has not settled after `ms`. The timer is always cleared. `run` receives an
// AbortSignal it MAY use to cancel the underlying request; a provider call that ignores it is still abandoned
// (its late result is discarded), so a hung connection can never block the pipeline.
function withTimeout(run, ms) {
  const controller = new AbortController();
  let timer;
  const timeout = new Promise((_, reject) => {
    timer = setTimeout(() => {
      controller.abort();
      reject(new LlmTimeoutError(ms));
    }, ms);
  });
  return Promise.race([Promise.resolve().then(() => run(controller.signal)), timeout]).finally(() => clearTimeout(timer));
}

// Calls `run(signal)` up to `maxTries` times, only retrying transient failures, waiting `baseDelayMs * attempt` between tries.
async function callWithRetry(run, { timeoutMs, maxTries = 3, baseDelayMs = 5000, sleep = defaultSleep } = {}) {
  for (let attempt = 1; attempt <= maxTries; attempt++) {
    try {
      return await withTimeout(run, timeoutMs);
    } catch (err) {
      if (!isRetryable(err) || attempt === maxTries) throw err;
      await sleep(baseDelayMs * attempt);
    }
  }
}

// GEMINI_TIMEOUT_MS: default 30 s, accepted range 1 s .. 120 s. Invalid values fall back to the default.
function timeoutFromEnv(env = process.env) {
  const n = Number(env.GEMINI_TIMEOUT_MS);
  return Number.isInteger(n) && n >= 1000 && n <= 120000 ? n : 30000;
}

module.exports = { LlmTimeoutError, LlmConfigError, isRetryable, withTimeout, callWithRetry, timeoutFromEnv };
