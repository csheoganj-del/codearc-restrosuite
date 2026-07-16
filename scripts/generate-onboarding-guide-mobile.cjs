/**
 * RestroSuite — Complete Client Onboarding Guide (PDF)
 * From Google → register/login → every client tab, with full-page shots,
 * sample data seeding, and callouts so a new user can run the outlet alone.
 *
 * Usage: node scripts/generate-onboarding-guide.cjs
 * Env: RS_BASE, RS_OUTLET, RS_USER, RS_PASS
 */
'use strict';

const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright');

const ROOT = path.resolve(__dirname, '..');
const OUT_DIR = path.join(ROOT, 'docs', 'onboarding-guide-mobile');
const SHOTS = path.join(OUT_DIR, 'shots');
const PDF_PATH = path.join(ROOT, 'docs', 'RestroSuite-Mobile-Onboarding-Guide.pdf');
const PDF_ALT = path.join(ROOT, 'docs', 'RestroSuite-Mobile-Onboarding-Guide-v2.pdf');
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

/** Ordered guide steps — id used for screenshot filename */
const STEPS = [];

function step(def) {
  STEPS.push({
    id: def.id,
    phase: def.phase || 'Guide',
    title: def.title,
    goal: def.goal || '',
    actions: def.actions || [],
    tips: def.tips || [],
    highlight: def.highlight || null, // CSS selector to ring
    where: def.where || 'dashboard', // google | marketing | login | register | dashboard
    tab: def.tab || null,
    settingsPanel: def.settingsPanel || null,
    seed: def.seed || null, // optional seed fn name
    fullPage: def.fullPage !== false,
  });
}

// ─── Discovery ─────────────────────────────────────────────
step({
  id: '01-google-search',
  phase: '1 · Find RestroSuite',
  title: 'Find RestroSuite (search or APK / browser)',
  where: 'google',
  goal: 'Find the product on phone browser or install the Android app.',
  actions: [
    'Open Google on phone or computer.',
    'Type: CodeArc RestroSuite (or restrosuite codearc).',
    'Open the official result restrosuite.codearc.co.in (or CodeArc RestroSuite).',
  ],
  tips: ['Bookmark the site for staff. Prefer the official CodeArc domain.'],
});

step({
  id: '02-homepage',
  phase: '1 · Find RestroSuite',
  title: 'Homepage — what RestroSuite is',
  where: 'marketing',
  goal: 'Understand offline POS, WhatsApp bills, QR ordering, and free launch.',
  actions: [
    'Read the hero: offline-first restaurant POS by CodeArc.',
    'Scroll Features (POS, WhatsApp, QR, CRM).',
    'Note: free during launch, no credit card required.',
    'Click Sign Up Free or Sign in when ready.',
  ],
  tips: ['Support email for all help: ' + SUPPORT],
  highlight: 'a.btn-primary, .hero-actions a, a[href*="login"]',
});

// ─── Register & Login ──────────────────────────────────────
step({
  id: '03-login-page',
  phase: '2 · Access',
  title: 'Open the Access page (Sign in / Register)',
  where: 'login',
  goal: 'Know the two tabs: Sign in (existing) vs Register outlet (new).',
  actions: [
    'Go to ' + SITE + '/login.html',
    'See Sign in tab (left) and Register outlet tab (right).',
    'New restaurants: choose Register outlet.',
    'Existing staff: choose Sign in.',
  ],
  highlight: '#tab-login-btn, #tab-register-btn, .tab-btn',
});

step({
  id: '04-register-form',
  phase: '2 · Access',
  title: 'Register a new outlet (step-by-step fields)',
  where: 'register',
  goal: 'Create a workspace: business name, workspace code, owner contact, password, country & currency.',
  actions: [
    'Click Register outlet.',
    'Enter restaurant / business display name.',
    'Choose a short workspace code (Outlet ID) — e.g. royal-dhaba (letters, numbers, hyphens). This is NOT the display name.',
    'Enter owner WhatsApp / phone and email.',
    'Pick country and currency (drives tax label and ₹ / € etc.).',
    'Create a strong password (10+ characters) and confirm it.',
    'Complete any OTP / verification step if shown.',
    'Submit Create my outlet — wait for success, then sign in with the new Outlet ID.',
  ],
  tips: [
    'Write down Outlet ID + username + password for the owner.',
    'Staff later get separate logins under Employees — do not share owner password on the floor.',
  ],
  highlight: '#tab-register-btn, #register-form, #reg-slug, #reg-password',
});

step({
  id: '05-login-form',
  phase: '2 · Access',
  title: 'Sign in to an existing outlet',
  where: 'login',
  goal: 'Log in with Outlet ID, username, and password.',
  actions: [
    'Open Sign in tab.',
    'Workspace / Outlet ID: e.g. bbb (the code from registration).',
    'Email or Username: staff or owner username.',
    'Password: your password.',
    'Optional: Keep me signed in (for trusted devices only).',
    'Click Sign in securely → lands on Point of Sale.',
  ],
  tips: [
    'Wrong outlet ID is the most common error — use the code, not the restaurant name.',
    'Forgot password: use Recover access on this page.',
  ],
  highlight: '#login-form, #tenant-id, #username, #password, #login-submit',
});

// ─── Shell ─────────────────────────────────────────────────
step({
  id: '06-shell-overview',
  phase: '3 · Workspace shell',
  title: 'After login — layout of the console',
  where: 'dashboard',
  tab: 'pos-tab',
  goal: 'Know where navigation, cart, and status live.',
  actions: [
    'Left sidebar: all modules (POS, Kitchen, Bills, Inventory…).',
    'Main area: active module screen.',
    'Top bar: station, shift, search, WhatsApp status, time, version, help.',
    'Bottom of sidebar: Settings (gear) and Sign out.',
    'On phone: bottom tabs POS · Orders · Kitchen · Bills · More.',
  ],
  tips: ['Orange version chip (e.g. v209) — click to copy full build id for support.'],
  highlight: '.sidebar, .sidebar-link, #open-settings',
});

step({
  id: '07-sidebar-map',
  phase: '3 · Workspace shell',
  title: 'Sidebar map — every client module',
  where: 'dashboard',
  tab: 'pos-tab',
  goal: 'Memorise where each job lives.',
  actions: [
    'OPERATIONS: Point of Sale, QR Orders, Kitchen, Floor & Tables, Online Orders, Bills.',
    'MANAGE: Kitchen Setup, Inventory, Menu Editor, Employees, Customers, Tax & GST.',
    'GROW: Reports, Analytics, Growth Hub.',
    'FOOT: Settings, Help, Sign out.',
  ],
  tips: ['Your role may hide some tabs — that is normal for cashiers vs owners.'],
  highlight: '.sidebar',
});

