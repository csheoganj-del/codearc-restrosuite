/* ============================================================
   RestroSuite — feature toggle defaults (simple café first)
   ------------------------------------------------------------
   Most small restos only need bill + print. Advanced features
   start OFF and turn on via Settings (plug-and-play).

   Missing keys get these defaults. Explicit true/false in saved
   settings always wins.
   ============================================================ */
(function (global) {
  'use strict';

  /**
   * Defaults for NEW / unset keys only.
   * true  = on by default (safe simple ops)
   * false = off until owner enables
   */
  var FEATURE_DEFAULTS = {
    // Tax & promos
    set_calculate_taxes: false,
    set_service_charge: false,
    set_round_off_totals: true,
    set_show_hsn_codes: false,
    set_inclusive_pricing: false,
    set_happy_hour: false,
    set_loyalty_program: false,
    set_pos_promo_codes: false,

    // Printer / kitchen
    set_operating_mode: 'Billing only',
    set_pos_only_mode: true,
    set_auto_print_receipt: false,
    set_auto_print_kot: false,
    set_open_cash_drawer_on_cash: false,
    set_require_open_shift: false,

    // WhatsApp
    set_send_bill_after_payment: false,
    set_auto_send_receipts: false, // alias used in checkout path
    set_order_ready_alerts: false,
    set_promotional_messages: false,

    // Team
    set_require_pin_for_refunds: true,
    set_cashier_can_edit_prices: false,
    set_lock_reports_for_staff: true,

    // Security PIN gates (optional friction — default off)
    set_pin_gate_due: false,
    set_pin_gate_clear_cart: false,
    set_pin_gate_loyalty: false,
    set_pin_gate_cash_move: false,
  };

  function isUnset(v) {
    return v === undefined || v === null || v === '';
  }

  /** Merge defaults into a settings object (does not overwrite explicit values). */
  function applyFeatureDefaults(settings) {
    var out = Object.assign({}, settings || {});
    var keys = Object.keys(FEATURE_DEFAULTS);
    for (var i = 0; i < keys.length; i++) {
      var k = keys[i];
      if (isUnset(out[k])) out[k] = FEATURE_DEFAULTS[k];
    }
    // Keep operating mode + legacy pos-only in sync when mode was defaulted
    try {
      var mode = String(out.set_operating_mode || '').toLowerCase();
      if (mode.indexOf('billing') >= 0) out.set_pos_only_mode = true;
    } catch (_) {}
    return out;
  }

  function truthy(v) {
    return v === true || v === 'true' || v === 1 || v === '1';
  }

  function falsy(v) {
    return v === false || v === 'false' || v === 0 || v === '0';
  }

  /**
   * Read a feature flag with plug-and-play defaults.
   * @param {string} key  e.g. 'set_loyalty_program'
   * @param {object} [settings]
   * @param {boolean} [fallback] used only if key not in FEATURE_DEFAULTS and unset
   */
  function featureOn(key, settings, fallback) {
    var s = settings || global.RS_SETTINGS || {};
    var v = s[key];
    if (falsy(v)) return false;
    if (truthy(v)) return true;
    if (Object.prototype.hasOwnProperty.call(FEATURE_DEFAULTS, key)) {
      return !!FEATURE_DEFAULTS[key];
    }
    return fallback === undefined ? false : !!fallback;
  }

  global.RS_FEATURE_DEFAULTS = FEATURE_DEFAULTS;
  global.RS_applyFeatureDefaults = applyFeatureDefaults;
  global.RS_featureOn = featureOn;

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = {
      FEATURE_DEFAULTS: FEATURE_DEFAULTS,
      applyFeatureDefaults: applyFeatureDefaults,
      featureOn: featureOn,
    };
  }
})(typeof window !== 'undefined' ? window : globalThis);
