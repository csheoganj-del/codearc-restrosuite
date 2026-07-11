'use strict';
/**
 * Live cashier walkthrough of Current Order panel.
 * Uses Playwright Chromium like a real user — measures layout, interacts, screenshots.
 *
 *   node scratch/ux-cart-walkthrough.cjs
 */
const { chromium } = require('playwright');
const path = require('path');
const fs = require('fs');

const BASE = process.env.E2E_BASE_URL || 'http://127.0.0.1:4173';
const OUT = path.join(__dirname, 'ux-cart-shots');
const REPORT = path.join(__dirname, 'ux-cart-report.json');

const MENU = [
  { id: 1, name: 'Garlic Pizza Bread', cat: 'Pizza', price: 9, veg: true, stock: 'ok' },
  { id: 2, name: 'Chicken Tikka', cat: 'Indian', price: 6, veg: false, stock: 'ok' },
  { id: 3, name: 'Diet Coke 500ml', cat: 'Drinks', price: 3, veg: true, stock: 'ok' },
  { id: 4, name: 'Chicken Burger Meal', cat: 'Meal Deal', price: 10, veg: false, stock: 'ok' },
  { id: 5, name: 'Popcorn Chicken Meal', cat: 'Meal Deal', price: 7, veg: false, stock: 'ok' },
  { id: 6, name: 'Tarka Dal (Side)', cat: 'Indian - Vegetarian', price: 5, veg: true, stock: 'ok' },
  { id: 7, name: 'Basmati Rice', cat: 'Sides', price: 4, veg: true, stock: 'ok' },
  { id: 8, name: 'Chicken Goujon Kebab+Naan', cat: 'Kebab Rolls', price: 10, veg: false, stock: 'ok' },
  { id: 9, name: 'Fanta 330ml', cat: 'Drinks', price: 3, veg: true, stock: 'ok' },
  { id: 10, name: 'Onion Bhaji (4)', cat: 'Starters', price: 5, veg: true, stock: 'low' },
];

function ensureOut() {
  if (!fs.existsSync(OUT)) fs.mkdirSync(OUT, { recursive: true });
}

async function shot(page, name) {
  const p = path.join(OUT, name + '.png');
  await page.screenshot({ path: p, fullPage: false });
  return p;
}

async function measureCart(page) {
  return page.evaluate(() => {
    const cart = document.querySelector('.pos-cart');
    const items = document.getElementById('cart-items');
    const foot = document.querySelector('.cart-foot');
    const meta = document.getElementById('cart-meta-row');
    const head = document.querySelector('.cart-head');
    const orderTypes = document.getElementById('pos-cart-order-types');
    const shift = document.getElementById('pos-shift-slot');
    const cust = document.getElementById('custom-customer-widget');
    const cash = document.getElementById('cash-drawer');
    const split = document.getElementById('split-drawer');
    const pay = document.getElementById('cart-pay-zone');
    const lines = [...document.querySelectorAll('#cart-items .cart-line')];
    const cr = (el) => {
      if (!el) return null;
      const r = el.getBoundingClientRect();
      const cs = getComputedStyle(el);
      return {
        h: Math.round(r.height),
        w: Math.round(r.width),
        top: Math.round(r.top),
        display: cs.display,
        visible: r.height > 0 && cs.display !== 'none' && cs.visibility !== 'hidden',
      };
    };
    const itemsR = items ? items.getBoundingClientRect() : null;
    let visibleLines = 0;
    let clippedLines = 0;
    lines.forEach((ln) => {
      const r = ln.getBoundingClientRect();
      if (!itemsR) return;
      if (r.bottom <= itemsR.top || r.top >= itemsR.bottom) clippedLines++;
      else if (r.top >= itemsR.top && r.bottom <= itemsR.bottom) visibleLines++;
      else {
        // partial
        if (r.height > 0) visibleLines += 0.5;
      }
    });
    return {
      viewport: { w: window.innerWidth, h: window.innerHeight },
      cart: cr(cart),
      cartItems: cr(items),
      cartFoot: cr(foot),
      metaRow: cr(meta),
      head: cr(head),
      orderTypes: cr(orderTypes),
      shift: cr(shift),
      customer: cr(cust),
      cash: cr(cash),
      split: cr(split),
      payZone: cr(pay),
      lineCount: lines.length,
      visibleLines: Math.round(visibleLines * 10) / 10,
      clippedLines,
      cartItemsScrollH: items ? items.scrollHeight : 0,
      cartItemsClientH: items ? items.clientHeight : 0,
      needsScroll: items ? items.scrollHeight > items.clientHeight + 4 : false,
      cashOpen: cash && !cash.hidden && cash.classList.contains('csd-open'),
      splitOpen: split && !split.hidden && split.classList.contains('csd-open'),
      custOpen: document.getElementById('cart-cust-toggle')?.getAttribute('aria-expanded') === 'true',
      activePay: document.querySelector('[data-pay-method].active')?.dataset?.payMethod || null,
      ratioItemsVsCart:
        cart && items && cart.getBoundingClientRect().height
          ? Math.round((items.getBoundingClientRect().height / cart.getBoundingClientRect().height) * 100)
          : 0,
    };
  });
}

