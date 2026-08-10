const fs = require('fs');
const p = process.argv[2] || '.env.local';
let buf = fs.readFileSync(p);
console.log('first3', buf[0], buf[1], buf[2]);
// strip UTF-8 BOM
if (buf[0] === 0xef && buf[1] === 0xbb && buf[2] === 0xbf) {
  buf = buf.subarray(3);
  console.log('stripped UTF-8 BOM');
}
let t = buf.toString('utf8');
if (t.charCodeAt(0) === 0xfeff) {t = t.slice(1);}
t = t
  .replace(/\uFEFF/g, '')
  .replace(/[\u2014\u2013]/g, '-')
  .replace(/\u2192/g, '->')
  .replace(/[\u2018\u2019]/g, "'")
  .replace(/[\u201C\u201D]/g, '"');
// ensure LF endings for dotenv parsers
t = t.replace(/\r\n/g, '\n');
if (!t.endsWith('\n')) {t += '\n';}
fs.writeFileSync(p, t, { encoding: 'utf8' });
const after = fs.readFileSync(p);
console.log('after first3', after[0], after[1], after[2]);
console.log('first line:', t.split('\n')[0]);
console.log('ok', p);
