/**
 * Fail CI / local check if browser role-defaults.js drifts from Deno _shared/role-defaults.ts
 * Usage: node scripts/check-role-defaults.cjs
 */
'use strict';

const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const tsPath = path.join(root, 'supabase', 'functions', '_shared', 'role-defaults.ts');
const jsPath = path.join(root, 'assets', 'role-defaults.js');

function read(p) {
  if (!fs.existsSync(p)) {throw new Error('Missing file: ' + p);}
  return fs.readFileSync(p, 'utf8');
}

/** Extract role -> tab list from ROLE_DEFAULT_TABS-like blocks */
function extractRoleTabs(src) {
  const map = {};
  // match role: [ ... ] or role: ALL_MODULE_TABS...
  const re = /(?:^|[\s,{])(admin|manager|cashier|waiter|captain|kitchen|inventory|customer_display)\s*:\s*(\[[^\]]*\]|ALL_MODULE_TABS[^\n,]*)/gm;
  let m;
  while ((m = re.exec(src))) {
    const role = m[1];
    const body = m[2].trim();
    // admin: [...ALL_MODULE_TABS] or admin: ALL_MODULE_TABS.slice()
    if (/ALL_MODULE_TABS/.test(body)) {
      map[role] = ['__ALL__'];
      continue;
    }
    const tabs = [];
    const tre = /['"]([a-z0-9_-]+)['"]/g;
    let t;
    while ((t = tre.exec(body))) {tabs.push(t[1]);}
    map[role] = tabs.sort();
  }
  return map;
}

function extractAllModuleTabs(src) {
  const m = src.match(/ALL_MODULE_TABS[^=]*=\s*\[([\s\S]*?)\]/);
  if (!m) {return [];}
  const tabs = [];
  const tre = /['"]([a-z0-9_-]+)['"]/g;
  let t;
  while ((t = tre.exec(m[1]))) {tabs.push(t[1]);}
  return tabs.sort();
}

function main() {
  const ts = read(tsPath);
  const js = read(jsPath);
  const errors = [];

  const tsAll = extractAllModuleTabs(ts);
  const jsAll = extractAllModuleTabs(js);
  if (JSON.stringify(tsAll) !== JSON.stringify(jsAll)) {
    errors.push('ALL_MODULE_TABS mismatch:\n  ts: ' + tsAll.join(',') + '\n  js: ' + jsAll.join(','));
  }

  const tsRoles = extractRoleTabs(ts);
  const jsRoles = extractRoleTabs(js);
  const roles = new Set([...Object.keys(tsRoles), ...Object.keys(jsRoles)]);
  for (const role of roles) {
    const a = tsRoles[role];
    const b = jsRoles[role];
    if (!a) {
      errors.push('Role missing in TS: ' + role);
      continue;
    }
    if (!b) {
      errors.push('Role missing in JS: ' + role);
      continue;
    }
    // admin in TS is ALL_MODULE_TABS spread; JS uses ALL_MODULE_TABS.slice()
    const normA = a[0] === '__ALL__' ? tsAll : a;
    const normB = b[0] === '__ALL__' ? jsAll : b;
    if (JSON.stringify(normA) !== JSON.stringify(normB)) {
      errors.push(
        'ROLE_DEFAULT_TABS.' + role + ' mismatch:\n  ts: ' + normA.join(',') + '\n  js: ' + normB.join(',')
      );
    }
  }

  if (errors.length) {
    console.error('[check-role-defaults] FAILED\n' + errors.join('\n\n'));
    process.exit(1);
  }
  console.log('[check-role-defaults] OK — role-defaults.ts and role-defaults.js match');
}

main();
