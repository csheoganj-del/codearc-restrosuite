const fs = require('fs');
const p = process.argv[2] || 'supabase/functions/_shared/billing-invoice.ts';
let t = fs.readFileSync(p, 'utf8');
const before = t.length;
t = t.replace(/[^\x09\x0A\x0D\x20-\x7E]/g, (ch) => {
  const c = ch.charCodeAt(0);
  if (c === 0x2014 || c === 0x2013) {return '-';}
  if (c === 0x2018 || c === 0x2019) {return "'";}
  if (c === 0x201c || c === 0x201d) {return '"';}
  if (c === 0x2022) {return '*';}
  if (c === 0x00a0 || c === 0xfffd) {return ' ';}
  return ' ';
});
fs.writeFileSync(p, t);
console.log('cleaned', p, 'before', before, 'after', t.length);
// verify no high chars left
let bad = 0;
for (let i = 0; i < t.length; i++) {if (t.charCodeAt(i) > 127) {bad++;}}
console.log('remaining non-ascii', bad);
