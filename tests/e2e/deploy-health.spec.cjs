'use strict';
/**
 * Wave 13 — post-deploy module health (works on any baseURL).
 * On production this catches missing wave modules after Vercel deploys.
 */
const { test, expect } = require('@playwright/test');

const MODULES = [
  'assets/modules/tax-helpers.js',
  'assets/modules/pos-ui.js',
  'assets/modules/growth-hub-shell.js',
  'assets/modules/bills-history.js',
  'assets/modules/inventory-ui.js',
  'assets/modules/reports-ui.js',
  'assets/modules/super-admin.js',
  'assets/modules/kds-ui.js',
  'assets/modules/qr-orders-ui.js',
  'assets/modules/employees-ui.js',
  'assets/modules/bill-identity.js',
  'assets/modules/inventory-ledger.js',
  'assets/modules/gateway-monitor.js',
];

test.describe('Deploy health', () => {
  test('wave modules return 200 and expose globals', async ({ request, baseURL }) => {
    test.setTimeout(120_000);
    const failures = [];
    for (const path of MODULES) {
      const res = await request.get('/' + path.replace(/^\//, ''));
      if (res.status() !== 200) {
        failures.push(path + ' -> ' + res.status());
        continue;
      }
      const body = await res.text();
      if (body.length < 200) failures.push(path + ' empty/short body');
    }
    expect(failures, failures.join('\n')).toEqual([]);
  });

  test('dashboard HTML references wave 11–12 modules', async ({ page }) => {
    await page.goto('/dashboard.html', { waitUntil: 'domcontentloaded', timeout: 60000 });
    const html = await page.content();
    expect(html).toMatch(/pos-ui\.js/);
    expect(html).toMatch(/tax-helpers\.js|bills-history\.js/);
    // Version stamp present (v5x or v6x wave series)
    expect(html).toMatch(/v(?:[5-9][0-9]|[1-9][0-9]{2,})-20260711|__RESTROSUITE_ASSET_VERSION__/);
  });
});
