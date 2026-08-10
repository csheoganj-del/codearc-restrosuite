'use strict';
/**
 * Checkout Playwright E2E (Wave 6) — login → POS → pay → bills history.
 *
 * Required:
 *   E2E_OUTLET_SLUG=bbb
 *   E2E_USERNAME=...
 *   E2E_PASSWORD=...
 *
 * Optional:
 *   E2E_BASE_URL=https://restrosuite.codearc.co.in
 */
const { test, expect } = require('@playwright/test');
const fs = require('node:fs');
const path = require('node:path');
const { dismissOnboarding } = require('./helpers/onboarding.cjs');

const slug = process.env.E2E_OUTLET_SLUG || process.env.E2E_TENANT || '';
const user = process.env.E2E_USERNAME || process.env.E2E_USER || '';
const pass = process.env.E2E_PASSWORD || process.env.E2E_PASS || '';
const hasCreds = !!(slug && user && pass);
const useLocalAssetOverrides = process.env.E2E_LOCAL_ASSET_OVERRIDES === '1';

async function installLocalAssetOverrides(page) {
  if (!useLocalAssetOverrides) {return;}
  const root = path.resolve(__dirname, '..', '..');
  const overrides = new Map([
    ['/assets/dist/critical.bundle.js', path.join(root, 'assets', 'dist', 'critical.bundle.js')],
    ['/assets/features-pos.js', path.join(root, 'assets', 'features-pos.js')],
    ['/assets/modules/pos-ui.js', path.join(root, 'assets', 'modules', 'pos-ui.js')],
    // Local-first checkout + cloud timeout + putLocal
    ['/assets/db.js', path.join(root, 'assets', 'db.js')],
    ['/assets/modules/bill-identity.js', path.join(root, 'assets', 'modules', 'bill-identity.js')],
  ]);
  await page.route('**/*', async (route) => {
    const pathname = new URL(route.request().url()).pathname;
    const file = overrides.get(pathname);
    if (!file) {
      await route.continue();
      return;
    }
    await route.fulfill({
      status: 200,
      contentType: 'application/javascript; charset=utf-8',
      body: fs.readFileSync(file),
    });
  });
}

async function performLogin(page) {
  // Production serves /login (not only login.html); staff tab may be required
  await page.goto('/login', { waitUntil: 'domcontentloaded', timeout: 60000 });
  await page.locator('#tab-login-btn').click().catch(() => {});
  await expect(page.locator('#login-form, #username').first()).toBeVisible({ timeout: 30000 });
  const tenant = page.locator('#tenant-id');
  if (await tenant.count()) {
    await tenant.fill(slug);
  }
  await page.locator('#username').fill(user);
  await page.locator('#password').fill(pass);
  await page.locator('#login-submit').click();

  try {
    await page.waitForURL((url) => /dashboard/i.test(url.pathname + url.hash + url.href), {
      timeout: 60000,
    });
    await dismissOnboarding(page);
    return { ok: true, url: page.url() };
  } catch (_) {
    let errText = '';
    try {
      const err = page.locator('#error-box, .login-error, [role="alert"]').first();
      if (await err.count()) {
        errText = (await err.innerText().catch(() => '')).trim();
      }
    } catch (_) {}
    return { ok: false, url: page.url(), errText };
  }
}

