/* ============================================================
   RestroSuite — Operating mode (kitchen & billing style)
   ------------------------------------------------------------
   full             → KDS + optional KOT print, kitchen queue
   kitchen_printer  → No KDS screen; thermal KOT is the kitchen
   billing_only     → Cart + bill + pay only; nothing to kitchen
   ============================================================ */
(function (global) {
  'use strict';

  var SENT_PREFIX = 'rs_kot_sent_v1:';
  var LAST_KOT_PREFIX = 'rs_kot_last_v1:';

  var LABELS = {
    full: 'Full ops (KDS + kitchen)',
    kitchen_printer: 'Kitchen printer only',
    billing_only: 'Billing only',
  };

  function settings() {
    return global.RS_SETTINGS || {};
  }

  function truthy(v) {
    return v === true || v === 'true' || v === 1 || v === '1';
  }

  /** Normalize stored setting / legacy POS-only into one of three modes. */
  function getMode() {
    var s = settings();
    var raw = String(s.set_operating_mode || s.set_kitchen_billing_style || '').trim().toLowerCase();

    if (raw.indexOf('billing') >= 0 || raw === 'pos_only' || raw === 'pos-only') {
      return 'billing_only';
    }
    if (raw.indexOf('printer') >= 0 || raw === 'kitchen_printer' || raw === 'print_only') {
      return 'kitchen_printer';
    }
    if (raw.indexOf('full') >= 0 || raw.indexOf('kds') >= 0) {
      return 'full';
    }

    // Legacy toggle: POS-only mode
    if (truthy(s.set_pos_only_mode)) return 'billing_only';

    // Vertical defaults (retail / salon / clinic have no kitchen)
    try {
      if (global.RS_SAAS && typeof RS_SAAS.features === 'function') {
        var f = RS_SAAS.features() || {};
        if (f.kds === false && f.kotPrint === false) return 'billing_only';
      }
    } catch (_) {}

    return 'full';
  }

  function isBillingOnly() {
    return getMode() === 'billing_only';
  }
  function isKitchenPrinterOnly() {
    return getMode() === 'kitchen_printer';
  }
  function isFullOps() {
    return getMode() === 'full';
  }

  /** Kitchen Display tab / live cooking queue */
  function usesKds() {
    return getMode() === 'full';
  }

  /** Thermal KOT print is available / expected */
  function usesKitchenPrint() {
    var m = getMode();
    if (m === 'billing_only') return false;
    if (m === 'kitchen_printer') return true;
    // full: respect auto-print / explicit kitchen print preference (default on)
    var s = settings();
    if (s.set_auto_print_kot === false || s.set_auto_print_kot === 'false') {
      // still allow manual print in full mode
      return true;
    }
    return true;
  }

  /** Queue tickets into pending_orders for KDS / kitchen role screens */
  function usesKitchenQueue() {
    return getMode() === 'full';
  }

  /** Auto-fire print when staff taps KOT (kitchen_printer defaults ON) */
  function autoPrintKot() {
    var s = settings();
    if (getMode() === 'billing_only') return false;
    if (s.set_auto_print_kot === false || s.set_auto_print_kot === 'false') return false;
    if (s.set_auto_print_kot === true || s.set_auto_print_kot === 'true') return true;
    // Default: kitchen printer mode auto-prints; full mode also defaults on in settings UI
    return true;
  }

  function shouldWarnKotOnCheckout() {
    // Billing-only never needs a kitchen fire
    if (isBillingOnly()) return false;
    return true;
  }

  function kitchenPrinterName() {
    var s = settings();
    var n = String(s.set_kitchen_printer_name || s.set_kot_printer_name || '').trim();
    return n || '';
  }

  function receiptPrinterName() {
    var s = settings();
    return String(s.set_preferred_printer_name || '').trim();
  }

  function kitchenStationLabel() {
    var s = settings();
    return String(s.set_kitchen_station_label || 'Main kitchen').trim() || 'Main kitchen';
  }

  function kotCopies() {
    var s = settings();
    var n = parseInt(String(s.set_kot_copies || '1'), 10);
    if (!isFinite(n) || n < 1) n = 1;
    if (n > 5) n = 5;
    return n;
  }

  function modeLabel(mode) {
    return LABELS[mode || getMode()] || LABELS.full;
  }

  /** Keep settings store consistent when saving (migrate legacy). */
  function normalizeStore(store) {
    var st = store || settings();
    var mode = (function () {
      var raw = String(st.set_operating_mode || '').trim().toLowerCase();
      if (raw.indexOf('billing') >= 0) return 'billing_only';
      if (raw.indexOf('printer') >= 0) return 'kitchen_printer';
      if (raw.indexOf('full') >= 0 || raw.indexOf('kds') >= 0) return 'full';
      if (truthy(st.set_pos_only_mode)) return 'billing_only';
      return getMode();
    })();
    st.set_operating_mode = LABELS[mode] || LABELS.full;
    st.set_pos_only_mode = mode === 'billing_only';
    return st;
  }

  /* ---------- Delta KOT (ADD / VOID) tracking ---------- */

  function lineKey(item) {
    if (!item) return '';
    var id = item.id != null ? String(item.id) : '';
    var name = String(item.name || '').trim().toLowerCase();
    var note = String(item.note || item.notes || '').trim().toLowerCase();
    var portion = String(item.portion || item.size || '').trim().toLowerCase();
    return [id || name, portion, note].join('|');
  }

  function tableSessionKey(meta) {
    var m = meta || {};
    var table = String(m.table || m.tableNumber || 'walk-in').trim().toLowerCase();
    var ot = String(m.orderType || m.type || '').trim().toLowerCase();
    return table + '::' + ot;
  }

  function loadMap(key) {
    try {
      var raw = localStorage.getItem(SENT_PREFIX + key);
      if (!raw) return {};
      var o = JSON.parse(raw);
      return o && typeof o === 'object' ? o : {};
    } catch (_) {
      return {};
    }
  }

  function saveMap(key, map) {
    try {
      localStorage.setItem(SENT_PREFIX + key, JSON.stringify(map || {}));
    } catch (_) {}
  }

  function clearSentMap(meta) {
    var key = tableSessionKey(meta);
    try {
      localStorage.removeItem(SENT_PREFIX + key);
      localStorage.removeItem(LAST_KOT_PREFIX + key);
    } catch (_) {}
  }

  /**
   * Diff current cart items against last kitchen fire.
   * Returns { adds, voids, isFirst, sessionKey, nextMap }
   */
  function diffItems(items, meta) {
    var sessionKey = tableSessionKey(meta);
    var prev = loadMap(sessionKey);
    var next = {};
    var curList = Array.isArray(items) ? items : [];
    curList.forEach(function (i) {
      var k = lineKey(i);
      if (!k) return;
      var q = Math.max(0, Number(i.qty) || 0);
      if (q <= 0) return;
      next[k] = (next[k] || 0) + q;
      if (!next._meta) next._meta = {};
      // keep display name for print
      if (!next._names) next._names = {};
      next._names[k] = i.name || k;
      next._notes = next._notes || {};
      next._notes[k] = i.note || i.notes || '';
    });

    // Strip internal helpers for qty map
    var nextQty = {};
    Object.keys(next).forEach(function (k) {
      if (k.charAt(0) === '_') return;
      nextQty[k] = next[k];
    });
    var names = next._names || {};
    var notes = next._notes || {};

    var adds = [];
    var voids = [];
    var prevKeys = Object.keys(prev).filter(function (k) {
      return k.charAt(0) !== '_';
    });
    var isFirst = prevKeys.length === 0;

    Object.keys(nextQty).forEach(function (k) {
      var before = Number(prev[k]) || 0;
      var after = Number(nextQty[k]) || 0;
      var delta = after - before;
      if (delta > 0) {
        adds.push({
          key: k,
          name: names[k] || k.split('|')[0],
          qty: delta,
          note: notes[k] || '',
          notes: notes[k] || '',
        });
      } else if (delta < 0) {
        voids.push({
          key: k,
          name: names[k] || (prev._names && prev._names[k]) || k.split('|')[0],
          qty: Math.abs(delta),
          note: notes[k] || '',
          notes: notes[k] || '',
        });
      }
    });
    prevKeys.forEach(function (k) {
      if (nextQty[k] != null) return;
      var before = Number(prev[k]) || 0;
      if (before > 0) {
        voids.push({
          key: k,
          name: (prev._names && prev._names[k]) || k.split('|')[0],
          qty: before,
          note: (prev._notes && prev._notes[k]) || '',
          notes: (prev._notes && prev._notes[k]) || '',
        });
      }
    });

    var nextMap = Object.assign({}, nextQty, { _names: names, _notes: notes });
    return { adds: adds, voids: voids, isFirst: isFirst, sessionKey: sessionKey, nextMap: nextMap };
  }

  function commitSentMap(diff) {
    if (!diff || !diff.sessionKey) return;
    saveMap(diff.sessionKey, diff.nextMap || {});
    try {
      localStorage.setItem(
        LAST_KOT_PREFIX + diff.sessionKey,
        JSON.stringify({ at: Date.now(), adds: (diff.adds || []).length, voids: (diff.voids || []).length })
      );
    } catch (_) {}
  }

  /** Apply nav / button visibility for current mode */
  function applyUi() {
    var mode = getMode();
    var billing = mode === 'billing_only';
    var printerOnly = mode === 'kitchen_printer';
    var hideKds = billing || printerOnly;

    document.documentElement.classList.toggle('rs-pos-only-mode', billing);
    document.documentElement.classList.toggle('rs-billing-only-mode', billing);
    document.documentElement.classList.toggle('rs-kitchen-printer-mode', printerOnly);
    document.documentElement.classList.toggle('rs-full-ops-mode', mode === 'full');
    document.documentElement.setAttribute('data-rs-ops-mode', mode);

    document.querySelectorAll('[data-tab="kds-tab"]').forEach(function (el) {
      el.style.display = hideKds ? 'none' : '';
    });

    var kotBtn = document.getElementById('btn-kot');
    if (kotBtn) {
      if (billing) {
        kotBtn.style.display = 'none';
      } else {
        kotBtn.style.display = '';
        // Friendlier label when kitchen is printer-only
        if (printerOnly) {
          var span = kotBtn.querySelector('span:not(.fa-solid):not(i)');
          var label = kotBtn.querySelector('.btn-label, .rs-btn-label');
          if (label) label.textContent = 'Print KOT';
          else if (!kotBtn.querySelector('i') || kotBtn.childNodes.length <= 2) {
            // leave icon; ensure title
          }
          kotBtn.setAttribute('title', 'Print kitchen ticket (thermal)');
          kotBtn.setAttribute('aria-label', 'Print kitchen ticket');
        } else {
          kotBtn.setAttribute('title', 'Send KOT to kitchen');
          kotBtn.setAttribute('aria-label', 'Send KOT');
        }
      }
    }

    // Optional chip in topbar
    try {
      paintModeChip(mode);
    } catch (_) {}
  }

  function paintModeChip(mode) {
    if (mode === 'full') {
      var old = document.getElementById('rs-ops-mode-chip');
      if (old) old.style.display = 'none';
      return;
    }
    var host =
      document.getElementById('tb-left') ||
      document.querySelector('.topbar-right, .topbar-actions, .topbar');
    if (!host) return;
    var chip = document.getElementById('rs-ops-mode-chip');
    if (!chip) {
      chip = document.createElement('button');
      chip.type = 'button';
      chip.id = 'rs-ops-mode-chip';
      chip.className = 'rs-ops-mode-chip';
      chip.style.cssText =
        'border:1px solid rgba(0,0,0,.08);background:rgba(251,191,36,.12);color:#92400e;' +
        'border-radius:999px;padding:4px 10px;font-size:11px;font-weight:700;cursor:pointer;' +
        'display:inline-flex;align-items:center;gap:6px;margin-left:6px;';
      chip.onclick = function () {
        try {
          if (global.RS && RS.activateTab) {
            global.__rsOpenSettingsSection = 'printer';
            RS.activateTab('settings-tab');
          }
        } catch (_) {}
      };
      host.appendChild(chip);
    }
    chip.style.display = 'inline-flex';
    if (mode === 'billing_only') {
      chip.innerHTML = '<i class="fa-solid fa-receipt"></i> Billing only';
      chip.title = 'No kitchen tickets — add items and print the bill';
      chip.style.background = 'rgba(59,130,246,.1)';
      chip.style.color = '#1d4ed8';
    } else {
      chip.innerHTML = '<i class="fa-solid fa-print"></i> Kitchen printer';
      chip.title = 'No KDS — kitchen runs from thermal KOT slips';
      chip.style.background = 'rgba(251,191,36,.12)';
      chip.style.color = '#92400e';
    }
  }

  // Back-compat alias used by older call sites
  function applyPosOnlyModeUI() {
    applyUi();
  }

  var api = {
    LABELS: LABELS,
    getMode: getMode,
    isBillingOnly: isBillingOnly,
    isKitchenPrinterOnly: isKitchenPrinterOnly,
    isFullOps: isFullOps,
    usesKds: usesKds,
    usesKitchenPrint: usesKitchenPrint,
    usesKitchenQueue: usesKitchenQueue,
    autoPrintKot: autoPrintKot,
    shouldWarnKotOnCheckout: shouldWarnKotOnCheckout,
    kitchenPrinterName: kitchenPrinterName,
    receiptPrinterName: receiptPrinterName,
    kitchenStationLabel: kitchenStationLabel,
    kotCopies: kotCopies,
    modeLabel: modeLabel,
    normalizeStore: normalizeStore,
    lineKey: lineKey,
    tableSessionKey: tableSessionKey,
    diffItems: diffItems,
    commitSentMap: commitSentMap,
    clearSentMap: clearSentMap,
    applyUi: applyUi,
    applyPosOnlyModeUI: applyPosOnlyModeUI,
  };

  global.RSOpsMode = api;
  // Legacy global used by dashboard settings save
  global.RS_applyPosOnlyModeUI = applyUi;
  global.RS_applyOpsModeUI = applyUi;

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', function () {
      setTimeout(applyUi, 200);
    });
  } else {
    setTimeout(applyUi, 200);
  }
  document.addEventListener('rs:hydrated', function () {
    setTimeout(applyUi, 50);
  });
})(typeof window !== 'undefined' ? window : globalThis);
