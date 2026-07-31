/**
 * RestroSuite — Complete Client Onboarding Guide (PDF)
 * From Google → register/login → every client tab, with full-page shots,
 * sample data seeding, and callouts so a new user can run the outlet alone.
 *
 * Usage: node scripts/generate-onboarding-guide.cjs
 * Env: RS_BASE, RS_OUTLET, RS_USER, RS_PASS
 */
'use strict';

const { buildOnboardingContent } = require('./lib/onboarding-content.cjs');
const { applyStepUi } = require('./lib/onboarding-prep.cjs');

const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright');

const ROOT = path.resolve(__dirname, '..');
const OUT_DIR = path.join(ROOT, 'docs', 'onboarding-guide');
const SHOTS = path.join(OUT_DIR, 'shots');
const PDF_PATH = path.join(ROOT, 'docs', 'RestroSuite-Complete-Onboarding-Guide.pdf');
const PDF_ALT = path.join(ROOT, 'docs', 'RestroSuite-Complete-Onboarding-Guide-v2.pdf');
const HTML_PATH = path.join(OUT_DIR, 'guide.html');
const MANIFEST = path.join(OUT_DIR, 'steps.json');

const BASE = process.env.RS_BASE || 'https://restrosuite.codearc.co.in';
const CREDS = {
  outlet: process.env.RS_OUTLET || 'bbb',
  user: process.env.RS_USER || 'bbb',
  pass: process.env.RS_PASS || 'Harry@1234',
};

const SUPPORT = 'support@codearc.co.in';
const SITE = 'https://restrosuite.codearc.co.in';

/** Ordered guide steps — exhaustive client coverage from shared module */
const __OB = buildOnboardingContent({
  SUPPORT: SUPPORT,
  SITE: SITE,
  mobile: false,
});
const STEPS = __OB.STEPS;
const DETAIL = __OB.DETAIL;

function ensureDirs() {
  fs.mkdirSync(SHOTS, { recursive: true });
}

function toDataUri(filePath) {
  if (!fs.existsSync(filePath)) {return '';}
  const buf = fs.readFileSync(filePath);
  const ext = path.extname(filePath).toLowerCase();
  const mime = ext === '.jpg' || ext === '.jpeg' ? 'image/jpeg' : 'image/png';
  return `data:${mime};base64,${buf.toString('base64')}`;
}

async function dismissOverlays(page) {
  // Outlet first-run wizard must be dismissed or every shot looks the same
  const selectors = [
    '#rs-profile-skip',
    'button:has-text("Fill this in later")',
    'button:has-text("Save and continue")', // only if skip missing — prefer skip
    'button[aria-label="Close"]',
    '.modal-close',
    '#tour-skip-btn',
    '#tour-close-btn',
    'button:has-text("Skip")',
    'button:has-text("Got it")',
    'button:has-text("Later")',
    'button:has-text("Not now")',
    'button:has-text("Don\'t show again")',
    '#rs-demo-x',
    '.product-guide-close',
    '.product-guide-backdrop',
    '[data-guide-close]',
  ];
  for (let pass = 0; pass < 3; pass++) {
    // Prefer skip over save on profile welcome
    const skip = page.locator('#rs-profile-skip, button:has-text("Fill this in later")').first();
    if (await skip.isVisible({ timeout: 400 }).catch(() => false)) {
      await skip.click({ timeout: 1000 }).catch(() => {});
      await page.waitForTimeout(400);
    }
    for (const sel of selectors) {
      try {
        const el = page.locator(sel).first();
        if (await el.isVisible({ timeout: 200 }).catch(() => false)) {
          await el.click({ timeout: 600 }).catch(() => {});
        }
      } catch (_) {}
    }
    await page.keyboard.press('Escape').catch(() => {});
    await page.waitForTimeout(150);
  }
  // Force-hide any leftover modal DOM so screenshots are clean
  await page
    .evaluate(() => {
      document.querySelectorAll('.dash-modal, .product-guide-modal, [role="dialog"]').forEach((el) => {
        const t = (el.textContent || '').toLowerCase();
        if (t.includes("let's set up") || t.includes('set up your outlet') || t.includes('fill this in later')) {
          el.remove();
        }
      });
      document.body.classList.remove('product-guide-open');
      document.body.style.overflow = '';
    })
    .catch(() => {});
}

