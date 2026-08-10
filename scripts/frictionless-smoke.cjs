'use strict';
/**
 * Frictionless 10x — production smoke checklist (automated)
 *
 * Checks that the live site ships the activation pack, mode switcher markers,
 * CA pack, QR bill helpers, and login trial copy. Optionally logs into a demo
 * outlet (Playwright) for UI presence checks.
 *
 * Usage:
 *   node scripts/frictionless-smoke.cjs
 *   node scripts/frictionless-smoke.cjs --ui
 * Env:
 *   RS_BASE (default https://restrosuite.codearc.co.in)
 *   RS_OUTLET / RS_USER / RS_PASS  (only for --ui)
 *   RS_SKIP_UI=1
 */
const fs = require('fs');
const path = require('path');
const https = require('https');
const http = require('http');

const BASE = (process.env.RS_BASE || 'https://restrosuite.codearc.co.in').replace(/\/$/, '');
const WANT_UI =
  process.argv.includes('--ui') ||
  process.env.RS_SMOKE_UI === '1' ||
  process.env.RS_SKIP_UI === '0';
const SKIP_UI = process.env.RS_SKIP_UI === '1' || !WANT_UI;

const OUT = path.join(__dirname, '..', 'docs', 'frictionless-smoke-results.json');

const results = [];
function rec(id, title, status, detail) {
  results.push({ id, title, status, detail: detail || '', at: new Date().toISOString() });
  const mark = status === 'pass' ? 'PASS' : status === 'skip' ? 'SKIP' : 'FAIL';
  console.log(`[${mark}] ${id}. ${title}${detail ? ' — ' + detail : ''}`);
}

function get(url, redirects = 0) {
  const lib = url.startsWith('https') ? https : http;
  return new Promise((resolve, reject) => {
    const req = lib
      .get(
        url,
        {
          headers: {
            'accept-encoding': 'identity',
            'user-agent': 'restrosuite-frictionless-smoke/1.0',
            'cache-control': 'no-cache',
          },
        },
        (r) => {
          if ([301, 302, 307, 308].includes(r.statusCode) && r.headers.location && redirects < 5) {
            const next = r.headers.location.startsWith('http')
              ? r.headers.location
              : new URL(r.headers.location, url).href;
            r.resume();
            return resolve(get(next, redirects + 1));
          }
          let d = '';
          r.on('data', (c) => (d += c));
          r.on('end', () => resolve({ status: r.statusCode, body: d, headers: r.headers }));
        }
      )
      .on('error', reject);
    req.setTimeout(20000, () => req.destroy(new Error('timeout ' + url)));
  });
}

