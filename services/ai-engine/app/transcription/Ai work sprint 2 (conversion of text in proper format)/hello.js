require('dotenv').config();
const { GoogleGenAI } = require('@google/genai');
const ai = new GoogleGenAI({});

async function main() {
  const res = await ai.models.generateContent({
    model: process.env.GEMINI_MODEL,
    contents: 'Say hello in five words.'
  });
  console.log(res.text);
}
main();