async function highlight(page, selector) {
  if (!selector) {return;}
  await page.evaluate((sel) => {
    document.querySelectorAll('[data-ob-hi]').forEach((el) => {
      el.removeAttribute('data-ob-hi');
      el.style.outline = '';
      el.style.boxShadow = '';
      el.style.zIndex = '';
    });
    const nodes = document.querySelectorAll(sel);
    nodes.forEach((el, i) => {
      if (i > 4) {return;}
      el.setAttribute('data-ob-hi', '1');
      el.style.outline = '3px solid #FF4F00';
      el.style.outlineOffset = '3px';
      el.style.boxShadow = '0 0 0 6px rgba(255,79,0,0.25)';
      el.style.zIndex = '9990';
      try {
        el.scrollIntoView({ block: 'nearest', inline: 'nearest' });
      } catch (_) {}
    });
  }, selector).catch(() => {});
  await page.waitForTimeout(200);
}

async function clearHighlight(page) {
  await page.evaluate(() => {
    document.querySelectorAll('[data-ob-hi]').forEach((el) => {
      el.removeAttribute('data-ob-hi');
      el.style.outline = '';
      el.style.boxShadow = '';
      el.style.zIndex = '';
    });
  }).catch(() => {});
}

/** Reliable tab switch: await RS.activateTab + verify #id.active (never leave previous tab) */
async function openDashboardTab(page, tabId, settingsPanel) {
  await page.keyboard.press('Escape').catch(() => {});

  const link = page.locator(`.sidebar-link[data-tab="${tabId}"]`).first();
  if (await link.isVisible({ timeout: 800 }).catch(() => false)) {
    await link.click({ timeout: 6000 }).catch(() => {});
  }

  const switched = await page.evaluate(async (id) => {
    try {
      if (window.RS && typeof RS.activateTab === 'function') {
        await RS.activateTab(id);
      }
      const active = document.querySelector('.tab-content.active');
      return active ? active.id : null;
    } catch (e) {
      return 'ERR:' + (e && e.message);
    }
  }, tabId);

  await page
    .waitForFunction(
      (id) => {
        const el = document.getElementById(id);
        return !!(el && el.classList.contains('active'));
      },
      tabId,
      { timeout: 12000 }
    )
    .catch(() => {});

  const activeNow = await page.evaluate(() => {
    const a = document.querySelector('.tab-content.active');
    return a ? a.id : null;
  });
  if (activeNow !== tabId) {
    process.stdout.write(`(want ${tabId} got ${activeNow}/${switched}) `);
  }

  await page.waitForTimeout(900);

  if (tabId === 'settings-tab' && settingsPanel) {
    const btn = page.locator(`.set-nav button[data-s="${settingsPanel}"]`).first();
    if (await btn.isVisible({ timeout: 2500 }).catch(() => false)) {
      await btn.click().catch(() => {});
      await page.waitForTimeout(700);
    }
  }
}

/* prep helpers live in ./lib/onboarding-prep.cjs (applyStepUi) */

