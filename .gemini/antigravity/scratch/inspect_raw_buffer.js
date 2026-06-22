const { execSync } = require('child_process');
const fs = require('fs');

const dbPath = 'C:\\Users\\MASTER PC\\.gemini\\antigravity\\conversations\\5e5752b8-61ce-4276-ba23-d6db96bda092.db';
const targets = [1709, 1725, 1888, 1890];

targets.forEach(idx => {
    console.log(`\n==========================================`);
    console.log(`Extracting Step ${idx} directly from SQLite...`);
    console.log(`==========================================`);
    try {
        const rawJson = execSync(`sqlite3 -json "${dbPath}" "SELECT HEX(step_payload) as hex FROM steps WHERE idx=${idx}"`, {
            encoding: 'utf8',
            maxBuffer: 50 * 1024 * 1024
        });
        
        const rows = JSON.parse(rawJson);
        if (rows.length === 0 || !rows[0].hex) {
            console.log(`No payload found for Step ${idx}`);
            return;
        }
        
        const buf = Buffer.from(rows[0].hex, 'hex');
        console.log(`Payload size: ${buf.length} bytes`);
        
        // Scan buffer for UTF-8 strings
        // Strings in protobuf are length-prefixed, but we can also extract any block of contiguous printable characters
        // containing newlines, tabs, and common code symbols.
        let current = [];
        const strings = [];
        for (let i = 0; i < buf.length; i++) {
            const c = buf[i];
            // Allow printable ASCII characters, space, tab, newline, carriage return, and Indian Rupee sign (₹ - 0xE2 0x82 0xB9)
            const isPrintable = (c >= 32 && c <= 126) || c === 10 || c === 13 || c === 9 || c === 0xE2 || c === 0x82 || c === 0xB9;
            
            if (isPrintable) {
                current.push(c);
            } else {
                if (current.length >= 100) {
                    strings.push(Buffer.from(current).toString('utf8'));
                }
                current = [];
            }
        }
        if (current.length >= 100) {
            strings.push(Buffer.from(current).toString('utf8'));
        }
        
        console.log(`Found ${strings.length} long text segments.`);
        strings.forEach((str, sIdx) => {
            const outPath = `C:\\Users\\MASTER PC\\.gemini\\antigravity\\brain\\25acef71-566f-472a-a4e8-1e0c6ec04c6b\\scratch\\step_${idx}_str_${sIdx}.txt`;
            fs.writeFileSync(outPath, str, 'utf8');
            console.log(`Saved segment ${sIdx} (${str.length} chars) to ${outPath}`);
            console.log(`Preview: ${str.substring(0, 200).replace(/\r?\n/g, ' ')}...`);
        });
        
    } catch (e) {
        console.error(`Error extracting step ${idx}:`, e.message);
    }
});
