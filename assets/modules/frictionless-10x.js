/**
 * RestroSuite — Frictionless 10/10 activation pack
 * --------------------------------------------------------------------------
 * First-run sample menu + tables, progressive workspace modes, 3-step
 * "start selling" checklist, owner WhatsApp digests on by default,
 * CA pack helper, session outlet guard, empty-POS coach, progressive unlock.
 * Loads after product-polish / owner-wa / competitive-ops.
 */
(function (global) {
  'use strict';

  var STYLE_ID = 'rs-frictionless-style';
  var MODE_KEY = 'rs_workspace_mode_v1';
  var ACTIVATION_KEY = 'rs_activation_v1';
  var SAMPLE_KEY = 'rs_sample_pack_v1';
  var WELCOME_KEY = 'rs_frictionless_welcome_v1';
  var UNLOCK_KEY = 'rs_tables_mode_unlocked_v1';
  var SESSION_GUARD_KEY = 'rs_session_outlet_guard_v1';

  var COUNTER_TABS = [
    'pos-tab',
    'bills-tab',
    'reports-tab',
    'editor-tab',
    'settings-tab',
    'tax-tab',
    'employees-tab',
  ];
  var TABLES_TABS = COUNTER_TABS.concat([
    'floor-tab',
    'qr-orders-tab',
    'kds-tab',
    'tokens-tab',
    'customers-tab',
    'crm-tab',
  ]);
  // full = no filter (show all role-allowed)

  // Recipes link to SAMPLE_STOCK keys so first bills auto-deduct store-room stock.
  var SAMPLE_MENU = [
    {
      name: 'Masala Chai',
      cat: 'Beverages',
      price: 20,
      veg: true,
      taxCategory: 'IN_REST_5',
      ingredients: [
        { name: 'Tea leaves', key: 'tea_leaves', qty: 0.005, unit: 'kg' },
        { name: 'Milk', key: 'milk', qty: 0.15, unit: 'L' },
        { name: 'Paper cups', key: 'paper_cups', qty: 1, unit: 'pcs' },
      ],
    },
    {
      name: 'Filter Coffee',
      cat: 'Beverages',
      price: 40,
      veg: true,
      taxCategory: 'IN_REST_5',
      ingredients: [
        { name: 'Milk', key: 'milk', qty: 0.12, unit: 'L' },
        { name: 'Paper cups', key: 'paper_cups', qty: 1, unit: 'pcs' },
      ],
    },
    {
      name: 'Cold Coffee',
      cat: 'Beverages',
      price: 80,
      veg: true,
      taxCategory: 'IN_REST_5',
      ingredients: [
        { name: 'Milk', key: 'milk', qty: 0.2, unit: 'L' },
        { name: 'Paper cups', key: 'paper_cups', qty: 1, unit: 'pcs' },
      ],
    },
    {
      name: 'Veg Maggi',
      cat: 'Snacks',
      price: 50,
      veg: true,
      taxCategory: 'IN_REST_5',
      ingredients: [{ name: 'Cooking oil', key: 'cooking_oil', qty: 0.01, unit: 'L' }],
    },
    {
      name: 'Samosa (2 pcs)',
      cat: 'Snacks',
      price: 30,
      veg: true,
      taxCategory: 'IN_REST_5',
      ingredients: [{ name: 'Cooking oil', key: 'cooking_oil', qty: 0.02, unit: 'L' }],
    },
    {
      name: 'Veg Sandwich',
      cat: 'Snacks',
      price: 60,
      veg: true,
      taxCategory: 'IN_REST_5',
      ingredients: [{ name: 'Carry bags', key: 'carry_bags', qty: 1, unit: 'pcs' }],
    },
    {
      name: 'Paneer Roll',
      cat: 'Snacks',
      price: 90,
      veg: true,
      taxCategory: 'IN_REST_5',
      ingredients: [
        { name: 'Cooking oil', key: 'cooking_oil', qty: 0.015, unit: 'L' },
        { name: 'Carry bags', key: 'carry_bags', qty: 1, unit: 'pcs' },
      ],
    },
    {
      name: 'Veg Thali',
      cat: 'Meals',
      price: 120,
      veg: true,
      taxCategory: 'IN_REST_5',
      ingredients: [{ name: 'Cooking oil', key: 'cooking_oil', qty: 0.02, unit: 'L' }],
    },
    {
      name: 'Dal Fry + Rice',
      cat: 'Meals',
      price: 100,
      veg: true,
      taxCategory: 'IN_REST_5',
      ingredients: [{ name: 'Cooking oil', key: 'cooking_oil', qty: 0.015, unit: 'L' }],
    },
    {
      name: 'Butter Chicken',
      cat: 'Meals',
      price: 220,
      veg: false,
      taxCategory: 'IN_REST_5',
      ingredients: [
        { name: 'Cooking oil', key: 'cooking_oil', qty: 0.02, unit: 'L' },
        { name: 'Milk', key: 'milk', qty: 0.05, unit: 'L' },
      ],
    },
    {
      name: 'Jeera Rice',
      cat: 'Meals',
      price: 70,
      veg: true,
      taxCategory: 'IN_REST_5',
      ingredients: [{ name: 'Cooking oil', key: 'cooking_oil', qty: 0.01, unit: 'L' }],
    },
    {
      name: 'Gulab Jamun (2)',
      cat: 'Dessert',
      price: 40,
      veg: true,
      taxCategory: 'IN_REST_5',
      ingredients: [{ name: 'Milk', key: 'milk', qty: 0.05, unit: 'L' }],
    },
  ];

  var SAMPLE_STOCK = [
    { name: 'Tea leaves', key: 'tea_leaves', unit: 'kg', stock: 2, min: 0.5, cost: 400, cat: 'food' },
    { name: 'Milk', key: 'milk', unit: 'L', stock: 10, min: 2, cost: 60, cat: 'food' },
    { name: 'Cooking oil', key: 'cooking_oil', unit: 'L', stock: 5, min: 1, cost: 150, cat: 'food' },
    { name: 'Paper cups', key: 'paper_cups', unit: 'pcs', stock: 200, min: 40, cost: 2, cat: 'packaging' },
    { name: 'Carry bags', key: 'carry_bags', unit: 'pcs', stock: 100, min: 20, cost: 3, cat: 'packaging' },
  ];

  var SAMPLE_TABLES = [
    { n: '01', name: '01', cap: 2, state: 'free' },
    { n: '02', name: '02', cap: 4, state: 'free' },
    { n: '03', name: '03', cap: 4, state: 'free' },
    { n: '04', name: '04', cap: 6, state: 'free' },
  ];

  function toast(msg, icon) {
    try {
      if (global.__toast) return global.__toast(msg, icon);
      if (global.RS && RS.toast) return RS.toast(msg, icon);
    } catch (_) {}
  }

  /** Kill blocking overlays so POS taps always work after first-run flows. */
  function closeAllModals() {
    try {
      if (global.RSModal && typeof RSModal.closeAll === 'function') {
        RSModal.closeAll();
        return;
      }
    } catch (_) {}
    try {
      document
        .querySelectorAll('#rs-modal-root .rs-overlay, .rs-overlay.show, #rs-pin-overlay')
        .forEach(function (el) {
          try {
            el.classList.remove('show');
            el.style.pointerEvents = 'none';
            el.remove();
          } catch (_) {}
        });
      var tour = document.getElementById('onboarding-overlay');
      if (tour) {
        tour.style.display = 'none';
        tour.style.pointerEvents = 'none';
        tour.classList.remove('is-visible', 'show');
      }
      var bd = document.getElementById('onboarding-backdrop');
      if (bd) {
        bd.style.pointerEvents = 'none';
        bd.style.display = 'none';
      }
      var wel = document.getElementById('rs-fx-welcome');
      if (wel) wel.remove();
    } catch (_) {}
  }

  function role() {
    try {
      var s = global.RS_API && RS_API.session && RS_API.session();
      return String((s && s.role) || sessionStorage.getItem('logged_in_role') || '').toLowerCase();
    } catch (_) {
      return '';
    }
  }

  function isOwnerLike() {
    var r = role();
    return !r || r === 'owner' || r === 'admin' || r === 'manager' || r === 'superadmin';
  }

  function isPlatform() {
    var r = role();
    if (r === 'superadmin' || r === 'brand_admin' || r === 'brandadmin') return true;
    try {
      if (document.body && document.body.classList) {
        if (document.body.classList.contains('rs-role-superadmin')) return true;
        if (document.body.classList.contains('rs-role-brandadmin')) return true;
      }
    } catch (_) {}
    return false;
  }

  function tenantKey(suffix) {
    var slug = '';
    try {
      var s = global.RS_API && RS_API.session && RS_API.session();
      slug = String((s && (s.tenant_slug || s.slug || s.tenant_id)) || sessionStorage.getItem('tenant_slug') || 'local');
    } catch (_) {
      slug = 'local';
    }
    return suffix + ':' + slug;
  }

  function lsGet(key, fallback) {
    try {
      var v = localStorage.getItem(key);
      if (v == null) return fallback;
      return JSON.parse(v);
    } catch (_) {
      return fallback;
    }
  }

  function lsSet(key, val) {
    try {
      localStorage.setItem(key, JSON.stringify(val));
    } catch (_) {}
  }

  function injectStyles() {
    if (document.getElementById(STYLE_ID)) return;
    var s = document.createElement('style');
    s.id = STYLE_ID;
    s.textContent =
      '#rs-fx-welcome{position:fixed;inset:0;z-index:2147483500;display:flex;align-items:center;justify-content:center;' +
      'background:rgba(15,12,10,.58);padding:16px;backdrop-filter:blur(6px)}' +
      '#rs-fx-welcome .fx-card{width:min(480px,100%);background:var(--panel,#fff);color:var(--text,#1a1714);' +
      'border-radius:18px;padding:22px 22px 18px;box-shadow:0 24px 60px rgba(0,0,0,.3);border:1px solid rgba(0,0,0,.08);' +
      'max-height:92vh;overflow:auto}' +
      '#rs-fx-welcome .fx-title{font-family:var(--font-display,Georgia,serif);font-weight:800;font-size:22px;margin:0 0 6px}' +
      '#rs-fx-welcome .fx-sub{font-size:13.5px;line-height:1.55;color:var(--text-soft,#5c534c);margin:0 0 14px}' +
      '#rs-fx-welcome .fx-steps{list-style:none;padding:0;margin:0 0 16px;display:flex;flex-direction:column;gap:8px}' +
      '#rs-fx-welcome .fx-steps li{display:flex;gap:10px;align-items:flex-start;padding:10px 12px;border-radius:12px;' +
      'border:1px solid var(--stroke-2,rgba(0,0,0,.08));background:var(--glass,#faf8f6);font-size:13px;line-height:1.4}' +
      '#rs-fx-welcome .fx-steps .n{width:22px;height:22px;border-radius:7px;background:rgba(255,79,0,.12);color:#c2410c;' +
      'display:grid;place-items:center;font-weight:800;font-size:11px;flex:none}' +
      '#rs-fx-welcome .fx-actions{display:flex;flex-wrap:wrap;gap:10px}' +
      '#rs-fx-check{position:fixed;right:16px;bottom:72px;z-index:9000;width:min(300px,calc(100vw - 24px));' +
      'background:var(--panel,#fff);border:1px solid var(--stroke-2);border-radius:14px;box-shadow:0 12px 36px rgba(0,0,0,.18);' +
      'padding:12px 14px;font-size:12.5px}' +
      '#rs-fx-check.hidden{display:none!important}' +
      '#rs-fx-check .fx-head{display:flex;align-items:center;gap:8px;font-weight:800;margin-bottom:8px}' +
      '#rs-fx-check .fx-head i{color:#FF4F00}' +
      '#rs-fx-check .fx-row{display:flex;align-items:center;gap:8px;padding:6px 0;border-top:1px solid var(--stroke-2);cursor:pointer}' +
      '#rs-fx-check .fx-row:first-of-type{border-top:0}' +
      '#rs-fx-check .fx-dot{width:18px;height:18px;border-radius:5px;border:2px solid var(--stroke-2);flex:none;' +
      'display:grid;place-items:center;font-size:10px;color:#fff}' +
      '#rs-fx-check .fx-row.done .fx-dot{background:#22c55e;border-color:#22c55e}' +
      '#rs-fx-check .fx-row.done span{text-decoration:line-through;opacity:.65}' +
      '#rs-fx-mode{display:inline-flex;gap:4px;padding:3px;border-radius:999px;border:1px solid var(--stroke-2);' +
      'background:var(--glass);margin-left:8px;vertical-align:middle}' +
      '#rs-fx-mode button{border:0;background:transparent;font-size:11px;font-weight:700;padding:5px 10px;border-radius:999px;' +
      'cursor:pointer;color:var(--text-soft);font-family:inherit}' +
      '#rs-fx-mode button.on{background:linear-gradient(135deg,#ff7a3d,#FF4F00);color:#fff}' +
      '.sidebar-link.rs-fx-hidden,.mnav-link.rs-fx-hidden{display:none!important}' +
      '#rs-fx-pos-empty{margin:10px 12px;padding:14px 16px;border-radius:14px;border:1.5px dashed rgba(255,79,0,.35);' +
      'background:rgba(255,79,0,.06);display:flex;flex-wrap:wrap;gap:10px;align-items:center}' +
      '#rs-fx-pos-empty .t{font-weight:800;font-size:13.5px}' +
      '#rs-fx-pos-empty .s{font-size:12px;color:var(--text-soft);line-height:1.4}' +
      '#rs-fx-guard{position:fixed;top:0;left:0;right:0;z-index:2147483000;padding:10px 14px;background:#7f1d1d;color:#fff;' +
      'font-size:13px;font-weight:600;display:flex;gap:12px;align-items:center;justify-content:center;flex-wrap:wrap}' +
      '#rs-fx-guard button{border:0;border-radius:8px;padding:6px 12px;font-weight:700;cursor:pointer}' +
      '@media(max-width:720px){#rs-fx-check{bottom:84px;right:10px;left:10px;width:auto}}';
    document.head.appendChild(s);
  }

  /* ---------- Workspace mode (progressive sidebar) ---------- */
  function getMode() {
    try {
      var fromLs = localStorage.getItem(tenantKey(MODE_KEY));
      if (fromLs === 'counter' || fromLs === 'tables' || fromLs === 'full') return fromLs;
    } catch (_) {}
    try {
      var s = global.RS_SETTINGS || {};
      var m = String(s.set_workspace_mode || '').toLowerCase();
      if (m === 'counter' || m === 'tables' || m === 'full') return m;
      // Legacy pos-only → counter
      if (s.set_pos_only_mode === true || s.set_pos_only_mode === 'true') return 'counter';
    } catch (_) {}
    // New outlets default to counter for calm first day
    if (!hasAnySales()) return 'counter';
    return 'tables';
  }

  function setMode(mode, opts) {
    opts = opts || {};
    var m = mode === 'full' || mode === 'tables' ? mode : 'counter';
    try {
      localStorage.setItem(tenantKey(MODE_KEY), m);
    } catch (_) {}
    try {
      global.RS_SETTINGS = global.RS_SETTINGS || {};
      global.RS_SETTINGS.set_workspace_mode = m;
      // Align kitchen ops mode lightly
      if (m === 'counter') {
        global.RS_SETTINGS.set_operating_mode = 'Billing only';
        global.RS_SETTINGS.set_pos_only_mode = true;
      } else if (m === 'tables') {
        global.RS_SETTINGS.set_operating_mode = 'Full ops (KDS + kitchen)';
        global.RS_SETTINGS.set_pos_only_mode = false;
      }
      if (global.RS && typeof RS.saveSettings === 'function' && !opts.skipSave) {
        RS.saveSettings(global.RS_SETTINGS).catch(function () {});
      } else if (global.RS_DB && RS_DB.setSettings && !opts.skipSave) {
        RS_DB.setSettings(global.RS_SETTINGS).catch(function () {});
      }
    } catch (_) {}
    applyModeNav();
    paintModeSwitcher();
    if (!opts.silent) {
      toast(
        m === 'counter'
          ? 'Counter mode · POS, bills & reports'
          : m === 'tables'
            ? 'Tables mode · floor, QR & kitchen unlocked'
            : 'Full mode · all modules',
        'fa-layer-group'
      );
    }
    try {
      document.dispatchEvent(new CustomEvent('rs:workspace-mode', { detail: { mode: m } }));
    } catch (_) {}
  }

  function tabsForMode(mode) {
    if (mode === 'full') return null;
    if (mode === 'tables') return TABLES_TABS.slice();
    return COUNTER_TABS.slice();
  }

  function applyModeNav() {
    if (isPlatform()) {
      document.querySelectorAll('.sidebar-link.rs-fx-hidden, .mnav-link.rs-fx-hidden').forEach(function (el) {
        el.classList.remove('rs-fx-hidden');
      });
      return;
    }
    var mode = getMode();
    var allowed = tabsForMode(mode);
    var links = document.querySelectorAll('.sidebar-link[data-tab], .mnav-link[data-tab]');
    links.forEach(function (a) {
      var id = a.getAttribute('data-tab') || '';
      if (!id) return;
      // Super-admin only links stay as-is
      if (a.classList.contains('superadmin-only') || a.classList.contains('brandadmin-only')) return;
      // Kitchen setup always available for owners when inventory/menu unlocked
      if (a.id === 'klc-sidebar-setup' || a.classList.contains('klc-setup-link')) {
        var showKlc = mode !== 'counter' || isOwnerLike();
        a.classList.toggle('rs-fx-hidden', !showKlc && mode === 'counter');
        // In counter mode hide kitchen setup to reduce noise
        if (mode === 'counter') a.classList.add('rs-fx-hidden');
        else a.classList.remove('rs-fx-hidden');
        return;
      }
      if (allowed == null) {
        a.classList.remove('rs-fx-hidden');
        return;
      }
      // Always show growth hub only in full mode
      if (id === 'growth-hub-tab' || id === 'analytics-tab' || id === 'inventory-tab' || id === 'aggregator-tab') {
        a.classList.toggle('rs-fx-hidden', mode !== 'full');
        return;
      }
      var ok = allowed.indexOf(id) !== -1;
      a.classList.toggle('rs-fx-hidden', !ok);
    });
    // If active tab hidden, jump to POS
    try {
      var active = document.querySelector('.tab-content.active');
      if (active && allowed && allowed.indexOf(active.id) === -1) {
        if (global.RS && typeof RS.activateTab === 'function') RS.activateTab('pos-tab');
      }
    } catch (_) {}
  }

  function paintModeSwitcher() {
    if (isPlatform() || !isOwnerLike()) return;
    var host =
      document.getElementById('tb-right') ||
      document.querySelector('.topbar-right') ||
      document.querySelector('.topbar-actions');
    if (!host) return;
    var el = document.getElementById('rs-fx-mode');
    if (!el) {
      el = document.createElement('div');
      el.id = 'rs-fx-mode';
      el.setAttribute('role', 'group');
      el.setAttribute('aria-label', 'Workspace mode');
      el.title = 'Simplify or expand modules for this outlet';
      host.insertBefore(el, host.firstChild);
    }
    var cur = getMode();
    el.innerHTML =
      '<button type="button" data-m="counter" class="' +
      (cur === 'counter' ? 'on' : '') +
      '" title="POS + bills + reports">Counter</button>' +
      '<button type="button" data-m="tables" class="' +
      (cur === 'tables' ? 'on' : '') +
      '" title="Add floor, QR, kitchen">Tables</button>' +
      '<button type="button" data-m="full" class="' +
      (cur === 'full' ? 'on' : '') +
      '" title="Everything">Full</button>';
    el.querySelectorAll('[data-m]').forEach(function (b) {
      b.onclick = function () {
        setMode(b.getAttribute('data-m'));
      };
    });
  }

  /* ---------- Sample pack ---------- */
  function menuCount() {
    try {
      return ((global.RS && Array.isArray(RS.MENU) && RS.MENU) || []).length;
    } catch (_) {
      return 0;
    }
  }

  function billCount() {
    try {
      return ((global.RS && Array.isArray(RS.BILLS) && RS.BILLS) || []).length;
    } catch (_) {
      return 0;
    }
  }

  function hasAnySales() {
    return billCount() > 0;
  }

  async function ensureSampleTables() {
    try {
      var settings = null;
      if (global.RS_DB && RS_DB.getSettings) settings = await RS_DB.getSettings();
      settings = settings || global.RS_SETTINGS || {};
      var existing = settings.custom_tables;
      if (Array.isArray(existing) && existing.length > 0) return false;
      settings.custom_tables = SAMPLE_TABLES.map(function (t) {
        return { n: t.n, name: t.name, cap: t.cap, state: 'free' };
      });
      global.RS_SETTINGS = Object.assign({}, global.RS_SETTINGS || {}, settings);
      if (global.RS_DB && RS_DB.setSettings) await RS_DB.setSettings(settings);
      try {
        document.dispatchEvent(new Event('rs:tables-updated'));
      } catch (_) {}
      return true;
    } catch (e) {
      console.warn('[Frictionless] tables seed', e);
      return false;
    }
  }

  async function ensureSampleMenu() {
    if (menuCount() > 0) return { added: 0, skipped: true };
    var added = 0;
    var baseId = Date.now();
    for (var i = 0; i < SAMPLE_MENU.length; i++) {
      var item = SAMPLE_MENU[i];
      var rec = {
        id: baseId + i,
        name: item.name,
        cat: item.cat,
        price: item.price,
        veg: !!item.veg,
        stock: 'ok',
        taxCategory: item.taxCategory || 'IN_REST_5',
        gst: '5%',
        ingredients: Array.isArray(item.ingredients)
          ? item.ingredients.map(function (ing) {
              return {
                name: ing.name,
                key: ing.key || String(ing.name || '').toLowerCase().replace(/[^a-z0-9]+/g, '_'),
                qty: Number(ing.qty) || 0,
                unit: ing.unit || 'unit',
              };
            })
          : [],
        recipeServings: 1,
        serveUnit: 'plate',
        _sample: true,
      };
      try {
        if (global.RS && Array.isArray(RS.MENU)) RS.MENU.push(rec);
        if (global.RS && typeof RS.saveOne === 'function') {
          var saved = await RS.saveOne('menu', rec);
          if (saved && saved.id != null) Object.assign(rec, saved);
        } else if (global.RS_DB && RS_DB.put) {
          await RS_DB.put('menu', rec.id, rec);
        }
        added++;
      } catch (err) {
        console.warn('[Frictionless] menu seed item failed', item.name, err);
        // keep local push even if cloud fails
      }
    }
    try {
      if (global.RS && typeof RS.renderPOS === 'function') RS.renderPOS();
      if (typeof global.refreshPosCats === 'function') global.refreshPosCats();
    } catch (_) {}
    return { added: added, skipped: false };
  }

  async function ensureSampleStock() {
    try {
      var inv = (global.RS && Array.isArray(RS.INVENTORY) && RS.INVENTORY) || [];
      if (inv.length > 0) return 0;
      var n = 0;
      var base = Date.now() + 5000;
      for (var i = 0; i < SAMPLE_STOCK.length; i++) {
        var s = SAMPLE_STOCK[i];
        var rec = {
          id: base + i,
          name: s.name,
          key: s.key || String(s.name || '').toLowerCase().replace(/[^a-z0-9]+/g, '_'),
          unit: s.unit,
          stock: s.stock,
          current: s.stock,
          min: s.min,
          max: s.stock * 4,
          cost: s.cost,
          cat: s.cat,
          category: s.cat,
          _sample: true,
        };
        if (global.RS && Array.isArray(RS.INVENTORY)) RS.INVENTORY.push(rec);
        try {
          if (global.RS && typeof RS.saveOne === 'function') await RS.saveOne('inventory', rec);
          else if (global.RS_DB && RS_DB.put) await RS_DB.put('inventory', rec.id, rec);
        } catch (saveErr) {
          // Keep local stock even if cloud write fails — still deduct on this device
          console.warn('[Frictionless] stock seed save', s.name, saveErr);
        }
        n++;
      }
      try {
        if (global.RS && typeof RS.render === 'function') RS.render('inventory-tab');
      } catch (_) {}
      return n;
    } catch (e) {
      console.warn('[Frictionless] stock seed', e);
      return 0;
    }
  }

  /** If outlet already has menu but empty stock, still seed store-room + backfill missing recipes. */
  async function ensureSampleRecipesIfMissing() {
    try {
      var menu = (global.RS && Array.isArray(RS.MENU) && RS.MENU) || [];
      if (!menu.length) return 0;
      var n = 0;
      for (var i = 0; i < SAMPLE_MENU.length; i++) {
        var sample = SAMPLE_MENU[i];
        if (!sample.ingredients || !sample.ingredients.length) continue;
        var live = menu.find(function (m) {
          return String(m.name || '').toLowerCase() === String(sample.name || '').toLowerCase();
        });
        if (!live) continue;
        if (Array.isArray(live.ingredients) && live.ingredients.length) continue;
        live.ingredients = sample.ingredients.map(function (ing) {
          return {
            name: ing.name,
            key: ing.key,
            qty: Number(ing.qty) || 0,
            unit: ing.unit || 'unit',
          };
        });
        live.recipeServings = 1;
        n++;
        try {
          if (global.RS && typeof RS.saveOne === 'function') await RS.saveOne('menu', live);
          else if (global.RS_DB && RS_DB.put) await RS_DB.put('menu', live.id, live);
        } catch (_) {}
      }
      return n;
    } catch (e) {
      console.warn('[Frictionless] recipe backfill', e);
      return 0;
    }
  }

  async function loadStartSellingPack(opts) {
    opts = opts || {};
    var result = { menu: 0, tables: false, stock: 0 };
    // Never leave welcome/onboarding covering POS after pack load
    closeAllModals();
    try {
      var m = await ensureSampleMenu();
      result.menu = m.added || 0;
      result.tables = await ensureSampleTables();
      if (opts.withStock !== false) result.stock = await ensureSampleStock();
      // Existing outlets: empty stock + menu without recipes → still make deduct work
      result.recipesBackfilled = await ensureSampleRecipesIfMissing();
      if (opts.withStock !== false && result.stock === 0) {
        result.stock = await ensureSampleStock();
      }
      try {
        localStorage.setItem(tenantKey(SAMPLE_KEY), '1');
      } catch (_) {}
      markActivation('sample');
      if (getMode() === 'counter' && !opts.keepMode) {
        /* stay counter */
      }
      toast(
        result.menu
          ? 'Sample menu ready · ' + result.menu + ' dishes — ring your first bill'
          : 'Menu already has items — open POS to sell',
        'fa-mug-hot'
      );
      try {
        if (global.RS && typeof RS.activateTab === 'function') RS.activateTab('pos-tab');
      } catch (_) {}
      paintPosEmptyCoach();
      paintActivationChecklist();
      // Second pass: async toasts / delayed modals must not block menu taps
      setTimeout(closeAllModals, 50);
      setTimeout(closeAllModals, 400);
    } catch (e) {
      console.warn('[Frictionless] pack', e);
      toast('Could not load sample pack — add a dish in Menu Editor', 'fa-circle-exclamation');
      closeAllModals();
    }
    return result;
  }

  /* ---------- Activation checklist ---------- */
  function loadActivation() {
    return lsGet(tenantKey(ACTIVATION_KEY), {}) || {};
  }

  function markActivation(step) {
    var st = loadActivation();
    st[step] = true;
    st.updatedAt = Date.now();
    lsSet(tenantKey(ACTIVATION_KEY), st);
    paintActivationChecklist();
    try {
      document.dispatchEvent(new CustomEvent('rs:activation', { detail: st }));
    } catch (_) {}
  }

  function autoDetectActivation() {
    var st = loadActivation();
    if (menuCount() > 0) st.sample = true;
    if (billCount() > 0) {
      st.firstBill = true;
      st.sample = true;
    }
    // Persist any session flag that reports were opened (sidebar / hash / checklist)
    try {
      if (sessionStorage.getItem(tenantKey(ACTIVATION_KEY) + ':reports') === '1') {
        st.reports = true;
      }
    } catch (_) {}
    // If reports tab is currently active, count as done
    try {
      var rt = document.getElementById('reports-tab');
      if (rt && (rt.classList.contains('active') || rt.classList.contains('show'))) {
        st.reports = true;
      }
      var hash = String(location.hash || '');
      if (/reports-tab|reports/i.test(hash)) st.reports = true;
    } catch (_) {}
    lsSet(tenantKey(ACTIVATION_KEY), st);
    return st;
  }

  function wireReportsActivation() {
    function onReportsVisit() {
      try {
        sessionStorage.setItem(tenantKey(ACTIVATION_KEY) + ':reports', '1');
      } catch (_) {}
      markActivation('reports');
    }
    document.addEventListener('rs:tab-change', function (ev) {
      var tab = (ev && ev.detail && ev.detail.tab) || '';
      if (tab === 'reports-tab' || tab === 'analytics-tab') onReportsVisit();
      if (tab === 'pos-tab') {
        // Ensure no leftover modal steals POS clicks
        setTimeout(closeAllModals, 0);
      }
    });
    window.addEventListener('hashchange', function () {
      if (/reports-tab|reports/i.test(String(location.hash || ''))) onReportsVisit();
    });
    // CA pack / day pack buttons also complete the step
    document.addEventListener(
      'click',
      function (ev) {
        var t = ev.target && ev.target.closest && ev.target.closest('#rs-fx-ca-pack, #btn-download-gstr, #rs-day-pack, [data-ca-pack]');
        if (t) onReportsVisit();
      },
      true
    );
  }

  function paintActivationChecklist() {
    if (isPlatform() || !isOwnerLike()) return;
    injectStyles();
    var st = autoDetectActivation();
    var allDone = st.sample && st.firstBill && st.reports;
    if (allDone) {
      var old = document.getElementById('rs-fx-check');
      if (old) old.classList.add('hidden');
      return;
    }
    // Hide if dismissed permanently
    try {
      if (localStorage.getItem(tenantKey(ACTIVATION_KEY) + ':dismiss') === '1') return;
    } catch (_) {}

    var el = document.getElementById('rs-fx-check');
    if (!el) {
      el = document.createElement('div');
      el.id = 'rs-fx-check';
      document.body.appendChild(el);
    }
    el.classList.remove('hidden');
    var steps = [
      { id: 'sample', label: 'Menu ready (sample or your dishes)', tab: 'editor-tab' },
      { id: 'firstBill', label: 'Complete first bill on POS', tab: 'pos-tab' },
      { id: 'reports', label: 'Open Reports / CA pack', tab: 'reports-tab' },
    ];
    var doneN = steps.filter(function (s) {
      return st[s.id];
    }).length;
    el.innerHTML =
      '<div class="fx-head"><i class="fa-solid fa-rocket"></i> Start selling · ' +
      doneN +
      '/' +
      steps.length +
      '<button type="button" id="rs-fx-check-x" style="margin-left:auto;border:0;background:transparent;cursor:pointer;font-size:16px;color:var(--text-mute)" aria-label="Dismiss">×</button></div>' +
      steps
        .map(function (s) {
          return (
            '<div class="fx-row' +
            (st[s.id] ? ' done' : '') +
            '" data-step="' +
            s.id +
            '" data-tab="' +
            s.tab +
            '">' +
            '<span class="fx-dot">' +
            (st[s.id] ? '✓' : '') +
            '</span><span>' +
            s.label +
            '</span></div>'
          );
        })
        .join('') +
      (!st.sample
        ? '<button type="button" class="btn btn-primary btn-sm" id="rs-fx-load-sample" style="width:100%;margin-top:8px"><i class="fa-solid fa-wand-magic-sparkles"></i> Load sample café menu</button>'
        : '');

    var x = el.querySelector('#rs-fx-check-x');
    if (x) {
      x.onclick = function () {
        try {
          localStorage.setItem(tenantKey(ACTIVATION_KEY) + ':dismiss', '1');
        } catch (_) {}
        el.classList.add('hidden');
      };
    }
    el.querySelectorAll('.fx-row').forEach(function (row) {
      row.onclick = function () {
        var tab = row.getAttribute('data-tab');
        if (tab && global.RS && typeof RS.activateTab === 'function') RS.activateTab(tab);
        if (row.getAttribute('data-step') === 'reports') markActivation('reports');
      };
    });
    var loadBtn = el.querySelector('#rs-fx-load-sample');
    if (loadBtn) {
      loadBtn.onclick = function () {
        loadBtn.disabled = true;
        loadStartSellingPack().finally(function () {
          loadBtn.disabled = false;
        });
      };
    }
  }

  /* ---------- Welcome modal ---------- */
  function showWelcomeIfNeeded() {
    if (isPlatform() || !isOwnerLike()) return;
    try {
      if (localStorage.getItem(tenantKey(WELCOME_KEY)) === '1') return;
    } catch (_) {}
    // Only when empty / brand new
    if (menuCount() > 3 || billCount() > 0) {
      try {
        localStorage.setItem(tenantKey(WELCOME_KEY), '1');
      } catch (_) {}
      return;
    }
    if (!global.RSModal && !document.body) return;
    injectStyles();

    function finishWelcome(loadSample) {
      try {
        localStorage.setItem(tenantKey(WELCOME_KEY), '1');
      } catch (_) {}
      // Discard legacy Getting Started tour for this outlet — frictionless is the system
      try {
        var slug = 'local';
        var user = 'owner';
        try {
          var sess = global.RS_API && RS_API.session && RS_API.session();
          slug = String((sess && (sess.tenant_slug || sess.slug)) || sessionStorage.getItem('tenant_slug') || 'local');
          user = String((sess && (sess.email || sess.username || sess.user_id)) || sessionStorage.getItem('username') || 'owner');
        } catch (_) {}
        localStorage.setItem('restrosuite_tour_done:' + slug + ':' + user, '1');
        sessionStorage.setItem('restrosuite_tour_skip_session:' + slug + ':' + user, '1');
      } catch (_) {}
      closeAllModals();
      var wrap = document.getElementById('rs-fx-welcome');
      if (wrap) wrap.remove();
      setMode('counter', { silent: true, skipSave: false });
      if (loadSample) {
        // Close first, then pack — avoid stacked overlays
        Promise.resolve()
          .then(function () {
            return loadStartSellingPack({ withStock: true });
          })
          .finally(function () {
            closeAllModals();
          });
      } else {
        paintActivationChecklist();
        paintPosEmptyCoach();
        try {
          if (global.RS && typeof RS.activateTab === 'function') RS.activateTab('editor-tab');
        } catch (_) {}
        toast('Add your first dish, then open POS', 'fa-utensils');
      }
    }

    var welcomeBody =
      '<p style="margin:0 0 10px;font-size:13.5px;line-height:1.55;color:var(--text-soft)">' +
      'Your <b>30-day free trial</b> is live. Start simple: <b>Counter mode</b> = POS + bills + reports only.</p>' +
      '<p style="margin:0 0 12px;font-size:12.5px;line-height:1.5;color:var(--text-mute)">' +
      'हिंदी: 30 दिन मुफ़्त। पहले सिर्फ़ बिलिंग — टेबल/किचन बाद में खोलें।</p>' +
      '<ol style="margin:0;padding-left:18px;font-size:13px;line-height:1.55;color:var(--text)">' +
      '<li style="margin-bottom:6px"><b>Load sample menu</b> / सैंपल मेन्यू (12 items) or add your own</li>' +
      '<li style="margin-bottom:6px"><b>Tap dishes → Print &amp; Pay</b> (Cash / UPI)</li>' +
      '<li><b>Reports → CA pack</b> for your accountant / CA के लिए</li>' +
      '</ol>';

    // Prefer RSModal if available
    if (global.RSModal && typeof RSModal.open === 'function') {
      try {
        localStorage.setItem(tenantKey(WELCOME_KEY), '1');
      } catch (_) {}
      global.RSModal.open({
        title: 'Welcome — sell in 3 taps',
        icon: 'fa-rocket',
        size: 'md',
        body: welcomeBody,
        foot:
          '<button type="button" class="btn btn-ghost" style="flex:1" data-own>I\'ll add my menu</button>' +
          '<button type="button" class="btn btn-primary" style="flex:1.4" data-sample>' +
          '<i class="fa-solid fa-wand-magic-sparkles"></i> Load sample &amp; sell</button>',
        onMount: function (modal, close) {
          var own = modal.querySelector('[data-own]');
          var sample = modal.querySelector('[data-sample]');
          if (own) {
            own.onclick = function () {
              try {
                close();
              } catch (_) {}
              closeAllModals();
              finishWelcome(false);
            };
          }
          if (sample) {
            sample.onclick = function () {
              try {
                close();
              } catch (_) {}
              closeAllModals();
              finishWelcome(true);
            };
          }
        },
      });
      return;
    }

    // Fallback overlay
    if (document.getElementById('rs-fx-welcome')) return;
    var wrap = document.createElement('div');
    wrap.id = 'rs-fx-welcome';
    wrap.innerHTML =
      '<div class="fx-card" role="dialog" aria-modal="true">' +
      '<h2 class="fx-title">Welcome — sell in 3 taps</h2>' +
      '<div class="fx-sub">' +
      welcomeBody +
      '</div>' +
      '<div class="fx-actions">' +
      '<button type="button" class="btn btn-ghost" id="rs-fx-own">I\'ll add my menu</button>' +
      '<button type="button" class="btn btn-primary" id="rs-fx-sample"><i class="fa-solid fa-wand-magic-sparkles"></i> Load sample &amp; sell</button>' +
      '</div></div>';
    document.body.appendChild(wrap);
    wrap.querySelector('#rs-fx-own').onclick = function () {
      finishWelcome(false);
    };
    wrap.querySelector('#rs-fx-sample').onclick = function () {
      finishWelcome(true);
    };
  }

  /* ---------- Empty POS coach ---------- */
  function paintPosEmptyCoach() {
    if (isPlatform()) return;
    var pos = document.getElementById('pos-tab');
    if (!pos) return;
    var existing = document.getElementById('rs-fx-pos-empty');
    if (menuCount() > 0) {
      if (existing) existing.remove();
      return;
    }
    if (existing) return;
    injectStyles();
    var box = document.createElement('div');
    box.id = 'rs-fx-pos-empty';
    box.innerHTML =
      '<div style="flex:1;min-width:180px"><div class="t">No dishes yet</div>' +
      '<div class="s">Load a sample café menu or add one item in Menu Editor — then tap to bill.</div></div>' +
      '<button type="button" class="btn btn-primary btn-sm" id="rs-fx-pos-sample"><i class="fa-solid fa-wand-magic-sparkles"></i> Sample menu</button>' +
      '<button type="button" class="btn btn-ghost btn-sm" id="rs-fx-pos-editor"><i class="fa-solid fa-utensils"></i> Menu Editor</button>';
    var toolbar = pos.querySelector('.pos-toolbar, .pos-head, .toolbar-row') || pos.firstChild;
    if (toolbar && toolbar.parentNode) toolbar.parentNode.insertBefore(box, toolbar.nextSibling);
    else pos.insertBefore(box, pos.firstChild);
    box.querySelector('#rs-fx-pos-sample').onclick = function () {
      loadStartSellingPack();
    };
    box.querySelector('#rs-fx-pos-editor').onclick = function () {
      if (global.RS && RS.activateTab) RS.activateTab('editor-tab');
    };
  }

  /* ---------- Owner WA default-on ---------- */
  async function ensureOwnerWaDefaults() {
    if (isPlatform() || !isOwnerLike()) return;
    try {
      if (!global.RSOwnerWa && !global.RSOwnerReports) {
        // owner-wa-reports exposes via different names — use local cfg
      }
      var sess = (global.RS_API && RS_API.session && RS_API.session()) || {};
      var phone =
        String(sess.phone || sess.whatsapp || sess.owner_phone || sess.mobile || '').replace(/\D/g, '') ||
        '';
      if (!phone && global.RS_SETTINGS) {
        phone = String(global.RS_SETTINGS.set_phone || global.RS_SETTINGS.set_whatsapp || '').replace(/\D/g, '');
      }
      if (!phone || phone.length < 10) return;

      var key = 'rs_owner_wa_reports_v1';
      var raw = null;
      try {
        raw = localStorage.getItem(key);
      } catch (_) {}
      var cfg = raw ? JSON.parse(raw) : null;
      if (cfg && cfg.ownerPhone && cfg._frictionlessDefault) return;
      if (cfg && cfg.ownerPhone && cfg.enabled === false) return; // user opted out

      var next = Object.assign(
        {
          enabled: true,
          ownerPhone: phone,
          dailySales: true,
          dailySalesHour: 22,
          stockAlerts: true,
          stockAlertHour: 10,
          weeklyPL: true,
          weeklyPLDay: 1,
          monthlyPL: true,
          monthlyPLDay: 1,
        },
        cfg || {},
        { ownerPhone: (cfg && cfg.ownerPhone) || phone, enabled: cfg && cfg.enabled === false ? false : true, _frictionlessDefault: true }
      );
      try {
        localStorage.setItem(key, JSON.stringify(next));
      } catch (_) {}
      try {
        if (global.RS_DB && RS_DB.put) {
          var tid = sess.tenant_id || sessionStorage.getItem('tenant_id') || 'local';
          await RS_DB.put('owner_report_prefs', tid, Object.assign({}, next, { id: tid, tenantId: tid }));
        }
      } catch (_) {}
    } catch (e) {
      console.warn('[Frictionless] owner WA defaults', e);
    }
  }

  /* ---------- Progressive unlock ---------- */
  function maybeProgressiveUnlock() {
    if (isPlatform()) return;
    try {
      if (localStorage.getItem(tenantKey(UNLOCK_KEY)) === '1') return;
    } catch (_) {}
    var n = billCount();
    if (n < 10) return;
    if (getMode() !== 'counter') {
      try {
        localStorage.setItem(tenantKey(UNLOCK_KEY), '1');
      } catch (_) {}
      return;
    }
    try {
      localStorage.setItem(tenantKey(UNLOCK_KEY), '1');
    } catch (_) {}
    if (global.RSModal && typeof RSModal.open === 'function') {
      global.RSModal.open({
        title: 'Ready for tables & QR?',
        icon: 'fa-chair',
        size: 'sm',
        body:
          '<p style="margin:0;font-size:13.5px;line-height:1.5;color:var(--text-soft)">' +
          'You have completed <b>' +
          n +
          ' bills</b>. Unlock Floor, QR Orders, and Kitchen when you are ready — or stay in Counter mode.</p>',
        foot:
          '<button type="button" class="btn btn-ghost" style="flex:1" data-stay>Stay counter</button>' +
          '<button type="button" class="btn btn-primary" style="flex:1.3" data-go>Unlock tables</button>',
        onMount: function (modal, close) {
          modal.querySelector('[data-stay]').onclick = close;
          modal.querySelector('[data-go]').onclick = function () {
            close();
            setMode('tables');
          };
        },
      });
    } else {
      toast('Tip: switch to Tables mode for floor & QR (top bar)', 'fa-chair');
    }
  }

  /* ---------- Soft first shift of day (delegates to RSOps one-tap modal) ---------- */
  function maybeSoftOpenShift() {
    try {
      if (isPlatform()) return;
      var required = false;
      if (global.RSOps && typeof RSOps.isShiftRequired === 'function') {
        required = !!RSOps.isShiftRequired();
      } else if (typeof global.RS_featureOn === 'function') {
        required = !!global.RS_featureOn('set_require_open_shift', global.RS_SETTINGS, false);
      } else {
        var v = (global.RS_SETTINGS || {}).set_require_open_shift;
        required = v === true || v === 'true' || v === 1 || v === '1';
      }
      if (!required) return;
      if (global.RSOps && typeof RSOps.getOpenShift === 'function' && RSOps.getOpenShift()) return;
      // competitive-ops maybePromptOpenShift runs on refresh; also nudge after sample pack
      try {
        sessionStorage.removeItem('rs_shift_prompted');
      } catch (_) {}
      if (global.RSOps && typeof RSOps.refresh === 'function') {
        setTimeout(function () {
          try {
            RSOps.refresh();
          } catch (_) {}
        }, 500);
      }
    } catch (_) {}
  }

  /* ---------- WhatsApp gateway health (plain language) ---------- */
  function installGatewayHealthChip() {
    if (isPlatform()) return;
    injectStyles();
    var styleExtra = document.getElementById(STYLE_ID);
    if (styleExtra && styleExtra.textContent.indexOf('rs-fx-wa-health') < 0) {
      styleExtra.textContent +=
        '#rs-fx-wa-health{display:inline-flex;align-items:center;gap:6px;font-size:11.5px;font-weight:700;' +
        'padding:5px 10px;border-radius:999px;border:1px solid var(--stroke-2);background:var(--glass);' +
        'color:var(--text-soft);cursor:pointer;margin-left:6px}' +
        '#rs-fx-wa-health.is-ok{color:#15803d;border-color:rgba(34,197,94,.35);background:rgba(34,197,94,.1)}' +
        '#rs-fx-wa-health.is-bad{color:#b91c1c;border-color:rgba(239,68,68,.35);background:rgba(239,68,68,.1)}' +
        '#rs-fx-wa-health.is-unk{color:#a16207;border-color:rgba(234,179,8,.35);background:rgba(234,179,8,.1)}';
    }

    function ensureChip() {
      var host =
        document.getElementById('tb-right') ||
        document.querySelector('.topbar-right') ||
        document.querySelector('.topbar-actions');
      if (!host || document.getElementById('rs-fx-wa-health')) return document.getElementById('rs-fx-wa-health');
      var chip = document.createElement('button');
      chip.type = 'button';
      chip.id = 'rs-fx-wa-health';
      chip.className = 'is-unk';
      chip.title = 'WhatsApp receipt status';
      chip.innerHTML = '<i class="fa-brands fa-whatsapp"></i><span data-l>WA…</span>';
      chip.onclick = function () {
        var msg =
          chip.getAttribute('data-msg') ||
          'WhatsApp receipts need the gateway linked. Open Settings → WhatsApp.';
        if (global.RSModal && typeof RSModal.open === 'function') {
          RSModal.open({
            title: 'WhatsApp receipts',
            icon: 'fa-brands fa-whatsapp',
            size: 'sm',
            body:
              '<p style="margin:0;font-size:13.5px;line-height:1.55;color:var(--text-soft)">' +
              msg +
              '</p>' +
              '<p style="margin:12px 0 0;font-size:12.5px;color:var(--text-mute)">Simple words: if this is green, bills can go to customer WhatsApp. Red means link again or check internet.</p>',
            foot: '<button type="button" class="btn btn-primary" data-ok style="flex:1">OK</button>',
            onMount: function (m, close) {
              m.querySelector('[data-ok]').onclick = close;
            },
          });
        } else {
          toast(msg, 'fa-brands fa-whatsapp');
        }
      };
      host.appendChild(chip);
      return chip;
    }

    async function paint() {
      var chip = ensureChip();
      if (!chip) return;
      var label = chip.querySelector('[data-l]');
      var state = 'unk';
      var msg = 'Checking WhatsApp connection…';
      try {
        // Prefer topbar badge state if shell already painted it
        var tb = document.getElementById('tb-wa-status-btn');
        if (tb) {
          if (tb.classList.contains('wa-linked') || tb.classList.contains('wa-platform')) {
            state = 'ok';
            msg = 'WhatsApp is linked. Customer receipts can send.';
          } else if (tb.classList.contains('wa-offline') || tb.classList.contains('wa-auth-failure')) {
            state = 'bad';
            msg = 'WhatsApp is not connected. Open Settings → WhatsApp and scan QR / reconnect.';
          } else if (tb.classList.contains('wa-qr') || tb.classList.contains('wa-starting') || tb.classList.contains('wa-syncing')) {
            state = 'unk';
            msg = 'WhatsApp is connecting or waiting for QR scan.';
          }
        }
        // Optional live poll (throttled)
        if (state === 'unk' && global.RS_API && typeof RS_API.data === 'function' && navigator.onLine !== false) {
          var last = Number(chip.getAttribute('data-poll') || 0);
          if (Date.now() - last > 45000) {
            chip.setAttribute('data-poll', String(Date.now()));
            try {
              var res = await RS_API.data({ operation: 'gateway_status' });
              var st = String((res && (res.status || res.state || res.connected)) || '').toLowerCase();
              if (st === 'true' || st === 'connected' || st === 'open' || st === 'ready' || res.connected === true) {
                state = 'ok';
                msg = 'WhatsApp gateway is online. Receipts can send.';
              } else if (st === 'qr' || st === 'pairing') {
                state = 'unk';
                msg = 'Scan WhatsApp QR in Settings to finish linking.';
              } else if (st) {
                state = 'bad';
                msg = 'WhatsApp offline (' + st + '). Reconnect in Settings → WhatsApp.';
              }
            } catch (_) {
              /* keep unk */
            }
          }
        }
      } catch (_) {}
      chip.className = state === 'ok' ? 'is-ok' : state === 'bad' ? 'is-bad' : 'is-unk';
      chip.setAttribute('data-msg', msg);
      if (label) {
        label.textContent = state === 'ok' ? 'WA OK' : state === 'bad' ? 'WA off' : 'WA…';
      }
      chip.title = msg;
    }

    paint();
    setInterval(paint, 20000);
    document.addEventListener('rs:hydrated', function () {
      setTimeout(paint, 800);
    });
  }

  /* ---------- Analytics → Reports clarity ---------- */
  function installReportsAnalyticsBridge() {
    // When Trends/Analytics opens, show a strip pointing to daily Reports + CA pack
    document.addEventListener(
      'click',
      function (ev) {
        var a = ev.target && ev.target.closest && ev.target.closest('[data-tab="analytics-tab"]');
        if (!a) return;
        setTimeout(function () {
          var tab = document.getElementById('analytics-tab');
          if (!tab || tab.querySelector('#rs-fx-trends-hint')) return;
          var hint = document.createElement('div');
          hint.id = 'rs-fx-trends-hint';
          hint.style.cssText =
            'margin:10px 12px;padding:12px 14px;border-radius:12px;border:1px solid var(--stroke-2);' +
            'background:var(--glass);font-size:13px;line-height:1.45;display:flex;flex-wrap:wrap;gap:10px;align-items:center';
          hint.innerHTML =
            '<div style="flex:1;min-width:200px"><b>Trends</b> = longer history. For today\'s sales, tax &amp; accountant file use <b>Reports → CA pack</b>.</div>' +
            '<button type="button" class="btn btn-primary btn-sm" id="rs-fx-goto-reports"><i class="fa-solid fa-file-invoice"></i> Open Reports</button>';
          tab.insertBefore(hint, tab.firstChild);
          var b = hint.querySelector('#rs-fx-goto-reports');
          if (b) {
            b.onclick = function () {
              if (global.RS && RS.activateTab) RS.activateTab('reports-tab');
              markActivation('reports');
            };
          }
        }, 200);
      },
      true
    );
  }

  /* ---------- Session outlet guard (multi-tab safety) ---------- */
  function installSessionGuard() {
    if (isPlatform()) return;
    injectStyles();
    // Pin this tab's outlet so we detect remember-blob / other-tab drift
    try {
      var s0 = global.RS_API && RS_API.session && RS_API.session();
      if (s0 && s0.tenant_slug) {
        sessionStorage.setItem('rs_tab_outlet_pin', String(s0.tenant_slug));
        sessionStorage.setItem('rs_tab_token_pin', String(s0.tenant_session_token || s0.session_token || s0.token || '').slice(0, 24));
      }
    } catch (_) {}

    function showGuard(tabSlug, blobSlug) {
      if (sessionStorage.getItem(SESSION_GUARD_KEY) === '1') return;
      if (document.getElementById('rs-fx-guard')) return;
      var bar = document.createElement('div');
      bar.id = 'rs-fx-guard';
      bar.innerHTML =
        '<span><i class="fa-solid fa-triangle-exclamation"></i> This tab is <b>' +
        tabSlug +
        '</b> but another login saved <b>' +
        blobSlug +
        '</b>. Do not bill the wrong outlet — open a private window per restaurant.</span>' +
        '<button type="button" id="rs-fx-guard-ok" style="background:#fff;color:#7f1d1d">I understand</button>' +
        '<button type="button" id="rs-fx-guard-reload" style="background:transparent;color:#fff;border:1px solid #fff">Reload this tab</button>';
      document.body.appendChild(bar);
      bar.querySelector('#rs-fx-guard-ok').onclick = function () {
        bar.remove();
        try {
          sessionStorage.setItem(SESSION_GUARD_KEY, '1');
        } catch (_) {}
      };
      bar.querySelector('#rs-fx-guard-reload').onclick = function () {
        location.reload();
      };
    }

    function check() {
      try {
        var sess = global.RS_API && RS_API.session && RS_API.session();
        if (!sess || !sess.tenant_slug) return;
        var tabSlug = String(sess.tenant_slug || sessionStorage.getItem('tenant_slug') || '');
        var pin = sessionStorage.getItem('rs_tab_outlet_pin') || tabSlug;
        // Session in this tab mutated unexpectedly (another script wrote sessionStorage)
        if (pin && tabSlug && pin !== tabSlug) {
          showGuard(tabSlug, pin + ' (was)');
          return;
        }
        var blobRaw = null;
        try {
          blobRaw = localStorage.getItem('rs_remembered_session_v1');
        } catch (_) {}
        if (!blobRaw) {
          var g0 = document.getElementById('rs-fx-guard');
          if (g0 && !sessionStorage.getItem(SESSION_GUARD_KEY)) g0.remove();
          return;
        }
        var blob = JSON.parse(blobRaw);
        var blobSlug = String((blob && (blob.tenant_slug || blob.slug)) || '');
        if (!blobSlug || !tabSlug || blobSlug === tabSlug) {
          var g = document.getElementById('rs-fx-guard');
          if (g) g.remove();
          return;
        }
        showGuard(tabSlug, blobSlug);
      } catch (_) {}
    }
    check();
    setInterval(check, 5000);
    window.addEventListener('storage', function (e) {
      if (e && (e.key === 'rs_remembered_session_v1' || (e.key && e.key.indexOf('tenant') >= 0))) check();
    });
  }

  /* ---------- CA pack (reports helper) ---------- */
  function downloadCaPack() {
    try {
      // Trigger GSTR if present
      var gstr = document.getElementById('btn-download-gstr');
      if (gstr) gstr.click();
      // Day pack if available
      setTimeout(function () {
        try {
          if (typeof global.RS_exportDayPack === 'function') global.RS_exportDayPack();
          else {
            var day = document.getElementById('rs-day-pack');
            if (day) day.click();
          }
        } catch (_) {}
      }, 400);
      markActivation('reports');
      toast('CA pack: GSTR CSV + day sales export', 'fa-file-zipper');
    } catch (e) {
      toast('Open Reports, then use Download GSTR CSV', 'fa-circle-info');
      if (global.RS && RS.activateTab) RS.activateTab('reports-tab');
    }
  }

  function injectCaPackOnReports() {
    var tab = document.getElementById('reports-tab');
    if (!tab || tab.querySelector('#rs-fx-ca-pack')) return;
    var toolbar = tab.querySelector('.toolbar-row');
    if (!toolbar) return;
    var btn = document.createElement('button');
    btn.type = 'button';
    btn.id = 'rs-fx-ca-pack';
    btn.className = 'btn btn-primary btn-sm';
    btn.innerHTML = '<i class="fa-solid fa-file-zipper"></i> CA pack';
    btn.title = 'Download GSTR CSV + day sales for your accountant';
    btn.onclick = downloadCaPack;
    toolbar.appendChild(btn);
  }

  /* ---------- Hook bill settled ---------- */
  function wireBillHooks() {
    document.addEventListener('rs:bill-settled', function () {
      markActivation('firstBill');
      maybeProgressiveUnlock();
      paintPosEmptyCoach();
    });
    document.addEventListener('rs:checkout-complete', function () {
      markActivation('firstBill');
      maybeProgressiveUnlock();
    });
    // Poll bills length lightly after hydrate
    var last = billCount();
    setInterval(function () {
      var n = billCount();
      if (n > last) {
        last = n;
        markActivation('firstBill');
        maybeProgressiveUnlock();
      }
    }, 12000);
  }

  /* ---------- Learn-by-doing (customer checklist) ---------- */
  function openLearnChecklist() {
    if (typeof global.openDemoScript === 'function' && global.RSDemoScript) {
      // Temporarily allow for all owners
      try {
        sessionStorage.setItem('rs_learn_mode', '1');
      } catch (_) {}
    }
    var steps = [
      'Open POS and confirm dishes appear',
      'Add 1–2 items and complete a Cash or UPI bill',
      'Open Bills history and find that bill',
      'Open Reports → CA pack',
      'Optional: switch mode to Tables for floor/QR',
    ];
    if (global.RSModal && typeof RSModal.open === 'function') {
      global.RSModal.open({
        title: 'Learn by doing',
        icon: 'fa-graduation-cap',
        size: 'sm',
        body:
          '<ol style="margin:0;padding-left:18px;font-size:13.5px;line-height:1.55">' +
          steps.map(function (s) {
            return '<li style="margin-bottom:8px">' + s + '</li>';
          }).join('') +
          '</ol>',
        foot: '<button type="button" class="btn btn-primary" data-ok style="flex:1">Start on POS</button>',
        onMount: function (modal, close) {
          modal.querySelector('[data-ok]').onclick = function () {
            close();
            if (global.RS && RS.activateTab) RS.activateTab('pos-tab');
          };
        },
      });
    } else {
      toast('Tip: POS → bill → Bills → Reports', 'fa-graduation-cap');
    }
  }

  function injectLearnEntry() {
    if (isPlatform() || !isOwnerLike()) return;
    var help = document.getElementById('open-product-guide-btn');
    if (!help || document.getElementById('rs-fx-learn')) return;
    var btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'sb-foot-btn';
    btn.id = 'rs-fx-learn';
    btn.title = 'Learn by doing';
    btn.innerHTML = '<i class="fa-solid fa-graduation-cap"></i><span>Learn</span>';
    btn.onclick = function (e) {
      e.preventDefault();
      openLearnChecklist();
    };
    help.parentNode.insertBefore(btn, help);
  }

  /* ---------- Boot ---------- */
  function boot() {
    if (isPlatform()) return;
    injectStyles();
    applyModeNav();
    paintModeSwitcher();
    paintActivationChecklist();
    paintPosEmptyCoach();
    injectLearnEntry();
    injectCaPackOnReports();
    ensureOwnerWaDefaults();
    installSessionGuard();
    installGatewayHealthChip();
    installReportsAnalyticsBridge();
    wireBillHooks();
    wireReportsActivation();
    maybeSoftOpenShift();
    // Welcome after hydrate settles
    setTimeout(function () {
      showWelcomeIfNeeded();
      paintPosEmptyCoach();
      applyModeNav();
      paintModeSwitcher();
      maybeProgressiveUnlock();
      maybeSoftOpenShift();
      // Re-paint checklist in case bills/reports already done this session
      paintActivationChecklist();
    }, 900);
  }

  // Public API
  global.RSFrictionless = {
    loadStartSellingPack: loadStartSellingPack,
    setMode: setMode,
    getMode: getMode,
    markActivation: markActivation,
    downloadCaPack: downloadCaPack,
    openLearnChecklist: openLearnChecklist,
    applyModeNav: applyModeNav,
    closeAllModals: closeAllModals,
  };
  global.RS_exportDayPack =
    global.RS_exportDayPack ||
    function () {
      var b = document.getElementById('rs-day-pack');
      if (b) b.click();
    };

  function onReady() {
    try {
      boot();
    } catch (e) {
      console.warn('[Frictionless] boot', e);
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', function () {
      setTimeout(onReady, 600);
    });
  } else {
    setTimeout(onReady, 600);
  }
  document.addEventListener('rs:ready', function () {
    setTimeout(onReady, 200);
  });
  document.addEventListener('rs:hydrated', function () {
    setTimeout(function () {
      paintPosEmptyCoach();
      paintActivationChecklist();
      applyModeNav();
      injectCaPackOnReports();
      ensureOwnerWaDefaults();
      maybeProgressiveUnlock();
      showWelcomeIfNeeded();
    }, 300);
  });
  // Re-apply mode when role tabs change
  document.addEventListener('rs:role-updated', function () {
    applyModeNav();
  });
  // When reports tab painted
  var mo;
  try {
    mo = new MutationObserver(function () {
      injectCaPackOnReports();
    });
    if (document.body) {
      mo.observe(document.body, { childList: true, subtree: true });
    }
  } catch (_) {}
})(typeof window !== 'undefined' ? window : globalThis);
