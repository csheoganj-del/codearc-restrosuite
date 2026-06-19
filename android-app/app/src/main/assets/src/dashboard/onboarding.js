(function () {
  'use strict';

  const FEATURES = [
    {
      tabId: 'pos-tab',
      label: 'Takeaway POS',
      icon: 'fa-mug-hot',
      subtitle: 'Counter billing and checkout',
      description: 'Create dine-in, takeaway, and delivery bills, customize items, apply loyalty, split payments, and print receipts.',
      firstAction: 'Add an item to the cart, select the order type and payment method, then complete one test bill.'
    },
    {
      tabId: 'qr-orders-tab',
      label: 'Live Table Orders',
      icon: 'fa-qrcode',
      subtitle: 'QR ordering and table service',
      description: 'Generate table QR links, receive customer orders, approve them, and send accepted tickets to the kitchen.',
      firstAction: 'Generate a QR for one table, open its customer link, and submit a test order.'
    },
    {
      tabId: 'online-tab',
      label: 'Online Integrations',
      icon: 'fa-cloud-arrow-down',
      subtitle: 'Delivery-channel order queue',
      description: 'Review incoming online and delivery orders from supported channels in one operational queue.',
      firstAction: 'Review channel settings and confirm how your team accepts or rejects incoming online orders.'
    },
    {
      tabId: 'kds-tab',
      label: 'Kitchen KDS',
      icon: 'fa-tv',
      subtitle: 'Kitchen preparation board',
      description: 'Display accepted orders for kitchen staff, track item preparation, and move completed orders to ready.',
      firstAction: 'Open an accepted sample or test order and move it through the preparation workflow.'
    },
    {
      tabId: 'tokens-tab',
      label: 'Live Token Board',
      icon: 'fa-ticket',
      subtitle: 'Customer collection display',
      description: 'Show which order tokens are preparing and which are ready for collection on a customer-facing screen.',
      firstAction: 'Open this tab on the collection display and verify one test order changes from preparing to ready.'
    },
    {
      tabId: 'bills-tab',
      label: 'Bills Management',
      icon: 'fa-file-invoice-dollar',
      subtitle: 'Invoices and sales history',
      description: 'Search, inspect, edit, reprint, refund, and export completed invoices with daily summary metrics.',
      firstAction: 'Open a test invoice, verify totals and customer details, then test reprint or export.'
    },
    {
      tabId: 'inventory-tab',
      label: 'Inventory Control',
      icon: 'fa-boxes-stacked',
      subtitle: 'Stock, batches, and expiry',
      description: 'Track ingredients, capacities, reorder thresholds, purchase batches, expiry dates, and recipe consumption.',
      firstAction: 'Download the Excel template or add stock manually, then confirm low-stock thresholds and units.'
    },
    {
      tabId: 'reports-tab',
      label: 'Sales Reports',
      icon: 'fa-chart-line',
      subtitle: 'Revenue and performance analytics',
      description: 'Analyze revenue, order volume, item performance, payment mix, and tax data for selected periods.',
      firstAction: 'Choose a date range and verify the totals against Bills Management before exporting.'
    },
    {
      tabId: 'editor-tab',
      label: 'Menu Editor',
      icon: 'fa-pen-to-square',
      subtitle: 'Menu and recipe publishing',
      description: 'Create and update items, prices, categories, availability, preparation time, descriptions, and recipes.',
      firstAction: 'Create one test item with a recipe and confirm it appears in both POS and customer QR ordering.'
    },
    {
      tabId: 'crm-tab',
      label: 'CRM & Loyalty',
      icon: 'fa-users-rectangle',
      subtitle: 'Customer and loyalty records',
      description: 'Track customer visits, spend, loyalty points, notes, and communication-ready contact details.',
      firstAction: 'Add a test customer or complete a bill with a phone number and confirm the loyalty record updates.'
    },
    {
      tabId: 'tax-tab',
      label: 'Tax Management',
      icon: 'fa-calculator',
      subtitle: 'GST and billing configuration',
      description: 'Configure GST behavior, tax records, invoice exports, discounts, and billing compliance settings.',
      firstAction: 'Verify GST registration details and rates with your accountant before processing live sales.'
    },
    {
      tabId: 'employees-tab',
      label: 'Employee Ledger',
      icon: 'fa-users',
      subtitle: 'Staff, shifts, attendance, and payroll',
      description: 'Manage staff records, roles, salaries, attendance, leave requests, shifts, and payroll calculations.',
      firstAction: 'Add staff accounts with the minimum required permissions and test each role before launch.'
    },
    {
      tabId: 'growth-hub-tab',
      label: 'Growth Hub',
      icon: 'fa-rocket',
      subtitle: 'Setup and restaurant operations',
      description: 'Manage launch tasks, support, reservations, procurement, costing, offers, refunds, outlets, devices, and backups.',
      firstAction: 'Complete the production onboarding checklist and assign an owner for every remaining task.'
    }
  ];

  const WELCOME_STEP = {
    tabId: '',
    label: 'Getting Started',
    icon: 'fa-compass',
    subtitle: 'Your enabled RestroSuite workspace',
    description: 'This tour only covers features enabled for your plan and staff role. You can reopen Help & Setup from the sidebar at any time.',
    firstAction: 'Start with Business Profile, import your menu and inventory, configure tax and staff access, then run one complete test order.'
  };

  const UPDATES_HISTORY = [
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
        "Bills now use date-wise numbers like RS-20260619-001.",
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
      targetSelector: '#crm-grid'
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

  function setupTasks() {
    const enabled = new Set(enabledFeatures().map(feature => feature.tabId));
    const profile = readJson('doppio_business_profile', {});
    const menu = readJson('doppio_menu', []);
    const inventory = readJson('doppio_inventory', {});
    const employees = readJson('doppio_employees', []);
    const bills = readJson('doppio_bills', []);
    const pendingOrders = readJson('doppio_pending_qr_orders', []);
    const tasks = [
      {
        label: 'Complete Business Profile',
        detail: 'Business name, address, contact, receipt and payment information',
        done: Boolean(profile && (profile.name || profile.businessName)),
        action: () => document.getElementById('open-profile-btn')?.click()
      }
    ];
    if (enabled.has('editor-tab') || enabled.has('pos-tab')) {
      tasks.push({
        label: 'Publish menu and recipes',
        detail: 'Use Menu Editor or the Excel Setup Wizard',
        done: Array.isArray(menu) && menu.length > 0,
        tabId: enabled.has('editor-tab') ? 'editor-tab' : 'inventory-tab'
      });
    }
    if (enabled.has('inventory-tab')) {
      tasks.push({
        label: 'Configure inventory',
        detail: 'Stock levels, units, capacities, thresholds, batches, and expiry',
        done: inventory && Object.keys(inventory).length > 0,
        tabId: 'inventory-tab'
      });
    }
    if (enabled.has('tax-tab')) {
      tasks.push({
        label: 'Verify tax settings',
        detail: 'Confirm GST registration and rates before live billing',
        done: Boolean(profile && (profile.gstin || profile.gstNumber)),
        tabId: 'tax-tab'
      });
    }
    if (enabled.has('employees-tab')) {
      tasks.push({
        label: 'Add staff and test permissions',
        detail: 'Create only the access each employee needs',
        done: Array.isArray(employees) && employees.length > 0,
        tabId: 'employees-tab'
      });
    }
    if (enabled.has('qr-orders-tab')) {
      tasks.push({
        label: 'Test one table QR order',
        detail: 'Scan, submit, approve, prepare, and mark ready',
        done: Array.isArray(pendingOrders) && pendingOrders.some(order =>
          order && (order.orderType === 'Dine-In' || String(order.tableNumber || '').match(/^\d+$/))
        ),
        tabId: 'qr-orders-tab'
      });
    }
    if (enabled.has('pos-tab')) {
      tasks.push({
        label: 'Complete one test bill',
        detail: 'Check item price, tax, payment, receipt, inventory, and reports',
        done: Array.isArray(bills) && bills.length > 0,
        tabId: 'pos-tab'
      });
    }
    return tasks;
  }

  function activateTab(tabId) {
    const link = document.querySelector(`.sidebar-link[data-tab="${tabId}"]`)
      || document.querySelector(`.mobile-bottom-nav [data-tab="${tabId}"]`)
      || document.querySelector(`.more-sheet-link[data-tab="${tabId}"]`);
    if (link) link.click();
  }

  function injectGuide() {
    if (document.getElementById('product-guide-modal')) return;
    const modal = document.createElement('div');
    modal.id = 'product-guide-modal';
    modal.className = 'product-guide-modal';
    modal.setAttribute('aria-hidden', 'true');
    modal.innerHTML = `
      <div class="product-guide-backdrop" data-guide-close></div>
      <section class="product-guide-panel" role="dialog" aria-modal="true" aria-labelledby="product-guide-title">
        <header class="product-guide-header">
          <div>
            <span class="product-guide-eyebrow">HELP &amp; SETUP</span>
            <h2 id="product-guide-title">RestroSuite Workspace Guide</h2>
            <p>Instructions are filtered to your enabled plan features and staff permissions.</p>
          </div>
          <button type="button" class="product-guide-close" data-guide-close aria-label="Close help guide">&times;</button>
        </header>
        <div class="product-guide-toolbar" style="display:flex; gap:8px; align-items:center; flex-wrap:wrap;">
          <button type="button" class="btn btn-primary" id="guide-start-tour"><i class="fa-solid fa-compass"></i> Start Feature Tour</button>
          <button type="button" class="btn btn-ghost" id="guide-view-updates" style="border:1px solid var(--stroke-2); color:var(--text-soft); padding:8px 12px; font-size:12px; font-weight:700;"><i class="fa-solid fa-clock-rotate-left"></i> What's New</button>
          <input type="search" id="guide-search" placeholder="Search enabled features..." aria-label="Search enabled features" style="flex:1;">
        </div>
        <div id="guide-setup-summary"></div>
        <div class="product-guide-section-heading">
          <div><span>FEATURE GUIDE</span><h3>Your enabled workspace</h3></div>
          <span id="guide-feature-count" class="product-guide-count"></span>
        </div>
        <div id="guide-feature-grid" class="product-guide-grid"></div>
      </section>
    `;
    document.body.appendChild(modal);
    modal.querySelectorAll('[data-guide-close]').forEach(button => button.addEventListener('click', closeGuide));
    modal.querySelector('#guide-start-tour').addEventListener('click', () => {
      closeGuide();
      startTour();
    });
    modal.querySelector('#guide-search').addEventListener('input', event => renderGuide(event.target.value));
  }

  function renderGuide(search = '') {
    injectGuide();
    const query = String(search).trim().toLowerCase();
    const features = enabledFeatures().filter(feature =>
      !query || `${feature.label} ${feature.subtitle} ${feature.description} ${feature.firstAction}`.toLowerCase().includes(query)
    );
    const tasks = setupTasks();
    const completed = tasks.filter(task => task.done).length;
    const percent = tasks.length ? Math.round((completed / tasks.length) * 100) : 100;
    const summary = document.getElementById('guide-setup-summary');
    summary.innerHTML = `
      <section class="product-guide-setup">
        <div class="product-guide-progress-copy">
          <div><span>INITIAL SETUP</span><strong>${completed} of ${tasks.length} recommended steps complete</strong></div>
          <b>${percent}%</b>
        </div>
        <div class="product-guide-progress"><span style="width:${percent}%"></span></div>
        <div class="product-guide-task-grid">
          ${tasks.map((task, index) => `
            <button type="button" class="product-guide-task ${task.done ? 'is-done' : ''}" data-task-index="${index}">
              <i class="fa-solid ${task.done ? 'fa-circle-check' : 'fa-circle'}"></i>
              <span><strong>${task.label}</strong><small>${task.detail}</small></span>
              <i class="fa-solid fa-chevron-right"></i>
            </button>
          `).join('')}
        </div>
      </section>
    `;
    summary.querySelectorAll('[data-task-index]').forEach(button => {
      button.addEventListener('click', () => {
        const task = tasks[Number(button.dataset.taskIndex)];
        closeGuide();
        if (task.action) task.action();
        else if (task.tabId) activateTab(task.tabId);
      });
    });
    document.getElementById('guide-feature-count').textContent = `${enabledFeatures().length} enabled`;
    const grid = document.getElementById('guide-feature-grid');
    grid.innerHTML = features.length ? features.map(feature => `
      <article class="product-guide-card">
        <div class="product-guide-card-icon"><i class="fa-solid ${feature.icon}"></i></div>
        <div class="product-guide-card-copy">
          <span>${feature.subtitle}</span>
          <h4>${feature.label}</h4>
          <p>${feature.description}</p>
          <div class="product-guide-first-action"><strong>Start here:</strong> ${feature.firstAction}</div>
          <button type="button" data-guide-tab="${feature.tabId}">Open ${feature.label} <i class="fa-solid fa-arrow-right"></i></button>
        </div>
      </article>
    `).join('') : '<div class="product-guide-empty">No enabled feature matched your search.</div>';
    grid.querySelectorAll('[data-guide-tab]').forEach(button => {
      button.addEventListener('click', () => {
        closeGuide();
        activateTab(button.dataset.guideTab);
      });
    });
  }

  function openGuide() {
    renderGuide();
    const modal = document.getElementById('product-guide-modal');
    modal.classList.add('is-open');
    modal.setAttribute('aria-hidden', 'false');
    document.body.classList.add('product-guide-open');
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
      card.style.top = target && target.getBoundingClientRect().top > window.innerHeight / 2 ? '72px' : 'auto';
      card.style.bottom = card.style.top === 'auto' ? '76px' : 'auto';
      return;
    }
    card.style.bottom = 'auto';
    const width = card.offsetWidth || 380;
    const height = card.offsetHeight || 390;
    if (!target) {
      card.style.left = `${Math.max(20, (window.innerWidth - width) / 2)}px`;
      card.style.top = `${Math.max(20, (window.innerHeight - height) / 2)}px`;
      return;
    }
    const rect = target.getBoundingClientRect();
    card.style.left = `${Math.min(window.innerWidth - width - 20, rect.right + 20)}px`;
    card.style.top = `${Math.max(20, Math.min(rect.top, window.innerHeight - height - 20))}px`;
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
      if (steps === DUES_TOUR_STEPS) {
        localStorage.setItem('restrosuite_update_tour_seen:2026.06.19-dues', '1');
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
    window.RSModal.open({
      title: 'Update History & Releases',
      sub: 'Detailed release logs of RestroSuite updates',
      icon: 'fa-clock-rotate-left',
      size: 'md',
      body: `
        <div class="update-history-container" style="display:flex; flex-direction:column; gap:20px; max-height:450px; overflow-y:auto; padding-right:6px;">
          ${UPDATES_HISTORY.map(up => `
            <div class="update-version-card" style="border: 1px solid var(--stroke); border-radius: 12px; padding: 16px; background: var(--panel-tint, rgba(0,0,0,0.02));">
              <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:8px; flex-wrap:wrap; gap:6px;">
                <h4 style="margin:0; font-size:15px; font-weight:800; color:var(--orange);">${up.title}</h4>
                <span class="pill" style="font-size:11px; font-weight:600; padding:2px 8px;">Version ${up.version} · ${up.date}</span>
              </div>
              <p style="margin:0 0 10px 0; font-size:12.5px; line-height:1.5; color:var(--text-soft);">${up.summary}</p>
              <ul style="margin:0; padding-left:18px; font-size:12px; line-height:1.6; color:var(--text-soft);">
                ${up.highlights.map(h => `<li>${h}</li>`).join('')}
              </ul>
              ${up.version === '2026.06.19-dues' ? `
                <button type="button" class="btn btn-sm btn-primary" id="start-dues-tour-btn" style="margin-top:12px; background:var(--orange); border-color:var(--orange); font-size:11px;">
                  <i class="fa-solid fa-compass"></i> Take Feature Tour
                </button>
              ` : ''}
            </div>
          `).join('')}
        </div>
      `,
      foot: `<button class="btn btn-ghost" style="flex:1;" data-close-history>Close</button>`,
      onMount(modal, close) {
        modal.querySelector('[data-close-history]').onclick = close;
        const tourBtn = modal.querySelector('#start-dues-tour-btn');
        if (tourBtn) {
          tourBtn.onclick = () => {
            close();
            startUpdateTour();
          };
        }
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

  function init() {
    injectGuide();
    const backdrop = document.getElementById('onboarding-backdrop');
    if (backdrop) {
      backdrop.addEventListener('click', () => {
        endTour();
      });
    }

    setTimeout(() => {
      const guideViewUpdates = document.getElementById('guide-view-updates');
      if (guideViewUpdates) {
        guideViewUpdates.onclick = openUpdateHistoryModal;
      }
    }, 1000);

    setTimeout(() => {
      if (sessionStorage.getItem('logged_in_role') === 'superadmin') return;
      try {
        const updateTourSeen = localStorage.getItem('restrosuite_update_tour_seen:2026.06.19-dues');
        if (!updateTourSeen) {
          openUpdateHistoryModal();
          localStorage.setItem('restrosuite_update_tour_seen:2026.06.19-dues', 'popup');
          return;
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
