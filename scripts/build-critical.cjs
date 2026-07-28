'use strict';
/**
 * build-critical.cjs — RestroSuite esbuild pipeline
 * ─────────────────────────────────────────────────
 * Pass 1 — Critical bundle (assets/dist/critical.bundle.js)
 *   Concatenates and minifies all IIFE modules that must be available at POS
 *   boot time. These are loaded as a single file by dashboard.html before the
 *   heavier feature scripts, cutting the number of blocking round-trips.
 *
 *   RSActionFeedback is included first so it is always defined before pos-ui.js
 *   and any other module that calls RSActionFeedback.click/success/error.
 *
 * Pass 2 — Standalone feature-script minification (publish-static/assets/)
 *   Minifies dashboard.js and each features-*.js in-place inside the deploy
 *   output folder. These files are order/side-effect-heavy IIFEs that cannot
 *   be tree-shaken or module-bundled safely, but they still benefit from
 *   whitespace removal, identifier mangling, and dead-code elimination
 *   within each file.
 *
 *   Pass 2 runs only when publish-static/ already exists (i.e. after
 *   build-pages.cjs has copied source files into the deploy folder).
 *   It is skipped silently during local development builds.
 *
 * Source maps
 *   Both passes emit .js.map files alongside their output so that stack
 *   traces in production DevTools are human-readable.
 *
 * Usage:
 *   node scripts/build-critical.cjs          # local dev (Pass 1 only)
 *   npm run pages:build                       # full deploy (Pass 1 + 2)
 */

const fs   = require('fs');
const path = require('path');
const crypto = require('crypto');

