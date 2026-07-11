'use strict';
const { test, expect } = require('@playwright/test');

test.describe('RestroSuite smoke', () => {
  test('login page renders core fields', async ({ page }) => {
    await page.goto('/login.html');
    await expect(page.locator('#login-form, form#loginForm, form').first()).toBeVisible({ timeout: 15000 });
    // Common field ids from login.html
    const tenant = page.locator('#tenant-id, input[name="tenant"], input[placeholder*="outlet" i]').first();
    const user = page.locator('#username, input[name="username"]').first();
    const pass = page.locator('#password, input[type="password"]').first();
    await expect(user).toBeVisible();
    await expect(pass).toBeVisible();
    // Page should not show raw JS errors banner in normal mode (debug only on localhost)
    const title = await page.title();
    expect(title.toLowerCase()).toMatch(/restro|login|codearc/i);
    // Tenant field may be optional depending on layout
    if (await tenant.count()) await expect(tenant).toBeVisible();
  });

  test('dashboard boot scripts are referenced', async ({ page }) => {
    // Without auth, dashboard may redirect — still assert asset wiring via page content or request
    const res = await page.goto('/dashboard.html');
    expect(res && res.status()).toBeLessThan(400);
    const html = await page.content();
    expect(html).toMatch(/doppio-api\.js|db\.js|print-bridge|dashboard\.js/);
    // Boot loader or app shell present
    expect(html).toMatch(/id="app"|rs-boot-loader|RestroSuite/i);
  });

  test('critical bundle or modules load without 404', async ({ page }) => {
    const failed = [];
    page.on('response', (r) => {
      if (r.status() >= 400 && /assets\//.test(r.url())) failed.push(r.status() + ' ' + r.url());
    });
    await page.goto('/dashboard.html');
    await page.waitForTimeout(1500);
    // Allow license/config noise; fail on missing core modules
    const criticalMiss = failed.filter((f) =>
      /print-bridge|escpos|bill-identity|inventory-ledger|pos-ui|tax-helpers|db\.js|doppio-api|saas-core|dashboard\.js/.test(
        f
      )
    );
    expect(criticalMiss, criticalMiss.join('\n')).toEqual([]);
  });

  test('public home/index serves', async ({ page }) => {
    const res = await page.goto('/index.html');
    expect(res && res.ok()).toBeTruthy();
    await expect(page.locator('body')).toBeVisible();
  });
});
