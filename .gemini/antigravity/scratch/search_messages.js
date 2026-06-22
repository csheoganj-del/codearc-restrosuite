const fs = require('fs');
const path = require('path');

const dir = 'C:\\Users\\MASTER PC\\.gemini\\antigravity\\brain\\5e5752b8-61ce-4276-ba23-d6db96bda092\\.system_generated\\messages';
const files = fs.readdirSync(dir);

console.log(`Scanning ${files.length} message files...`);

for (const file of files) {
    if (!file.endsWith('.json')) continue;
    const full = path.join(dir, file);
    const content = fs.readFileSync(full, 'utf8');
    
    if (content.includes('dashboard.html') || content.includes('features-pos.js')) {
        console.log(`- ${file} (${content.length} characters)`);
    }
}
