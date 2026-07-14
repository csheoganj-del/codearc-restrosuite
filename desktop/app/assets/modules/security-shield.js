/* ============================================================
   RestroSuite — System UI shield (devtools / right-click / inspect)
   ------------------------------------------------------------
   Always-on for staff surfaces. Not user-configurable in Settings.
   Raises the bar against casual copy / Inspect in the browser UI.
   Real security remains auth, encryption, RLS, and lease signatures.
   DevTools can still be opened from outside the page (browser menu).

   Escape hatch for developers only: ?debug=1 or session rs_debug_ui=1
   (session-only; never saved as a restaurant setting).
   ============================================================ */
(function (global) {
  'use strict';

  var DEFAULTS = {
    enabled: true,
    blockContextMenu: true,
    blockDevShortcuts: true,
    blockSelect: false, // keep false so POS can select phone numbers etc.
    warnOnDevtools: false,
  };

  var cfg = Object.assign({}, DEFAULTS);

  // Developer escape only — session/query, never a Settings toggle or localStorage flag
  try {
    if (new URLSearchParams(location.search).get('debug') === '1') cfg.enabled = false;
    if (sessionStorage.getItem('rs_debug_ui') === '1') cfg.enabled = false;
  } catch (_) {}

  // Clear any legacy "user turned shield off" preference so staff cannot leave it disabled
  try {
    localStorage.removeItem('rs_security_shield_v1');
    localStorage.removeItem('rs_security_shield_off');
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
        e.preventDefault();
        e.stopPropagation();
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

  var installed = false;
  function install() {
    if (installed) return;
    installed = true;
    document.addEventListener('contextmenu', onContextMenu, true);
    document.addEventListener('keydown', onKeyDown, true);
    document.addEventListener('selectstart', onSelectStart, true);
    document.addEventListener(
      'dragstart',
      function (e) {
        if (!cfg.enabled) return;
        if (e.target && e.target.tagName === 'IMG') e.preventDefault();
      },
      true
    );
  }

  // setEnabled is a no-op for turning off — system policy is always on for staff.
  // Kept for API compatibility; only re-enables if something called setEnabled(true).
  function setEnabled(on) {
    if (on) cfg.enabled = true;
  }

  function configure(partial) {
    // Ignore attempts to disable core protections from app code
    var next = Object.assign({}, partial || {});
    delete next.enabled;
    cfg = Object.assign(cfg, next, { enabled: cfg.enabled });
  }

  global.RSSecurityShield = {
    install: install,
    setEnabled: setEnabled,
    configure: configure,
    getConfig: function () {
      return Object.assign({}, cfg);
    },
    /** Internal note — not shown in Settings UI */
    disclaimer:
      'System UI shield is always active on staff consoles. Real protection is auth, encryption, and server rules.',
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
