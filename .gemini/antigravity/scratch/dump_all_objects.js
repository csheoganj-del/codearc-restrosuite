const fs = require('fs');
const raw = fs.readFileSync('C:\\Users\\MASTER PC\\Downloads\\restrosuite\\.gemini\\antigravity\\scratch\\step_1570_raw.txt', 'utf8');

// Find all JSON-like objects in the text using a regex or simple scan
let pos = 0;
const jsonObjects = [];
while (true) {
    const start = raw.indexOf('{"step_index":', pos);
    if (start === -1) break;
    
    // Find matching closing brace
    let braceCount = 0;
    let end = -1;
    for (let i = start; i < raw.length; i++) {
        if (raw[i] === '{') braceCount++;
        else if (raw[i] === '}') {
            braceCount--;
            if (braceCount === 0) {
                end = i;
                break;
            }
        }
    }
    if (end !== -1) {
        const objStr = raw.substring(start, end + 1);
        try {
            const parsed = JSON.parse(objStr);
            jsonObjects.push(parsed);
        } catch (e) {}
        pos = end + 1;
    } else {
        pos = start + 1;
    }
}

console.log(`Total JSON objects: ${jsonObjects.length}`);
jsonObjects.forEach((obj, idx) => {
    console.log(`[${idx+1}] Step ${obj.step_index} | Type: ${obj.type} | Source: ${obj.source}`);
    if (obj.content) {
        console.log(`    Content: ${obj.content.substring(0, 150).replace(/\r?\n/g, ' ')}`);
    }
});
