const fs = require('fs');
const steps = JSON.parse(fs.readFileSync('C:\\Users\\MASTER PC\\Downloads\\restrosuite\\.gemini\\antigravity\\scratch\\decoded_steps.json', 'utf8'));
console.log('Total steps:', steps.length);
for (let i = 0; i < Math.min(steps.length, 10); i++) {
    const s = steps[i];
    console.log(`Step idx: ${s.idx}, type: ${s.step_type}`);
    console.log(`Raw text (first 150 chars):`, JSON.stringify(s.text.substring(0, 150)));
}
