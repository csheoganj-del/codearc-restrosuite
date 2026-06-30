/**
 * RSPinModal -- Global 4-digit admin PIN gate
 * ==========================================
 * Usage:
 *   const ok = await RSPinModal.request('Delete Bill RS-001');
 *   if (ok) { ...proceed... }
 *
 * PIN is stored as SHA-256 hex in RS_SETTINGS.admin_pin_hash.
 * If no PIN is set, the first-use call prompts setup mode.
 * Lockout: 3 wrong attempts -> 30-second cooldown.
 */
(function () {
  'use strict';

  const ATTEMPT_KEY  = 'rs_pin_attempts';
  const LOCKOUT_KEY  = 'rs_pin_lockout';
  const MAX_ATTEMPTS = 3;
  const LOCKOUT_MS   = 30000;

  async function sha256(str) {
    const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(str));
    return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, '0')).join('');
  }

  function getStoredHash() {
    try { return (window.RS_SETTINGS || {}).admin_pin_hash || ''; } catch (e) { return ''; }
  }

  function getAttempts()   { return Number(sessionStorage.getItem(ATTEMPT_KEY) || 0); }
  function getLockout()    { return Number(sessionStorage.getItem(LOCKOUT_KEY) || 0); }
  function setAttempts(n)  { sessionStorage.setItem(ATTEMPT_KEY, String(n)); }
  function setLockout()    { sessionStorage.setItem(LOCKOUT_KEY, String(Date.now() + LOCKOUT_MS)); }
  function clearAttempts() { sessionStorage.removeItem(ATTEMPT_KEY); sessionStorage.removeItem(LOCKOUT_KEY); }

  function isLockedOut() {
    const until = getLockout();
    if (!until) return false;
    if (Date.now() < until) return true;
    clearAttempts();
    return false;
  }
  function lockoutSecondsLeft() { return Math.ceil((getLockout() - Date.now()) / 1000); }

  function injectStyles() {
    if (document.getElementById('rs-pin-styles')) return;
    const s = document.createElement('style');
    s.id = 'rs-pin-styles';
    s.textContent = `
      #rs-pin-overlay{position:fixed;inset:0;z-index:9999;background:rgba(17,24,39,.55);backdrop-filter:blur(6px);display:flex;align-items:center;justify-content:center;animation:rsPinFadeIn .18s ease}
      @keyframes rsPinFadeIn{from{opacity:0}to{opacity:1}}
      #rs-pin-box{background:var(--surface,#fff);border:1px solid var(--stroke-2,#e5e7eb);border-radius:20px;padding:32px 28px 28px;width:320px;box-shadow:0 20px 60px rgba(0,0,0,.18);display:flex;flex-direction:column;align-items:center;gap:20px;animation:rsPinSlideUp .22s cubic-bezier(.34,1.56,.64,1)}
      @keyframes rsPinSlideUp{from{transform:translateY(20px);opacity:0}to{transform:translateY(0);opacity:1}}
      #rs-pin-icon{width:48px;height:48px;border-radius:50%;background:rgba(255,107,0,.1);display:flex;align-items:center;justify-content:center;font-size:22px;color:#FF6B00}
      #rs-pin-title{font-weight:800;font-size:16px;text-align:center;color:var(--text,#111)}
      #rs-pin-label{font-size:12.5px;color:var(--text-soft,#6b7280);text-align:center;max-width:240px;line-height:1.5}
      .rs-pin-dots{display:flex;gap:14px;margin:4px 0}
      .rs-pin-dot{width:14px;height:14px;border-radius:50%;border:2px solid var(--stroke-2,#d1d5db);background:transparent;transition:all .15s}
      .rs-pin-dot.filled{background:#FF6B00;border-color:#FF6B00;transform:scale(1.15)}
      .rs-pin-dot.shake{animation:rsPinShake .4s ease}
      @keyframes rsPinShake{0%,100%{transform:translateX(0)}20%{transform:translateX(-5px)}40%{transform:translateX(5px)}60%{transform:translateX(-4px)}80%{transform:translateX(4px)}}
      .rs-pin-grid{display:grid;grid-template-columns:repeat(3,1fr);gap:10px;width:100%}
      .rs-pin-key{height:52px;border-radius:12px;border:1px solid var(--stroke-2,#e5e7eb);background:var(--glass,#f9fafb);font-size:18px;font-weight:700;cursor:pointer;transition:all .1s;display:flex;align-items:center;justify-content:center;color:var(--text,#111);font-family:inherit}
      .rs-pin-key:active,.rs-pin-key.pressed{background:#FF6B00;color:#fff;border-color:#FF6B00;transform:scale(.93)}
      .rs-pin-key.del{font-size:15px;color:var(--text-soft,#6b7280)}
      #rs-pin-error{font-size:12px;color:#ef4444;font-weight:600;text-align:center;min-height:18px}
      #rs-pin-cancel{background:none;border:none;font-size:13px;color:var(--text-soft,#6b7280);cursor:pointer;padding:4px 8px;font-family:inherit;text-decoration:underline}
      #rs-pin-cancel:hover{color:var(--text,#111)}
      @keyframes rsPinFadeIn{from{opacity:0}to{opacity:1}}
      @keyframes rsPinSlideUp{from{transform:translateY(20px);opacity:0}to{transform:translateY(0);opacity:1}}
    `;
    document.head.appendChild(s);
  }

  function request(label, opts) {
    opts = opts || {};
    return new Promise(resolve => {
      injectStyles();
      document.getElementById('rs-pin-overlay')?.remove();

      let entered     = '';
      let setupStage  = opts.setup  ? 'enter'  : null;
      let changeStage = opts.change ? 'verify' : null;
      let firstPin    = '';

      function buildOverlay() {
        const ov = document.createElement('div');
        ov.id = 'rs-pin-overlay';
        let icon, title, sublabel;
        if (changeStage === 'verify') {
          icon = 'fa-lock';           title = 'Enter Current PIN';   sublabel = 'Verify your current admin PIN before setting a new one.';
        } else if (setupStage === 'enter' || changeStage === 'enter') {
          icon = 'fa-key';            title = 'Set Admin PIN';        sublabel = 'Choose a 4-digit PIN. Keep it confidential.';
        } else if (setupStage === 'confirm' || changeStage === 'confirm') {
          icon = 'fa-key';            title = 'Confirm New PIN';      sublabel = 'Re-enter the same 4 digits to confirm.';
        } else {
          icon = 'fa-shield-halved';  title = 'Admin PIN Required';   sublabel = label || 'Enter your 4-digit admin PIN to continue.';
        }
        const showForgot = !opts.setup && !opts.change && changeStage !== 'verify';
        ov.innerHTML = `<div id="rs-pin-box">
          <div id="rs-pin-icon"><i class="fa-solid ${icon}"></i></div>
          <div id="rs-pin-title">${title}</div>
          <div id="rs-pin-label">${sublabel}</div>
          <div class="rs-pin-dots">${[0,1,2,3].map(i=>`<div class="rs-pin-dot" id="rs-pd-${i}"></div>`).join('')}</div>
          <div id="rs-pin-error"></div>
          <div class="rs-pin-grid">
            ${[1,2,3,4,5,6,7,8,9].map(n=>`<button class="rs-pin-key" data-k="${n}">${n}</button>`).join('')}
            <button class="rs-pin-key${showForgot?'':' del'}" data-k="${showForgot?'forgot':'del'}" style="${showForgot?'font-size:11px;color:#FF6B00;':'font-size:15px;'}">${showForgot?'Forgot?':'<i class="fa-solid fa-delete-left"></i>'}</button>
            <button class="rs-pin-key" data-k="0">0</button>
            <button class="rs-pin-key del" data-k="del"><i class="fa-solid fa-delete-left"></i></button>
          </div>
          <button id="rs-pin-cancel">Cancel</button>
        </div>`;
        return ov;
      }

      let overlay = buildOverlay();
      document.body.appendChild(overlay);

      function dots() { return [0,1,2,3].map(i => document.getElementById('rs-pd-' + i)); }
      function updateDots() { dots().forEach((d, i) => d.classList.toggle('filled', i < entered.length)); }
      function showError(msg) { const el = document.getElementById('rs-pin-error'); if (el) el.textContent = msg; }
      function shakeAndClear() {
        dots().forEach(d => { d.classList.add('shake'); setTimeout(() => d.classList.remove('shake'), 450); });
        setTimeout(() => { entered = ''; updateDots(); }, 500);
      }

      async function submit() {
        const pin = entered; entered = ''; updateDots();

        // Setup first step
        if (setupStage === 'enter' || changeStage === 'enter') {
          firstPin = pin;
          if (setupStage) setupStage = 'confirm';
          if (changeStage) changeStage = 'confirm';
          overlay.remove(); overlay = buildOverlay(); document.body.appendChild(overlay); bindEvents(); return;
        }

        // Setup confirm step
        if (setupStage === 'confirm' || changeStage === 'confirm') {
          if (pin !== firstPin) {
            showError('PINs do not match. Try again.');
            shakeAndClear(); firstPin = '';
            setTimeout(() => {
              overlay.remove(); overlay = buildOverlay(); document.body.appendChild(overlay);
              if (opts.setup) setupStage = 'enter'; if (opts.change) changeStage = 'enter';
              bindEvents();
            }, 800);
            return;
          }
          const hash = await sha256(pin);
          if (window.RS_SETTINGS) window.RS_SETTINGS.admin_pin_hash = hash;
          if (window.RS && RS.getSettings && RS.saveSettings) {
            const s = await RS.getSettings().catch(() => ({})) || {};
            s.admin_pin_hash = hash;
            await RS.saveSettings(s).catch(() => {});
          }
          overlay.remove(); resolve(true); return;
        }

        // Change PIN: verify current
        if (changeStage === 'verify') {
          const hash = await sha256(pin);
          if (hash !== getStoredHash()) { showError('Incorrect current PIN.'); shakeAndClear(); return; }
          changeStage = 'enter';
          overlay.remove(); overlay = buildOverlay(); document.body.appendChild(overlay); bindEvents(); return;
        }

        // No PIN set yet -- auto-setup on first use
        if (!getStoredHash()) {
          firstPin = pin; setupStage = 'confirm';
          overlay.remove(); overlay = buildOverlay(); document.body.appendChild(overlay); bindEvents(); return;
        }

        // Verify
        if (isLockedOut()) { showError(`Locked out. Try again in ${lockoutSecondsLeft()}s.`); return; }
        const hash = await sha256(pin);
        if (hash === getStoredHash()) {
          clearAttempts(); overlay.remove(); resolve(true);
        } else {
          const n = getAttempts() + 1; setAttempts(n);
          if (n >= MAX_ATTEMPTS) {
            setLockout(); showError('Too many attempts. Locked for 30s.');
            const grid = overlay.querySelector('.rs-pin-grid'); if (grid) grid.style.pointerEvents = 'none';
          } else {
            showError(`Incorrect PIN. ${MAX_ATTEMPTS - n} attempt${MAX_ATTEMPTS - n === 1 ? '' : 's'} left.`);
          }
          shakeAndClear();
        }
      }

      function bindEvents() {
        const box = document.getElementById('rs-pin-box');
        if (!box) return;

        box.addEventListener('click', async e => {
          const btn = e.target.closest('.rs-pin-key');
          if (!btn) return;
          const k = btn.dataset.k;
          if (k === 'forgot') { overlay.remove(); showForgotPin(resolve); return; }
          if (k === 'del') { entered = entered.slice(0, -1); updateDots(); return; }
          if (isLockedOut() && !opts.setup && !opts.change) { showError(`Locked out. Try again in ${lockoutSecondsLeft()}s.`); return; }
          if (entered.length >= 4) return;
          btn.classList.add('pressed'); setTimeout(() => btn.classList.remove('pressed'), 120);
          entered += k; updateDots();
          if (entered.length === 4) await submit();
        });

        box._rsPinKeyHandler = async e => {
          if (e.key >= '0' && e.key <= '9') {
            if (entered.length < 4) { entered += e.key; updateDots(); if (entered.length === 4) await submit(); }
          } else if (e.key === 'Backspace') {
            entered = entered.slice(0, -1); updateDots();
          } else if (e.key === 'Escape') {
            overlay.remove(); document.removeEventListener('keydown', box._rsPinKeyHandler); resolve(false);
          }
        };
        document.addEventListener('keydown', box._rsPinKeyHandler);

        const cancelBtn = document.getElementById('rs-pin-cancel');
        if (cancelBtn) cancelBtn.onclick = () => {
          overlay.remove(); document.removeEventListener('keydown', box._rsPinKeyHandler); resolve(false);
        };
        overlay.addEventListener('click', e => {
          if (e.target === overlay) { overlay.remove(); document.removeEventListener('keydown', box._rsPinKeyHandler); resolve(false); }
        });
      }

      bindEvents();
    });
  }

  function showForgotPin(resolve) {
    injectStyles();
    document.getElementById('rs-pin-overlay')?.remove();
    const overlay = document.createElement('div');
    overlay.id = 'rs-pin-overlay';
    const adminEmail = (() => { try { return (window.RS_API?.session?.() || {}).email || ''; } catch (e) { return ''; } })();
    overlay.innerHTML = `<div id="rs-pin-box">
      <div id="rs-pin-icon"><i class="fa-solid fa-circle-question"></i></div>
      <div id="rs-pin-title">Forgot PIN?</div>
      <div id="rs-pin-label" style="text-align:center;line-height:1.6;">Enter the reset code issued by your account owner<br>${adminEmail ? `(<strong>${adminEmail}</strong>)` : ''}<br>or contact RestroSuite support.</div>
      <input id="rs-reset-code" type="text" placeholder="Reset code" maxlength="64" autocomplete="off"
        style="width:100%;padding:12px 14px;border:1px solid var(--stroke-2,#e5e7eb);border-radius:10px;font-family:inherit;font-size:18px;text-align:center;letter-spacing:6px;outline:none;background:var(--glass,#f9fafb);color:var(--text,#111);box-sizing:border-box;">
      <div id="rs-pin-error"></div>
      <button id="rs-reset-submit" style="width:100%;padding:12px;background:#FF6B00;color:#fff;border:none;border-radius:10px;font-weight:700;font-size:14px;cursor:pointer;font-family:inherit;">Verify &amp; Reset</button>
      <button id="rs-pin-cancel">Cancel</button>
    </div>`;
    document.body.appendChild(overlay);

    document.getElementById('rs-reset-submit').onclick = async () => {
      const val = (document.getElementById('rs-reset-code').value || '').trim();
      const errorEl = document.getElementById('rs-pin-error');
      if (!val) { errorEl.textContent = 'Reset code is required.'; return; }
      try {
        if (!window.RS_API || !RS_API.data) throw new Error('PIN reset verification is unavailable.');
        const verified = await RS_API.data({ operation: 'verify_pin_reset_code', code: val });
        if (!verified || verified.valid !== true) throw new Error('Invalid reset code.');
      } catch (e) {
        errorEl.textContent = (e && e.message) || 'Invalid reset code.';
        return;
      }
      if (window.RS_SETTINGS) delete window.RS_SETTINGS.admin_pin_hash;
      if (window.RS && RS.getSettings && RS.saveSettings) {
        const s = await RS.getSettings().catch(() => ({})) || {};
        delete s.admin_pin_hash; await RS.saveSettings(s).catch(() => {});
      }
      clearAttempts(); overlay.remove();
      const ok = await request('Set New Admin PIN', { setup: true });
      resolve(ok);
    };
    document.getElementById('rs-pin-cancel').onclick = () => { overlay.remove(); resolve(false); };
    overlay.addEventListener('click', e => { if (e.target === overlay) { overlay.remove(); resolve(false); } });
  }

  window.RSPinModal = {
    /** Show PIN verification dialog. Returns Promise<boolean>. */
    request,
    /** Verify only (no label). */
    verify: () => request('Admin verification required'),
    /** First-time PIN setup. */
    setup:  () => request('Set Admin PIN', { setup: true }),
    /** Two-step: verify current -> set new. */
    change: () => request('Change Admin PIN', { change: true }),
    /** True if a PIN has been configured. */
    isConfigured: () => !!getStoredHash(),
  };

})();


