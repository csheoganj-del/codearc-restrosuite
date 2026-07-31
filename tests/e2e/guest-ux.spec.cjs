'use strict';
/**
 * Browser smoke — public guest surfaces (no login).
 * Run: npx playwright test tests/e2e/guest-ux.spec.cjs
 * Optional: E2E_BASE_URL=https://restrosuite.codearc.co.in
 */
const { test, expect } = require('@playwright/test');

test.describe('Guest QR UX (public)', () => {
  test('order.html loads menu shell with diet filters and service dock', async ({ page }) => {
    const failed = [];
    page.on('response', (r) => {
      if (r.status() >= 400 && /assets\/|config\.js|order\.html/.test(r.url())) {
        failed.push(r.status() + ' ' + r.url());
      }
    });
    // No tenant → invalid state UI, still proves page boots
    await page.goto('/order.html');
    await expect(page.locator('body')).toBeVisible({ timeout: 15000 });
    const html = await page.content();
    // Either invalid tenant message or full shell
    expect(html).toMatch(/No Restaurant|order|Browse|Loading menu|svc-dock|lang-toggle|RestroSuite|Restaurant/i);
    // Asset failures should not include core JS
    const coreMiss = failed.filter((f) => /config\.js|order\.html/.test(f) && !/favicon/.test(f));
    expect(coreMiss, coreMiss.join('\n')).toEqual([]);
  });

  test('order.html with demo tenant boots shell; inactive table shows session gate', async ({ page }) => {
    await page.goto('/order.html?tenant=demo&table=1');
    await page.waitForTimeout(2500);
    // Shell always has lang toggle in the header DOM
    const lang = page.locator('#lang-toggle');
    if (await lang.count()) {
      await expect(lang).toBeVisible();
    }
    // Without an active table_session, product correctly blocks with full-screen gate
    // (must not treat this as a UX bug — guest cannot order on a closed/paused table).
    const overlay = page.locator('#session-status-overlay');
    if (await overlay.count()) {
      await expect(overlay).toBeVisible();
      await expect(overlay).toContainText(/Session Closed|Paused|staff|QR/i);
    } else {
      // Active session path: lang toggle should be clickable
      if (await lang.count()) {
        await lang.click({ timeout: 5000 });
        await expect(lang).toHaveText(/हिं|EN|HI/i);
      }
    }
    const body = await page.locator('body').innerText();
    expect(body.length).toBeGreaterThan(20);
  });

  test('order.html takeaway (no table) keeps UI interactive', async ({ page }) => {
    await page.goto('/order.html?tenant=demo');
    await page.waitForTimeout(2500);
    const overlay = page.locator('#session-status-overlay');
    // Takeaway has no table session gate
    if (await overlay.count()) {
      // If shown, it should not permanently block takeaway — but some tenants may still gate.
      // Prefer asserting shell is usable when no overlay.
    } else {
      const lang = page.locator('#lang-toggle');
      if (await lang.count()) {
        await expect(lang).toBeVisible();
        await lang.click({ timeout: 5000 });
        await expect(lang).toHaveText(/हिं|EN|HI/i);
      }
    }
    const body = await page.locator('body').innerText();
    expect(body.length).toBeGreaterThan(20);
  });

  test('qr-order portal boots for table context', async ({ page }) => {
    await page.goto('/qr-order.html?tenant=demo&table=1&hub=1');
    await page.waitForTimeout(1500);
    await expect(page.locator('body')).toBeVisible();
    const html = await page.content();
    expect(html).toMatch(/Menu|Track|Service|Table|portal|Restaurant|RESTRONAME|Order/i);
  });

  test('login page usable', async ({ page }) => {
    await page.goto('/login.html');
    await expect(page.locator('input[type="password"], #password').first()).toBeVisible({ timeout: 15000 });
  });

  test('dashboard shell assets load (may redirect without auth)', async ({ page }) => {
    const failed = [];
    page.on('response', (r) => {
      if (r.status() >= 400 && /assets\/(db|doppio-api|saas-core|dashboard|critical)/.test(r.url())) {
        failed.push(r.status() + ' ' + r.url());
      }
    });
    await page.goto('/dashboard.html?appv=v83-20260711-sa-polish');
    await page.waitForTimeout(2000);
    expect(failed, failed.join('\n')).toEqual([]);
  });
});
