/**
 * RestroSuite — Full Product Feature PDF generator
 * Logs into demo outlet (bbb), captures client feature screenshots,
 * builds a polished multi-page brochure PDF (no Super-Admin features).
 */
'use strict';

const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright');

const ROOT = path.resolve(__dirname, '..');
const OUT_DIR = path.join(ROOT, 'docs', 'product-pdf');
const SHOTS = path.join(OUT_DIR, 'shots');
const PDF_PATH = path.join(ROOT, 'docs', 'RestroSuite-Product-Features-Guide.pdf');
const PDF_PATH_ALT = path.join(ROOT, 'docs', 'RestroSuite-Product-Features-Guide-v2.pdf');
const HTML_PATH = path.join(OUT_DIR, 'brochure.html');

const BASE = process.env.RS_BASE || 'https://restrosuite.codearc.co.in';
const CREDS = {
  outlet: process.env.RS_OUTLET || 'bbb',
  user: process.env.RS_USER || 'bbb',
  pass: process.env.RS_PASS || 'Harry@1234',
};

// Client-facing tabs only — NO superadmin / gateway
const TABS = [
  { id: 'pos-tab', file: '01-pos.png', title: 'Point of Sale' },
  { id: 'floor-tab', file: '02-floor.png', title: 'Floor & Tables' },
  { id: 'qr-orders-tab', file: '03-qr-orders.png', title: 'QR Orders' },
  { id: 'kds-tab', file: '04-kds.png', title: 'Kitchen Display' },
  { id: 'aggregator-tab', file: '05-online-orders.png', title: 'Online Orders' },
  { id: 'bills-tab', file: '06-bills.png', title: 'Bills History' },
  { id: 'inventory-tab', file: '07-inventory.png', title: 'Inventory' },
  { id: 'editor-tab', file: '08-menu-editor.png', title: 'Menu Editor' },
  { id: 'employees-tab', file: '09-employees.png', title: 'Employees' },
  { id: 'customers-tab', file: '10-customers.png', title: 'Customers & CRM' },
  { id: 'tax-tab', file: '11-tax.png', title: 'Tax & GST' },
  { id: 'reports-tab', file: '12-reports.png', title: 'Reports' },
  { id: 'analytics-tab', file: '13-analytics.png', title: 'Analytics' },
  { id: 'growth-hub-tab', file: '14-growth-hub.png', title: 'Growth Hub' },
  { id: 'settings-tab', file: '15-settings.png', title: 'Settings' },
];

function ensureDirs() {
  fs.mkdirSync(SHOTS, { recursive: true });
}

function toDataUri(filePath) {
  if (!fs.existsSync(filePath)) return '';
  const buf = fs.readFileSync(filePath);
  const ext = path.extname(filePath).toLowerCase();
  const mime = ext === '.jpg' || ext === '.jpeg' ? 'image/jpeg' : 'image/png';
  return `data:${mime};base64,${buf.toString('base64')}`;
}

async function dismissOverlays(page) {
  // Close common modals / tours / toasts that block shots
  const selectors = [
    'button[aria-label="Close"]',
    '.modal-close',
    '.rs-modal-close',
    '#tour-skip-btn',
    '#tour-close-btn',
    '.product-guide-backdrop .close',
    'button:has-text("Skip")',
    'button:has-text("Got it")',
    'button:has-text("Later")',
    'button:has-text("Not now")',
    '[data-dismiss="modal"]',
  ];
  for (const sel of selectors) {
    try {
      const el = page.locator(sel).first();
      if (await el.isVisible({ timeout: 400 }).catch(() => false)) {
        await el.click({ timeout: 800 }).catch(() => {});
        await page.waitForTimeout(200);
      }
    } catch (_) {}
  }
  // Escape key as last resort
  await page.keyboard.press('Escape').catch(() => {});
  await page.waitForTimeout(150);
}

async function login(page) {
  const loginUrl = `${BASE}/login.html`;
  console.log('Opening', loginUrl);
  await page.goto(loginUrl, { waitUntil: 'domcontentloaded', timeout: 90000 });
  await page.waitForTimeout(1200);

  // Prefer login tab
  const loginTab = page.locator('#tab-login-btn');
  if (await loginTab.isVisible().catch(() => false)) {
    await loginTab.click().catch(() => {});
  }

  await page.fill('#tenant-id', CREDS.outlet);
  await page.fill('#username', CREDS.user);
  await page.fill('#password', CREDS.pass);
  await page.click('#login-submit');

  // Wait for dashboard
  await page.waitForURL(/dashboard\.html/, { timeout: 90000 }).catch(() => {});
  await page.waitForSelector('.sidebar, #pos-tab, .sidebar-link', { timeout: 90000 });
  await page.waitForTimeout(2500);
  await dismissOverlays(page);
  await dismissOverlays(page);
  console.log('Logged in →', page.url());
}

async function openTab(page, tabId) {
  // Settings opens from footer gear (#open-settings), not a normal sidebar data-tab
  if (tabId === 'settings-tab') {
    const gear = page.locator('#open-settings, .sb-foot-btn:has-text("Settings"), button:has-text("Settings")').first();
    if (await gear.count()) {
      await gear.click({ timeout: 5000 }).catch(() => {});
    } else {
      await page.evaluate(() => {
        try {
          const btn = document.getElementById('open-settings');
          if (btn) btn.click();
          else if (window.RS && typeof RS.switchTab === 'function') RS.switchTab('settings-tab');
        } catch (e) {}
      });
    }
    await page.waitForTimeout(1800);
    // Prefer Taxes & pricing sub-panel so the shot is content-rich
    const taxNav = page.locator('.set-nav button[data-s="tax"], [data-s="tax"], button:has-text("Taxes")').first();
    if (await taxNav.isVisible({ timeout: 1500 }).catch(() => false)) {
      await taxNav.click().catch(() => {});
      await page.waitForTimeout(600);
    }
    await dismissOverlays(page);
    return;
  }

  // Standard sidebar tabs
  const link = page.locator(`.sidebar-link[data-tab="${tabId}"]`).first();
  if (await link.count() && (await link.isVisible().catch(() => false))) {
    await link.click({ timeout: 5000 }).catch(() => {});
  } else {
    await page.evaluate((id) => {
      try {
        if (window.RS && typeof RS.switchTab === 'function') {
          RS.switchTab(id);
          return;
        }
        const a = document.querySelector(`.sidebar-link[data-tab="${id}"]`);
        if (a) a.click();
        else {
          document.querySelectorAll('.tab-content').forEach((el) => {
            el.classList.remove('active');
            el.style.display = 'none';
          });
          const t = document.getElementById(id);
          if (t) {
            t.classList.add('active');
            t.style.display = 'block';
          }
        }
      } catch (e) {
        console.warn(e);
      }
    }, tabId);
  }
  await page.waitForTimeout(1400);
  await dismissOverlays(page);
}

async function captureScreens(page) {
  const results = [];
  for (const tab of TABS) {
    process.stdout.write(`  Shot: ${tab.title}… `);
    try {
      await openTab(page, tab.id);
      await page.waitForTimeout(600);
      const dest = path.join(SHOTS, tab.file);
      await page.screenshot({
        path: dest,
        fullPage: false,
        type: 'png',
      });
      const ok = fs.existsSync(dest) && fs.statSync(dest).size > 5000;
      console.log(ok ? 'OK' : 'WEAK');
      results.push({ ...tab, ok, path: dest });
    } catch (e) {
      console.log('FAIL', e.message);
      results.push({ ...tab, ok: false, path: path.join(SHOTS, tab.file), err: e.message });
    }
  }

  // Bonus: homepage marketing shot if reachable
  try {
    const home = await page.context().newPage();
    await home.setViewportSize({ width: 1440, height: 900 });
    await home.goto(`${BASE}/`, { waitUntil: 'domcontentloaded', timeout: 60000 });
    await home.waitForTimeout(2000);
    await home.screenshot({ path: path.join(SHOTS, '00-homepage.png'), fullPage: false });
    await home.close();
    console.log('  Shot: Homepage… OK');
  } catch (e) {
    console.log('  Shot: Homepage… skip', e.message);
  }

  return results;
}

