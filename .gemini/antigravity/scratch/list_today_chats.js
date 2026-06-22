const fs = require('fs');
const path = require('path');

const brainDir = 'C:\\Users\\MASTER PC\\.gemini\\antigravity\\brain';
const dirs = fs.readdirSync(brainDir);

console.log('Searching for conversations modified today (June 22, 2026)...');

const today = new Date('2026-06-22');
const todayChats = [];

for (const dir of dirs) {
    const fullPath = path.join(brainDir, dir);
    if (!fs.statSync(fullPath).isDirectory()) continue;

    const transcriptPath = path.join(fullPath, '.system_generated', 'logs', 'transcript.jsonl');
    if (fs.existsSync(transcriptPath)) {
        const stat = fs.statSync(transcriptPath);
        
        // check if modified today (June 22, 2026)
        if (stat.mtime.getFullYear() === 2026 && stat.mtime.getMonth() === 5 && stat.mtime.getDate() === 22) {
            // Read all lines to see the user inputs and system timestamp
            const lines = fs.readFileSync(transcriptPath, 'utf8').trim().split('\n');
            const userInputs = [];
            for (const line of lines) {
                if (!line) continue;
                try {
                    const step = JSON.parse(line);
                    if (step.type === 'USER_INPUT' && step.content) {
                        userInputs.push(step.content);
                    }
                } catch (e) {}
            }
            todayChats.push({
                id: dir,
                mtime: stat.mtime,
                userInputs: userInputs
            });
        }
    }
}

// Sort by modified time descending
todayChats.sort((a, b) => b.mtime - a.mtime);

todayChats.forEach((c, idx) => {
    console.log(`\nChat #${idx+1} [Modified: ${c.mtime.toLocaleString()}] ID: ${c.id}`);
    if (c.userInputs.length === 0) {
        console.log('   (No user inputs in this chat)');
    } else {
        console.log(`   User inputs (${c.userInputs.length}):`);
        c.userInputs.forEach((input, i) => {
            console.log(`     [${i+1}] ${input.substring(0, 100).replace(/\r?\n/g, ' ')}`);
        });
    }
});
