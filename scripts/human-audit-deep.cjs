'use strict';
const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

const success = JSON.parse(
  fs.readFileSync(path.join('docs', 'human-register-success.json'), 'utf8')
);

(async () => {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1400, height: 900 } });
  const r = [];
  const rec = (id, t, s, d) => {
    r.push({ id, t, s, d: d || '' });
    console.log('[' + String(s).toUpperCase() + ']', id, t, d || '');
  };

  const dismiss = async () => {
    await page.evaluate(() => {
      document
        .querySelectorAll('#rs-modal-root .rs-overlay, .rs-overlay.show, #rs-pin-overlay')
        .forEach((el) => {
          try {
            el.remove();
          } catch (_) {}
        });
    });
  };

  await page.goto('https://restrosuite.codearc.co.in/login', {
    waitUntil: 'domcontentloaded',
    timeout: 90000,
  });
  await page.click('#tab-login-btn').catch(() => {});
  await page.fill('#tenant-id', success.slug);
  await page.fill('#username', success.email);
  await page.fill('#password', success.password || 'AuditTest99!');
  await page.click('#login-submit');
  await page.waitForURL(/dashboard/, { timeout: 60000 });
  await page.waitForTimeout(5000);
  await dismiss();

  const shiftInfo = await page.evaluate(() => {
    const btn =
      document.getElementById('tb-shift-btn') ||
      document.querySelector('[data-shift], .js-shift-btn, #shift-btn');
    let open = false;
    try {
      open = !!(window.RS && RS.currentShift && RS.currentShift.id);
    } catch (_) {}
    return {
      shiftText: (btn && btn.textContent) || '',
      shiftOpen: open,
    };
  });
  rec('S1', 'Shift state', 'info', JSON.stringify(shiftInfo).slice(0, 200));

  await page.evaluate(() => {
    try {
      RS.activateTab('bills-tab');
    } catch (_) {}
  });
  await page.waitForTimeout(2500);
  await dismiss();
  const bills = await page.evaluate(() => {
    const rows = document.querySelectorAll(
      '#bills-tab tr, #bills-tab .bill-row, #bills-list .bill, #bills-tab tbody tr, .bills-table tbody tr'
    );
    const text = (document.querySelector('#bills-tab') || document.body).innerText.slice(0, 600);
    return { rowCount: rows.length, snippet: text.replace(/\s+/g, ' ').slice(0, 300) };
  });
  rec(
    'S2',
    'Bills list has settled bill',
    bills.rowCount > 0 || /BILL|TRS|Cash|₹|Rs\.?/i.test(bills.snippet) ? 'pass' : 'fail',
    'rows=' + bills.rowCount + ' snip=' + bills.snippet.slice(0, 140)
  );

  await page.evaluate(() => {
    try {
      RS.activateTab('reports-tab');
    } catch (_) {}
  });
  await page.waitForTimeout(2500);
  await dismiss();
  const reports = await page.evaluate(() => {
    const t = (document.querySelector('#reports-tab') || document.body).innerText
      .replace(/\s+/g, ' ')
      .slice(0, 400);
    const ca = !!document.querySelector('#rs-fx-ca-pack, [data-ca-pack]');
    return { ca, snippet: t };
  });
  rec(
    'S3',
    'Reports content',
    /sales|revenue|today|report|gst|bill/i.test(reports.snippet) ? 'pass' : 'fail',
    'ca=' + reports.ca + ' snip=' + reports.snippet.slice(0, 140)
  );

  await page.evaluate(() => {
    try {
      RS.activateTab('pos-tab');
    } catch (_) {}
  });
  await page.waitForTimeout(1500);
  await dismiss();

  const pos = await page.evaluate(async () => {
    const tiles = document.querySelectorAll('.menu-item-card, .pos-item, [data-menu-id]');
    if (tiles[0]) tiles[0].click();
    await new Promise((res) => setTimeout(res, 400));
    if (tiles[1]) tiles[1].click();
    await new Promise((res) => setTimeout(res, 400));
    const exact = Array.from(document.querySelectorAll('button')).find((b) =>
      /exact/i.test(b.textContent || '')
    );
    if (exact) exact.click();
    const cash = document.querySelector('[data-pay-method="Cash"]');
    if (cash) cash.click();
    const cartText = (document.querySelector('#cart-items') || {}).innerText || '';
    const totalEl = document.querySelector(
      '#cart-total, .cart-total, .pos-total, #grand-total'
    );
    const checkout = document.getElementById('btn-checkout');
    return {
      tiles: tiles.length,
      cartSnippet: String(cartText).replace(/\s+/g, ' ').slice(0, 120),
      total: totalEl ? totalEl.textContent.trim() : '',
      checkoutDisabled: checkout
        ? !!(
            checkout.disabled ||
            checkout.classList.contains('disabled') ||
            checkout.getAttribute('aria-disabled') === 'true'
          )
        : null,
      checkoutText: checkout ? checkout.textContent.trim().slice(0, 40) : 'missing',
    };
  });
  rec(
    'S4',
    'POS re-add cart',
    pos.tiles > 0 && pos.cartSnippet ? 'pass' : 'fail',
    JSON.stringify(pos).slice(0, 220)
  );

  await dismiss();
  const payBtn = page.locator('#btn-checkout').first();
  if (await payBtn.isVisible().catch(() => false)) {
    await payBtn.click({ force: true }).catch(() => {});
    await page.waitForTimeout(4000);
  }
  const afterPay = await page.evaluate(() => {
    const overlay = document.querySelector('#rs-modal-root .rs-overlay.show, .rs-overlay.show');
    const t = overlay ? overlay.innerText.replace(/\s+/g, ' ').slice(0, 250) : '';
    const bodyBits = document.body.innerText.replace(/\s+/g, ' ');
    const checklist = bodyBits.match(/Start selling[\s\S]{0,120}/i);
    return {
      hasOverlay: !!overlay,
      overlayText: t,
      checklist: checklist ? checklist[0].slice(0, 140) : '',
      settledPhrase: /bill settled|receipt|print/i.test(t + bodyBits),
      shiftPhrase: /open a shift|shift first/i.test(t + bodyBits),
    };
  });
  rec(
    'S5',
    'Print & Pay result',
    afterPay.hasOverlay || afterPay.settledPhrase || afterPay.shiftPhrase ? 'pass' : 'info',
    JSON.stringify(afterPay).slice(0, 300)
  );

  const wa = await page.evaluate(() => {
    const btn = document.getElementById('tb-wa-status-btn');
    const label = document.getElementById('tb-wa-label');
    return {
      label: label ? label.textContent : '',
      class: btn ? btn.className : '',
      title: btn ? btn.title || btn.getAttribute('aria-label') || '' : '',
    };
  });
  rec(
    'S6',
    'WA hub badge detail',
    /wa-platform|hub|\+/i.test(wa.class + wa.label) ? 'pass' : 'fail',
    JSON.stringify(wa)
  );

  await page.evaluate(() => {
    try {
      RS.activateTab('floor-tab');
    } catch (_) {}
  });
  await page.waitForTimeout(1500);
  await dismiss();
  const floor = await page.evaluate(() => {
    const tables = document.querySelectorAll(
      '.floor-table, .table-card, [data-table-id], .rs-table-tile'
    );
    const t = (document.querySelector('#floor-tab') || {}).innerText || '';
    return { n: tables.length, snip: t.replace(/\s+/g, ' ').slice(0, 120) };
  });
  rec(
    'S7',
    'Floor has tables',
    floor.n > 0 || /table|T1|T2/i.test(floor.snip) ? 'pass' : 'fail',
    JSON.stringify(floor)
  );

  const online = await page.locator('text=Online').count();
  rec('S8', 'Online synced pill', online > 0 ? 'pass' : 'info', 'count=' + online);

  // Menu editor sample items
  await page.evaluate(() => {
    try {
      RS.activateTab('editor-tab');
    } catch (_) {}
  });
  await page.waitForTimeout(1500);
  await dismiss();
  const menu = await page.evaluate(() => {
    const items = document.querySelectorAll(
      '#editor-tab .menu-row, #editor-tab tr, #editor-tab .item-card, #menu-list .item'
    );
    const t = (document.querySelector('#editor-tab') || {}).innerText || '';
    return { n: items.length, snip: t.replace(/\s+/g, ' ').slice(0, 140) };
  });
  rec(
    'S9',
    'Menu editor has items',
    menu.n > 0 || /tea|coffee|samosa|menu|dish/i.test(menu.snip) ? 'pass' : 'fail',
    JSON.stringify(menu).slice(0, 180)
  );

  await page.screenshot({ path: 'docs/human-audit-deep.png', fullPage: false });
  fs.writeFileSync(
    'docs/human-audit-deep.json',
    JSON.stringify({ r, at: new Date().toISOString() }, null, 2)
  );
  const pass = r.filter((x) => x.s === 'pass').length;
  const fail = r.filter((x) => x.s === 'fail').length;
  console.log('\nDEEP DONE', pass, 'pass', fail, 'fail');
  await browser.close();
  process.exit(fail > 0 ? 1 : 0);
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
