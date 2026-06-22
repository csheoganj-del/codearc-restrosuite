const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const dir = 'C:\\Users\\MASTER PC\\.gemini\\antigravity\\conversations';
const files = fs.readdirSync(dir).filter(f => f.endsWith('.db'));

console.log(`Checking ${files.length} databases for step contents...`);

const results = [];

for (const file of files) {
    const dbPath = path.join(dir, file);
    try {
        // Query step count and min/max idx
        const infoRaw = execSync(`sqlite3 -json "${dbPath}" "SELECT count(*) as count, min(idx) as minIdx, max(idx) as maxIdx FROM steps"`, {
            encoding: 'utf8',
            stdio: ['pipe', 'pipe', 'ignore']
        }).trim();
        
        if (infoRaw) {
            const info = JSON.parse(infoRaw)[0];
            const stat = fs.statSync(dbPath);
            if (info.count > 0) {
                results.push({
                    file,
                    size: stat.size,
                    mtime: stat.mtime,
                    count: info.count,
                    minIdx: info.minIdx,
                    maxIdx: info.maxIdx
                });
            }
        }
    } catch(e) {}
}

// Sort by modified time descending
results.sort((a, b) => b.mtime - a.mtime);

console.log('\n--- ALL CONVERSATIONS WITH STEPS ---');
results.forEach(r => {
    console.log(`${r.file} | count: ${r.count} | range: ${r.minIdx}-${r.maxIdx} | size: ${r.size} bytes | modified: ${r.mtime.toLocaleString()}`);
});
