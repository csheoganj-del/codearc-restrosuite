'use strict';
/** Inventory client-facing control IDs/titles from dashboard.html (excludes superadmin-only blocks). */
const fs = require('fs');
const h = fs.readFileSync(require('path').join(__dirname, '..', 'dashboard.html'), 'utf8');

// Strip superadmin-only sections roughly
const cleaned = h.replace(/superadmin-only[\s\S]*?(?=<\/section>|<\/div>)/gi, '');

const idRe = /\bid=["']([^"']+)["']/g;
const titleRe = /\btitle=["']([^"']+)["']/g;
const ariaRe = /\baria-label=["']([^"']+)["']/g;
const btnTextRe = /<button\b[^>]*>([\s\S]*?)<\/button>/gi;

const ids = new Set();
const titles = new Set();
let m;
while ((m = idRe.exec(cleaned))) {
  const id = m[1];
  if (/^(btn-|cart-|promo-|rs-|set-|bills-|inv-|tb-|mnav|sidebar|open-|klc-)/.test(id) || id.includes('btn'))
    ids.add(id);
}
while ((m = titleRe.exec(cleaned))) titles.add(m[1].replace(/\s+/g, ' ').trim());
while ((m = ariaRe.exec(cleaned))) titles.add(m[1].replace(/\s+/g, ' ').trim());

const texts = new Set();
while ((m = btnTextRe.exec(cleaned))) {
  const t = m[1]
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  if (t && t.length < 60 && !/^[0-9]+$/.test(t)) texts.add(t);
}

console.log('=== IDS', ids.size);
[...ids].sort().forEach((x) => console.log(x));
console.log('=== TITLES', titles.size);
[...titles].sort().forEach((x) => console.log(x));
console.log('=== BUTTON TEXTS', texts.size);
[...texts].sort().forEach((x) => console.log(x));
