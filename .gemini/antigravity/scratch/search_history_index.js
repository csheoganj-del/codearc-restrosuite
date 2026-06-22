const fs = require('fs');
const path = require('path');

const rootDir = 'C:\\Users\\MASTER PC\\.gemini\\antigravity';
const files = fs.readdirSync(rootDir);
console.log('Root directory files:', files);

// Let's check subdirectories as well
function scanForFiles(dir) {
    try {
        const children = fs.readdirSync(dir);
        for (const child of children) {
            const fullPath = path.join(dir, child);
            const stat = fs.statSync(fullPath);
            if (stat.isDirectory()) {
                if (child === 'node_modules' || child === '.git' || child === 'brain' || child === 'conversations') continue;
                scanForFiles(fullPath);
            } else {
                if (child.includes('index') || child.includes('history') || child.includes('convo') || child.includes('metadata') || child.includes('list') || child.endsWith('.json') || child.endsWith('.db')) {
                    console.log(`- ${fullPath} (${stat.size} bytes)`);
                }
            }
        }
    } catch(e) {}
}

scanForFiles(rootDir);
