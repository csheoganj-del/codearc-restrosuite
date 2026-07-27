/**
 * bump-sw-version.cjs — per-file content-hash cache-busting for the service worker
 * ──────────────────────────────────────────────────────────────────────────────────
 * WHY PER-FILE HASHES INSTEAD OF A GLOBAL DATE STAMP
 * ─────────────────────────────────────────────────
 * The old strategy bumped a single CACHE_NAME on every deploy, which forced the
 * service worker to re-download ALL ~60 app-shell files on every push — even
 * when only one CSS file changed. This defeats the entire purpose of a PWA cache.
 *
 * The new strategy:
 *   1. Reads every file listed in APP_SHELL from publish-static/.
 *   2. Computes a SHA-256 content hash for each one.
 *   3. Writes a CACHE_MANIFEST constant into service-worker.js that maps each
 *      URL to its hash.
 *   4. The service worker uses this manifest to decide per-file whether the
 *      cached copy is stale — only changed files are re-fetched on the next visit.
 *   5. CACHE_NAME still changes on every deploy (so the activate event fires and
 *      the old cache is deleted), but within the new cache only stale files are
 *      re-fetched from the network.
 *
 * For source files not present in publish-static/ (e.g. CDN URLs, HTML pages),
 * hashing is skipped and those entries are always re-fetched on update.
 *
 * Usage:
 *   node scripts/bump-sw-version.cjs          # standalone
 *   npm run bump:sw-version                   # via npm script
 *   Called automatically by scripts/release.ps1 before every production deploy.
 */

'use strict';

const fs     = require('node:fs');
const path   = require('node:path');
const crypto = require('node:crypto');

const SW_PATH      = path.join(__dirname, '..', 'service-worker.js');
const PUBLISH_DIR  = path.join(__dirname, '..', 'publish-static');
const ASSETS_DIR   = path.join(__dirname, '..');   // fallback: source tree

function pad2(n) { return String(n).padStart(2, '0'); }

/**
 * Compute a short (12-char) SHA-256 hex hash of a file's content.
 * Returns null if the file cannot be read.
 */
function hashFile(filePath) {
  try {
    const content = fs.readFileSync(filePath);
    return crypto.createHash('sha256').update(content).digest('hex').slice(0, 12);
  } catch (_) {
    return null;
  }
}

/**
 * Resolve a URL from APP_SHELL to a local file path.
 * Tries publish-static/ first, then the source tree.
 * Returns null for CDN URLs or files that genuinely don't exist.
 */
function resolveLocalPath(url) {
  // Skip external CDN URLs — we can't hash them locally
  if (/^https?:\/\//.test(url)) return null;

  // Strip query strings (?v=...)
  const cleanUrl = url.split('?')[0];
  const rel = cleanUrl.startsWith('/') ? cleanUrl.slice(1) : cleanUrl;

  const inPublish = path.join(PUBLISH_DIR, rel);
  if (fs.existsSync(inPublish)) return inPublish;

  const inSource = path.join(ASSETS_DIR, rel);
  if (fs.existsSync(inSource)) return inSource;

  return null;
}

/**
 * Extract the APP_SHELL array from service-worker.js source text.
 * Returns the array as a JS value by evaluating the literal with Function().
 */
function extractAppShell(src) {
  const match = src.match(/const APP_SHELL\s*=\s*(\[[\s\S]*?\]);/);
  if (!match) return null;
  try {
    // Safe eval of a pure array literal (no function calls, no references)
    // eslint-disable-next-line no-new-func
    return (new Function('return ' + match[1]))();
  } catch (_) {
    return null;
  }
}

function main() {
  if (!fs.existsSync(SW_PATH)) {
    console.error('[bump-sw-version] service-worker.js not found at', SW_PATH);
    process.exit(1);
  }

  const src = fs.readFileSync(SW_PATH, 'utf8');

  // 1. Bump CACHE_NAME with a fresh timestamp (so old cache is deleted on activate)
  const now   = new Date();
  const stamp = `${now.getFullYear()}${pad2(now.getMonth() + 1)}${pad2(now.getDate())}-${pad2(now.getHours())}${pad2(now.getMinutes())}`;
  const nextCacheName = `restrosuite-shell-v${stamp}`;

  const cacheNamePattern = /const CACHE_NAME = "restrosuite-shell-v[^"]*";/;
  if (!cacheNamePattern.test(src)) {
    console.error('[bump-sw-version] Could not find CACHE_NAME declaration — update service-worker.js manually.');
    process.exit(1);
  }
  let updated = src.replace(cacheNamePattern, `const CACHE_NAME = "${nextCacheName}";`);

  // 2. Build per-file content-hash manifest
  const appShell = extractAppShell(src);
  if (!appShell) {
    console.warn('[bump-sw-version] Could not parse APP_SHELL array — writing CACHE_NAME bump only.');
    fs.writeFileSync(SW_PATH, updated, 'utf8');
    console.log('[bump-sw-version] CACHE_NAME ->', nextCacheName);
    return;
  }

  const manifest = {};
  let hashed = 0, skipped = 0;

  for (const url of appShell) {
    const localPath = resolveLocalPath(url);
    if (!localPath) {
      skipped++;
      continue;
    }
    const hash = hashFile(localPath);
    if (hash) {
      // Strip query string from key (the SW matches on pathname)
      manifest[url.split('?')[0]] = hash;
      hashed++;
    } else {
      skipped++;
    }
  }

  console.log(`[bump-sw-version] Hashed ${hashed} files, skipped ${skipped} (CDN / missing).`);

  // 3. Replace or insert CACHE_MANIFEST constant in service-worker.js
  //    The manifest is injected as a plain JS object literal immediately
  //    after the CACHE_NAME line so the fetch handler can read it.
  const manifestJson   = JSON.stringify(manifest, null, 2);
  const manifestConst  = `const CACHE_MANIFEST = ${manifestJson};`;

  const manifestPattern = /const CACHE_MANIFEST\s*=\s*\{[\s\S]*?\};/;
  if (manifestPattern.test(updated)) {
    updated = updated.replace(manifestPattern, manifestConst);
  } else {
    // Insert right after CACHE_NAME line
    updated = updated.replace(
      `const CACHE_NAME = "${nextCacheName}";`,
      `const CACHE_NAME = "${nextCacheName}";\n\n// Per-file content hashes for stale-check in fetch handler (auto-generated — do not edit).\n${manifestConst}`
    );
  }

  fs.writeFileSync(SW_PATH, updated, 'utf8');
  console.log('[bump-sw-version] CACHE_NAME   ->', nextCacheName);
  console.log('[bump-sw-version] CACHE_MANIFEST ->', hashed, 'entries written to service-worker.js');
}

main();
