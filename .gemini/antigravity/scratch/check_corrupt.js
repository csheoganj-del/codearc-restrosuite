const fs = require('fs');
const path = require('path');

function scanDir(dir) {
    const files = fs.readdirSync(dir);
    for (const file of files) {
        const fullPath = path.join(dir, file);
        const stat = fs.statSync(fullPath);
        if (stat.isDirectory()) {
            if (file === 'node_modules' || file === '.git' || file === '.kiro' || file === '.vercel') {
                continue;
            }
            scanDir(fullPath);
        } else if (stat.isFile()) {
            // Only check text or javascript/html/css/json/sql/md files
            const ext = path.extname(file).toLowerCase();
            if (['.html', '.js', '.css', '.json', '.sql', '.md', '.webmanifest', '.ps1', '.sh', '.yml', '.yaml'].includes(ext)) {
                const buf = fs.readFileSync(fullPath);
                let hasNul = false;
                for (let i = 0; i < buf.length; i++) {
                    if (buf[i] === 0) {
                        hasNul = true;
                        break;
                    }
                }
                if (hasNul) {
                    console.log(`[CORRUPTED] ${fullPath} contains NUL bytes! Size: ${buf.length}`);
                }
            }
        }
    }
}

console.log('Scanning workspace...');
scanDir('c:\\Users\\MASTER PC\\Downloads\\restrosuite');
console.log('Scan completed.');
