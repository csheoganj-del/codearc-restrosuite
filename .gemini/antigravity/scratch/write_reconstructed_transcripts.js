const fs = require('fs');
const path = require('path');

const restoredSteps = JSON.parse(fs.readFileSync('C:\\Users\\MASTER PC\\Downloads\\restrosuite\\.gemini\\antigravity\\scratch\\reconstructed_transcript.json', 'utf8'));

console.log(`Loaded ${restoredSteps.length} steps for reconstruction.`);

// Format each step as a single-line JSON string (like a standard jsonl file)
const lines = restoredSteps.map(step => JSON.stringify(step));
const fileContent = lines.join('\n') + '\n';

const logDir = 'C:\\Users\\MASTER PC\\.gemini\\antigravity\\brain\\5e5752b8-61ce-4276-ba23-d6db96bda092\\.system_generated\\logs';

const transcriptPath = path.join(logDir, 'transcript.jsonl');
const transcriptFullPath = path.join(logDir, 'transcript_full.jsonl');

try {
    fs.writeFileSync(transcriptPath, fileContent, 'utf8');
    fs.writeFileSync(transcriptFullPath, fileContent, 'utf8');
    console.log('Successfully wrote reconstructed transcript files!');
    console.log(`Wrote ${lines.length} lines to:\n- ${transcriptPath}\n- ${transcriptFullPath}`);
} catch (e) {
    console.error('Error writing transcripts:', e);
}