/** Seed sample data in the live session so empty tabs look real */
async function runSeed(page, name) {
  if (!name) {return;}
  await page.evaluate(async (seedName) => {
    const RS = window.RS || {};
    const toast = (m) => {
      try {
        if (RS.toast) {RS.toast(m, 'fa-check');}
      } catch (_) {}
    };
    function ensureArray(key, fallback) {
      if (!Array.isArray(RS[key])) {RS[key] = fallback || [];}
      return RS[key];
    }

    if (seedName === 'ensureMenu' || seedName === 'ensureCartItems' || seedName === 'ensureBill' || seedName === 'ensureKitchenTicket') {
      const menu = ensureArray('MENU', []);
      if (menu.length < 3) {
        const samples = [
          { id: 9001, name: 'Masala Dosa', price: 120, cat: 'South Indian', veg: true, gst: '5%', taxCategory: 'IN_REST_5', stock: 'ok' },
          { id: 9002, name: 'Filter Coffee', price: 40, cat: 'Beverages', veg: true, gst: '5%', taxCategory: 'IN_REST_5', stock: 'ok' },
          { id: 9003, name: 'Veg Thali', price: 180, cat: 'Meals', veg: true, gst: '5%', taxCategory: 'IN_REST_5', stock: 'ok' },
          { id: 9004, name: 'Soft Drink', price: 50, cat: 'Beverages', veg: true, gst: '18%', taxCategory: 'IN_GOODS_18', stock: 'ok' },
        ];
        samples.forEach((s) => {
          if (!menu.find((m) => m.name === s.name)) {menu.push(s);}
        });
        if (RS.saveOne) {
          for (const s of samples) {
            try {
              await RS.saveOne('menu', s);
            } catch (_) {}
          }
        }
        toast('Sample menu ready');
      }
      try {
        if (typeof RS.renderPOS === 'function') {RS.renderPOS();}
      } catch (_) {}
    }

    if (seedName === 'ensureCartItems') {
      try {
        // Prefer real UI clicks later; here set cart if exposed
        if (Array.isArray(RS.CART)) {
          /* leave */
        }
      } catch (_) {}
    }

    if (seedName === 'ensureInventory') {
      const inv = ensureArray('INVENTORY', []);
      if (inv.length < 2) {
        const rows = [
          { id: 'inv-s1', name: 'Rice', unit: 'kg', qty: 25, reorder: 5 },
          { id: 'inv-s2', name: 'Oil', unit: 'ltr', qty: 8, reorder: 2 },
          { id: 'inv-s3', name: 'Potato', unit: 'kg', qty: 12, reorder: 3 },
        ];
        rows.forEach((r) => {
          if (!inv.find((x) => x.name === r.name)) {inv.push(r);}
        });
        toast('Sample stock ready');
      }
    }

    if (seedName === 'ensureCustomer') {
      const cust = ensureArray('CUSTOMERS', []);
      if (!cust.find((c) => c.phone === '9876543210' || c.customerPhone === '9876543210')) {
        cust.push({
          id: 'cust-sample-1',
          name: 'Demo Guest',
          phone: '9876543210',
          visits: 3,
          spend: 540,
          dues: 0,
          points: 12,
        });
        toast('Sample customer ready');
      }
    }

    if (seedName === 'ensureTables') {
      try {
        document.dispatchEvent(new CustomEvent('rs:tables-updated'));
      } catch (_) {}
    }

    if (seedName === 'ensureQrContext' || seedName === 'ensureKitchenTicket') {
      /* visual only if no live tickets */
    }
  }, name).catch(() => {});
  await page.waitForTimeout(400);
}

async function seedCartViaUi(page) {
  try {
    await openDashboardTab(page, 'pos-tab');
    await page.waitForTimeout(800);
    // Click first few menu tiles
    const tiles = page.locator('#pos-tab .pos-item, #pos-tab .menu-item, .pos-grid button, .pos-grid .item').first();
    if (await tiles.count()) {
      for (let i = 0; i < 3; i++) {
        const t = page.locator('#pos-tab .pos-item, #pos-tab .menu-item, .pos-grid [data-id], .pos-grid button').nth(i);
        if (await t.isVisible().catch(() => false)) {await t.click({ timeout: 1000 }).catch(() => {});}
        await page.waitForTimeout(250);
      }
    } else {
      // Fallback: inject into cart through page JS if structure differs
      await page.evaluate(() => {
        try {
          if (window.RS && Array.isArray(RS.MENU) && RS.MENU[0] && typeof RS.addToCart === 'function') {
            RS.addToCart(RS.MENU[0]);
            if (RS.MENU[1]) {RS.addToCart(RS.MENU[1]);}
          }
        } catch (_) {}
      });
    }
  } catch (_) {}
}

async function login(page) {
  await page.goto(BASE + '/login.html', { waitUntil: 'domcontentloaded', timeout: 90000 });
  await page.waitForTimeout(1000);
  const loginTab = page.locator('#tab-login-btn');
  if (await loginTab.isVisible().catch(() => false)) {await loginTab.click().catch(() => {});}
  await page.fill('#tenant-id', CREDS.outlet);
  await page.fill('#username', CREDS.user);
  await page.fill('#password', CREDS.pass);
  await page.click('#login-submit');
  await page.waitForURL(/dashboard/, { timeout: 90000 }).catch(() => {});
  await page.waitForSelector('.sidebar, #pos-tab', { timeout: 90000 });
  await page.waitForTimeout(2500);
  await dismissOverlays(page);
  await dismissOverlays(page);
  // Soft dismiss license lock if soft-path didn't — wait for lease
  for (let i = 0; i < 8; i++) {
    const lock = page.locator('#rs-license-lock');
    if (!(await lock.isVisible().catch(() => false))) {break;}
    const retry = page.locator('#rs-license-retry');
    if (await retry.isVisible().catch(() => false)) {await retry.click().catch(() => {});}
    await page.waitForTimeout(1500);
  }
  console.log('Logged in', page.url());
}

