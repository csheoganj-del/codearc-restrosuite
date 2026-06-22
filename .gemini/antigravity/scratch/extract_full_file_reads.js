const fs = require('fs');

const steps = JSON.parse(fs.readFileSync('C:\\Users\\MASTER PC\\Downloads\\restrosuite\\.gemini\\antigravity\\scratch\\decoded_steps.json', 'utf8'));

console.log('Searching for view_file responses in decoded steps...');

for (const s of steps) {
    const text = s.text;
    
    // Check if the step text contains view_file and dashboard.html or features-pos.js
    if (text.includes('view_file') && (text.includes('dashboard.html') || text.includes('features-pos.js'))) {
        console.log(`Step ${s.idx} (type ${s.step_type}) matches! Length: ${text.length}`);
        
        // Find if the response content is very large, which means it read the whole file
        if (text.length > 5000) {
            console.log(`  -> Large text in Step ${s.idx}, previewing first 300 chars:`);
            const matches = text.match(/[^\x00-\x1F\x7F-\x9F]+/g) || [];
            const cleanText = matches.join(' ');
            console.log(`     ${cleanText.substring(0, 300)}`);
        }
    }
}
