/**
 * minify-assets.cjs — RestroSuite deploy-time CSS minifier
 * ─────────────────────────────────────────────────────────
 * Runs AFTER build-pages.cjs copies files into publish-static/.
 * Minifies CSS files in-place inside publish-static/ only.
 * Source files (dashboard-styles.css, styles.css, etc.) are NEVER modified.
 *
 * Uses esbuild (already a dev dependency) — no new packages needed.
 * Safe: skips files on error, prints size savings.
 *
 * Usage: node scripts/minify-assets.cjs
 */
'use strict';

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const OUT = path.join(ROOT, 'publish-static');

let esbuild;
try {
  esbuild = require('esbuild');
} catch (_) {
  console.warn('[minify] esbuild not found — skipping minification');
  process.exit(0);
}

const CSS_ROOT_TARGETS = [
  'dashboard-styles.css',
  'styles.css',
  'legal.css',
];

const JS_ROOT_TARGETS = [
  'config.js',
  'pwa.js',
  'script.js',
];

function fmtKB(bytes) {
  return (bytes / 1024).toFixed(1) + ' KB';
}

function walkGlob(dir, extFilter, skipDirs = new Set(['node_modules', '.git'])) {
  const results = [];
  if (!fs.existsSync(dir)) {return results;}
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (skipDirs.has(entry.name)) {continue;}
      if (entry.name === 'dist') {continue;}
      if (entry.name === 'lib') {continue;}
      results.push(...walkGlob(full, extFilter, skipDirs));
    } else if (entry.isFile()) {
      if (!extFilter(entry.name)) {continue;}
      if (entry.name.endsWith('.min.js') || entry.name.endsWith('.min.css')) {continue;}
      if (entry.name.endsWith('.bundle.js')) {continue;}
      if (entry.name === 'qrcode.min.js') {continue;}
      if (entry.name.endsWith('.map')) {continue;}
      results.push(full);
    }
  }
  return results;
}

function unique(arr) {
  const seen = new Set();
  const out = [];
  for (const x of arr) {
    const k = path.resolve(x);
    if (!seen.has(k)) { seen.add(k); out.push(x); }
  }
  return out;
}

async function minifyCSS(filePath) {
  if (!fs.existsSync(filePath)) {return 0;}
  const original = fs.readFileSync(filePath, 'utf8');
  const before = Buffer.byteLength(original, 'utf8');
  if (before === 0) {return 0;}
  try {
    const result = await esbuild.transform(original, {
      loader: 'css',
      minify: true,
    });
    const after = Buffer.byteLength(result.code, 'utf8');
    fs.writeFileSync(filePath, result.code, 'utf8');
    const saved = Math.round((1 - after / before) * 100);
    console.log(
      '[minify] CSS',
      path.relative(OUT, filePath).padEnd(44),
      fmtKB(before), '→', fmtKB(after),
      '(' + saved + '% saved)'
    );
    return before - after;
  } catch (err) {
    console.warn('[minify] CSS skipped (error):', path.relative(OUT, filePath), err.message);
    return 0;
  }
}

async function minifyJS(filePath) {
  if (!fs.existsSync(filePath)) {return 0;}
  const original = fs.readFileSync(filePath, 'utf8');
  const before = Buffer.byteLength(original, 'utf8');
  if (before === 0) {return 0;}
  try {
    const result = await esbuild.transform(original, {
      loader: 'js',
      minify: true,
      target: ['es2019'],
    });
    const after = Buffer.byteLength(result.code, 'utf8');
    fs.writeFileSync(filePath, result.code, 'utf8');
    const saved = Math.round((1 - after / before) * 100);
    console.log(
      '[minify] JS ',
      path.relative(OUT, filePath).padEnd(44),
      fmtKB(before), '→', fmtKB(after),
      '(' + saved + '% saved)'
    );
    return before - after;
  } catch (err) {
    console.warn('[minify] JS skipped (error):', path.relative(OUT, filePath), err.message);
    return 0;
  }
}

async function main() {
  if (!fs.existsSync(OUT)) {
    console.warn('[minify] publish-static not found — run pages:build first');
    process.exit(0);
  }

  console.log('[minify] Auto-discovering & minifying deploy assets in', OUT);

  let cssFiles = CSS_ROOT_TARGETS.map(f => path.join(OUT, f));
  cssFiles = cssFiles.concat(walkGlob(path.join(OUT, 'assets'), (n) => n.endsWith('.css')));
  cssFiles = cssFiles.concat(walkGlob(path.join(OUT, 'src'), (n) => n.endsWith('.css')));
  cssFiles = unique(cssFiles);

  let jsFiles = JS_ROOT_TARGETS.map(f => path.join(OUT, f));
  jsFiles = jsFiles.concat(walkGlob(path.join(OUT, 'assets'), (n) => n.endsWith('.js')));
  jsFiles = jsFiles.concat(walkGlob(path.join(OUT, 'src'), (n) => n.endsWith('.js')));
  jsFiles = unique(jsFiles);

  console.log(`[minify] Discovered ${cssFiles.length} CSS files, ${jsFiles.length} JS files`);

  let cssSaved = 0;
  for (const f of cssFiles) {
    cssSaved += await minifyCSS(f);
  }

  let jsSaved = 0;
  for (const f of jsFiles) {
    jsSaved += await minifyJS(f);
  }

  console.log(
    `[minify] Done. CSS saved: ${fmtKB(cssSaved)} total | JS saved: ${fmtKB(jsSaved)} total | ` +
    `Files processed: ${cssFiles.length + jsFiles.length}`
  );
}

main().catch((err) => {
  console.error('[minify] Fatal:', err.message);
  process.exit(1);
});
