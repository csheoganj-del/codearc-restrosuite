const fs = require('fs');
const path = require('path');

const userProfile = 'C:\\Users\\MASTER PC';
const pathsToSearch = [
    path.join(userProfile, 'AppData', 'Roaming', 'Code', 'User', 'History'),
    path.join(userProfile, 'AppData', 'Roaming', 'Cursor', 'User', 'History'),
    path.join(userProfile, 'AppData', 'Roaming', 'VSCodium', 'User', 'History')
];

console.log('Searching IDE Local History for dashboard.html and features-pos.js...');

function scanHistory(dir) {
    if (!fs.existsSync(dir)) return;
    console.log(`Scanning: ${dir}`);
    try {
        const subdirs = fs.readdirSync(dir);
        for (const subdir of subdirs) {
            const subpath = path.join(dir, subdir);
            if (!fs.statSync(subpath).isDirectory()) continue;
            
            const files = fs.readdirSync(subpath);
            // Check if this history entry is for dashboard.html or features-pos.js
            // VS Code local history folder has entries.json which maps the filenames
            const entriesPath = path.join(subpath, 'entries.json');
            if (fs.existsSync(entriesPath)) {
                try {
                    const entries = JSON.parse(fs.readFileSync(entriesPath, 'utf8'));
                    if (entries.resource && (entries.resource.includes('dashboard.html') || entries.resource.includes('features-pos.js'))) {
                        console.log(`Found history directory for: ${entries.resource}`);
                        // List files inside this history folder
                        for (const file of files) {
                            if (file !== 'entries.json') {
                                const filePath = path.join(subpath, file);
                                const stat = fs.statSync(filePath);
                                // check if modified today (June 22, 2026)
                                if (stat.mtime.getFullYear() === 2026 && stat.mtime.getMonth() === 5 && stat.mtime.getDate() === 22) {
                                    console.log(`  - Backup file: ${filePath} (${stat.size} bytes, modified at ${stat.mtime.toLocaleTimeString()})`);
                                }
                            }
                        }
                    }
                } catch(e) {}
            }
        }
    } catch(e) {
        console.error(e);
    }
}

pathsToSearch.forEach(scanHistory);
console.log('Search completed.');
