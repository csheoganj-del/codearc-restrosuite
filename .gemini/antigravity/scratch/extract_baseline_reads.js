const fs = require('fs');
const path = require('path');

const steps = JSON.parse(fs.readFileSync('C:\\Users\\MASTER PC\\Downloads\\restrosuite\\.gemini\\antigravity\\scratch\\decoded_steps.json', 'utf8'));

console.log('Analyzing file reads in morning database...');

const reads = [];

for (const s of steps) {
    const text = s.text || '';
    
    // Look for tool calls to view_file
    // The step JSON structure might vary, let's look at s.tool_calls or check via regex/search in the string
    let isViewFile = false;
    let filePath = '';
    let startLine = 1;
    let endLine = 1;
    
    // If the step has tool calls
    if (s.tool_calls) {
        for (const tc of s.tool_calls) {
            if (tc.name === 'view_file') {
                isViewFile = true;
                filePath = tc.args.AbsolutePath || '';
                startLine = Number(tc.args.StartLine) || 1;
                endLine = Number(tc.args.EndLine) || 800;
            }
        }
    }
    
    // Also check raw text for tool execution outcomes
    // When a tool executes, the system returns the output, which is stored in the transcript / step payload.
    // If the step matches, let's log it.
    if (isViewFile && filePath) {
        const basename = path.basename(filePath);
        reads.push({
            idx: s.idx,
            step_type: s.step_type,
            file: basename,
            startLine,
            endLine,
            textLen: text.length
        });
    }
}

console.log(`Found ${reads.length} view_file steps.`);
// Sort by index
reads.sort((a, b) => a.idx - b.idx);

// Print the first 50 reads
reads.slice(0, 80).forEach(r => {
    console.log(`Step ${r.idx}: File=${r.file}, Lines=${r.startLine}-${r.endLine}, textLen=${r.textLen}`);
});
