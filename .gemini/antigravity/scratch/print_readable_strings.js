const fs = require('fs');

const steps = JSON.parse(fs.readFileSync('C:\\Users\\MASTER PC\\Downloads\\restrosuite\\.gemini\\antigravity\\scratch\\decoded_steps.json', 'utf8'));

console.log('Scanning decoded steps for readable text segments...');
const results = [];

for (const s of steps) {
    const buf = Buffer.from(s.text, 'utf8');
    
    // Find contiguous printable characters
    let current = '';
    const strings = [];
    for (let i = 0; i < buf.length; i++) {
        const c = buf[i];
        if (c >= 32 && c <= 126) {
            current += String.fromCharCode(c);
        } else {
            if (current.length >= 12) {
                strings.push(current.trim());
            }
            current = '';
        }
    }
    if (current.length >= 12) {
        strings.push(current.trim());
    }

    if (strings.length > 0) {
        results.push({
            idx: s.idx,
            type: s.step_type,
            strings: strings
        });
    }
}

fs.writeFileSync('C:\\Users\\MASTER PC\\Downloads\\restrosuite\\.gemini\\antigravity\\scratch\\readable_strings.json', JSON.stringify(results, null, 2));

// Let's filter steps containing USER_REQUEST or what looks like conversational prompts
const userPrompts = [];
for (const r of results) {
    for (const str of r.strings) {
        if (str.includes('USER_REQUEST') || str.includes('<USER_REQUEST>')) {
            userPrompts.push({ idx: r.idx, text: str });
        }
    }
}

console.log(`Found ${userPrompts.length} user request occurrences.`);
userPrompts.forEach((p, i) => {
    console.log(`[${i+1}] Step ${p.idx}: ${p.text.substring(0, 150)}`);
});
