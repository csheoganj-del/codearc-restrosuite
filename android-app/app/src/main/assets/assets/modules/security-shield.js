/* ============================================================
   RestroSuite — Client UI shield (devtools / right-click / inspect)
   ------------------------------------------------------------
   Honest scope: this raises the bar against casual copying via
   View Source / Inspect in the browser UI. It is NOT "unhackable".
   Real security is server RLS, lease signatures, auth, and not
   shipping secrets in the client. DevTools can always be opened
   from outside the page (browser menu, other devices, proxies).

   Desktop Electron can go further (menu strip, webPreferences).
   ============================================================ */
(function (global) {
  'use strict';

  var KEY = 'rs_security_shield_v1';
  var DEFAULTS = {
    enabled: true,
    blockContextMenu: true,
    blockDevShortcuts: true,
    blockSelect: false, // keep false so POS can select phone numbers etc.
    warnOnDevtools: false,
  };

  function loadCfg() {
    try {
      var raw = localStorage.getItem(KEY);
      if (!raw) return Object.assign({}, DEFAULTS);
      return Object.assign({}, DEFAULTS, JSON.parse(raw));
    } catch (_) {
      return Object.assign({}, DEFAULTS);
    }
  }

  function saveCfg(cfg) {
    try {
      localStorage.setItem(KEY, JSON.stringify(cfg));
    } catch (_) {}
  }

  var cfg = loadCfg();
  // Superadmin / debug can disable
  try {
    if (new URLSearchParams(location.search).get('debug') === '1') cfg.enabled = false;
    if (sessionStorage.getItem('rs_debug_ui') === '1') cfg.enabled = false;
    if (localStorage.getItem('rs_security_shield_off') === '1') cfg.enabled = false;
  } catch (_) {}

  function isEditableTarget(t) {
    if (!t || !t.tagName) return false;
    var tag = String(t.tagName).toUpperCase();
    if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return true;
    if (t.isContentEditable) return true;
    return !!(t.closest && t.closest('input, textarea, select, [contenteditable="true"]'));
  }

  function onContextMenu(e) {
    if (!cfg.enabled || !cfg.blockContextMenu) return;
    if (isEditableTarget(e.target)) return;
    e.preventDefault();
    e.stopPropagation();
  }

  function onKeyDown(e) {
    if (!cfg.enabled || !cfg.blockDevShortcuts) return;
    var key = e.key || '';
    var code = e.keyCode || e.which;
    // F12
    if (key === 'F12' || code === 123) {
      e.preventDefault();
      e.stopPropagation();
      return;
    }
    // Ctrl+Shift+I / J / C · Ctrl+U · Ctrl+S (save page)
    if (e.ctrlKey || e.metaKey) {
      var k = key.toLowerCase();
      if (e.shiftKey && (k === 'i' || k === 'j' || k === 'c' || k === 'k')) {
        e.preventDefault();
        e.stopPropagation();
        return;
      }
      if (k === 'u' || k === 's') {
        // Allow Ctrl+S only if an input is focused (staff may save drafts in forms via browser)
        if (k === 's' && isEditableTarget(e.target)) return;
        if (k === 'u' || k === 's') {
          e.preventDefault();
          e.stopPropagation();
        }
      }
    }
  }

  function onSelectStart(e) {
    if (!cfg.enabled || !cfg.blockSelect) return;
    if (isEditableTarget(e.target)) return;
    // Allow selection inside receipt / tables for ops
    if (e.target && e.target.closest && e.target.closest('.receipt-paper, .data-table, .rs-sales-report, pre, code')) return;
    e.preventDefault();
  }

  function install() {
    document.addEventListener('contextmenu', onContextMenu, true);
    document.addEventListener('keydown', onKeyDown, true);
    document.addEventListener('selectstart', onSelectStart, true);
    // Drag of images / source sniffing
    document.addEventListener(
      'dragstart',
      function (e) {
        if (!cfg.enabled) return;
        if (e.target && e.target.tagName === 'IMG') e.preventDefault();
      },
      true
    );
  }

  function setEnabled(on) {
    cfg.enabled = !!on;
    saveCfg(cfg);
  }

  function configure( partial ) {
    cfg = Object.assign(cfg, partial || {});
    saveCfg(cfg);
  }

  global.RSSecurityShield = {
    install: install,
    setEnabled: setEnabled,
    configure: configure,
    getConfig: function () {
      return Object.assign({}, cfg);
    },
    /** Truthful note for settings UI */
    disclaimer:
      'Blocks casual right-click and DevTools shortcuts. Does not make the app unhackable — real protection is auth, encryption, and server rules.',
  };

  // Auto-install on staff surfaces only (never on guest QR / public order pages)
  try {
    var path = (location.pathname || '').toLowerCase();
    var isStaff =
      path.indexOf('dashboard') >= 0 ||
      path.indexOf('tokens') >= 0 ||
      path.indexOf('kds') >= 0 ||
      /\/(dashboard|tokens|kds)(\.html)?\/?$/.test(path);
    var isGuest =
      path.indexOf('qr-order') >= 0 ||
      path.indexOf('/order') >= 0 ||
      path.indexOf('order.html') >= 0 ||
      path.indexOf('login') >= 0 ||
      path.indexOf('home') >= 0 ||
      path === '/' ||
      path === '';
    if (isStaff && !isGuest) install();
  } catch (_) {
    /* fail open for staff apps that load this file explicitly */
  }
})(typeof window !== 'undefined' ? window : globalThis);
