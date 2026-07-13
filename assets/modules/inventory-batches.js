/* ============================================================
   RestroSuite — Inventory batches + FEFO (first expiry first out)
   Near-expiry alerts · receive with expiry · deduct oldest first
   ============================================================ */
(function (global) {
  'use strict';

  const NEAR_DAYS = 3; // "near expiry" window
  let _batches = [];
  let _loaded = false;
  let _loadPromise = null;

  function toast(msg, icon) {
    if (global.RS && typeof RS.toast === 'function') RS.toast(msg, icon);
  }
  function getInventory() {
    return (global.RS && RS.INVENTORY) || [];
  }
  function startOfDay(d) {
    const x = new Date(d);
    x.setHours(0, 0, 0, 0);
    return x;
  }
  function parseDate(v) {
    if (!v) return null;
    if (v instanceof Date) return Number.isNaN(v.getTime()) ? null : v;
    const s = String(v).trim();
    if (!s) return null;
    // yyyy-mm-dd
    if (/^\d{4}-\d{2}-\d{2}/.test(s)) {
      const d = new Date(s.slice(0, 10) + 'T12:00:00');
      return Number.isNaN(d.getTime()) ? null : d;
    }
    const d = new Date(s);
    return Number.isNaN(d.getTime()) ? null : d;
  }
  function toIsoDate(v) {
    const d = parseDate(v);
    if (!d) return '';
    const pad = (n) => String(n).padStart(2, '0');
    return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate());
  }
  function daysUntil(expiry) {
    const d = parseDate(expiry);
    if (!d) return null;
    const today = startOfDay(new Date());
    const exp = startOfDay(d);
    return Math.round((exp - today) / 86400000);
  }
  function ingredientKey(itemOrName) {
    if (!itemOrName) return '';
    if (typeof itemOrName === 'object') {
      if (itemOrName.key) return String(itemOrName.key).toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '');
      if (itemOrName.name)
        return String(itemOrName.name)
          .toLowerCase()
          .replace(/[^a-z0-9]+/g, '_')
          .replace(/^_|_$/g, '');
      if (itemOrName.id) return String(itemOrName.id);
    }
    return String(itemOrName)
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '_')
      .replace(/^_|_$/g, '');
  }
  function matchBatchToItem(batch, item) {
    if (!batch || !item) return false;
    const bk = String(batch.ingredientKey || batch.ingredient_key || '').toLowerCase();
    const ik = ingredientKey(item);
    if (bk && ik && bk === ik) return true;
    if (batch.invId && item.id && String(batch.invId) === String(item.id)) return true;
    if (batch.ingredientName && item.name) {
      return String(batch.ingredientName).toLowerCase() === String(item.name).toLowerCase();
    }
    return false;
  }

  async function loadBatches(force) {
    if (_loaded && !force) return _batches;
    if (_loadPromise && !force) return _loadPromise;
    _loadPromise = (async () => {
      try {
        if (global.RS_DB && typeof RS_DB.list === 'function') {
          const rows = await RS_DB.list('inventory_batches');
          _batches = Array.isArray(rows) ? rows.slice() : [];
        } else {
          try {
            _batches = JSON.parse(localStorage.getItem('rs_inventory_batches') || '[]');
          } catch (_) {
            _batches = [];
          }
        }
      } catch (e) {
        console.warn('[Batches] load failed', e);
        try {
          _batches = JSON.parse(localStorage.getItem('rs_inventory_batches') || '[]');
        } catch (_) {
          _batches = [];
        }
      }
      _loaded = true;
      return _batches;
    })();
    return _loadPromise;
  }

  function getBatchesSync() {
    return _batches;
  }

  async function saveBatch(batch) {
    if (!batch || !batch.id) throw new Error('batch id required');
    const idx = _batches.findIndex((b) => String(b.id) === String(batch.id));
    if (idx >= 0) _batches[idx] = batch;
    else _batches.push(batch);
    try {
      localStorage.setItem('rs_inventory_batches', JSON.stringify(_batches));
    } catch (_) {}
    try {
      if (global.RS_DB && RS_DB.put) await RS_DB.put('inventory_batches', batch.id, batch);
    } catch (e) {
      console.warn('[Batches] cloud put failed (local kept)', e && e.message);
    }
    return batch;
  }

  async function saveAllLocal() {
    try {
      localStorage.setItem('rs_inventory_batches', JSON.stringify(_batches));
    } catch (_) {}
    if (global.RS_DB && RS_DB.writeLocal) {
      try {
        await RS_DB.writeLocal('inventory_batches', _batches);
      } catch (_) {}
    }
  }

  /**
   * Create a received batch and bump ingredient stock.
   * @param {object} opts { item, qty, unit, expiryDate, receivedDate, source, poId, cost }
   */
  async function receiveBatch(opts) {
    const o = opts || {};
    const item = o.item;
    const qty = Math.max(0, Number(o.qty) || 0);
    if (!item || !(qty > 0)) return null;
    await loadBatches();
    const expiry = toIsoDate(o.expiryDate);
    const received = toIsoDate(o.receivedDate) || toIsoDate(new Date());
    const batch = {
      id: 'bat_' + Date.now().toString(36) + '_' + Math.floor(Math.random() * 1000),
      invId: item.id,
      ingredientKey: ingredientKey(item),
      ingredientName: item.name,
      qty,
      unit: o.unit || item.unit || 'unit',
      expiryDate: expiry || null,
      receivedDate: received,
      source: o.source || 'receive',
      poId: o.poId || null,
      cost: Number(o.cost != null ? o.cost : item.cost) || 0,
      createdAt: new Date().toISOString(),
    };
    await saveBatch(batch);
    return batch;
  }

  /**
   * FEFO deduct qty from batches for an ingredient; returns remaining qty not covered by batches.
   */
  async function deductFefo(item, qty) {
    const need = Math.max(0, Number(qty) || 0);
    if (!item || !(need > 0)) return { deducted: 0, remaining: need, batchesTouched: [] };
    await loadBatches();
    const today = startOfDay(new Date()).getTime();
    // Prefer batches with earliest expiry; undated batches last; expired still usable but first
    const mine = _batches
      .filter((b) => matchBatchToItem(b, item) && Number(b.qty) > 0)
      .slice()
      .sort((a, b) => {
        const da = parseDate(a.expiryDate);
        const db = parseDate(b.expiryDate);
        if (!da && !db) return String(a.receivedDate || '').localeCompare(String(b.receivedDate || ''));
        if (!da) return 1;
        if (!db) return -1;
        return da - db;
      });

    let left = need;
    const touched = [];
    for (const b of mine) {
      if (left <= 0) break;
      const have = Number(b.qty) || 0;
      if (have <= 0) continue;
      const take = Math.min(have, left);
      b.qty = Math.round((have - take) * 1000) / 1000;
      left = Math.round((left - take) * 1000) / 1000;
      touched.push({ id: b.id, take, expiryDate: b.expiryDate, remaining: b.qty });
      try {
        await saveBatch(b);
      } catch (_) {}
    }
    // Drop zero batches from memory (keep record with 0 for audit optional — remove empties)
    _batches = _batches.filter((b) => Number(b.qty) > 0.0001 || !touched.some((t) => t.id === b.id && t.remaining <= 0));
    // Actually keep zeros out
    _batches = _batches.filter((b) => Number(b.qty) > 0.0001);
    await saveAllLocal();
    return { deducted: need - left, remaining: left, batchesTouched: touched };
  }

  function summarizeItem(item) {
    const mine = _batches.filter((b) => matchBatchToItem(b, item) && Number(b.qty) > 0);
    let nearest = null;
    let nearestDays = null;
    let expiredQty = 0;
    let nearQty = 0;
    let batchCount = mine.length;
    mine.forEach((b) => {
      const d = daysUntil(b.expiryDate);
      if (d == null) return;
      if (nearestDays == null || d < nearestDays) {
        nearestDays = d;
        nearest = b;
      }
      if (d < 0) expiredQty += Number(b.qty) || 0;
      else if (d <= NEAR_DAYS) nearQty += Number(b.qty) || 0;
    });
    return {
      batchCount,
      nearestExpiry: nearest && nearest.expiryDate,
      nearestDays,
      expiredQty,
      nearQty,
      useFirstLabel:
        nearest && nearest.expiryDate
          ? nearestDays < 0
            ? 'Expired · use / waste first'
            : nearestDays === 0
              ? 'Expires today · use first'
              : nearestDays === 1
                ? 'Expires tomorrow · use first'
                : 'Use by ' + formatShort(nearest.expiryDate) + ' · FEFO'
          : batchCount
            ? batchCount + ' batch' + (batchCount === 1 ? '' : 'es')
            : '',
      status:
        nearestDays != null && nearestDays < 0
          ? 'expired'
          : nearestDays != null && nearestDays <= NEAR_DAYS
            ? 'near'
            : 'ok',
    };
  }

  function formatShort(iso) {
    const d = parseDate(iso);
    if (!d) return '—';
    try {
      return d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
    } catch (_) {
      return toIsoDate(d);
    }
  }

  function listExpiring(withinDays) {
    const days = withinDays == null ? NEAR_DAYS : withinDays;
    const out = [];
    _batches.forEach((b) => {
      if (!(Number(b.qty) > 0)) return;
      const d = daysUntil(b.expiryDate);
      if (d == null) return;
      if (d <= days) {
        out.push({
          ...b,
          daysLeft: d,
          prettyName: b.ingredientName || b.ingredientKey,
        });
      }
    });
    out.sort((a, b) => a.daysLeft - b.daysLeft);
    return out;
  }

  function batchesForItem(item) {
    return _batches
      .filter((b) => matchBatchToItem(b, item) && Number(b.qty) > 0)
      .slice()
      .sort((a, b) => {
        const da = parseDate(a.expiryDate);
        const db = parseDate(b.expiryDate);
        if (!da && !db) return 0;
        if (!da) return 1;
        if (!db) return -1;
        return da - db;
      });
  }

  /** Rebuild total stock from batches when batches fully track qty (optional). */
  function batchTotalForItem(item) {
    return batchesForItem(item).reduce((a, b) => a + (Number(b.qty) || 0), 0);
  }

  // Warm cache early
  if (typeof document !== 'undefined') {
    document.addEventListener('rs:ready', () => {
      loadBatches(true).catch(() => {});
    });
    setTimeout(() => loadBatches(true).catch(() => {}), 800);
  }

  global.RSInventoryBatches = {
    NEAR_DAYS,
    loadBatches,
    getBatchesSync,
    receiveBatch,
    deductFefo,
    summarizeItem,
    listExpiring,
    batchesForItem,
    batchTotalForItem,
    daysUntil,
    toIsoDate,
    formatShort,
    ingredientKey,
  };
})(typeof window !== 'undefined' ? window : globalThis);
