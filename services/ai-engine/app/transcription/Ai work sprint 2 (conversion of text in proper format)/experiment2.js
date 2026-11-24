require('dotenv').config();
const { GoogleGenAI } = require('@google/genai');
const ai = new GoogleGenAI({});

const rules = `You extract troubleshooting info from a technician's transcript.
Return ONLY a JSON object with these keys:
equipment, symptom, operating_condition, observation.
Each value is a short string, or null if it is not mentioned in the transcript.
Do not guess. Use only what the transcript says.`;

const transcript = `um okay yeah`;

async function main() {
  const res = await ai.models.generateContent({
    model: process.env.GEMINI_MODEL,
    contents: transcript,
    config: {
      systemInstruction: rules,
      temperature: 0,
      responseMimeType: 'application/json'
    }
  });

  console.log('RAW:', res.text);

  const data = JSON.parse(res.text);
  console.log('equipment:', data.equipment);
  console.log('operating_condition:', data.operating_condition);
}
main();