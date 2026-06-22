const { execSync } = require('child_process');
const path = require('path');

const dbs = [
    'ad206339-b93b-4be5-9c1b-e2da08ec092e.db',
    '25acef71-566f-472a-a4e8-1e0c6ec04c6b.db'
];
const dir = 'C:\\Users\\MASTER PC\\.gemini\\antigravity\\conversations';

dbs.forEach(dbFile => {
    const dbPath = path.join(dir, dbFile);
    console.log(`\n========================================`);
    console.log(`DATABASE: ${dbFile}`);
    console.log(`========================================`);

    try {
        const rawJson = execSync(`sqlite3 -json "${dbPath}" "SELECT idx, HEX(step_payload) as hex FROM steps ORDER BY idx DESC LIMIT 10"`, {
            encoding: 'utf8'
        });

        const rows = JSON.parse(rawJson);
        rows.forEach(row => {
            if (!row.hex) return;
            const buf = Buffer.from(row.hex, 'hex');
            
            // Extract clean printable ASCII substrings
            let current = '';
            const strings = [];
            for (let i = 0; i < buf.length; i++) {
                const c = buf[i];
                if (c >= 32 && c <= 126) {
                    current += String.fromCharCode(c);
                } else {
                    if (current.length >= 10) {
                        strings.push(current.trim());
                    }
                    current = '';
                }
            }
            if (current.length >= 10) {
                strings.push(current.trim());
            }

            console.log(`Step ${row.idx}:`);
            strings.slice(0, 5).forEach(s => {
                console.log(`   - ${s}`);
            });
        });
    } catch(e) {
        console.error(e.message);
    }
});