// ─── POS ───────────────────────────────────────────────────
step({
  id: '08-pos-empty-ready',
  phase: '4 · Point of Sale',
  title: 'POS screen — menu grid + cart',
  where: 'dashboard',
  tab: 'pos-tab',
  seed: 'ensureMenu',
  goal: 'Sell takeaway, dine-in, or delivery from one counter screen.',
  actions: [
    'Open Point of Sale from the sidebar (default after login).',
    'Left/centre: menu categories and item tiles.',
    'Right (or bottom on mobile): Current Order cart.',
    'Top of cart: order type Takeaway · Dine-in · Delivery.',
    'Search box filters menu; sort and size controls adjust the grid.',
  ],
  highlight: '#pos-tab, .sidebar-link[data-tab="pos-tab"]',
});

step({
  id: '09-pos-add-items',
  phase: '4 · Point of Sale',
  title: 'Add items to the cart',
  where: 'dashboard',
  tab: 'pos-tab',
  seed: 'ensureCartItems',
  goal: 'Build an order quickly during rush.',
  actions: [
    'Tap a category (e.g. Starters) if needed.',
    'Tap menu items — they appear in the cart with qty.',
    'Use + / − on a line to change quantity.',
    'Optional: open line note for “less spicy”, “no onion”.',
    'Optional: customer name + phone (needed for WhatsApp bill and CRM).',
  ],
  highlight: '#pos-tab .pos-grid, #pos-tab .cart-items, .cart-count-pill',
});

step({
  id: '10-pos-pay',
  phase: '4 · Point of Sale',
  title: 'Choose payment and settle (Print & Pay)',
  where: 'dashboard',
  tab: 'pos-tab',
  seed: 'ensureCartItems',
  goal: 'Collect money and finish the bill.',
  actions: [
    'Check subtotal, tax, and grand total in the cart footer.',
    'Select payment: Cash, UPI, Card, Split, or Due (credit — needs customer).',
    'Cash: use quick amounts or enter cash received if shown.',
    'Tap Print & Pay (or Pay) to settle.',
    'On Bill settled: Print thermal, WhatsApp PDF, or close.',
  ],
  tips: ['Due payment requires a registered customer — use Customers / quick register.'],
  highlight: '.cart-payment, .cart-actions-final, #btn-print-pay, button:has-text("Print")',
});

step({
  id: '11-pos-shift',
  phase: '4 · Point of Sale',
  title: 'Open / close shift (cash discipline)',
  where: 'dashboard',
  tab: 'pos-tab',
  goal: 'Start and end the day with a clear cash float and Z-report.',
  actions: [
    'Find Shift control in the top bar (Open shift / Close shift).',
    'Open shift: enter opening cash (notes & coins).',
    'Sell all day on this station.',
    'Close shift: enter counted cash → see variance → Print / CSV Z-report.',
    'Use station label (e.g. Counter 1) when multiple devices bill.',
  ],
  highlight: 'button:has-text("Shift"), #btn-shift, .rs-shift, [class*="shift"]',
});

// ─── Floor ─────────────────────────────────────────────────
step({
  id: '12-floor',
  phase: '5 · Dining room',
  title: 'Floor & Tables — seating map',
  where: 'dashboard',
  tab: 'floor-tab',
  seed: 'ensureTables',
  goal: 'See free / dining / held / QR tables at a glance.',
  actions: [
    'Open Floor & Tables.',
    'Colours show state: free, seated, dining, held, QR pending, billed.',
    'Tap a free table → Seat & order → sends you to POS for that table.',
    'Held tables: Resume hold on POS.',
    'Transfer moves open tickets to another free table.',
    'Clear / free table when guests leave (confirm carefully).',
  ],
  highlight: '.sidebar-link[data-tab="floor-tab"], #floor-tab',
});

step({
  id: '13-floor-qr-print',
  phase: '5 · Dining room',
  title: 'Print Table QR tents',
  where: 'dashboard',
  tab: 'floor-tab',
  goal: 'Put scannable Order food + Call waiter cards on each table.',
  actions: [
    'On Floor toolbar: Print Table QRs (or View QR on one table).',
    'Choose card size (Mini → Full) or Custom mm sizes.',
    'Toggle Wi‑Fi, welcome line, Powered by (set Wi‑Fi under Settings first).',
    'Live preview updates as you change options.',
    'Print at 100% scale (not Fit-to-page).',
  ],
  tips: ['Table number is always on the card — required for guest orders.'],
  highlight: 'button:has-text("Print"), button:has-text("QR")',
});

// ─── QR Orders ─────────────────────────────────────────────
step({
  id: '14-qr-orders',
  phase: '6 · Guest QR',
  title: 'QR Orders queue (staff)',
  where: 'dashboard',
  tab: 'qr-orders-tab',
  seed: 'ensureQrContext',
  goal: 'Accept or reject orders guests place from table QR.',
  actions: [
    'Open QR Orders from the sidebar.',
    'New guest tickets appear with table number and items.',
    'Accept → kitchen / KDS gets the ticket.',
    'Reject if needed (wrong table / test).',
    'Amend shared table orders before kitchen starts prep (when enabled).',
  ],
  highlight: '.sidebar-link[data-tab="qr-orders-tab"], #qr-orders-tab',
});

// ─── Kitchen ───────────────────────────────────────────────
step({
  id: '15-kds',
  phase: '7 · Kitchen',
  title: 'Kitchen Display (KDS)',
  where: 'dashboard',
  tab: 'kds-tab',
  seed: 'ensureKitchenTicket',
  goal: 'Cooks see tickets and mark items ready without paper KOTs.',
  actions: [
    'Open Kitchen from the sidebar (or kds.html on a kitchen tablet).',
    'Tickets show table / token, items, and status.',
    'Mark preparing → ready as food is cooked.',
    'Clear when plated or handed to service.',
  ],
  tips: ['Use a bright tablet in landscape, fixed on the pass.'],
  highlight: '.sidebar-link[data-tab="kds-tab"], #kds-tab',
});

// ─── Online ────────────────────────────────────────────────
step({
  id: '16-online',
  phase: '8 · Channels',
  title: 'Online Orders queue',
  where: 'dashboard',
  tab: 'aggregator-tab',
  goal: 'One place for delivery-channel and manual online tickets.',
  actions: [
    'Open Online Orders.',
    'Review items and customer details.',
    'Accept (to kitchen) or Reject.',
    'Phone orders: create manual online order, then process like POS.',
  ],
  highlight: '.sidebar-link[data-tab="aggregator-tab"]',
});

// ─── Bills ─────────────────────────────────────────────────
step({
  id: '17-bills',
  phase: '9 · History',
  title: 'Bills — search, reprint, export',
  where: 'dashboard',
  tab: 'bills-tab',
  seed: 'ensureBill',
  goal: 'Find any settled invoice and hand data to accounts.',
  actions: [
    'Open Bills.',
    'Search by bill no, phone, or customer name.',
    'Open a row: totals, tax, payment method, station.',
    'Reprint receipt / thermal.',
    'Refund / void only with manager PIN if configured.',
    'Export CSV for the day or filtered set.',
  ],
  highlight: '.sidebar-link[data-tab="bills-tab"], #bills-tab',
});

