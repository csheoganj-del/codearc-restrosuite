(function () {
  'use strict';

  const FEATURES = [
    {
      tabId: 'pos-tab',
      label: 'Point of Sale',
      icon: 'fa-mug-hot',
      group: 'Service',
      subtitle: 'Counter billing & checkout',
      description: 'Create dine-in, takeaway, and delivery bills. Apply loyalty, split payments, print receipts, and settle tables.',
      firstAction: 'Add a menu item → choose order type & payment → complete one test bill.',
      minutes: 3
    },
    {
      tabId: 'floor-tab',
      label: 'Floor & Tables',
      icon: 'fa-border-all',
      group: 'Service',
      subtitle: 'Seating & table map',
      description: 'Manage tables, hold and merge orders, print QR cards, and see which covers are open or settled.',
      firstAction: 'Open Floor, pick a free table, seat a test party, and send one item to the kitchen.',
      minutes: 3
    },
    {
      tabId: 'qr-orders-tab',
      label: 'QR Orders',
      icon: 'fa-qrcode',
      group: 'Service',
      subtitle: 'Guest self-order at the table',
      description: 'Generate table QR links, receive customer orders, approve them, and route tickets to the kitchen.',
      firstAction: 'Generate a QR for one table → open the guest link → submit a test order → approve it.',
      minutes: 5
    },
    {
      tabId: 'online-tab',
      label: 'Online Orders',
      icon: 'fa-cloud-arrow-down',
      group: 'Service',
      subtitle: 'Delivery-channel queue',
      description: 'Review incoming online and delivery-channel orders in one place and accept or reject them.',
      firstAction: 'Open Online Orders and confirm how your team accepts or rejects channel tickets.',
      minutes: 2
    },
    {
      tabId: 'kds-tab',
      label: 'Kitchen Display',
      icon: 'fa-tv',
      group: 'Kitchen',
      subtitle: 'Prep board for cooks',
      description: 'Show accepted tickets, track item prep, and mark orders ready for service or collection.',
      firstAction: 'Send a test order from POS/QR, then move it from preparing → ready on the KDS.',
      minutes: 3
    },
    {
      tabId: 'tokens-tab',
      label: 'Token Board',
      icon: 'fa-ticket',
      group: 'Kitchen',
      subtitle: 'Customer collection display',
      description: 'Show which tokens are preparing and which are ready on a customer-facing screen.',
      firstAction: 'Open this on the pickup display and verify one test order flips to ready.',
      minutes: 2
    },
    {
      tabId: 'bills-tab',
      label: 'Bills',
      icon: 'fa-file-invoice-dollar',
      group: 'Back office',
      subtitle: 'Invoices & sales history',
      description: 'Search, inspect, reprint, refund, and export completed invoices with day totals.',
      firstAction: 'Open a test bill and confirm totals, tax, and payment method look correct.',
      minutes: 2
    },
    {
      tabId: 'inventory-tab',
      label: 'Inventory',
      icon: 'fa-boxes-stacked',
      group: 'Back office',
      subtitle: 'Stock, batches & expiry',
      description: 'Track ingredients, reorder thresholds, batches, expiry, and recipe consumption.',
      firstAction: 'Add 3–5 stock items (or import Excel) and set low-stock thresholds.',
      minutes: 8
    },
    {
      tabId: 'editor-tab',
      label: 'Menu Editor',
      icon: 'fa-pen-to-square',
      group: 'Back office',
      subtitle: 'Items, prices & recipes',
      description: 'Publish categories, prices, availability, descriptions, and recipes used by POS and QR.',
      firstAction: 'Create one test item with a price and confirm it appears in POS.',
      minutes: 10
    },
    {
      tabId: 'reports-tab',
      label: 'Reports',
      icon: 'fa-chart-line',
      group: 'Back office',
      subtitle: 'Sales & performance',
      description: 'Revenue, order volume, item mix, payment split, and tax for any date range.',
      firstAction: 'Pick today as the range and match totals to Bills after a test sale.',
      minutes: 2
    },
    {
      tabId: 'customers-tab',
      label: 'Customers',
      icon: 'fa-address-book',
      group: 'Back office',
      subtitle: 'CRM, loyalty & dues',
      description: 'Customer visits, spend, loyalty points, notes, and outstanding dues.',
      firstAction: 'Complete a bill with a phone number and confirm the customer record updates.',
      minutes: 3
    },
    {
      tabId: 'crm-tab',
      label: 'CRM & Loyalty',
      icon: 'fa-users-rectangle',
      group: 'Back office',
      subtitle: 'Customer and loyalty records',
      description: 'Track visits, spend, loyalty points, and notes for marketing-ready contacts.',
      firstAction: 'Add a test customer or bill with a phone number and confirm loyalty updates.',
      minutes: 3
    },
    {
      tabId: 'tax-tab',
      label: 'Tax & GST',
      icon: 'fa-calculator',
      group: 'Back office',
      subtitle: 'Rates & compliance',
      description: 'Tax rates, invoice exports, and billing compliance for your country.',
      firstAction: 'Confirm rates and registration details before live sales.',
      minutes: 5
    },
    {
      tabId: 'employees-tab',
      label: 'Employees',
      icon: 'fa-users',
      group: 'Team',
      subtitle: 'Roles, shifts & access',
      description: 'Staff accounts, roles, attendance, leave, and payroll helpers.',
      firstAction: 'Add one cashier with limited tabs and log in as them once to test access.',
      minutes: 6
    },
    {
      tabId: 'growth-hub-tab',
      label: 'Growth Hub',
      icon: 'fa-rocket',
      group: 'Team',
      subtitle: 'Ops toolkit',
      description: 'Reservations, procurement, offers, refunds, devices, backups, and launch tasks.',
      firstAction: 'Open Growth Hub and complete any remaining launch checklist items.',
      minutes: 5
    }
  ];

  const WELCOME_STEP = {
    tabId: '',
    label: 'Getting Started',
    icon: 'fa-compass',
    subtitle: 'Your enabled RestroSuite workspace',
    description: 'This tour only covers features enabled for your plan and staff role. Reopen Help anytime from the sidebar.',
    firstAction: 'Finish the setup checklist (profile → menu → staff → one test bill), then explore features below.'
  };

  const UPDATES_HISTORY = [
    {
      version: "v36-20260708",
      date: "2026-07-08",
      title: "Logical Numbering & Update Reliability Fix",
      summary: "This update replaces timestamp-style visible numbers with short daily sequences, keeps update notes current, and widens the POS guest name and phone fields.",
      highlights: [
        "Visible bills, KOTs, QR orders, held drafts, purchase orders, and tickets now use readable daily numbers.",
        "The update dialog no longer reuses old release notes for patch-only code updates.",
        "The POS cart guest name and phone fields now have full-width room and mobile-safe wrapping."
      ]
    },
    {
      version: "v22-20260621",
      date: "2026-06-21",
      title: "POS Active Cart Persistence & Stability",
      summary: "This update fixes POS active cart resetting on layout switches, resolves infinite loops when resetting tables, and bumps version naming for clarity.",
      highlights: [
        "Active Cart Persistence: Cart items are saved to drafts when switching layouts or changing tables.",
        "Recursion Guard: Implemented safety flags to prevent stack overflow loop crashes on table resets.",
        "Semantic Release Naming: Updated the versioning system to clean semantic v-format strings."
      ]
    },
    {
      version: "2026.06.20-onboarding",
      date: "2026-06-20",
      title: "Onboarding Usability & Tour Update",
      summary: "This update resolves tooltip layout overlapping, makes the 'What's New' history button responsive, and fixes settings tab setup task redirects.",
      highlights: [
        "Collision-Free Tooltips: Tooltip card dynamically shifts to the side with more space (left/right) to keep highlighted elements fully visible.",
        "What's New Button: Resolved the click event handler on the What's New history button.",
        "Redirect & Input Focus: Setup task checklist buttons now route directly to settings sub-sections and auto-focus fields.",
        "Mobile View Centering: Centered tooltip cards on narrow viewports using translate transforms."
      ]
    },
    {
      version: "2026.06.19-dues",
      date: "2026-06-19",
      title: "Customer Dues & QR Printing Update",
      summary: "This update introduces customer credit (dues) management, QR code generation/printing for tables, and persistent POS drafts.",
      highlights: [
        "Credit Payment: cashiers can now select 'Due' as a payment method for registered customers.",
        "CRM Dues Tracking: customer profiles in CRM now display outstanding dues and allow quick settlements.",
        "POS Customer Selector: easily assign customers to POS orders for loyalty and dues tracking.",
        "Table QR Printing: generate and print QR codes directly from the Floor & Tables toolbar.",
        "Persistent POS Drafts: parked/held orders are saved to the database and survive reloads."
      ]
    },
    {
      version: "2026.06.19-restrosuite",
      date: "2026-06-19",
      title: "RestroSuite dashboard reliability update",
      summary: "This update improves billing clarity, import/export feedback, logo consistency, update safety, and background sync smoothness.",
      highlights: [
        "Bills now use date-wise numbers like RS-260619-001.",
        "Bill, tax, menu, inventory, and tenant exports use date-wise filenames.",
        "Import and export work now shows a clear progress/status bar.",
        "The dashboard checks for updates in the background and prompts with release notes."
      ]
    },
    {
      version: "2026.06.18",
      date: "2026-06-18",
      title: "Menu Import/Export & KDS Optimization",
      summary: "Introduced bulk menu importing via Excel templates and enhanced kitchen display responsiveness.",
      highlights: [
        "Bulk menu setup using Excel templates.",
        "KDS screen responsiveness improvements and color coding.",
        "Multi-station kitchen routing."
      ]
    }
  ];

  const DUES_TOUR_STEPS = [
    {
      tabId: 'pos-tab',
      label: 'Customer Selection',
      icon: 'fa-address-book',
      subtitle: 'Assign Customers to POS Orders',
      description: 'We have added a customer dropdown in the cart header. Select a registered customer to track their loyalty, visits, and outstanding dues.',
      firstAction: 'Choose any registered customer (or leave as Walk-in Customer for guest orders).',
      targetSelector: '#cart-customer-sel'
    },
    {
      tabId: 'pos-tab',
      label: 'Due Payment Method',
      icon: 'fa-hand-holding-dollar',
      subtitle: 'Record Sales on Credit',
      description: 'Use the new "Due" payment method next to Cash/UPI/Card to checkout orders on credit. Credit checkouts require selecting a registered customer.',
      firstAction: 'Click on the "Due" payment button in the POS cart to see how it works.',
      targetSelector: 'button[data-pay-method="Due"]'
    },
    {
      tabId: 'customers-tab',
      label: 'Track Outstanding Dues',
      icon: 'fa-address-book',
      subtitle: 'CRM Dues & Loyalty Dashboard',
      description: 'Outstanding dues accumulate on the customer\'s profile automatically. The total store dues are tracked in the top stats cards.',
      firstAction: 'Look at the "Total Outstanding Dues" card and the "Due" indicator badges on customer cards.',
      targetSelector: '.sidebar-link[data-tab="customers-tab"]'
    },
    {
      tabId: 'customers-tab',
      label: 'Settle Dues',
      icon: 'fa-indian-rupee-sign',
      subtitle: 'Quick Payments & Settlements',
      description: 'Open a customer\'s card, then click "Settle Dues" to record a cash, card, or UPI payment to pay off their balance. It writes to billing history automatically.',
      firstAction: 'Click any customer card, then choose "Settle now" or "Settle Dues" from the footer.',
      targetSelector: '.crm-card, #crm-grid'
    }
  ];

  let steps = [];
  let currentStep = 0;

  function allowedTabIds() {
    try {
      const stored = JSON.parse(sessionStorage.getItem('allowed_tabs') || '[]');
      return Array.isArray(stored) ? stored : [];
    } catch (error) {
      return [];
    }
  }

  function isFeatureVisible(feature) {
    const allowlist = allowedTabIds();
    if (allowlist.length && !allowlist.includes(feature.tabId)) return false;
    const link = document.querySelector(`.sidebar-link[data-tab="${feature.tabId}"]`);
    return Boolean(link && window.getComputedStyle(link).display !== 'none');
  }

  function enabledFeatures() {
    return FEATURES.filter(isFeatureVisible);
  }

  function tourStorageKey() {
    const tenant = sessionStorage.getItem('tenant_id') || 'default';
    const user = sessionStorage.getItem('tenant_user_id') || sessionStorage.getItem('logged_in_user') || 'user';
    const signature = enabledFeatures().map(feature => feature.tabId).sort().join(',');
    return `restrosuite_tour_done:${tenant}:${user}:${signature}`;
  }

  function readJson(key, fallback) {
    try {
      const parsed = JSON.parse(localStorage.getItem(key));
      return parsed === null ? fallback : parsed;
    } catch (error) {
      return fallback;
    }
  }

  function readSettingsSnapshot() {
    try {
      if (window.RS_SETTINGS && typeof window.RS_SETTINGS === 'object') return window.RS_SETTINGS;
    } catch (_) {}
    return readJson('rs_v2:settings', {}) || {};
  }

  // Shared with the mandatory first-login profile widget below so both
  // "is the profile complete" checks can never drift out of sync.
  function detectHasBusinessProfile(settingsOverride) {
    const profile = readJson('doppio_business_profile', {}) || {};
    const localSettings = settingsOverride || readSettingsSnapshot();
    return Boolean(
      profile.name || profile.businessName || profile.restaurantName || profile.business_name ||
      localSettings.set_restaurant_name || localSettings.set_outlet_name
    );
  }

  function openSettingsSection(sectionKey, focusSelector) {
    if (window.RS && typeof window.RS.activateTab === 'function') {
      window.RS.activateTab('settings-tab');
    } else {
      document.getElementById('open-settings')?.click();
    }
    setTimeout(() => {
      document.querySelector(`.set-nav button[data-s="${sectionKey}"]`)?.click();
      if (focusSelector) {
        setTimeout(() => document.querySelector(focusSelector)?.focus(), 60);
      }
    }, 80);
  }

  async function listCollection(name, fallbackKey) {
    try {
      if (window.RS_DB && typeof RS_DB.list === 'function') {
        const rows = await RS_DB.list(name);
        if (Array.isArray(rows)) return rows;
        if (rows && typeof rows === 'object') return Object.values(rows);
      }
    } catch (_) {}
    if (fallbackKey) {
      const raw = readJson(fallbackKey, null);
      if (Array.isArray(raw)) return raw;
      if (raw && typeof raw === 'object') return Object.values(raw);
    }
    return [];
  }

  async function gatherWorkspaceSnapshot() {
    let settings = readSettingsSnapshot();
    try {
      if (window.RS && typeof RS.getSettings === 'function') {
        const s = await RS.getSettings();
        if (s && typeof s === 'object') settings = s;
      } else if (window.RS_DB && typeof RS_DB.getSettings === 'function') {
        const s = await RS_DB.getSettings();
        if (s && typeof s === 'object') settings = s;
      }
    } catch (_) {}

    const [menu, bills, employees, inventory, pendingOrders] = await Promise.all([
      listCollection('menu', 'doppio_menu'),
      listCollection('bills', 'doppio_bills'),
      listCollection('employees', 'doppio_employees'),
      listCollection('inventory', 'doppio_inventory'),
      listCollection('pending_orders', 'doppio_pending_orders'),
    ]);

    return { settings, menu, bills, employees, inventory, pendingOrders };
  }

  async function setupTasks() {
    const enabled = new Set(enabledFeatures().map(feature => feature.tabId));
    // Sidebar may use "settings" via gear only — treat tax/settings as available for admins
    const role = String(sessionStorage.getItem('logged_in_role') || '').toLowerCase();
    const canSettings = ['admin', 'owner', 'manager', 'superadmin', ''].includes(role);

    const snap = await gatherWorkspaceSnapshot();
    const { settings, menu, bills, employees, inventory, pendingOrders } = snap;
    const profile = readJson('doppio_business_profile', {}) || {};

    const hasProfile = detectHasBusinessProfile(settings);
    const hasTax = Boolean(
      profile.gstin || profile.gstNumber || profile.gst_number ||
      settings.set_gstin || settings.set_invoice_prefix || settings.set_default_gst_slab ||
      settings.set_tax_mode
    );
    const hasMenu = Array.isArray(menu) && menu.length > 0;
    const hasInventory = Array.isArray(inventory) && inventory.length > 0;
    const hasStaff = Array.isArray(employees) && employees.length > 0;
    const hasBill = Array.isArray(bills) && bills.length > 0;
    const hasQr = Array.isArray(pendingOrders) && pendingOrders.some(order =>
      order && (order.orderType === 'Dine-In' || order.order_type === 'Dine-In' ||
        String(order.tableNumber || order.table || '').match(/^\d+$/))
    );

    const tasks = [
      {
        id: 'profile',
        label: 'Complete outlet profile',
        detail: 'Name, phone, address — used on receipts and bills',
        eta: '1 min',
        done: hasProfile,
        priority: 1,
        action: () => openSettingsSection('profile', '[data-skey="set_restaurant_name"]')
      }
    ];

    if (enabled.has('editor-tab') || enabled.has('pos-tab')) {
      tasks.push({
        id: 'menu',
        label: 'Publish your menu',
        detail: 'Add items in Menu Editor or import via Excel',
        eta: '10 min',
        done: hasMenu,
        priority: 2,
        tabId: enabled.has('editor-tab') ? 'editor-tab' : 'pos-tab'
      });
    }
    if (enabled.has('inventory-tab')) {
      tasks.push({
        id: 'inventory',
        label: 'Stock your inventory',
        detail: 'Items, units, and low-stock thresholds',
        eta: '8 min',
        done: hasInventory,
        priority: 3,
        tabId: 'inventory-tab'
      });
    }
    if (canSettings || enabled.has('tax-tab')) {
      tasks.push({
        id: 'tax',
        label: 'Verify tax settings',
        detail: 'Country, tax rates / GST before live billing',
        eta: '3 min',
        done: hasTax,
        priority: 4,
        action: () => openSettingsSection('tax', '[data-skey="set_default_gst_slab"]')
      });
    }
    if (enabled.has('employees-tab')) {
      tasks.push({
        id: 'staff',
        label: 'Add staff & roles',
        detail: 'Give each person only the tabs they need',
        eta: '5 min',
        done: hasStaff,
        priority: 5,
        tabId: 'employees-tab'
      });
    }
    if (enabled.has('qr-orders-tab') || enabled.has('floor-tab')) {
      tasks.push({
        id: 'qr',
        label: 'Test one table QR order',
        detail: 'Guest scans → orders → you approve → kitchen',
        eta: '5 min',
        done: hasQr,
        priority: 6,
        tabId: enabled.has('qr-orders-tab') ? 'qr-orders-tab' : 'floor-tab'
      });
    }
    if (enabled.has('pos-tab')) {
      tasks.push({
        id: 'bill',
        label: 'Complete one test bill',
        detail: 'Price, tax, payment, receipt — full checkout path',
        eta: '3 min',
        done: hasBill,
        priority: 7,
        tabId: 'pos-tab'
      });
    }
    return tasks.sort((a, b) => a.priority - b.priority);
  }

  function activateTab(tabId) {
    if (window.RS && typeof window.RS.activateTab === 'function') {
      window.RS.activateTab(tabId);
      return;
    }
    const link = document.querySelector(`.sidebar-link[data-tab="${tabId}"]`)
      || document.querySelector(`.mobile-bottom-nav [data-tab="${tabId}"]`)
      || document.querySelector(`.more-sheet-link[data-tab="${tabId}"]`);
    if (link) link.click();
  }

  function escGuide(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function injectGuide() {
    if (document.getElementById('product-guide-modal')) return;
    const modal = document.createElement('div');
    modal.id = 'product-guide-modal';
    modal.className = 'product-guide-modal';
    modal.setAttribute('aria-hidden', 'true');
    const ver = String(window.__RESTROSUITE_ASSET_VERSION__ || 'v191').split('-')[0];
    modal.innerHTML = `
      <div class="product-guide-backdrop" data-guide-close></div>
      <section class="product-guide-panel" role="dialog" aria-modal="true" aria-labelledby="product-guide-title">
        <header class="product-guide-header">
          <div class="product-guide-brand">
            <div class="product-guide-brand-ic" aria-hidden="true"><i class="fa-solid fa-life-ring"></i></div>
            <div class="product-guide-header-copy">
              <h2 id="product-guide-title">Workspace Guide</h2>
              <p>Finish launch setup, then open any feature — filtered to your plan and role.</p>
            </div>
          </div>
          <div class="product-guide-header-actions">
            <button type="button" class="btn btn-ghost btn-sm" id="guide-view-updates"><i class="fa-solid fa-clock-rotate-left"></i> What's new</button>
            <button type="button" class="btn btn-primary btn-sm" id="guide-start-tour"><i class="fa-solid fa-compass"></i> Tour</button>
            <button type="button" class="product-guide-close" data-guide-close aria-label="Close"><i class="fa-solid fa-xmark"></i></button>
          </div>
        </header>

        <div class="product-guide-body">
          <div id="guide-next-cta" class="pg-next" hidden></div>

          <section class="pg-block" id="guide-setup-block">
            <header class="pg-block-head">
              <div>
                <h3>Launch checklist</h3>
                <p id="guide-setup-sub">Checking your workspace…</p>
              </div>
              <div class="pg-progress-ring" id="guide-progress-label" aria-live="polite">—</div>
            </header>
            <div class="pg-block-body">
              <div class="pg-bar" role="progressbar" aria-valuemin="0" aria-valuemax="100" aria-valuenow="0" id="guide-progress-bar"><span class="pg-bar-fill" style="width:0%"></span></div>
              <div id="guide-setup-summary" class="pg-task-list"></div>
            </div>
          </section>

          <section class="pg-block">
            <header class="pg-block-head">
              <div>
                <h3>Features on this workspace</h3>
                <p>Only modules enabled for you are shown.</p>
              </div>
              <span id="guide-feature-count" class="pg-pill">0</span>
            </header>
            <div class="pg-block-body">
              <div class="pg-tools">
                <div id="guide-group-filters" class="pg-chips" role="tablist" aria-label="Filter by area"></div>
                <label class="pg-search">
                  <i class="fa-solid fa-magnifying-glass" aria-hidden="true"></i>
                  <input type="search" id="guide-search" placeholder="Search features…" aria-label="Search features" autocomplete="off">
                </label>
              </div>
              <div id="guide-feature-grid" class="pg-feature-grid"></div>
            </div>
          </section>
        </div>

        <footer class="product-guide-footer">
          <div class="product-guide-footer-text">
            <strong>Need help?</strong>
            <span>We’ll set up training with your outlet name.</span>
          </div>
          <div class="product-guide-footer-actions">
            <a class="btn btn-ghost btn-sm" href="mailto:support@codearc.co.in?subject=RestroSuite%20setup%20help"><i class="fa-solid fa-envelope"></i> support@codearc.co.in</a>
            <span class="pg-pill pg-pill-mute">${escGuide(ver)}</span>
          </div>
        </footer>
      </section>
    `;
    document.body.appendChild(modal);
    modal.querySelectorAll('[data-guide-close]').forEach(button => button.addEventListener('click', closeGuide));
    modal.querySelector('#guide-start-tour').addEventListener('click', () => {
      closeGuide();
      startTour();
    });
    modal.querySelector('#guide-view-updates').addEventListener('click', () => {
      closeGuide();
      openUpdateHistoryModal();
    });
    let searchTimer = null;
    modal.querySelector('#guide-search').addEventListener('input', event => {
      clearTimeout(searchTimer);
      const val = event.target.value;
      searchTimer = setTimeout(() => renderGuide(val), 120);
    });
  }

  let guideFilterGroup = 'all';

  function runTask(task) {
    closeGuide();
    if (!task) return;
    if (typeof task.action === 'function') task.action();
    else if (task.tabId) activateTab(task.tabId);
  }

  async function renderGuide(search = '') {
    injectGuide();
    const query = String(search).trim().toLowerCase();
    const allFeatures = enabledFeatures();
    const summary = document.getElementById('guide-setup-summary');
    const nextCta = document.getElementById('guide-next-cta');
    const grid = document.getElementById('guide-feature-grid');
    const setupSub = document.getElementById('guide-setup-sub');
    const progressLabel = document.getElementById('guide-progress-label');
    const progressBar = document.getElementById('guide-progress-bar');

    if (summary) {
      summary.innerHTML = `<div class="pg-loading"><i class="fa-solid fa-spinner fa-spin"></i> Checking live workspace data…</div>`;
    }

    let tasks = [];
    try {
      tasks = await setupTasks();
    } catch (e) {
      console.warn('[Guide] setupTasks failed', e);
      tasks = [];
    }

    const completed = tasks.filter(task => task.done).length;
    const remaining = tasks.filter(task => !task.done);
    const percent = tasks.length ? Math.round((completed / tasks.length) * 100) : 100;
    const nextTask = remaining[0] || null;
    const allDone = tasks.length > 0 && remaining.length === 0;

    if (setupSub) {
      setupSub.textContent = allDone
        ? 'All set — use this guide to train new staff anytime.'
        : `${completed} of ${tasks.length} done · progress updates from your live data`;
    }
    if (progressLabel) progressLabel.textContent = `${percent}%`;
    if (progressBar) {
      progressBar.setAttribute('aria-valuenow', String(percent));
      const fill = progressBar.querySelector('.pg-bar-fill') || progressBar.querySelector('span');
      if (fill) fill.style.width = `${percent}%`;
    }

    if (nextCta) {
      if (allDone) {
        nextCta.hidden = false;
        nextCta.className = 'pg-next is-done';
        nextCta.innerHTML = `
          <div class="pg-next-ic"><i class="fa-solid fa-circle-check"></i></div>
          <div class="pg-next-text">
            <div class="pg-next-kicker">Ready for service</div>
            <div class="pg-next-title">Launch checklist complete</div>
            <div class="pg-next-desc">Take a short tour of enabled features, or jump into any module below.</div>
          </div>
          <button type="button" class="btn btn-primary btn-sm" id="guide-cta-tour"><i class="fa-solid fa-compass"></i> Start tour</button>`;
        nextCta.querySelector('#guide-cta-tour')?.addEventListener('click', () => { closeGuide(); startTour(); });
      } else if (nextTask) {
        nextCta.hidden = false;
        nextCta.className = 'pg-next';
        nextCta.innerHTML = `
          <div class="pg-next-ic"><i class="fa-solid fa-arrow-right"></i></div>
          <div class="pg-next-text">
            <div class="pg-next-kicker">Up next${nextTask.eta ? ` · ${escGuide(nextTask.eta)}` : ''}</div>
            <div class="pg-next-title">${escGuide(nextTask.label)}</div>
            <div class="pg-next-desc">${escGuide(nextTask.detail)}</div>
          </div>
          <button type="button" class="btn btn-primary btn-sm" id="guide-cta-next">Continue</button>`;
        nextCta.querySelector('#guide-cta-next')?.addEventListener('click', () => runTask(nextTask));
      } else {
        nextCta.hidden = true;
        nextCta.innerHTML = '';
      }
    }

    if (summary) {
      if (!tasks.length) {
        summary.innerHTML = `<div class="pg-empty-inline">No setup steps for this role.</div>`;
      } else {
        summary.innerHTML = tasks.map((task, index) => {
          const state = task.done ? 'is-done' : (nextTask && task.id === nextTask.id ? 'is-next' : '');
          const icon = task.done ? 'fa-check' : (state === 'is-next' ? 'fa-arrow-right' : 'fa-minus');
          return `
            <button type="button" class="pg-task ${state}" data-task-index="${index}">
              <span class="pg-task-check" aria-hidden="true"><i class="fa-solid ${icon}"></i></span>
              <span class="pg-task-body">
                <span class="pg-task-title">${escGuide(task.label)}</span>
                <span class="pg-task-desc">${escGuide(task.detail)}</span>
              </span>
              <span class="pg-task-side">
                ${task.eta ? `<span class="pg-task-eta">${escGuide(task.eta)}</span>` : ''}
                <i class="fa-solid fa-chevron-right" aria-hidden="true"></i>
              </span>
            </button>`;
        }).join('');
        summary.querySelectorAll('[data-task-index]').forEach(button => {
          button.addEventListener('click', () => runTask(tasks[Number(button.dataset.taskIndex)]));
        });
      }
    }

    const groups = ['all', ...Array.from(new Set(allFeatures.map(f => f.group || 'Other')))];
    const filters = document.getElementById('guide-group-filters');
    if (filters) {
      filters.innerHTML = groups.map(g => {
        const label = g === 'all' ? 'All' : g;
        const count = g === 'all' ? allFeatures.length : allFeatures.filter(f => (f.group || 'Other') === g).length;
        const active = guideFilterGroup === g ? 'is-active' : '';
        return `<button type="button" class="pg-chip ${active}" data-group="${escGuide(g)}" role="tab" aria-selected="${guideFilterGroup === g}"><span class="pg-chip-label">${escGuide(label)}</span><span class="pg-chip-count">${count}</span></button>`;
      }).join('');
      filters.querySelectorAll('[data-group]').forEach(btn => {
        btn.addEventListener('click', () => {
          guideFilterGroup = btn.getAttribute('data-group') || 'all';
          renderGuide(document.getElementById('guide-search')?.value || '');
        });
      });
    }

    const features = allFeatures.filter(feature => {
      if (guideFilterGroup !== 'all' && (feature.group || 'Other') !== guideFilterGroup) return false;
      if (!query) return true;
      const hay = `${feature.label} ${feature.subtitle} ${feature.description} ${feature.firstAction} ${feature.group || ''}`.toLowerCase();
      return hay.includes(query);
    });

    const countEl = document.getElementById('guide-feature-count');
    if (countEl) countEl.textContent = `${allFeatures.length} enabled`;

    if (grid) {
      grid.innerHTML = features.length ? features.map(feature => `
        <article class="pg-feature">
          <div class="pg-feature-top">
            <div class="pg-feature-ic"><i class="fa-solid ${escGuide(feature.icon)}"></i></div>
            <div class="pg-feature-head">
              <div class="pg-feature-meta">
                <span class="pg-feature-group">${escGuide(feature.group || 'Feature')}</span>
                ${feature.minutes ? `<span class="pg-feature-eta">${feature.minutes} min</span>` : ''}
              </div>
              <h4>${escGuide(feature.label)}</h4>
            </div>
          </div>
          <p class="pg-feature-desc">${escGuide(feature.description)}</p>
          <p class="pg-feature-try"><span>Try</span> ${escGuide(feature.firstAction)}</p>
          <button type="button" class="btn btn-ghost btn-sm pg-feature-open" data-guide-tab="${escGuide(feature.tabId)}">
            Open ${escGuide(feature.label)} <i class="fa-solid fa-arrow-right"></i>
          </button>
        </article>
      `).join('') : `
        <div class="pg-empty">
          <i class="fa-solid fa-magnifying-glass"></i>
          <strong>No matching features</strong>
          <span>Clear search or choose another filter.</span>
        </div>`;
      grid.querySelectorAll('[data-guide-tab]').forEach(button => {
        button.addEventListener('click', () => {
          closeGuide();
          activateTab(button.dataset.guideTab);
        });
      });
    }
  }

  function openGuide() {
    injectGuide();
    const modal = document.getElementById('product-guide-modal');
    modal.classList.add('is-open');
    modal.setAttribute('aria-hidden', 'false');
    document.body.classList.add('product-guide-open');
    renderGuide(document.getElementById('guide-search')?.value || '');
    setTimeout(() => document.getElementById('guide-search')?.focus(), 50);
  }

  function closeGuide() {
    const modal = document.getElementById('product-guide-modal');
    if (!modal) return;
    modal.classList.remove('is-open');
    modal.setAttribute('aria-hidden', 'true');
    document.body.classList.remove('product-guide-open');
  }

  function buildDots() {
    const container = document.getElementById('tour-dots');
    if (!container) return;
    container.innerHTML = steps.map((step, index) =>
      `<button type="button" class="tour-dot ${index === currentStep ? 'is-active' : ''}" data-tour-index="${index}" aria-label="Go to ${step.label}"></button>`
    ).join('');
    container.querySelectorAll('[data-tour-index]').forEach(dot => {
      dot.addEventListener('click', () => goToStep(Number(dot.dataset.tourIndex)));
    });
  }

  function positionSpotlight(target) {
    const spotlight = document.getElementById('onboarding-spotlight');
    if (!spotlight) return;
    if (!target) {
      spotlight.style.display = 'none';
      return;
    }
    const rect = target.getBoundingClientRect();
    const pad = 8;
    Object.assign(spotlight.style, {
      display: 'block',
      left: `${rect.left - pad}px`,
      top: `${rect.top - pad}px`,
      width: `${rect.width + pad * 2}px`,
      height: `${rect.height + pad * 2}px`
    });
  }

  function positionCard(target) {
    const card = document.getElementById('onboarding-card');
    if (!card) return;
    const mobile = window.innerWidth <= 768;
    if (mobile) {
      card.style.left = '50%';
      card.style.transform = 'translateX(-50%)';
      card.style.top = target && target.getBoundingClientRect().top > window.innerHeight / 2 ? '72px' : 'auto';
      card.style.bottom = card.style.top === 'auto' ? '76px' : 'auto';
      return;
    }
    
    card.style.transform = 'none';
    card.style.bottom = 'auto';
    const width = card.offsetWidth || 380;
    const height = card.offsetHeight || 390;
    if (!target) {
      card.style.left = `${Math.max(20, (window.innerWidth - width) / 2)}px`;
      card.style.top = `${Math.max(20, (window.innerHeight - height) / 2)}px`;
      return;
    }
    
    const rect = target.getBoundingClientRect();
    const spaceLeft = rect.left;
    const spaceRight = window.innerWidth - rect.right;
    
    // Choose the side with more available space
    if (spaceLeft > spaceRight) {
      // Try to place to the left of the target
      if (rect.left - width - 20 >= 10) {
        card.style.left = `${rect.left - width - 20}px`;
        card.style.top = `${Math.max(10, Math.min(rect.top, window.innerHeight - height - 10))}px`;
      } else {
        // If not enough room to the left, place below or above
        if (window.innerHeight - rect.bottom - 20 >= height) {
          card.style.top = `${rect.bottom + 20}px`;
        } else {
          card.style.top = `${Math.max(10, rect.top - height - 20)}px`;
        }
        card.style.left = `${Math.max(10, Math.min(rect.left + (rect.width - width) / 2, window.innerWidth - width - 10))}px`;
      }
    } else {
      // Try to place to the right of the target
      if (spaceRight - width - 20 >= 10) {
        card.style.left = `${rect.right + 20}px`;
        card.style.top = `${Math.max(10, Math.min(rect.top, window.innerHeight - height - 10))}px`;
      } else {
        // If not enough room to the right, place below or above
        if (window.innerHeight - rect.bottom - 20 >= height) {
          card.style.top = `${rect.bottom + 20}px`;
        } else {
          card.style.top = `${Math.max(10, rect.top - height - 20)}px`;
        }
        card.style.left = `${Math.max(10, Math.min(rect.left + (rect.width - width) / 2, window.innerWidth - width - 10))}px`;
      }
    }
  }

  function tourTarget(step) {
    if (step.targetSelector) {
      const el = document.querySelector(step.targetSelector);
      if (el) return el;
    }
    if (!step.tabId) return null;
    if (window.innerWidth <= 768) {
      return document.querySelector(`.mobile-bottom-nav [data-tab="${step.tabId}"]`)
        || document.getElementById('mobile-more-btn');
    }
    return document.querySelector(`.sidebar-link[data-tab="${step.tabId}"]`);
  }

  function goToStep(index) {
    currentStep = Math.max(0, Math.min(index, steps.length - 1));
    const step = steps[currentStep];
    const last = currentStep === steps.length - 1;
    if (step.tabId) activateTab(step.tabId);
    document.getElementById('tour-step-label').textContent = step.label;
    document.getElementById('tour-step-icon').textContent = `${currentStep + 1}/${steps.length}`;
    document.getElementById('tour-feature-icon').innerHTML = `<i class="fa-solid ${step.icon}"></i>`;
    document.getElementById('tour-title').textContent = step.label;
    document.getElementById('tour-subtitle').textContent = step.subtitle;
    document.getElementById('tour-desc').textContent = step.description;
    document.getElementById('tour-action').innerHTML = `<strong>Start here:</strong> ${step.firstAction}`;
    const next = document.getElementById('tour-next-btn');
    next.textContent = last ? 'Finish setup tour' : 'Next';
    next.classList.toggle('is-finish', last);
    const previous = document.getElementById('tour-prev-btn');
    previous.disabled = currentStep === 0;
    buildDots();
    setTimeout(() => {
      const target = tourTarget(step);
      if (target) {
        try {
          target.scrollIntoView({ block: 'nearest', inline: 'nearest', behavior: 'auto' });
        } catch (e) {
          try { target.scrollIntoView(); } catch (err) {}
        }
      }
      positionSpotlight(target);
      positionCard(target);
    }, 100);
  }

  function startTour() {
    steps = [WELCOME_STEP, ...enabledFeatures()];
    if (steps.length < 2) return;
    currentStep = 0;
    closeGuide();
    const overlay = document.getElementById('onboarding-overlay');
    if (!overlay) return;
    document.body.classList.add('onboarding-active');
    overlay.style.display = 'block';
    requestAnimationFrame(() => overlay.classList.add('is-visible'));
    goToStep(0);
  }

  function startUpdateTour() {
    steps = DUES_TOUR_STEPS;
    currentStep = 0;
    closeGuide();
    const overlay = document.getElementById('onboarding-overlay');
    if (!overlay) return;
    document.body.classList.add('onboarding-active');
    overlay.style.display = 'block';
    requestAnimationFrame(() => overlay.classList.add('is-visible'));
    goToStep(0);
  }

  function endTour() {
    try {
      const currentVer = window.__RESTROSUITE_ASSET_VERSION__ || (UPDATES_HISTORY[0] && UPDATES_HISTORY[0].version) || 'v36-20260708';
      if (steps === DUES_TOUR_STEPS) {
        localStorage.setItem('restrosuite_update_tour_seen:' + currentVer, '1');
      } else {
        localStorage.setItem(tourStorageKey(), '1');
      }
    } catch (error) {
      console.warn('[Onboarding] Tour completion could not be stored:', error);
    }
    const overlay = document.getElementById('onboarding-overlay');
    if (overlay) {
      overlay.classList.remove('is-visible');
      setTimeout(() => { overlay.style.display = 'none'; }, 250);
    }
    document.body.classList.remove('onboarding-active');
    document.querySelector('.sidebar')?.classList.remove('reveal');
  }

  function openUpdateHistoryModal() {
    if (typeof window.RSModal === 'undefined') return;
    const justUpdated = sessionStorage.getItem('rs_update_applied_at');
    const currentVer = window.__RESTROSUITE_ASSET_VERSION__ || (UPDATES_HISTORY[0] && UPDATES_HISTORY[0].version) || 'v36-20260708';

    window.RSModal.open({
      title: justUpdated ? 'RestroSuite was updated' : 'What\'s new',
      sub: justUpdated ? 'A short list of recent fixes and improvements' : 'Release notes for this outlet',
      icon: justUpdated ? 'fa-circle-check' : 'fa-clock-rotate-left',
      size: 'md',
      body: `
        ${justUpdated ? `
          <div style="background:rgba(255,79,0,0.06); border:1px solid rgba(255,79,0,0.18); border-radius:12px; padding:16px; margin-bottom:20px; display:flex; gap:12px; align-items:center;">
            <div style="width:40px; height:40px; border-radius:50%; background:var(--orange-tint); color:var(--orange); display:grid; place-items:center; font-size:18px; flex-shrink:0;">
              <i class="fa-solid fa-wand-magic-sparkles"></i>
            </div>
            <div style="font-family:var(--font-body),sans-serif;">
              <h4 style="margin:0 0 4px; font-size:14px; font-weight:800; color:var(--text);">New Version Installed: ${currentVer}</h4>
              <p style="margin:0; font-size:12px; color:var(--text-soft); line-height:1.4;">We've added new features to your screen. Let's take a quick 30-second tour to see what changed!</p>
            </div>
          </div>
        ` : ''}
        <div class="update-history-container" style="display:flex;flex-direction:column;gap:12px;max-height:min(420px,55vh);overflow-y:auto;padding-right:4px;">
          ${UPDATES_HISTORY.map(up => {
            const shortVer = String(up.version || '').split('-')[0];
            const isActive = up.version === currentVer || shortVer === String(currentVer).split('-')[0];
            return `
            <div style="border:1px solid var(--stroke-2);border-radius:12px;padding:14px 16px;background:color-mix(in srgb,var(--glass) 35%,var(--panel));">
              <div style="display:flex;justify-content:space-between;align-items:flex-start;gap:10px;flex-wrap:wrap;margin-bottom:8px;">
                <h4 style="margin:0;font-size:14px;font-weight:800;color:var(--text);letter-spacing:-0.01em;line-height:1.3;max-width:min(100%,420px);">${up.title}</h4>
                <span style="font-size:11px;font-weight:750;padding:3px 9px;border-radius:999px;background:var(--orange-tint);color:var(--orange);white-space:nowrap;">${shortVer} · ${up.date}</span>
              </div>
              <p style="margin:0 0 8px;font-size:12.5px;line-height:1.5;color:var(--text-soft);">${up.summary}</p>
              <ul style="margin:0;padding-left:18px;font-size:12.5px;line-height:1.55;color:var(--text-soft);">
                ${(up.highlights || []).map(h => `<li style="margin-bottom:2px">${h}</li>`).join('')}
              </ul>
              <div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap;margin-top:12px;">
                ${up.version === '2026.06.20-onboarding' || up.version === '2026.06.19-dues' ? `
                  <button type="button" class="btn btn-sm btn-primary" id="start-dues-tour-btn"><i class="fa-solid fa-compass"></i> Feature tour</button>
                ` : ''}
                ${!isActive ? `
                  <button type="button" class="btn btn-sm btn-ghost rollback-btn" data-rollback-version="${up.version}" style="border:1px solid var(--stroke-2);color:var(--text-soft);">
                    <i class="fa-solid fa-clock-rotate-left"></i> Rollback
                  </button>
                ` : `
                  <span style="font-size:11.5px;font-weight:750;display:inline-flex;align-items:center;gap:6px;background:rgba(16,185,129,0.1);color:#059669;border:1px solid rgba(16,185,129,0.22);padding:4px 10px;border-radius:999px;">
                    <i class="fa-solid fa-circle-check"></i> Active
                  </span>
                `}
              </div>
            </div>`;
          }).join('')}
        </div>
      `,
      foot: `
        <button class="btn btn-ghost" style="flex:1;" data-close-history>Close</button>
        ${justUpdated ? `<button class="btn btn-primary" style="flex:1.5; background:var(--orange); border-color:var(--orange); color:#fff;" id="modal-start-applied-tour"><i class="fa-solid fa-compass"></i> Start Tour Now</button>` : ''}
      `,
      onMount(modal, close) {
        modal.querySelector('[data-close-history]').onclick = () => {
          if (justUpdated) {
            sessionStorage.removeItem('rs_update_applied_at');
          }
          close();
        };
        const tourBtn = modal.querySelector('#start-dues-tour-btn');
        if (tourBtn) {
          tourBtn.onclick = () => {
            if (justUpdated) {
              sessionStorage.removeItem('rs_update_applied_at');
            }
            close();
            startUpdateTour();
          };
        }
        const startAppliedTour = modal.querySelector('#modal-start-applied-tour');
        if (startAppliedTour) {
          startAppliedTour.onclick = () => {
            sessionStorage.removeItem('rs_update_applied_at');
            close();
            startUpdateTour();
          };
        }
        modal.querySelectorAll('.rollback-btn').forEach(btn => {
          btn.onclick = () => {
            const targetVer = btn.dataset.rollbackVersion;
            if (confirm(`Are you sure you want to rollback to version ${targetVer}? This will secure your active cart session and reload the application.`)) {
              try {
                if (typeof window.RS !== 'undefined' && window.RS.savePreUpdateSnapshot) {
                  window.RS.savePreUpdateSnapshot();
                }
              } catch(e) {}
              const url = new URL(window.location.href);
              url.searchParams.set('appv', targetVer.replace(/[^a-zA-Z0-9._-]/g, ''));
              close();
              sessionStorage.setItem('rs_update_applied_at', new Date().toISOString());
              window.location.replace(url.toString());
            }
          };
        });
      }
    });
  }

  window.tourNavigate = direction => {
    if (direction > 0 && currentStep === steps.length - 1) {
      endTour();
      setTimeout(openGuide, 300);
      return;
    }
    goToStep(currentStep + direction);
  };
  window.endOnboardingTour = endTour;
  window.startOnboardingTour = startTour;
  window.startUpdateTour = startUpdateTour;
  window.openProductGuide = openGuide;
  window.closeProductGuide = closeGuide;
  window.openUpdateHistoryModal = openUpdateHistoryModal;

  document.addEventListener('keydown', event => {
    const overlayOpen = document.getElementById('onboarding-overlay')?.classList.contains('is-visible');
    if (overlayOpen && (event.key === 'ArrowRight' || event.key === 'Enter')) {
      event.preventDefault();
      window.tourNavigate(1);
    } else if (overlayOpen && event.key === 'ArrowLeft') {
      event.preventDefault();
      window.tourNavigate(-1);
    } else if (event.key === 'Escape') {
      if (overlayOpen) endTour();
      else closeGuide();
    }
  });

  window.addEventListener('resize', () => {
    if (!document.getElementById('onboarding-overlay')?.classList.contains('is-visible')) return;
    const target = tourTarget(steps[currentStep]);
    positionSpotlight(target);
    positionCard(target);
  });

  // ==========================================================
  // MANDATORY FIRST-LOGIN PROFILE-COMPLETION WIDGET
  // ==========================================================
  // New client onboarding, step one: collect the business info the rest of
  // the system needs (name, address, phone, GST) before the tour opens.
  // Saves straight into the same settings store Settings -> Outlet profile
  // uses (RS.saveSettings), so it's the exact same data, not a parallel copy.
  function profilePromptStorageKey() {
    const tenant = sessionStorage.getItem('tenant_id') || 'default';
    return `restrosuite_profile_prompt_dismissed:${tenant}`;
  }

  function shouldPromptForProfile() {
    const role = (sessionStorage.getItem('logged_in_role') || '').toLowerCase();
    // Only the person who can actually fix it should be blocked by it.
    if (role && role !== 'admin' && role !== 'manager' && role !== 'owner' && role !== 'superadmin') return false;
    if (sessionStorage.getItem('logged_in_role') === 'superadmin') return false;
    if (detectHasBusinessProfile()) return false;
    // "Skip for now" only defers for this browser session -- it comes back
    // next login until it's actually filled in, per "first step ... for
    // smooth working" -- this is necessary setup, not a one-time nag.
    if (sessionStorage.getItem(profilePromptStorageKey())) return false;
    return true;
  }

  function showRemindLaterBadge() {
    const openSettings = document.getElementById('open-settings');
    if (openSettings && !openSettings.classList.contains('attention-blink')) {
      openSettings.classList.add('attention-blink');
    }
  }

  function closeProfilePromptModal() {
    const modal = document.getElementById('rs-profile-prompt-modal');
    if (modal) modal.remove();
  }

  function showProfileCompletionModal() {
    if (document.getElementById('rs-profile-prompt-modal')) return;
    const modal = document.createElement('div');
    modal.id = 'rs-profile-prompt-modal';
    modal.setAttribute('role', 'dialog');
    modal.setAttribute('aria-modal', 'true');
    modal.style.cssText = 'position:fixed;inset:0;z-index:2147482000;display:flex;align-items:center;' +
      'justify-content:center;background:rgba(10,10,15,0.6);padding:16px;';
    modal.innerHTML = `
      <div style="background:var(--panel-solid,#fff);color:var(--text,#1e293b);width:100%;max-width:460px;border-radius:14px;
        box-shadow:0 20px 60px rgba(0,0,0,.35);padding:26px;max-height:90vh;overflow:auto;">
        <div style="display:flex;align-items:center;gap:12px;margin-bottom:6px;">
          <div style="width:40px;height:40px;border-radius:10px;background:var(--orange-tint,rgba(255,79,0,.12));
            color:var(--orange,#FF4F00);display:flex;align-items:center;justify-content:center;font-size:18px;flex-shrink:0;">
            <i class="fa-solid fa-store"></i>
          </div>
          <div>
            <h3 style="margin:0;font-size:17px;">Welcome -- let's set up your outlet</h3>
            <p style="margin:2px 0 0;font-size:12.5px;color:var(--text-soft,#64748b);">Takes under a minute. This is saved to your account so billing, receipts, and tax work correctly from day one.</p>
          </div>
        </div>
        <div style="display:flex;flex-direction:column;gap:12px;margin-top:18px;">
          <div>
            <label style="font-size:12px;font-weight:700;color:var(--text-soft,#64748b);">Business / outlet name *</label>
            <input id="rs-profile-name" class="form-input" style="width:100%;box-sizing:border-box;margin-top:4px;" placeholder="e.g. Spice Route Kitchen" autocomplete="off">
          </div>
          <div>
            <label style="font-size:12px;font-weight:700;color:var(--text-soft,#64748b);">Phone number *</label>
            <input id="rs-profile-phone" class="form-input" style="width:100%;box-sizing:border-box;margin-top:4px;" placeholder="10-digit mobile number" autocomplete="off">
          </div>
          <div>
            <label style="font-size:12px;font-weight:700;color:var(--text-soft,#64748b);">Address</label>
            <input id="rs-profile-address" class="form-input" style="width:100%;box-sizing:border-box;margin-top:4px;" placeholder="Street, city (shown on printed bills)" autocomplete="off">
          </div>
          <div>
            <label style="font-size:12px;font-weight:700;color:var(--text-soft,#64748b);">GSTIN (optional)</label>
            <input id="rs-profile-gstin" class="form-input" style="width:100%;box-sizing:border-box;margin-top:4px;" placeholder="Leave blank if not GST-registered" autocomplete="off">
          </div>
        </div>
        <div id="rs-profile-prompt-error" style="display:none;color:var(--red,#EF4444);font-size:12px;margin-top:10px;"></div>
        <div style="display:flex;gap:10px;margin-top:22px;">
          <button type="button" id="rs-profile-skip" style="flex:1;padding:11px;border-radius:9px;border:1px solid var(--stroke-2,#e2e8f0);background:transparent;color:var(--text-soft,#64748b);font-weight:600;cursor:pointer;">Fill this in later</button>
          <button type="button" id="rs-profile-save" style="flex:1.4;padding:11px;border-radius:9px;border:none;background:var(--orange,#FF4F00);color:#fff;font-weight:700;cursor:pointer;">Save and continue</button>
        </div>
      </div>`;
    document.body.appendChild(modal);
    setTimeout(() => document.getElementById('rs-profile-name')?.focus(), 60);

    document.getElementById('rs-profile-skip').addEventListener('click', () => {
      sessionStorage.setItem(profilePromptStorageKey(), '1');
      showRemindLaterBadge();
      closeProfilePromptModal();
    });

    document.getElementById('rs-profile-save').addEventListener('click', async () => {
      const name = document.getElementById('rs-profile-name').value.trim();
      const phone = document.getElementById('rs-profile-phone').value.trim();
      const address = document.getElementById('rs-profile-address').value.trim();
      const gstin = document.getElementById('rs-profile-gstin').value.trim();
      const errorEl = document.getElementById('rs-profile-prompt-error');
      if (!name || !phone) {
        errorEl.textContent = 'Business name and phone number are required.';
        errorEl.style.display = 'block';
        return;
      }
      const saveBtn = document.getElementById('rs-profile-save');
      saveBtn.disabled = true;
      saveBtn.textContent = 'Saving...';
      try {
        const current = (window.RS && typeof RS.getSettings === 'function')
          ? (await RS.getSettings()) || {}
          : readJson('rs_v2:settings', {}) || {};
        const updated = Object.assign({}, current, {
          set_restaurant_name: name,
          set_phone: phone,
          set_address: address,
          set_gstin: gstin
        });
        if (window.RS && typeof RS.saveSettings === 'function') {
          await RS.saveSettings(updated);
          window.RS_SETTINGS = updated;
        } else {
          localStorage.setItem('rs_v2:settings', JSON.stringify(updated));
        }
        sessionStorage.removeItem(profilePromptStorageKey());
        if (window.RS && typeof RS.toast === 'function') RS.toast('Outlet profile saved', 'fa-circle-check');
        closeProfilePromptModal();
      } catch (err) {
        errorEl.textContent = 'Could not save -- ' + (err && err.message ? err.message : 'please try again.');
        errorEl.style.display = 'block';
        saveBtn.disabled = false;
        saveBtn.textContent = 'Save and continue';
      }
    });
  }

  function checkAndPromptProfileCompletion() {
    if (shouldPromptForProfile()) {
      showProfileCompletionModal();
    } else if (!detectHasBusinessProfile() && sessionStorage.getItem(profilePromptStorageKey())) {
      // Previously skipped this session -- keep a quiet, blinking reminder
      // on the Settings entry point instead of re-interrupting the user.
      showRemindLaterBadge();
    }
  }
  window.RS_checkAndPromptProfileCompletion = checkAndPromptProfileCompletion;

  async function init() {
    injectGuide();
    const backdrop = document.getElementById('onboarding-backdrop');
    if (backdrop) {
      backdrop.addEventListener('click', () => {
        endTour();
      });
    }

    // Dynamic release note sync
    let latestRelease = null;
    try {
      const isFile = location.protocol === 'file:';
      const url = isFile ? 'app-update.json' : `app-update.json?v=${Date.now()}`;
      const res = await fetch(url);
      if (res.ok) latestRelease = await res.json();
    } catch(e) {}

    if (latestRelease && latestRelease.version) {
      const exists = UPDATES_HISTORY.some(up => up.version === latestRelease.version);
      if (!exists) {
        UPDATES_HISTORY.unshift({
          version: latestRelease.version,
          date: latestRelease.date || new Date().toLocaleDateString('en-CA'),
          title: latestRelease.title || "Custom Update",
          summary: latestRelease.summary || "This update contains hotfixes and stability improvements.",
          highlights: latestRelease.highlights || ["System stability and codebase security updates."]
        });
      }
    }

    // What's New button click listener is now bound directly inside injectGuide()

    setTimeout(() => {
      if (sessionStorage.getItem('logged_in_role') === 'superadmin') return;

      // Step one of onboarding a new client: a complete business profile.
      // Takes priority over the tour/update modal -- no point touring a
      // dashboard that can't bill or print correctly yet.
      try {
        if (shouldPromptForProfile()) {
          showProfileCompletionModal();
          return;
        }
        checkAndPromptProfileCompletion();
      } catch (error) { /* profile prompt is best-effort, never block the tour */ }

      try {
        // After an update: quiet badge only — never auto-open a blocking modal.
        // Staff can open "What's New" from Help when ready.
        if (sessionStorage.getItem('rs_update_applied_at')) {
          sessionStorage.removeItem('rs_update_applied_at');
          const currentVer = window.__RESTROSUITE_ASSET_VERSION__ || (UPDATES_HISTORY[0] && UPDATES_HISTORY[0].version) || '';
          if (currentVer) {
            try { localStorage.setItem('restrosuite_update_tour_seen:' + currentVer, 'badge'); } catch (_) {}
          }
          if (typeof window.RS !== 'undefined' && typeof window.RS.toast === 'function') {
            window.RS.toast('RestroSuite updated. Open Help → What\'s New anytime.', 'fa-circle-check');
          }
        }
        if (!localStorage.getItem(tourStorageKey())) startTour();
      } catch (error) {
        startTour();
      }
    }, 1400);
  }

  if (document.readyState === 'complete' || document.readyState === 'interactive') {
    init();
  } else {
    window.addEventListener('load', init);
  }
})();
