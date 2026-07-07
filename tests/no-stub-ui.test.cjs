// Guards against "stub" buttons/tabs shipping to production: placeholder
// handlers that do nothing, or "coming soon" text on something that looks
// clickable. This test intentionally fails the build the moment someone
// re-introduces the pattern the manual audit found (and fixed) on 2026-07-06.
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");

const HTML_FILES = [
  "index.html",
  "dashboard.html",
  "kds.html",
  "order.html",
  "qr-order.html",
  "login.html",
  "home.html",
  "tokens.html",
  "bill.html"
];

const JS_FILES = [
  "assets/dashboard.js",
  "assets/features-pos.js",
  "assets/features-manage.js",
  "assets/features-growth.js",
  "assets/features-shell.js",
  "assets/features-editor.js",
  "assets/features-extra.js"
];

// Patterns that indicate a button/tab is a non-functional placeholder.
const STUB_PATTERNS = [
  { name: "void(0) onclick stub", re: /onclick\s*=\s*["']\s*(javascript:)?void\(0\)\s*;?\s*["']/i },
  { name: "empty onclick stub", re: /onclick\s*=\s*["']\s*["']/i },
  { name: '"coming soon" placeholder text', re: /coming soon/i },
  { name: '"not implemented" placeholder', re: /not\s+(yet\s+)?implemented/i },
  { name: "TODO comment directly beside an onclick/button", re: /(onclick\s*=|<button)[^\n]{0,80}\/\/\s*TODO/i }
];

function scanFile(relPath) {
  const full = path.join(root, relPath);
  if (!fs.existsSync(full)) return []; // don't fail the suite if a file moved
  const src = fs.readFileSync(full, "utf8");
  const hits = [];
  for (const { name, re } of STUB_PATTERNS) {
    const match = src.match(re);
    if (match) {
      const line = src.slice(0, match.index).split("\n").length;
      hits.push(`${relPath}:${line} -- ${name} ("${match[0].slice(0, 60)}")`);
    }
  }
  return hits;
}

test("no stub buttons/tabs (placeholder onclick or 'coming soon') in shipped HTML", () => {
  const allHits = HTML_FILES.flatMap(scanFile);
  assert.deepEqual(allHits, [], `Found stub UI elements:\n${allHits.join("\n")}`);
});

test("no stub buttons/tabs (placeholder onclick or 'coming soon') in shipped JS", () => {
  const allHits = JS_FILES.flatMap(scanFile);
  assert.deepEqual(allHits, [], `Found stub UI elements:\n${allHits.join("\n")}`);
});
