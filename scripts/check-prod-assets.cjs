'use strict';
/**
 * Post-deploy asset health check (Wave 13).
 *
 * Usage:
 *   node scripts/check-prod-assets.cjs
 *   E2E_BASE_URL=https://restrosuite.codearc.co.in node scripts/check-prod-assets.cjs
 */
const https = require('https');
const http = require('http');

const base = (process.env.E2E_BASE_URL || process.env.BASE_URL || 'https://restrosuite.codearc.co.in').replace(
  /\/$/,
  ''
);

function get(url, redirects = 0) {
  const lib = url.startsWith('https') ? https : http;
  return new Promise((resolve, reject) => {
    const request = lib
      .get(url, {
        headers: {
          'accept-encoding': 'identity',
          'user-agent': 'restrosuite-production-asset-check/1.0',
        },
      }, (r) => {
        if ([301, 302, 307, 308].includes(r.statusCode) && r.headers.location && redirects < 5) {
          const next = r.headers.location.startsWith('http')
            ? r.headers.location
            : new URL(r.headers.location, url).href;
          r.resume();
          return resolve(get(next, redirects + 1));
        }
        let d = '';
        r.on('data', (c) => (d += c));
        r.on('end', () => resolve({ status: r.statusCode, body: d, url }));
      })
      .on('error', reject);
    request.setTimeout(10000, () => {
      request.destroy(new Error(`Request timed out: ${url}`));
    });
  });
}

const MODULES = [
  { file: 'tax-helpers.js', marker: /RSTax|RS_resolveRate/ },
  { file: 'pos-ui.js', marker: /RSPosUI/ },
  { file: 'growth-hub-shell.js', marker: /RSGrowthHubShell/ },
  { file: 'bills-history.js', marker: /RSBillsHistory/ },
  { file: 'inventory-ui.js', marker: /RSInventoryUI/ },
  { file: 'reports-ui.js', marker: /RSReportsUI/ },
  { file: 'gateway-monitor.js', marker: /RSGatewayMonitor/ },
  { file: 'super-admin.js', marker: /RSSuperAdmin/ },
  { file: 'kds-ui.js', marker: /RSKdsUI/ },
  { file: 'qr-orders-ui.js', marker: /RSQrOrdersUI/ },
  { file: 'employees-ui.js', marker: /RSEmployeesUI/ },
  { file: 'bill-identity.js', marker: /RSBillIdentity/ },
  { file: 'inventory-ledger.js', marker: /RSInventoryLedger/ },
  { file: 'frictionless-10x.js', marker: /RSFrictionless|loadStartSellingPack/ },
];

(async () => {
  const fails = [];
  console.log('Checking', base);

  const dash = await get(base + '/dashboard.html');
  if (dash.status >= 400) {fails.push('dashboard status ' + dash.status);}
  const verMatch =
    dash.body.match(/\|\|\s*['"](v[56][0-9]-20260711[^'"]*)['"]/) ||
    dash.body.match(/(v[56][0-9]-20260711[a-z0-9-]*)/);
  const ver = (verMatch && verMatch[1]) || '';
  console.log('asset version:', ver || '(unknown)');
  if (!/tax-helpers\.js/.test(dash.body)) {fails.push('dashboard missing tax-helpers.js script');}
  if (!/pos-ui\.js/.test(dash.body)) {fails.push('dashboard missing pos-ui.js script');}
  // Frictionless pack is a static script tag (not only critical.bundle)
  if (!/frictionless-10x\.js/.test(dash.body || '')) {
    fails.push('dashboard missing frictionless-10x.js script');
  }

  for (const m of MODULES) {
    const r = await get(base + '/assets/modules/' + m.file);
    const ok = r.status === 200 && m.marker.test(r.body || '');
    console.log(ok ? '  ok ' : ' FAIL', m.file, r.status);
    if (!ok) {fails.push(m.file + ' status=' + r.status);}
  }

  const sw = await get(base + '/service-worker.js');
  const cache = (sw.body.match(/CACHE_NAME\s*=\s*["']([^"']+)/) || [])[1];
  console.log('SW cache:', cache || '(none)');
  if (!/pos-ui\.js/.test(sw.body || '')) {fails.push('SW missing pos-ui.js');}
  if (!/tax-helpers\.js/.test(sw.body || '')) {fails.push('SW missing tax-helpers.js');}

  if (fails.length) {
    console.error('\nFAILED:\n' + fails.map((f) => ' - ' + f).join('\n'));
    process.exit(1);
  }
  console.log('\nAll production assets healthy.');
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