test.describe('POS checkout → bills', () => {
  test.skip(!hasCreds, 'Set E2E_OUTLET_SLUG, E2E_USERNAME, E2E_PASSWORD to run');

  test('staff can sell an item and see it in bills history', async ({ page }) => {
    test.setTimeout(180_000);
    await installLocalAssetOverrides(page);

    // Accept KOT / confirm dialogs if dine-in path triggers them
    page.on('dialog', async (d) => {
      try {
        await d.accept();
      } catch (_) {}
    });

    const login = await performLogin(page);
    if (!login.ok) {
      const err = login.errText || '';
      if (/failed to fetch|not configured|network|429|rate|cors/i.test(err)) {
        test.skip(true, 'Cloud auth unavailable: ' + err.slice(0, 160));
      }
      expect(login.url, 'expected dashboard after login').toMatch(/dashboard/i);
    }

    // POS shell ready
    await expect(page.locator('#btn-checkout, #pos-tab').first()).toBeVisible({ timeout: 60000 });

    // Activate POS tab if needed
    const posTabLink = page.locator('[data-tab="pos-tab"]').first();
    if (await posTabLink.count()) {
      await posTabLink.click().catch(() => {});
    }

    // Wait for menu tiles (hydrated from cloud / local)
    const menuItem = page.locator('#pos-grid .pos-item:not(.out)').first();
    try {
      await expect(menuItem).toBeVisible({ timeout: 90000 });
    } catch (_) {
      test.skip(true, 'No in-stock menu items available for checkout E2E');
    }

    // Snapshot stable bill identities before sale so the test can prove that
    // exactly one new bill was created by one checkout click.
    const billIdsBefore = await page.evaluate(() =>
      window.RS && Array.isArray(RS.BILLS)
        ? RS.BILLS
            .map((b) => String(b && (b.no || b.orderId || b.id) || ''))
            .filter(Boolean)
        : []
    );

    await menuItem.click();

    // Prefer UPI so cash-received gate does not block checkout
    const upiBtn = page.locator('[data-pay-method="UPI"]').first();
    if (await upiBtn.count()) {
      await upiBtn.click();
    } else {
      // Fill exact cash if cash path
      const exact = page.locator('#cash-denominations-grid .btn-den[data-val="exact"]').first();
      if (await exact.count()) await exact.click().catch(() => {});
    }

    const checkout = page.locator('#btn-checkout');
    await expect(checkout).toBeEnabled({ timeout: 15000 });
    await checkout.click();

    // Wait for a visible settlement and exactly one new in-memory bill.
    await page.waitForFunction(
      (beforeIds) => {
        const before = new Set(beforeIds);
        const list = window.RS && Array.isArray(RS.BILLS) ? RS.BILLS : [];
        const created = list.filter((b) => {
          const id = String(b && (b.no || b.orderId || b.id) || '');
          return id && !before.has(id);
        });
        return created.length === 1 && !!document.querySelector('.rc-settle-overlay.show');
      },
      billIdsBefore,
      { timeout: 60000 }
    );

    const createdBillNos = await page.evaluate((beforeIds) => {
      const before = new Set(beforeIds);
      const list = window.RS && Array.isArray(RS.BILLS) ? RS.BILLS : [];
      return list
        .map((b) => String(b && (b.no || b.orderId || b.id) || ''))
        .filter((id) => id && !before.has(id));
    }, billIdsBefore);
    expect(createdBillNos, 'one click must create exactly one bill').toHaveLength(1);
    const billNo = createdBillNos[0];
    expect(billNo, 'expected a bill number after checkout').toBeTruthy();

    // Close the visible settlement receipt before navigating away.
    const settleOverlay = page.locator('.rc-settle-overlay.show');
    const newOrder = settleOverlay.getByRole('button', { name: 'New order' });
    await expect(newOrder).toBeVisible({ timeout: 60000 });
    await newOrder.click();
    await settleOverlay.waitFor({ state: 'hidden', timeout: 10000 });

    // Navigate to bills history
    const billsNav = page.locator('[data-tab="bills-tab"]').first();
    await expect(billsNav).toBeVisible({ timeout: 15000 });
    await billsNav.click();

    await expect(page.locator('#bills-table-body')).toBeVisible({ timeout: 20000 });

    // Search by bill no when possible
    const search = page.locator('#bills-search');
    if (await search.count() && billNo) {
      await search.fill(billNo);
      await page.waitForTimeout(200);
    }

    // Row for this bill (data-bill-no from Wave 6 module, or text match)
    const rowByAttr = page.locator(`#bills-table-body tr[data-bill-no="${billNo}"]`);
    const rowByText = page.locator('#bills-table-body tr', { hasText: billNo });
    const found =
      (await rowByAttr.count()) > 0 || (await rowByText.count()) > 0;

    // Fallback: memory still has the bill even if table re-render lagged
    if (!found) {
      const inMemory = await page.evaluate((no) => {
        const list = (window.RS && RS.BILLS) || [];
        return list.some((b) => String(b.no || b.orderId || b.id) === String(no));
      }, billNo);
      expect(inMemory, 'bill should exist in RS.BILLS after checkout').toBeTruthy();
      // Force render if module present
      await page.evaluate(() => {
        if (window.RSBillsHistory && RSBillsHistory.renderBills) RSBillsHistory.renderBills();
        else if (window.RS && RS.render) RS.render('bills-tab');
      });
      await page.waitForTimeout(400);
    }

    await expect(
      page.locator('#bills-table-body tr').filter({ hasText: billNo }).first()
    ).toBeVisible({ timeout: 15000 });
  });
});