async function checkAssets() {
  console.log('\n=== A · Static assets @ ' + BASE + ' ===\n');

  const login = await get(BASE + '/login.html').catch((e) => ({ status: 0, body: String(e) }));
  if (login.status === 200 || login.status === 308 || login.status === 301) {
    const body = login.body || '';
    const trial = /30-day|trial|Serve trial/i.test(body);
    rec('A1', 'Login page loads with trial messaging', trial ? 'pass' : 'fail', 'status=' + login.status);
  } else {
    // cleanUrls may serve /login
    const login2 = await get(BASE + '/login').catch((e) => ({ status: 0, body: String(e) }));
    const trial = /30-day|trial|Serve trial/i.test(login2.body || '');
    rec('A1', 'Login page loads with trial messaging', login2.status < 400 && trial ? 'pass' : 'fail', 'status=' + login2.status);
  }

  const dash = await get(BASE + '/dashboard.html');
  rec('A2', 'dashboard.html reachable', dash.status < 400 ? 'pass' : 'fail', 'status=' + dash.status);
  const hasFxScript = /frictionless-10x\.js/.test(dash.body || '');
  rec('A3', 'dashboard loads frictionless-10x.js', hasFxScript ? 'pass' : 'fail', hasFxScript ? 'script tag present' : 'MISSING — deploy not live yet');

  const fx = await get(BASE + '/assets/modules/frictionless-10x.js?v=smoke');
  const fxBody = fx.body || '';
  rec('A4', 'frictionless-10x.js 200', fx.status === 200 ? 'pass' : 'fail', 'status=' + fx.status);
  rec(
    'A5',
    'module exports RSFrictionless API',
    fx.status === 200 && /RSFrictionless|loadStartSellingPack/.test(fxBody) ? 'pass' : 'fail',
    ''
  );
  rec(
    'A6',
    'sample café menu + workspace modes',
    fx.status === 200 && /Masala Chai|setMode|Counter/.test(fxBody) ? 'pass' : 'fail',
    ''
  );
  rec(
    'A7',
    'CA pack + gateway health helpers',
    fx.status === 200 && /downloadCaPack|rs-fx-wa-health|CA pack/.test(fxBody) ? 'pass' : 'fail',
    ''
  );

  const reports = await get(BASE + '/assets/modules/reports-ui.js?v=smoke');
  rec(
    'A8',
    'reports-ui has CA pack button',
    reports.status === 200 && /rs-fx-ca-pack|CA pack/.test(reports.body || '') ? 'pass' : 'fail',
    'status=' + reports.status
  );

  const qr = await get(BASE + '/assets/modules/qr-orders-ui.js?v=smoke');
  rec(
    'A9',
    'QR bill handoff (markTableOccupied / re-apply cart)',
    qr.status === 200 && /markTableOccupiedForBill|__rsPreserveCartUntil|rs:pending_orders_synced/.test(qr.body || '')
      ? 'pass'
      : 'fail',
    'status=' + qr.status
  );

  const hub = await get(BASE + '/assets/modules/growth-hub-shell.js?v=smoke');
  rec(
    'A10',
    'Growth Hub job groups',
    hub.status === 200 && /HUB_GROUPS|Front of house|Buying/.test(hub.body || '') ? 'pass' : 'fail',
    'status=' + hub.status
  );

  const ops = await get(BASE + '/assets/competitive-ops.js?v=smoke');
  const bundle = await get(BASE + '/assets/dist/critical.bundle.js?v=smoke-a11');
  const opsBody = (ops.body || '') + '\n' + (bundle.body || '');
  // Minified builds inline 2000 as 2e3; text title is the reliable marker
  const opsOk =
    (ops.status === 200 || bundle.status === 200) &&
    /Open shift to start billing|DEFAULT_FLOAT|openShift\(2e3\)|openShift\(2000\)/.test(opsBody);
  rec(
    'A11',
    'Shift one-tap open (₹2000 default)',
    opsOk ? 'pass' : 'fail',
    opsOk ? 'found in competitive-ops or critical.bundle' : 'status ops=' + ops.status
  );

  const api = await get(BASE + '/assets/doppio-api.js?v=smoke');
  rec(
    'A12',
    'session remember-blob multi-outlet guard',
    api.status === 200 && /skip remember-blob|other outlet already saved/.test(api.body || '') ? 'pass' : 'fail',
    'status=' + api.status
  );

  // Critical bundle includes competitive-ops + qr — ensure not ancient
  rec(
    'A13',
    'critical.bundle.js present',
    bundle.status === 200 && (bundle.body || '').length > 100000 ? 'pass' : 'fail',
    'status=' + bundle.status + ' bytes=' + ((bundle.body || '').length || 0)
  );

  const health = await get(BASE + '/api/health').catch(() => ({ status: 0, body: '' }));
  rec(
    'A14',
    'api/health (if configured)',
    health.status === 200 || health.status === 404 ? 'pass' : 'fail',
    'status=' + health.status + (health.status === 404 ? ' (optional)' : '')
  );
}

