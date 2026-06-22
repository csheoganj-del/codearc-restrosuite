const fs = require('fs');

const steps = JSON.parse(fs.readFileSync('C:\\Users\\MASTER PC\\Downloads\\restrosuite\\.gemini\\antigravity\\scratch\\decoded_steps.json', 'utf8'));

console.log('Scanning steps for file write/replace operations...');
const fileOps = [];

steps.forEach(s => {
    const text = s.text;
    
    // Find write_to_file or replace_file_content calls
    const writeIdx = text.indexOf('write_to_file');
    const replaceIdx = text.indexOf('replace_file_content');
    
    if (writeIdx !== -1 || replaceIdx !== -1) {
        // Find JSON block in this step
        let pos = 0;
        while (true) {
            const start = text.indexOf('{"', pos);
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
                const jsonStr = text.substring(start, end + 1);
                try {
                    const parsed = JSON.parse(jsonStr);
                    if (parsed.TargetFile || parsed.TargetContent || parsed.CodeContent || parsed.ReplacementContent) {
                        fileOps.push({
                            idx: s.idx,
                            type: writeIdx !== -1 ? 'write_to_file' : 'replace_file_content',
                            args: parsed
                        });
                    }
                } catch(e) {}
                pos = end + 1;
            } else {
                pos = start + 1;
            }
        }
    }
});

console.log(`Found ${fileOps.length} file operations.`);
fs.writeFileSync('C:\\Users\\MASTER PC\\Downloads\\restrosuite\\.gemini\\antigravity\\scratch\\file_operations.json', JSON.stringify(fileOps, null, 2));

// Group by file
const filesMap = {};
fileOps.forEach(op => {
    const file = op.args.TargetFile || op.args.TargetFile;
    if (file) {
        const base = file.split(/[\\/]/).pop();
        if (!filesMap[base]) filesMap[base] = [];
        filesMap[base].push(op);
    }
});

Object.keys(filesMap).forEach(file => {
    console.log(`\nFile: ${file} (${filesMap[file].length} operations)`);
    filesMap[file].forEach((op, i) => {
        console.log(`  [${i+1}] Step ${op.idx} (${op.type}): ${op.args.Description || op.args.Instruction || 'No description'}`);
    });
});
