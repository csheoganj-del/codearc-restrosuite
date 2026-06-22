const fs = require('fs');

const steps = JSON.parse(fs.readFileSync('C:\\Users\\MASTER PC\\Downloads\\restrosuite\\.gemini\\antigravity\\scratch\\decoded_steps.json', 'utf8'));

console.log('Scanning all steps for JSON object transcripts...');
const allJsonObjects = new Map();

for (const s of steps) {
    const text = s.text;
    let pos = 0;
    while (true) {
        const start = text.indexOf('{"step_index":', pos);
        if (start === -1) break;
        
        // Find matching closing brace
        let braceCount = 0;
        let end = -1;
        for (let i = start; i < text.length; i++) {
            if (text[i] === '{') braceCount++;
            else if (text[i] === '}') {
                braceCount--;
                if (braceCount === 0) {
                    end = i;
                    break;
                }
            }
        }
        if (end !== -1) {
            const objStr = text.substring(start, end + 1);
            try {
                const parsed = JSON.parse(objStr);
                // Keep the one with the most information or just save it by step_index
                allJsonObjects.set(parsed.step_index, parsed);
            } catch (e) {}
            pos = end + 1;
        } else {
            pos = start + 1;
        }
    }
}

console.log(`Total unique step_index found: ${allJsonObjects.size}`);

const sortedSteps = Array.from(allJsonObjects.values()).sort((a, b) => a.step_index - b.step_index);

const userRequests = sortedSteps.filter(s => s.type === 'USER_INPUT');
console.log('\n--- ALL UNIQUE USER REQUESTS IN DB ---');
userRequests.forEach((ui, idx) => {
    console.log(`[${idx+1}] Step ${ui.step_index} [${ui.created_at}]:`);
    console.log(`    ${ui.content.replace(/\r?\n/g, ' ')}`);
});

fs.writeFileSync('C:\\Users\\MASTER PC\\Downloads\\restrosuite\\.gemini\\antigravity\\scratch\\reconstructed_transcript.json', JSON.stringify(sortedSteps, null, 2));
