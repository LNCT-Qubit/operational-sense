const Ajv = require('ajv');
const { schema, normalize, checkRules } = require('./extraction.schema');
const { SYSTEM_PROMPT, userPrompt } = require('./prompt');

const validate = new Ajv().compile(schema);
const MAX_ATTEMPTS = 2; // first try + one correction (each attempt uses free-tier quota)

class Extractor {
  // callLLM: function (system, user) that returns the model's raw text
  constructor(callLLM) {
    this.callLLM = callLLM;
  }

  // Returns { ok: true, data } or { ok: false, error }
  async extract(transcript) {
    if (!transcript || !transcript.trim()) {
      return { ok: false, error: 'Empty transcript' };
    }

    let correction = '';
    for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
      let raw;
      try {
        raw = await this.callLLM(SYSTEM_PROMPT + correction, userPrompt(transcript));
      } catch (err) {
        return { ok: false, error: `LLM call failed: ${err.status} ${String(err.message).slice(0, 400)}` };
      }

      const result = this.check(raw);
      if (result.ok) return result;

      correction = `\n\nYour previous reply was invalid: ${result.error}. Fix it and return only the JSON object.`;
    }
    return { ok: false, error: 'LLM output invalid after retry' };
  }

  // Parse, clean and validate the model's reply.
  check(raw) {
    let parsed;
    try {
      parsed = JSON.parse(raw);
    } catch {
      return { ok: false, error: 'not valid JSON' };
    }
    const data = normalize(parsed);
    if (!validate(data)) return { ok: false, error: JSON.stringify(validate.errors) };
    const ruleError = checkRules(data);
    if (ruleError) return { ok: false, error: ruleError };
    return { ok: true, data };
  }
}

module.exports = Extractor;