const fs = require('fs');

const buf = fs.readFileSync('C:\\Users\\MASTER PC\\.gemini\\antigravity\\agyhub_summaries_proto.pb');
let current = '';
const strings = [];
for (let i = 0; i < buf.length; i++) {
    const c = buf[i];
    if (c >= 32 && c <= 126) {
        current += String.fromCharCode(c);
    } else {
        if (current.length >= 4) {
            strings.push(current.trim());
        }
        current = '';
    }
}
if (current.length >= 4) {
    strings.push(current.trim());
}

console.log('Strings in agyhub_summaries_proto.pb:');
strings.forEach(s => console.log(`- ${s}`));
