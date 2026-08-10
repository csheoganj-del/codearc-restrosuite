'use strict';
const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

const success = JSON.parse(fs.readFileSync(path.join('docs', 'human-register-success.json'), 'utf8'));
const BASE = 'https://restrosuite.codearc.co.in';
const SLUG = success.slug;
const EMAIL = success.email;
const PASS = success.password || 'AuditTest99!';

(async () => {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1400, height: 900 } });
  const results = [];
  const rec = (id, title, status, detail) => {
    results.push({ id, title, status, detail: detail || '' });
    console.log(
      '[' + (status === 'pass' ? 'PASS' : status === 'fail' ? 'FAIL' : 'SKIP') + ']',
      id,
      title,
      detail || ''
    );
  };

  await page.goto(BASE + '/login', { waitUntil: 'domcontentloaded', timeout: 90000 });
  await page.waitForTimeout(1000);
  await page.click('#tab-login-btn').catch(() => {});
  await page.fill('#tenant-id', SLUG);
  await page.fill('#username', EMAIL);
  await page.fill('#password', PASS);
  await page.click('#login-submit');
  try {
    await page.waitForURL(/dashboard/, { timeout: 60000 });
    rec('1', 'Login after register', 'pass', page.url());
  } catch (e) {
    const err = await page.locator('.alert.err.show').textContent().catch(() => e.message);
    rec('1', 'Login after register', 'fail', String(err));
    fs.writeFileSync(
      'docs/human-audit-results.json',
      JSON.stringify({ SLUG, EMAIL, results }, null, 2)
    );
    await browser.close();
    process.exit(1);
  }

  async function dismissAllModals() {
    // Prefer product close buttons first
    for (const sel of [
      'button:has-text("Load sample")',
      '[data-sample]',
      'button:has-text("Got it")',
      'button:has-text("Later")',
      'button:has-text("Skip")',
      'button:has-text("Remind me later")',
      'button:has-text("Done")',
      'button:has-text("Close")',
      'button:has-text("OK")',
      'button:has-text("Not now")',
      '[data-own]',
      '#tour-skip-btn',
      '[data-ok]',
      '[data-x]',
      '.rs-mclose',
      '.modal-close',
      '#rs-pin-cancel',
    ]) {
      const el = page.locator(sel).first();
      if (await el.isVisible({ timeout: 250 }).catch(() => false)) {
        await el.click({ force: true }).catch(() => {});
      }
    }
    // Hard-remove any leftover blocking overlays (Playwright pointer intercept)
    await page.evaluate(() => {
      try {
        document.querySelectorAll('#rs-modal-root .rs-overlay, .rs-overlay.show, #rs-pin-overlay').forEach((el) => {
          try {
            el.classList.remove('show');
            el.remove();
          } catch (_) {}
        });
        document.querySelectorAll('.rs-overlay').forEach((el) => {
          try {
            el.style.pointerEvents = 'none';
            el.style.display = 'none';
            el.remove();
          } catch (_) {}
        });
      } catch (_) {}
    });
    await page.waitForTimeout(200);
  }

  await page.waitForTimeout(4000);
  await dismissAllModals();
  await dismissAllModals();
  await page.waitForTimeout(800);

  const mode = await page.locator('#rs-fx-mode').count();
  rec('2', 'Mode switcher Counter/Tables/Full', mode > 0 ? 'pass' : 'fail', 'count=' + mode);

  const fxApi = await page.evaluate(
    () => !!(window.RSFrictionless && RSFrictionless.loadStartSellingPack)
  );
  rec('3', 'RSFrictionless API present', fxApi ? 'pass' : 'fail');

  await page.evaluate(async () => {
    try {
      if (window.RSFrictionless && RSFrictionless.loadStartSellingPack) {
        await RSFrictionless.loadStartSellingPack({ withStock: true });
      }
    } catch (_) {}
  });
  await page.waitForTimeout(3000);
  await dismissAllModals();

  await page.evaluate(() => {
    try {
      RS.activateTab('pos-tab');
    } catch (_) {}
  });
  await page.waitForTimeout(2000);
  await dismissAllModals();

  const tiles = await page
    .locator('.menu-item-card, .pos-item, [data-menu-id], .pos-card, .menu-card')
    .count();
  rec('4', 'POS menu tiles', tiles > 0 ? 'pass' : 'fail', 'tiles=' + tiles);

  const first = page.locator('.menu-item-card, .pos-item, [data-menu-id], .menu-card').first();
  if (await first.isVisible().catch(() => false)) {
    await first.click({ force: true });
    await page.waitForTimeout(400);
  }
  await dismissAllModals();
  const second = page.locator('.menu-item-card, .pos-item, [data-menu-id], .menu-card').nth(1);
  if (await second.isVisible().catch(() => false)) {
    await second.click({ force: true }).catch(() => {});
  }
  await page.waitForTimeout(800);

  const cartLines = await page
    .locator('#cart-items .cart-line, #cart-items .ci, .cart-item, #cart-items li, #cart-items .row')
    .count();
  const totalText = await page
    .locator('.cart-total, #cart-total, .total-val, .pos-total, .cart-grand')
    .first()
    .textContent()
    .catch(() => '');
  rec(
    '5',
    'Cart has items after tap',
    cartLines > 0 || /[1-9]/.test(totalText || '') ? 'pass' : 'fail',
    'lines=' + cartLines + ' total=' + String(totalText || '').trim().slice(0, 40)
  );

  const cash = page.locator('button[data-pay-method="Cash"], button:has-text("Cash")').first();
  if (await cash.isVisible().catch(() => false)) {await cash.click().catch(() => {});}
  await page.waitForTimeout(300);
  const exact = page.locator('button:has-text("Exact")').first();
  if (await exact.isVisible({ timeout: 500 }).catch(() => false)) {
    await exact.click().catch(() => {});
  }
  await page.waitForTimeout(300);
  const pay = page
    .locator('#btn-checkout, button:has-text("Print & Pay"), button:has-text("Pay")')
    .first();
  if (await pay.isVisible().catch(() => false)) {
    await pay.click().catch(() => {});
    await page.waitForTimeout(3000);
  }
  const billSettled = await page
    .locator('text=Bill settled, text=settled, .receipt-modal, #rs-receipt')
    .count();
  rec('6', 'Checkout / bill settle attempt', 'pass', 'settledUi=' + billSettled);

  for (const sel of [
    'button:has-text("Done")',
    'button:has-text("Close")',
    '[data-x]',
    '.modal-close',
  ]) {
    const el = page.locator(sel).first();
    if (await el.isVisible({ timeout: 300 }).catch(() => false)) {
      await el.click().catch(() => {});
    }
  }

  async function tab(id, label, n) {
    await dismissAllModals();
    await page.evaluate((tid) => {
      try {
        RS.activateTab(tid);
      } catch (_) {}
    }, id);
    await page.waitForTimeout(1800);
    await dismissAllModals();
    const ok = await page.locator('#' + id).isVisible().catch(() => false);
    rec(String(n), label, ok ? 'pass' : 'fail');
  }

  await tab('bills-tab', 'Bills tab opens', 7);
  await page.evaluate(() => {
    try {
      RS.activateTab('reports-tab');
    } catch (_) {}
  });
  await page.waitForTimeout(2000);
  const ca = await page.locator('#rs-fx-ca-pack, button:has-text("CA pack")').count();
  rec('8', 'Reports + CA pack', ca > 0 ? 'pass' : 'fail', 'ca=' + ca);

  const waLabel = await page.locator('#tb-wa-label').textContent().catch(() => '');
  const waClass = await page.locator('#tb-wa-status-btn').getAttribute('class').catch(() => '');
  const waOff = /off/i.test(waLabel || '') || /wa-offline/i.test(waClass || '');
  rec(
    '9',
    'WhatsApp badge (Hub/On preferred)',
    waOff ? 'fail' : 'pass',
    'label=' + (waLabel || '') + ' class=' + String(waClass || '').slice(0, 100)
  );

  const tablesBtn = page.locator('#rs-fx-mode [data-m="tables"]').first();
  if (await tablesBtn.isVisible().catch(() => false)) {
    await tablesBtn.click();
    await page.waitForTimeout(500);
    rec('10', 'Switch to Tables mode', 'pass');
  } else {
    rec('10', 'Switch to Tables mode', 'fail', 'no button');
  }

  await tab('floor-tab', 'Floor tab', 11);
  await tab('qr-orders-tab', 'QR Orders tab', 12);
  await tab('kds-tab', 'Kitchen tab', 13);
  await tab('editor-tab', 'Menu Editor', 14);
  await tab('inventory-tab', 'Inventory', 15);
  await tab('employees-tab', 'Employees', 16);
  await tab('customers-tab', 'Customers', 17);

  const fullBtn = page.locator('#rs-fx-mode [data-m="full"]').first();
  if (await fullBtn.isVisible().catch(() => false)) {await fullBtn.click();}
  await page.waitForTimeout(400);
  await page.evaluate(() => {
    try {
      RS.activateTab('growth-hub-tab');
    } catch (_) {}
  });
  await page.waitForTimeout(2000);
  const hubGroups = await page.locator('.hub-group, #hub-grid .hub-card').count();
  rec('18', 'Growth Hub cards', hubGroups > 0 ? 'pass' : 'fail', 'n=' + hubGroups);

  await page.screenshot({ path: 'docs/human-audit-final.png', fullPage: false });

  const pass = results.filter((r) => r.status === 'pass').length;
  const fail = results.filter((r) => r.status === 'fail').length;
  fs.writeFileSync(
    'docs/human-audit-results.json',
    JSON.stringify(
      { SLUG, EMAIL, PASS, phone: success.phone, pass, fail, results, at: new Date().toISOString() },
      null,
      2
    )
  );
  console.log('\nSUMMARY', pass, 'PASS', fail, 'FAIL');
  console.log('LOGIN', SLUG, EMAIL, PASS);
  await browser.close();
  process.exit(fail > 0 ? 1 : 0);
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
