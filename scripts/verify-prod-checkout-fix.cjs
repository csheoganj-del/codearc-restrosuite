'use strict';
const https = require('https');

function get(url) {
  return new Promise((resolve, reject) => {
    https
      .get(url, { headers: { 'cache-control': 'no-cache' } }, (res) => {
        let d = '';
        res.on('data', (c) => (d += c));
        res.on('end', () => resolve({ status: res.statusCode, body: d }));
      })
      .on('error', reject);
  });
}

(async () => {
  const t = Date.now();
  const base = 'https://restrosuite.codearc.co.in';
  const pos = await get(base + '/assets/features-pos.js?v=' + t);
  const db = await get(base + '/assets/db.js?v=' + t);
  const ui = await get(base + '/assets/modules/pos-ui.js?v=' + t);
  const upd = await get(base + '/app-update.json?v=' + t);

  const checks = [
    ['features-pos HTTP 200', pos.status === 200],
    ['db.js HTTP 200', db.status === 200],
    ['pos-ui HTTP 200', ui.status === 200],
    ['pos: Bill kept on this device', pos.body.includes('Bill kept on this device')],
    ['pos: local bill seal failed', pos.body.includes('local bill seal failed')],
    ['pos: putLocal call', pos.body.includes('putLocal')],
    ['db: putLocal API', db.body.includes('putLocal')],
    ['db: bills timeout 2000', /bills[^]{0,80}2000|2000[^]{0,80}bills/.test(db.body)],
    ['ui: rs_active_cart wipe path', ui.body.includes('rs_active_cart')],
    ['ui: empty cart snapshot', ui.body.includes('rs_active_cart') && ui.body.includes("'[]'")],
  ];

  let fail = 0;
  for (const [name, ok] of checks) {
    console.log((ok ? 'PASS' : 'FAIL') + '  ' + name);
    if (!ok) {fail++;}
  }
  console.log('app-update:', (upd.body || '').slice(0, 160).replace(/\s+/g, ' '));
  process.exit(fail ? 1 : 0);
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
