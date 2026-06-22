const { execSync } = require('child_process');

const dbPath = 'C:\\Users\\MASTER PC\\.gemini\\antigravity\\conversations\\ad206339-b93b-4be5-9c1b-e2da08ec092e.db';
try {
    const rawJson = execSync(`sqlite3 -json "${dbPath}" "SELECT idx, HEX(step_payload) as hex FROM steps ORDER BY idx ASC"`, {
        maxBuffer: 50 * 1024 * 1024,
        encoding: 'utf8'
    });

    const rows = JSON.parse(rawJson);
    console.log(`ad206339-b93b-4be5-9c1b-e2da08ec092e.db has ${rows.length} steps.`);

    rows.forEach(row => {
        if (!row.hex) return;
        const buf = Buffer.from(row.hex, 'hex');
        
        let current = '';
        const strings = [];
        for (let i = 0; i < buf.length; i++) {
            const c = buf[i];
            if (c >= 32 && c <= 126) {
                current += String.fromCharCode(c);
            } else {
                if (current.length >= 8) {
                    strings.push(current.trim());
                }
                current = '';
            }
        }
        if (current.length >= 8) {
            strings.push(current.trim());
        }

        console.log(`Step ${row.idx}:`);
        strings.forEach(s => {
            if (s.includes('{"') || s.includes('<') || s.length > 20) {
                console.log(`   - ${s}`);
            }
        });
    });
} catch(e) {
    console.error(e.message);
}