// ─── Inventory ─────────────────────────────────────────────
step({
  id: '18-inventory',
  phase: '10 · Stock',
  title: 'Inventory — stock list',
  where: 'dashboard',
  tab: 'inventory-tab',
  seed: 'ensureInventory',
  goal: 'Track ingredients, low stock, and recipe use.',
  actions: [
    'Open Inventory.',
    'Add stock items: name, unit, qty, reorder threshold.',
    'Or import from a simple sheet when available.',
    'Link recipes on Menu Editor so sales deduct stock.',
    'Watch low-stock badges before weekend rush.',
  ],
  highlight: '.sidebar-link[data-tab="inventory-tab"], #inventory-tab',
});

// ─── Menu ──────────────────────────────────────────────────
step({
  id: '19-menu',
  phase: '11 · Catalog',
  title: 'Menu Editor — items, prices, GST slab',
  where: 'dashboard',
  tab: 'editor-tab',
  seed: 'ensureMenu',
  goal: 'Publish what POS and guest QR both sell.',
  actions: [
    'Open Menu Editor.',
    'Create categories (Starters, Mains, Drinks…).',
    'Add item: name, price, veg/non-veg, GST slab (5% / 12% / 18%…).',
    'Optional: recipe link for inventory, addons, Hindi name.',
    'Save — item appears on POS after refresh/sync.',
    'Mark sold-out when kitchen is out of stock.',
  ],
  tips: ['India: most restaurant food 5%; some packaged drinks higher — ask your CA.'],
  highlight: '.sidebar-link[data-tab="editor-tab"], #editor-tab',
});

// ─── Employees ─────────────────────────────────────────────
step({
  id: '20-employees',
  phase: '12 · Team',
  title: 'Employees — roles and logins',
  where: 'dashboard',
  tab: 'employees-tab',
  goal: 'Give each staff member their own login and limited tabs.',
  actions: [
    'Open Employees.',
    'Add staff: name, username, password, role (cashier, waiter, kitchen, manager…).',
    'Limit tabs for cashiers (e.g. POS + Bills only).',
    'Test login once as that user.',
    'Deactivate login when someone leaves.',
  ],
  tips: ['Never share the owner password on the counter tablet.'],
  highlight: '.sidebar-link[data-tab="employees-tab"]',
});

// ─── Customers ─────────────────────────────────────────────
step({
  id: '21-customers',
  phase: '13 · CRM',
  title: 'Customers — CRM, loyalty, dues',
  where: 'dashboard',
  tab: 'customers-tab',
  seed: 'ensureCustomer',
  goal: 'Know regulars, points, and outstanding credit.',
  actions: [
    'Open Customers.',
    'Profiles build automatically when you bill with a phone number.',
    'Open a card: visits, spend, loyalty, notes, dues badge.',
    'Settle Dues: Cash / UPI / Card → receipt / WhatsApp.',
    'Use Due payment on POS only with a selected customer.',
  ],
  highlight: '.sidebar-link[data-tab="customers-tab"]',
});

// ─── Tax ───────────────────────────────────────────────────
step({
  id: '22-tax',
  phase: '14 · Compliance',
  title: 'Tax & GST workspace',
  where: 'dashboard',
  tab: 'tax-tab',
  goal: 'See GST collected and export accountant packs.',
  actions: [
    'Open Tax & GST.',
    'Review period stats (taxable supplies, CGST/SGST style totals).',
    'Download GSTR / period exports for your CA.',
    'Manage rate slabs if offered (country tax packs).',
  ],
  tips: ['Per-item GST is set in Menu Editor; outlet toggles are in Settings → Taxes.'],
  highlight: '.sidebar-link[data-tab="tax-tab"]',
});

// ─── Reports ───────────────────────────────────────────────
step({
  id: '23-reports',
  phase: '15 · Numbers',
  title: 'Sales Reports',
  where: 'dashboard',
  tab: 'reports-tab',
  seed: 'ensureBill',
  goal: 'See revenue, orders, payment mix, tax for Today / 30 days.',
  actions: [
    'Open Reports.',
    'Pick period: Today, This week, This month, Last 30 / 90 days.',
    'Read KPI cards: Revenue, Orders, AOV, Tax collected.',
    'Daily revenue bars and Payment mix donut.',
    'Top categories + Tax summary.',
    'Download GSTR-ready CSV for the accountant.',
  ],
  highlight: '.sidebar-link[data-tab="reports-tab"], #reports-tab',
});

// ─── Analytics ─────────────────────────────────────────────
step({
  id: '24-analytics',
  phase: '15 · Numbers',
  title: 'Analytics — deeper trends',
  where: 'dashboard',
  tab: 'analytics-tab',
  goal: 'Spot busy hours and bestsellers beyond the daily total.',
  actions: [
    'Open Analytics.',
    'Choose period and refresh if needed.',
    'Review revenue trend, peak hours, top items.',
    'Use insights before changing staffing or promos.',
  ],
  highlight: '.sidebar-link[data-tab="analytics-tab"]',
});

// ─── Growth Hub ────────────────────────────────────────────
step({
  id: '25-growth',
  phase: '16 · Growth Hub',
  title: 'Growth Hub launcher',
  where: 'dashboard',
  tab: 'growth-hub-tab',
  goal: 'Open ops tools beyond pure billing.',
  actions: [
    'Open Growth Hub.',
    'Tiles: Reservations, Support tickets, Purchase orders, Recipe costing,',
    'Offers & coupons, WhatsApp campaigns, Feedback, Loyalty.',
    'Tap a tile to open that module and complete the form.',
  ],
  highlight: '.sidebar-link[data-tab="growth-hub-tab"], #hub-grid, .hub-grid',
});

// ─── Settings ──────────────────────────────────────────────
step({
  id: '26-settings-profile',
  phase: '17 · Settings',
  title: 'Settings → Outlet profile',
  where: 'dashboard',
  tab: 'settings-tab',
  settingsPanel: 'profile',
  goal: 'Set name, address, phone, country, currency, GSTIN.',
  actions: [
    'Click Settings (gear) at the bottom of the sidebar.',
    'Open Outlet profile.',
    'Fill restaurant name, address, phone, GSTIN.',
    'Country & currency drive tax labels and ₹ formatting.',
    'Guest QR: Wi‑Fi name, password, welcome line for table tents.',
    'Save changes.',
  ],
  highlight: '#open-settings, .set-nav button[data-s="profile"]',
});

