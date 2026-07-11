'use strict';
/**
 * Wave 4 — E2E smoke (no browser required in CI).
 * Validates critical product surface + optional live HTTP if BASE_URL set.
 *
 *   npm test
 *   BASE_URL=http://127.0.0.1:8000 npm run test:e2e
 */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const http = require('http');

const root = path.join(__dirname, '..');

function exists(rel) {
  return fs.existsSync(path.join(root, rel));
}

test('wave4 artifacts exist', () => {
  assert.ok(exists('assets/print-bridge.js'));
  assert.ok(exists('assets/db.js'));
  assert.ok(exists('desktop/preload.js'));
  assert.ok(exists('desktop/main.js'));
  assert.ok(exists('scripts/build-critical.cjs'));
});

test('print bridge exposes RSPrintBridge API surface', () => {
  const src = fs.readFileSync(path.join(root, 'assets/print-bridge.js'), 'utf8');
  assert.match(src, /RSPrintBridge/);
  assert.match(src, /printHtml/);
  assert.match(src, /printEscPosText/);
  assert.match(src, /RS_DESKTOP/);
});

test('desktop main registers print IPC handlers', () => {
  const src = fs.readFileSync(path.join(root, 'desktop/main.js'), 'utf8');
  assert.match(src, /rs-print-html/);
  assert.match(src, /rs-list-printers/);
  assert.match(src, /rs-print-escpos/);
});

test('db.js uses IndexedDB for sync queue', () => {
  const src = fs.readFileSync(path.join(root, 'assets/db.js'), 'utf8');
  assert.match(src, /indexedDB|SYNC_IDB_NAME|idbReplaceAll/);
  assert.match(src, /migrateSyncQueueToIdb|_syncQueueMem/);
});

test('dashboard loads print-bridge and optional critical bundle', () => {
  const html = fs.readFileSync(path.join(root, 'dashboard.html'), 'utf8');
  assert.match(html, /print-bridge\.js|critical\.bundle\.js/);
});

test('critical bundle builds (esbuild)', async () => {
  const { spawnSync } = require('child_process');
  const r = spawnSync(process.execPath, [path.join(root, 'scripts/build-critical.cjs')], {
    cwd: root,
    encoding: 'utf8',
  });
  if (r.status !== 0) {
    console.error(r.stdout, r.stderr);
  }
  assert.equal(r.status, 0, 'build-critical should exit 0');
  assert.ok(exists('assets/dist/critical.bundle.js'));
  const meta = JSON.parse(fs.readFileSync(path.join(root, 'assets/dist/critical.bundle.meta.json'), 'utf8'));
  assert.ok(meta.bytes > 1000);
});

test('optional live HTTP smoke when BASE_URL set', async (t) => {
  const base = process.env.BASE_URL || process.env.E2E_BASE_URL;
  if (!base) {
    t.skip('BASE_URL not set');
    return;
  }
  const url = base.replace(/\/+$/, '') + '/login.html';
  const body = await new Promise((resolve, reject) => {
    const req = http.get(url, { timeout: 8000 }, (res) => {
      let data = '';
      res.on('data', (c) => (data += c));
      res.on('end', () => resolve({ status: res.statusCode, data }));
    });
    req.on('error', reject);
    req.on('timeout', () => { req.destroy(); reject(new Error('timeout')); });
  });
  assert.ok(body.status >= 200 && body.status < 400);
  assert.match(body.data, /login|RestroSuite|password/i);
});
