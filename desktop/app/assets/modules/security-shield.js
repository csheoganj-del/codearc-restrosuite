/* ============================================================
   RestroSuite — System UI shield (devtools / right-click / inspect)
   ------------------------------------------------------------
   Always-on for restaurant staff. Only SaaS Super-Admin can
   enable/disable (Super-Admin Settings). Outlet Settings never
   expose this control.

   Raises the bar against casual copy / Inspect in the browser UI.
   Real security remains auth, encryption, RLS, and lease signatures.

   Dev escape (session only): ?debug=1 or sessionStorage rs_debug_ui=1
   ============================================================ */
(function (global) {
  'use strict';

  const SA_PREF_KEY = 'rs_security_shield_sa_v1';
  const DEFAULTS = {
    enabled: true,
    blockContextMenu: true,
    blockDevShortcuts: true,
    blockSelect: false, // POS may select phone numbers etc.
    warnOnDevtools: false,
  };

  let cfg = Object.assign({}, DEFAULTS);

  function isSuperAdmin() {
    try {
      const s = global.RS_API && typeof global.RS_API.session === 'function' && global.RS_API.session();
      const role = String((s && s.role) || '').toLowerCase().trim();
      return role === 'superadmin' || role === 'super_admin';
    } catch (_) {
      return false;
    }
  }

  /** Superadmin-only local preference. null = use default (on). */
  function loadSaPref() {
    try {
      const raw = localStorage.getItem(SA_PREF_KEY);
      if (raw === '0' || raw === 'false' || raw === 'off') { return false; }
      if (raw === '1' || raw === 'true' || raw === 'on') { return true; }
    } catch (_) {}
    return null;
  }

  function saveSaPref(on) {
    try {
      localStorage.setItem(SA_PREF_KEY, on ? '1' : '0');
    } catch (_) {}
  }

  function hasDevBypass() {
    try {
      if (new URLSearchParams(location.search).get('debug') === '1') { return true; }
      if (sessionStorage.getItem('rs_debug_ui') === '1') { return true; }
    } catch (_) {}
    return false;
  }

  /**
   * Policy:
   * - Non-superadmin staff: always ON (ignore any stored pref / legacy flags)
   * - Superadmin: default ON; can turn off via Super-Admin Settings
   * - ?debug=1 / rs_debug_ui: off for that session (dev only)
   */
  function resolveEnabled() {
    if (hasDevBypass()) { return false; }
    if (!isSuperAdmin()) { return true; }
    const pref = loadSaPref();
    if (pref === null) { return true; }
    return !!pref;
  }

  function refreshEnabled() {
    cfg.enabled = resolveEnabled();
    return cfg.enabled;
  }

  // Drop legacy restaurant-user toggles so staff cannot leave shield off
  try {
    localStorage.removeItem('rs_security_shield_v1');
    localStorage.removeItem('rs_security_shield_off');
  } catch (_) {}

  refreshEnabled();

  function isEditableTarget(t) {
    if (!t || !t.tagName) { return false; }
    const tag = String(t.tagName).toUpperCase();
    if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') { return true; }
    if (t.isContentEditable) { return true; }
    return !!(t.closest && t.closest('input, textarea, select, [contenteditable="true"]'));
  }

  function onContextMenu(e) {
    if (!resolveEnabled() || !cfg.blockContextMenu) { return; }
    if (isEditableTarget(e.target)) { return; }
    e.preventDefault();
    e.stopPropagation();
  }

  function onKeyDown(e) {
    if (!resolveEnabled() || !cfg.blockDevShortcuts) { return; }
    const key = e.key || '';
    const code = e.keyCode || e.which;
    if (key === 'F12' || code === 123) {
      e.preventDefault();
      e.stopPropagation();
      return;
    }
    if (e.ctrlKey || e.metaKey) {
      const k = key.toLowerCase();
      if (e.shiftKey && (k === 'i' || k === 'j' || k === 'c' || k === 'k')) {
        e.preventDefault();
        e.stopPropagation();
        return;
      }
      if (k === 'u' || k === 's') {
        if (k === 's' && isEditableTarget(e.target)) { return; }
        e.preventDefault();
        e.stopPropagation();
      }
    }
  }

  function onSelectStart(e) {
    if (!resolveEnabled() || !cfg.blockSelect) { return; }
    if (isEditableTarget(e.target)) { return; }
    if (e.target && e.target.closest && e.target.closest('.receipt-paper, .data-table, .rs-sales-report, pre, code')) { return; }
    e.preventDefault();
  }

  let installed = false;
  function install() {
    if (installed) { return; }
    installed = true;
    refreshEnabled();
    document.addEventListener('contextmenu', onContextMenu, true);
    document.addEventListener('keydown', onKeyDown, true);
    document.addEventListener('selectstart', onSelectStart, true);
    document.addEventListener(
      'dragstart',
      function (e) {
        if (!resolveEnabled()) { return; }
        if (e.target && e.target.tagName === 'IMG') { e.preventDefault(); }
      },
      true
    );
  }

  /**
   * Super-Admin only. Restaurant roles cannot disable the shield.
   * @returns {boolean} true if preference was applied
   */
  function setEnabled(on) {
    if (!isSuperAdmin()) {
      cfg.enabled = true;
      return false;
    }
    const next = !!on;
    saveSaPref(next);
    cfg.enabled = next;
    return true;
  }

  function configure(partial) {
    const next = Object.assign({}, partial || {});
    delete next.enabled; // never allow silent disable via configure
    cfg = Object.assign(cfg, next);
    refreshEnabled();
  }

  global.RSSecurityShield = {
    install: install,
    setEnabled: setEnabled,
    configure: configure,
    refresh: refreshEnabled,
    isSuperAdminOnly: true,
    canToggle: isSuperAdmin,
    getConfig: function () {
      return Object.assign({}, cfg, { enabled: resolveEnabled() });
    },
    disclaimer:
      'System UI shield is always on for restaurants. Only Super-Admin can toggle it.',
  };

  // Auto-install on staff surfaces only (never on guest QR / public order pages)
  try {
    const path = (location.pathname || '').toLowerCase();
    const isStaff =
      path.indexOf('dashboard') >= 0 ||
      path.indexOf('tokens') >= 0 ||
      path.indexOf('kds') >= 0 ||
      /\/(dashboard|tokens|kds)(\.html)?\/?$/.test(path);
    const isGuest =
      path.indexOf('qr-order') >= 0 ||
      path.indexOf('/order') >= 0 ||
      path.indexOf('order.html') >= 0 ||
      path.indexOf('login') >= 0 ||
      path.indexOf('home') >= 0 ||
      path === '/' ||
      path === '';
    if (isStaff && !isGuest) { install(); }
  } catch (_) {
    /* fail open for staff apps that load this file explicitly */
  }
})(typeof window !== 'undefined' ? window : globalThis);
