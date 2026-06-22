const fs = require('fs');

const ops = JSON.parse(fs.readFileSync('C:\\Users\\MASTER PC\\Downloads\\restrosuite\\.gemini\\antigravity\\scratch\\file_operations.json', 'utf8'));

console.log('Total ops:', ops.length);
ops.forEach((op, i) => {
    const args = op.args;
    if (op.type === 'replace_file_content') {
        if (!args.TargetContent && !args.ReplacementChunks) {
            console.log(`[Op ${i}] missing TargetContent. Keys:`, Object.keys(args));
            console.log('JSON:', JSON.stringify(args));
        }
    }
});