function buildHtml(shots) {
  const logoPath = path.join(ROOT, 'assets', 'restrosuite-mark.png');
  const logo = toDataUri(logoPath);
  const social = toDataUri(path.join(ROOT, 'assets', 'restrosuite-social.png'));
  const heroPos = toDataUri(path.join(ROOT, 'assets', 'screenshot-pos.png')) ||
    toDataUri(path.join(SHOTS, '01-pos.png'));
  const heroCart = toDataUri(path.join(ROOT, 'assets', 'screenshot-cart.png'));

  const shot = (file) => {
    const p = path.join(SHOTS, file);
    return toDataUri(p);
  };

  const img = (src, alt, cls = 'shot') =>
    src
      ? `<figure class="${cls}"><img src="${src}" alt="${alt}" /><figcaption>${alt}</figcaption></figure>`
      : '';

  const featurePage = (opts) => {
    const {
      num,
      eyebrow,
      title,
      lead,
      bullets = [],
      how = [],
      image,
      imageAlt,
      tips = [],
      badge,
    } = opts;
    return `
    <section class="page feature-page">
      <header class="page-head">
        <div class="brand-mini">
          ${logo ? `<img src="${logo}" alt="" />` : ''}
          <span>RestroSuite · Feature Guide</span>
        </div>
        <div class="page-num">${num}</div>
      </header>
      <div class="feature-layout">
        <div class="feature-copy">
          <div class="eyebrow-row">
            <span class="eyebrow">${eyebrow}</span>
            ${badge ? `<span class="badge">${badge}</span>` : ''}
          </div>
          <h2>${title}</h2>
          <p class="lead">${lead}</p>
          ${
            bullets.length
              ? `<ul class="bullets">${bullets.map((b) => `<li>${b}</li>`).join('')}</ul>`
              : ''
          }
          ${
            how.length
              ? `<div class="how-box"><h4>How to use it</h4><ol>${how
                  .map((h) => `<li>${h}</li>`)
                  .join('')}</ol></div>`
              : ''
          }
          ${
            tips.length
              ? `<div class="tips"><strong>Pro tips</strong><ul>${tips
                  .map((t) => `<li>${t}</li>`)
                  .join('')}</ul></div>`
              : ''
          }
        </div>
        <div class="feature-visual">
          ${image ? img(image, imageAlt || title, 'shot tall') : '<div class="shot-placeholder">Live screenshot</div>'}
        </div>
      </div>
      <footer class="page-foot">
        <span>CodeArc RestroSuite · Client features</span>
        <span>support@codearc.co.in</span>
      </footer>
    </section>`;
  };

  const tocItems = [
    ['01', 'Product introduction'],
    ['02', 'Why RestroSuite'],
    ['03', 'Platforms & access'],
    ['04', 'Point of Sale'],
    ['05', 'Floor & Tables'],
    ['06', 'QR Table Ordering'],
    ['07', 'Kitchen Display (KDS)'],
    ['08', 'Online Orders'],
    ['09', 'Bills & receipts'],
    ['10', 'WhatsApp invoices'],
    ['11', 'Inventory & recipes'],
    ['12', 'Menu Editor'],
    ['13', 'Employees & roles'],
    ['14', 'Customers, CRM & dues'],
    ['15', 'Tax, GST & reports'],
    ['16', 'Analytics'],
    ['17', 'Analytics'],
    ['18', 'Growth Hub toolkit'],
    ['19', 'Settings — tax, print & profile'],
    ['20', 'Settings deep dive + offline shifts'],
    ['21', 'Getting started & pilot'],
  ];

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8" />
<title>RestroSuite — Complete Product Features Guide</title>
<style>
  @page { size: A4; margin: 0; }
  * { box-sizing: border-box; margin: 0; padding: 0; }
  html, body {
    font-family: "Segoe UI", system-ui, -apple-system, sans-serif;
    color: #1a1917;
    background: #fff;
    -webkit-print-color-adjust: exact;
    print-color-adjust: exact;
  }
  .page {
    width: 210mm;
    min-height: 297mm;
    height: 297mm;
    padding: 14mm 16mm 16mm;
    position: relative;
    overflow: hidden;
    page-break-after: always;
    break-after: page;
    background: #FFFEFB;
  }
  .page:last-child { page-break-after: auto; break-after: auto; }

  /* Cover */
  .cover {
    background:
      radial-gradient(ellipse 80% 55% at 85% 15%, rgba(255,79,0,.18), transparent 55%),
      radial-gradient(ellipse 60% 40% at 10% 90%, rgba(42,107,90,.12), transparent 50%),
      linear-gradient(165deg, #1A1714 0%, #2a231c 48%, #1A1714 100%);
    color: #fff;
    display: flex;
    flex-direction: column;
    justify-content: space-between;
    padding: 18mm 18mm 16mm;
  }
  .cover-top { display: flex; align-items: center; justify-content: space-between; }
  .cover-brand { display: flex; align-items: center; gap: 12px; }
  .cover-brand img { width: 48px; height: 48px; border-radius: 12px; }
  .cover-brand .name { font-size: 18px; font-weight: 700; letter-spacing: -.02em; }
  .cover-brand .name b { color: #FF4F00; }
  .cover-brand .sub { font-size: 11px; opacity: .65; margin-top: 2px; }
  .cover-pill {
    font-size: 11px; font-weight: 700; letter-spacing: .06em; text-transform: uppercase;
    padding: 7px 14px; border-radius: 999px; background: rgba(255,79,0,.2);
    border: 1px solid rgba(255,79,0,.45); color: #ffb48a;
  }
  .cover-hero { flex: 1; display: flex; flex-direction: column; justify-content: center; max-width: 92%; padding: 18mm 0 10mm; }
  .cover-hero h1 {
    font-size: 42px; line-height: 1.08; font-weight: 800; letter-spacing: -.03em;
    margin: 14px 0 16px;
  }
  .cover-hero h1 span { color: #FF4F00; }
  .cover-hero .dek {
    font-size: 15.5px; line-height: 1.55; color: rgba(255,255,255,.78); max-width: 460px;
  }
  .cover-meta {
    display: grid; grid-template-columns: repeat(3, 1fr); gap: 12px; margin-top: 28px; max-width: 520px;
  }
  .cover-meta .m {
    background: rgba(255,255,255,.06); border: 1px solid rgba(255,255,255,.1);
    border-radius: 12px; padding: 12px 14px;
  }
  .cover-meta .m b { display: block; font-size: 18px; color: #FF4F00; margin-bottom: 2px; }
  .cover-meta .m span { font-size: 11.5px; color: rgba(255,255,255,.65); }
  .cover-foot {
    display: flex; justify-content: space-between; align-items: flex-end;
    border-top: 1px solid rgba(255,255,255,.1); padding-top: 14px; font-size: 11.5px;
    color: rgba(255,255,255,.55);
  }
  .cover-shot {
    position: absolute; right: -8mm; bottom: 42mm; width: 92mm; opacity: .92;
    border-radius: 14px; box-shadow: 0 30px 60px rgba(0,0,0,.45);
    border: 1px solid rgba(255,255,255,.12); overflow: hidden;
    transform: rotate(-4deg);
  }
  .cover-shot img { width: 100%; display: block; }

  /* Shared */
  .page-head {
    display: flex; justify-content: space-between; align-items: center;
    margin-bottom: 10mm; padding-bottom: 3.5mm;
    border-bottom: 1px solid #e8e4db;
  }
  .brand-mini { display: flex; align-items: center; gap: 8px; font-size: 11px; color: #6b6660; font-weight: 600; }
  .brand-mini img { width: 20px; height: 20px; border-radius: 5px; }
  .page-num {
    width: 28px; height: 28px; border-radius: 8px; background: #FF4F00; color: #fff;
    font-size: 12px; font-weight: 800; display: grid; place-items: center;
  }
  .page-foot {
    position: absolute; left: 16mm; right: 16mm; bottom: 10mm;
    display: flex; justify-content: space-between; font-size: 10px; color: #9a958c;
    border-top: 1px solid #eeeae2; padding-top: 3mm;
  }
  .eyebrow {
    display: inline-block; font-size: 10.5px; font-weight: 800; letter-spacing: .08em;
    text-transform: uppercase; color: #FF4F00; margin-bottom: 6px;
  }
  .eyebrow-row { display: flex; align-items: center; gap: 8px; margin-bottom: 4px; }
  .badge {
    font-size: 10px; font-weight: 700; padding: 3px 8px; border-radius: 999px;
    background: #fff0e8; color: #c43a00; border: 1px solid #ffd0b8;
  }
  h2 { font-size: 26px; letter-spacing: -.02em; line-height: 1.15; margin-bottom: 8px; color: #1a1917; }
  h3 { font-size: 16px; margin: 14px 0 8px; color: #1a1917; }
  h4 { font-size: 12.5px; font-weight: 800; letter-spacing: .04em; text-transform: uppercase; color: #5a564f; margin-bottom: 6px; }
  .lead { font-size: 13.5px; line-height: 1.55; color: #4a4640; margin-bottom: 10px; }
  p { font-size: 12.5px; line-height: 1.55; color: #4a4640; }
  .bullets { list-style: none; margin: 8px 0 12px; }
  .bullets li {
    position: relative; padding: 5px 0 5px 18px; font-size: 12.2px; line-height: 1.45; color: #2c2925;
    border-bottom: 1px solid #f3efe7;
  }
  .bullets li::before {
    content: ""; position: absolute; left: 0; top: 11px; width: 8px; height: 8px;
    border-radius: 50%; background: #FF4F00;
  }
  .how-box {
    background: #f7f4ed; border: 1px solid #e8e4db; border-radius: 12px;
    padding: 10px 12px; margin-top: 8px;
  }
  .how-box ol { margin-left: 16px; }
  .how-box li { font-size: 11.8px; line-height: 1.45; color: #2c2925; margin: 4px 0; }
  .tips { margin-top: 10px; font-size: 11.5px; color: #5a564f; }
  .tips ul { margin: 4px 0 0 14px; }
  .tips li { margin: 3px 0; }

  .feature-layout { display: grid; grid-template-columns: 1fr 1.05fr; gap: 12mm; align-items: start; }
  .feature-visual { min-width: 0; }
  .shot {
    margin: 0; border-radius: 12px; overflow: hidden;
    border: 1px solid #e0dbd0; box-shadow: 0 12px 28px -16px rgba(20,18,16,.28);
    background: #f0ebe3;
  }
  .shot img { width: 100%; display: block; max-height: 195mm; object-fit: cover; object-position: top left; }
  .shot.tall img { max-height: 185mm; }
  .shot figcaption {
    font-size: 10px; color: #7a756c; padding: 6px 10px; background: #faf8f4;
    border-top: 1px solid #eeeae2;
  }
  .shot-placeholder {
    height: 160mm; border-radius: 12px; border: 1px dashed #ccc;
    display: grid; place-items: center; color: #999; background: #f7f4ed;
  }

  /* TOC */
  .toc-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 6px 18px; margin-top: 8mm; }
  .toc-item {
    display: flex; align-items: baseline; gap: 10px; padding: 8px 0;
    border-bottom: 1px solid #efebe3; font-size: 12.5px;
  }
  .toc-item .n {
    font-weight: 800; color: #FF4F00; font-size: 12px; min-width: 22px;
  }
  .toc-item .t { color: #1a1917; font-weight: 600; }
  .intro-grid {
    display: grid; grid-template-columns: 1.1fr .9fr; gap: 12mm; margin-top: 6mm;
  }
  .card-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; margin-top: 8px; }
  .card {
    background: #fff; border: 1px solid #e8e4db; border-radius: 12px; padding: 12px 14px;
  }
  .card .ic {
    width: 28px; height: 28px; border-radius: 8px; background: #fff0e8; color: #FF4F00;
    display: grid; place-items: center; font-size: 13px; font-weight: 800; margin-bottom: 8px;
  }
  .card h3 { font-size: 13.5px; margin: 0 0 4px; }
  .card p { font-size: 11.5px; color: #5a564f; margin: 0; }
  .compare-table { width: 100%; border-collapse: collapse; margin-top: 8mm; font-size: 11.5px; }
  .compare-table th, .compare-table td {
    border: 1px solid #e8e4db; padding: 8px 10px; text-align: left;
  }
  .compare-table th { background: #1A1714; color: #fff; font-size: 11px; }
  .compare-table th.rs { background: #FF4F00; }
  .compare-table td.rs { background: #fff8f4; font-weight: 700; color: #c43a00; }
  .compare-table tr:nth-child(even) td { background: #faf8f4; }
  .compare-table tr:nth-child(even) td.rs { background: #fff0e8; }

  .pill-row { display: flex; flex-wrap: wrap; gap: 6px; margin: 10px 0; }
  .pill {
    font-size: 11px; font-weight: 700; padding: 5px 10px; border-radius: 999px;
    background: #f3efe7; color: #3a3630; border: 1px solid #e0dbd0;
  }
  .pill.hot { background: #fff0e8; color: #c43a00; border-color: #ffd0b8; }
  .pill.ok { background: #e8f6f2; color: #0d6b57; border-color: #b8e6d8; }

  .two-col { display: grid; grid-template-columns: 1fr 1fr; gap: 12mm; margin-top: 6mm; }
  .panel {
    background: #f7f4ed; border: 1px solid #e8e4db; border-radius: 14px; padding: 14px 16px;
  }
  .panel h3 { margin-top: 0; font-size: 14px; }
  .panel ul { margin: 6px 0 0 16px; }
  .panel li { font-size: 12px; margin: 4px 0; color: #2c2925; }

  .cta-page {
    background:
      radial-gradient(ellipse 70% 50% at 50% 0%, rgba(255,79,0,.14), transparent 60%),
      #FFFEFB;
    display: flex; flex-direction: column;
  }
  .cta-box {
    margin-top: 10mm; background: #1A1714; color: #fff; border-radius: 18px;
    padding: 18mm 14mm; text-align: center;
  }
  .cta-box h2 { color: #fff; font-size: 28px; margin-bottom: 10px; }
  .cta-box p { color: rgba(255,255,255,.75); font-size: 14px; max-width: 420px; margin: 0 auto 16px; }
  .cta-price { font-size: 48px; font-weight: 800; color: #FF4F00; letter-spacing: -.03em; }
  .cta-price small { font-size: 14px; color: rgba(255,255,255,.55); font-weight: 600; }
  .steps-row { display: grid; grid-template-columns: repeat(4, 1fr); gap: 10px; margin-top: 12mm; }
  .step {
    border: 1px solid #e8e4db; border-radius: 12px; padding: 12px; background: #fff;
  }
  .step .n { color: #FF4F00; font-weight: 800; font-size: 18px; }
  .step h4 { margin: 6px 0 4px; text-transform: none; letter-spacing: 0; font-size: 12.5px; color: #1a1917; }
  .step p { font-size: 11px; color: #5a564f; }

  .hub-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; margin-top: 6px; }
  .hub-card {
    border: 1px solid #e8e4db; border-radius: 10px; padding: 10px 12px; background: #fff;
  }
  .hub-card h4 { margin: 0 0 3px; text-transform: none; letter-spacing: 0; font-size: 12.5px; color: #1a1917; }
  .hub-card p { font-size: 11px; margin: 0; color: #5a564f; }

  .full-shot-page .shot { margin-top: 4mm; }
  .full-shot-page .shot img { max-height: 200mm; object-fit: contain; background: #f0ebe3; }
</style>
</head>
<body>

<!-- COVER -->
<section class="page cover">
  <div class="cover-top">
    <div class="cover-brand">
      ${logo ? `<img src="${logo}" alt="RestroSuite" />` : ''}
      <div>
        <div class="name">CodeArc <b>RestroSuite</b></div>
        <div class="sub">Offline-first restaurant POS &amp; operations suite</div>
      </div>
    </div>
    <div class="cover-pill">Product Features Guide · 2026</div>
  </div>
  <div class="cover-hero">
    <div class="eyebrow" style="color:#ffb48a">Launch-ready product brochure</div>
    <h1>Every feature.<br/>One clear guide<br/>for <span>owners &amp; staff</span>.</h1>
    <p class="dek">
      Complete walkthrough of RestroSuite client features — POS billing, floor &amp; QR ordering,
      kitchen display, inventory, CRM, reports, WhatsApp receipts, and Growth Hub —
      with live product screenshots from a real outlet workspace.
    </p>
    <div class="cover-meta">
      <div class="m"><b>₹0</b><span>Free during launch</span></div>
      <div class="m"><b>15+</b><span>Integrated modules</span></div>
      <div class="m"><b>3</b><span>Platforms: Web · Android · Windows</span></div>
    </div>
  </div>
  ${
    shot('01-pos.png')
      ? `<div class="cover-shot"><img src="${shot('01-pos.png')}" alt="POS" /></div>`
      : heroPos
        ? `<div class="cover-shot"><img src="${heroPos}" alt="POS" /></div>`
        : ''
  }
  <div class="cover-foot">
    <div>
      <div>Prepared for restaurant demos &amp; onboarding</div>
      <div style="margin-top:4px">Client features only · Super-Admin excluded</div>
    </div>
    <div style="text-align:right">
      <div>restrosuite.codearc.co.in</div>
      <div style="margin-top:4px">Version 2.0.1 · July 2026</div>
    </div>
  </div>
</section>

<!-- TOC -->
<section class="page">
  <header class="page-head">
    <div class="brand-mini">${logo ? `<img src="${logo}" alt="" />` : ''}<span>RestroSuite · Feature Guide</span></div>
    <div class="page-num">01</div>
  </header>
  <span class="eyebrow">Contents</span>
  <h2>What’s inside this guide</h2>
  <p class="lead">Use this document to present RestroSuite to restaurant owners, train cashiers and captains, or hand over a full feature overview after pilot signup.</p>
  <div class="toc-grid">
    ${tocItems
      .map(
        ([n, t]) =>
          `<div class="toc-item"><span class="n">${n}</span><span class="t">${t}</span></div>`
      )
      .join('')}
  </div>
  <div class="panel" style="margin-top:12mm">
    <h3>Scope of this PDF</h3>
    <p style="margin-top:6px">
      Covers <strong>outlet / client workspace features</strong> only — what owners, managers, cashiers, waiters, and kitchen staff use every day.
      Platform Super-Admin consoles and internal gateway ops tooling are intentionally omitted.
    </p>
  </div>
  <footer class="page-foot"><span>CodeArc RestroSuite · Client features</span><span>restrosuite.codearc.co.in</span></footer>
</section>

<!-- INTRO -->
<section class="page">
  <header class="page-head">
    <div class="brand-mini">${logo ? `<img src="${logo}" alt="" />` : ''}<span>RestroSuite · Feature Guide</span></div>
    <div class="page-num">02</div>
  </header>
  <span class="eyebrow">Product introduction</span>
  <h2>What is RestroSuite?</h2>
  <p class="lead">
    RestroSuite is a modern, offline-first restaurant operating system built by CodeArc Tech Labs.
    It replaces a stack of expensive POS, KDS, QR ordering, inventory, and CRM tools with one fast suite
    that runs on the web, Android, and Windows — free during launch.
  </p>
  <div class="intro-grid">
    <div>
      <div class="card-grid">
        <div class="card"><div class="ic">1</div><h3>Bill anywhere</h3><p>Takeaway, dine-in, delivery — cash, UPI, card, split, or dues. Works offline.</p></div>
        <div class="card"><div class="ic">2</div><h3>Run the floor</h3><p>Table map, holds, transfers, QR tents, guest self-order into the kitchen.</p></div>
        <div class="card"><div class="ic">3</div><h3>Cook on KDS</h3><p>Tickets from POS &amp; QR land on kitchen boards with prep → ready flow.</p></div>
        <div class="card"><div class="ic">4</div><h3>Own the data</h3><p>CRM, loyalty, dues, GST reports, backups — your outlet, your numbers.</p></div>
      </div>
      <div class="pill-row" style="margin-top:14px">
        <span class="pill hot">Offline-first</span>
        <span class="pill hot">WhatsApp bills</span>
        <span class="pill ok">QR ordering</span>
        <span class="pill ok">GST ready</span>
        <span class="pill">Multi-station</span>
        <span class="pill">Role-based staff</span>
      </div>
    </div>
    <div>
      ${img(shot('00-homepage.png') || social || heroCart, 'RestroSuite product presence', 'shot')}
    </div>
  </div>
  <footer class="page-foot"><span>CodeArc RestroSuite · Client features</span><span>restrosuite.codearc.co.in</span></footer>
</section>

<!-- WHY -->
<section class="page">
  <header class="page-head">
    <div class="brand-mini">${logo ? `<img src="${logo}" alt="" />` : ''}<span>RestroSuite · Feature Guide</span></div>
    <div class="page-num">03</div>
  </header>
  <span class="eyebrow">Why restaurants switch</span>
  <h2>Built for real service pressure</h2>
  <div class="two-col">
    <div class="panel">
      <h3>The old way</h3>
      <ul>
        <li>₹3,000–₹10,000/month contracts</li>
        <li>Billing dies when Wi‑Fi drops</li>
        <li>Days of setup and training</li>
        <li>Paper receipts + manual WhatsApp</li>
        <li>Data locked in a vendor cloud</li>
        <li>QR / KDS / CRM sold as add-ons</li>
      </ul>
    </div>
    <div class="panel" style="background:#fff8f4;border-color:#ffd0b8">
      <h3 style="color:#c43a00">The RestroSuite way</h3>
      <ul>
        <li><strong>Free during launch</strong> — no credit card</li>
        <li><strong>100% offline billing</strong> — sync when back online</li>
        <li><strong>~5 minute</strong> outlet setup</li>
        <li><strong>Built-in WhatsApp</strong> PDF / text invoices</li>
        <li><strong>You own your data</strong> — export anytime</li>
        <li>POS + KDS + QR + CRM <strong>included</strong></li>
      </ul>
    </div>
  </div>
  <h3 style="margin-top:10mm">Head-to-head snapshot</h3>
  <table class="compare-table">
    <thead>
      <tr>
        <th>Capability</th>
        <th class="rs">RestroSuite</th>
        <th>Typical legacy POS</th>
      </tr>
    </thead>
    <tbody>
      <tr><td>Monthly cost</td><td class="rs">₹0 launch free</td><td>₹2k–₹10k / month</td></tr>
      <tr><td>Offline billing</td><td class="rs">Full offline + sync</td><td>Partial or none</td></tr>
      <tr><td>WhatsApp receipts</td><td class="rs">Built-in</td><td>Paid add-on</td></tr>
      <tr><td>QR table ordering</td><td class="rs">Included</td><td>Often paid</td></tr>
      <tr><td>Kitchen display</td><td class="rs">Included</td><td>Included / add-on</td></tr>
      <tr><td>Setup time</td><td class="rs">Minutes</td><td>Days–weeks</td></tr>
    </tbody>
  </table>
  <footer class="page-foot"><span>CodeArc RestroSuite · Client features</span><span>restrosuite.codearc.co.in</span></footer>
</section>

<!-- PLATFORMS -->
<section class="page">
  <header class="page-head">
    <div class="brand-mini">${logo ? `<img src="${logo}" alt="" />` : ''}<span>RestroSuite · Feature Guide</span></div>
    <div class="page-num">04</div>
  </header>
  <span class="eyebrow">Platforms</span>
  <h2>One product · three ways to run it</h2>
  <p class="lead">Staff can use whatever device they already have. Data stays in the same outlet workspace.</p>
  <div class="card-grid" style="grid-template-columns:1fr 1fr 1fr;margin-top:8mm">
    <div class="card">
      <div class="ic">W</div>
      <h3>Web app</h3>
      <p>Open in Chrome / Edge on counter PCs and tablets. Progressive Web App install supported. Always latest version after refresh.</p>
    </div>
    <div class="card">
      <div class="ic">A</div>
      <h3>Android POS</h3>
      <p>Installable APK for handhelds and counter tablets. Works online against cloud; offline assets bundled for resilience.</p>
    </div>
    <div class="card">
      <div class="ic">D</div>
      <h3>Windows desktop</h3>
      <p>Portable EXE for back-office or primary billing stations. Same UI language as web POS for zero retraining.</p>
    </div>
  </div>
  <div class="panel" style="margin-top:10mm">
    <h3>Who uses which screens?</h3>
    <div class="hub-grid" style="margin-top:8px">
      <div class="hub-card"><h4>Owner / Manager</h4><p>Reports, analytics, inventory, employees, Growth Hub, settings, WhatsApp gateway status.</p></div>
      <div class="hub-card"><h4>Cashier</h4><p>POS billing, shifts, bills search, reprints, dues settlement.</p></div>
      <div class="hub-card"><h4>Captain / Waiter</h4><p>Floor &amp; tables, holds, transfers, table QR, seat &amp; order.</p></div>
      <div class="hub-card"><h4>Kitchen</h4><p>Kitchen display tickets — prep, ready, clear. Optional token board for pickup.</p></div>
    </div>
  </div>
  <div class="pill-row" style="margin-top:10mm">
    <span class="pill ok">Multi-station Z-reports</span>
    <span class="pill ok">Role-limited tabs</span>
    <span class="pill">EN / हिन्दी UI labels</span>
    <span class="pill">Cloud hydrate + local cache</span>
  </div>
  <footer class="page-foot"><span>CodeArc RestroSuite · Client features</span><span>restrosuite.codearc.co.in</span></footer>
</section>

${featurePage({
  num: '05',
  eyebrow: 'Service · Billing',
  title: 'Point of Sale',
  badge: 'Core',
  lead: 'Fast counter billing for takeaway, dine-in, and delivery. Built for rush hours — big tap targets, sticky cart, multi-tender payments, and receipt actions that match how Indian restaurants actually settle.',
  bullets: [
    'Order types: Takeaway · Dine-in · Delivery with cart-side switcher',
    'Menu grid with categories, search, sort, and size slider',
    'Customer name + phone for CRM, loyalty, and WhatsApp',
    'Payments: Cash (quick denominations), UPI, Card, Split, Due',
    'Discounts, loyalty, and live tax/subtotal/grand total',
    'Print &amp; Pay → receipt preview → thermal print / WhatsApp',
    'Draft hold &amp; resume; station identity + open/close shift',
  ],
  how: [
    'Open Point of Sale from the sidebar (default landing tab).',
    'Optional: open shift with float cash for accurate Z-report later.',
    'Tap items → set qty/modifiers → choose payment → Print &amp; Pay.',
    'On settle: print thermal bill and/or send WhatsApp if phone is set.',
  ],
  tips: [
    'Attach a customer before Due payment so credit lands on the right profile.',
    'Use station labels (Counter 1, Counter 2) when multiple devices bill the same day.',
  ],
  image: shot('01-pos.png') || heroPos,
  imageAlt: 'Live POS — menu grid and cart',
})}

${featurePage({
  num: '06',
  eyebrow: 'Service · Dining room',
  title: 'Floor & Tables',
  badge: 'Host view',
  lead: 'A live seating map for captains and hosts. See free, dining, held, billed, and QR-pending tables at a glance — then seat, hold, transfer, print bill, or open QR sessions without leaving the floor.',
  bullets: [
    'Color-coded table states: free · seated · dining · held · QR pending · billed',
    'Seat &amp; order creates a live dine-in ticket immediately',
    'Hold cart drafts with amount; resume on POS',
    'Transfer multi-ticket tables between free tables',
    'Clear / free table (and bulk Clear all open with confirm)',
    'Print Table QRs — tent cards with size presets &amp; live preview',
    'Edit layout: add/remove tables and Save Layout to cloud',
  ],
  how: [
    'Open Floor &amp; Tables → pick a free table → Seat &amp; order.',
    'Add items on POS, hold if guests pause, resume from the floor card.',
    'Use View QR / Print Table QRs for tent cards (Order food + Call waiter).',
    'At settle, checkout from the table modal or POS cart linked to that table.',
  ],
  tips: [
    'Print medium or large tents for noisy dining rooms; mini stickers for counters.',
    'Set guest Wi‑Fi and welcome line under Settings before mass-printing QR cards.',
  ],
  image: shot('02-floor.png'),
  imageAlt: 'Floor plan with live table states',
})}

${featurePage({
  num: '07',
  eyebrow: 'Service · Guest self-order',
  title: 'QR Table Ordering',
  badge: 'No app needed',
  lead: 'Guests scan a table tent, browse your menu on their phone, and place orders. Tickets appear in QR Orders for staff approval, then flow to Kitchen — no download, no friction.',
  bullets: [
    'Per-table QR sessions — open one table or Open all QR in bulk',
    'Guest portal: browse menu, cart, place order, optional UPI path (INR)',
    'Staff QR Orders queue: accept / reject with kitchen routing',
    'Toast / chime when new guest orders arrive',
    'Dual-purpose cards: Order food · Call waiter',
    'Print sizes: Mini → Full page + custom mm width/QR size',
    'Optional Wi‑Fi SSID/password and welcome line on printed cards',
  ],
  how: [
    'Print tents from Floor → place on tables.',
    'Open QR for the table (or Open all) when service starts.',
    'Watch QR Orders; accept tickets so kitchen sees them on KDS.',
    'Close QR sessions when tables turn or day ends.',
  ],
  tips: [
    'Train captains to accept QR orders quickly during rush — kitchen lag starts here.',
    'Guest currency follows outlet profile; UPI forms show for ₹ outlets.',
  ],
  image: shot('03-qr-orders.png'),
  imageAlt: 'QR Orders staff queue',
})}

${featurePage({
  num: '08',
  eyebrow: 'Kitchen',
  title: 'Kitchen Display System (KDS)',
  badge: 'Prep board',
  lead: 'A dedicated cook-facing board for accepted tickets from POS and QR. Track prep, mark ready for service or collection, and keep the pass clear without paper KOTs.',
  bullets: [
    'Tickets from dine-in, takeaway, delivery, and QR in one board',
    'Item-level prep status → mark ready',
    'Rush / fire context from service station',
    'Works as browser tab on a kitchen tablet or secondary display',
    'Optional standalone kds.html display mode',
    'Badge counts on sidebar when tickets pile up',
  ],
  how: [
    'Send a test order from POS or accept a QR order.',
    'Open Kitchen tab (or kitchen display URL) on the cook screen.',
    'Move items Preparing → Ready; clear when plated / handed over.',
  ],
  tips: [
    'Use a dedicated tablet in landscape; keep brightness high under kitchen lights.',
    'Pair with Token Board if guests collect from a counter window.',
  ],
  image: shot('04-kds.png'),
  imageAlt: 'Kitchen display with live tickets',
})}

${featurePage({
  num: '09',
  eyebrow: 'Service · Channels',
  title: 'Online Orders',
  badge: 'Queue',
  lead: 'A single place to review delivery-channel and manual online tickets. Accept or reject without juggling multiple apps on the counter phone.',
  bullets: [
    'Unified online / aggregator-style order queue',
    'Accept or reject with clear staff actions',
    'Manual online order entry for phone / WhatsApp orders',
    'Routes accepted tickets into kitchen &amp; billing flow',
    'Badge count on sidebar for pending channel orders',
  ],
  how: [
    'Open Online Orders when channel tickets or phone orders arrive.',
    'Review items &amp; customer → Accept (kitchen) or Reject.',
    'For phone orders: create manual online order, then process as usual.',
  ],
  tips: [
    'Assign one person during peak to watch Online Orders + QR Orders together.',
  ],
  image: shot('05-online-orders.png'),
  imageAlt: 'Online orders queue',
})}

${featurePage({
  num: '10',
  eyebrow: 'Back office · Sales ledger',
  title: 'Bills History',
  badge: 'Invoices',
  lead: 'Searchable sales history for every settled bill. Reprint, inspect tax lines, handle refunds with PIN gates, and export for accounts — spanning local cache and cloud search for older days.',
  bullets: [
    'Search by bill number, phone, or customer',
    'Day totals and filterable history',
    'Reprint thermal / PDF-style receipt preview',
    'Refund / cancel path with optional manager PIN',
    'Export bills CSV (station, shift, cashier, tenders)',
    'Bill QR on receipt for guest re-open / proof',
  ],
  how: [
    'Open Bills → search today’s ticket or older history.',
    'Open a row to inspect items, tax, payment split.',
    'Reprint or export CSV for accountant / GST workflow.',
  ],
  tips: [
    'Use Day pack / export from owner tools for end-of-day packs.',
    'Never refund without PIN policy if multiple cashiers share a counter.',
  ],
  image: shot('06-bills.png'),
  imageAlt: 'Bills history with filters',
})}

<!-- WhatsApp dedicated page -->
<section class="page">
  <header class="page-head">
    <div class="brand-mini">${logo ? `<img src="${logo}" alt="" />` : ''}<span>RestroSuite · Feature Guide</span></div>
    <div class="page-num">11</div>
  </header>
  <span class="eyebrow">Guest experience · Messaging</span>
  <h2>WhatsApp receipts &amp; PDFs</h2>
  <p class="lead">
    After Print &amp; Pay, send a branded invoice straight to the guest’s WhatsApp — PDF when the gateway is linked,
    with a reliable text fallback. Top-bar status shows connected / offline at a glance.
  </p>
  <div class="feature-layout" style="margin-top:6mm">
    <div class="feature-copy">
      <ul class="bullets">
        <li>One-tap WhatsApp from bill settled modal</li>
        <li>PDF invoice matches on-screen receipt preview</li>
        <li>Text fallback + WhatsApp Web if gateway busy</li>
        <li>Top-bar icon: green connected · red off · amber scanning</li>
        <li>Send test from outlet WhatsApp settings</li>
        <li>Owner can receive end-of-day WhatsApp report packs</li>
        <li>No per-message third-party bill markup in the free launch model</li>
      </ul>
      <div class="how-box">
        <h4>How to use it</h4>
        <ol>
          <li>Link the outlet WhatsApp number via QR in Settings / gateway setup (one-time).</li>
          <li>On POS, enter guest mobile before settle.</li>
          <li>After payment, tap WhatsApp on the receipt actions.</li>
          <li>Confirm green top-bar status before a busy dinner service.</li>
        </ol>
      </div>
    </div>
    <div class="feature-visual">
      <div class="panel">
        <h3>What guests receive</h3>
        <ul>
          <li>Outlet name &amp; bill number</li>
          <li>Itemised lines + tax + total</li>
          <li>Payment mode (Cash / UPI / Card…)</li>
          <li>Thank-you line &amp; optional PDF</li>
        </ul>
        <h3 style="margin-top:12px">Staff checklist</h3>
        <ul>
          <li>Phone is 10-digit valid for region</li>
          <li>Gateway session not expired</li>
          <li>Reprint still available from Bills if send fails</li>
        </ul>
      </div>
    </div>
  </div>
  <footer class="page-foot"><span>CodeArc RestroSuite · Client features</span><span>restrosuite.codearc.co.in</span></footer>
</section>

${featurePage({
  num: '12',
  eyebrow: 'Back office · Stock',
  title: 'Inventory',
  badge: 'Stock control',
  lead: 'Track ingredients and supplies with reorder thresholds, batches, expiry awareness, and recipe-linked consumption when bills settle — so food cost stays visible, not guesswork.',
  bullets: [
    'Stock list with qty, unit, and low-stock thinking',
    'Batches &amp; expiry helpers for perishables',
    'Recipe consumption deducts on sale (ledger)',
    'Import-friendly workflows (Excel / CSV samples)',
    'Purchase orders path via Growth Hub',
    'Cross-check with reports for waste conversations',
  ],
  how: [
    'Open Inventory → add core ingredients or import a starter sheet.',
    'Set reorder thresholds for items that run out weekly.',
    'Link recipes on Menu Editor so POS sales deduct stock.',
    'Review low stock before weekend rush; raise POs from Growth Hub.',
  ],
  tips: [
    'Start with 10–15 high-velocity ingredients, not the entire store room.',
  ],
  image: shot('07-inventory.png'),
  imageAlt: 'Inventory stock screen',
})}

${featurePage({
  num: '13',
  eyebrow: 'Back office · Catalog',
  title: 'Menu Editor',
  badge: 'Publish',
  lead: 'Publish categories, items, prices, availability, descriptions, and recipes used by POS and guest QR menus. What you edit here is what cashiers and guests both see.',
  bullets: [
    'Categories &amp; item catalog for POS + QR',
    'Prices, availability toggles, descriptions',
    'Recipe links for inventory consumption',
    'Import / export friendly maintenance',
    'Immediate reflection on POS after save / sync',
    'Supports regional currency symbols from outlet profile',
  ],
  how: [
    'Open Menu Editor → create categories (Starters, Mains…).',
    'Add items with price; mark sold-out when needed.',
    'Attach recipes for key dishes to enable stock deduction.',
    'Place a test POS order to verify the item appears correctly.',
  ],
  tips: [
    'Keep names short on POS tiles; put long stories in descriptions for QR guests.',
  ],
  image: shot('08-menu-editor.png'),
  imageAlt: 'Menu editor catalog',
})}

${featurePage({
  num: '14',
  eyebrow: 'Team',
  title: 'Employees & access',
  badge: 'Roles',
  lead: 'Create staff logins with role-appropriate access so cashiers cannot change tax settings and kitchen staff are not buried in owner reports. Attendance and HR helpers sit alongside access control.',
  bullets: [
    'Staff accounts with usernames &amp; roles',
    'Tab-level visibility by role (cashier, waiter, kitchen, manager…)',
    'Attendance / leave / payroll helper surfaces',
    'Deactivate logins when staff leave',
    'Works with shift open/close for cashier accountability',
  ],
  how: [
    'Open Employees → add a cashier with limited tabs.',
    'Log out and sign in as that user to verify lockdown.',
    'Promote managers only when they need inventory / tax / reports.',
  ],
  tips: [
    'Never share the owner password on the floor device — create role users.',
  ],
  image: shot('09-employees.png'),
  imageAlt: 'Employees directory',
})}

${featurePage({
  num: '15',
  eyebrow: 'Back office · Relationships',
  title: 'Customers, CRM & dues',
  badge: 'Loyalty',
  lead: 'Every bill with a phone number builds a living customer profile — visits, spend, loyalty points, notes, and outstanding credit. Settle dues with a formal receipt the same way you settle a table.',
  bullets: [
    'Auto profiles from POS phone capture',
    'Visit history, spend, and loyalty points',
    'Outstanding dues total on CRM dashboard',
    'Due payment method on POS (credit sales)',
    'Settle Dues modal — Cash / UPI / Card + receipt / WhatsApp',
    'Notes for allergies, preferences, VIP flags',
    'Foundation for offers &amp; WhatsApp campaigns in Growth Hub',
  ],
  how: [
    'On POS, select or register a customer before Due checkout.',
    'Open Customers → review outstanding badge on cards.',
    'Settle Dues → choose tender → print or WhatsApp settlement slip.',
  ],
  tips: [
    'Credit sales without a customer profile are blocked by design — good.',
  ],
  image: shot('10-customers.png'),
  imageAlt: 'Customers & CRM',
})}

${featurePage({
  num: '16',
  eyebrow: 'Back office · Compliance',
  title: 'Tax, GST & sales reports',
  badge: 'Accounts',
  lead: 'Configure tax rates for your country, print GST-aware bills, and export period reports that accountants can actually use — including GSTR-oriented CSV columns and day packs.',
  bullets: [
    'Tax &amp; GST profile for the outlet',
    'Invoice lines reflect configured rates',
    'Reports: revenue, orders, item mix, payment split, tax',
    'Date range filters (Today → custom)',
    'GSTR-ready CSV download',
    'Bills CSV with station, shift, cashier, tenders',
    'Multi-currency aware formatting from outlet settings',
  ],
  how: [
    'Verify Tax &amp; GST before first live sale.',
    'After a service day, open Reports → Today → download CSV.',
    'Match totals against Bills and closed Z-report variance.',
  ],
  tips: [
    'Close shift before final export so cash variance is honest.',
  ],
  image: shot('12-reports.png') || shot('11-tax.png'),
  imageAlt: 'Reports & tax views',
})}

${featurePage({
  num: '17',
  eyebrow: 'Back office · Insight',
  title: 'Analytics',
  badge: 'Trends',
  lead: 'Go beyond the daily sales total — see performance patterns that help owners decide menus, staffing, and promotions without exporting to a spreadsheet first.',
  bullets: [
    'Advanced analytics workspace beyond basic reports',
    'Visual performance cues for busy vs quiet periods',
    'Complements item mix &amp; payment split reports',
    'Owner-friendly, not analyst-only',
  ],
  how: [
    'Open Analytics after at least a few days of live bills.',
    'Compare weekdays vs weekends before changing staffing.',
    'Use insights with Offers in Growth Hub for targeted promos.',
  ],
  tips: [
    'Analytics quality grows with clean POS discipline (correct order types &amp; payments).',
  ],
  image: shot('13-analytics.png'),
  imageAlt: 'Analytics workspace',
})}

<!-- Growth Hub -->
<section class="page">
  <header class="page-head">
    <div class="brand-mini">${logo ? `<img src="${logo}" alt="" />` : ''}<span>RestroSuite · Feature Guide</span></div>
    <div class="page-num">18</div>
  </header>
  <span class="eyebrow">Team · Ops toolkit</span>
  <h2>Growth Hub</h2>
  <p class="lead">A launcher for day-to-day growth and operations tools that sit beside core billing — reservations, procurement, promos, feedback, and more.</p>
  ${img(shot('14-growth-hub.png'), 'Growth Hub launcher', 'shot')}
  <div class="hub-grid" style="margin-top:8mm">
    <div class="hub-card"><h4>Reservations</h4><p>Table bookings &amp; waitlist for dinner service.</p></div>
    <div class="hub-card"><h4>Support tickets</h4><p>Log customer queries &amp; complaints with follow-up.</p></div>
    <div class="hub-card"><h4>Purchase orders</h4><p>Raise &amp; track supplier POs against inventory needs.</p></div>
    <div class="hub-card"><h4>Recipe costing</h4><p>Plate cost &amp; margin calculator before you price a dish.</p></div>
    <div class="hub-card"><h4>Offers &amp; coupons</h4><p>Festival deals and promo codes for POS / CRM.</p></div>
    <div class="hub-card"><h4>WhatsApp campaigns</h4><p>Broadcast to your customer list (responsible use).</p></div>
    <div class="hub-card"><h4>Feedback &amp; reviews</h4><p>Collect ratings; approve what shows publicly.</p></div>
    <div class="hub-card"><h4>Loyalty program</h4><p>Points, tiers, and rewards on top of CRM profiles.</p></div>
  </div>
  <footer class="page-foot"><span>CodeArc RestroSuite · Client features</span><span>restrosuite.codearc.co.in</span></footer>
</section>

${featurePage({
  num: '19',
  eyebrow: 'Configuration',
  title: 'Settings — outlet, tax & printing',
  badge: 'Taxes & pricing',
  lead: 'Open Settings from the sidebar gear. Configure how your restaurant looks, how GST is calculated, what prints on bills, and guest QR tent details — all in one place.',
  bullets: [
    '<b>Calculate taxes</b> toggle — master on/off for cart, bills, and print',
    '<b>Tax label</b> (GST / VAT) and default <b>Tax rate %</b> for the outlet',
    '<b>Inclusive pricing</b> — menu prices include tax, or tax added on top',
    'Service charge on dine-in + optional round-off',
    'Show HSN codes on GST-style invoices when enabled',
    'Outlet profile: name, address, GSTIN, country, currency',
    'Guest QR: Wi‑Fi name/password and welcome line for table tents',
    'Printers &amp; KOT, WhatsApp gateway, payments, security PIN',
  ],
  how: [
    'Sidebar → Settings (gear) → Taxes &amp; pricing.',
    'Turn Calculate taxes ON for registered restaurants; set default rate (often 5%).',
    'Set different GST slabs per dish in Menu Editor (5% / 12% / 18% / 28%).',
    'Profile + Guest QR fields → print table tents; test one Print &amp; Pay bill.',
  ],
  tips: [
    'Item GST slab overrides the outlet default on that line.',
    'Support: support@codearc.co.in',
  ],
  image: shot('15-settings.png'),
  imageAlt: 'Settings · Taxes & pricing',
})}

<!-- Offline + shifts (with settings visual + ops) -->
<section class="page">
  <header class="page-head">
    <div class="brand-mini">${logo ? `<img src="${logo}" alt="" />` : ''}<span>RestroSuite · Feature Guide</span></div>
    <div class="page-num">20</div>
  </header>
  <span class="eyebrow">Configuration · continued</span>
  <h2>Settings deep dive + offline shifts</h2>
  <p class="lead">Settings is also where you connect WhatsApp, printers, and security. Day-to-day cash discipline still runs on stations and Z-reports.</p>
  <div class="feature-layout" style="margin-top:4mm">
    <div class="feature-copy">
      <h3>Settings map</h3>
      <ul class="bullets">
        <li><b>Outlet profile</b> — brand, address, phone, country, currency, GSTIN</li>
        <li><b>Taxes &amp; pricing</b> — calculate on/off, rates, inclusive, SC, HSN</li>
        <li><b>Printers &amp; KOT</b> — thermal / auto-print preferences</li>
        <li><b>WhatsApp</b> — link number, bill PDF preferences</li>
        <li><b>Security &amp; PIN</b> — manager PIN for refunds / voids</li>
        <li><b>Team &amp; plan</b> — access hints and workspace plan</li>
      </ul>
      <h3 style="margin-top:10px">Offline + shifts</h3>
      <ul class="bullets">
        <li>Bill offline; cloud hydrates when back online</li>
        <li>Open / close shift with cash float and variance</li>
        <li>Station labels for multi-counter Z-reports</li>
      </ul>
      <div class="how-box" style="margin-top:8px">
        <h4>Daily cash rhythm</h4>
        <ol>
          <li>Open shift with float</li>
          <li>Bill all day on POS</li>
          <li>Close shift → count cash → Print / CSV Z-report</li>
        </ol>
      </div>
    </div>
    <div class="feature-visual">
      ${
        shot('15-settings.png')
          ? img(shot('15-settings.png'), 'Settings workspace — taxes &amp; pricing', 'shot tall')
          : shot('12-reports.png')
            ? img(shot('12-reports.png'), 'Reports when settings shot unavailable', 'shot tall')
            : '<div class="shot-placeholder">Settings screenshot</div>'
      }
    </div>
  </div>
  <footer class="page-foot"><span>CodeArc RestroSuite · Client features</span><span>support@codearc.co.in</span></footer>
</section>

<!-- Getting started -->
<section class="page cta-page">
  <header class="page-head">
    <div class="brand-mini">${logo ? `<img src="${logo}" alt="" />` : ''}<span>RestroSuite · Feature Guide</span></div>
    <div class="page-num">21</div>
  </header>
  <span class="eyebrow">Onboarding</span>
  <h2>Getting started in one service day</h2>
  <div class="steps-row">
    <div class="step"><div class="n">01</div><h4>Register outlet</h4><p>Create workspace, country &amp; currency, owner login.</p></div>
    <div class="step"><div class="n">02</div><h4>Publish menu</h4><p>Categories, prices, a few recipes. Keep it lean.</p></div>
    <div class="step"><div class="n">03</div><h4>Add staff</h4><p>Cashier + captain roles. Test one limited login.</p></div>
    <div class="step"><div class="n">04</div><h4>Live dry run</h4><p>One QR order, one POS bill, one Z-close.</p></div>
  </div>
  <div class="panel" style="margin-top:10mm">
    <h3>Launch checklist</h3>
    <div class="hub-grid">
      <div class="hub-card"><h4>✓ Outlet profile</h4><p>Name, address, GST, UPI, currency</p></div>
      <div class="hub-card"><h4>✓ Menu live on POS</h4><p>Test item appears with correct tax</p></div>
      <div class="hub-card"><h4>✓ Inventory starter</h4><p>Top ingredients + thresholds</p></div>
      <div class="hub-card"><h4>✓ Staff roles</h4><p>No shared owner password on floor</p></div>
      <div class="hub-card"><h4>✓ Table QR print</h4><p>One table end-to-end guest order</p></div>
      <div class="hub-card"><h4>✓ Printer + WhatsApp</h4><p>One real bill to paper and phone</p></div>
    </div>
  </div>
  <div class="cta-box">
    <div class="cta-price">₹0 <small>per month during launch</small></div>
    <h2>Run your restaurant from the devices you already own</h2>
    <p>Every client feature in this guide is available in the free launch period. No credit card. No annual lock-in. Upgrade only after value is proven.</p>
    <p style="font-size:13px;color:rgba(255,255,255,.9);margin:0">
      <strong>restrosuite.codearc.co.in</strong> · <strong>support@codearc.co.in</strong>
    </p>
  </div>
  <footer class="page-foot"><span>CodeArc RestroSuite · Client features</span><span>July 2026 · v2.0.2 · support@codearc.co.in</span></footer>
</section>

</body>
</html>`;

  return html;
}

async function writePdf(html) {
  fs.writeFileSync(HTML_PATH, html, 'utf8');
  console.log('Wrote HTML', HTML_PATH);

  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  // file:// load
  await page.goto('file:///' + HTML_PATH.replace(/\\/g, '/'), {
    waitUntil: 'networkidle',
    timeout: 120000,
  });
  await page.waitForTimeout(800);
  let outPdf = PDF_PATH;
  try {
    await page.pdf({
      path: PDF_PATH,
      format: 'A4',
      printBackground: true,
      preferCSSPageSize: true,
      margin: { top: '0', right: '0', bottom: '0', left: '0' },
    });
  } catch (err) {
    if (err && (err.code === 'EBUSY' || /busy|locked/i.test(String(err.message || '')))) {
      outPdf = PDF_PATH_ALT;
      await page.pdf({
        path: PDF_PATH_ALT,
        format: 'A4',
        printBackground: true,
        preferCSSPageSize: true,
        margin: { top: '0', right: '0', bottom: '0', left: '0' },
      });
      console.warn('Primary PDF locked; wrote alternate:', PDF_PATH_ALT);
    } else {
      throw err;
    }
  }
  await browser.close();
  console.log('Wrote PDF', outPdf);
  return outPdf;
}

async function main() {
  ensureDirs();
  console.log('=== RestroSuite Product PDF ===');
  console.log('Base:', BASE);
  console.log('Outlet:', CREDS.outlet, '/ user:', CREDS.user);

  const browser = await chromium.launch({
    headless: true,
    args: ['--disable-dev-shm-usage'],
  });
  const context = await browser.newContext({
    viewport: { width: 1440, height: 900 },
    deviceScaleFactor: 1.25,
  });
  const page = await context.newPage();
  page.setDefaultTimeout(60000);

  try {
    await login(page);
    await captureScreens(page);
  } catch (e) {
    console.error('Capture error:', e);
    console.log('Continuing with any screenshots already saved + static assets…');
  } finally {
    await browser.close().catch(() => {});
  }

  const html = buildHtml();
  const outPdf = await writePdf(html);

  const size = fs.existsSync(outPdf) ? (fs.statSync(outPdf).size / 1024 / 1024).toFixed(2) : '?';
  console.log(`\nDone. PDF size ~${size} MB`);
  console.log(outPdf);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
