const fs = require('fs');
const path = require('path');

console.log('Searching for transcript.jsonl files on the system...');

function searchFiles(dir, depth = 0) {
    if (depth > 5) return; // limit depth to avoid hitting system folders too hard
    try {
        const files = fs.readdirSync(dir);
        for (const file of files) {
            const fullPath = path.join(dir, file);
            let stat;
            try {
                stat = fs.statSync(fullPath);
            } catch(e) { continue; }

            if (stat.isDirectory()) {
                // Skip windows system directories
                if (file.startsWith('.') && file !== '.gemini' && file !== '.cursor' && file !== '.vscode' && file !== '.claude') {
                    continue;
                }
                if (file === 'AppData' || file === 'Local Settings' || file === 'Microsoft' || file === 'Application Data' || file === 'System Volume Information') {
                    continue;
                }
                searchFiles(fullPath, depth + 1);
            } else if (file === 'transcript.jsonl') {
                console.log(`Found: ${fullPath} (Modified: ${stat.mtime.toLocaleString()})`);
            }
        }
    } catch(e) {}
}

searchFiles('C:\\Users\\MASTER PC');
console.log('Search finished.');
