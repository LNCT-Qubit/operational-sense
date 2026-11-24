require('dotenv').config();
const { GoogleGenAI } = require('@google/genai');
const ai = new GoogleGenAI({});

const rules = `You extract troubleshooting info from a technician's transcript.
Tell me: equipment, symptom, operating condition, observation.`;

const transcript = `The conveyor motor on line 3 is making a grinding noise. I checked the bearing and it feels hot.`;

async function main() {
  const res = await ai.models.generateContent({
    model: process.env.GEMINI_MODEL,
    contents: transcript,
    config: {
      systemInstruction: rules,
      temperature: 0
    }
  });
  console.log(res.text);
}
main();