async function captureStep(browser, page, s, index, total) {
  const file = path.join(SHOTS, s.id + '.png');
  process.stdout.write(`[${index + 1}/${total}] ${s.id} … `);

  // Resume: keep good existing viewport shots (skip re-capture)
  if (process.env.RS_RESUME === '1' && fs.existsSync(file)) {
    try {
      const st = fs.statSync(file);
      if (st.size > 8000) {
        console.log('SKIP (exists)');
        return true;
      }
    } catch (_) {}
  }

  try {
    // IMPORTANT: never fullPage:true on long marketing/dashboard pages —
    // that produces a tall strip that shrinks to a thin ribbon in the PDF.
    // Capture the *viewport* (what a desktop user sees on one screen).
    async function shotViewport() {
      await page.evaluate(() => {
        try {
          window.scrollTo(0, 0);
          const app = document.getElementById('app');
          if (app) {app.scrollTop = 0;}
          document.querySelectorAll('.main, .tab-content.active, .pos-wrap').forEach((el) => {
            try {
              el.scrollTop = 0;
            } catch (_) {}
          });
        } catch (_) {}
      });
      await page.waitForTimeout(150);
      await page.screenshot({ path: file, fullPage: false, type: 'png' });
    }

    if (s.where === 'google') {
      // Captcha-free mock of “what you see when you search” (real Google blocks bots)
      const mock = path.join(OUT_DIR, 'mock-google-search.html');
      await page.goto('file:///' + mock.replace(/\\/g, '/'), {
        waitUntil: 'domcontentloaded',
        timeout: 30000,
      });
      await page.waitForTimeout(400);
      await shotViewport();
      console.log('OK (mock search — no captcha)');
      return true;
    }

    if (s.where === 'marketing') {
      await page.goto(BASE + '/', { waitUntil: 'domcontentloaded', timeout: 60000 });
      await page.waitForTimeout(2000);
      await page.evaluate(() => window.scrollTo(0, 0));
      if (s.highlight) {await highlight(page, s.highlight);}
      await shotViewport();
      await clearHighlight(page);
      console.log('OK');
      return true;
    }

    if (s.where === 'login' || s.where === 'register') {
      await page.goto(BASE + '/login.html', { waitUntil: 'domcontentloaded', timeout: 60000 });
      await page.waitForTimeout(1200);
      if (s.where === 'register') {
        const reg = page.locator('#tab-register-btn');
        if (await reg.isVisible().catch(() => false)) {await reg.click();}
        await page.waitForTimeout(600);
      } else {
        const log = page.locator('#tab-login-btn');
        if (await log.isVisible().catch(() => false)) {await log.click();}
        await page.waitForTimeout(400);
        await page.fill('#tenant-id', CREDS.outlet).catch(() => {});
        await page.fill('#username', CREDS.user).catch(() => {});
      }
      if (s.highlight) {await highlight(page, s.highlight);}
      await shotViewport();
      await clearHighlight(page);
      console.log('OK');
      return true;
    }

    // dashboard steps — ensure logged in
    if (!page.url().includes('dashboard')) {
      await login(page);
    }
    if (s.prep !== 'openShiftUi' && s.prep !== 'openFloorQrPrint') {
      await dismissOverlays(page);
    }
    if (s.seed) {await runSeed(page, s.seed);}
    if (s.seed === 'ensureCartItems') {await seedCartViaUi(page);}
    if (s.tab) {await openDashboardTab(page, s.tab, s.settingsPanel);}
    await page.waitForTimeout(500);
    await applyStepUi(page, s);
    const keepModal =
      s.prep &&
      /open|Shift|Qr|Recover|Help|Kitchen|More|Checkout|Split|Customer|Edit/i.test(s.prep);
    if (!keepModal && !s.growthTile) {await dismissOverlays(page);}
    if (s.highlight) {await highlight(page, s.highlight);}
    await shotViewport();
    await clearHighlight(page);
    if (s.prep || s.growthTile) {
      await page.keyboard.press('Escape').catch(() => {});
      await page.waitForTimeout(150);
      await page.keyboard.press('Escape').catch(() => {});
    }
    console.log('OK');
    return true;
  } catch (e) {
    console.log('FAIL', e.message);
    try {
      await page.screenshot({ path: file, fullPage: false });
    } catch (_) {}
    return false;
  }
}

