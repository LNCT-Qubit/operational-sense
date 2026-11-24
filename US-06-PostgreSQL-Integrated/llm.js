require('dotenv').config();
const { GoogleGenAI } = require('@google/genai');
const { schema } = require('./extraction.schema');

const ai = new GoogleGenAI({});
const MAX_TRIES = 3;

function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function callLLM(system, user) {
  for (let attempt = 1; attempt <= MAX_TRIES; attempt++) {
    try {
      const res = await ai.models.generateContent({
        model: process.env.GEMINI_MODEL,
        contents: user,
        config: {
          systemInstruction: system,
          temperature: 0,
          responseMimeType: 'application/json',
          responseJsonSchema: schema
        }
      });
      return res.text;
    } catch (err) {
      const retryable = err.status === 503;
      if (!retryable || attempt === MAX_TRIES) throw err;
      await wait(5000 * attempt);
    }
  }
}

module.exports = { callLLM };