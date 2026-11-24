const Extractor = require('./extractor');
const { callLLM } = require('./llm');

const transcript = process.argv[2];

async function main() {
  console.log('model:', process.env.GEMINI_MODEL);
  const start = Date.now();
  const result = await new Extractor(callLLM).extract(transcript);
  console.log(JSON.stringify(result, null, 2));
  console.log(`${Date.now() - start} ms`);
}
main();