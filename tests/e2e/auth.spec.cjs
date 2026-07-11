'use strict';
/**
 * Authenticated Playwright E2E (optional).
 *
 * Set secrets (never commit):
 *   E2E_OUTLET_SLUG=bbb
 *   E2E_USERNAME=...
 *   E2E_PASSWORD=...
 *   E2E_BASE_URL=https://your-deploy.vercel.app   # or local static+live API
 *
 * Against local static server, login still hits live Supabase from config.js
 * if the project is configured — otherwise tests skip.
 */
const { test, expect } = require('@playwright/test');

const slug = process.env.E2E_OUTLET_SLUG || process.env.E2E_TENANT || '';
const user = process.env.E2E_USERNAME || process.env.E2E_USER || '';
const pass = process.env.E2E_PASSWORD || process.env.E2E_PASS || '';
const hasCreds = !!(slug && user && pass);

test.describe('Authenticated outlet login', () => {
  test.skip(!hasCreds, 'Set E2E_OUTLET_SLUG, E2E_USERNAME, E2E_PASSWORD to run');

  test('staff can sign in and reach POS shell', async ({ page }) => {
    test.setTimeout(90_000);
    await page.goto('/login.html');

    const tenant = page.locator('#tenant-id');
    const username = page.locator('#username');
    const password = page.locator('#password');
    await expect(username).toBeVisible({ timeout: 20000 });
    if (await tenant.count()) await tenant.fill(slug);
    await username.fill(user);
    await password.fill(pass);

    await Promise.all([
      page.waitForURL(/dashboard/i, { timeout: 45000 }).catch(() => null),
      page.locator('#login-submit, button[type="submit"]').first().click(),
    ]);

    // Either navigated to dashboard or showed an error (cloud down)
    const url = page.url();
    if (!/dashboard/i.test(url)) {
      const err = page.locator('.err-box.show, .error, [class*="error"]').first();
      const errText = (await err.count()) ? await err.innerText().catch(() => '') : '';
      test.info().annotations.push({ type: 'login-result', description: errText || url });
      // Soft skip if network/config blocks cloud auth in CI without secrets backend
      if (/failed to fetch|not configured|network|429|rate/i.test(errText)) {
        test.skip(true, 'Cloud auth unavailable: ' + errText.slice(0, 120));
      }
      expect(url, 'expected dashboard after login, got: ' + url + ' err=' + errText).toMatch(/dashboard/i);
    }

    await page.waitForTimeout(2000);
    // POS chrome
    const pos = page.locator('#pos-tab, [data-tab="pos-tab"], #btn-checkout').first();
    await expect(pos).toBeVisible({ timeout: 30000 });
  });

  test('after login, core assets do not 404', async ({ page }) => {
    test.setTimeout(90_000);
    const failed = [];
    page.on('response', (r) => {
      if (r.status() >= 400 && /assets\//.test(r.url())) failed.push(r.status() + ' ' + r.url());
    });

    await page.goto('/login.html');
    const tenant = page.locator('#tenant-id');
    if (await tenant.count()) await tenant.fill(slug);
    await page.locator('#username').fill(user);
    await page.locator('#password').fill(pass);
    await page.locator('#login-submit, button[type="submit"]').first().click();
    await page.waitForURL(/dashboard/i, { timeout: 45000 }).catch(() => null);
    if (!/dashboard/i.test(page.url())) {
      test.skip(true, 'login did not reach dashboard');
    }
    await page.waitForTimeout(2500);
    const criticalMiss = failed.filter((f) =>
      /print-bridge|escpos|bill-identity|inventory-ledger|db\.js|features-pos|dashboard\.js/.test(f)
    );
    expect(criticalMiss, criticalMiss.join('\n')).toEqual([]);
  });
});