/**
 * RestroSuite SaaS Core -- Business Model Abstraction Layer
 * =========================================================
 * This file decouples the platform from any single vertical (restaurant).
 * A new business type (salon, retail, clinic, gym, etc.) registers itself
 * here by calling RS_SAAS.registerVertical(config) and the shell, POS,
 * billing, and KDS adapt automatically.
 *
 * Current verticals: restaurant (default)
 * Planned: retail, salon, clinic, gym, hotel
 *
 * Public API:
 *   RS_SAAS.vertical            -> active vertical config object
 *   RS_SAAS.label(key)          -> localised string for this vertical
 *   RS_SAAS.registerVertical(v) -> register + activate a new business type
 *   RS_SAAS.is(type)            -> check if active vertical === type
 *   RS_SAAS.featureEnabled(f)   -> check if a feature is on for this vertical
 */
(function () {
  'use strict';

  /* -- Built-in verticals ----------------------------------------------- */
  const VERTICALS = {

    restaurant: {
      id: 'restaurant',
      name: 'Restaurant / Café',
      icon: 'fa-utensils',
      currency: 'INR',

      // Label overrides -- what to call things in this vertical
      labels: {
        catalogue: 'Menu',
        catalogueItem: 'Dish',
        order: 'Order',
        orderItem: 'Item',
        bill: 'Bill',
        customer: 'Guest',
        staff: 'Staff',
        table: 'Table',
        queue: 'Kitchen Queue',
        inventory: 'Ingredients',
        shift: 'Shift',
        outlet: 'Outlet',
      },

      // Which dashboard tabs are active for this vertical
      tabs: [
        'pos-tab', 'kds-tab', 'qr-orders-tab', 'bills-tab',
        'floor-tab', 'editor-tab', 'inventory-tab', 'customers-tab',
        'employees-tab', 'analytics-tab', 'reports-tab', 'tax-tab',
        'growth-hub-tab', 'aggregator-tab', 'gateway-monitor-tab',
      ],

      // Features enabled (boolean gates)
      features: {
        tableLayout: true,
        kds: true,
        qrOrdering: true,
        whatsappReceipt: true,
        kotPrint: true,
        loyaltyTiers: true,
        aggregatorHub: true,
        tokenDisplay: true,
        multipleOrderTypes: true,   // dine-in, takeaway, delivery
        gstBilling: true,
        splitPayment: true,
        shift: true,
        reservations: true,
      },

      // DB collection -> display name mapping for this vertical
      collections: {
        catalogue: 'menu',
        orders: 'pending_orders',
        transactions: 'bills',
        contacts: 'customers',
      },
    },

    retail: {
      id: 'retail',
      name: 'Retail Store',
      icon: 'fa-store',
      currency: 'INR',
      labels: {
        catalogue: 'Products',
        catalogueItem: 'Product',
        order: 'Sale',
        orderItem: 'Product',
        bill: 'Invoice',
        customer: 'Customer',
        staff: 'Cashier',
        table: 'Counter',
        queue: 'Pending Sales',
        inventory: 'Stock',
        shift: 'Shift',
        outlet: 'Store',
      },
      tabs: [
        'pos-tab', 'bills-tab', 'editor-tab', 'inventory-tab',
        'customers-tab', 'employees-tab', 'analytics-tab', 'reports-tab', 'tax-tab',
      ],
      features: {
        tableLayout: false,
        kds: false,
        qrOrdering: false,
        whatsappReceipt: true,
        kotPrint: false,
        loyaltyTiers: true,
        aggregatorHub: false,
        tokenDisplay: false,
        multipleOrderTypes: false,
        gstBilling: true,
        splitPayment: true,
        shift: true,
        reservations: false,
      },
      collections: {
        catalogue: 'menu',
        orders: 'pending_orders',
        transactions: 'bills',
        contacts: 'customers',
      },
    },

    salon: {
      id: 'salon',
      name: 'Salon / Spa',
      icon: 'fa-scissors',
      currency: 'INR',
      labels: {
        catalogue: 'Services',
        catalogueItem: 'Service',
        order: 'Appointment',
        orderItem: 'Service',
        bill: 'Receipt',
        customer: 'Client',
        staff: 'Stylist',
        table: 'Chair',
        queue: 'Appointment Queue',
        inventory: 'Products',
        shift: 'Shift',
        outlet: 'Branch',
      },
      tabs: [
        'pos-tab', 'bills-tab', 'editor-tab', 'customers-tab',
        'employees-tab', 'analytics-tab', 'reports-tab', 'tax-tab',
      ],
      features: {
        tableLayout: true,        // chair/station layout
        kds: false,
        qrOrdering: false,
        whatsappReceipt: true,
        kotPrint: false,
        loyaltyTiers: true,
        aggregatorHub: false,
        tokenDisplay: true,       // token calling for waiting clients
        multipleOrderTypes: false,
        gstBilling: true,
        splitPayment: true,
        shift: true,
        reservations: true,       // appointment booking
      },
      collections: {
        catalogue: 'menu',
        orders: 'pending_orders',
        transactions: 'bills',
        contacts: 'customers',
      },
    },

    clinic: {
      id: 'clinic',
      name: 'Clinic / Hospital',
      icon: 'fa-hospital',
      currency: 'INR',
      labels: {
        catalogue: 'Procedures',
        catalogueItem: 'Procedure',
        order: 'Consultation',
        orderItem: 'Procedure',
        bill: 'Medical Bill',
        customer: 'Patient',
        staff: 'Doctor',
        table: 'Room',
        queue: 'Patient Queue',
        inventory: 'Medical Supplies',
        shift: 'Shift',
        outlet: 'Clinic',
      },
      tabs: [
        'pos-tab', 'bills-tab', 'editor-tab', 'customers-tab',
        'employees-tab', 'analytics-tab', 'reports-tab', 'tax-tab', 'tokens-tab',
      ],
      features: {
        tableLayout: false,
        kds: false,
        qrOrdering: false,
        whatsappReceipt: true,
        kotPrint: false,
        loyaltyTiers: false,
        aggregatorHub: false,
        tokenDisplay: true,       // patient token calling system
        multipleOrderTypes: false,
        gstBilling: true,
        splitPayment: true,
        shift: true,
        reservations: true,
      },
      collections: {
        catalogue: 'menu',
        orders: 'pending_orders',
        transactions: 'bills',
        contacts: 'customers',
      },
    },

  };

  /* -- Active vertical (resolved from business profile settings) -------- */
  let _active = 'restaurant';

  function resolveVertical() {
    // Check business profile setting first
    const stored = (window.RS_SETTINGS && window.RS_SETTINGS.set_business_type)
      || (typeof localStorage !== 'undefined' && localStorage.getItem('rs:business_type'))
      || 'restaurant';
    _active = VERTICALS[stored] ? stored : 'restaurant';
    return VERTICALS[_active];
  }

  /* -- Public API ------------------------------------------------------- */
  const RS_SAAS = {
    /** Active vertical config object */
    get vertical() { return VERTICALS[_active] || VERTICALS.restaurant; },

    /** Check if the active vertical matches a type */
    is: function(type) { return _active === type; },

    /** Get a label for this vertical (falls back to the key itself) */
    label: function(key) {
      const v = VERTICALS[_active] || VERTICALS.restaurant;
      return (v.labels && v.labels[key]) || key;
    },

    /** Check if a feature flag is enabled for the active vertical */
    featureEnabled: function(feature) {
      const v = VERTICALS[_active] || VERTICALS.restaurant;
      return !!(v.features && v.features[feature]);
    },

    /** List of active tabs for this vertical */
    get activeTabs() {
      const v = VERTICALS[_active] || VERTICALS.restaurant;
      return v.tabs || [];
    },

    /** Register a new vertical at runtime (for plugins/extensions) */
    registerVertical: function(config) {
      if (!config || !config.id) throw new Error('RS_SAAS.registerVertical: config.id is required');
      VERTICALS[config.id] = Object.assign({}, VERTICALS.restaurant, config, {
        labels: Object.assign({}, VERTICALS.restaurant.labels, config.labels || {}),
        features: Object.assign({}, VERTICALS.restaurant.features, config.features || {}),
      });
      console.log('[RS_SAAS] Registered vertical:', config.id);
    },

    /** Re-resolve the active vertical (call after settings load) */
    refresh: function() { resolveVertical(); },

    /** All registered verticals */
    get all() { return Object.assign({}, VERTICALS); },

    /** Apply vertical constraints to the UI (hide tabs, rename labels) */
    applyToUI: function() {
      const sess = window.RS_API ? window.RS_API.session() : null;
      const isSuper = sess && sess.role === 'superadmin';
      if (isSuper) {
        document.querySelectorAll('.sidebar-link, .mnav-link').forEach(function(el) {
          const isSa = el.classList.contains('superadmin-only');
          el.style.display = isSa ? (el.classList.contains('sidebar-link') || el.classList.contains('mnav-link') ? 'flex' : '') : 'none';
        });
        return;
      }

      const v = VERTICALS[_active] || VERTICALS.restaurant;
      const activeTabs = new Set(v.tabs || []);

      // Hide tabs not in this vertical
      document.querySelectorAll('.sidebar-link[data-tab], .mnav-link[data-tab]').forEach(function(el) {
        const tab = el.getAttribute('data-tab');
        if (!activeTabs.has(tab)) {
          el.style.display = 'none';
        } else {
          el.style.display = '';
        }
      });

      // Update navigation labels if vertical overrides them
      const labelMap = {
        'pos-tab': v.labels.order || 'POS',
        'editor-tab': v.labels.catalogue || 'Menu',
        'customers-tab': (v.labels.customer || 'Customer') + 's',
        'floor-tab': (v.labels.table || 'Table') + ' Layout',
        'kds-tab': v.labels.queue || 'Kitchen',
      };
      Object.entries(labelMap).forEach(function(pair) {
        const tab = pair[0], label = pair[1];
        document.querySelectorAll('.sidebar-link[data-tab="' + tab + '"] .link-text, .mnav-link[data-tab="' + tab + '"]').forEach(function(el) {
          if (el.dataset.rsOriginalLabel === undefined) {
            el.dataset.rsOriginalLabel = el.textContent;
          }
          // Only relabel if this vertical has a non-default label
          if (!RS_SAAS.is('restaurant')) {
            el.textContent = label;
          } else {
            el.textContent = el.dataset.rsOriginalLabel;
          }
        });
      });

      document.dispatchEvent(new CustomEvent('rs:vertical-applied', { detail: { vertical: _active } }));
    },
  };

  // Resolve on load and re-resolve when settings sync
  resolveVertical();
  document.addEventListener('rs:db-sync', function(e) {
    if (e.detail && e.detail.collection === 'settings') {
      resolveVertical();
    }
  });

  window.RS_SAAS = RS_SAAS;
})();
