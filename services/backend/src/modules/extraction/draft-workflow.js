const Extractor = require('./extractor');
const { callLLM } = require('./llm');
const DraftStore = require('./draft-store');
const DraftService = require('./draft-service');

// Reuses the existing Gemini extraction and AJV validation implementation.
const extractor = new Extractor(callLLM);
const store = new DraftStore();
module.exports = new DraftService(extractor, store);