step({
  id: '27-settings-tax',
  phase: '17 · Settings',
  title: 'Settings → Taxes & pricing',
  where: 'dashboard',
  tab: 'settings-tab',
  settingsPanel: 'tax',
  goal: 'Turn tax on/off, set default rate, inclusive pricing, service charge.',
  actions: [
    'Settings → Taxes & pricing.',
    'Calculate taxes: ON for registered GST outlets (charges + prints tax).',
    'Tax label: GST. Tax rate %: default (often 5) when item has no slab.',
    'Inclusive pricing: ON if menu prices already include GST.',
    'Service charge: optional dine-in %.',
    'Show HSN: print HSN on invoice when you use codes.',
    'Save. Per-item rates still come from Menu Editor GST slab.',
  ],
  tips: ['OFF Calculate taxes = no tax on cart/print (special cases only).'],
  highlight: '.set-nav button[data-s="tax"], [data-skey="set_calculate_taxes"]',
});

step({
  id: '28-settings-print-wa',
  phase: '17 · Settings',
  title: 'Settings → Printers & WhatsApp',
  where: 'dashboard',
  tab: 'settings-tab',
  settingsPanel: 'printer',
  goal: 'Connect paper receipts and WhatsApp bills.',
  actions: [
    'Printers & KOT: preferred printer name, auto-print options.',
    'WhatsApp: scan gateway QR once on the office PC, keep gateway online.',
    'Test send; top-bar icon green = connected.',
    'On settle: WhatsApp PDF to customer phone when number is filled.',
  ],
  tips: ['Support: ' + SUPPORT],
  highlight: '.set-nav button[data-s="printer"], .set-nav button[data-s="gateway"]',
});

// ─── Daily close ───────────────────────────────────────────
step({
  id: '29-day-close',
  phase: '18 · End of day',
  title: 'End-of-day checklist',
  where: 'dashboard',
  tab: 'reports-tab',
  goal: 'Leave the till clean for tomorrow.',
  actions: [
    'Close open shifts on each station (cash count + Z-report).',
    'Reports → Today → match totals to cash + UPI.',
    'Download GSTR-ready CSV / day pack if needed.',
    'Bills export for accountant if requested.',
    'Backup export from Settings / Growth tools if available.',
    'Sign out on shared tablets.',
  ],
  tips: ['Keep one owner device signed in for overnight monitoring if desired.'],
  highlight: '.sidebar-link[data-tab="reports-tab"]',
});

step({
  id: '30-support',
  phase: '19 · Help',
  title: 'Help & support',
  where: 'dashboard',
  tab: 'pos-tab',
  goal: 'Know how to get unstuck.',
  actions: [
    'In-app Help / Demo checklist (Help button or right-click Help & Setup).',
    'Email: ' + SUPPORT,
    'Tell support: Outlet ID, username role, version chip (top bar), what you clicked.',
    'Screenshot of the error if possible.',
  ],
  highlight: 'button:has-text("Help"), #open-help, .sb-foot-btn',
});

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
  const selectors = [
    'button[aria-label="Close"]',
    '.modal-close',
    '#tour-skip-btn',
    '#tour-close-btn',
    'button:has-text("Skip")',
    'button:has-text("Got it")',
    'button:has-text("Later")',
    'button:has-text("Not now")',
    '#rs-demo-x',
    '.product-guide-backdrop button',
  ];
  for (const sel of selectors) {
    try {
      const el = page.locator(sel).first();
      if (await el.isVisible({ timeout: 300 }).catch(() => false)) {
        await el.click({ timeout: 600 }).catch(() => {});
      }
    } catch (_) {}
  }
  await page.keyboard.press('Escape').catch(() => {});
  await page.waitForTimeout(120);
}

