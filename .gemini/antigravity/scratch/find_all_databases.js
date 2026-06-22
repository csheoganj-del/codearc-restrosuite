const fs = require('fs');
const path = require('path');

const dir = 'C:\\Users\\MASTER PC\\.gemini\\antigravity\\conversations';
if (fs.existsSync(dir)) {
    const files = fs.readdirSync(dir);
    console.log(`Found ${files.length} files in conversations:`);
    for (const file of files) {
        const fullPath = path.join(dir, file);
        const stat = fs.statSync(fullPath);
        if (stat.isFile() && file.endsWith('.db')) {
            console.log(`- ${file} (${stat.size} bytes, modified: ${stat.mtime.toLocaleString()})`);
        }
    }
} else {
    console.log('Conversations directory not found.');
}