function buildHtml() {
  const logo = toDataUri(path.join(ROOT, 'assets', 'restrosuite-mark.png'));
  const pages = [];

  // Cover
  pages.push(`
  <section class="page cover">
    <div class="top">
      <div class="brand">${logo ? `<img src="${logo}" alt="">` : ''}<div><b>CodeArc RestroSuite</b><div class="sub">Complete Client Onboarding Guide · Desktop / Web</div></div></div>
      <div class="pill">Every button explained · New user edition</div>
    </div>
    <div class="mid">
      <h1>From Google search<br>to your first full day<br>on the counter.</h1>
      <p>Fully detailed guide for new owners and staff: <b>what each control is for</b>, <b>what happens when you click</b>, and <b>which screen comes next</b>. Large uncropped screenshots with orange highlights. Support: <b>support@codearc.co.in</b>.</p>
      <div class="meta">
        <div><b>Audience</b><span>New restaurant clients &amp; staff</span></div>
        <div><b>Support</b><span>${SUPPORT}</span></div>
        <div><b>Live site</b><span>restrosuite.codearc.co.in</span></div>
      </div>
    </div>
    <div class="bot">No Super-Admin. Client outlet only. · ${new Date().toISOString().slice(0, 10)}</div>
  </section>`);

  // How to use this book
  pages.push(`
  <section class="page text-page">
    <header class="ph"><div class="bm">${logo ? `<img src="${logo}" alt="">` : ''}Onboarding</div><div class="pn">How to use</div></header>
    <h2>How to use this guide</h2>
    <ol class="big-ol">
      <li><b>One step per page</b> — large screenshot of the real product, with the important button outlined in orange.</li>
      <li><b>Read the goal</b> — why this screen exists.</li>
      <li><b>Follow the numbered actions</b> on a computer, tablet, or phone browser (or Android / Windows app).</li>
      <li><b>Do not skip Settings tax + Menu GST</b> before live sales.</li>
      <li><b>Stuck?</b> Email ${SUPPORT} with your Outlet ID and the step number (e.g. Step 10).</li>
    </ol>
    <div class="callout">
      <b>Demo login used for screenshots</b><br>
      Outlet ID example: your workspace code · Staff get their own usernames under Employees.
    </div>
    <h3>Phases in this book</h3>
    <ul class="phase-list">
      <li>1 Find RestroSuite online</li>
      <li>2 Register &amp; sign in</li>
      <li>3 Workspace shell</li>
      <li>4–9 Sell, floor, QR, kitchen, bills</li>
      <li>10–16 Stock, menu, team, CRM, tax, reports, growth</li>
      <li>17 Settings (profile, tax toggles, print, WhatsApp)</li>
      <li>18–19 End of day &amp; support</li>
    </ul>
    <footer class="pf"><span>CodeArc RestroSuite</span><span>${SUPPORT}</span></footer>
  </section>`);

  STEPS.forEach((s, i) => {
    const imgPath = path.join(SHOTS, s.id + '.png');
    const uri = toDataUri(imgPath);
    const n = String(i + 1).padStart(2, '0');
    const controls = DETAIL[s.id] || [];

    // Page A — full uncropped screenshot
    pages.push(`
  <section class="page shot-only-page">
    <header class="ph">
      <div class="bm">${logo ? `<img src="${logo}" alt="">` : ''}<span>${esc(s.phase)}</span></div>
      <div class="pn">Step ${n} · Screen</div>
    </header>
    <h2 class="shot-title">${esc(s.title)}</h2>
    ${s.goal ? `<p class="shot-goal"><b>Goal:</b> ${esc(s.goal)}</p>` : ''}
    ${
      uri
        ? `<figure class="fullshot-wide"><img src="${uri}" alt="${esc(s.title)}"><figcaption>Desktop web view (1440×900) · orange outline = focus control</figcaption></figure>`
        : '<div class="fullshot-wide empty">Screenshot missing — open live site and follow the detail page for this step.</div>'
    }
    <footer class="pf"><span>Step ${n} of ${STEPS.length} · Screen</span><span>${SUPPORT}</span></footer>
  </section>`);

    // Page B — every button explained
    pages.push(`
  <section class="page detail-page">
    <header class="ph">
      <div class="bm">${logo ? `<img src="${logo}" alt="">` : ''}<span>${esc(s.phase)}</span></div>
      <div class="pn">Step ${n} · Controls</div>
    </header>
    <h2>${esc(s.title)} — what every control does</h2>
    <p class="detail-note"><b>Rule:</b> Every visible button, toggle, field, and chip on this screen is listed below — what it is for, what happens when you use it, and what screen/state comes next. If you can see it, it is covered.</p>
    ${s.goal ? `<p class="goal"><b>Why this screen exists:</b> ${esc(s.goal)}</p>` : ''}
    <h3>Walkthrough (do this in order)</h3>
    <ol class="actions">
      ${(s.actions || []).map((a) => `<li>${esc(a)}</li>`).join('')}
    </ol>
    ${
      controls.length
        ? `<h3>Control reference — button · why · what it does · next screen</h3>
    <table class="ctrl">
      <thead><tr><th>Control / button</th><th>Why it is here</th><th>What happens when you use it</th><th>Where you go next</th></tr></thead>
      <tbody>
        ${controls
          .map(
            (c) =>
              `<tr><td><b>${esc(c.btn)}</b></td><td>${esc(c.why)}</td><td>${esc(c.does)}</td><td>${esc(c.next)}</td></tr>`
          )
          .join('')}
      </tbody>
    </table>`
        : ''
    }
    ${
      (s.tips || []).length
        ? `<div class="tips"><b>Tips &amp; warnings</b><ul>${s.tips.map((t) => `<li>${esc(t)}</li>`).join('')}</ul></div>`
        : ''
    }
    <footer class="pf"><span>Step ${n} of ${STEPS.length} · Controls</span><span>${SUPPORT}</span></footer>
  </section>`);
  });

  // Final checklist
  pages.push(`
  <section class="page text-page">
    <header class="ph"><div class="bm">${logo ? `<img src="${logo}" alt="">` : ''}Onboarding</div><div class="pn">Done</div></header>
    <h2>You are ready when…</h2>
    <ul class="check">
      <li>☐ Outlet registered and owner can sign in</li>
      <li>☐ Menu items published with correct prices &amp; GST slabs</li>
      <li>☐ Calculate taxes ON (if GST registered) in Settings</li>
      <li>☐ At least one staff login with limited tabs</li>
      <li>☐ One full POS sale: cart → pay → print / WhatsApp</li>
      <li>☐ One table QR printed and guest order accepted</li>
      <li>☐ Kitchen can mark a ticket ready</li>
      <li>☐ Reports Today matches a test sale</li>
      <li>☐ Shift open/close practiced once</li>
      <li>☐ Support email saved: ${SUPPORT}</li>
    </ul>
    <div class="cta">
      <div class="big">Need help?</div>
      <p><b>${SUPPORT}</b><br>Include Outlet ID · step number · version chip from the top bar.</p>
      <p class="site">${SITE}</p>
    </div>
    <footer class="pf"><span>CodeArc RestroSuite · Complete Onboarding</span><span>${SUPPORT}</span></footer>
  </section>`);

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8"/>
<title>RestroSuite Complete Client Onboarding Guide</title>
<style>
  @page { size: A4 landscape; margin: 0; }
  * { box-sizing: border-box; margin: 0; padding: 0; }
  html, body {
    font-family: "Segoe UI", system-ui, sans-serif;
    color: #1a1917;
    background: #fff;
    -webkit-print-color-adjust: exact;
    print-color-adjust: exact;
  }
  .page {
    width: 297mm;
    height: 210mm;
    page-break-after: always;
    break-after: page;
    position: relative;
    overflow: hidden;
    background: #FFFEFB;
  }
  .page:last-child { page-break-after: auto; }
  .cover {
    background: linear-gradient(155deg, #1A1714 0%, #2c241c 50%, #1A1714 100%);
    color: #fff;
    padding: 16mm 18mm;
    display: flex;
    flex-direction: column;
    justify-content: space-between;
  }
  .cover .brand { display: flex; align-items: center; gap: 12px; }
  .cover .brand img { width: 44px; height: 44px; border-radius: 10px; }
  .cover .sub { font-size: 12px; opacity: .65; margin-top: 2px; }
  .cover .pill {
    font-size: 11px; font-weight: 700; letter-spacing: .06em; text-transform: uppercase;
    padding: 7px 14px; border-radius: 999px; border: 1px solid rgba(255,79,0,.45);
    background: rgba(255,79,0,.18); color: #ffb48a;
  }
  .cover .top { display: flex; justify-content: space-between; align-items: center; }
  .cover h1 { font-size: 36px; line-height: 1.12; letter-spacing: -.03em; margin: 20px 0 14px; max-width: 85%; }
  .cover .mid p { font-size: 14.5px; line-height: 1.55; color: rgba(255,255,255,.78); max-width: 520px; }
  .cover .meta { display: flex; gap: 14px; margin-top: 22px; }
  .cover .meta div {
    background: rgba(255,255,255,.06); border: 1px solid rgba(255,255,255,.1);
    border-radius: 12px; padding: 12px 14px; min-width: 140px;
  }
  .cover .meta b { display: block; color: #FF4F00; font-size: 11px; margin-bottom: 4px; }
  .cover .meta span { font-size: 12.5px; color: rgba(255,255,255,.8); }
  .cover .bot { font-size: 11px; color: rgba(255,255,255,.45); border-top: 1px solid rgba(255,255,255,.1); padding-top: 10px; }

  .ph {
    display: flex; justify-content: space-between; align-items: center;
    padding: 8mm 10mm 3mm; border-bottom: 1px solid #ebe6dc; margin-bottom: 0;
  }
  .bm { display: flex; align-items: center; gap: 8px; font-size: 11px; font-weight: 700; color: #6b6660; }
  .bm img { width: 18px; height: 18px; border-radius: 4px; }
  .pn {
    background: #FF4F00; color: #fff; font-size: 11px; font-weight: 800;
    padding: 5px 10px; border-radius: 8px;
  }
  .pf {
    position: absolute; left: 10mm; right: 10mm; bottom: 6mm;
    display: flex; justify-content: space-between; font-size: 10px; color: #9a958c;
    border-top: 1px solid #eeeae2; padding-top: 2.5mm;
  }

  .text-page { padding: 0 0 14mm; }
  .text-page h2 { font-size: 26px; margin: 8mm 12mm 4mm; letter-spacing: -.02em; }
  .text-page h3 { font-size: 14px; margin: 4mm 12mm 2mm; color: #FF4F00; }
  .big-ol { margin: 0 14mm; padding-left: 18px; }
  .big-ol li { font-size: 13.5px; line-height: 1.5; margin: 8px 0; color: #2c2925; }
  .callout {
    margin: 6mm 12mm; padding: 12px 14px; background: #fff8f4; border: 1px solid #ffd0b8;
    border-radius: 12px; font-size: 12.5px; line-height: 1.45;
  }
  .phase-list { margin: 2mm 14mm; columns: 2; font-size: 12.5px; line-height: 1.7; }
  .check { list-style: none; margin: 4mm 14mm; font-size: 14px; line-height: 1.85; }
  .cta {
    margin: 8mm 12mm; padding: 16px 18px; background: #1A1714; color: #fff; border-radius: 14px;
  }
  .cta .big { font-size: 20px; font-weight: 800; margin-bottom: 6px; }
  .cta p { font-size: 13.5px; color: rgba(255,255,255,.8); line-height: 1.5; }
  .cta .site { color: #FF4F00; font-weight: 700; margin-top: 8px; }

  /* Desktop screenshot page — wide 16:10 viewport fills landscape width */
  .shot-only-page { padding-bottom: 8mm; }
  .shot-title { font-size: 16px; margin: 2mm 10mm 1mm; letter-spacing: -.02em; }
  .shot-goal { font-size: 11px; margin: 0 10mm 2mm; color: #4a4640; line-height: 1.35; }
  .fullshot-wide {
    margin: 0 8mm;
    border-radius: 10px;
    overflow: hidden;
    border: 1px solid #e0dbd0;
    background: #0f0e0d;
    /* Let image set height from width (desktop 16:10) — never center a tall strip */
    display: block;
  }
  .fullshot-wide img {
    width: 100%;
    height: auto;
    max-height: 148mm;
    object-fit: contain;
    object-position: top center;
    display: block;
    background: #0f0e0d;
  }
  .fullshot-wide figcaption {
    font-size: 10px; color: #7a756c; padding: 4px 10px; background: #faf8f4;
    border-top: 1px solid #eeeae2;
  }
  .fullshot-wide.empty {
    display: grid; place-items: center; color: #999; font-size: 13px; padding: 40px 20px; text-align: center;
    min-height: 80mm;
  }

  .detail-page { padding: 0 10mm 14mm; }
  .detail-page h2 { font-size: 18px; margin: 4mm 0 2mm; letter-spacing: -.02em; }
  .detail-page h3 {
    font-size: 11px; font-weight: 800; letter-spacing: .05em; text-transform: uppercase;
    color: #FF4F00; margin: 4mm 0 2mm;
  }
  .goal { font-size: 12px; line-height: 1.45; color: #4a4640; margin-bottom: 3mm; }
  .actions { margin: 0 0 0 16px; }
  .actions li { font-size: 11.5px; line-height: 1.4; margin: 3px 0; color: #2c2925; }
  .ctrl {
    width: 100%; border-collapse: collapse; font-size: 9.5px; margin-top: 2mm;
  }
  .ctrl th {
    background: #1A1714; color: #fff; text-align: left; padding: 5px 6px; font-size: 9px;
  }
  .ctrl td {
    border: 1px solid #e8e4db; padding: 4px 6px; vertical-align: top; line-height: 1.3; color: #2c2925;
  }
  .detail-page { overflow: visible; height: auto; min-height: 210mm; }
  .detail-note {
    margin: 2mm 0 3mm; padding: 6px 10px; background: #fff8f4; border-left: 3px solid #FF4F00;
    font-size: 10.5px; color: #4a4640; line-height: 1.4;
  }
  .ctrl tr:nth-child(even) td { background: #faf8f4; }
  .ctrl td:first-child { width: 22%; background: #fff8f4; }
  .tips {
    margin-top: 4mm; padding: 8px 10px; background: #f7f4ed; border-radius: 10px;
    border: 1px solid #e8e4db; font-size: 11px; color: #4a4640;
  }
  .tips ul { margin: 4px 0 0 14px; }
  .tips li { margin: 3px 0; }
</style>
</head>
<body>
${pages.join('\n')}
</body>
</html>`;
}

function esc(s) {
  return String(s == null ? '' : s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

async function writePdf(html) {
  fs.writeFileSync(HTML_PATH, html, 'utf8');
  console.log('HTML', HTML_PATH);
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  await page.goto('file:///' + HTML_PATH.replace(/\\/g, '/'), {
    waitUntil: 'networkidle',
    timeout: 120000,
  });
  await page.waitForTimeout(1000);
  let out = PDF_PATH;
  try {
    await page.pdf({
      path: PDF_PATH,
      printBackground: true,
      preferCSSPageSize: true,
      landscape: true,
      format: 'A4',
      margin: { top: '0', right: '0', bottom: '0', left: '0' },
    });
  } catch (e) {
    if (e && (e.code === 'EBUSY' || /busy|locked/i.test(String(e.message)))) {
      out = PDF_ALT;
      await page.pdf({
        path: PDF_ALT,
        printBackground: true,
        preferCSSPageSize: true,
        landscape: true,
        format: 'A4',
        margin: { top: '0', right: '0', bottom: '0', left: '0' },
      });
      console.warn('Wrote alternate PDF (file locked):', PDF_ALT);
    } else {throw e;}
  }
  await browser.close();
  console.log('PDF', out, ((fs.statSync(out).size / 1024 / 1024).toFixed(2)) + ' MB');
  return out;
}

async function main() {
  ensureDirs();
  fs.writeFileSync(MANIFEST, JSON.stringify(STEPS, null, 2));
  console.log('=== Complete Onboarding Guide (Desktop / Web) ===');
  console.log('Steps:', STEPS.length);
  console.log('Base:', BASE);

  const skip = process.env.RS_SKIP_CAPTURE === '1';
  if (!skip) {
    const browser = await chromium.launch({
      headless: true,
      args: ['--disable-dev-shm-usage'],
    });
    const context = await browser.newContext({
      viewport: { width: 1440, height: 900 },
      deviceScaleFactor: 1.25,
      userAgent:
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120 Safari/537.36',
    });
    const page = await context.newPage();
    page.setDefaultTimeout(45000);

    const dashPage = page;
    try {
      await login(dashPage);
    } catch (e) {
      console.warn('Login warn:', e.message);
    }

    for (let i = 0; i < STEPS.length; i++) {
      const s = STEPS[i];
      if (s.where === 'google' || s.where === 'marketing' || s.where === 'login' || s.where === 'register') {
        const p = await context.newPage();
        await p.setViewportSize({ width: 1440, height: 900 });
        await captureStep(browser, p, s, i, STEPS.length);
        await p.close();
      } else {
        await captureStep(browser, dashPage, s, i, STEPS.length);
      }
    }

    await browser.close().catch(() => {});
  } else {
    console.log('RS_SKIP_CAPTURE=1 — reusing existing shots in', SHOTS);
  }

  const html = buildHtml();
  await writePdf(html);
  console.log('\nDone. Open:');
  console.log(PDF_PATH);
  try {
    require('child_process').execFileSync(process.execPath, [path.join(__dirname, 'sync-downloads.cjs')], {
      stdio: 'inherit',
    });
  } catch (e) {
    console.warn('sync-downloads skipped:', e && e.message);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
