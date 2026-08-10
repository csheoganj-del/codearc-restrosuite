#!/usr/bin/env node
/**
 * Fix UTF-8 text that was mis-saved as Latin-1 (mojibake).
 * e.g. × → Ã—, ₹ → â‚¹  (looks like broken "A"/garbled currency on screen)
 */
'use strict';

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');

const MAP = [
  // Close / multiply — the "A-like" glyph when corrupted
  ['Ã—', '×'],
  // Rupee
  ['â‚¹', '₹'],
  // Arrows
  ['â†’', '→'],
  ['â†‘', '↑'],
  ['â†“', '↓'],
  ['â†', '←'],
  // Quotes / dashes / ellipsis
  ['â€¦', '…'],
  ['â€”', '—'],
  ['â€“', '–'],
  ['â€™', "'"],
  ['â€˜', "'"],
  ['â€œ', '"'],
  ['â€\u009d', '"'],
  // Symbols / emoji often mangled in UI
  ['âš ï¸', '⚠️'],
  ['âš ï¸', '⚠️'],
  ['âœ…', '✅'],
  ['â˜•', '☕'],
  ['CafÃ©', 'Café'],
  ['cafÃ©', 'café'],
  ['ðŸ½ï¸', '🍽️'],
  ['ðŸ½ï¸', '🍽️'],
  ['â‹¯', '⋯'],
  // Degree / middot / copyright
  ['Â°', '°'],
  ['Â·', '·'],
  ['Â©', '©'],
  ['Â®', '®'],
  ['Â ', ' '],
];

const ROOTS = [
  'dashboard.html',
  'login.html',
  'index.html',
  'home.html',
  'kds.html',
  'bill.html',
  'order.html',
  'qr-order.html',
  'tokens.html',
  'assets',
  'src',
];

function shouldSkip(rel) {
  return /node_modules|[\\/]dist[\\/]|critical\.bundle|\.map$|_critical-src|publish-static|win-unpacked|dist-print|dist-license|dist-v|dist-checkout|dist-lan|desktop[\\/]dist/.test(
    rel
  );
}

function walk(dir, out) {
  if (!fs.existsSync(dir)) {return out;}
  const st = fs.statSync(dir);
  if (st.isFile()) {
    out.push(dir);
    return out;
  }
  for (const name of fs.readdirSync(dir)) {
    if (name === 'node_modules' || name === '.git' || name.startsWith('.')) {continue;}
    walk(path.join(dir, name), out);
  }
  return out;
}

function collectFiles() {
  const files = [];
  for (const r of ROOTS) {
    const full = path.join(ROOT, r);
    if (!fs.existsSync(full)) {continue;}
    if (fs.statSync(full).isFile()) {
      files.push(full);
      continue;
    }
    walk(full, files);
  }
  return files.filter((f) => {
    const rel = path.relative(ROOT, f);
    if (shouldSkip(rel)) {return false;}
    return /\.(html|js|css)$/i.test(f);
  });
}

function main() {
  const files = collectFiles();
  const report = [];
  let total = 0;

  for (const file of files) {
    let text = fs.readFileSync(file, 'utf8');
    let n = 0;
    for (const [bad, good] of MAP) {
      if (!text.includes(bad)) {continue;}
      const parts = text.split(bad);
      const c = parts.length - 1;
      text = parts.join(good);
      n += c;
    }
    if (n > 0) {
      fs.writeFileSync(file, text, 'utf8');
      total += n;
      report.push({ file: path.relative(ROOT, file).replace(/\\/g, '/'), fixes: n });
    }
  }

  // Residual scan for leftover mojibake-ish sequences
  const residual = [];
  const residualRe = /Ã.|â.|Â[°·©® ]|ðŸ/g;
  for (const file of files) {
    const text = fs.readFileSync(file, 'utf8');
    const m = text.match(residualRe);
    if (!m || !m.length) {continue;}
    residual.push({
      file: path.relative(ROOT, file).replace(/\\/g, '/'),
      count: m.length,
      samples: Array.from(new Set(m)).slice(0, 15),
    });
  }

  // Sync fixed dashboard.html into packaged copies of the web root
  for (const dest of [
    'desktop/app/dashboard.html',
    'android-app/app/src/main/assets/dashboard.html',
  ]) {
    const src = path.join(ROOT, 'dashboard.html');
    const d = path.join(ROOT, dest);
    if (fs.existsSync(src) && fs.existsSync(path.dirname(d))) {
      fs.copyFileSync(src, d);
    }
  }

  console.log(
    JSON.stringify(
      {
        ok: true,
        filesScanned: files.length,
        filesFixed: report.length,
        totalReplacements: total,
        report,
        residualTop: residual.sort((a, b) => b.count - a.count).slice(0, 30),
      },
      null,
      2
    )
  );
}

main();
