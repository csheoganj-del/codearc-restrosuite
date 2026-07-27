/**
 * Canonical staff roles + module tabs (browser).
 * Keep in sync with supabase/functions/_shared/role-defaults.ts
 */
(function (root) {
  'use strict';

  var ALL_MODULE_TABS = [
    'pos-tab', 'floor-tab', 'qr-orders-tab', 'kds-tab', 'bills-tab',
    'inventory-tab', 'editor-tab', 'customers-tab', 'tax-tab', 'aggregator-tab',
    'tokens-tab', 'employees-tab', 'growth-hub-tab', 'analytics-tab', 'reports-tab'
  ];

  var LEGACY_TAB_ALIASES = {
    'crm-tab': 'customers-tab',
    'online-tab': 'aggregator-tab',
    'online-orders-tab': 'aggregator-tab'
  };

  var ROLE_DEFAULT_TABS = {
    admin: ALL_MODULE_TABS.slice(),
    manager: [
      'pos-tab', 'floor-tab', 'qr-orders-tab', 'kds-tab', 'bills-tab',
      'inventory-tab', 'editor-tab', 'customers-tab', 'reports-tab',
      'analytics-tab', 'employees-tab', 'growth-hub-tab', 'aggregator-tab', 'tax-tab'
    ],
    cashier: ['pos-tab', 'floor-tab', 'bills-tab', 'customers-tab'],
    waiter: ['pos-tab', 'floor-tab', 'kds-tab'],
    captain: ['pos-tab', 'floor-tab', 'kds-tab', 'qr-orders-tab'],
    kitchen: ['kds-tab'],
    inventory: ['inventory-tab', 'editor-tab', 'reports-tab'],
    customer_display: ['tokens-tab']
  };

  var ROLE_LABELS = {
    admin: 'Administrator',
    manager: 'Manager',
    cashier: 'Cashier',
    waiter: 'Waiter',
    captain: 'Captain',
    kitchen: 'Kitchen Staff',
    inventory: 'Inventory Manager',
    customer_display: 'Customer Display',
    owner: 'Outlet Owner'
  };

  var ROLE_HOME_TAB = {
    cashier: 'pos-tab',
    waiter: 'floor-tab',
    captain: 'floor-tab',
    kitchen: 'kds-tab',
    inventory: 'inventory-tab',
    manager: 'pos-tab',
    customer_display: 'tokens-tab',
    admin: 'pos-tab'
  };

  var STAFF_TAB_OPTIONS = [
    { id: 'pos-tab', label: 'POS / Billing', icon: 'fa-cash-register' },
    { id: 'floor-tab', label: 'Floor / Tables', icon: 'fa-border-all' },
    { id: 'kds-tab', label: 'Kitchen (KDS)', icon: 'fa-fire-burner' },
    { id: 'qr-orders-tab', label: 'QR Orders', icon: 'fa-qrcode' },
    { id: 'bills-tab', label: 'Bills history', icon: 'fa-receipt' },
    { id: 'customers-tab', label: 'Customers', icon: 'fa-users' },
    { id: 'inventory-tab', label: 'Inventory', icon: 'fa-boxes-stacked' },
    { id: 'editor-tab', label: 'Menu editor', icon: 'fa-utensils' },
    { id: 'reports-tab', label: 'Reports', icon: 'fa-chart-line' },
    { id: 'analytics-tab', label: 'Analytics', icon: 'fa-chart-pie' },
    { id: 'employees-tab', label: 'Team / HR', icon: 'fa-id-badge' },
    { id: 'growth-hub-tab', label: 'Growth hub', icon: 'fa-rocket' },
    { id: 'aggregator-tab', label: 'Online orders', icon: 'fa-store' },
    { id: 'tax-tab', label: 'Tax', icon: 'fa-percent' },
    { id: 'tokens-tab', label: 'Token display', icon: 'fa-tv' }
  ];

  var ASSIGNABLE_STAFF_ROLES = [
    'manager', 'cashier', 'waiter', 'captain', 'kitchen', 'inventory', 'customer_display'
  ];

  function normalizeTabId(tab) {
    var t = String(tab || '').trim();
    if (!t) return t;
    return LEGACY_TAB_ALIASES[t] || t;
  }

  function normalizeTabs(tabs) {
    if (!Array.isArray(tabs)) return [];
    var out = [];
    var seen = {};
    tabs.forEach(function (raw) {
      var id = normalizeTabId(String(raw));
      if (id && !seen[id]) {
        seen[id] = true;
        out.push(id);
      }
    });
    return out;
  }

  function tabsForRole(role) {
    var key = String(role || '').trim().toLowerCase();
    var list = ROLE_DEFAULT_TABS[key] || ROLE_DEFAULT_TABS.waiter || ['pos-tab'];
    return list.slice();
  }

  var api = {
    ALL_MODULE_TABS: ALL_MODULE_TABS,
    LEGACY_TAB_ALIASES: LEGACY_TAB_ALIASES,
    ROLE_DEFAULT_TABS: ROLE_DEFAULT_TABS,
    ROLE_TAB_MAP: ROLE_DEFAULT_TABS,
    ROLE_LABELS: ROLE_LABELS,
    ROLE_HOME_TAB: ROLE_HOME_TAB,
    STAFF_TAB_OPTIONS: STAFF_TAB_OPTIONS,
    ASSIGNABLE_STAFF_ROLES: ASSIGNABLE_STAFF_ROLES,
    normalizeTabId: normalizeTabId,
    normalizeTabs: normalizeTabs,
    tabsForRole: tabsForRole
  };

  root.RS_ROLE_DEFAULTS = api;
  root.RestroSuite = root.RestroSuite || {};
  root.RestroSuite.roleDefaults = api;
})(typeof globalThis !== 'undefined' ? globalThis : window);
