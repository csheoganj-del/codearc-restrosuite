const fs = require('fs');

const steps = JSON.parse(fs.readFileSync('C:\\Users\\MASTER PC\\Downloads\\restrosuite\\.gemini\\antigravity\\scratch\\decoded_steps.json', 'utf8'));

console.log('Scanning all 1892 steps for any occurrence of USER_REQUEST or typical user prompts...');
let foundCount = 0;

for (const s of steps) {
    if (s.text.includes('USER_REQUEST') || s.text.includes('user_request') || s.text.includes('cash') || s.text.includes('split') || s.text.includes('drawer')) {
        // Let's extract clean substrings
        const matches = s.text.match(/[^\x00-\x1F\x7F-\x9F]+/g) || [];
        const cleanText = matches.join(' ');
        
        // Find occurrences of USER_REQUEST or content
        if (cleanText.includes('USER_REQUEST') || cleanText.includes('user_request')) {
            console.log(`Step ${s.idx} (type ${s.step_type}):`);
            // Print surrounding text
            const idx = cleanText.indexOf('USER_REQUEST');
            console.log('  ...', cleanText.substring(Math.max(0, idx - 100), Math.min(cleanText.length, idx + 400)), '...');
            foundCount++;
        }
    }
}

console.log(`Scan completed. Found ${foundCount} steps containing user requests.`);
