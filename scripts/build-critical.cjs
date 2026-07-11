'use strict';
/**
 * Wave 4 — esbuild critical-path bundle for dashboard boot.
 * Output: assets/dist/critical.bundle.js
 *
 * Usage: node scripts/build-critical.cjs
 */
const fs = require('fs');
const path = require('path');

async function main() {
  const root = path.join(__dirname, '..');
  const outDir = path.join(root, 'assets', 'dist');
  if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });

  let esbuild;
  try {
    esbuild = require('esbuild');
  } catch (e) {
    console.error('esbuild not installed. Run: npm i -D esbuild');
    process.exit(1);
  }

  // Bundle non-god modules that can safely concatenate.
  // dashboard.js / features-pos remain separate (order + side-effect heavy).
  const entry = path.join(outDir, '_entry-critical.js');
  const sources = [
    'assets/print-bridge.js',
    'assets/receipt.js',
    'assets/competitive-ops.js',
  ];
  const body = sources
    .map((rel) => {
      const abs = path.join(root, rel).replace(/\\/g, '/');
      return `import ${JSON.stringify(abs)};`;
    })
    .join('\n');
  // esbuild needs ESM; our sources are IIFEs — use inject via banner concatenate instead
  fs.writeFileSync(
    entry,
    `// auto-generated critical entry — do not edit\n` +
      sources.map((s) => `// ${s}\n`).join('')
  );

  // Concatenate + minify IIFEs (they don't export modules)
  const concatenated = sources
    .map((rel) => {
      const p = path.join(root, rel);
      if (!fs.existsSync(p)) throw new Error('Missing ' + rel);
      return `\n/* === ${rel} === */\n` + fs.readFileSync(p, 'utf8') + '\n';
    })
    .join('\n');

  const tmp = path.join(outDir, '_critical-src.js');
  fs.writeFileSync(tmp, concatenated);

  const result = await esbuild.build({
    entryPoints: [tmp],
    bundle: false,
    minify: true,
    target: ['es2019'],
    outfile: path.join(outDir, 'critical.bundle.js'),
    legalComments: 'none',
    charset: 'utf8',
    logLevel: 'info',
  });

  // Cleanup temps
  try { fs.unlinkSync(tmp); } catch (_) {}
  try { fs.unlinkSync(entry); } catch (_) {}

  const outPath = path.join(outDir, 'critical.bundle.js');
  const size = fs.statSync(outPath).size;
  const meta = {
    builtAt: new Date().toISOString(),
    sources,
    bytes: size,
    kb: Math.round(size / 1024),
  };
  fs.writeFileSync(path.join(outDir, 'critical.bundle.meta.json'), JSON.stringify(meta, null, 2));
  console.log(JSON.stringify({ ok: true, ...meta }, null, 2));
  return result;
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