async function main() {
  const root   = path.join(__dirname, '..');
  const outDir = path.join(root, 'assets', 'dist');
  if (!fs.existsSync(outDir)) {fs.mkdirSync(outDir, { recursive: true });}

  let esbuild;
  try {
    esbuild = require('esbuild');
  } catch (e) {
    console.error('[build-critical] esbuild not installed. Run: npm i -D esbuild');
    process.exit(1);
  }

  // ── Pass 1: Critical bundle ────────────────────────────────────────────────
  //
  // RSActionFeedback is intentionally first so it is always defined before
  // pos-ui.js (which calls RSActionFeedback.click/success/error on POS actions).
  // Even though dashboard.html also loads rs-action-feedback.js as a standalone
  // <script>, including it here guarantees correct ordering when the bundle is
  // the sole script tag in future HTML refactors.
  //
  // Excluded from bundle (must stay separate):
  //   dashboard.js     — god-file; requires exact load position after all modules
  //   features-*.js    — order + side-effect heavy; minified in Pass 2 instead
  //   super-admin.js   — large, rarely needed on POS boot; lazy-loaded
  //   employees-ui.js  — large; only needed on HR tab open
  //   growth-hub-shell — marketing only; never on POS critical path
  const sources = [
    // Feedback first — must be defined before pos-ui.js
    'assets/modules/rs-action-feedback.js',
    // ESC/POS encoder — used by receipt.js which follows
    'assets/escpos-encoder.js',
    // Core data/UI modules (POS boot critical path)
    'assets/modules/bill-identity.js',
    'assets/modules/inventory-ledger.js',
    'assets/modules/bills-history.js',
    'assets/modules/inventory-ui.js',
    'assets/modules/reports-ui.js',
    'assets/modules/gateway-monitor.js',
    'assets/modules/kds-ui.js',
    'assets/modules/qr-orders-ui.js',
    'assets/modules/tax-helpers.js',
    'assets/modules/pos-ui.js',
    // Print / receipt layer
    'assets/print-bridge.js',
    'assets/receipt.js',
    // WA send queue (used by pos-ui on bill dispatch)
    'assets/modules/wa-send-queue.js',
    // Competitive-ops telemetry (tiny; non-blocking)
    'assets/competitive-ops.js',
  ];

  // Concatenate IIFEs with section markers (esbuild bundle:false — they have
  // no import/export statements, so module-bundling is not applicable here).
  const concatenated = sources
    .map((rel) => {
      const p = path.join(root, rel);
      if (!fs.existsSync(p)) {throw new Error('[build-critical] Missing source: ' + rel);}
      return `\n/* === ${rel} === */\n` + fs.readFileSync(p, 'utf8') + '\n';
    })
    .join('\n');

  const tmp     = path.join(outDir, '_critical-src.js');
  const outFile = path.join(outDir, 'critical.bundle.js');
  const mapFile = outFile + '.map';

  fs.writeFileSync(tmp, concatenated);

  const buildResult = await esbuild.build({
    entryPoints: [tmp],
    bundle:       false,   // IIFEs — no module graph to resolve
    minify:       true,
    sourcemap:    true,    // emit critical.bundle.js.map for DevTools
    target:       ['es2019'],
    outfile:      outFile,
    metafile:     true,    // enables size analysis (written to .meta.json)
    legalComments: 'none',
    charset:      'utf8',
    logLevel:     'info',
  });

  // Cleanup temp source file
  try { fs.unlinkSync(tmp); } catch (_) {}

  // ── Content hash for cache-busting ────────────────────────────────────────
  // Write a short hex hash of the bundle alongside the file so that
  // build-pages.cjs / bump-sw-version.cjs can stamp asset URLs with
  // ?v=<hash> instead of a global date-based CACHE_NAME.
  const bundleBytes  = fs.readFileSync(outFile);
  const bundleHash   = crypto.createHash('sha256').update(bundleBytes).digest('hex').slice(0, 12);
  const bundleSize   = bundleBytes.length;

  const meta = {
    builtAt:  new Date().toISOString(),
    hash:     bundleHash,
    sources,
    bytes:    bundleSize,
    kb:       Math.round(bundleSize / 1024),
    // esbuild metafile breakdown — useful for `npx esbuild --analyze`
    esbuildMeta: buildResult.metafile || null,
  };
  fs.writeFileSync(
    path.join(outDir, 'critical.bundle.meta.json'),
    JSON.stringify(meta, null, 2)
  );

  console.log('[build-critical] Pass 1 complete:');
  console.log(JSON.stringify({ ok: true, kb: meta.kb, hash: bundleHash, sources: sources.length }, null, 2));

  // ── Pass 2: Minify standalone feature scripts in publish-static/ ──────────
  // These files are large, order-sensitive IIFEs that cannot be bundled but
  // benefit significantly from esbuild's whitespace and identifier minification.
  // Only runs when publish-static/ exists (after build-pages.cjs has run).
  const publishDir = path.join(root, 'publish-static');
  if (!fs.existsSync(publishDir)) {
    console.log('[build-critical] publish-static/ not found — skipping Pass 2 (run pages:build for full deploy).');
    return;
  }

  // Auto-discover JS files in publish-static/. Exclude:
  //   - assets/dist/* (already built in Pass 1)
  //   - *.min.js / qrcode.min.js (3rd party or pre-minified)
  //   - *.bundle.js (Pass 1 output)
  //   - lib/ folder (3rd party vendored)
  //   - Node 22+ fs.glob fallback to readdir walk for wide Node support
  function walkPass2(dir, results = []) {
    if (!fs.existsSync(dir)) {return results;}
    const relPublish = path.relative(publishDir, dir);
    if (relPublish.startsWith('assets' + path.sep + 'dist')) {return results;}
    if (relPublish.startsWith('assets' + path.sep + 'lib')) {return results;}
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    for (const e of entries) {
      const full = path.join(dir, e.name);
      if (e.isDirectory()) {
        walkPass2(full, results);
      } else if (e.isFile() && e.name.endsWith('.js')) {
        if (e.name.endsWith('.min.js')) {continue;}
        if (e.name === 'qrcode.min.js') {continue;}
        if (e.name.endsWith('.bundle.js')) {continue;}
        if (e.name.endsWith('.map')) {continue;}
        results.push(full);
      }
    }
    return results;
  }

  const assetsDir = path.join(publishDir, 'assets');
  const srcDir = path.join(publishDir, 'src');
  const allPass2 = walkPass2(assetsDir).concat(walkPass2(srcDir));

  // Always also include the explicit dashboard/features root-level relative
  // entries when they exist directly under publish-static/assets (belt+suspenders)
  const explicitRel = [
    'assets/dashboard.js',
    'assets/features-shell.js',
    'assets/features-editor.js',
    'assets/features-manage.js',
    'assets/features-extra.js',
    'assets/features-pos.js',
    'assets/features-growth.js',
  ];
  for (const rel of explicitRel) {
    const p = path.join(publishDir, rel);
    if (fs.existsSync(p) && !allPass2.includes(p)) {allPass2.push(p);}
  }

  console.log(
    `[build-critical] Pass 2: minifying ${allPass2.length} standalone JS files in publish-static/...`
  );
  let pass2SavedBytes = 0;
  let processed = 0;

  for (const srcPath of allPass2) {
    const rel = path.relative(publishDir, srcPath);
    const original  = fs.readFileSync(srcPath, 'utf8');
    const beforeLen = Buffer.byteLength(original, 'utf8');
    if (beforeLen === 0) {continue;}
    try {
      const result = await esbuild.transform(original, {
        loader:    'js',
        minify:    true,
        sourcemap: 'inline',
        target:    ['es2019'],
      });
      const afterLen = Buffer.byteLength(result.code, 'utf8');
      fs.writeFileSync(srcPath, result.code, 'utf8');
      const saved = Math.round((1 - afterLen / beforeLen) * 100);
      pass2SavedBytes += (beforeLen - afterLen);
      processed += 1;
      if (processed <= 12 || saved > 30) {
        console.log(
          '[build-critical] Pass 2',
          rel.padEnd(48),
          `${(beforeLen / 1024).toFixed(1)} KB → ${(afterLen / 1024).toFixed(1)} KB`,
          `(${saved}% saved)`
        );
      }
    } catch (err) {
      console.warn('[build-critical] Pass 2 skipped (transform error):', rel, err.message);
    }
  }

  if (processed > 12) {
    console.log(`[build-critical] Pass 2 ... (${processed - 12} additional files minified; see counts above)`);
  }

  console.log(
    `[build-critical] Pass 2 complete: ${processed} files, ${(pass2SavedBytes / 1024).toFixed(1)} KB total saved.`
  );
}

main().catch((e) => {
  console.error('[build-critical] Fatal:', e);
  process.exit(1);
});
