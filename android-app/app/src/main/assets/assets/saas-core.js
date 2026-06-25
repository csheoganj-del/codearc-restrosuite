/**
 * RestroSuite SaaS Core — Business Model Abstraction Layer
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
 *   RS_SAAS.vertical            → active vertical config object
 *   RS_SAAS.label(key)          → localised string for this vertical
 *   RS_SAAS.registerVertical(v) → register + activate a new business type
 *   RS_SAAS.is(type)            → check if active vertical === type
 *   RS_SAAS.featureEnabled(f)   → check if a feature is on for this vertical
 */
(function () {
  'use strict';

  /* ── Built-in verticals ─────────────────────────────────────────────── */
  const VERTICALS = {

    restaurant: {
      id: 'restaurant',
      name: 'Restaurant / Café',
      icon: 'fa-utensils',
      currency: 'INR',

      // Label overrides — what to call things in this vertical
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

      // DB collection → display name mapping for this vertical
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

  /* ── Active vertical (resolved from business profile settings) ──────── */
  let _active = 'restaurant';

  function resolveVertical() {
    // Check business profile setting first
    const stored = (window.RS_SETTINGS && window.RS_SETTINGS.set_business_type)
      || (typeof localStorage !== 'undefined' && localStorage.getItem('rs:business_type'))
      || 'restaurant';
    _active = VERTICALS[stored] ? stored : 'restaurant';
    return VERTICALS[_active];
  }

  /* ── Public API ─────────────────────────────────────────────────────── */
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