async function seedPos(page) {
  await page.evaluate((menu) => {
    window.RS = window.RS || {};
    window.RS.MENU = menu;
    window.RS.BILLS = window.RS.BILLS || [];
    window.RS_SETTINGS = Object.assign({}, window.RS_SETTINGS || {}, {
      set_calculate_taxes: true,
      set_currency: 'INR',
      set_loyalty_program: true,
    });
    // Open shift if helper exists so strip is realistic
    try {
      if (window.RSOps && typeof RSOps.openShift === 'function') {
        /* optional */
      }
    } catch (_) {}
    if (window.RSPosUI && RSPosUI.renderPOS) RSPosUI.renderPOS();
    if (window.RSPosUI && RSPosUI.refreshPosCats) RSPosUI.refreshPosCats();
    if (window.RS && RS.renderPOS) RS.renderPOS();
    // Force POS tab
    const tab = document.getElementById('pos-tab');
    if (tab) {
      document.querySelectorAll('.tab-content').forEach((t) => t.classList.remove('active'));
      tab.classList.add('active');
    }
    document.querySelectorAll('[data-tab]').forEach((b) => {
      b.classList.toggle('active', b.getAttribute('data-tab') === 'pos-tab');
    });
    if (window.RS && RS.activateTab) RS.activateTab('pos-tab');
  }, MENU);
  await page.waitForTimeout(400);
}

