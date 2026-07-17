/**
 * Exhaustive client onboarding steps + control maps for RestroSuite.
 * Super-Admin / Gateway / Chain-admin excluded (not for outlet clients).
 * Used by generate-onboarding-guide.cjs and generate-onboarding-guide-mobile.cjs
 */
'use strict';

function buildOnboardingContent({ SUPPORT, SITE, mobile }) {
  const STEPS = [];
  function step(def) {
    const title = mobile && def.mobileTitle ? def.mobileTitle : def.title;
    const actions = mobile && def.mobileActions ? def.mobileActions : def.actions || [];
    const goal = mobile && def.mobileGoal ? def.mobileGoal : def.goal || '';
    STEPS.push({
      id: def.id,
      phase: def.phase || 'Guide',
      title,
      goal,
      actions,
      tips: def.tips || [],
      highlight: def.highlight || null,
      where: def.where || 'dashboard',
      tab: def.tab || null,
      settingsPanel: def.settingsPanel || null,
      invTab: def.invTab || null,
      empSeg: def.empSeg || null,
      growthTile: def.growthTile || null,
      seed: def.seed || null,
      prep: def.prep || null,
      fullPage: false,
    });
  }

  const navHint = mobile
    ? 'Bottom bar: POS · Orders · Kitchen · Bills · Reports · More. Other modules open from More → All sections.'
    : 'Left sidebar groups: OPERATIONS · MANAGE · GROW. Settings / Help / Sign out at the bottom.';

  // ═══════════════════════════════════════════════════════════
  // 1 · Discovery
  // ═══════════════════════════════════════════════════════════
  step({
    id: '01-google-search',
    phase: '1 · Find RestroSuite',
    title: 'Search for CodeArc RestroSuite on Google',
    where: 'google',
    goal: 'A new owner finds the official product without a salesperson.',
    actions: [
      'Open Google on phone or computer.',
      'Type: CodeArc RestroSuite (or restrosuite codearc).',
      'Open the official result restrosuite.codearc.co.in (or CodeArc RestroSuite).',
      'Ignore look-alike ads or third-party blogs — use the CodeArc domain only.',
    ],
    tips: ['Bookmark the site for staff. Prefer restrosuite.codearc.co.in.'],
  });

  step({
    id: '02-homepage',
    phase: '1 · Find RestroSuite',
    title: 'Homepage — product promise',
    where: 'marketing',
    goal: 'Understand offline POS, WhatsApp bills, QR ordering, kitchen display, free launch.',
    actions: [
      'Read the hero: offline-first restaurant console by CodeArc.',
      'Note free during launch / no credit card for trial when shown.',
      'Click Sign Up Free (new outlet) or Sign in (existing).',
    ],
    tips: ['Support for all help: ' + SUPPORT],
    highlight: 'a.btn-primary, .hero-actions a, a[href*="login"]',
  });

  step({
    id: '02b-homepage-features',
    phase: '1 · Find RestroSuite',
    title: 'Homepage — Features, Live Demo, Compare',
    where: 'marketing',
    prep: 'scrollMarketingFeatures',
    goal: 'See feature list and try the sandbox before registering.',
    actions: [
      'Open Features in the top nav (or scroll to Features).',
      'Read POS, Kitchen Display, WhatsApp bills, QR table ordering, CRM.',
      'Open Live Demo if shown — try a fake Print & Pay without signup.',
      'Open Compare if shown — see how RestroSuite differs from paper / other POS.',
      'Testimonials / trusted outlets strip is social proof only.',
    ],
    highlight: 'a[href*="feature"], #features, .features',
  });

  // ═══════════════════════════════════════════════════════════
  // 2 · Access
  // ═══════════════════════════════════════════════════════════
  step({
    id: '03-login-page',
    phase: '2 · Access',
    title: 'Access page — Sign in vs Register',
    where: 'login',
    goal: 'Know the two paths: existing staff sign in; new owners register an outlet.',
    actions: [
      'Go to ' + SITE + '/login.html (or Sign in from homepage).',
      'Sign in tab = existing workspace + staff username.',
      'Register outlet tab = brand-new restaurant workspace.',
      'Theme toggle (sun/moon) switches light/dark on this page only until you log in.',
    ],
    highlight: '#tab-login-btn, #tab-register-btn, .tab-btn',
  });

  step({
    id: '04-register-form',
    phase: '2 · Access',
    title: 'Register a new outlet — every field',
    where: 'register',
    goal: 'Create workspace: business name, Outlet ID, owner contact, password, country & currency.',
    actions: [
      'Click Register outlet.',
      'Business / restaurant display name (shown on bills and QR cards).',
      'Workspace code / Outlet ID — short slug e.g. royal-dhaba (letters, numbers, hyphens). NOT the display name. Staff type this every day.',
      'Owner WhatsApp / phone and email (recovery + support).',
      'Country and currency (tax label GST/VAT and ₹ / € symbols).',
      'Business type if shown (Restaurant / retail / etc.) — set at registration.',
      'Password 10+ characters + confirm. Complete OTP if shown.',
      'Submit Create my outlet → wait for success → Sign in with the new Outlet ID.',
    ],
    tips: [
      'Write down Outlet ID + owner username + password.',
      'Never share the owner password on the floor — create staff logins under Employees.',
    ],
    highlight: '#tab-register-btn, #register-form, #reg-slug, #reg-password',
  });

  step({
    id: '05-login-form',
    phase: '2 · Access',
    title: 'Sign in — Outlet ID, user, password',
    where: 'login',
    goal: 'Enter an existing outlet with staff or owner credentials.',
    actions: [
      'Open Sign in tab.',
      'Workspace / Outlet ID: e.g. bbb (registration code, not restaurant name).',
      'Email or Username: staff or owner username.',
      'Password.',
      'Optional: Keep me signed in — only on trusted devices.',
      'Click Sign in securely → lands on Point of Sale.',
    ],
    tips: [
      'Wrong Outlet ID is the #1 login error.',
      'Role (cashier / kitchen / waiter / manager / owner) controls which tabs appear after login.',
    ],
    highlight: '#login-form, #tenant-id, #username, #password, #login-submit',
  });

  step({
    id: '05b-recover-password',
    phase: '2 · Access',
    title: 'Forgot password / Recover access',
    where: 'login',
    prep: 'openRecover',
    goal: 'Reset owner/staff password when locked out.',
    actions: [
      'On Access page click Forgot password / Recover access (wording may vary).',
      'Enter Outlet ID + registered email or phone.',
      'Request code → enter OTP / link from email or WhatsApp.',
      'Set a new strong password → return to Sign in.',
    ],
    tips: ['If recovery email never arrives, contact ' + SUPPORT + ' with Outlet ID.'],
    highlight: 'a[href*="recover"], button:has-text("Recover"), button:has-text("Forgot"), #tab-recover',
  });

  // ═══════════════════════════════════════════════════════════
  // 3 · Shell
  // ═══════════════════════════════════════════════════════════
  step({
    id: '06-shell-overview',
    phase: '3 · Workspace shell',
    title: mobile ? 'After login — mobile layout' : 'After login — console layout',
    where: 'dashboard',
    tab: 'pos-tab',
    goal: 'Know where navigation, top bar tools, and the active module live.',
    actions: mobile
      ? [
          navHint,
          'Main area = active module (starts on POS).',
          'Top bar: lock/station, tools, WhatsApp status, time, notifications, version.',
          'On POS with items: orange CHECKOUT bar at the bottom.',
        ]
      : [
          navHint,
          'Main area = active module screen.',
          'Top bar: station label, Shift, search, support, WhatsApp, time, bell, settings shortcut, version chip (e.g. v209).',
          'Sidebar foot: Settings, Help, Sign out.',
        ],
    tips: ['Click/long-press the version chip to copy the full build id for support tickets.'],
    highlight: mobile ? '.mobile-nav, .mnav-link' : '.sidebar, .topbar, #open-settings',
  });

  step({
    id: '07-sidebar-map',
    phase: '3 · Workspace shell',
    title: mobile ? 'More menu — every module' : 'Sidebar map — every client module',
    where: 'dashboard',
    tab: 'pos-tab',
    prep: mobile ? 'openMoreSheet' : null,
    goal: 'Memorise where each daily job lives.',
    actions: mobile
      ? [
          'Tap More (⋯) on the bottom bar.',
          'All sections grid: Floor & Tables, Online Orders, Token Display (if enabled), Inventory, Menu Editor,',
          'Customers, Tax & GST, Employees, Advanced Analytics, Growth Hub, Settings, Sign out.',
          'POS · Orders · Kitchen · Bills · Reports stay on the bottom bar for one-tap access.',
        ]
      : [
          'OPERATIONS: Point of Sale, QR Orders, Kitchen, Floor & Tables, Online Orders, Bills.',
          'MANAGE: Kitchen Setup (coach), Inventory, Menu Editor, Employees, Customers, Tax & GST.',
          'GROW: Reports, Analytics, Growth Hub.',
          'FOOT: Settings, Help, Sign out.',
          'Your role may hide links — cashiers often see only POS + Bills.',
        ],
    tips: ['Restricted roles never see Super-Admin or Gateway (those are CodeArc ops only).'],
    highlight: mobile ? '#mnav-more, .hub-card[data-go]' : '.sidebar, .sidebar-link',
  });

  step({
    id: '07b-topbar-tools',
    phase: '3 · Workspace shell',
    title: 'Top bar tools — station, search, support, alerts',
    where: 'dashboard',
    tab: 'pos-tab',
    goal: 'Use global tools without leaving the current module.',
    actions: [
      'Station label (e.g. Counter 1) — rename when multiple devices bill; reports filter by station.',
      'Shift chip — Open / Close shift (cash float + Z-report).',
      'Global search — jump to menu items, bills, or modules when available.',
      'Support / call menu — contact options for ' + SUPPORT + '.',
      'WhatsApp icon — green = gateway connected; red/grey = bills may not send.',
      'Bell — notifications (low stock, QR orders, system).',
      'Theme / density controls if shown.',
    ],
    highlight: '.topbar, #rs-shift-open, #rs-shift-close, #tb-call-support, #tb-support-wrap',
  });

  // ═══════════════════════════════════════════════════════════
  // 4 · POS deep
  // ═══════════════════════════════════════════════════════════
  step({
    id: '08-pos-empty-ready',
    phase: '4 · Point of Sale',
    title: 'POS home — menu grid + cart shell',
    where: 'dashboard',
    tab: 'pos-tab',
    seed: 'ensureMenu',
    goal: 'Sell takeaway, dine-in, or delivery from one counter screen.',
    actions: [
      'Open Point of Sale (default after login).',
      'Menu search box filters by name or item code.',
      'Category chips filter the grid; sort and +/− card size adjust layout.',
      'Tap a tile to add a line to the cart.',
      'Cart shows lines, subtotal, tax, grand total.',
      mobile
        ? 'With items: orange CHECKOUT bar opens the cart sheet.'
        : 'Right panel cart is always visible on desktop.',
    ],
    highlight: '#pos-tab, .pos-grid, .order-types',
  });

  step({
    id: '08b-pos-order-types',
    phase: '4 · Point of Sale',
    title: 'Order type — Takeaway · Dine-in · Delivery',
    where: 'dashboard',
    tab: 'pos-tab',
    seed: 'ensureCartItems',
    prep: 'showOrderTypes',
    goal: 'Correct channel so table, delivery address, and packaging rules apply.',
    actions: [
      'Bag icon = Takeaway (default walk-in).',
      'Utensils icon = Dine-in — pick Table + covers (pax).',
      'Bike icon = Delivery — fill address / phone fields when shown.',
      'Change type before settling; packaging (Takeaway pack) may deduct inventory on takeaway/delivery.',
    ],
    highlight: '#pos-cart-order-types, .order-type-btn, #cart-table, #cart-covers, #cart-delivery-details',
  });

  step({
    id: '09-pos-add-items',
    phase: '4 · Point of Sale',
    title: 'Build the cart — qty, notes, portions',
    where: 'dashboard',
    tab: 'pos-tab',
    seed: 'ensureCartItems',
    goal: 'Build an accurate order during rush.',
    actions: [
      'Tap category then item tiles — lines appear with qty badges.',
      'Use + / − on a line to change quantity; qty 0 removes the line.',
      'Open line note for kitchen instructions (“less spicy”, “no onion”).',
      'Portion / size buttons when the item has variants.',
      'Clear cart (trash) only when the whole order is abandoned.',
    ],
    highlight: '#cart-items, .cart-count-pill, #btn-clear-cart',
  });

  step({
    id: '09b-pos-customer',
    phase: '4 · Point of Sale',
    title: 'Customer on the bill — Walk-in vs named guest',
    where: 'dashboard',
    tab: 'pos-tab',
    seed: 'ensureCartItems',
    prep: 'openCustomerOnCart',
    goal: 'Link name + phone for WhatsApp bills, CRM, Due credit, and loyalty.',
    actions: [
      'Cart customer toggle starts as Walk-in.',
      'Expand Add customer — enter name and mobile.',
      'Phone is required for WhatsApp PDF after settle and for Due (credit) sales.',
      'If guest already exists in Customers, dues banner may show outstanding balance.',
      'Customer profiles also auto-build when you bill with a phone number.',
    ],
    highlight: '#cart-cust-toggle, #cart-cust-direct-inputs, #cart-customer-dues-banner',
  });

  step({
    id: '09c-pos-tip-promo',
    phase: '4 · Point of Sale',
    title: 'Tips, promo codes, and more cart options',
    where: 'dashboard',
    tab: 'pos-tab',
    seed: 'ensureCartItems',
    prep: 'openCartMoreOpts',
    goal: 'Apply optional tip and coupon before payment.',
    actions: [
      'Open More options / cart details accordion if collapsed.',
      'Tip: No tip · 5% · 10% (or custom if shown).',
      'Promo code: type code → Apply; Clear removes it; badge shows active offer.',
      'Discount controls (if role allows) reduce subtotal before tax.',
      'Tax lines follow Settings (calculate tax) + per-item GST slab from Menu Editor.',
    ],
    highlight: '#cart-more-opts, #cart-tip-row, #promo-input, #promo-apply',
  });

  step({
    id: '09d-pos-hold-kot',
    phase: '4 · Point of Sale',
    title: 'Hold order and Send KOT',
    where: 'dashboard',
    tab: 'pos-tab',
    seed: 'ensureCartItems',
    prep: 'highlightHoldKot',
    goal: 'Park a cart for later or fire kitchen tickets without settling cash yet.',
    actions: [
      'Hold — saves the current cart as a held order (resume later from Holds list).',
      'Right-click / long-press Hold (desktop) often opens the held-orders list.',
      'KOT — Send kitchen ticket to KDS without Print & Pay (cooks start prep).',
      'After KOT, you can still add items and settle later.',
      'Holds counter on the menu bar shows how many parked orders exist.',
    ],
    tips: ['Dine-in tables also show held state on Floor & Tables.'],
    highlight: '#btn-hold-current, #btn-kot, #btn-m-hold-current',
  });

  step({
    id: '10-pos-pay',
    phase: '4 · Point of Sale',
    title: 'Payment methods and Print & Pay',
    where: 'dashboard',
    tab: 'pos-tab',
    seed: 'ensureCartItems',
    prep: 'openCheckout',
    goal: 'Collect money and finish the bill cleanly.',
    actions: [
      'Check subtotal, tax, tip, promo, grand total.',
      'Cash — optional cash received + denomination shortcuts; change due shows.',
      'UPI — mark counter UPI collected.',
      'Card — card machine tender.',
      'Due — credit sale; requires customer; increases CRM dues.',
      'Split — allocate across Cash / UPI / Card / Due with rest-to and half helpers.',
      'Print & Pay — creates paid bill, deducts recipe stock if linked, may fire KOT, opens settled modal.',
      'On settled: thermal print, WhatsApp PDF, or close.',
    ],
    tips: ['Never use Due for anonymous walk-in — attach a phone first.'],
    highlight: '#cart-payment, #btn-checkout, [data-pay-method]',
  });

  step({
    id: '10b-pos-split-cash',
    phase: '4 · Point of Sale',
    title: 'Split tender and cash denominations',
    where: 'dashboard',
    tab: 'pos-tab',
    seed: 'ensureCartItems',
    prep: 'openSplitPay',
    goal: 'Handle multi-tender and exact cash quickly.',
    actions: [
      'Select Split payment method.',
      'Enter amounts per tender; use →₹ / →UPI / →Card / →Due / ½ / clear helpers.',
      'For Cash alone: exact (=), ₹100 / 200 / 500 / 2k shortcuts, CLR.',
      'Totals must match grand total before Print & Pay enables (when enforced).',
    ],
    highlight: '[data-pay-method="Split"], #cart-tender-host, .csd-den-btn',
  });

  step({
    id: '11-pos-shift',
    phase: '4 · Point of Sale',
    title: 'Open / close shift — float and Z-report',
    where: 'dashboard',
    tab: 'pos-tab',
    prep: 'openShiftUi',
    goal: 'Start and end the day with clear cash discipline.',
    actions: [
      'Top bar Shift: Open shift or Close shift.',
      'Open: enter opening cash by denomination (notes & coins) + optional note.',
      'All bills on this station tag the open shift.',
      'Close: enter counted cash → variance vs expected → Print / CSV Z-report.',
      'Preview Z (if shown) before locking the shift.',
      'Multi-device: set station label so Z-reports separate counters.',
    ],
    highlight: '#rs-shift-open, #rs-shift-close',
  });

  // ═══════════════════════════════════════════════════════════
  // 5 · Floor
  // ═══════════════════════════════════════════════════════════
  step({
    id: '12-floor',
    phase: '5 · Dining room',
    title: 'Floor & Tables — seating map',
    where: 'dashboard',
    tab: 'floor-tab',
    seed: 'ensureTables',
    goal: 'See free / dining / held / QR / billed tables at a glance.',
    actions: [
      mobile ? 'Open Floor & Tables from More.' : 'Open Floor & Tables from the sidebar.',
      'KPI cards: free tables, dining now, awaiting payment, open table value.',
      'Legend colours: Available, Dining, QR pending, Held, Bill printed.',
      'Tap free table → Seat & order → POS bound to that table.',
      'Occupied: checkout, transfer, hold, clear/free (confirm carefully).',
      'Refresh, Scan table (staff camera), Open all QR / Close all QR, Clear all open.',
    ],
    highlight: '#floor-tab, .sidebar-link[data-tab="floor-tab"]',
  });

  step({
    id: '12b-floor-edit-tables',
    phase: '5 · Dining room',
    title: 'Edit tables — seats and layout',
    where: 'dashboard',
    tab: 'floor-tab',
    prep: 'openEditTables',
    goal: 'Add, rename, or resize tables so the map matches the room.',
    actions: [
      'Click Edit Tables on the Floor toolbar.',
      'Add table numbers, seat counts, sections if offered.',
      'Save layout — all stations sync the same floor plan.',
      'Cancel discards unsaved layout edits.',
    ],
    highlight: '#btn-edit-tables, button:has-text("Edit Tables")',
  });

  step({
    id: '13-floor-qr-print',
    phase: '5 · Dining room',
    title: 'Print Table QR tents',
    where: 'dashboard',
    tab: 'floor-tab',
    prep: 'openFloorQrPrint',
    goal: 'Put scannable Order food + Call waiter cards on every table.',
    actions: [
      'Print Table QRs (or View QR on one table).',
      'Choose card size Mini → Full or custom mm.',
      'Toggle Wi‑Fi name/password, welcome line, Powered by (configure Wi‑Fi under Settings → Outlet profile first).',
      'Live preview updates as you change options.',
      'Print 100% scale (not Fit-to-page). Table number is always printed.',
    ],
    tips: ['Guests scan with their phone camera — not the staff Scan table button.'],
    highlight: '#btn-print-floor-qrs, #btn-print-all-qrs-go',
  });

  step({
    id: '13b-floor-qr-sessions',
    phase: '5 · Dining room',
    title: 'Open all QR / Close all QR sessions',
    where: 'dashboard',
    tab: 'floor-tab',
    prep: 'highlightFloorQrBulk',
    goal: 'Bulk-control whether guests can place self-orders right now.',
    actions: [
      'Open all QR — enables guest ordering on every table.',
      'Close all QR — stops new guest orders (service-only).',
      'Per-table QR state still shows on cards (QR pending badge when guests ordered).',
      'Staff Scan table is for staff app camera linking — not guest menus.',
    ],
    highlight: '#btn-open-all-qr, #btn-close-all-qr, #btn-staff-scan-table',
  });

  // ═══════════════════════════════════════════════════════════
  // 6–8 · Queues
  // ═══════════════════════════════════════════════════════════
  step({
    id: '14-qr-orders',
    phase: '6 · Guest QR',
    title: 'QR Orders queue — accept / reject',
    where: 'dashboard',
    tab: 'qr-orders-tab',
    seed: 'ensureQrContext',
    goal: 'Process orders guests place from table QR codes.',
    actions: [
      'Open QR Orders (sidebar or bottom Orders on mobile).',
      'Stats: Pending accept, Preparing, Served, Tables occupied.',
      'List / Cards view toggle.',
      'Accept → kitchen/KDS; Reject for tests or wrong table.',
      'Amend shared table order before cooks start (when enabled).',
      'Open floor / Refresh shortcuts.',
    ],
    highlight: '#qr-orders-tab, .sidebar-link[data-tab="qr-orders-tab"]',
  });

  step({
    id: '15-kds',
    phase: '7 · Kitchen',
    title: 'Kitchen Display (KDS)',
    where: 'dashboard',
    tab: 'kds-tab',
    seed: 'ensureKitchenTicket',
    goal: 'Cooks see tickets and mark items ready without paper KOTs.',
    actions: [
      'Open Kitchen (or dedicated kds.html on a kitchen tablet).',
      'Tickets appear from POS KOT, accepted QR orders, or online accepts.',
      'Mark preparing → ready; clear when plated.',
      'Search order / avg prep chips help during rush.',
      'Use a bright tablet, landscape, fixed on the pass.',
    ],
    tips: ['Kitchen role logins can land directly on KDS.'],
    highlight: '#kds-tab',
  });

  step({
    id: '15b-kitchen-setup',
    phase: '7 · Kitchen',
    title: 'Kitchen Setup coach (link kitchen tablet)',
    where: 'dashboard',
    tab: 'pos-tab',
    prep: 'openKitchenSetup',
    goal: 'Follow the in-app checklist to put a kitchen device on KDS.',
    actions: [
      'Open Kitchen Setup from sidebar coach / More (wording: Kitchen Setup).',
      'Follow checklist: open kitchen URL or role login, network, full-screen, sound if offered.',
      'Confirm tickets appear when POS sends KOT.',
      'Close coach when done — it does not replace the Kitchen tab itself.',
    ],
    highlight: '#klc-sidebar-setup, #klc-mobile-setup, [data-klc-nav="setup"]',
  });

  step({
    id: '16-online',
    phase: '8 · Channels',
    title: 'Online Orders queue',
    where: 'dashboard',
    tab: 'aggregator-tab',
    goal: 'One place for delivery-channel and manual online tickets.',
    actions: [
      mobile ? 'Open Online Orders from More.' : 'Open Online Orders from sidebar.',
      'Review items, customer, and channel.',
      'Accept (to kitchen) or Reject.',
      'Phone orders: create manual online order when the button exists, then process like POS/online flow.',
    ],
    highlight: '#aggregator-tab, .sidebar-link[data-tab="aggregator-tab"]',
  });

  // ═══════════════════════════════════════════════════════════
  // 9 · Bills
  // ═══════════════════════════════════════════════════════════
  step({
    id: '17-bills',
    phase: '9 · History',
    title: 'Bills list — search and open invoice',
    where: 'dashboard',
    tab: 'bills-tab',
    seed: 'ensureBill',
    goal: 'Find any settled invoice for reprint, audit, or refund.',
    actions: [
      'Open Bills.',
      'Date chips: Today, Yesterday, 7 days, All, Custom (+ Apply).',
      'KPI cards: Today sales, bills, AOV, refunds.',
      'Search by bill no, phone, or customer name.',
      'Payment / status filters live in the table header (Filter button explains).',
      'Open a row for totals, tax, tender, station, line items.',
    ],
    highlight: '#bills-tab',
  });

  step({
    id: '17b-bills-export',
    phase: '9 · History',
    title: 'Bills export, print day report, refund',
    where: 'dashboard',
    tab: 'bills-tab',
    seed: 'ensureBill',
    prep: 'highlightBillsExport',
    goal: 'Hand data to accounts and correct mistakes safely.',
    actions: [
      'Excel export — Summary + Bills + Line items workbook (recommended for CA).',
      'CSV export — plain file for scripts/imports.',
      'Print report — A4/PDF sales summary for the selected range.',
      'Reprint thermal / browser print from bill detail.',
      'Refund / void — may require manager PIN (Settings → Security).',
    ],
    highlight: '#btn-export-bills, #btn-export-bills-csv, #btn-print-day-report',
  });

  // ═══════════════════════════════════════════════════════════
  // 10 · Inventory deep
  // ═══════════════════════════════════════════════════════════
  step({
    id: '18-inventory',
    phase: '10 · Stock',
    title: 'Inventory — Stock levels',
    where: 'dashboard',
    tab: 'inventory-tab',
    invTab: 'stock',
    seed: 'ensureInventory',
    goal: 'Track ingredients, min levels, costs, and health status.',
    actions: [
      mobile ? 'More → Inventory.' : 'Open Inventory.',
      'Stock levels tab (default).',
      'Add stock item: name, unit, qty, min/reorder, optional unit cost.',
      'Export CSV, Low stock CSV, Template, Import for bulk.',
      'Variance (theoretical usage vs stock), Prep batch, Takeaway pack packaging rules.',
      'Auto-draft POs from low stock when banner offers it.',
      'Restock / Edit / Batches on each row.',
    ],
    highlight: '#inventory-tab, [data-inv-tab="stock"], #btn-add-ingredient',
  });

  step({
    id: '18b-inventory-recipes',
    phase: '10 · Stock',
    title: 'Inventory — Recipes (link dish → ingredients)',
    where: 'dashboard',
    tab: 'inventory-tab',
    invTab: 'recipes',
    goal: 'Sales auto-deduct stock when recipes are linked.',
    actions: [
      'Open Recipes sub-tab under Inventory.',
      'Each menu item can list ingredients + qty + unit.',
      'Bulk Import Recipes: lines like Menu Item, Ingredient, Qty, Unit.',
      'Unlinked dishes warn that selling will not reduce stock.',
      'Also reachable from Menu Editor recipe fields and Growth Hub Recipe Costing.',
    ],
    highlight: '[data-inv-tab="recipes"], #btn-bulk-recipe-import',
  });

  step({
    id: '18c-inventory-suppliers',
    phase: '10 · Stock',
    title: 'Inventory — Suppliers',
    where: 'dashboard',
    tab: 'inventory-tab',
    invTab: 'suppliers',
    goal: 'Store vendor contacts for purchasing.',
    actions: [
      'Open Suppliers sub-tab.',
      'Add supplier name, phone, items they supply when fields exist.',
      'Use with Purchase orders for restocking.',
    ],
    highlight: '[data-inv-tab="suppliers"]',
  });

  step({
    id: '18d-inventory-po',
    phase: '10 · Stock',
    title: 'Inventory — Purchase orders',
    where: 'dashboard',
    tab: 'inventory-tab',
    invTab: 'pos',
    goal: 'Raise and track stock purchase orders.',
    actions: [
      'Open Purchase orders sub-tab.',
      'Create PO: supplier, lines, quantities, expected date.',
      'Track status received / partial / closed.',
      'Receiving stock should update Stock levels.',
      'Growth Hub also has a Purchase Orders tile for the same domain.',
    ],
    highlight: '[data-inv-tab="pos"]',
  });

  step({
    id: '18e-inventory-waste',
    phase: '10 · Stock',
    title: 'Inventory — Waste log',
    where: 'dashboard',
    tab: 'inventory-tab',
    invTab: 'waste',
    goal: 'Record spoilage and waste so stock and costing stay honest.',
    actions: [
      'Open Waste log sub-tab.',
      'Log item, qty, reason (spoil / expire / spillage), date.',
      'Waste reduces on-hand stock and feeds variance analysis.',
    ],
    highlight: '[data-inv-tab="waste"]',
  });

  // ═══════════════════════════════════════════════════════════
  // 11 · Menu
  // ═══════════════════════════════════════════════════════════
  step({
    id: '19-menu',
    phase: '11 · Catalog',
    title: 'Menu Editor — add item, price, GST slab',
    where: 'dashboard',
    tab: 'editor-tab',
    seed: 'ensureMenu',
    goal: 'Publish what POS and guest QR both sell.',
    actions: [
      mobile ? 'More → Menu Editor.' : 'Open Menu Editor.',
      'Add new item: English name, optional Hindi name (QR), price, category.',
      'Type Veg/Non-veg, GST slab (0/5/12/18…), Sold as plate/etc., recipe servings.',
      'Flags: Best seller, Today\'s special, Staple, Offer water.',
      'Add-ons (extra ghee…), Uses from store (recipe qty).',
      'Save — item appears on POS after sync/refresh.',
      'Toggle Available off for sold-out.',
    ],
    tips: ['India: most restaurant food often 5%; packaged drinks may be higher — confirm with your CA.'],
    highlight: '#editor-tab',
  });

  step({
    id: '19b-menu-import-export',
    phase: '11 · Catalog',
    title: 'Menu import / export / enable all',
    where: 'dashboard',
    tab: 'editor-tab',
    prep: 'highlightMenuIo',
    goal: 'Bulk-load or backup the catalog.',
    actions: [
      'Export full menu CSV.',
      'Download Template then Import for bulk create/update.',
      'Enable All turns every item available at once.',
      'Disable individual items with the Available toggle per row.',
      'Edit / delete icons on each row.',
    ],
    highlight: '#btn-export-menu, #btn-import-menu, #btn-enable-all-menu, #btn-download-menu-template',
  });

  // ═══════════════════════════════════════════════════════════
  // 12 · Employees
  // ═══════════════════════════════════════════════════════════
  step({
    id: '20-employees',
    phase: '12 · Team',
    title: 'Employees — Directory & add team member',
    where: 'dashboard',
    tab: 'employees-tab',
    empSeg: 'Directory',
    goal: 'Give each staff member their own login and role.',
    actions: [
      mobile ? 'More → Employees.' : 'Open Employees.',
      'Directory segment (default): team list.',
      'Add team member: name, username, password, role (cashier, waiter, kitchen, manager…).',
      'Role limits which tabs they see after login.',
      'Deactivate when someone leaves — do not share owner password.',
      'KPIs: team members, on shift, payroll month, attendance % when populated.',
    ],
    tips: ['Test one cashier login on a spare device before rush hour.'],
    highlight: '#employees-tab, #btn-add-employee',
  });

  step({
    id: '20b-employees-roster',
    phase: '12 · Team',
    title: 'Employees — Shift roster',
    where: 'dashboard',
    tab: 'employees-tab',
    empSeg: 'Shift roster',
    goal: 'Plan who works which shifts.',
    actions: [
      'Open Shift roster segment.',
      'Assign staff to dayparts / stations when the roster UI is filled.',
      'Use with Attendance for actuals vs plan.',
    ],
    highlight: '#employees-tab .seg',
  });

  step({
    id: '20c-employees-attendance',
    phase: '12 · Team',
    title: 'Employees — Attendance',
    where: 'dashboard',
    tab: 'employees-tab',
    empSeg: 'Attendance',
    goal: 'Track presence for payroll and discipline.',
    actions: [
      'Open Attendance segment.',
      'Mark present / leave as offered by the UI.',
      'Leave queue and advances also appear under HR desk shortcuts.',
    ],
    highlight: '#employees-tab',
  });

  step({
    id: '20d-employees-payroll',
    phase: '12 · Team',
    title: 'Employees — Payroll & advances',
    where: 'dashboard',
    tab: 'employees-tab',
    empSeg: 'Payroll',
    goal: 'Run basic payroll and advances inside the outlet.',
    actions: [
      'Open Payroll segment.',
      'Pay salaries, record advances, view recent payslips when enabled.',
      'WhatsApp payslip options may appear if gateway is connected.',
    ],
    highlight: '#employees-tab, #btn-add-employee',
  });

  step({
    id: '20e-employees-logins',
    phase: '12 · Team',
    title: 'Employees — Logins (credentials & access)',
    where: 'dashboard',
    tab: 'employees-tab',
    empSeg: 'Logins',
    goal: 'Reset passwords and review login access without recreating staff.',
    actions: [
      'Open Logins segment.',
      'Reset password, disable login, review last activity when shown.',
      'Settings → Team & roles complements this for permission policy.',
    ],
    highlight: '#employees-tab .seg',
  });

  // ═══════════════════════════════════════════════════════════
  // 13 · Customers
  // ═══════════════════════════════════════════════════════════
  step({
    id: '21-customers',
    phase: '13 · CRM',
    title: 'Customers — CRM list',
    where: 'dashboard',
    tab: 'customers-tab',
    seed: 'ensureCustomer',
    goal: 'Know regulars, visits, spend, loyalty points, dues.',
    actions: [
      mobile ? 'More → Customers.' : 'Open Customers.',
      'Search by name or phone.',
      'Cards/list show visits, spend, points, dues badge.',
      'Profiles also build when POS bills include a phone number.',
    ],
    highlight: '#customers-tab',
  });

  step({
    id: '21b-customers-dues',
    phase: '13 · CRM',
    title: 'Customers — settle dues & notes',
    where: 'dashboard',
    tab: 'customers-tab',
    seed: 'ensureCustomer',
    prep: 'openFirstCustomer',
    goal: 'Collect credit balances and store guest notes.',
    actions: [
      'Open a customer card with dues.',
      'Settle Dues: Cash / UPI / Card → receipt / WhatsApp when available.',
      'Add notes (preferences, allergies) for waiters.',
      'Loyalty points adjust with settings under Taxes & pricing / Loyalty program.',
    ],
    highlight: '#customers-tab',
  });

  // ═══════════════════════════════════════════════════════════
  // 14 · Tax workspace
  // ═══════════════════════════════════════════════════════════
  step({
    id: '22-tax',
    phase: '14 · Compliance',
    title: 'Tax & GST workspace',
    where: 'dashboard',
    tab: 'tax-tab',
    goal: 'See tax collected and export packs for your CA.',
    actions: [
      mobile ? 'More → Tax & GST.' : 'Open Tax & GST.',
      'Review period stats (taxable supplies, CGST/SGST style totals when India).',
      'Download GSTR-ready report / period exports.',
      'Rate slabs if editable — country tax packs.',
      'Remember: per-item GST is Menu Editor; outlet toggles are Settings → Taxes & pricing.',
    ],
    highlight: '#tax-tab, #btn-download-gstr',
  });

  // ═══════════════════════════════════════════════════════════
  // 15 · Reports & analytics
  // ═══════════════════════════════════════════════════════════
  step({
    id: '23-reports',
    phase: '15 · Numbers',
    title: 'Sales Reports — KPIs and charts',
    where: 'dashboard',
    tab: 'reports-tab',
    seed: 'ensureBill',
    goal: 'See revenue, orders, payment mix, tax for chosen periods.',
    actions: [
      'Open Reports.',
      'Period: Today, This week, This month, Last 30 / 90 days (labels may vary).',
      'KPI cards: Revenue, Orders, AOV, Tax collected.',
      'Daily revenue bars + Payment mix donut (Cash / UPI / Card…).',
      'Top categories + Tax summary sections when shown.',
    ],
    highlight: '#reports-tab',
  });

  step({
    id: '23b-reports-export',
    phase: '15 · Numbers',
    title: 'Reports — GSTR CSV and accountant pack',
    where: 'dashboard',
    tab: 'reports-tab',
    prep: 'highlightReportsExport',
    goal: 'Download files for compliance and books.',
    actions: [
      'Download GSTR-ready CSV / day pack buttons on Reports or Tax tab.',
      'Cross-check totals with Bills Excel export for the same dates.',
      'Server totals badge means figures include cloud-synced bills when online.',
    ],
    highlight: '#reports-tab button, #btn-download-gstr',
  });

  step({
    id: '24-analytics',
    phase: '15 · Numbers',
    title: 'Analytics — trends, peaks, bestsellers',
    where: 'dashboard',
    tab: 'analytics-tab',
    goal: 'Go deeper than daily total for staffing and menu decisions.',
    actions: [
      mobile ? 'More → Advanced Analytics.' : 'Open Analytics.',
      'Choose period and refresh if needed.',
      'Revenue trend, peak hours, top items / categories.',
      'Use before changing staffing or promos.',
    ],
    highlight: '#analytics-tab',
  });

  // ═══════════════════════════════════════════════════════════
  // 16 · Growth Hub deep
  // ═══════════════════════════════════════════════════════════
  step({
    id: '25-growth',
    phase: '16 · Growth Hub',
    title: 'Growth Hub launcher',
    where: 'dashboard',
    tab: 'growth-hub-tab',
    goal: 'Open ops tools beyond pure billing.',
    actions: [
      mobile ? 'More → Growth Hub.' : 'Open Growth Hub.',
      'Tiles: Reservations, Support Tickets, Purchase Orders, Recipe Costing,',
      'Offers & Coupons, WhatsApp Campaigns, Feedback & Reviews, Loyalty Program.',
      'Tap a tile to open that module.',
    ],
    highlight: '#growth-hub-tab, #hub-grid',
  });

  step({
    id: '25b-growth-reservations',
    phase: '16 · Growth Hub',
    title: 'Growth Hub — Reservations',
    where: 'dashboard',
    tab: 'growth-hub-tab',
    growthTile: 'Reservations',
    goal: 'Manage table bookings and waitlist.',
    actions: [
      'Open Reservations tile.',
      'Add guest name, phone, party size, time.',
      'Seat / No-show / Cancel actions on each booking.',
      'Coordinate with Floor when guests arrive.',
    ],
  });

  step({
    id: '25c-growth-tickets',
    phase: '16 · Growth Hub',
    title: 'Growth Hub — Support tickets',
    where: 'dashboard',
    tab: 'growth-hub-tab',
    growthTile: 'Support Tickets',
    goal: 'Track guest complaints and service issues inside the outlet.',
    actions: [
      'Open Support Tickets tile.',
      'Log issue, priority, customer link when available.',
      'Resolve / Waiting / Reopen workflow buttons.',
    ],
  });

  step({
    id: '25d-growth-po',
    phase: '16 · Growth Hub',
    title: 'Growth Hub — Purchase Orders',
    where: 'dashboard',
    tab: 'growth-hub-tab',
    growthTile: 'Purchase Orders',
    goal: 'Raise supplier POs from Growth Hub (pairs with Inventory → PO).',
    actions: [
      'Open Purchase Orders tile.',
      'Create PO lines and track fulfilment.',
      'Receive stock into Inventory when goods arrive.',
    ],
  });

  step({
    id: '25e-growth-recipe-cost',
    phase: '16 · Growth Hub',
    title: 'Growth Hub — Recipe Costing',
    where: 'dashboard',
    tab: 'growth-hub-tab',
    growthTile: 'Recipe Costing',
    goal: 'Calculate plate cost and margin before setting menu price.',
    actions: [
      'Open Recipe Costing tile.',
      'Select dish + ingredients with unit costs from Inventory.',
      'Read plate cost vs selling price margin.',
      'Update Menu price if margin is too thin.',
    ],
  });

  step({
    id: '25f-growth-offers',
    phase: '16 · Growth Hub',
    title: 'Growth Hub — Offers & Coupons',
    where: 'dashboard',
    tab: 'growth-hub-tab',
    growthTile: 'Offers & Coupons',
    goal: 'Build promo codes for POS Apply promo.',
    actions: [
      'Open Offers & Coupons tile.',
      'Create code, discount type (% or flat), validity.',
      'Activate / Pause offers.',
      'Staff enter the code on POS cart → Apply.',
    ],
  });

  step({
    id: '25g-growth-wa-campaigns',
    phase: '16 · Growth Hub',
    title: 'Growth Hub — WhatsApp Campaigns',
    where: 'dashboard',
    tab: 'growth-hub-tab',
    growthTile: 'WhatsApp Campaigns',
    goal: 'Broadcast to your customer list when gateway is connected.',
    actions: [
      'Open WhatsApp Campaigns tile.',
      'Draft message; pick audience (all customers / segment).',
      'Requires Settings → WhatsApp gateway online.',
      'Respect local messaging rules; avoid spam.',
    ],
  });

  step({
    id: '25h-growth-feedback',
    phase: '16 · Growth Hub',
    title: 'Growth Hub — Feedback & Reviews',
    where: 'dashboard',
    tab: 'growth-hub-tab',
    growthTile: 'Feedback & Reviews',
    goal: 'Collect and respond to guest ratings.',
    actions: [
      'Open Feedback & Reviews tile.',
      'View ratings and comments.',
      'Respond or flag issues into Support Tickets.',
    ],
  });

  step({
    id: '25i-growth-loyalty',
    phase: '16 · Growth Hub',
    title: 'Growth Hub — Loyalty Program',
    where: 'dashboard',
    tab: 'growth-hub-tab',
    growthTile: 'Loyalty Program',
    goal: 'Configure points, tiers, and rewards for repeat guests.',
    actions: [
      'Open Loyalty Program tile.',
      'Set earn rules and redeem rules.',
      'Points appear on customer profiles when phone is on the bill.',
      'Cross-check Settings → Taxes & pricing loyalty toggles if present.',
    ],
  });

  // ═══════════════════════════════════════════════════════════
  // 17 · Settings — every pane
  // ═══════════════════════════════════════════════════════════
  step({
    id: '26-settings-profile',
    phase: '17 · Settings',
    title: 'Settings → Outlet profile',
    where: 'dashboard',
    tab: 'settings-tab',
    settingsPanel: 'profile',
    goal: 'Name, address, phone, country, currency, GSTIN, guest QR Wi‑Fi.',
    actions: [
      mobile ? 'More → Settings → Outlet profile.' : 'Sidebar Settings (gear) → Outlet profile.',
      'Business name, address, phone — print on bills and QR cards.',
      'Outlet code is read-only (assigned at registration).',
      'Country & currency drive tax labels and money format.',
      'GSTIN for legal invoices.',
      'Guest QR: Wi‑Fi name, password, welcome line for table tents.',
      'Save changes — syncs to stations.',
    ],
    highlight: '.set-nav button[data-s="profile"]',
  });

  step({
    id: '27-settings-tax',
    phase: '17 · Settings',
    title: 'Settings → Taxes & pricing',
    where: 'dashboard',
    tab: 'settings-tab',
    settingsPanel: 'tax',
    goal: 'Tax on/off, default rate, inclusive pricing, service charge, happy hour, loyalty/promo.',
    actions: [
      'Calculate taxes ON for registered GST outlets.',
      'Tax label (GST) and default Tax rate % when item has no slab.',
      'Inclusive pricing ON if menu prices already include tax.',
      'Service charge % for dine-in when used.',
      'Show HSN on invoice when you maintain codes.',
      'Happy hour / loyalty / promo related toggles in the same pane when shown.',
      'Save. Per-item rates still come from Menu Editor GST slab.',
    ],
    tips: ['OFF Calculate taxes = no tax on cart/print (special cases only).'],
    highlight: '.set-nav button[data-s="tax"]',
  });

  step({
    id: '28-settings-printer',
    phase: '17 · Settings',
    title: 'Settings → Printers & KOT',
    where: 'dashboard',
    tab: 'settings-tab',
    settingsPanel: 'printer',
    goal: 'Paper receipts, auto-print, kitchen tickets, cash drawer.',
    actions: [
      'Preferred printer name / USB thermal bridge when using desktop or Android print.',
      'Auto-print bill / auto KOT toggles.',
      'Paper width (58/80mm) when offered.',
      'Cash drawer pulse after cash sale if hardware supports it.',
      'Test print before service.',
    ],
    tips: ['Mobile/PWA printing may use browser print or companion bridge — see docs/MOBILE_PRINTING.md in repo for staff IT.'],
    highlight: '.set-nav button[data-s="printer"]',
  });

  step({
    id: '28b-settings-gateway',
    phase: '17 · Settings',
    title: 'Settings → WhatsApp gateway',
    where: 'dashboard',
    tab: 'settings-tab',
    settingsPanel: 'gateway',
    goal: 'Connect restaurant WhatsApp so bills and campaigns can send.',
    actions: [
      'Open WhatsApp section in Settings.',
      'Scan gateway QR once on a stable office PC; keep gateway online.',
      'Bill preferences: auto-send on settle when phone present.',
      'Top-bar icon green = connected.',
      'Test send to owner phone before promising guests.',
    ],
    tips: ['If icon stays red, restart gateway or contact ' + SUPPORT + '.'],
    highlight: '.set-nav button[data-s="gateway"]',
  });

  step({
    id: '28c-settings-payments',
    phase: '17 · Settings',
    title: 'Settings → Payments (Razorpay / settlement)',
    where: 'dashboard',
    tab: 'settings-tab',
    settingsPanel: 'payments',
    goal: 'See online settlement status; counter Cash/UPI still work without it.',
    actions: [
      'Open Payments.',
      'Razorpay Route status: Active / Pending KYC / Not enabled.',
      'POS Cash and counter UPI work even when Route is not enabled.',
      'When enabled, online card/UPI can settle to linked bank (T+2 typical).',
    ],
    highlight: '.set-nav button[data-s="payments"]',
  });

  step({
    id: '28d-settings-security',
    phase: '17 · Settings',
    title: 'Settings → Security & PIN',
    where: 'dashboard',
    tab: 'settings-tab',
    settingsPanel: 'security',
    goal: 'Manager PIN for refunds, voids, and sensitive actions.',
    actions: [
      'Set or change admin / manager PIN.',
      'Choose which actions require PIN (refund, void, discount, open drawer…).',
      'Never share PIN with cashiers who should not reverse bills.',
    ],
    highlight: '.set-nav button[data-s="security"]',
  });

  step({
    id: '28e-settings-team',
    phase: '17 · Settings',
    title: 'Settings → Team & roles',
    where: 'dashboard',
    tab: 'settings-tab',
    settingsPanel: 'team',
    goal: 'Policy for staff permissions beyond individual Employees records.',
    actions: [
      'Review role templates / cashier restrictions.',
      'Align with Employees → Logins for who can open Settings, Reports, Inventory.',
      'Managers may open a subset of Settings; owners see Plan & Danger zone.',
    ],
    highlight: '.set-nav button[data-s="team"]',
  });

  step({
    id: '28f-settings-plan',
    phase: '17 · Settings',
    title: 'Settings → Plan & billing',
    where: 'dashboard',
    tab: 'settings-tab',
    settingsPanel: 'plan',
    goal: 'See workspace plan, limits, and upgrade path.',
    actions: [
      'Open Plan & billing (owner/admin).',
      'Read current plan, limits, renewal notes.',
      'Upgrade / contact path when free launch ends.',
      'Managers may not see this pane.',
    ],
    highlight: '.set-nav button[data-s="plan"]',
  });

  step({
    id: '28g-settings-danger',
    phase: '17 · Settings',
    title: 'Settings → Danger zone (owner only)',
    where: 'dashboard',
    tab: 'settings-tab',
    settingsPanel: 'danger',
    goal: 'Know irreversible actions exist — use only with extreme care.',
    actions: [
      'Open Danger zone (owner/admin only).',
      'Actions here can wipe data or destroy the outlet workspace.',
      'Never click wipe/delete during service. Export Bills/Menu first if ever required.',
      'Contact ' + SUPPORT + ' before any destructive action.',
    ],
    tips: ['If you are not 100% sure, close this pane.'],
    highlight: '.set-nav button[data-s="danger"]',
  });

  // ═══════════════════════════════════════════════════════════
  // 18–19 · Close & support
  // ═══════════════════════════════════════════════════════════
  step({
    id: '29-day-close',
    phase: '18 · End of day',
    title: 'End-of-day checklist',
    where: 'dashboard',
    tab: 'reports-tab',
    goal: 'Leave the till clean for tomorrow.',
    actions: [
      'Close open shifts on each station (cash count + Z-report).',
      'Reports → Today → match totals to cash + UPI + card.',
      'Bills Excel/CSV export if accountant wants daily pack.',
      'Download GSTR-ready CSV if month-end.',
      'Close all QR if dining room is shut.',
      'Sign out on shared tablets; keep one owner device if needed overnight.',
    ],
    highlight: '.sidebar-link[data-tab="reports-tab"]',
  });

  step({
    id: '29b-offline-sync',
    phase: '18 · End of day',
    title: 'Offline billing and reconnect',
    where: 'dashboard',
    tab: 'pos-tab',
    goal: 'Keep selling when internet drops; sync when back online.',
    actions: [
      'RestroSuite is offline-first — POS can still bill on a device with a valid session/lease.',
      'When offline, logout may be locked to prevent lock-out.',
      'Bills queue locally then sync when network returns.',
      'If a licence/reconnect screen appears, use Retry / Reconnect and wait for lease.',
      'WhatsApp and cloud exports need network; paper print may still work.',
    ],
    tips: ['Tell support: Outlet ID, device, version chip, online/offline when the issue happened.'],
  });

  step({
    id: '30-support',
    phase: '19 · Help',
    title: 'Help, demo checklist, and support',
    where: 'dashboard',
    tab: 'pos-tab',
    prep: 'openHelp',
    goal: 'Get unstuck without guessing.',
    actions: [
      'In-app Help / Demo checklist (Help in sidebar foot or top bar).',
      'Email: ' + SUPPORT,
      'Always include: Outlet ID, username role, version chip text, exact button clicked, screenshot.',
      'Product tour / demo script walks critical paths once for new staff.',
    ],
    highlight: 'button:has-text("Help"), #open-help, .sb-foot-btn',
  });

  // ── DETAIL control maps (every step gets actionable rows) ──
  const DETAIL = buildDetailMaps(SUPPORT);

  return { STEPS, DETAIL, SUPPORT, SITE };
}

