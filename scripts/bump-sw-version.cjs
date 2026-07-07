// Automates the service-worker cache-version bump that was previously a
// manual edit (easy to forget -> "why is everyone stuck on the old
// version?"). Run this before every deploy (wired into scripts/release.ps1)
// so CACHE_NAME always changes, which is what makes the service worker
// actually replace its cached app-shell files on the next visit.
const fs = require("node:fs");
const path = require("node:path");

const SW_PATH = path.join(__dirname, "..", "service-worker.js");

function pad2(n) { return String(n).padStart(2, "0"); }

function main() {
  if (!fs.existsSync(SW_PATH)) {
    console.error(`[bump-sw-version] service-worker.js not found at ${SW_PATH}`);
    process.exit(1);
  }
  const src = fs.readFileSync(SW_PATH, "utf8");
  const now = new Date();
  const stamp = `${now.getFullYear()}${pad2(now.getMonth() + 1)}${pad2(now.getDate())}-${pad2(now.getHours())}${pad2(now.getMinutes())}`;
  const nextCacheName = `restrosuite-shell-v${stamp}`;

  const pattern = /const CACHE_NAME = "restrosuite-shell-v[^"]*";/;
  if (!pattern.test(src)) {
    console.error("[bump-sw-version] Could not find CACHE_NAME declaration to bump -- refusing to guess. Update service-worker.js manually.");
    process.exit(1);
  }
  const updated = src.replace(pattern, `const CACHE_NAME = "${nextCacheName}";`);
  fs.writeFileSync(SW_PATH, updated, "utf8");
  console.log(`[bump-sw-version] CACHE_NAME -> ${nextCacheName}`);
}

main();
