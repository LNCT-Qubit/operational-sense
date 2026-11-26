
const Extractor = require('./extractor');
const { callLLM } = require('./llm');

// Connect the real Gemini API to your extraction pipeline
const extractor = new Extractor(callLLM);

const transcript = `
The machine was making an unusual noise.
The technician noticed vibration.
`;

async function main() {
    console.log("Sending transcript to Gemini...\n");

    const result = await extractor.extract(transcript);

    if (result.ok) {
        console.log("EXTRACTION SUCCESSFUL");
        console.log("\nExtracted JSON:");
        console.log(JSON.stringify(result.data, null, 2));
    } else {
        console.log("EXTRACTION FAILED");
        console.log(result.error);
    }
}

main().catch(console.error);
