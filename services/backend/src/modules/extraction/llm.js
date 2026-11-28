require('dotenv').config();
const { GoogleGenAI } = require('@google/genai');
const { schema } = require('./extraction.schema');
const { LlmConfigError, callWithRetry, timeoutFromEnv } = require('./llm-guard');

const ai = new GoogleGenAI({});
const MAX_TRIES = 3;

// Sprint 2 Block 3 hardening (prompts, schema and request shape unchanged):
//  * every attempt has a hard timeout (GEMINI_TIMEOUT_MS, default 30 s), so a hung provider call cannot pin a
//    recording in EXTRACTING;
//  * 429 (rate limit) and 504/timeouts are retried like the original 503 handling;
//  * a missing GEMINI_MODEL fails immediately with a clear, non-retryable error instead of an opaque API 400.
async function callLLM(system, user) {
  const model = process.env.GEMINI_MODEL;
  if (!model) throw new LlmConfigError('GEMINI_MODEL is not configured');
  return callWithRetry(
    async (signal) => {
      const res = await ai.models.generateContent({
        model,
        contents: user,
        config: {
          systemInstruction: system,
          temperature: 0,
          responseMimeType: 'application/json',
          responseJsonSchema: schema,
          abortSignal: signal
        }
      });
      return res.text;
    },
    { timeoutMs: timeoutFromEnv(), maxTries: MAX_TRIES, baseDelayMs: 5000 }
  );
}

module.exports = { callLLM };
