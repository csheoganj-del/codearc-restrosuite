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

// esbuild is already a devDependency
let esbuild;
try {
  esbuild = require('esbuild');
} catch (_) {
  console.warn('[minify] esbuild not found — skipping CSS minification');
  process.exit(0);
}

// CSS files to minify in publish-static
const CSS_TARGETS = [
  'dashboard-styles.css',
  'styles.css',
  'legal.css',
];

// JS files to minify in publish-static
const JS_TARGETS = [
  'config.js',
  'pwa.js',
  'script.js',
];

function fmtKB(bytes) {
  return (bytes / 1024).toFixed(1) + ' KB';
}

async function minifyCSS(filePath) {
  if (!fs.existsSync(filePath)) return;
  const original = fs.readFileSync(filePath, 'utf8');
  try {
    const result = await esbuild.transform(original, {
      loader: 'css',
      minify: true,
    });
    const before = Buffer.byteLength(original, 'utf8');
    const after = Buffer.byteLength(result.code, 'utf8');
    fs.writeFileSync(filePath, result.code, 'utf8');
    const saved = Math.round((1 - after / before) * 100);
    console.log(
      '[minify] CSS',
      path.relative(OUT, filePath),
      fmtKB(before), '→', fmtKB(after),
      '(' + saved + '% saved)'
    );
  } catch (err) {
    console.warn('[minify] CSS skipped (error):', path.relative(OUT, filePath), err.message);
  }
}

async function minifyJS(filePath) {
  if (!fs.existsSync(filePath)) return;
  const original = fs.readFileSync(filePath, 'utf8');
  try {
    const result = await esbuild.transform(original, {
      loader: 'js',
      minify: true,
    });
    const before = Buffer.byteLength(original, 'utf8');
    const after = Buffer.byteLength(result.code, 'utf8');
    fs.writeFileSync(filePath, result.code, 'utf8');
    const saved = Math.round((1 - after / before) * 100);
    console.log(
      '[minify] JS ',
      path.relative(OUT, filePath),
      fmtKB(before), '→', fmtKB(after),
      '(' + saved + '% saved)'
    );
  } catch (err) {
    console.warn('[minify] JS skipped (error):', path.relative(OUT, filePath), err.message);
  }
}

async function main() {
  if (!fs.existsSync(OUT)) {
    console.warn('[minify] publish-static not found — run pages:build first');
    process.exit(0);
  }

  console.log('[minify] Minifying deploy assets in', OUT);

  for (const f of CSS_TARGETS) {
    await minifyCSS(path.join(OUT, f));
  }

  for (const f of JS_TARGETS) {
    await minifyJS(path.join(OUT, f));
  }

  console.log('[minify] Done.');
}

main().catch((err) => {
  console.error('[minify] Fatal:', err.message);
  process.exit(1);
});
