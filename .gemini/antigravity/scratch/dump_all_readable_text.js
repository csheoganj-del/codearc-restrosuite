const fs = require('fs');

const steps = JSON.parse(fs.readFileSync('C:\\Users\\MASTER PC\\Downloads\\restrosuite\\.gemini\\antigravity\\scratch\\decoded_steps.json', 'utf8'));

console.log('Extracting readable texts from all 1892 steps...');
const output = [];

steps.forEach(s => {
    const buf = Buffer.from(s.text, 'utf8');
    let current = '';
    const strings = [];
    for (let i = 0; i < buf.length; i++) {
        const c = buf[i];
        if (c >= 32 && c <= 126) {
            current += String.fromCharCode(c);
        } else {
            if (current.length >= 10) {
                const trimmed = current.trim();
                // Skip binary looking strings or hashes
                if (!/^[a-fA-F0-9]{32,}$/.test(trimmed) && !trimmed.startsWith('sessionID') && !trimmed.startsWith('mPA3at') && !trimmed.startsWith('-375076')) {
                    strings.push(trimmed);
                }
            }
            current = '';
        }
    }
    if (current.length >= 10) {
        strings.push(current.trim());
    }

    if (strings.length > 0) {
        output.push({
            idx: s.idx,
            type: s.step_type,
            strings: strings
        });
    }
});

// Let's filter for text containing coding keywords, instructions, or prompts
const importantLines = [];
output.forEach(s => {
    s.strings.forEach(str => {
        if (str.includes('<USER_REQUEST>') || str.includes('USER_REQUEST') || str.includes('error') || str.includes('fail') || str.includes('replace') || str.includes('checkout') || str.includes('git')) {
            importantLines.push({ idx: s.idx, type: s.type, text: str });
        }
    });
});

console.log(`Total steps with readable strings: ${output.length}`);
console.log(`Total important text lines: ${importantLines.length}`);

// Print the first 50 important lines
console.log('\n--- IMPORTANT LINES SUMMARY ---');
importantLines.slice(0, 50).forEach((l, idx) => {
    console.log(`[${idx+1}] Step ${l.idx} (type ${l.type}): ${l.text.substring(0, 150)}`);
});

fs.writeFileSync('C:\\Users\\MASTER PC\\Downloads\\restrosuite\\.gemini\\antigravity\\scratch\\important_lines.json', JSON.stringify(importantLines, null, 2));
