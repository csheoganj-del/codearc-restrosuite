const fs = require('fs');
const path = require('path');

const dir = 'C:\\Users\\MASTER PC\\.gemini\\antigravity';
const files = fs.readdirSync(dir);
console.log('Files in root:');
files.forEach(f => {
    const full = path.join(dir, f);
    const stat = fs.statSync(full);
    if (stat.isFile()) {
        console.log(`- ${f} (${stat.size} bytes)`);
    }
});
