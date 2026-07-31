'use strict';
/**
 * Wave 7 — Bills refund/delete/PIN gate E2E (safe cancel paths + optional refund).
 *
 * Required:
 *   E2E_OUTLET_SLUG / E2E_USERNAME / E2E_PASSWORD
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
    await page.waitForURL((url) => /dashboard/i.test(url.pathname + url.hash + url.href), {
      timeout: 60000,
    });
    await dismissOnboarding(page);
    return { ok: true };
  } catch (_) {
    return { ok: false };
  }
}

async function ensureBill(page) {
  page.on('dialog', async (d) => {
    try {
      await d.accept();
    } catch (_) {}
  });

  const posLink = page.locator('[data-tab="pos-tab"]').first();
  if (await posLink.count()) await posLink.click().catch(() => {});

  const menuItem = page.locator('#pos-grid .pos-item:not(.out)').first();
  await expect(menuItem).toBeVisible({ timeout: 90000 });
  await menuItem.click();

  const upi = page.locator('[data-pay-method="UPI"]').first();
  if (await upi.count()) await upi.click();

  const checkout = page.locator('#btn-checkout');
  await expect(checkout).toBeEnabled({ timeout: 15000 });
  const before = await page.evaluate(() => (window.RS && RS.BILLS ? RS.BILLS.length : 0));
  await checkout.click();
  await page.waitForFunction(
    (n) => (window.RS && RS.BILLS ? RS.BILLS.length : 0) > n,
    before,
    { timeout: 60000 }
  );
  const billNo = await page.evaluate(() => {
    const b = window.RS && RS.BILLS && RS.BILLS[0];
    return b ? String(b.no || b.orderId || '') : '';
  });
  const settleOverlay = page.locator('.rc-settle-overlay.show');
  const newOrder = settleOverlay.getByRole('button', { name: 'New order' });
  await expect(newOrder).toBeVisible({ timeout: 60000 });
  await newOrder.click();
  await settleOverlay.waitFor({ state: 'hidden', timeout: 10000 });
  return billNo;
}

test.describe('Bills actions (refund / delete / PIN)', () => {
  test.skip(!hasCreds, 'Set E2E_OUTLET_SLUG, E2E_USERNAME, E2E_PASSWORD to run');

  test('refund and delete open gated modals and cancel cleanly', async ({ page }) => {
    test.setTimeout(180_000);

    const login = await performLogin(page);
    if (!login.ok) test.skip(true, 'login failed');

    await expect(page.locator('#btn-checkout, #pos-tab').first()).toBeVisible({ timeout: 60000 });
    const billNo = await ensureBill(page);
    expect(billNo).toBeTruthy();

    await page.locator('[data-tab="bills-tab"]').first().click();
    await expect(page.locator('#bills-table-body')).toBeVisible({ timeout: 20000 });

    // Force module render if present (local build) or production dashboard
    await page.evaluate(() => {
      if (window.RSBillsHistory && RSBillsHistory.renderBills) RSBillsHistory.renderBills();
      else if (window.RS && RS.render) RS.render('bills-tab');
    });

    const row = page.locator('#bills-table-body tr').filter({ hasText: billNo }).first();
    await expect(row).toBeVisible({ timeout: 20000 });

    // --- Refund path: open the row action menu, then open gate and cancel ---
    const moreActions = row.getByRole('button', { name: 'More actions' });
    await moreActions.click();
    const refundAction = row.getByRole('menuitem', { name: /Void \/ refund/i });
    await expect(refundAction).toBeVisible();
    await refundAction.click();

    // Either PIN overlay or refund reason modal
    const pinOverlay = page.locator('#rs-pin-overlay');
    const refundOverlay = page.locator('#rs-refund-overlay');
    await expect(pinOverlay.or(refundOverlay)).toBeVisible({ timeout: 10000 });

    if (await pinOverlay.isVisible().catch(() => false)) {
      await expect(page.locator('#rs-pin-box').first()).toBeVisible();
      await page.locator('#rs-pin-cancel').click();
      await expect(pinOverlay).toBeHidden({ timeout: 5000 });
    } else {
      await expect(page.locator('#rfund-confirm')).toBeVisible();
      await page.locator('#rfund-cancel').click();
      await expect(refundOverlay).toBeHidden({ timeout: 5000 });
    }

    // Bill still paid after cancel
    const stillPaid = await page.evaluate((no) => {
      const b = ((window.RS && RS.BILLS) || []).find(
        (x) => String(x.no || x.orderId) === String(no)
      );
      return b ? String(b.status || 'paid') : '';
    }, billNo);
    expect(stillPaid).not.toBe('refunded');

    // --- Delete path: reopen the row action menu, then open confirm and cancel ---
    await moreActions.click();
    const deleteAction = row.getByRole('menuitem', { name: /Delete bill/i });
    await expect(deleteAction).toBeVisible();
    await deleteAction.click();

    const pin2 = page.locator('#rs-pin-overlay');
    const delOverlay = page.locator('#rs-del-overlay');
    await expect(pin2.or(delOverlay)).toBeVisible({ timeout: 10000 });

    if (await pin2.isVisible().catch(() => false)) {
      await page.locator('#rs-pin-cancel').click();
      await expect(pin2).toBeHidden({ timeout: 5000 });
    } else {
      await expect(page.locator('#rs-del-confirm')).toBeVisible();
      await page.locator('#rs-del-cancel').click();
      await expect(delOverlay).toBeHidden({ timeout: 5000 });
    }

    const stillThere = await page.evaluate((no) => {
      return ((window.RS && RS.BILLS) || []).some(
        (x) => String(x.no || x.orderId) === String(no)
      );
    }, billNo);
    expect(stillThere).toBeTruthy();
  });

  test('PIN modal keypad is present when gate is shown', async ({ page }) => {
    test.setTimeout(180_000);
    const login = await performLogin(page);
    if (!login.ok) test.skip(true, 'login failed');

    // Trigger PIN setup/request path via evaluate if configured
    const pinConfigured = await page.evaluate(async () => {
      if (!window.RSPinModal) return { has: false };
      return {
        has: true,
        configured: typeof RSPinModal.isConfigured === 'function' ? RSPinModal.isConfigured() : false,
      };
    });

    if (!pinConfigured.has) {
      test.skip(true, 'RSPinModal not loaded');
    }

    // Open request without waiting for full verify — just assert UI shell
    await page.evaluate(() => {
      if (window.RSPinModal && RSPinModal.request) {
        // fire and forget; test will cancel
        RSPinModal.request('E2E PIN shell check');
      }
    });

    await expect(page.locator('#rs-pin-overlay')).toBeVisible({ timeout: 8000 });
    await expect(page.locator('.rs-pin-key').first()).toBeVisible();
    await expect(page.locator('#rs-pin-cancel')).toBeVisible();
    await page.locator('#rs-pin-cancel').click();
    await expect(page.locator('#rs-pin-overlay')).toBeHidden({ timeout: 5000 });
  });
});