function buildDetailMaps(SUPPORT) {
  const d = {};
  function set(id, rows) {
    d[id] = rows;
  }
  const B = (btn, why, does, next) => ({ btn, why, does, next });

  set('01-google-search', [
    B('Search box', 'Find product', 'Lists web results', 'Pick official CodeArc link'),
    B('restrosuite.codearc.co.in', 'Real product site', 'Opens homepage', 'Homepage'),
    B('/login.html result', 'Direct staff entry', 'Opens Access', 'Sign in / Register'),
  ]);
  set('02-homepage', [
    B('Sign Up Free / Create free outlet', 'New owner', 'Opens register', 'Register form'),
    B('Sign in', 'Existing outlet', 'Opens Access', 'Login form'),
    B('Features / Live Demo / Compare', 'Evaluate product', 'Marketing or sandbox', 'Decide to register'),
  ]);
  set('02b-homepage-features', [
    B('Features nav', 'Feature list', 'Scrolls marketing sections', 'Read POS/KDS/QR/WA'),
    B('Live Demo', 'Try without signup', 'Sandbox bill', 'Still need real register'),
    B('Compare', 'Vs alternatives', 'Comparison content', 'Choose RestroSuite'),
  ]);
  set('03-login-page', [
    B('Sign in tab', 'Existing workspace', 'Shows login fields', 'Fill credentials'),
    B('Register outlet tab', 'New restaurant', 'Shows register form', 'Create workspace'),
    B('Theme toggle', 'Comfort', 'Light/dark', 'Same page'),
    B('Forgot / Recover', 'Lost password', 'Opens recovery', 'OTP → new password'),
  ]);
  set('04-register-form', [
    B('Business name', 'Bill header', 'Stores display name', 'Next fields'),
    B('Outlet ID / slug', 'Daily login key', 'Creates tenant code', 'Must write down'),
    B('Phone / email', 'Recovery + support', 'Saves contacts', 'OTP if enabled'),
    B('Country / currency', 'Tax + symbols', 'Defaults tax pack', 'GST/₹ etc.'),
    B('Password + confirm', 'Owner security', 'Hashes password', 'Create outlet'),
    B('Create my outlet', 'Provision cloud', 'Creates workspace', 'Sign in with new ID'),
  ]);
  set('05-login-form', [
    B('Outlet ID', 'Which database', 'Scopes session', 'Must match registration'),
    B('Username', 'Which person', 'Loads role tabs', 'Owner vs cashier menus differ'),
    B('Password', 'Prove identity', 'Validates', 'Dashboard'),
    B('Keep me signed in', 'Trusted device', 'Remember-me', 'Skip retype next visit'),
    B('Sign in securely', 'Enter console', 'Redirect dashboard', 'POS'),
  ]);
  set('05b-recover-password', [
    B('Recover / Forgot', 'Locked out', 'Opens recovery form', 'Enter Outlet ID + email'),
    B('Request code', 'Verify ownership', 'Sends OTP/email', 'Enter code'),
    B('New password', 'Reset access', 'Updates credentials', 'Sign in'),
  ]);
  set('06-shell-overview', [
    B('Sidebar collapse «', 'More space for work', 'Toggles sidebar width', 'Icons-only or full labels'),
    B('Outlet badge (name/code)', 'Which workspace', 'Display / may open profile', 'Confirm you are on right outlet'),
    B('Every sidebar link', 'Jump module', 'activateTab that screen', 'See sidebar map step'),
    B('Main canvas / page title', 'Active module', 'Shows title + subtitle', 'Do the job'),
    B('Top bar cluster', 'Global tools', 'Station, shift, search, support, WA, time, bell, version', 'Top bar tools step'),
    B('Settings gear (sidebar or top)', 'Configure outlet', 'Opens Settings', 'Profile/tax/print…'),
    B('Help', 'In-app guide', 'Opens help/demo checklist', 'Tour steps'),
    B('Sign out', 'End session', 'Clears login (blocked offline sometimes)', 'Access page'),
    B('Mobile bottom bar', 'One-thumb nav', 'POS Orders Kitchen Bills Reports More', 'That module'),
    B('Mobile More (⋯)', 'Hidden modules', 'Opens All sections grid', 'Floor Inventory Menu Settings…'),
  ]);
  set('07-sidebar-map', [
    B('Point of Sale', 'Sell & bill', 'Opens POS', 'Menu + cart'),
    B('QR Orders', 'Guest self-orders', 'Opens accept/reject queue', 'Accept → kitchen'),
    B('Kitchen', 'Cook display', 'Opens KDS', 'Mark ready'),
    B('Floor & Tables', 'Dining map', 'Opens floor', 'Seat / QR / transfer'),
    B('Online Orders', 'Delivery channels', 'Opens online queue', 'Accept/reject'),
    B('Bills', 'History', 'Opens bills list', 'Search/export/refund'),
    B('Kitchen Setup (coach)', 'Link kitchen tablet', 'Opens checklist modal', 'Not a full tab'),
    B('Inventory', 'Stock', 'Opens stock levels', 'Recipes/PO/waste…'),
    B('Menu Editor', 'Catalog prices GST', 'Opens editor', 'Add/edit items'),
    B('Employees', 'Staff HR', 'Opens directory', 'Add role logins'),
    B('Customers', 'CRM', 'Opens customers', 'Dues/loyalty'),
    B('Tax & GST', 'Compliance view', 'Opens tax workspace', 'GSTR export'),
    B('Reports', 'Sales KPIs', 'Opens reports', 'Charts + CSV'),
    B('Analytics', 'Trends', 'Opens analytics', 'Peaks / top items'),
    B('Growth Hub', 'Extra ops', 'Opens tile launcher', 'Reservations, offers…'),
    B('Settings', 'Outlet config', 'Opens settings panes', 'Profile → Danger zone'),
    B('Help', 'Learn', 'Demo checklist / guide', 'Guided tour'),
    B('Sign out', 'Leave', 'Ends session', 'Login'),
  ]);
  set('07b-topbar-tools', [
    B('Station label (Counter 1…)', 'Name this device', 'Renames station for reports', 'Z-report by station'),
    B('Shift open/close chip', 'Cash session', 'Opens float / Z modal', 'Shift discipline'),
    B('Global search', 'Jump anywhere', 'Finds menu/bills/modules', 'Target screen'),
    B('Support / Call menu', 'Human help', 'Shows contact options', 'Email ' + SUPPORT),
    B('WhatsApp status icon', 'Gateway health', 'Green=ok / red=down', 'Settings → WhatsApp'),
    B('Clock', 'Local time', 'Display only', '—'),
    B('Bell notifications', 'Alerts', 'QR orders, low stock, system', 'Act on alert'),
    B('Theme toggle (if shown)', 'Light/dark', 'Switches theme', 'Same screen'),
    B('Version chip (v209…)', 'Support build id', 'Click copies full version', 'Paste to support email'),
    B('Lock / licence icon (if shown)', 'Session/lease status', 'May open reconnect', 'Retry if locked'),
  ]);
  set('08-pos-empty-ready', [
    B('Menu search box', 'Find item by name/code in rush', 'Filters grid live', 'Matching tiles only'),
    B('Holds button (menu bar)', 'Open parked orders list', 'Shows held carts count', 'Resume or delete a hold'),
    B('Sort control', 'Order tiles A–Z / popular / etc.', 'Reorders grid', 'Same items, new order'),
    B('Card size − (btn-grid-dec)', 'Smaller tiles', 'More items on screen', 'Same menu'),
    B('Card size + (btn-grid-inc)', 'Larger tiles', 'Easier tapping', 'Same menu'),
    B('Category chips (All / Staples / …)', 'Browse one section', 'Filters by category', 'Only that category'),
    B('Menu item tile', 'Add to bill', 'Adds line qty +1 (badge on tile)', 'Cart total updates'),
    B('Veg/non-veg icon on tile', 'Dietary cue', 'Display only', '—'),
    B('Price on tile', 'Show sell price', 'Display only', '—'),
    B('Order type: Takeaway bag icon', 'Walk-in / parcel', 'Sets channel Takeaway', 'No table required'),
    B('Order type: Dine-in utensils', 'Table service', 'Sets Dine-in', 'Table + covers appear'),
    B('Order type: Delivery bike', 'Home delivery', 'Sets Delivery', 'Address fields appear'),
    B('Cart count pill', 'How many lines', 'Display only', '—'),
    B('Clear cart (trash)', 'Abort whole order', 'Empties all lines after confirm if asked', 'Empty cart hint'),
    B('Cart empty hint', 'Guidance', 'Shows “Tap menu items”', 'Add first item'),
    B('Back to menu (mobile)', 'Return from cart sheet', 'Closes cart overlay', 'Menu grid'),
    B('CHECKOUT bar (mobile)', 'Open cart to pay', 'Opens cart/payment sheet', 'Payment methods'),
  ]);
  set('08b-pos-order-types', [
    B('Takeaway (bag)', 'Parcel / walk-in', 'Order type = Takeaway', 'Packaging rules may apply'),
    B('Dine-in (utensils)', 'Seated guests', 'Order type = Dine-in', 'Table + covers required for floor'),
    B('Delivery (bike)', 'Send out', 'Order type = Delivery', 'Address / phone fields'),
    B('Table dropdown (#cart-table)', 'Bind to floor table', 'Links cart to table #', 'Floor shows occupied'),
    B('Covers / pax (#cart-covers)', 'Guest count', 'Stores covers number', 'Reports / floor info'),
    B('Change table (btn-change-table)', 'Move open dine-in', 'Swap table binding', 'Floor updates'),
    B('Delivery address / notes fields', 'Where to deliver', 'Saved on bill', 'Rider / online context'),
  ]);
  set('09-pos-add-items', [
    B('Item tile again', 'Increase qty or new line', '+1 or new cart line', 'Totals update'),
    B('Line + button', 'Add one more', 'qty++', 'Tax/total recalc'),
    B('Line − button', 'Reduce one', 'qty−− ; 0 removes line', 'Tax/total recalc'),
    B('Line note / long-press line', 'Kitchen instructions', 'Opens note editor', 'Note on KOT/KDS'),
    B('Portion / size buttons', 'Half/full/variant', 'Changes price & label', 'Line updates'),
    B('Clear cart', 'Scrap order', 'Empties cart', 'Empty state'),
    B('Cart lines list (#cart-items)', 'Review order', 'Scroll lines', 'Edit qty/notes'),
  ]);
  set('09b-pos-customer', [
    B('Walk-in / Add customer toggle', 'Anonymous vs named', 'Expands name+phone fields', 'Enter guest details'),
    B('Customer name field', 'Print on bill / CRM', 'Stores name', 'Bill header & CRM'),
    B('Customer phone field', 'WhatsApp + CRM key', 'Stores mobile', 'WA bill + dues lookup'),
    B('Customer dropdown (if shown)', 'Pick existing', 'Links known guest', 'History/dues load'),
    B('Dues banner', 'Outstanding credit warning', 'Shows balance', 'Collect or use Due carefully'),
  ]);
  set('09c-pos-tip-promo', [
    B('More options accordion', 'Reveal tip & promo', 'Expands panel', 'Tip/promo controls'),
    B('Tip: No tip', 'Skip gratuity', 'Tip = 0', 'Grand total without tip'),
    B('Tip: 5% / 10%', 'Quick tip', 'Adds % of subtotal', 'Grand total up'),
    B('Promo code input', 'Enter coupon', 'Types code', 'Apply'),
    B('Apply promo', 'Validate offer', 'Discounts cart if valid', 'Badge shows code'),
    B('Clear promo (×)', 'Remove coupon', 'Restores prices', 'Badge hidden'),
    B('Promo applied badge', 'Active offer reminder', 'Display only', '—'),
    B('Tax lines in footer', 'GST breakdown', 'Display from settings+slabs', '—'),
    B('Subtotal / Grand total', 'What guest pays', 'Display only', 'Choose payment'),
  ]);
  set('09d-pos-hold-kot', [
    B('Hold (btn-hold-current)', 'Park cart for later', 'Saves held order', 'Cart may clear; resume from Holds'),
    B('Holds list (right-click / Holds button)', 'Find parked orders', 'Lists holds', 'Resume or discard'),
    B('KOT (btn-kot)', 'Fire kitchen without pay', 'Sends ticket to KDS', 'Cooks see items; cart can stay open'),
    B('Held count badge', 'How many parked', 'Display only', 'Open Holds list'),
  ]);
  set('10-pos-pay', [
    B('Cash tender', 'Cash drawer sale', 'Selects Cash method', 'Optional cash-received UI'),
    B('UPI tender', 'UPI / QR counter pay', 'Selects UPI', 'Settle as UPI'),
    B('Card tender', 'Card machine', 'Selects Card', 'Settle as Card'),
    B('Due tender', 'Credit / tab', 'Selects Due — needs customer', 'CRM dues increase'),
    B('Split tender', 'Multi-pay one bill', 'Opens split amounts', 'Allocate Cash/UPI/Card/Due'),
    B('Cash received / change UI', 'Count notes', 'Shows change due', 'Print & Pay'),
    B('Print & Pay (btn-checkout)', 'Finish sale', 'Creates paid bill, stock deduct, print/WA options', 'Bill settled modal'),
    B('Settled: Print thermal', 'Paper receipt', 'Sends to printer/bridge', 'Physical bill'),
    B('Settled: WhatsApp PDF', 'Digital bill', 'Queues gateway send', 'Guest phone'),
    B('Settled: Close', 'Back to next order', 'Closes modal', 'Empty POS cart'),
  ]);
  set('10b-pos-split-cash', [
    B('Split method button', 'Multi tender', 'Opens split host', 'Enter per-method amounts'),
    B('→₹ rest to cash', 'Fill remainder', 'Puts leftover on cash', 'Balanced total'),
    B('→UPI / →Card / →Due helpers', 'Fill remainder to that tender', 'Assigns leftover', 'Balanced total'),
    B('½ helper', 'Half cash half UPI', 'Splits 50/50', 'Edit if needed'),
    B('Clear split', 'Reset amounts', 'Zeros split fields', 'Re-enter'),
    B('Cash exact (=)', 'Exact amount', 'Cash received = total', 'No change'),
    B('₹100 / 200 / 500 / 2k buttons', 'Quick notes', 'Adds to cash received', 'Change calculates'),
    B('CLR denomination', 'Reset cash input', 'Clears cash received', 'Re-enter'),
    B('Print & Pay', 'Settle split bill', 'Saves multi-tender payment', 'Settled modal'),
  ]);
  set('11-pos-shift', [
    B('Open shift', 'Start float', 'Records opening cash', 'Bill against shift'),
    B('Close shift', 'End float', 'Count + variance', 'Z-report'),
    B('Z CSV/Print', 'Audit pack', 'Downloads/prints', 'Accounts'),
    B('Station label', 'Device name', 'Tags bills', 'Filter reports'),
  ]);
  set('12-floor', [
    B('KPI: Free tables', 'How many empty', 'Display only', '—'),
    B('KPI: Dining now', 'Seated tables', 'Display only', '—'),
    B('KPI: Awaiting payment', 'Billed not cleared', 'Display only', '—'),
    B('KPI: Open table value', '₹ still open', 'Display only', '—'),
    B('Colour legend', 'State meaning', 'Display only', 'Read before acting'),
    B('Free table card', 'Seat guests', 'Seat & order / actions', 'POS for that table'),
    B('Occupied / dining card', 'Work open check', 'Checkout, transfer, hold, clear', 'POS or free table'),
    B('QR pending badge', 'Guest ordered', 'Jump to QR Orders', 'Accept queue'),
    B('Held badge', 'Parked order on table', 'Resume hold', 'POS cart restored'),
    B('Bill printed state', 'Await clear', 'Collect & free table', 'Available again'),
    B('Scan table', 'Staff camera link', 'Opens scanner', 'Not guest menu'),
    B('Refresh', 'Reload map', 'Fetches latest states', 'Updated colours'),
    B('Open all QR', 'Enable self-order', 'Opens guest QR all tables', 'Guests can order'),
    B('Close all QR', 'Disable self-order', 'Closes guest QR', 'Service only'),
    B('Clear all open', 'Emergency free all', 'Frees dining/held/billed', 'Confirm carefully — data loss risk'),
    B('Edit Tables', 'Change plan', 'Opens layout editor', 'Add/rename/seats'),
    B('Print Table QRs', 'Print tents', 'Opens print modal', 'QR print step'),
    B('Table count chip', 'How many tables', 'Display only', '—'),
  ]);
  set('12b-floor-edit-tables', [
    B('Edit Tables', 'Start layout change', 'Opens editor UI', 'Modify tables'),
    B('Add table / seat count fields', 'Match real room', 'Creates/updates table', 'Save layout'),
    B('Save layout', 'Persist for all stations', 'Cloud/local sync', 'Floor map updates everywhere'),
    B('Cancel', 'Abort edit', 'Discards changes', 'Floor unchanged'),
  ]);
  set('13-floor-qr-print', [
    B('Print Table QRs', 'Open mass print', 'Modal with preview', 'Configure size'),
    B('Card size presets (Mini…Full)', 'Fit table stand', 'Rebuilds card CSS', 'Live preview'),
    B('Custom mm size', 'Exact print size', 'Custom dimensions', 'Preview updates'),
    B('Wi‑Fi name/password toggles', 'Guest connectivity', 'Shows/hides on card', 'Set values in Settings profile first'),
    B('Welcome line toggle', 'Hospitality text', 'Shows/hides line', 'Preview updates'),
    B('Powered by toggle', 'Brand line', 'Shows/hides CodeArc mark', 'Preview updates'),
    B('Live preview card', 'What prints', 'Display only', 'Check table number + QR'),
    B('Print N cards / Print card', 'Output', 'Browser print dialog', 'Print at 100% scale'),
    B('Cancel', 'Abort', 'Closes modal', 'Floor map'),
  ]);
  set('13b-floor-qr-sessions', [
    B('Open all QR', 'Allow guest self-order', 'Enables QR sessions', 'Guests scan & order'),
    B('Close all QR', 'Stop new guest orders', 'Disables sessions', 'Staff-only ordering'),
    B('Staff Scan table', 'Staff tool only', 'Camera to link staff actions', 'Never for guest menus'),
    B('Per-table QR state on cards', 'Visual status', 'Badge when pending', 'QR Orders queue'),
  ]);
  set('14-qr-orders', [
    B('Accept', 'Take guest order', 'To kitchen', 'KDS ticket'),
    B('Reject', 'Decline', 'Drops ticket', 'Guest may reorder'),
    B('List/Cards', 'View mode', 'Layout change', 'Same queue'),
    B('Open floor', 'Jump map', 'Floor tab', 'Seat context'),
  ]);
  set('15-kds', [
    B('Ticket card', 'One order', 'Shows items', 'Progress status'),
    B('Ready / done', 'Food finished', 'Advances status', 'Service'),
    B('Clear', 'Remove board', 'Deletes finished', 'Clean KDS'),
    B('Open POS', 'Jump sell', 'POS tab', 'Counter'),
  ]);
  set('15b-kitchen-setup', [
    B('Kitchen Setup coach', 'Device checklist', 'Opens guided steps', 'Kitchen tablet ready'),
    B('Open Kitchen URL / role login', 'Dedicated device', 'Loads KDS', 'Tickets appear'),
  ]);
  set('16-online', [
    B('Accept', 'Take order', 'Kitchen/billing', 'Fulfil'),
    B('Reject', 'Cannot fulfil', 'Declines', 'Channel notified if linked'),
    B('Manual online', 'Phone order', 'Creates ticket', 'Same flow'),
  ]);
  set('17-bills', [
    B('Today / Yesterday / 7 days / All / Custom chips', 'Pick period', 'Filters stats + table', 'Matching bills'),
    B('Custom from/to + Apply', 'Exact range', 'Applies date filter', 'Updated list'),
    B('KPI: Today sales / bills / AOV / refunds', 'At-a-glance', 'Display only', '—'),
    B('Search box (bills-search)', 'Find by no/phone/name', 'Filters rows', 'Matching invoices'),
    B('Filter button', 'Explains table filters', 'Hint for payment/status columns', 'Use header filters'),
    B('Payment filter (table header)', 'Cash/UPI/Card/Due only', 'Filters rows', 'Narrow list'),
    B('Status filter (table header)', 'Paid/refunded/etc.', 'Filters rows', 'Narrow list'),
    B('Bill row', 'Open invoice', 'Detail / actions', 'Reprint refund export line'),
    B('Hint dismiss', 'Hide tip banner', 'Closes hint', 'More table space'),
  ]);
  set('17b-bills-export', [
    B('Excel export', 'CA multi-sheet pack', 'Summary + Bills + Lines workbook', 'Open in Excel'),
    B('CSV export', 'Raw import file', 'Downloads CSV', 'Scripts / Tally import'),
    B('Print report', 'Day/period A4 summary', 'Browser/PDF print', 'Manager file'),
    B('Reprint from detail', 'Lost paper', 'Prints again', 'Same receipt'),
    B('Refund / void', 'Correct mistake', 'May ask manager PIN then reverse', 'Status refunded; stock restore if linked'),
  ]);
  set('18-inventory', [
    B('Stock levels tab', 'On-hand list', 'Shows stock panel', 'Manage qty'),
    B('Recipes / Suppliers / Purchase orders / Waste tabs', 'Other stock domains', 'Switches sub-panel', 'That sub-screen'),
    B('Search stock', 'Find ingredient', 'Filters table', 'Matching rows'),
    B('Category / status filters', 'Narrow list', 'Filters rows', 'Food/packaging/low only'),
    B('Add stock item', 'New ingredient', 'Opens add form', 'Row in list'),
    B('Export inventory', 'Backup CSV', 'Downloads all stock', 'Archive'),
    B('Low stock CSV', 'Reorder list', 'Downloads below-min items', 'Call supplier'),
    B('Template + Import', 'Bulk load', 'CSV in/out', 'Many items'),
    B('Variance', 'Theory vs actual', 'Opens variance tool', 'Investigate loss'),
    B('Prep', 'Batch production', 'Use stock to make stock', 'Updated qty'),
    B('Takeaway pack', 'Packaging rules', 'Auto-use on takeaway/delivery', 'Settings for packs'),
    B('Auto-draft POs banner', 'Reorder help', 'Drafts purchase orders', 'PO list'),
    B('Restock / Edit / Batches on row', 'Maintain item', 'Qty or cost edit', 'Healthy / low status'),
    B('Set costs / Show ₹0 only', 'Costing focus', 'Filters or prompts unit cost', 'Recipe margin ready'),
  ]);
  set('18b-inventory-recipes', [
    B('Recipes tab', 'Link dish→stock', 'Shows recipe grid', 'Edit lines'),
    B('Bulk Import Recipes', 'Fast link', 'Parses lines', 'Many recipes'),
  ]);
  set('18c-inventory-suppliers', [
    B('Suppliers tab', 'Vendors', 'Supplier list', 'Add supplier'),
    B('Add supplier', 'New vendor', 'Saves contact', 'Use on PO'),
  ]);
  set('18d-inventory-po', [
    B('Purchase orders tab', 'Buy stock', 'PO list', 'Create PO'),
    B('Receive PO', 'Goods in', 'Increases stock', 'Stock levels up'),
  ]);
  set('18e-inventory-waste', [
    B('Waste log tab', 'Spoilage', 'Waste list', 'Add waste row'),
    B('Log waste', 'Record loss', 'Drops stock', 'Variance honest'),
  ]);
  set('19-menu', [
    B('Add item fields', 'New sellable', 'Fills form', 'Save'),
    B('GST slab', 'Item tax', 'Sets taxCategory', 'POS tax uses it'),
    B('Available toggle', 'Sold-out', 'Hides from POS', 'Re-enable later'),
    B('Save', 'Publish', 'Writes menu', 'POS/QR update'),
  ]);
  set('19b-menu-import-export', [
    B('Export', 'Backup catalog', 'CSV file', 'Archive'),
    B('Template + Import', 'Bulk load', 'Creates items', 'POS grid fills'),
    B('Enable All', 'Unblock menu', 'All available', 'Full sell list'),
  ]);
  set('20-employees', [
    B('Add team member', 'New staff', 'Creates login', 'They can sign in'),
    B('Role', 'Permission set', 'Hides tabs', 'Safer cashier'),
    B('Deactivate', 'Ex-staff', 'Blocks login', 'Cannot enter'),
  ]);
  set('20b-employees-roster', [B('Shift roster', 'Plan shifts', 'Roster UI', 'Assign staff')]);
  set('20c-employees-attendance', [B('Attendance', 'Presence', 'Mark present/leave', 'Payroll input')]);
  set('20d-employees-payroll', [
    B('Pay salaries', 'Run payroll', 'Records payslips', 'Staff paid'),
    B('Advance', 'Early pay', 'Records advance', 'Balances dues'),
  ]);
  set('20e-employees-logins', [
    B('Logins segment', 'Credentials', 'Lists access', 'Reset password'),
    B('Reset password', 'Unlock staff', 'New secret', 'They sign in'),
  ]);
  set('21-customers', [
    B('Search', 'Find guest', 'Filters CRM', 'Open card'),
    B('Customer card', 'Profile', 'History/points/dues', 'Act'),
  ]);
  set('21b-customers-dues', [
    B('Settle dues', 'Collect credit', 'Payment modal', 'Dues down + receipt'),
    B('Notes', 'Preferences', 'Saves text', 'Waiters see later'),
  ]);
  set('22-tax', [
    B('Period controls', 'Tax window', 'Filters totals', 'Updated stats'),
    B('Download GSTR-ready', 'CA pack', 'File download', 'Accountant'),
    B('Rate slabs', 'Configure rates', 'Edits tax_rates', 'POS uses packs'),
  ]);
  set('23-reports', [
    B('Period chips', 'Time range', 'Recomputes KPIs', 'New charts'),
    B('Payment mix', 'Tender split', 'Donut chart', 'Cash discipline'),
    B('Daily revenue', 'Busy days', 'Bar chart', 'Staffing'),
  ]);
  set('23b-reports-export', [
    B('GSTR CSV', 'Compliance', 'Download', 'CA software'),
    B('Cross-check Bills Excel', 'Reconcile', 'Match totals', 'Trust numbers'),
  ]);
  set('24-analytics', [
    B('Period', 'Range', 'Reloads analytics', 'Trends'),
    B('Top items / peak hours', 'Insights', 'Rankings', 'Ops decisions'),
  ]);
  set('25-growth', [
    B('Each hub tile', 'Open module', 'Loads tool', 'Complete form'),
  ]);
  set('25b-growth-reservations', [
    B('Add reservation', 'Book table', 'Saves booking', 'Seat on arrival'),
    B('Seat / No-show / Cancel', 'Lifecycle', 'Updates status', 'Floor coordination'),
  ]);
  set('25c-growth-tickets', [
    B('New ticket', 'Log complaint', 'Creates ticket', 'Assign/resolve'),
    B('Resolve / Waiting', 'Workflow', 'Status change', 'Closed loop'),
  ]);
  set('25d-growth-po', [
    B('Create PO', 'Order stock', 'PO document', 'Supplier'),
    B('Receive', 'Goods in', 'Stock up', 'Inventory'),
  ]);
  set('25e-growth-recipe-cost', [
    B('Select dish', 'Cost focus', 'Loads recipe', 'See plate cost'),
    B('Unit costs', 'Ingredient price', 'Margin math', 'Adjust menu price'),
  ]);
  set('25f-growth-offers', [
    B('Create offer', 'Promo code', 'Saves coupon', 'POS Apply'),
    B('Activate / Pause', 'Control validity', 'Toggles offer', 'Cashiers can/cannot use'),
  ]);
  set('25g-growth-wa-campaigns', [
    B('Draft campaign', 'Broadcast', 'Message composer', 'Send to list'),
    B('Audience', 'Who receives', 'Customer segment', 'Gateway must be green'),
  ]);
  set('25h-growth-feedback', [
    B('Reviews list', 'Guest voice', 'Ratings', 'Respond / escalate'),
  ]);
  set('25i-growth-loyalty', [
    B('Earn/redeem rules', 'Points program', 'Saves policy', 'CRM points move'),
  ]);
  set('26-settings-profile', [
    B('Left nav: Outlet profile', 'This pane', 'Shows identity form', 'Edit fields'),
    B('Business name', 'Bill + QR header', 'Saves display name', 'Prints update'),
    B('Outlet code (read-only)', 'Login slug', 'Cannot edit', 'Contact support to change'),
    B('Address / phone', 'Contact on bills', 'Saves fields', 'Prints update'),
    B('Country select', 'Tax pack + dial', 'Updates locale', 'Tax label GST/VAT'),
    B('Currency select', 'Money symbol', '₹ € $ etc.', 'POS prices format'),
    B('GSTIN', 'Legal invoice id', 'Prints on bill', 'Compliance'),
    B('Guest Wi‑Fi name/password', 'QR tent lines', 'Stored for print', 'Print Table QRs'),
    B('Welcome line', 'QR hospitality text', 'Stored for print', 'QR cards'),
    B('Discard', 'Abort edits', 'Reloads saved', 'Unchanged'),
    B('Save changes', 'Persist', 'Cloud + local sync', 'All stations update'),
  ]);
  set('27-settings-tax', [
    B('Calculate taxes toggle', 'Master tax on/off', 'Enables tax engine', 'Cart shows tax lines'),
    B('Tax label (GST)', 'Word on bill', 'Saves label', 'Print wording'),
    B('Default tax rate %', 'Fallback when item has no slab', 'Saves %', 'Menu slabs still win per item'),
    B('Inclusive pricing toggle', 'Prices include tax?', 'Changes tax math', 'Grand total behaviour'),
    B('Service charge %', 'Dine-in auto charge', 'Adds % when enabled', 'Cart total'),
    B('Show HSN toggle', 'Print HSN codes', 'Shows HSN on invoice', 'If codes maintained'),
    B('Happy hour / promo / loyalty blocks', 'Pricing extras', 'Saves toggles/rules', 'POS promos & points'),
    B('Save', 'Persist tax policy', 'Writes settings', 'New bills use rules'),
  ]);
  set('28-settings-printer', [
    B('Printer name / device', 'Which printer', 'Routes ESC/POS or system print', 'Paper out'),
    B('Paper width 58/80mm', 'Match roll', 'Formats receipt', 'Correct cut'),
    B('Auto-print bill toggle', 'Speed on settle', 'Prints without prompt', 'Rush friendly'),
    B('Auto KOT toggle', 'Kitchen speed', 'Prints KOT on send', 'Cooks get paper too'),
    B('Cash drawer toggle', 'Open till on cash', 'Pulse drawer', 'Cash sales'),
    B('Test print', 'Verify hardware', 'Sends sample', 'Fix driver if fail'),
    B('Save', 'Persist print policy', 'Writes settings', 'Next bill uses it'),
  ]);
  set('28b-settings-gateway', [
    B('WhatsApp nav item', 'This pane', 'Shows gateway UI', 'Scan or status'),
    B('Scan QR / link device', 'Pair WhatsApp', 'Connects gateway session', 'Top bar icon green'),
    B('Connection status', 'Health', 'Connected/disconnected', 'Restart if red'),
    B('Auto-send bill toggle', 'PDF on settle', 'Queues WA when phone present', 'Guest receives bill'),
    B('Test send', 'Verify path', 'Sends sample message', 'Ready for service'),
    B('Reset gateway (if shown)', 'Re-pair', 'Clears session — re-scan', 'Use carefully'),
  ]);
  set('28c-settings-payments', [
    B('Razorpay Route status', 'Online settlement', 'Active / Pending / Not enabled', 'Bank path when active'),
    B('Linked account id', 'Razorpay reference', 'Display only', 'Support with Razorpay'),
    B('Retry / refresh', 'Re-check status', 'Reloads settlement state', 'Updated pill'),
    B('Note: Cash & counter UPI', 'Always work in POS', 'No Route required', 'Keep using POS tenders'),
  ]);
  set('28d-settings-security', [
    B('Set / change manager PIN', 'Protect sensitive acts', 'Saves PIN hash', 'Prompt on gated actions'),
    B('Require PIN: refund', 'Stop casual refunds', 'Toggle gate', 'PIN modal on refund'),
    B('Require PIN: void / discount / drawer', 'Policy set', 'Toggles each gate', 'Safer floor'),
    B('Save', 'Persist security', 'Writes settings', 'Next action uses PIN'),
  ]);
  set('28e-settings-team', [
    B('Role templates / cashier restrictions', 'Default powers', 'Saves policy', 'New staff inherit limits'),
    B('Who may open Settings/Reports/Inventory', 'Least privilege', 'Toggles access', 'Align with Employees roles'),
    B('Save', 'Persist team policy', 'Writes settings', 'Next login respects'),
  ]);
  set('28f-settings-plan', [
    B('Current plan name', 'What you pay for', 'Display limits', 'Upgrade if needed'),
    B('Limits (stations/users)', 'Capacity', 'Display only', 'Contact upgrade'),
    B('Upgrade / contact CTA', 'Change plan', 'Opens contact or billing', SUPPORT),
  ]);
  set('28g-settings-danger', [
    B('Export first (from Bills/Menu)', 'Backup before anything', 'Download files', 'Safe copy offline'),
    B('Reset / wipe / delete actions', 'Irreversible', 'Destroys data or outlet', 'ONLY with support on call'),
    B('Type-to-confirm fields', 'Prevent accidents', 'Must type outlet code', 'Still think twice'),
    B('Contact ' + SUPPORT, 'Human gate', 'Email before click', 'Do not DIY wipe'),
  ]);
  set('29-day-close', [
    B('Close shift', 'Cash discipline', 'Z-report', 'Tomorrow float'),
    B('Reports Today', 'Reconcile', 'Match drawer', 'Accounts trust'),
    B('Exports', 'Handoff', 'CSV/Excel', 'CA'),
    B('Sign out shared devices', 'Security', 'Clears session', 'Login screen'),
  ]);
  set('29b-offline-sync', [
    B('Continue POS offline', 'No internet', 'Local bills', 'Sync later'),
    B('Retry / Reconnect', 'Lease/network', 'Restores cloud', 'WA works again'),
  ]);
  set('30-support', [
    B('Help / Demo', 'Learn in-app', 'Opens checklist', 'Guided tour'),
    B('Email ' + SUPPORT, 'Human help', 'Support ticket', 'Fix with build id'),
  ]);

  return d;
}

module.exports = { buildOnboardingContent };