async function main() {
  ensureOut();
  const findings = [];
  const note = (sev, msg, extra) => {
    findings.push({ sev, msg, ...(extra || {}) });
    console.log(`[${sev}] ${msg}`);
  };

  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    viewport: { width: 1440, height: 900 },
    deviceScaleFactor: 1,
  });
  const page = await context.newPage();
  page.on('pageerror', (e) => note('error', 'pageerror: ' + e.message));
  page.on('console', (m) => {
    if (m.type() === 'error') note('warn', 'console.error: ' + m.text());
  });

  // Fake local session so dashboard does not bounce to login when Supabase is configured
  await page.addInitScript(() => {
    window.RS_ALLOW_DEMO = true;
    try {
      sessionStorage.setItem('tenant_session_token', 'ux-walkthrough-token');
      sessionStorage.setItem('tenant_id', 'ux-tenant');
      sessionStorage.setItem('tenant_slug', 'ux-outlet');
      sessionStorage.setItem('tenant_name', 'UX Test Outlet');
      sessionStorage.setItem('logged_in_user', 'cashier');
      sessionStorage.setItem('logged_in_role', 'owner');
      sessionStorage.setItem('logged_in_display', 'Cashier UX');
      sessionStorage.setItem('allowed_tabs', '[]');
      // Suppress first-run profile / onboarding prompts (exact key from onboarding.js)
      sessionStorage.setItem('restrosuite_profile_prompt_dismissed:ux-tenant', '1');
      sessionStorage.setItem('restrosuite_profile_prompt_dismissed:default', '1');
      sessionStorage.setItem('rs_onboarding_done', '1');
      localStorage.setItem('rs_onboarding_complete', '1');
    } catch (_) {}
  });

  console.log('Opening', BASE + '/dashboard.html?appv=v91-ux');
  await page.goto(BASE + '/dashboard.html?appv=v91-ux-walk', {
    waitUntil: 'domcontentloaded',
    timeout: 60000,
  });
  await page.waitForTimeout(2500);

  // If redirected to login, force stay by going back with session
  if (/login/i.test(page.url())) {
    note('error', 'Redirected to login despite session seed — forcing dashboard with demo stub');
    await page.goto(BASE + '/dashboard.html?appv=v91-ux-walk', { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(1500);
  }

  // Hide boot loader if stuck
  await page.evaluate(() => {
    document.documentElement.classList.add('rs-styles-ready');
    const boot = document.getElementById('rs-boot-loader');
    if (boot) boot.style.display = 'none';
    const app = document.getElementById('app');
    if (app) app.style.visibility = 'visible';
  });

  await seedPos(page);
  await page.waitForSelector('#pos-grid, .pos-cart', { timeout: 20000 }).catch(() => {});

  // Dismiss onboarding / profile / license modals that block real cashier use
  await page.evaluate(() => {
    [
      '#rs-profile-prompt-modal',
      '.rs-modal',
      '.dash-modal',
      '#onboarding-modal',
      '[role="dialog"]',
    ].forEach((sel) => {
      document.querySelectorAll(sel).forEach((el) => {
        el.style.display = 'none';
        el.classList.remove('active', 'open', 'show');
        el.setAttribute('aria-hidden', 'true');
        if (el.parentElement && el.id === 'rs-profile-prompt-modal') el.remove();
      });
    });
    document.querySelectorAll('.rs-overlay, .modal-backdrop, [class*="backdrop"]').forEach((el) => {
      el.style.display = 'none';
      el.remove();
    });
  });
  await page.keyboard.press('Escape').catch(() => {});
  await page.waitForTimeout(200);
  await shot(page, '01-boot');

  // Ensure menu tiles
  let tiles = await page.locator('#pos-grid .pos-item:not(.out)').count();
  if (tiles < 3) {
    await seedPos(page);
    await page.waitForTimeout(500);
    tiles = await page.locator('#pos-grid .pos-item:not(.out)').count();
  }
  note(tiles >= 3 ? 'ok' : 'error', `Menu tiles available: ${tiles}`);

  // --- Act as cashier: add 3 items ---
  for (let i = 0; i < 3; i++) {
    const item = page.locator('#pos-grid .pos-item:not(.out)').nth(i);
    if (await item.count()) await item.click();
    await page.waitForTimeout(150);
  }
  await page.waitForTimeout(300);
  await shot(page, '02-three-items');
  let m = await measureCart(page);
  note('info', `After 3 items: cartItemsH=${m.cartItems?.h}px lines=${m.lineCount} visible=${m.visibleLines} items%ofCart=${m.ratioItemsVsCart}%`, m);

  if (m.lineCount < 3) note('error', 'Expected 3 cart lines after clicks');
  if (m.visibleLines < 3) note('bad', `Only ${m.visibleLines}/3 lines fully visible without scrolling — not enough cart space`);
  else note('ok', 'All 3 lines fully visible without scrolling');

  if (m.ratioItemsVsCart < 25) note('bad', `Cart list is only ${m.ratioItemsVsCart}% of panel height — chrome is eating the work surface`);
  else if (m.ratioItemsVsCart < 35) note('warn', `Cart list is ${m.ratioItemsVsCart}% of panel — should be higher for primary work area`);
  else note('ok', `Cart list is ${m.ratioItemsVsCart}% of panel height`);

  async function clearBlockers() {
    await page.evaluate(() => {
      document.querySelectorAll('#rs-profile-prompt-modal, [role="dialog"]').forEach((el) => {
        if (el.id === 'rs-profile-prompt-modal' || el.classList.contains('rs-modal')) el.remove();
      });
      if (window.RSPosUI && RSPosUI.setCartCustomerPanelOpen) RSPosUI.setCartCustomerPanelOpen(false);
    });
  }
  await clearBlockers();

  // --- Open customer ---
  const custBtn = page.locator('#cart-cust-toggle');
  if (await custBtn.count()) {
    await custBtn.click({ force: true });
    await page.waitForTimeout(300);
    await shot(page, '03-customer-open');
    const m2 = await measureCart(page);
    const itemsHDelta = (m.cartItems?.h || 0) - (m2.cartItems?.h || 0);
    note(
      itemsHDelta > 40 ? 'bad' : 'ok',
      `Customer open: cart items height change ${itemsHDelta}px (open=${m2.custOpen}) itemsH=${m2.cartItems?.h}`,
      m2
    );
    if (m2.visibleLines < 3 && m.lineCount >= 3) {
      note('bad', `Customer open clipped cart to ${m2.visibleLines} visible lines`);
    }

    const name = page.locator('#cust-input-name');
    if (await name.isVisible().catch(() => false)) {
      await name.fill('kal');
      await page.waitForTimeout(400);
      await shot(page, '04-customer-search');
    }

    // Close via API (same as pay-method path) then verify cart not blocked
    await page.evaluate(() => {
      if (window.RSPosUI && RSPosUI.setCartCustomerPanelOpen) RSPosUI.setCartCustomerPanelOpen(false);
    });
    await page.waitForTimeout(150);
    const blocked = await page.evaluate(() => {
      const qty = document.querySelector('#cart-items .qty button');
      if (!qty) return 'no-qty';
      const el = document.elementFromPoint(
        qty.getBoundingClientRect().left + 5,
        qty.getBoundingClientRect().top + 5
      );
      return el ? el.className || el.tagName : 'none';
    });
    note(
      /phone-flag|cust-input|cart-cust/i.test(String(blocked)) ? 'bad' : 'ok',
      `After customer close, element over qty is: ${blocked}`
    );
  } else {
    note('error', 'No customer toggle found');
  }

  // --- Add more items (busy cart) ---
  for (let i = 3; i < 8; i++) {
    const item = page.locator('#pos-grid .pos-item:not(.out)').nth(i);
    if (await item.count()) await item.click();
    await page.waitForTimeout(80);
  }
  await page.waitForTimeout(300);
  await shot(page, '05-busy-cart-8');
  const mBusy = await measureCart(page);
  note(
    'info',
    `Busy cart: lines=${mBusy.lineCount} visible=${mBusy.visibleLines} needsScroll=${mBusy.needsScroll} itemsH=${mBusy.cartItems?.h} items%=${mBusy.ratioItemsVsCart}`,
    mBusy
  );
  if (mBusy.lineCount >= 6 && mBusy.visibleLines < 4) {
    note('bad', `With ${mBusy.lineCount} items only ${mBusy.visibleLines} visible — workbench still too cramped`);
  } else if (mBusy.lineCount >= 6 && mBusy.visibleLines >= 5) {
    note('ok', `Busy cart shows ~${mBusy.visibleLines} lines before scroll — usable`);
  }

  // --- Payment methods ---
  for (const method of ['Cash', 'UPI', 'Split', 'Due']) {
    const btn = page.locator(`[data-pay-method="${method}"]`).first();
    if (!(await btn.count())) continue;
    await btn.click();
    await page.waitForTimeout(250);
    await shot(page, `06-pay-${method.toLowerCase()}`);
    const mm = await measureCart(page);
    const cashFloat = await page.evaluate(() => {
      const el = document.getElementById('cash-drawer');
      if (!el) return null;
      const cs = getComputedStyle(el);
      return {
        position: cs.position,
        inCart: !!el.closest('.pos-cart'),
        hidden: el.hidden,
        open: el.classList.contains('csd-open'),
        h: Math.round(el.getBoundingClientRect().height),
      };
    });
    const splitFloat = await page.evaluate(() => {
      const el = document.getElementById('split-drawer');
      if (!el) return null;
      const cs = getComputedStyle(el);
      return {
        position: cs.position,
        inCart: !!el.closest('.pos-cart'),
        hidden: el.hidden,
        open: el.classList.contains('csd-open'),
        h: Math.round(el.getBoundingClientRect().height),
      };
    });

    if (method === 'Cash') {
      if (!cashFloat?.inCart) note('bad', 'Cash tender not inside cart');
      else if (cashFloat.position === 'fixed') note('bad', 'Cash still uses fixed floating drawer');
      else note('ok', `Cash inline in cart (h=${cashFloat.h}px open=${cashFloat.open})`);
      if (cashFloat?.open && mm.visibleLines < 3 && mm.lineCount >= 6) {
        note('warn', `Cash open reduced visible lines to ${mm.visibleLines}`);
      }
    }
    if (method === 'Split') {
      if (!splitFloat?.inCart) note('bad', 'Split tender not inside cart');
      else if (splitFloat.position === 'fixed') note('bad', 'Split still uses fixed floating drawer');
      else note('ok', `Split inline in cart (h=${splitFloat.h}px open=${splitFloat.open})`);
    }
    if (method === 'UPI' || method === 'Due') {
      if (cashFloat?.open || splitFloat?.open) {
        note('warn', `${method} selected but cash/split panel still open`);
      } else note('ok', `${method}: no tender chrome clutter`);
    }
  }

  // Cash exact + qty change
  await page.locator('[data-pay-method="Cash"]').first().click();
  await page.waitForTimeout(200);
  const cashM = await measureCart(page);
  note(
    cashM.cash?.h && cashM.cash.h > 90 ? 'bad' : 'ok',
    `Cash panel height after select: ${cashM.cash?.h}px (target ≤80 without +notes)`,
    { cashH: cashM.cash?.h, itemsPct: cashM.ratioItemsVsCart }
  );
  note(
    cashM.ratioItemsVsCart >= 35 ? 'ok' : 'warn',
    `With cash open, cart items % of panel: ${cashM.ratioItemsVsCart}% (target ≥35%)`
  );
  const exact = page.locator('#cash-drawer .btn-den[data-val="exact"]').first();
  if (await exact.count()) await exact.click({ force: true });
  const plus = page.locator('#cart-items .qty button[data-d="1"]').first();
  if (await plus.count()) {
    await plus.click({ force: true });
    await page.waitForTimeout(150);
  }
  await shot(page, '07-cash-qty');

  // Hold / KOT presence
  const hold = page.locator('#btn-hold-current');
  const kot = page.locator('#btn-kot');
  const checkout = page.locator('#btn-checkout');
  note((await hold.count()) ? 'ok' : 'error', 'Hold button present: ' + !!(await hold.count()));
  note((await kot.count()) ? 'ok' : 'error', 'Send KOT present: ' + !!(await kot.count()));
  note((await checkout.count()) ? 'ok' : 'error', 'Print & Pay present: ' + !!(await checkout.count()));

  // Triple hold gone?
  const legacyHolds = await page.locator('#btn-hold-takeaway:visible, #btn-hold-dinein:visible, #btn-hold-delivery:visible').count();
  note(legacyHolds === 0 ? 'ok' : 'bad', `Visible legacy triple Hold buttons: ${legacyHolds}`);

  // Long-press note affordance — double-click first line
  const line = page.locator('#cart-items .cart-line').first();
  if (await line.count()) {
    await line.dblclick();
    await page.waitForTimeout(400);
    const modal = page.locator('.rs-modal, [class*="modal"], #line-note-input').first();
    const noteUi = await modal.isVisible().catch(() => false);
    note(noteUi ? 'ok' : 'warn', 'Double-click line opened kitchen note UI: ' + noteUi);
    // close if open
    const cancel = page.locator('[data-ln-x], .rs-modal [data-x]').first();
    if (await cancel.isVisible().catch(() => false)) await cancel.click().catch(() => {});
    await page.keyboard.press('Escape').catch(() => {});
  }

  await shot(page, '08-final');
  const finalM = await measureCart(page);

  // Score from real measurements
  let score = 10;
  const bad = findings.filter((f) => f.sev === 'bad' || f.sev === 'error').length;
  const warn = findings.filter((f) => f.sev === 'warn').length;
  score -= bad * 1.2;
  score -= warn * 0.4;
  if (finalM.ratioItemsVsCart < 30) score -= 1;
  if (finalM.ratioItemsVsCart >= 40) score += 0.3;
  score = Math.max(1, Math.min(10, Math.round(score * 10) / 10));

  const report = {
    at: new Date().toISOString(),
    base: BASE,
    score,
    finalMetrics: finalM,
    findings,
    shots: fs.readdirSync(OUT).filter((f) => f.endsWith('.png')),
  };
  fs.writeFileSync(REPORT, JSON.stringify(report, null, 2));
  console.log('\n=== UX WALKTHROUGH SCORE:', score, '/ 10 ===');
  console.log('Report:', REPORT);
  console.log('Shots:', OUT);
  console.log(
    'Summary:',
    findings.reduce((a, f) => {
      a[f.sev] = (a[f.sev] || 0) + 1;
      return a;
    }, {})
  );

  await browser.close();
  process.exit(bad > 0 ? 2 : 0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
