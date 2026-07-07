/* ============================================================
   RestroSuite Desktop -- sync-app.mjs
   ------------------------------------------------------------
   Copies the runtime files of the RestroSuite WEB app (the parent
   folder, ../) into ./app so the desktop build ships a self-
   contained, offline copy.

   The web app stays the single source of truth: this script only
   READS from it and never writes back. Re-run it (npm run sync)
   whenever you update the web app and want the desktop build to
   pick up the changes.
   ============================================================ */
import { promises as fs } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO = path.resolve(__dirname, '..');   // ../  (web app root)
const DEST = path.join(__dirname, 'app');     // ./app

// Top-level files the app needs at runtime.
const ROOT_FILES = [
  'index.html', 'login.html', 'dashboard.html', 'home.html', 'order.html',
  'qr-order.html', 'kds.html', 'tokens.html', 'bill.html', 'privacy.html',
  'terms.html', 'refund-policy.html', '404.html',
  'config.js', 'pwa.js', 'service-worker.js', 'script.js',
  'manifest.webmanifest', 'robots.txt', 'sitemap.xml',
];

// Whole directories to mirror.
const ROOT_DIRS = ['assets', 'src', 'images'];

// Never copy these (dev / secret / heavy).
const EXCLUDE = new Set([
  'node_modules', '.git', '.env', '.env.local', '.env.example',
  'backups', 'tests', 'scratch', 'uploads',
]);

async function exists(p) { try { await fs.access(p); return true; } catch { return false; } }

async function copyDir(src, dest) {
  await fs.mkdir(dest, { recursive: true });
  const entries = await fs.readdir(src, { withFileTypes: true });
  for (const e of entries) {
    if (EXCLUDE.has(e.name)) continue;
    const s = path.join(src, e.name);
    const d = path.join(dest, e.name);
    if (e.isDirectory()) await copyDir(s, d);
    else if (e.isFile()) await fs.copyFile(s, d);
  }
}

async function main() {
  // Fresh copy each run so deleted web-app files don't linger in the bundle.
  await fs.rm(DEST, { recursive: true, force: true });
  await fs.mkdir(DEST, { recursive: true });

  let files = 0, dirs = 0, missing = [];

  for (const f of ROOT_FILES) {
    const src = path.join(REPO, f);
    if (await exists(src)) { await fs.copyFile(src, path.join(DEST, f)); files++; }
    else missing.push(f);
  }

  for (const dir of ROOT_DIRS) {
    const src = path.join(REPO, dir);
    if (await exists(src)) { await copyDir(src, path.join(DEST, dir)); dirs++; }
  }

  console.log(`[sync] Copied ${files} root files + ${dirs} directories into ./app`);
  if (missing.length) {
    console.log(`[sync] Skipped (not found in ../): ${missing.join(', ')}`);
  }
  console.log('[sync] Done. The desktop bundle is now up to date with the web app.');
}

main().catch((err) => { console.error('[sync] FAILED:', err); process.exit(1); });
