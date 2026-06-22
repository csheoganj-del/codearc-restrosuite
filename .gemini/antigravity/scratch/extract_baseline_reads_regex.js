const fs = require('fs');
const path = require('path');

const steps = JSON.parse(fs.readFileSync('C:\\Users\\MASTER PC\\Downloads\\restrosuite\\.gemini\\antigravity\\scratch\\decoded_steps.json', 'utf8'));

console.log('Analyzing file reads in morning database using regex...');

const reads = [];

for (const s of steps) {
    const text = s.text || '';
    if (!text.includes('view_file')) continue;

    // Try to extract JSON arguments like {"AbsolutePath":"..."}
    const match = text.match(/\{"AbsolutePath":.*?\}/);
    if (match) {
        try {
            // Clean up backslashes and nulls if any, to get a parseable JSON
            let cleanJson = match[0].replace(/[\x00-\x1F\x7F-\x9F]/g, '');
            const args = JSON.parse(cleanJson);
            const filePath = args.AbsolutePath || '';
            const startLine = Number(args.StartLine) || 1;
            const endLine = Number(args.EndLine) || 800;
            const basename = path.basename(filePath);
            
            reads.push({
                idx: s.idx,
                step_type: s.step_type,
                file: basename,
                startLine,
                endLine,
                textLen: text.length
            });
        } catch (e) {
            // parsing failed, but let's record it anyway with plain extraction
            const raw = match[0];
            const fileMatch = raw.match(/dashboard\.html|features-pos\.js/);
            if (fileMatch) {
                reads.push({
                    idx: s.idx,
                    step_type: s.step_type,
                    file: fileMatch[0],
                    startLine: 1,
                    endLine: 800,
                    textLen: text.length
                });
            }
        }
    }
}

console.log(`Found ${reads.length} view_file steps.`);
reads.sort((a, b) => a.idx - b.idx);

// Print all reads
reads.forEach(r => {
    console.log(`Step ${r.idx}: File=${r.file}, Lines=${r.startLine}-${r.endLine}, textLen=${r.textLen}`);
});
