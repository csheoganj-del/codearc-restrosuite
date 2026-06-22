const fs = require('fs');
const path = require('path');

const dir = 'C:\\Users\\MASTER PC\\.gemini\\antigravity\\brain\\5e5752b8-61ce-4276-ba23-d6db96bda092';

function scan(d) {
    const files = fs.readdirSync(d);
    for (const f of files) {
        const full = path.join(d, f);
        const stat = fs.statSync(full);
        if (stat.isDirectory()) {
            scan(full);
        } else {
            console.log(`- ${full.replace(dir, '')} (${stat.size} bytes)`);
        }
    }
}

console.log('Brain files:');
scan(dir);
