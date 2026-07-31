'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const ROOT = path.resolve(__dirname, '..');

test('Windows installer configures private LAN kitchen networking automatically', () => {
  const pkg = JSON.parse(fs.readFileSync(path.join(ROOT, 'desktop', 'package.json'), 'utf8'));
  assert.equal(pkg.build.nsis.perMachine, true);
  assert.equal(pkg.build.nsis.include, 'build/installer.nsh');

  const nsh = fs.readFileSync(path.join(ROOT, 'desktop', 'build', 'installer.nsh'), 'utf8');
  assert.match(nsh, /!macro customInstall/);
  assert.match(nsh, /profile=private/);
  assert.doesNotMatch(nsh, /profile=(?:any|public)/i);
  assert.match(nsh, /program="\$INSTDIR\\RestroSuite\.exe"/);
  assert.match(nsh, /protocol=TCP localport=8001-8020/);
  assert.match(nsh, /protocol=UDP localport=39821/);
  assert.match(nsh, /!macro customUnInstall/);
  assert.ok((nsh.match(/firewall delete rule/g) || []).length >= 4);
});

test('LAN client automatically retries on disconnect and offline transition', () => {
  const client = fs.readFileSync(path.join(ROOT, 'assets', 'modules', 'lan-sync.js'), 'utf8');
  assert.match(client, /function scheduleReconnect\(\)/);
  assert.match(client, /Math\.min\(Math\.round\(reconnectDelay \* 1\.7\), 30000\)/);
  assert.match(client, /window\.addEventListener\('offline'/);
  assert.match(client, /scheduleReconnect\(\);/);
});
