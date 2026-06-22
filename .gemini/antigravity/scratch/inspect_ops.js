const fs = require('fs');

const ops = JSON.parse(fs.readFileSync('C:\\Users\\MASTER PC\\Downloads\\restrosuite\\.gemini\\antigravity\\scratch\\file_operations.json', 'utf8'));

console.log('Total operations:', ops.length);
// Let's print unique target files
const files = Array.from(new Set(ops.map(o => o.args.TargetFile || o.args.TargetFile)));
console.log('Unique files:', files);

// Let's print one example of replace_file_content args
const replaceOp = ops.find(o => o.type === 'replace_file_content');
console.log('Example replace operation args keys:', Object.keys(replaceOp.args));
console.log('TargetContent:', JSON.stringify(replaceOp.args.TargetContent.substring(0, 100)));
console.log('ReplacementContent:', JSON.stringify(replaceOp.args.ReplacementContent.substring(0, 100)));
