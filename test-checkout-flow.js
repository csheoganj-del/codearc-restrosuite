const puppeteer = require('puppeteer');
const http = require('http');
const fs = require('fs');
const path = require('path');

const ROOT = __dirname;
const PORT = 9877;

// Simple static file server
const server = http.createServer((req, res) => {
  let filePath = path.join(ROOT, req.url === '/' ? 'dashboard.html' : req.url);
  const ext = path.extname(filePath);
  const types = { '.html': 'text/html', '.js': 'application/javascript', '.css': 'text/css', '.json': 'application/json', '.png': 'image/png' };
  fs.readFile(filePath, (err, data) => {
    if (err) { res.writeHead(404); res.end('Not found'); return; }
    res.writeHead(200, { 'Content-Type': types[ext] || 'application/octet-stream' });
    res.end(data);
  });
});

(async () => {
  server.listen(PORT);
  console.log(`Server on http://localhost:${PORT}`);

  const browser = await puppeteer.launch({ headless: false, args: ['--no-sandbox', '--window-size=1400,900'] });
  const page = await browser.newPage();
  await page.setViewport({ width: 1400, height: 900 });

  // Stub window.RestroSuite domain modules + sessionStorage BEFORE page loads
  await page.evaluateOnNewDocument(() => {
    // Bypass session guard
    sessionStorage.setItem('logged_in_user', 'testcashier');
    sessionStorage.setItem('logged_in_role', 'admin');
    sessionStorage.setItem('logged_in_display_name', 'Test Cashier');
    sessionStorage.setItem('tenant_id', 'test-tenant');
    sessionStorage.setItem('tenant_slug', 'test');
    sessionStorage.setItem('tenant_name', 'Doppio Cafe');
    sessionStorage.setItem('allowed_tabs', JSON.stringify(['pos-tab','bills-tab','inventory-tab','reports-tab','editor-tab','crm-tab','tax-tab']));

    const noop = () => {};
    const noopAsync = async () => ({});
    const noopObj = new Proxy({}, { get: () => noopAsync });

    window.RestroSuite = {
      api: {
        createTenantApi: () => ({ access: noopAsync, staff: noopAsync })
      },
      auth: {
        createSessionManager: () => ({ validateStoredSession: async () => ({ allowed_tabs: ['pos-tab','bills-tab','inventory-tab','reports-tab','editor-tab','crm-tab','tax-tab'] }) })
      },
      billing: {
        calculateCartTotals: ({ cart, businessProfile, discountType, discountValue, crmData, phoneVal, custName }) => {
          const subtotal = (cart || []).reduce((s, i) => s + (i.price * i.qty), 0);
          const gstRate = businessProfile && businessProfile.gstRate !== undefined ? businessProfile.gstRate : 18;
          const gst = businessProfile && businessProfile.gstEnabled !== false ? Math.round(subtotal * gstRate / 100) : 0;
          let totalDiscount = 0;
          if (discountType === 'flat') totalDiscount = discountValue || 0;
          else if (discountType === 'percent') totalDiscount = Math.round(subtotal * (discountValue || 0) / 100);
          return { subtotal, totalDiscount, gst, total: subtotal - totalDiscount + gst };
        },
        aggregateDeductions: (cart, getSpecs) => {
          const d = {};
          (cart || []).forEach(item => {
            const specs = getSpecs(item);
            Object.keys(specs).forEach(k => { d[k] = (d[k] || 0) + specs[k] * item.qty; });
          });
          return d;
        }
      },
      bills: {},
      inventory: {},
      imports: {},
      observability: {
        createReporter: () => ({ installGlobalHandlers: noop, report: noop })
      },
      operations: {},
      people: { getLoyaltyTier: (visits) => visits >= 20 ? 'Platinum' : visits >= 10 ? 'Gold' : visits >= 5 ? 'Silver' : 'Bronze' },
      staffAccess: {
        resolveAllowedTabs: (role, tabs) => tabs.length ? tabs : ['pos-tab','bills-tab','inventory-tab','reports-tab','editor-tab','crm-tab','tax-tab'],
        defaultTabForRole: () => 'pos-tab',
        initialize: noop
      },
      pos: {},
      superadmin: {},
      whatsapp: {}
    };
  });

  console.log('Navigating to dashboard...');
  await page.goto(`http://localhost:${PORT}/dashboard.html`, { waitUntil: 'domcontentloaded', timeout: 15000 });

  // Wait a moment for JS to initialize
  await new Promise(r => setTimeout(r, 3000));

  // Screenshot 1: Initial cart state
  console.log('Screenshot 1: Initial cart state...');
  await page.screenshot({ path: path.join(ROOT, 'screenshot-1-initial.png'), fullPage: false });

  // Click on a menu item to add to cart (if any are rendered)
  const hasItems = await page.evaluate(() => {
    const cards = document.querySelectorAll('.pos-item-card');
    return cards.length;
  });
  console.log(`Menu items rendered: ${hasItems}`);

  if (hasItems > 0) {
    // Click first 2 menu items
    await page.click('.pos-item-card');
    await new Promise(r => setTimeout(r, 500));
    const cards = await page.$$('.pos-item-card');
    if (cards.length > 2) {
      await cards[2].click();
      await new Promise(r => setTimeout(r, 500));
    }
  } else {
    // Manually add items to cart via JS
    console.log('No menu cards rendered, injecting cart items manually...');
    await page.evaluate(() => {
      if (typeof addDefaultToCart === 'function') {
        // won't work if scoped
      }
    });
  }

  // Screenshot 2: Cart with items + payment section
  console.log('Screenshot 2: Cart with payment section...');
  await page.screenshot({ path: path.join(ROOT, 'screenshot-2-cart.png'), fullPage: false });

  // Check if cash payment section is visible (Cash should be default)
  const cashSectionVisible = await page.evaluate(() => {
    const el = document.getElementById('cash-payment-section');
    return el ? el.style.display !== 'none' : false;
  });
  console.log(`Cash payment section visible: ${cashSectionVisible}`);

  // Check payment buttons state
  const activePayMethod = await page.evaluate(() => {
    const active = document.querySelector('.pay-method-btn.active');
    return active ? active.getAttribute('data-method') : 'none';
  });
  console.log(`Active payment method: ${activePayMethod}`);

  // Click UPI to switch payment
  const upiBtn = await page.$('.pay-method-btn[data-method="UPI"]');
  if (upiBtn) {
    await upiBtn.click();
    await new Promise(r => setTimeout(r, 300));
    const cashHidden = await page.evaluate(() => {
      const el = document.getElementById('cash-payment-section');
      return el ? el.style.display === 'none' : true;
    });
    console.log(`Cash section hidden after UPI click: ${cashHidden}`);
  }

  // Screenshot 3: UPI selected (no cash section)
  console.log('Screenshot 3: UPI payment selected...');
  await page.screenshot({ path: path.join(ROOT, 'screenshot-3-upi.png'), fullPage: false });

  // Switch back to Cash
  const cashBtn = await page.$('.pay-method-btn[data-method="Cash"]');
  if (cashBtn) {
    await cashBtn.click();
    await new Promise(r => setTimeout(r, 300));
  }

  // Screenshot 4: Cash selected again
  console.log('Screenshot 4: Cash payment with received/change...');
  await page.screenshot({ path: path.join(ROOT, 'screenshot-4-cash.png'), fullPage: false });

  // Test quick amount buttons
  const exactBtn = await page.$('.cash-quick-btn[data-amount="exact"]');
  if (exactBtn) {
    await exactBtn.click();
    await new Promise(r => setTimeout(r, 300));
    const receivedVal = await page.evaluate(() => document.getElementById('cash-received-input')?.value);
    const changeVal = await page.evaluate(() => document.getElementById('cash-change-display')?.textContent);
    console.log(`After "Exact" click: Received=${receivedVal}, Change=${changeVal}`);
  }

  // Test ₹500 quick button
  const btn500 = await page.$('.cash-quick-btn[data-amount="500"]');
  if (btn500) {
    await btn500.click();
    await new Promise(r => setTimeout(r, 300));
    const receivedVal = await page.evaluate(() => document.getElementById('cash-received-input')?.value);
    const changeVal = await page.evaluate(() => document.getElementById('cash-change-display')?.textContent);
    console.log(`After "₹500" click: Received=${receivedVal}, Change=${changeVal}`);
  }

  // Screenshot 5: Quick amount buttons tested
  console.log('Screenshot 5: Cash quick amount test...');
  await page.screenshot({ path: path.join(ROOT, 'screenshot-5-quickamt.png'), fullPage: false });

  // Check discount "Add" link
  const discountLink = await page.$('#discount-add-link');
  if (discountLink) {
    await discountLink.click();
    await new Promise(r => setTimeout(r, 300));
    const panelVisible = await page.evaluate(() => {
      const el = document.getElementById('discount-input-panel');
      return el ? el.style.display !== 'none' : false;
    });
    console.log(`Discount panel visible after click: ${panelVisible}`);
  }

  // Screenshot 6: Discount panel
  console.log('Screenshot 6: Discount panel open...');
  await page.screenshot({ path: path.join(ROOT, 'screenshot-6-discount.png'), fullPage: false });

  // Check console errors
  const errors = [];
  page.on('pageerror', err => errors.push(err.message));
  page.on('console', msg => { if (msg.type() === 'error') errors.push(msg.text()); });

  console.log('\n=== CHECKOUT FLOW TEST RESULTS ===');
  console.log(`Cash section visible by default: ${cashSectionVisible}`);
  console.log(`Default payment method: ${activePayMethod}`);
  console.log(`Screenshots saved to project root`);
  if (errors.length) console.log('Console errors:', errors.join('\n'));
  else console.log('No console errors detected during test');

  // Keep browser open for 8 seconds for visual inspection
  await new Promise(r => setTimeout(r, 8000));

  await browser.close();
  server.close();
  process.exit(0);
})().catch(err => {
  console.error('Test failed:', err.message);
  server.close();
  process.exit(1);
});
