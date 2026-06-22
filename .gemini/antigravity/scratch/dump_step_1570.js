const fs = require('fs');
const steps = JSON.parse(fs.readFileSync('C:\\Users\\MASTER PC\\Downloads\\restrosuite\\.gemini\\antigravity\\scratch\\decoded_steps.json', 'utf8'));

const step1570 = steps.find(s => s.idx === 1570);
if (step1570) {
    console.log('Found Step 1570, length:', step1570.text.length);
    // Find all JSON-like objects in the text using a regex or simple scan
    const text = step1570.text;
    
    // Write the raw text of step 1570 to a temporary file
    fs.writeFileSync('C:\\Users\\MASTER PC\\Downloads\\restrosuite\\.gemini\\antigravity\\scratch\\step_1570_raw.txt', text);
    
    // Find JSON boundaries
    let pos = 0;
    const jsonObjects = [];
    while (true) {
        const start = text.indexOf('{"step_index":', pos);
        if (start === -1) break;
        
        // Find matching closing brace
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
            const objStr = text.substring(start, end + 1);
            try {
                const parsed = JSON.parse(objStr);
                jsonObjects.push(parsed);
            } catch (e) {
                // not valid json
            }
            pos = end + 1;
        } else {
            pos = start + 1;
        }
    }
    
    console.log(`Extracted ${jsonObjects.length} JSON objects from Step 1570.`);
    
    const userInputs = jsonObjects.filter(o => o.type === 'USER_INPUT');
    console.log('\n--- ALL USER INPUTS IN STEP 1570 ---');
    userInputs.forEach((ui, idx) => {
        console.log(`[${idx+1}] [${ui.created_at}] ${ui.content.replace(/\r?\n/g, ' ')}`);
    });
} else {
    console.log('Step 1570 not found.');
}