async function checkUi() {
  console.log('\n=== B · UI path (Playwright) ===\n');
  let chromium;
  try {
    ({ chromium } = require('playwright'));
  } catch (e) {
    rec('B0', 'Playwright available', 'skip', 'npm i -D playwright + npx playwright install chromium');
    return;
  }

  const CREDS = {
    outlet: process.env.RS_OUTLET || 'bbb',
    user: process.env.RS_USER || 'bbb',
    pass: process.env.RS_PASS || 'Harry@1234',
  };

  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
  try {
    await page.goto(BASE + '/login', { waitUntil: 'domcontentloaded', timeout: 90000 });
    await page.waitForTimeout(800);
    if (await page.locator('#tab-login-btn').isVisible().catch(() => false)) {
      await page.click('#tab-login-btn').catch(() => {});
    }
    await page.fill('#tenant-id', CREDS.outlet);
    await page.fill('#username', CREDS.user);
    await page.fill('#password', CREDS.pass);
    await page.click('#login-submit');
    await page.waitForURL(/dashboard/, { timeout: 90000 });
    await page.waitForTimeout(2800);
    // dismiss common modals
    for (const sel of ['button:has-text("Got it")', 'button:has-text("Later")', 'button:has-text("Skip")', '#tour-skip-btn', '[data-ok]']) {
      const el = page.locator(sel).first();
      if (await el.isVisible({ timeout: 300 }).catch(() => false)) {await el.click().catch(() => {});}
    }
    rec('B1', 'Login to demo outlet', 'pass', CREDS.outlet);

    const fxApi = await page.evaluate(() => !!(window.RSFrictionless && typeof RSFrictionless.getMode === 'function'));
    rec('B2', 'RSFrictionless global after load', fxApi ? 'pass' : 'fail', fxApi ? 'ok' : 'module not on this deploy');

    const modeChip = await page.locator('#rs-fx-mode').count();
    rec('B3', 'Counter/Tables/Full mode switcher visible', modeChip > 0 ? 'pass' : 'fail', 'count=' + modeChip);

    await page.evaluate(() => {
      try {
        if (window.RS && RS.activateTab) {RS.activateTab('reports-tab');}
      } catch (_) {}
    });
    await page.waitForTimeout(1200);
    const ca = await page.locator('#rs-fx-ca-pack, button:has-text("CA pack")').count();
    rec('B4', 'Reports CA pack control', ca > 0 ? 'pass' : 'fail', 'count=' + ca);

    const wa = await page.locator('#rs-fx-wa-health, #tb-wa-status-btn').count();
    rec('B5', 'WhatsApp status control present', wa > 0 ? 'pass' : 'fail', 'count=' + wa);

    await page.evaluate(() => {
      try {
        if (window.RS && RS.activateTab) {RS.activateTab('pos-tab');}
      } catch (_) {}
    });
    await page.waitForTimeout(800);
    const pos = await page.locator('#pos-tab').isVisible().catch(() => false);
    rec('B6', 'POS tab usable', pos ? 'pass' : 'fail', '');

    const trendsLabel = await page.locator('.sidebar-link[data-tab="analytics-tab"] span, .mnav-link[data-tab="analytics-tab"]').first().textContent().catch(() => '');
    rec(
      'B7',
      'Analytics renamed Trends (or still Analytics on old deploy)',
      /trend|analytics/i.test(trendsLabel || '') ? 'pass' : 'skip',
      'label=' + String(trendsLabel || '').trim()
    );
  } catch (e) {
    rec('B1', 'Login / UI smoke', 'fail', (e && e.message) || String(e));
  } finally {
    await browser.close().catch(() => {});
  }
}

function printManualChecklist() {
  console.log(`
=== C · Manual client checklist (after deploy) ===

  [ ] Hard-refresh login (Ctrl+Shift+R)
  [ ] Register new outlet OR open empty trial → Welcome EN/HI
  [ ] Load sample menu → dishes appear on POS
  [ ] Mode chips: Counter | Tables | Full (top bar)
  [ ] Complete one Cash/UPI bill
  [ ] Start-selling checklist advances
  [ ] Reports → CA pack downloads
  [ ] WA chip: OK or off with plain English
  [ ] (If shift required) one-tap Open ₹2,000
  [ ] Growth Hub shows job groups not a flat junk list
  [ ] Second browser tab different outlet: mismatch banner OR no blob clobber

Re-run: node scripts/frictionless-smoke.cjs
UI:     node scripts/frictionless-smoke.cjs --ui
`);
}

(async () => {
  console.log('RestroSuite frictionless smoke');
  console.log('Base:', BASE);
  console.log('Time:', new Date().toISOString());

  await checkAssets();
  if (!SKIP_UI) {
    await checkUi();
  } else {
    console.log('\n=== B · UI skipped (pass --ui to enable Playwright login) ===\n');
    rec('B0', 'UI suite', 'skip', 'run with --ui');
  }

  printManualChecklist();

  const pass = results.filter((r) => r.status === 'pass').length;
  const fail = results.filter((r) => r.status === 'fail').length;
  const skip = results.filter((r) => r.status === 'skip').length;
  const summary = { base: BASE, pass, fail, skip, results, at: new Date().toISOString() };
  try {
    fs.mkdirSync(path.dirname(OUT), { recursive: true });
    fs.writeFileSync(OUT, JSON.stringify(summary, null, 2));
    console.log('\nWrote', OUT);
  } catch (e) {
    console.warn('Could not write results JSON', e.message);
  }

  console.log(`\nSummary: ${pass} PASS / ${fail} FAIL / ${skip} SKIP`);
  if (fail > 0) {
    console.log('\nProduction is missing frictionless pieces until you deploy:');
    console.log('  powershell -File scripts/deploy-frictionless.ps1');
    process.exit(1);
  }
  console.log('\nAll automated frictionless checks passed.');
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
