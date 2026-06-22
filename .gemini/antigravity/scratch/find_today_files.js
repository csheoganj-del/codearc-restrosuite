const fs = require('fs');
const path = require('path');

const rootDir = 'C:\\Users\\MASTER PC\\.gemini\\antigravity';

console.log('Scanning all files modified today under ' + rootDir + '...');

function scanDir(dir) {
    try {
        const files = fs.readdirSync(dir);
        for (const file of files) {
            const fullPath = path.join(dir, file);
            let stat;
            try {
                stat = fs.statSync(fullPath);
            } catch(e) { continue; }

            if (stat.isDirectory()) {
                if (file === 'node_modules' || file === '.git' || file === 'tempmediaStorage') continue;
                scanDir(fullPath);
            } else {
                const today = new Date('2026-06-22');
                if (stat.mtime.getFullYear() === 2026 && stat.mtime.getMonth() === 5 && stat.mtime.getDate() === 22) {
                    console.log(`Modified today: ${fullPath} (${stat.size} bytes, modified at ${stat.mtime.toLocaleTimeString()})`);
                }
            }
        }
    } catch(e) {}
}

scanDir(rootDir);
console.log('Scan complete.');
