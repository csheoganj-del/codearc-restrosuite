/**
 * Build a slim static folder for Cloudflare Pages / Netlify.
 * Excludes node_modules, desktop EXEs, android builds, etc.
 *
 * Usage: node scripts/build-pages.cjs
 * Cloudflare: Build command = npm run pages:build
 *             Output directory = publish-static
 */
'use strict';

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const OUT = path.join(ROOT, 'publish-static');

const ROOT_FILES = [
  'index.html', 'login.html', 'dashboard.html', 'home.html', 'bill.html',
  'order.html', 'qr-order.html', 'kds.html', 'tokens.html', 'privacy.html',
  'terms.html', 'refund-policy.html', 'feedback.html', '404.html',
  'install.html', 'status.html',
  'config.js', 'env-config.js', 'pwa.js', 'script.js', 'service-worker.js', 'manifest.webmanifest',
  'app-update.json', 'robots.txt', 'sitemap.xml', 'styles.css',
  'dashboard-styles.css', 'legal.css',
  // Vercel cleanUrls + /login → /login.html rewrites (needed when deploying this folder)
  'vercel.json',
];

const DIRS = ['assets', 'src', 'images'];

function rmrf(p) {
  try {
    fs.rmSync(p, { recursive: true, force: true, maxRetries: 3 });
  } catch (e) {
    // Windows: directory busy — write into a fresh sibling then rename
    if (fs.existsSync(p)) {
      console.warn('[pages:build] could not remove', p, e.code || e.message);
    }
  }
}

function copyFile(src, dest) {
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  fs.copyFileSync(src, dest);
}

function copyDir(src, dest) {
  if (!fs.existsSync(src)) return;
  fs.mkdirSync(dest, { recursive: true });
  for (const ent of fs.readdirSync(src, { withFileTypes: true })) {
    if (ent.name === 'node_modules' || ent.name === '.git') continue;
    const s = path.join(src, ent.name);
    const d = path.join(dest, ent.name);
    if (ent.isDirectory()) copyDir(s, d);
    else if (ent.isFile()) {
      // Skip huge accidental binaries inside assets
      const st = fs.statSync(s);
      if (st.size > 25 * 1024 * 1024) {
        console.warn('skip large file', path.relative(ROOT, s), (st.size / 1024 / 1024).toFixed(1) + 'MB');
        continue;
      }
      copyFile(s, d);
    }
  }
}

function main() {
  rmrf(OUT);
  fs.mkdirSync(OUT, { recursive: true });

  for (const f of ROOT_FILES) {
    const src = path.join(ROOT, f);
    if (fs.existsSync(src)) copyFile(src, path.join(OUT, f));
  }
  for (const d of DIRS) {
    copyDir(path.join(ROOT, d), path.join(OUT, d));
  }

  // Small public downloads only (no .exe — large binaries on GitHub Releases)
  const dl = path.join(ROOT, 'downloads');
  const dlOut = path.join(OUT, 'downloads');
  fs.mkdirSync(dlOut, { recursive: true });
  if (fs.existsSync(dl)) {
    for (const name of fs.readdirSync(dl)) {
      const src = path.join(dl, name);
      const st = fs.statSync(src);
      if (st.isFile()) {
        if (/\.exe$/i.test(name) || /\.blockmap$/i.test(name)) continue;
        if (st.size > 20 * 1024 * 1024) continue;
        copyFile(src, path.join(dlOut, name));
      }
    }
    // electron-updater feed: tiny latest.yml only (EXE URLs point at GitHub)
    const yml = path.join(dl, 'desktop', 'latest.yml');
    if (fs.existsSync(yml) && fs.statSync(yml).size < 100 * 1024) {
      copyFile(yml, path.join(dlOut, 'desktop', 'latest.yml'));
    }
  }

  // Clean URLs for Cloudflare Pages / Netlify
  fs.writeFileSync(
    path.join(OUT, '_redirects'),
    [
      '/login /login.html 200',
      '/dashboard /dashboard.html 200',
      '/install /install.html 200',
      '/status /status.html 200',
      '/home /home.html 200',
      '/order /order.html 200',
      '/qr-order /qr-order.html 200',
      '/kds /kds.html 200',
      '/tokens /tokens.html 200',
      '/feedback /feedback.html 200',
      '/privacy /privacy.html 200',
      '/terms /terms.html 200',
      '/refund-policy /refund-policy.html 200',
      '',
    ].join('\n')
  );

  // Serverless API for Vercel when this folder is the deploy root
  const apiDir = path.join(ROOT, 'api');
  if (fs.existsSync(apiDir)) {
    copyDir(apiDir, path.join(OUT, 'api'));
  }

  // Optional: headers
  fs.writeFileSync(
    path.join(OUT, '_headers'),
    [
      '/*',
      '  X-Content-Type-Options: nosniff',
      '  Referrer-Policy: strict-origin-when-cross-origin',
      '',
      '/assets/*',
      '  Cache-Control: public, max-age=3600',
      '',
    ].join('\n')
  );

  let total = 0;
  let count = 0;
  function walk(dir) {
    for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
      const p = path.join(dir, ent.name);
      if (ent.isDirectory()) walk(p);
      else {
        count++;
        total += fs.statSync(p).size;
      }
    }
  }
  walk(OUT);
  console.log('[pages:build] wrote', OUT);
  console.log('[pages:build] files:', count, 'size MB:', (total / 1024 / 1024).toFixed(1));
}

main();
