'use strict';
/**
 * Authenticated Playwright E2E (optional).
 *
 * Required:
 *   E2E_OUTLET_SLUG=bbb
 *   E2E_USERNAME=...
 *   E2E_PASSWORD=...
 *
 * Optional:
 *   E2E_BASE_URL=https://restrosuite.codearc.co.in
 *   (defaults to production when credentials are set)
 */
const { test, expect } = require('@playwright/test');
const { dismissOnboarding } = require('./helpers/onboarding.cjs');

const slug = process.env.E2E_OUTLET_SLUG || process.env.E2E_TENANT || '';
const user = process.env.E2E_USERNAME || process.env.E2E_USER || '';
const pass = process.env.E2E_PASSWORD || process.env.E2E_PASS || '';
const hasCreds = !!(slug && user && pass);

async function performLogin(page) {
  await page.goto('/login.html', { waitUntil: 'domcontentloaded', timeout: 60000 });
  await expect(page.locator('#login-form')).toBeVisible({ timeout: 30000 });
  await page.locator('#tenant-id').fill(slug);
  await page.locator('#username').fill(user);
  await page.locator('#password').fill(pass);

  await page.locator('#login-submit').click();

  try {
    // Production redirects to /dashboard#pos-tab (hash is fine with waitForURL)
    await page.waitForURL((url) => /dashboard/i.test(url.pathname + url.hash + url.href), {
      timeout: 60000,
    });
    await dismissOnboarding(page);
    return { ok: true, url: page.url() };
  } catch (_) {
    const errBox = page.locator('#error-box.show, #error-box.alert.err.show, #error-box');
    let errText = '';
    try {
      const cls = await page.locator('#error-box').getAttribute('class');
      if (cls && cls.includes('show')) {
        errText = (await page.locator('#error-box').innerText()).trim();
      }
    } catch (_) {}
    return { ok: false, url: page.url(), errText };
  }
}

test.describe('Authenticated outlet login', () => {
  test.skip(!hasCreds, 'Set E2E_OUTLET_SLUG, E2E_USERNAME, E2E_PASSWORD to run');

  test('staff can sign in and reach POS shell', async ({ page }) => {
    test.setTimeout(120_000);
    const result = await performLogin(page);
    test.info().annotations.push({
      type: 'login-result',
      description: JSON.stringify(result),
    });

    if (!result.ok) {
      const err = result.errText || '';
      if (/failed to fetch|not configured|network|429|rate|cors/i.test(err)) {
        test.skip(true, 'Cloud auth unavailable: ' + err.slice(0, 160));
      }
      expect(
        result.url,
        'expected dashboard after login, got: ' + result.url + ' err=' + err
      ).toMatch(/dashboard/i);
    }

    // POS shell: sidebar link or checkout button (dashboard loads feature scripts async)
    await expect(
      page.locator('#btn-checkout, [data-tab="pos-tab"], #pos-tab').first()
    ).toBeVisible({ timeout: 60000 });
  });

  test('after login, core assets do not 404', async ({ page }) => {
    test.setTimeout(120_000);
    const failed = [];
    page.on('response', (r) => {
      if (r.status() >= 400 && /assets\//.test(r.url())) failed.push(r.status() + ' ' + r.url());
    });

    const result = await performLogin(page);
    if (!result.ok) {
      test.skip(true, 'login did not reach dashboard: ' + (result.errText || result.url));
    }
    await page.waitForTimeout(4000);
    const criticalMiss = failed.filter((f) =>
      /print-bridge|escpos|bill-identity|inventory-ledger|bills-history|pos-ui|tax-helpers|db\.js|features-pos|dashboard\.js|receipt\.js/.test(
        f
      )
    );
    expect(criticalMiss, criticalMiss.join('\n')).toEqual([]);
  });
});
