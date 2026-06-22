const fs = require('fs');

const steps = JSON.parse(fs.readFileSync('C:\\Users\\MASTER PC\\Downloads\\restrosuite\\.gemini\\antigravity\\scratch\\decoded_steps.json', 'utf8'));

const targets = [1709, 1725, 1888, 1890];

targets.forEach(idx => {
    const step = steps.find(s => s.idx === idx);
    if (step) {
        const outPath = `C:\\Users\\MASTER PC\\.gemini\\antigravity\\brain\\25acef71-566f-472a-a4e8-1e0c6ec04c6b\\scratch\\step_${idx}.txt`;
        fs.writeFileSync(outPath, step.text, 'utf8');
        console.log(`Saved Step ${idx} (length ${step.text.length}) to ${outPath}`);
    } else {
        console.log(`Step ${idx} not found.`);
    }
});
