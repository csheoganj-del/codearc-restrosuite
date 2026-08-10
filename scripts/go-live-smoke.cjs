#!/usr/bin/env node
/**
 * Go-live smoke (automated half of the daily checklist).
 * Checks live feeds + local utility tests. Does not require a browser.
 *
 * Usage: node scripts/go-live-smoke.cjs
 */
'use strict';

const { spawnSync } = require('child_process');
const https = require('https');
const path = require('path');
const fs = require('fs');

const ROOT = path.resolve(__dirname, '..');
const SITE = 'https://restrosuite.codearc.co.in';

function fetchText(url) {
  return new Promise((resolve, reject) => {
    https
      .get(url, { headers: { 'Cache-Control': 'no-cache' } }, (res) => {
        let d = '';
        res.on('data', (c) => (d += c));
        res.on('end', () => {
          if (res.statusCode && res.statusCode >= 400) {
            reject(new Error(url + ' → ' + res.statusCode));
          } else {resolve(d);}
        });
      })
      .on('error', reject);
  });
}

async function main() {
  const results = [];
  const pass = (name, detail) => results.push({ name, ok: true, detail });
  const fail = (name, detail) => results.push({ name, ok: false, detail });

  // 1) Live content feed
  try {
    const raw = await fetchText(SITE + '/app-update.json');
    const j = JSON.parse(raw);
    if (j && j.version && /^v\d+/i.test(j.version)) {
      pass('Live features feed', j.version + ' — ' + (j.title || ''));
    } else {fail('Live features feed', 'invalid app-update.json');}
  } catch (e) {
    fail('Live features feed', String(e.message || e));
  }

  // 2) Desktop shell feed
  try {
    const yml = await fetchText(SITE + '/downloads/desktop/latest.yml');
    const m = yml.match(/version:\s*([0-9.]+)/);
    if (m) {pass('Desktop App feed', 'App ' + m[1]);}
    else {fail('Desktop App feed', 'no version in latest.yml');}
    if (!/github\.com/.test(yml) && !/RestroSuite-/.test(yml)) {
      fail('Desktop App feed URL', 'unexpected latest.yml body');
    } else {pass('Desktop download path', 'installer URL present');}
  } catch (e) {
    fail('Desktop App feed', String(e.message || e));
  }

  // 3) Dashboard reachable (may be hashed route; accept login shell too)
  try {
    const html = await fetchText(SITE + '/dashboard');
    if (/RestroSuite|Point of Sale|pos-tab|login|Sign in/i.test(html)) {
      pass('Dashboard HTML', 'loads');
    } else {
      // fallback path
      const html2 = await fetchText(SITE + '/dashboard.html');
      if (/RestroSuite|Point of Sale|pos-tab|builtin/i.test(html2)) {pass('Dashboard HTML', 'loads');}
      else {fail('Dashboard HTML', 'unexpected body');}
    }
    const tipHtml = await fetchText(SITE + '/dashboard.html').catch(() => '');
    if (tipHtml && /Date chips control stats/.test(tipHtml)) {
      fail('No engineer tip on Bills', 'tip still present');
    } else {
      pass('No engineer tip on Bills', 'clean');
    }
  } catch (e) {
    fail('Dashboard HTML', String(e.message || e));
  }

  // 4) Local utility tests
  const r = spawnSync(
    process.execPath,
    ['--test', path.join(ROOT, 'tests', 'go-live-utility.test.cjs')],
    { cwd: ROOT, encoding: 'utf8' }
  );
  if (r.status === 0) {pass('Utility unit tests', 'go-live-utility.test.cjs');}
  else {fail('Utility unit tests', (r.stdout || r.stderr || 'failed').slice(0, 400));}

  // 5) Print mode + density removal still in source
  try {
    const shell = fs.readFileSync(path.join(ROOT, 'assets', 'features-shell.js'), 'utf8');
    const polish = fs.readFileSync(path.join(ROOT, 'assets', 'modules', 'product-polish-18.js'), 'utf8');
    if (/Receipt print mode/.test(shell)) {pass('Print mode setting', 'HTML + text options');}
    else {fail('Print mode setting', 'missing');}
    if (/removeDensityFeatureCompletely|REMOVED/.test(polish)) {pass('Display zoom removed', 'ok');}
    else {fail('Display zoom removed', 'density still active');}
  } catch (e) {
    fail('Source checks', String(e.message || e));
  }

  // Report
  const failed = results.filter((x) => !x.ok);
  console.log('\n=== RestroSuite go-live smoke ===\n');
  for (const row of results) {
    console.log((row.ok ? 'PASS' : 'FAIL') + '  ' + row.name + (row.detail ? ' — ' + row.detail : ''));
  }
  console.log(
    '\n' +
      (failed.length ? failed.length + ' failed' : 'All checks passed') +
      ' · ' +
      results.length +
      ' checks\n'
  );
  console.log('Owner daily steps: docs/GO_LIVE_DAILY_CHECKLIST.md\n');
  process.exit(failed.length ? 1 : 0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
