const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const dbs = [
    'ad206339-b93b-4be5-9c1b-e2da08ec092e.db',
    '25acef71-566f-472a-a4e8-1e0c6ec04c6b.db',
    '5e5752b8-61ce-4276-ba23-d6db96bda092.db'
];

const dir = 'C:\\Users\\MASTER PC\\.gemini\\antigravity\\conversations';

dbs.forEach(dbFile => {
    const dbPath = path.join(dir, dbFile);
    console.log(`\n========================================`);
    console.log(`DATABASE: ${dbFile}`);
    console.log(`========================================`);

    try {
        const rawJson = execSync(`sqlite3 -json "${dbPath}" "SELECT idx, HEX(step_payload) as hex, typeof(step_payload) as type, step_type FROM steps ORDER BY idx ASC"`, {
            maxBuffer: 50 * 1024 * 1024,
            encoding: 'utf8'
        });

        const rows = JSON.parse(rawJson);
        const allJsonObjects = new Map();

        for (const row of rows) {
            if (!row.hex) continue;
            const buf = Buffer.from(row.hex, 'hex');
            const text = buf.toString('utf8');
            
            let pos = 0;
            while (true) {
                const start = text.indexOf('{"step_index":', pos);
                if (start === -1) break;
                
                let braceCount = 0;
                let end = -1;
                for (let i = start; i < text.length; i++) {
                    if (text[i] === '{') braceCount++;
                    else if (text[i] === '}') {
                        braceCount--;
                        if (braceCount === 0) {
                            end = i;
                            break;
                        }
                    }
                }
                if (end !== -1) {
                    const objStr = text.substring(start, end + 1);
                    try {
                        const parsed = JSON.parse(objStr);
                        allJsonObjects.set(parsed.step_index, parsed);
                    } catch (e) {}
                    pos = end + 1;
                } else {
                    pos = start + 1;
                }
            }
        }

        const sortedSteps = Array.from(allJsonObjects.values()).sort((a, b) => a.step_index - b.step_index);
        const userRequests = sortedSteps.filter(s => s.type === 'USER_INPUT');
        
        console.log(`Total unique steps found: ${allJsonObjects.size}`);
        console.log(`User inputs count: ${userRequests.length}`);
        
        userRequests.forEach((ui, idx) => {
            console.log(`  [${idx+1}] Step ${ui.step_index} [${ui.created_at}]:`);
            console.log(`      ${ui.content.replace(/\r?\n/g, ' ').substring(0, 200)}`);
        });

    } catch (e) {
        console.error(`Error querying ${dbFile}:`, e.message);
    }
});
