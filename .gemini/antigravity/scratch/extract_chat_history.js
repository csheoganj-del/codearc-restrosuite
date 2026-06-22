const { execSync } = require('child_process');
const fs = require('fs');

const dbPath = 'C:\\Users\\MASTER PC\\.gemini\\antigravity\\conversations\\5e5752b8-61ce-4276-ba23-d6db96bda092.db';

console.log('Querying SQLite database...');
try {
    const rawJson = execSync(`sqlite3 -json "${dbPath}" "SELECT idx, HEX(step_payload) as hex, typeof(step_payload) as type, step_type FROM steps ORDER BY idx ASC"`, {
        maxBuffer: 50 * 1024 * 1024,
        encoding: 'utf8'
    });

    const rows = JSON.parse(rawJson);
    console.log(`Total rows fetched: ${rows.length}`);

    const decodedSteps = [];

    for (const row of rows) {
        if (!row.hex) continue;
        const buf = Buffer.from(row.hex, 'hex');
        
        // Let's check if we can parse it as string/JSON or text
        const text = buf.toString('utf8');
        decodedSteps.push({
            idx: row.idx,
            step_type: row.step_type,
            text: text
        });
    }

    console.log('Writing decoded steps to output...');
    fs.writeFileSync('C:\\Users\\MASTER PC\\Downloads\\restrosuite\\.gemini\\antigravity\\scratch\\decoded_steps.json', JSON.stringify(decodedSteps, null, 2));
    
    // Let's summarize the content
    let userMsgCount = 0;
    let assistantMsgCount = 0;
    const history = [];

    for (const step of decodedSteps) {
        // Try to identify user messages. Usually they contain USER_REQUEST or similar tokens,
        // or let's search for keys like "user", "prompt", "content" in JSON.
        // Let's check if the text is JSON first.
        let parsed = null;
        try {
            parsed = JSON.parse(step.text);
        } catch (e) {
            // Check if it looks like partial JSON or text
        }

        if (parsed) {
            // Let's log keys to understand the structure
            history.push({ idx: step.idx, step_type: step.step_type, parsed });
        } else {
            // Not pure JSON, check text
            if (step.text.includes('USER_REQUEST')) {
                history.push({ idx: step.idx, step_type: step.step_type, text: step.text });
            }
        }
    }

    console.log(`Parsed ${history.length} steps.`);
    // Save sample parsed steps
    fs.writeFileSync('C:\\Users\\MASTER PC\\Downloads\\restrosuite\\.gemini\\antigravity\\scratch\\parsed_steps.json', JSON.stringify(history.slice(0, 100), null, 2));

} catch (e) {
    console.error('Error:', e);
}
