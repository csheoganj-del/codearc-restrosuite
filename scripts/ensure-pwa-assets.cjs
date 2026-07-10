/**
 * Ensures launch-critical PWA assets exist under assets/.
 * Icons/screenshots are generated offline; this only fails the build if
 * expected files are missing so deploys never ship a broken manifest.
 */
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const required = [
  "assets/restrosuite-mark.png",
  "assets/restrosuite-mark-512.png",
  "assets/restrosuite-maskable-512.png",
  "assets/screenshot-pos.png",
  "assets/screenshot-cart.png",
  "assets/license-config.js",
  "assets/license-guard.js",
  "manifest.webmanifest"
];

const missing = required.filter(rel => !fs.existsSync(path.join(root, rel)));
if (missing.length) {
  for (const file of missing) console.error(`Missing PWA/launch asset: ${file}`);
  process.exit(1);
}

const manifest = fs.readFileSync(path.join(root, "manifest.webmanifest"), "utf8");
for (const needle of [
  "restrosuite-mark-512.png",
  "restrosuite-maskable-512.png",
  "screenshot-pos.png",
  "screenshot-cart.png",
  '"purpose": "maskable"'
]) {
  if (!manifest.includes(needle)) {
    console.error(`manifest.webmanifest is missing required entry: ${needle}`);
    process.exit(1);
  }
}

console.log("PWA launch assets present.");
