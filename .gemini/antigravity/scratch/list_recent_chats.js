const fs = require('fs');
const path = require('path');

const brainDir = 'C:\\Users\\MASTER PC\\.gemini\\antigravity\\brain';
const dirs = fs.readdirSync(brainDir);

const conversations = [];

for (const dir of dirs) {
    const fullPath = path.join(brainDir, dir);
    if (!fs.statSync(fullPath).isDirectory()) continue;

    const transcriptPath = path.join(fullPath, '.system_generated', 'logs', 'transcript.jsonl');
    if (fs.existsSync(transcriptPath)) {
        const stat = fs.statSync(transcriptPath);
        
        // Let's read the first and last line of the transcript
        const content = fs.readFileSync(transcriptPath, 'utf8').trim().split('\n');
        let title = 'Unknown';
        let firstUserMessage = '';

        for (const line of content) {
            if (!line) continue;
            try {
                const step = JSON.parse(line);
                if (step.type === 'USER_INPUT' && step.content) {
                    firstUserMessage = step.content;
                    break;
                }
            } catch (e) {}
        }

        conversations.push({
            id: dir,
            mtime: stat.mtime,
            firstMsg: firstUserMessage || 'No user input found'
        });
    }
}

// Sort by modified time descending
conversations.sort((a, b) => b.mtime - a.mtime);

console.log('--- RECENT CONVERSATIONS ---');
conversations.slice(0, 15).forEach((c, idx) => {
    console.log(`${idx + 1}. [${c.mtime.toLocaleString()}] ID: ${c.id}`);
    console.log(`   Message: ${c.firstMsg.substring(0, 80).replace(/\r?\n/g, ' ')}`);
});
