const fs = require('fs');
const buf = fs.readFileSync('C:\\Users\\MASTER PC\\.gemini\\antigravity\\conversations\\5e5752b8-61ce-4276-ba23-d6db96bda092.db');
console.log('Database size:', buf.length);
if (buf.length >= 16) {
    console.log('First 16 bytes:', buf.slice(0, 16).toString('hex'));
    console.log('Header text:', buf.slice(0, 16).toString('ascii'));
} else {
    console.log('File too small.');
}