async function highlight(page, selector) {
  if (!selector) return;
  await page.evaluate((sel) => {
    document.querySelectorAll('[data-ob-hi]').forEach((el) => {
      el.removeAttribute('data-ob-hi');
      el.style.outline = '';
      el.style.boxShadow = '';
      el.style.zIndex = '';
    });
    const nodes = document.querySelectorAll(sel);
    nodes.forEach((el, i) => {
      if (i > 4) return;
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

async function openDashboardTab(page, tabId, settingsPanel) {
  if (tabId === 'settings-tab') {
    const ham = page.locator('#sidebarToggle, .sidebar-hamburger').first();
    if (await ham.isVisible({ timeout: 800 }).catch(() => false)) await ham.click().catch(() => {});
    await page.waitForTimeout(400);
    await page.locator('#open-settings').click({ timeout: 8000 }).catch(async () => {
      await page.evaluate(() => {
        if (window.RS && RS.activateTab) RS.activateTab('settings-tab');
      });
    });
    await page.waitForTimeout(1000);
    if (settingsPanel) {
      const btn = page.locator('.set-nav button[data-s="' + settingsPanel + '"]').first();
      if (await btn.isVisible({ timeout: 2000 }).catch(() => false)) {
        await btn.click().catch(() => {});
        await page.waitForTimeout(700);
      }
    }
    return;
  }
  // Bottom mobile nav
  const mlink = page.locator('.mnav-link[data-tab="' + tabId + '"]').first();
  if (await mlink.count() && (await mlink.isVisible().catch(() => false))) {
    await mlink.click({ timeout: 5000 }).catch(() => {});
    await page.waitForTimeout(1200);
    return;
  }
  // Modules not on bottom bar → More or hamburger sidebar
  const more = page.locator('#mnav-more').first();
  if (await more.isVisible().catch(() => false)) {
    await more.click().catch(() => {});
    await page.waitForTimeout(500);
  }
  const ham2 = page.locator('#sidebarToggle, .sidebar-hamburger').first();
  if (await ham2.isVisible().catch(() => false)) {
    await ham2.click().catch(() => {});
    await page.waitForTimeout(400);
  }
  const link = page.locator('.sidebar-link[data-tab="' + tabId + '"]').first();
  if (await link.count() && (await link.isVisible().catch(() => false))) {
    await link.click({ timeout: 6000 }).catch(() => {});
  } else {
    await page.evaluate((id) => {
      if (window.RS && typeof RS.activateTab === 'function') RS.activateTab(id);
      else if (window.RS && typeof RS.switchTab === 'function') RS.switchTab(id);
    }, tabId);
  }
  await page.waitForTimeout(1400);
}

/** Seed sample data in the live session so empty tabs look real */
async function runSeed(page, name) {
  if (!name) return;
  await page.evaluate(async (seedName) => {
    const RS = window.RS || {};
    const toast = (m) => {
      try {
        if (RS.toast) RS.toast(m, 'fa-check');
      } catch (_) {}
    };
    function ensureArray(key, fallback) {
      if (!Array.isArray(RS[key])) RS[key] = fallback || [];
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
          if (!menu.find((m) => m.name === s.name)) menu.push(s);
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
        if (typeof RS.renderPOS === 'function') RS.renderPOS();
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
          if (!inv.find((x) => x.name === r.name)) inv.push(r);
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
        if (await t.isVisible().catch(() => false)) await t.click({ timeout: 1000 }).catch(() => {});
        await page.waitForTimeout(250);
      }
    } else {
      // Fallback: inject into cart through page JS if structure differs
      await page.evaluate(() => {
        try {
          if (window.RS && Array.isArray(RS.MENU) && RS.MENU[0] && typeof RS.addToCart === 'function') {
            RS.addToCart(RS.MENU[0]);
            if (RS.MENU[1]) RS.addToCart(RS.MENU[1]);
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
  if (await loginTab.isVisible().catch(() => false)) await loginTab.click().catch(() => {});
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
    if (!(await lock.isVisible().catch(() => false))) break;
    const retry = page.locator('#rs-license-retry');
    if (await retry.isVisible().catch(() => false)) await retry.click().catch(() => {});
    await page.waitForTimeout(1500);
  }
  console.log('Logged in', page.url());
}

async function captureStep(browser, page, s, index, total) {
  const file = path.join(SHOTS, s.id + '.png');
  process.stdout.write(`[${index + 1}/${total}] ${s.id} … `);

  try {
    async function shot() {
      // Full visible UI, no crop — clip to app shell when possible
      const app = page.locator('#app, body').first();
      if (await app.count()) {
        await app.screenshot({ path: file }).catch(async () => {
          await page.screenshot({ path: file, fullPage: true });
        });
      } else {
        await page.screenshot({ path: file, fullPage: true });
      }
    }

    if (s.where === 'google') {
      // Captcha-free mock of “what you see when you search” (real Google blocks bots)
      const mock = path.join(OUT_DIR, 'mock-google-search.html');
      await page.goto('file:///' + mock.replace(/\\/g, '/'), {
        waitUntil: 'domcontentloaded',
        timeout: 30000,
      });
      await page.waitForTimeout(400);
      await page.screenshot({ path: file, fullPage: true });
      console.log('OK (mock search — no captcha)');
      return true;
    }

    if (s.where === 'marketing') {
      await page.goto(BASE + '/', { waitUntil: 'domcontentloaded', timeout: 60000 });
      await page.waitForTimeout(2000);
      if (s.highlight) await highlight(page, s.highlight);
      await page.screenshot({ path: file, fullPage: true });
      await clearHighlight(page);
      console.log('OK');
      return true;
    }

    if (s.where === 'login' || s.where === 'register') {
      await page.goto(BASE + '/login.html', { waitUntil: 'domcontentloaded', timeout: 60000 });
      await page.waitForTimeout(1200);
      if (s.where === 'register') {
        const reg = page.locator('#tab-register-btn');
        if (await reg.isVisible().catch(() => false)) await reg.click();
        await page.waitForTimeout(600);
      } else {
        const log = page.locator('#tab-login-btn');
        if (await log.isVisible().catch(() => false)) await log.click();
        await page.waitForTimeout(400);
        await page.fill('#tenant-id', CREDS.outlet).catch(() => {});
        await page.fill('#username', CREDS.user).catch(() => {});
      }
      if (s.highlight) await highlight(page, s.highlight);
      await page.screenshot({ path: file, fullPage: true });
      await clearHighlight(page);
      console.log('OK');
      return true;
    }

    // dashboard steps — ensure logged in
    if (!page.url().includes('dashboard')) {
      await login(page);
    }
    await dismissOverlays(page);
    if (s.seed) await runSeed(page, s.seed);
    if (s.seed === 'ensureCartItems') await seedCartViaUi(page);
    if (s.tab) await openDashboardTab(page, s.tab, s.settingsPanel);
    await page.waitForTimeout(1000);
    await dismissOverlays(page);
    if (s.highlight) await highlight(page, s.highlight);
    await shot();
    await clearHighlight(page);
    console.log('OK');
    return true;
  } catch (e) {
    console.log('FAIL', e.message);
    try {
      await page.screenshot({ path: file, fullPage: true });
    } catch (_) {}
    return false;
  }
}

/** Exhaustive control maps — what each control does / next screen */
const DETAIL = {
  '01-google-search': [
    { btn: 'Search box', why: 'You type the product name', does: 'Shows results for CodeArc RestroSuite', next: 'Open the official site link' },
    { btn: 'Official result restrosuite.codearc.co.in', why: 'This is the real product', does: 'Opens the RestroSuite homepage', next: 'Homepage / marketing page' },
    { btn: 'Sign-in result /login.html', why: 'Direct access for staff', does: 'Opens Access page', next: 'Login or Register' },
  ],
  '02-homepage': [
    { btn: 'Sign Up Free', why: 'New outlet owners start here', does: 'Opens Register outlet flow', next: 'Registration form' },
    { btn: 'Sign in', why: 'Existing outlets and staff', does: 'Opens Access → Sign in', next: 'Login form' },
    { btn: 'Features section', why: 'Explains POS, WhatsApp, QR, CRM', does: 'Scrolls/marketing only', next: 'Decide to try the product' },
    { btn: 'Live demo sandbox (if shown)', why: 'Try a fake bill without signup', does: 'Simulates Print & Pay', next: 'Still need real register for your outlet' },
  ],
  '03-login-page': [
    { btn: 'Sign in tab', why: 'Existing workspace', does: 'Shows login fields', next: 'Fill Outlet ID + user + password' },
    { btn: 'Register outlet tab', why: 'Brand-new restaurant', does: 'Shows multi-step register form', next: 'Create workspace' },
    { btn: 'Forgot password / Recover', why: 'Lost owner password', does: 'Opens recovery with email code', next: 'Reset password email' },
    { btn: 'Theme toggle', why: 'Light/dark preference', does: 'Switches theme', next: 'Same page, new theme' },
  ],
  '04-register-form': [
    { btn: 'Business / restaurant name', why: 'Shown on bills and UI', does: 'Stores display name', next: 'Still need workspace code' },
    { btn: 'Workspace code (Outlet ID)', why: 'Unique login slug staff type every day', does: 'Creates saas tenant slug', next: 'Must remember this code' },
    { btn: 'Country + currency', why: 'Tax system and ₹/€ symbols', does: 'Seeds defaults', next: 'Tax label GST/VAT etc.' },
    { btn: 'Owner phone / email', why: 'Recovery and support contact', does: 'Saves on tenant', next: 'OTP if enabled' },
    { btn: 'Password + confirm', why: 'Owner security', does: 'Hashes password', next: 'Create outlet → then Sign in' },
    { btn: 'Create my outlet', why: 'Submit registration', does: 'Provisions cloud workspace', next: 'Sign in with new Outlet ID' },
  ],
  '05-login-form': [
    { btn: 'Workspace / Outlet ID', why: 'Which restaurant database', does: 'Scopes the login', next: 'Must match registration code' },
    { btn: 'Username', why: 'Which staff account', does: 'Loads role + allowed tabs', next: 'Owner vs cashier see different menus' },
    { btn: 'Password', why: 'Prove identity', does: 'Validates credentials', next: 'Session token stored' },
    { btn: 'Keep me signed in', why: 'Trusted device only', does: 'Remember-me blob in browser', next: 'Next visit skips retype' },
    { btn: 'Sign in securely', why: 'Enter the console', does: 'Redirects to dashboard POS', next: 'Point of Sale screen' },
  ],
  '06-shell-overview': [
    { btn: 'Left sidebar links', why: 'Jump between modules', does: 'Opens that tab in main area', next: 'POS / Kitchen / Bills…' },
    { btn: 'Top bar Shift', why: 'Cash session for the day', does: 'Open/close shift modals', next: 'Z-report on close' },
    { btn: 'Top bar WhatsApp icon', why: 'Bill send status', does: 'Green=connected / red=off', next: 'Settings → WhatsApp to fix' },
    { btn: 'Version chip', why: 'Support needs build id', does: 'Click copies full version', next: 'Paste in support email' },
    { btn: 'Settings (gear)', why: 'Outlet configuration', does: 'Opens Settings tab', next: 'Profile / Tax / Printers…' },
    { btn: 'Help', why: 'Setup tour and checklist', does: 'Opens product guide / demo steps', next: 'Guided tour' },
    { btn: 'Sign out', why: 'Leave secure session', does: 'Clears session', next: 'Login page' },
  ],
  '07-sidebar-map': [
    { btn: 'Point of Sale', why: 'Sell and bill', does: 'Opens POS', next: 'Cart + menu' },
    { btn: 'QR Orders', why: 'Guest self-orders waiting', does: 'Opens accept/reject queue', next: 'Kitchen after accept' },
    { btn: 'Kitchen', why: 'Cook screen', does: 'Opens KDS', next: 'Mark ready' },
    { btn: 'Floor & Tables', why: 'Dining room map', does: 'Opens table grid', next: 'Seat / hold / QR print' },
    { btn: 'Online Orders', why: 'Delivery channels', does: 'Opens online queue', next: 'Accept/reject' },
    { btn: 'Bills', why: 'History & reprint', does: 'Opens bills list', next: 'Search / export / refund' },
    { btn: 'Inventory', why: 'Stock control', does: 'Opens stock', next: 'Add items / low stock' },
    { btn: 'Menu Editor', why: 'Prices & GST slabs', does: 'Opens catalog', next: 'Add/edit items' },
    { btn: 'Employees', why: 'Staff logins', does: 'Opens staff list', next: 'Add role-limited users' },
    { btn: 'Customers', why: 'CRM & dues', does: 'Opens customer cards', next: 'Settle dues / notes' },
    { btn: 'Tax & GST', why: 'Compliance view', does: 'Opens tax workspace', next: 'Exports for CA' },
    { btn: 'Reports', why: 'Sales KPIs', does: 'Opens sales reports', next: 'CSV / GSTR download' },
    { btn: 'Analytics', why: 'Trends', does: 'Opens analytics', next: 'Peak hours / top items' },
    { btn: 'Growth Hub', why: 'Extra ops tools', does: 'Opens tile launcher', next: 'Reservations, POs, offers…' },
  ],
  '08-pos-empty-ready': [
    { btn: 'Search menu box', why: 'Find items fast in rush', does: 'Filters tiles by name/code', next: 'Fewer tiles shown' },
    { btn: 'Sort & card size (sliders)', why: 'Comfortable grid', does: 'Changes sort and tile size', next: 'Same menu, new layout' },
    { btn: 'Category chips', why: 'Browse by section', does: 'Filters by category', next: 'Only that category items' },
    { btn: 'Menu item tile', why: 'Add to bill', does: 'Adds line to cart (+1 qty)', next: 'Cart updates total' },
    { btn: 'Order type icons (bag / utensils / bike)', why: 'Takeaway vs dine-in vs delivery', does: 'Sets order channel', next: 'May show table or delivery fields' },
    { btn: 'Cart count pill', why: 'How many lines', does: 'Display only', next: '—' },
    { btn: 'Clear cart (trash)', why: 'Cancel whole order', does: 'Empties cart', next: 'Empty cart state' },
  ],
  '09-pos-add-items': [
    { btn: 'Item + / − qty', why: 'Change quantity', does: 'Updates line qty and totals', next: 'Tax recalculates' },
    { btn: 'Line note', why: 'Kitchen instructions', does: 'Saves note on line', next: 'Shows on KOT/KDS' },
    { btn: 'Add customer toggle', why: 'CRM / WhatsApp / Due', does: 'Opens name+phone fields', next: 'Customer linked to bill' },
    { btn: 'Table dropdown', why: 'Dine-in table', does: 'Binds order to table', next: 'Floor shows occupied' },
    { btn: 'Covers / pax', why: 'Guest count', does: 'Stores covers', next: 'Reports / floor info' },
    { btn: 'Discount controls (if shown)', why: 'Promo or manager disc', does: 'Reduces subtotal', next: 'Tax on net' },
  ],
  '10-pos-pay': [
    { btn: 'Cash', why: 'Cash tender', does: 'Selects cash payment', next: 'May open cash received UI' },
    { btn: 'UPI', why: 'UPI / QR pay', does: 'Selects UPI', next: 'Settle with UPI' },
    { btn: 'Card', why: 'Card machine', does: 'Selects card', next: 'Settle' },
    { btn: 'Split', why: 'Multi tender', does: 'Opens split amounts', next: 'Partial cash+UPI etc.' },
    { btn: 'Due', why: 'Credit sale', does: 'Requires customer', next: 'Adds to customer dues' },
    { btn: 'Print & Pay', why: 'Finish sale', does: 'Creates paid bill, inventory, KDS', next: 'Bill settled modal' },
    { btn: 'WhatsApp on settle', why: 'Send PDF bill', does: 'Queues WhatsApp send', next: 'Customer phone receives bill' },
    { btn: 'Thermal / Print', why: 'Paper receipt', does: 'Prints ESC/POS or browser print', next: 'Physical receipt' },
  ],
  '11-pos-shift': [
    { btn: 'Open shift', why: 'Start cash session', does: 'Records float', next: 'Bills tag this shift' },
    { btn: 'Close shift', why: 'End cash session', does: 'Asks counted cash', next: 'Z-report variance' },
    { btn: 'Preview Z', why: 'Check before close', does: 'Shows expected cash', next: 'Still open shift' },
    { btn: 'Station label', why: 'Multi-counter identity', does: 'Renames station', next: 'Reports filter by station' },
  ],
  '12-floor': [
    { btn: 'Table card (free)', why: 'Seat guests', does: 'Seat & order / open actions', next: 'POS with that table' },
    { btn: 'Table card (occupied)', why: 'Work open check', does: 'Checkout / transfer / print', next: 'POS cart or free table' },
    { btn: 'Hold', why: 'Pause order', does: 'Saves draft', next: 'Held state on floor' },
    { btn: 'Transfer', why: 'Move guests', does: 'Moves tickets to free table', next: 'Old free, new occupied' },
    { btn: 'Clear / free', why: 'Turn table', does: 'Removes open tickets (confirm)', next: 'Table free' },
    { btn: 'Edit tables / Save layout', why: 'Change floor plan', does: 'Add/remove tables to cloud', next: 'New map for all stations' },
  ],
  '13-floor-qr-print': [
    { btn: 'Print Table QRs', why: 'Mass print tents', does: 'Opens size + preview modal', next: 'Browser print sheet' },
    { btn: 'Size presets', why: 'Fit table space', does: 'Rebuilds card layout', next: 'Preview updates' },
    { btn: 'Toggles (Wi‑Fi, steps…)', why: 'What guests see', does: 'Shows/hides card lines', next: 'Print reflects toggles' },
    { btn: 'Open all QR / Close all', why: 'Bulk session control', does: 'Opens/closes guest QR per table', next: 'Guests can/cannot order' },
  ],
  '14-qr-orders': [
    { btn: 'Accept', why: 'Send to kitchen', does: 'Confirms guest order', next: 'KDS ticket' },
    { btn: 'Reject', why: 'Wrong/test order', does: 'Drops ticket', next: 'Guest may reorder' },
    { btn: 'Amend (if shown)', why: 'Change before prep', does: 'Edits shared table order', next: 'Updated kitchen lines' },
  ],
  '15-kds': [
    { btn: 'Ticket card', why: 'One order for cooks', does: 'Shows items + table/token', next: 'Tap to progress status' },
    { btn: 'Mark ready / done', why: 'Food finished', does: 'Advances status', next: 'Service/pickup' },
    { btn: 'Clear', why: 'Remove from board', does: 'Removes finished ticket', next: 'Cleaner KDS' },
  ],
  '16-online': [
    { btn: 'Accept order', why: 'Take delivery job', does: 'Routes to kitchen/billing', next: 'KDS / active order' },
    { btn: 'Reject', why: 'Cannot fulfil', does: 'Declines ticket', next: 'Channel notified if linked' },
    { btn: 'Manual online entry', why: 'Phone order', does: 'Creates online ticket', next: 'Same accept flow' },
  ],
  '17-bills': [
    { btn: 'Search box', why: 'Find old bill', does: 'Filters by no/phone/name', next: 'Matching rows' },
    { btn: 'Bill row', why: 'Inspect invoice', does: 'Opens detail', next: 'Reprint / refund actions' },
    { btn: 'Reprint', why: 'Lost paper', does: 'Prints again', next: 'Same receipt' },
    { btn: 'Refund/void', why: 'Correct mistakes', does: 'PIN gate then void', next: 'Status refunded' },
    { btn: 'Export CSV', why: 'Accountant handoff', does: 'Downloads file', next: 'Excel / CA tools' },
  ],
  '18-inventory': [
    { btn: 'Add stock', why: 'New ingredient', does: 'Opens add modal', next: 'Row in stock list' },
    { btn: 'Qty / reorder fields', why: 'Track levels', does: 'Saves thresholds', next: 'Low stock alerts' },
    { btn: 'Import (if shown)', why: 'Bulk load', does: 'Reads sheet', next: 'Many rows at once' },
  ],
  '19-menu': [
    { btn: 'Add item', why: 'Sell something new', does: 'Opens editor form', next: 'Name price GST save' },
    { btn: 'GST slab dropdown', why: 'Correct tax per dish', does: 'Sets taxCategory', next: 'POS tax uses this' },
    { btn: 'Category', why: 'POS navigation', does: 'Groups tiles', next: 'Category chips' },
    { btn: 'Recipe link', why: 'Auto stock deduct', does: 'Binds ingredients', next: 'Inventory drops on sale' },
    { btn: 'Save', why: 'Publish', does: 'Writes menu', next: 'Visible on POS/QR' },
  ],
  '20-employees': [
    { btn: 'Add employee', why: 'New staff login', does: 'Creates user', next: 'They can sign in' },
    { btn: 'Role selector', why: 'Limit power', does: 'Sets allowed tabs', next: 'Cashier sees fewer modules' },
    { btn: 'Deactivate', why: 'Ex-staff', does: 'Blocks login', next: 'Cannot sign in' },
  ],
  '21-customers': [
    { btn: 'Customer card', why: 'Open profile', does: 'Shows history/dues', next: 'Settle or note' },
    { btn: 'Settle dues', why: 'Collect credit', does: 'Payment modal', next: 'Dues reduce + receipt' },
    { btn: 'Search customers', why: 'Find phone/name', does: 'Filters grid', next: 'Matching cards' },
  ],
  '22-tax': [
    { btn: 'Period selectors', why: 'Month for return', does: 'Filters stats', next: 'Updated totals' },
    { btn: 'GSTR / CSV / PDF buttons', why: 'CA pack', does: 'Downloads file', next: 'File for accountant' },
    { btn: 'Rate slabs editor', why: 'Country rates', does: 'Edits tax_rates', next: 'ResolveRate uses them' },
  ],
  '23-reports': [
    { btn: 'Today / Week / Month / 30 / 90', why: 'Time range', does: 'Recomputes KPIs', next: 'New charts' },
    { btn: 'Daily revenue bars', why: 'See busy days', does: 'Hover for value', next: '—' },
    { btn: 'Payment mix donut', why: 'Cash vs UPI', does: 'Shows split', next: '—' },
    { btn: 'Download GSTR-ready CSV', why: 'Compliance export', does: 'CSV file', next: 'CA software' },
  ],
  '24-analytics': [
    { btn: 'Period control', why: 'Range for trends', does: 'Reloads analytics', next: 'New charts' },
    { btn: 'Top items / peak hour', why: 'Decide staffing', does: 'Shows rankings', next: 'Ops decisions' },
  ],
  '25-growth': [
    { btn: 'Reservations tile', why: 'Bookings', does: 'Opens reservations UI', next: 'Add booking' },
    { btn: 'Purchase Orders', why: 'Buy stock', does: 'Opens PO UI', next: 'Raise PO' },
    { btn: 'Offers & coupons', why: 'Promos', does: 'Opens offers', next: 'Create code' },
    { btn: 'Recipe costing', why: 'Margins', does: 'Cost calculator', next: 'Price decisions' },
    { btn: 'Feedback / Loyalty / Campaigns', why: 'Growth', does: 'Respective modules', next: 'Engage guests' },
  ],
  '26-settings-profile': [
    { btn: 'Restaurant name / address / phone', why: 'Bills & QR cards', does: 'Saves profile', next: 'Prints show new name' },
    { btn: 'Country / currency', why: 'Tax + money format', does: 'Updates RS_SETTINGS', next: '₹ and GST defaults' },
    { btn: 'GSTIN', why: 'Legal invoice', does: 'Prints on bill', next: 'Compliant receipt' },
    { btn: 'Guest Wi‑Fi + welcome', why: 'QR tents', does: 'Stored for print', next: 'Print Table QRs uses them' },
    { btn: 'Save', why: 'Persist', does: 'Cloud + local', next: 'All stations sync' },
  ],
  '27-settings-tax': [
    { btn: 'Calculate taxes ON/OFF', why: 'Master tax switch', does: 'POS tax = 0 if off', next: 'Bills/print follow' },
    { btn: 'Tax label', why: 'GST vs VAT word', does: 'UI + receipts wording', next: 'Printed label' },
    { btn: 'Tax rate %', why: 'Default when item has no slab', does: 'Fallback percent', next: 'Menu slab still wins if set' },
    { btn: 'Inclusive pricing', why: 'Price includes tax?', does: 'Extract vs add tax', next: 'Totals change' },
    { btn: 'Service charge + %', why: 'Dine-in SC', does: 'Adds SC line', next: 'May tax SC if enabled' },
    { btn: 'Show HSN', why: 'Invoice detail', does: 'Print HSN if present', next: 'GST-style bill' },
  ],
  '28-settings-print-wa': [
    { btn: 'Preferred printer', why: 'Which device prints', does: 'Routes print bridge', next: 'Thermal out' },
    { btn: 'Auto-print toggles', why: 'Hands-free settle', does: 'Prints on pay', next: 'Paper without extra click' },
    { btn: 'WhatsApp Get QR / status', why: 'Link restaurant number', does: 'Session to gateway', next: 'Green icon = ready' },
    { btn: 'Send test', why: 'Verify path', does: 'Test message', next: 'Phone receives test' },
  ],
  '29-day-close': [
    { btn: 'Close shift', why: 'Cash reconciliation', does: 'Z-report', next: 'Print/CSV variance' },
    { btn: 'Reports → Today', why: 'Match sales', does: 'Period KPIs', next: 'Compare to drawer' },
    { btn: 'GSTR CSV', why: 'CA pack', does: 'Download', next: 'Email accountant' },
    { btn: 'Sign out', why: 'Secure device', does: 'Ends session', next: 'Login screen' },
  ],
  '30-support': [
    { btn: 'Help', why: 'In-app guidance', does: 'Guide / checklist', next: 'Tour steps' },
    { btn: 'Email support@codearc.co.in', why: 'Human help', does: 'Opens mail client', next: 'Reply from CodeArc' },
    { btn: 'Version chip', why: 'Identify build', does: 'Copy id', next: 'Paste in ticket' },
  ],
};

function buildHtml() {
  const logo = toDataUri(path.join(ROOT, 'assets', 'restrosuite-mark.png'));
  const pages = [];

  // Cover
  pages.push(`
  <section class="page cover">
    <div class="top">
      <div class="brand">${logo ? `<img src="${logo}" alt="">` : ''}<div><b>CodeArc RestroSuite</b><div class="sub">Complete Client Onboarding Guide · Mobile / Android</div></div></div>
      <div class="pill">Every button explained · New user edition</div>
    </div>
    <div class="mid">
      <h1>Phone &amp; Android guide<br>Bottom tabs · hamburger · More<br>Touch-first full walkthrough.</h1>
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
        ? `<figure class="fullshot-wide"><img src="${uri}" alt="${esc(s.title)}"><figcaption>Full screen · nothing cropped · orange outline = focus control</figcaption></figure>`
        : `<div class="fullshot-wide empty">Screenshot missing — open live site and follow the detail page for this step.</div>`
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
  @page { size: A4 portrait; margin: 0; }
  * { box-sizing: border-box; margin: 0; padding: 0; }
  html, body {
    font-family: "Segoe UI", system-ui, sans-serif;
    color: #1a1917;
    background: #fff;
    -webkit-print-color-adjust: exact;
    print-color-adjust: exact;
  }
  .page {
    width: 210mm;
    height: 297mm;
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

  /* Full screenshot page — image never cropped */
  .shot-only-page { padding-bottom: 12mm; }
  .shot-title { font-size: 18px; margin: 3mm 10mm 1mm; letter-spacing: -.02em; }
  .shot-goal { font-size: 11.5px; margin: 0 10mm 2mm; color: #4a4640; line-height: 1.4; }
  .fullshot-wide {
    margin: 0 10mm;
    border-radius: 10px;
    overflow: hidden;
    border: 1px solid #e0dbd0;
    background: #f4f1ea;
    height: 175mm;
    display: flex;
    flex-direction: column;
  }
  .fullshot-wide img {
    width: 100%;
    height: 100%;
    object-fit: contain; /* ENTIRE screen visible — no crop */
    object-position: top center;
    display: block;
    background: #f4f1ea;
  }
  .fullshot-wide figcaption {
    font-size: 10px; color: #7a756c; padding: 4px 10px; background: #faf8f4;
    border-top: 1px solid #eeeae2; flex: none;
  }
  .fullshot-wide.empty {
    display: grid; place-items: center; color: #999; font-size: 13px; padding: 20px; text-align: center;
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
    width: 100%; border-collapse: collapse; font-size: 10.5px; margin-top: 2mm;
  }
  .ctrl th {
    background: #1A1714; color: #fff; text-align: left; padding: 6px 8px; font-size: 10px;
  }
  .ctrl td {
    border: 1px solid #e8e4db; padding: 5px 7px; vertical-align: top; line-height: 1.35; color: #2c2925;
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
      landscape: false,
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
        landscape: false,
        format: 'A4',
        margin: { top: '0', right: '0', bottom: '0', left: '0' },
      });
      console.warn('Wrote alternate PDF (file locked):', PDF_ALT);
    } else throw e;
  }
  await browser.close();
  console.log('PDF', out, ((fs.statSync(out).size / 1024 / 1024).toFixed(2)) + ' MB');
  return out;
}

async function main() {
  ensureDirs();
  fs.writeFileSync(MANIFEST, JSON.stringify(STEPS, null, 2));
  console.log('=== Complete Onboarding Guide (Mobile / Android) ===');
  console.log('Steps:', STEPS.length);
  console.log('Base:', BASE);

  const skip = process.env.RS_SKIP_CAPTURE === '1';
  if (!skip) {
    const browser = await chromium.launch({
      headless: true,
      args: ['--disable-dev-shm-usage'],
    });
    const context = await browser.newContext({
      isMobile: true,
      hasTouch: true,
      viewport: { width: 390, height: 844 },
      deviceScaleFactor: 1.1,
      userAgent:
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36',
    });
    const page = await context.newPage();
    page.setDefaultTimeout(45000);

    let dashPage = page;
    try {
      await login(dashPage);
    } catch (e) {
      console.warn('Login warn:', e.message);
    }

    for (let i = 0; i < STEPS.length; i++) {
      const s = STEPS[i];
      if (s.where === 'google' || s.where === 'marketing' || s.where === 'login' || s.where === 'register') {
        const p = await context.newPage();
        await p.setViewportSize({ width: 390, height: 844 });
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
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
