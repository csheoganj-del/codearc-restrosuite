
/* === assets/modules/rs-action-feedback.js === */
/**
 * RestroSuite — RSActionFeedback module (Wave 14 UI/UX refinement)
 * ---------------------------------------------------------------
 * Provides safe, non-blocking audio and haptic feedback for key POS/KDS actions
 * (e.g. Add to Cart, Print Bill, KOT Complete).
 *
 * Guarded against:
 *   - Browser autoplay policies (AudioContext state check + resume)
 *   - Missing Web Audio API (try/catch throughout)
 *   - Missing haptic hardware (navigator.vibrate existence check)
 *   - prefers-reduced-motion OS setting (audio and vibration both suppressed)
 */
(function (global) {
  'use strict';

  let audioCtx = null;

  /**
   * Returns true when the user's OS/browser accessibility setting requests
   * reduced motion. Both audio tones and haptic vibration are suppressed
   * in this mode — they share the same motion-based sensory disruption
   * that the user is opting out of.
   *
   * The media query is checked live on every call (not cached at module load)
   * so that changes made while the tab is open take effect immediately.
   */
  function prefersReducedMotion() {
    try {
      return (
        typeof global.matchMedia === 'function' &&
        global.matchMedia('(prefers-reduced-motion: reduce)').matches
      );
    } catch (_) {
      return false;
    }
  }

  function getAudioContext() {
    if (audioCtx) {return audioCtx;}
    try {
      const AudioContext = global.AudioContext || global.webkitAudioContext;
      if (AudioContext) {
        audioCtx = new AudioContext();
      }
    } catch (_) {}
    return audioCtx;
  }

  function playTone(freq, type, duration, vol) {
    // Respect the user's OS "reduce motion" preference — no audio surprises.
    if (prefersReducedMotion()) {return;}
    try {
      const ctx = getAudioContext();
      if (!ctx || ctx.state === 'suspended') {
        if (ctx && ctx.resume) {ctx.resume().catch(function () {});}
      }
      if (!ctx || ctx.state !== 'running') {return;}

      const osc = ctx.createOscillator();
      const gain = ctx.createGain();

      osc.type = type || 'sine';
      osc.frequency.setValueAtTime(freq || 440, ctx.currentTime);

      gain.gain.setValueAtTime(vol || 0.05, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + (duration || 0.1));

      osc.connect(gain);
      gain.connect(ctx.destination);

      osc.start();
      osc.stop(ctx.currentTime + (duration || 0.1));
    } catch (_) {}
  }

  function vibrate(pattern) {
    // Respect the user's OS "reduce motion" preference — no haptic surprises.
    if (prefersReducedMotion()) {return;}
    try {
      if (global.navigator && typeof global.navigator.vibrate === 'function') {
        global.navigator.vibrate(pattern || 30);
      }
    } catch (_) {}
  }

  const RSActionFeedback = {
    /** Light click confirmation — adding an item, toggling a switch. */
    click: function () {
      playTone(600, 'sine', 0.04, 0.03);
      vibrate(15);
    },
    /** Two-tone ascending chime — KOT sent, bill printed, checkout complete. */
    success: function () {
      playTone(800, 'sine', 0.08, 0.04);
      setTimeout(function () { playTone(1200, 'sine', 0.1, 0.04); }, 60);
      vibrate([20, 30, 40]);
    },
    /** Single mid-tone notice — new order arrived, low stock warning. */
    notice: function () {
      playTone(450, 'triangle', 0.06, 0.04);
      vibrate(25);
    },
    /** Low sawtooth buzz — validation error, payment failure. */
    error: function () {
      playTone(300, 'sawtooth', 0.15, 0.05);
      vibrate([50, 50, 50]);
    }
  };

  global.RSActionFeedback = RSActionFeedback;

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = RSActionFeedback;
  }
})(typeof window !== 'undefined' ? window : globalThis);



/* === assets/escpos-encoder.js === */
/* ============================================================
   RestroSuite — ESC/POS encoder (Wave 5)
   Pure text/thermal receipt bytes for raw USB / Windows spool
   ============================================================ */
(function (global) {
  'use strict';

  const ESC = 0x1b;
  const GS = 0x1d;
  const LF = 0x0a;

  function Encoder() {
    this.chunks = [];
  }

  Encoder.prototype._push = function (arr) {
    this.chunks.push(BufferFrom(arr));
    return this;
  };

  function BufferFrom(input) {
    if (typeof Buffer !== 'undefined') {
      if (input instanceof Uint8Array) return Buffer.from(input);
      if (typeof input === 'string') return Buffer.from(input, 'utf8');
      return Buffer.from(input);
    }
    // Browser
    if (typeof input === 'string') {
      const enc = new TextEncoder();
      return enc.encode(input);
    }
    return new Uint8Array(input);
  }

  function concat(chunks) {
    if (typeof Buffer !== 'undefined') return Buffer.concat(chunks.map((c) => Buffer.from(c)));
    let len = 0;
    chunks.forEach((c) => { len += c.length; });
    const out = new Uint8Array(len);
    let off = 0;
    chunks.forEach((c) => { out.set(c, off); off += c.length; });
    return out;
  }

  Encoder.prototype.init = function () {
    return this._push([ESC, 0x40]);
  };

  Encoder.prototype.align = function (mode) {
    // 0 left, 1 center, 2 right
    const m = mode === 'center' ? 1 : mode === 'right' ? 2 : 0;
    return this._push([ESC, 0x61, m]);
  };

  Encoder.prototype.bold = function (on) {
    return this._push([ESC, 0x45, on ? 1 : 0]);
  };

  Encoder.prototype.size = function (width, height) {
    const w = Math.max(0, Math.min(7, (width || 1) - 1));
    const h = Math.max(0, Math.min(7, (height || 1) - 1));
    return this._push([GS, 0x21, (w << 4) | h]);
  };

  Encoder.prototype.text = function (str) {
    return this._push(String(str == null ? '' : str));
  };

  Encoder.prototype.line = function (str) {
    return this.text(String(str == null ? '' : str) + '\n');
  };

  Encoder.prototype.feed = function (n) {
    const times = Math.max(1, n || 1);
    const arr = [];
    for (let i = 0; i < times; i++) arr.push(LF);
    return this._push(arr);
  };

  Encoder.prototype.cut = function () {
    return this._push([GS, 0x56, 0x00]);
  };

  /** Pulse cash drawer (ESC p m t1 t2) — pin 0 = drawer 1, pin 1 = drawer 2 */
  Encoder.prototype.cashDrawer = function (pin) {
    const m = pin === 1 ? 1 : 0;
    return this._push([ESC, 0x70, m, 0x19, 0xfa]);
  };

  Encoder.prototype.hr = function (width) {
    const w = width || 32;
    return this.line('-'.repeat(w));
  };

  Encoder.prototype.encode = function () {
    return concat(this.chunks);
  };

  Encoder.prototype.toBase64 = function () {
    const buf = this.encode();
    if (typeof Buffer !== 'undefined') return Buffer.from(buf).toString('base64');
    let binary = '';
    const bytes = buf instanceof Uint8Array ? buf : new Uint8Array(buf);
    for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
    return btoa(binary);
  };

  /** Build a simple 32-col receipt from bill-like object */
  function receiptFromBill(bill, outlet) {
    const b = bill || {};
    const o = outlet || {};
    const items = Array.isArray(b.items) ? b.items : (b._items || []);
    const enc = new Encoder().init().align('center').bold(true).size(2, 2);
    enc.line(o.name || 'Outlet').size(1, 1).bold(false);
    if (o.address) enc.line(o.address);
    if (o.phone) enc.line('Ph ' + o.phone);
    enc.hr(32).align('left');
    enc.line((b.no || b.orderId || '') + '  ' + (b.time || ''));
    enc.line('Table: ' + (b.table || '--'));
    if (b.customer && b.customer !== 'Walk-in') enc.line('Cust: ' + b.customer);
    enc.hr(32);
    items.forEach((it) => {
      const qty = Number(it.qty) || 1;
      const name = String(it.name || 'Item').slice(0, 18);
      const price = Number(it.price) || 0;
      const lineTotal = (price * qty).toFixed(0);
      const left = qty + 'x ' + name;
      const pad = Math.max(1, 32 - left.length - lineTotal.length);
      enc.line(left + ' '.repeat(pad) + lineTotal);
    });
    enc.hr(32).bold(true);
    const grand = Number(b.grand != null ? b.grand : b.amount != null ? b.amount : b.total) || 0;
    enc.line('TOTAL' + ' '.repeat(Math.max(1, 27 - String(Math.round(grand)).length)) + Math.round(grand));
    enc.bold(false).hr(32).align('center').line('Thank you!').line('CodeArc RestroSuite').feed(3).cut();
    return enc;
  }

  function kotFromItems(items, meta) {
    const m = meta || {};
    const enc = new Encoder().init().align('center').bold(true).size(2, 2);
    enc.line('KOT').size(1, 1).bold(false);
    enc.line(m.token || m.no || '');
    enc.align('left').line((m.table || '') + '  ' + (m.orderType || ''));
    const coversN = Math.max(0, Number(m.covers != null ? m.covers : m.pax) || 0);
    if (coversN) enc.line('Pax: ' + coversN);
    if (m.station) enc.line('Station: ' + m.station);
    enc.hr(32);
    (items || []).forEach((it) => {
      enc.bold(true).line((Number(it.qty) || 1) + ' x ' + String(it.name || '')).bold(false);
      const n = it.note || it.notes || '';
      if (n) enc.line('  * ' + String(n).slice(0, 28));
    });
    enc.feed(3).cut();
    return enc;
  }

  function openDrawerEncoder(pin) {
    return new Encoder().init().cashDrawer(pin || 0);
  }

  global.RSEscPos = {
    Encoder,
    receiptFromBill,
    kotFromItems,
    openDrawerEncoder,
    encodeText(text) {
      return new Encoder().init().text(String(text || '')).feed(3).cut().encode();
    },
    openDrawerBytes(pin) {
      return openDrawerEncoder(pin).encode();
    },
    openDrawerBase64(pin) {
      return openDrawerEncoder(pin).toBase64();
    },
  };
})(typeof window !== 'undefined' ? window : globalThis);



/* === assets/modules/bill-identity.js === */
/* ============================================================
   RestroSuite — Bill identity helpers (Wave 5 code-split)
   Loaded before dashboard.js; dashboard reuses if present.
   ============================================================ */
(function (global) {
  'use strict';

  function pad2(value) {
    return String(value).padStart(2, '0');
  }

  function shortDateKey(date) {
    const d = date || new Date();
    return String(d.getFullYear()).slice(-2) + pad2(d.getMonth() + 1) + pad2(d.getDate());
  }

  function nextBillNo(existingBills) {
    const key = shortDateKey();
    const prefix = 'RS-' + key + '-';
    const maxFromList = (existingBills || []).reduce((highest, bill) => {
      const no = String((bill && (bill.no || bill.orderId || bill.id)) || '');
      if (!no.includes(key)) {return highest;}
      const parts = no.split('-');
      const seq = Number.parseInt(parts[parts.length - 1], 10);
      return Number.isFinite(seq) ? Math.max(highest, seq) : highest;
    }, 0);
    let tenant = 'local';
    try {
      const s = (global.RS_API && RS_API.session && RS_API.session()) || {};
      tenant = s.tenant_id || s.tenant_slug || sessionStorage.getItem('tenant_slug') || 'local';
    } catch (_) {}
    const seqKey = 'rs_bill_seq:' + tenant + ':' + key;
    let stored = 0;
    try { stored = Number(localStorage.getItem(seqKey) || 0) || 0; } catch (_) {}
    const next = Math.max(maxFromList, stored) + 1;
    try { localStorage.setItem(seqKey, String(next)); } catch (_) {}
    return prefix + String(next).padStart(3, '0');
  }

  function channelCode(channel) {
    const c = String(channel || '').toLowerCase();
    if (c.includes('deliver') || c.includes('online') || c.includes('swig') || c.includes('zom')) {return 'DL';}
    if (c.includes('take') || c.includes('parcel')) {return 'TK';}
    if (c.includes('agg')) {return 'AG';}
    return 'DI';
  }

  async function allocateBillNo(existingBills, channel) {
    const day = shortDateKey();
    const chCode = channelCode(channel);
    try {
      if (global.RS_API && typeof RS_API.data === 'function' && !RS_API.zeroCostLaunchMode && navigator.onLine !== false) {
        const res = await Promise.race([
          RS_API.data({ operation: 'next_bill_no', day }),
          new Promise((_, rej) => { setTimeout(() => rej(new Error('next_bill_no timeout')), 4000); }),
        ]);
        const no = (res && (res.no || res.order_id || res.data)) || null;
        if (no && typeof no === 'string' && /^RS-\d{6}-\d+$/i.test(no)) {
          try {
            const s = (RS_API.session && RS_API.session()) || {};
            const tenant = s.tenant_id || s.tenant_slug || sessionStorage.getItem('tenant_slug') || 'local';
            const seq = Number.parseInt(String(no).split('-').pop(), 10);
            if (Number.isFinite(seq)) {
              const seqKey = 'rs_bill_seq:' + tenant + ':' + day;
              const stored = Number(localStorage.getItem(seqKey) || 0) || 0;
              if (seq > stored) {localStorage.setItem(seqKey, String(seq));}
            }
          } catch (_) {}
          return no.replace(/^RS-/, 'RS-' + chCode + '-');
        }
      }
    } catch (e) {
      console.warn('[BillIdentity] server allocate failed', e && e.message);
    }
    return String(nextBillNo(existingBills)).replace(/^RS-/, 'RS-' + chCode + '-');
  }

  function newBillIdentity(billNo) {
    const idempotencyKey = (typeof crypto !== 'undefined' && crypto.randomUUID)
      ? crypto.randomUUID()
      : ('idem-' + Date.now() + '-' + Math.random().toString(36).slice(2, 10));
    const id = Date.now() + Math.floor(Math.random() * 1000);
    return { id, idempotencyKey, no: billNo };
  }

  global.RSBillIdentity = {
    pad2,
    shortDateKey,
    nextBillNo,
    allocateBillNo,
    newBillIdentity,
    channelCode,
  };
})(typeof window !== 'undefined' ? window : globalThis);



/* === assets/modules/inventory-ledger.js === */
/* ============================================================
   RestroSuite — Inventory ledger (Wave 5 remaining / code-split)
   Extracted from dashboard.js — attaches to window.RS when ready.
   ============================================================ */
(function (global) {
  'use strict';

  function toast(msg, icon) {
    if (global.RS && typeof RS.toast === 'function') {RS.toast(msg, icon);}
  }

  function getMenu() {
    return (global.RS && RS.MENU) || [];
  }
  function getInventory() {
    return (global.RS && RS.INVENTORY) || [];
  }

  function markDeducted(deductKey) {
    if (!deductKey) {return;}
    if (!global.__rsInvDeducted) {global.__rsInvDeducted = new Set();}
    global.__rsInvDeducted.add(deductKey);
    try {
      const dayKey = 'rs_inv_deducted:' + new Date().toISOString().slice(0, 10);
      const stored = JSON.parse(localStorage.getItem(dayKey) || '[]');
      if (stored.indexOf(deductKey) === -1) {
        stored.push(deductKey);
        while (stored.length > 500) {stored.shift();}
        localStorage.setItem(dayKey, JSON.stringify(stored));
      }
    } catch (_) {}
  }

  function alreadyDeducted(deductKey) {
    if (!deductKey) {return false;}
    if (!global.__rsInvDeducted) {global.__rsInvDeducted = new Set();}
    try {
      const dayKey = 'rs_inv_deducted:' + new Date().toISOString().slice(0, 10);
      const stored = JSON.parse(localStorage.getItem(dayKey) || '[]');
      stored.forEach((k) => global.__rsInvDeducted.add(String(k)));
    } catch (_) {}
    return global.__rsInvDeducted.has(deductKey);
  }

  function buildLines(items, MENU) {
    // Serving-aware + unit-aware path (recipe servings, g/kg, ml/L)
    if (global.RSRecipeUnits && typeof RSRecipeUnits.buildDeductLines === 'function') {
      return RSRecipeUnits.buildDeductLines(items, MENU, getInventory());
    }
    let noRecipeCount = 0;
    const lines = [];
    (items || []).forEach((it) => {
      const menuItem =
        MENU.find((m) => String(m.id) === String(it.id)) ||
        MENU.find((m) => m.name === it.name);
      if (!menuItem || !Array.isArray(menuItem.ingredients) || !menuItem.ingredients.length) {
        noRecipeCount++;
        return;
      }
      const orderedQty = Number(it.qty) || 1;
      const base = Math.max(1, Number(menuItem.recipeServings) || 1);
      const factor = orderedQty / base;
      menuItem.ingredients.forEach((ing) => {
        const qty = (Number(ing.qty) || 0) * factor;
        if (qty <= 0) {return;}
        const key = String(ing.key || ing.name || '')
          .toLowerCase()
          .replace(/[^a-z0-9]+/g, '_')
          .replace(/^_|_$/g, '');
        lines.push({ key, name: ing.name || key, qty, unit: ing.unit || 'unit' });
      });
    });
    return { lines, noRecipeCount };
  }

  /**
   * Takeaway / Delivery order-level packaging — NOT cart lines.
   * One pack per order when channel is takeaway or delivery.
   * Config: RS_SETTINGS.set_takeaway_pack or localStorage rs_takeaway_pack
   *   { enabled: true, items: [{ name, qty, unit }], applyDelivery: true }
   */
  function loadTakeawayPackConfig() {
    try {
      const s = (global.RS_SETTINGS || global.RS && RS.getSettings && null) || global.RS_SETTINGS || {};
      let cfg = s.set_takeaway_pack;
      if (typeof cfg === 'string') {
        try {
          cfg = JSON.parse(cfg);
        } catch (_) {
          cfg = null;
        }
      }
      if (!cfg || typeof cfg !== 'object') {
        const raw = global.localStorage && localStorage.getItem('rs_takeaway_pack');
        if (raw) {cfg = JSON.parse(raw);}
      }
      if (!cfg || typeof cfg !== 'object') {return { enabled: false, items: [], applyDelivery: true };}
      return {
        enabled: cfg.enabled !== false && Array.isArray(cfg.items) && cfg.items.length > 0,
        items: Array.isArray(cfg.items) ? cfg.items : [],
        applyDelivery: cfg.applyDelivery !== false,
      };
    } catch (_) {
      return { enabled: false, items: [], applyDelivery: true };
    }
  }

  function isParcelChannel(billRow) {
    const ch = String(
      (billRow && (billRow.channel || billRow.orderType || billRow.order_type || billRow.table)) || ''
    ).toLowerCase();
    if (ch.includes('dine')) {return false;}
    if (ch.includes('take') || ch.includes('parcel') || ch.includes('carry')) {return true;}
    if (ch.includes('deliv')) {return true;}
    // walk-in takeaway tables often labeled this way
    if (ch.includes('walk') && ch.includes('take')) {return true;}
    return false;
  }

  function isDeliveryChannel(billRow) {
    const ch = String((billRow && (billRow.channel || billRow.orderType || '')) || '').toLowerCase();
    return ch.includes('deliv');
  }

  /** Merge order-level packaging lines into food recipe lines (once per bill). */
  function appendTakeawayPackLines(lines, billRow) {
    const cfg = loadTakeawayPackConfig();
    if (!cfg.enabled || !cfg.items.length) {return { lines: lines || [], packCount: 0 };}
    const parcel = isParcelChannel(billRow);
    if (!parcel) {return { lines: lines || [], packCount: 0 };}
    if (isDeliveryChannel(billRow) && cfg.applyDelivery === false) {
      return { lines: lines || [], packCount: 0 };
    }
    const inv = getInventory();
    const out = (lines || []).slice();
    let packCount = 0;
    cfg.items.forEach((it) => {
      const name = String(it.name || '').trim();
      const qty = Number(it.qty) || 0;
      if (!name || qty <= 0) {return;}
      const stock = inv.find((x) => String(x.name).toLowerCase() === name.toLowerCase());
      const unit = (stock && stock.unit) || it.unit || 'gm';
      const key = name
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '_')
        .replace(/^_|_$/g, '');
      // merge with existing line if recipe already uses same pack item
      const existing = out.find(
        (l) =>
          (l.name && String(l.name).toLowerCase() === name.toLowerCase()) ||
          (l.key && l.key === key)
      );
      if (existing) {
        existing.qty = (Number(existing.qty) || 0) + qty;
      } else {
        out.push({ key, name, qty, unit, pack: true });
      }
      packCount++;
    });
    return { lines: out, packCount };
  }

  async function deductInventoryForBill(billRow) {
    const MENU = getMenu();
    const INVENTORY = getInventory();
    const items = (billRow && billRow._items) || [];
    if (!items.length) {return;}
    const deductKey = String(
      (billRow && (billRow.idempotencyKey || billRow.no || billRow.orderId || billRow.id)) || ''
    );
    if (alreadyDeducted(deductKey)) {
      console.info('[Inventory] Skip duplicate deduction for', deductKey);
      return;
    }

    let { lines, noRecipeCount } = buildLines(items, MENU);
    const packMerge = appendTakeawayPackLines(lines, billRow);
    lines = packMerge.lines;
    const packCount = packMerge.packCount || 0;

    if (!lines.length) {
      if (noRecipeCount === items.length) {
        toast('No stock deducted: link recipes under Inventory > Recipes', 'fa-triangle-exclamation');
      }
      return;
    }

    // Server atomic path
    try {
      if (global.RS_API && typeof RS_API.data === 'function' && !RS_API.zeroCostLaunchMode && navigator.onLine !== false) {
        const res = await Promise.race([
          RS_API.data({
            operation: 'deduct_inventory',
            bill_key: deductKey,
            order_id: billRow.no || billRow.orderId || '',
            lines,
          }),
          new Promise((_, rej) => { setTimeout(() => rej(new Error('deduct_inventory timeout')), 8000); }),
        ]);
        const payload = res && res.results != null ? res : (res && res.data) || res;
        if (payload && (payload.ok || payload.duplicate || Array.isArray(payload.results))) {
          markDeducted(deductKey);
          const results = Array.isArray(payload.results) ? payload.results : [];
          results.forEach((r) => {
            if (!r || r.status !== 'ok') {return;}
            const invItem = INVENTORY.find(
              (x) =>
                String(x.id) === String(r.id) ||
                (x.key && r.key && String(x.key).toLowerCase() === String(r.key).toLowerCase()) ||
                (x.name && r.name && String(x.name).toLowerCase() === String(r.name).toLowerCase())
            );
            if (invItem && r.stock_after != null) {invItem.stock = Number(r.stock_after);}
          });
          if (global.RS_DB && RS_DB.writeLocal) {
            try {
              const _w = RS_DB.writeLocal('inventory', INVENTORY);
              if (_w && _w.catch) {_w.catch(() => {});}
            } catch (e) {}
          }
          const deductedCount = Number(payload.deducted) || results.filter((r) => r && r.status === 'ok').length;
          const missing = Array.isArray(payload.missing) ? payload.missing : [];
          const lowStock = Array.isArray(payload.low_stock) ? payload.low_stock : [];
          if (payload.duplicate) {
            console.info('[Inventory] Server reported duplicate deduction for', deductKey);
          } else if (deductedCount > 0) {
            toast(
              'Stock updated: ' +
                deductedCount +
                ' item' +
                (deductedCount === 1 ? '' : 's') +
                ' deducted' +
                (packCount ? ' · incl. takeaway pack' : ''),
              'fa-boxes-stacked'
            );
          }
          if (missing.length) {
            setTimeout(
              () =>
                toast(
                  'Recipe ingredient not in stock: ' +
                    missing.slice(0, 3).join(', ') +
                    (missing.length > 3 ? '…' : ''),
                  'fa-triangle-exclamation'
                ),
              1200
            );
          }
          if (lowStock.length) {
            setTimeout(
              () =>
                toast(
                  'Low stock: ' + lowStock.slice(0, 3).join(', ') + (lowStock.length > 3 ? '…' : ''),
                  'fa-triangle-exclamation'
                ),
              2200
            );
          }
          if (noRecipeCount) {
            setTimeout(
              () =>
                toast(
                  noRecipeCount +
                    ' sold item' +
                    (noRecipeCount === 1 ? '' : 's') +
                    ' skipped: no recipe linked',
                  'fa-triangle-exclamation'
                ),
              1600
            );
          }
          if (document.querySelector('#inventory-tab.active') && global.RS && RS.render) {RS.render('inventory-tab');}
          return;
        }
      }
    } catch (e) {
      console.warn('[Inventory] server deduct failed, using local fallback:', e && e.message);
    }

    // Local fallback (+ FEFO batch consumption when available)
    let changed = false;
    let deductedCount = 0;
    const lowStock = [];
    const missingIngredients = [];
    const nearAfter = [];
    const Batches = global.RSInventoryBatches;
    const runLines = async () => {
      for (const line of lines) {
        const invItem = INVENTORY.find(
          (x) =>
            (x.name && line.name && String(x.name).toLowerCase() === String(line.name).toLowerCase()) ||
            (x.key && line.key && String(x.key).toLowerCase() === String(line.key).toLowerCase())
        );
        if (!invItem) {
          if (line.name && missingIngredients.indexOf(line.name) === -1) {missingIngredients.push(line.name);}
          continue;
        }
        const q = Number(line.qty) || 0;
        invItem.stock = Math.max(0, (Number(invItem.stock) || 0) - q);
        if (Batches && typeof Batches.deductFefo === 'function') {
          try {
            await Batches.deductFefo(invItem, q);
            const sum = Batches.summarizeItem(invItem);
            if (sum.status === 'near' || sum.status === 'expired') {
              if (nearAfter.indexOf(invItem.name) === -1) {nearAfter.push(invItem.name);}
            }
          } catch (e) {
            console.warn('[Inventory] FEFO deduct failed', e);
          }
        }
        changed = true;
        deductedCount++;
        const minLevel = Number(invItem.min != null ? invItem.min : invItem.minStock || 0);
        if (minLevel && invItem.stock <= minLevel && lowStock.indexOf(invItem.name) === -1) {
          lowStock.push(invItem.name);
        }
      }
    };
    // deductInventoryForBill is async — await FEFO loop
    await runLines();
    if (changed) {
      markDeducted(deductKey);
      if (global.RS_DB && RS_DB.writeLocal) {
        try {
          const _w = RS_DB.writeLocal('inventory', INVENTORY);
          if (_w && _w.catch) {_w.catch(() => {});}
        } catch (e) {}
      }
      try {
        if (global.RS && RS.save) {
          const saveResult = RS.save('inventory');
          if (saveResult && typeof saveResult.catch === 'function') {
            saveResult.catch((err) => {
              console.warn('Inventory cloud sync failed', err);
              toast('Inventory saved locally. Cloud sync pending.', 'fa-cloud-arrow-up');
            });
          }
        }
      } catch (e) {
        console.warn('Inventory save failed', e);
      }
      if (document.querySelector('#inventory-tab.active') && global.RS && RS.render) {RS.render('inventory-tab');}
      toast(
        'Stock updated: ' +
          deductedCount +
          ' item' +
          (deductedCount === 1 ? '' : 's') +
          ' deducted' +
          (packCount ? ' · incl. takeaway pack' : ''),
        'fa-boxes-stacked'
      );
      if (noRecipeCount) {
        setTimeout(
          () =>
            toast(
              noRecipeCount + ' sold item' + (noRecipeCount === 1 ? '' : 's') + ' skipped: no recipe linked',
              'fa-triangle-exclamation'
            ),
          1400
        );
      }
      if (missingIngredients.length) {
        setTimeout(
          () =>
            toast(
              'Recipe ingredient not in stock: ' +
                missingIngredients.slice(0, 3).join(', ') +
                (missingIngredients.length > 3 ? '...' : ''),
              'fa-triangle-exclamation'
            ),
          noRecipeCount ? 2600 : 1400
        );
      }
      if (lowStock.length) {
        setTimeout(
          () =>
            toast(
              'Low stock: ' + lowStock.slice(0, 3).join(', ') + (lowStock.length > 3 ? '...' : ''),
              'fa-triangle-exclamation'
            ),
          missingIngredients.length || noRecipeCount ? 3800 : 2600
        );
      }
      if (nearAfter.length) {
        setTimeout(
          () =>
            toast(
              'Use first (near expiry): ' +
                nearAfter.slice(0, 3).join(', ') +
                (nearAfter.length > 3 ? '…' : ''),
              'fa-clock'
            ),
          3200
        );
      }
    } else if (noRecipeCount === items.length) {
      toast('No stock deducted: link recipes under Inventory > Recipes', 'fa-triangle-exclamation');
    } else if (missingIngredients.length) {
      toast(
        'No stock deducted: missing inventory item ' + missingIngredients.slice(0, 2).join(', '),
        'fa-triangle-exclamation'
      );
    }
  }

  function restoreInventoryForBill(billRow) {
    const MENU = getMenu();
    const INVENTORY = getInventory();
    const items = (billRow && billRow._items) || [];
    if (!items.length) {return;}
    let changed = false;
    items.forEach((it) => {
      const menuItem = MENU.find((m) => m.name === it.name);
      if (!menuItem || !Array.isArray(menuItem.ingredients) || !menuItem.ingredients.length) {return;}
      const orderedQty = Number(it.qty) || 1;
      menuItem.ingredients.forEach((ing) => {
        const invItem = INVENTORY.find((x) => x.name === ing.name);
        if (!invItem) {return;}
        invItem.stock = (Number(invItem.stock) || 0) + (Number(ing.qty) || 0) * orderedQty;
        changed = true;
      });
    });
    if (changed) {
      if (global.RS_DB && RS_DB.writeLocal) {
        try {
          const _w = RS_DB.writeLocal('inventory', INVENTORY);
          if (_w && _w.catch) {_w.catch(() => {});}
        } catch (e) {}
      }
      try {
        if (global.RS && RS.save) {RS.save('inventory');}
      } catch (_) {}
      if (document.querySelector('#inventory-tab.active') && global.RS && RS.render) {RS.render('inventory-tab');}
    }
  }

  global.RSInventoryLedger = {
    deductInventoryForBill,
    restoreInventoryForBill,
    buildLines,
    loadTakeawayPackConfig,
    appendTakeawayPackLines,
    isParcelChannel,
  };

  function attach() {
    if (!global.RS) {
      setTimeout(attach, 40);
      return;
    }
    global.RS.deductInventoryForBill = deductInventoryForBill;
    global.RS.restoreInventoryForBill = restoreInventoryForBill;
  }
  attach();
})(typeof window !== 'undefined' ? window : globalThis);



/* === assets/modules/bills-history.js === */
/* ============================================================
   RestroSuite — Bills history UI (Wave 6 code-split)
   Extracted from dashboard.js — operates on window.RS.BILLS.
   ============================================================ */
(function (global) {
  'use strict';

  const payPill = {
    UPI: 'pill-violet',
    Cash: 'pill-green',
    Card: 'pill-orange',
    Split: 'pill-amber',
    Due: 'pill-red',
  };

  function toast(msg, icon) {
    if (global.RS && typeof RS.toast === 'function') {RS.toast(msg, icon);}
  }

  function rs(n) {
    if (global.RS && typeof RS.rs === 'function') {return RS.rs(n);}
    const v = Number(n) || 0;
    return '₹' + v.toLocaleString('en-IN');
  }

  function esc(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }
  const _e = esc;

  function $(sel) {
    return document.querySelector(sel);
  }

  function getBills() {
    return (global.RS && Array.isArray(RS.BILLS) ? RS.BILLS : []) || [];
  }

  function getMenu() {
    return (global.RS && RS.MENU) || [];
  }

  function getInventory() {
    return (global.RS && RS.INVENTORY) || [];
  }

  function receiptPayloadFromBill(b) {
    const items =
      Array.isArray(b._items) && b._items.length
        ? b._items.map((i) => ({
            name: i.name || 'Item',
            qty: Number(i.qty || 1),
            price: Number(i.price || 0),
            note: i.note || i.notes || '',
          }))
        : [{ name: 'Bill total', qty: 1, price: Number(b.amount || 0) }];
    const sub = Number(b.subtotal || items.reduce((sum, i) => sum + i.price * i.qty, 0));
    const gst = Number(b.gst || 0);
    const grand = Number(b.amount || sub + gst);
    return {
      no: b.no || b.id || 'Invoice',
      time: b.time || '',
      table: b.table || 'Walk-in / Takeaway',
      customer: b.customerName || '',
      customerPhone: b.customerPhone || '',
      customerGst: b.customerGst || '',
      covers: Math.max(0, Number(b.covers != null ? b.covers : b.pax) || 0),
      items,
      sub,
      disc: Number(b.discount || 0),
      gst,
      grand,
      tenders:
        Array.isArray(b.tenders) && b.tenders.length
          ? b.tenders
          : [{ method: b.pay || b.paymentMethod || 'Cash', amount: grand }],
      change: Number(b.changeAmount || b.change || 0),
      serviceChargeAmount: Number(b.serviceChargeAmount || 0),
      serviceChargePct: b.serviceChargePct,
      tipAmount: Number(b.tipAmount || b.tip || 0),
      deliveryCharge: Number(b.deliveryCharge || 0),
      loyaltyRedeemAmount: Number(b.loyaltyRedeemAmount || 0),
      promoCode: b.promoCode || '',
      promoAmount: Number(b.promoAmount || 0),
      promoTitle: b.promoTitle || '',
      liquorTaxAmount: Number(b.liquorTaxAmount || 0),
    };
  }

  /** Load bill lines into POS cart for rebill / amend (new sale). */
  async function rebillToPos(b) {
    if (!b) {return;}
    const items =
      Array.isArray(b._items) && b._items.length
        ? b._items.map((i) => ({
            id: i.id || i.name,
            name: i.name || 'Item',
            qty: Math.max(1, Number(i.qty || 1)),
            price: Number(i.price || 0),
            cat: i.cat || i.category || 'Rebill',
            stock: 'ok',
            taxCategory: i.taxCategory || i.tax_category,
            note: i.note || i.notes || '',
          }))
        : [];
    if (!items.length) {
      try { if (window.RSActionFeedback) {window.RSActionFeedback.error();} } catch(_) {}
      toast('No line items on this bill to rebill', 'fa-circle-exclamation');
      return;
    }
    if (global.RS && typeof RS.activateTab === 'function') {await RS.activateTab('pos-tab');}
    await new Promise((r) => { setTimeout(r, 100); });

    // Prevent showMenuGridForTable from wiping this cart when #cart-table changes
    if (typeof global.RS_PRESERVE_CART_LOAD === 'function') {
      global.RS_PRESERVE_CART_LOAD(2000);
    } else {
      global.__rsPreserveCartUntil = Date.now() + 2000;
    }

    const nameEl = document.getElementById('cust-input-name') || document.getElementById('cust-name');
    const phoneEl = document.getElementById('cust-input-phone') || document.getElementById('cust-phone');
    if (nameEl && b.customerName) {
      nameEl.value = b.customerName;
      nameEl.dispatchEvent(new Event('input', { bubbles: true }));
    }
    if (phoneEl && b.customerPhone) {
      phoneEl.value = b.customerPhone;
      phoneEl.dispatchEvent(new Event('input', { bubbles: true }));
    }
    const tableSelect = document.getElementById('cart-table');
    if (tableSelect && b.table) {
      let opt = [...tableSelect.options].find(
        (o) => o.value === b.table || o.text === b.table
      );
      if (!opt) {
        opt = document.createElement('option');
        opt.value = b.table;
        opt.textContent = b.table;
        tableSelect.appendChild(opt);
      }
      tableSelect.value = opt.value;
      tableSelect.dispatchEvent(new Event('change', { bubbles: true }));
    }
    // Apply cart after table hydrate so async showMenuGridForTable cannot clear it
    const applyCart = () => {
      if (global.RS && typeof RS.setCart === 'function') {RS.setCart(items);}
      if (b.tipAmount && global.RS && typeof RS.setTip === 'function') {
        try {
          RS.setTip(b.tipAmount);
        } catch (_) {}
      }
      if (b.deliveryCharge) {
        const dc = document.getElementById('delivery-charge');
        if (dc) {
          dc.value = b.deliveryCharge;
          dc.dispatchEvent(new Event('input', { bubbles: true }));
        }
      }
      try {
        if (global.RS && typeof RS.renderCart === 'function') {RS.renderCart();}
      } catch (_) {}
    };
    applyCart();
    await new Promise((r) => { setTimeout(r, 350); });
    applyCart();
    try { if (window.RSActionFeedback) {window.RSActionFeedback.success();} } catch(_) {}
    toast(
      'Rebill loaded · ' + (b.no || '') + (b.status === 'refunded' ? ' (voided original)' : ' — void first if correcting a paid bill'),
      'fa-rotate'
    );
  }

  function showBillReceipt(b) {
    if (global.RSReceipt && typeof RSReceipt.show === 'function') {
      RSReceipt.show(receiptPayloadFromBill(b));
      return;
    }
    toast('Receipt preview is unavailable on this screen', 'fa-circle-exclamation');
    try { if (window.RSActionFeedback) {window.RSActionFeedback.error();} } catch(_) {}
  }

  function printBillThermal(b) {
    const payload = receiptPayloadFromBill(b);
    if (global.RSOps && typeof RSOps.printBillThermal === 'function') {
      return RSOps.printBillThermal(payload);
    }
    if (global.RSReceipt && typeof RSReceipt.print === 'function') {
      return RSReceipt.print(payload);
    }
    toast('Thermal print unavailable', 'fa-circle-exclamation');
  }

  function shareBillReceipt(b) {
    const bill = receiptPayloadFromBill(b);
    if (global.RSReceipt && typeof RSReceipt.share === 'function') {
      RSReceipt.share(bill);
    } else {
      const text =
        global.RSReceipt && typeof RSReceipt.text === 'function'
          ? RSReceipt.text(bill)
          : `${bill.no}\nTotal: ${rs(bill.grand)}`;

      let phone = bill.customerPhone ? bill.customerPhone.replace(/\D/g, '') : '';
      if (phone.length === 10) {
        phone = '91' + phone;
      }

      const url = phone
        ? `https://api.whatsapp.com/send?phone=${phone}&text=${encodeURIComponent(text)}`
        : `https://wa.me/?text=${encodeURIComponent(text)}`;

      window.open(url, '_blank', 'noopener,noreferrer');
      try { if (window.RSActionFeedback) {window.RSActionFeedback.success();} } catch(_) {}
      toast('WhatsApp receipt ready', 'fa-whatsapp');
    }
  }

  /** Refund detail modal — returns reason string, or null if cancelled */
  function showRefundModal(b) {
    return new Promise((resolve) => {
      document.getElementById('rs-refund-overlay')?.remove();
      const overlay = document.createElement('div');
      overlay.id = 'rs-refund-overlay';
      overlay.style.cssText =
        'position:fixed;inset:0;z-index:9998;background:rgba(17,24,39,0.5);backdrop-filter:blur(5px);display:flex;align-items:center;justify-content:center;animation:rsPinFadeIn 0.18s ease;';
      const amt = rs(b.amount || 0);
      overlay.innerHTML = `
        <div style="background:var(--surface,#fff);border:1px solid var(--stroke-2,#e5e7eb);border-radius:20px;padding:28px 24px 24px;width:340px;box-shadow:0 20px 60px rgba(0,0,0,0.15);animation:rsPinSlideUp 0.22s cubic-bezier(0.34,1.56,0.64,1);">
          <div style="display:flex;align-items:center;gap:12px;margin-bottom:18px;">
            <div style="width:42px;height:42px;border-radius:50%;background:rgba(239,68,68,0.1);display:flex;align-items:center;justify-content:center;font-size:18px;color:#ef4444;flex-shrink:0;"><i class="fa-solid fa-rotate-left"></i></div>
            <div>
              <div style="font-weight:800;font-size:15px;color:var(--text,#111);">Void / Refund</div>
              <div style="font-size:12px;color:var(--text-soft,#6b7280);">${_e(b.no || b.id)} &middot; ${amt}</div>
            </div>
          </div>
          <p style="font-size:12.5px;color:var(--text-soft);line-height:1.45;margin:0 0 12px">Marks the bill voided. Stock is not restored (food already served). Use <b>Rebill</b> after to correct items on a new bill.</p>
          <div style="font-size:12.5px;color:var(--text-soft,#6b7280);margin-bottom:8px;font-weight:600;text-transform:uppercase;letter-spacing:.05em;">Reason</div>
          <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-bottom:14px;" id="rfund-reason-chips">
            ${['Customer complaint', 'Wrong order', 'Quality issue', 'Duplicate charge', 'Amend / rebill', 'Other']
              .map(
                (r) =>
                  `<button data-r="${_e(r)}" style="padding:8px 10px;border-radius:10px;border:1.5px solid var(--stroke-2,#e5e7eb);background:var(--glass,#f9fafb);font-size:12px;cursor:pointer;font-family:inherit;color:var(--text,#111);text-align:left;transition:all .15s;" class="rfund-chip">${_e(r)}</button>`
              )
              .join('')}
          </div>
          <textarea id="rfund-note" placeholder="Additional notes (optional)..." rows="2" style="width:100%;padding:10px 12px;border:1px solid var(--stroke-2,#e5e7eb);border-radius:10px;font-family:inherit;font-size:13px;resize:none;outline:none;background:var(--glass,#f9fafb);color:var(--text,#111);box-sizing:border-box;"></textarea>
          <div style="display:flex;gap:10px;margin-top:16px;">
            <button id="rfund-cancel" style="flex:1;padding:11px;border:1px solid var(--stroke-2,#e5e7eb);border-radius:10px;background:transparent;font-family:inherit;font-size:13px;cursor:pointer;color:var(--text-soft,#6b7280);">Cancel</button>
            <button id="rfund-confirm" style="flex:2;padding:11px;background:#ef4444;color:#fff;border:none;border-radius:10px;font-weight:700;font-size:13px;cursor:pointer;font-family:inherit;">Confirm void</button>
          </div>
        </div>
      `;
      document.body.appendChild(overlay);
      let selectedReason = '';
      overlay.querySelectorAll('.rfund-chip').forEach((chip) => {
        chip.addEventListener('click', () => {
          overlay.querySelectorAll('.rfund-chip').forEach((c) => {
            c.style.cssText +=
              ';background:var(--glass,#f9fafb);border-color:var(--stroke-2,#e5e7eb);color:var(--text,#111);font-weight:normal;';
          });
          chip.style.background = '#ef4444';
          chip.style.borderColor = '#ef4444';
          chip.style.color = '#fff';
          chip.style.fontWeight = '700';
          selectedReason = chip.dataset.r;
        });
      });
      document.getElementById('rfund-confirm').onclick = () => {
        const note = document.getElementById('rfund-note').value.trim();
        const reason = [selectedReason, note].filter(Boolean).join(' -- ') || 'POS refund';
        overlay.remove();
        resolve(reason);
      };
      document.getElementById('rfund-cancel').onclick = () => {
        overlay.remove();
        resolve(null);
      };
      overlay.addEventListener('click', (e) => {
        if (e.target === overlay) {
          overlay.remove();
          resolve(null);
        }
      });
    });
  }

  function showDeleteConfirm(b) {
    return new Promise((resolve) => {
      document.getElementById('rs-del-overlay')?.remove();
      const overlay = document.createElement('div');
      overlay.id = 'rs-del-overlay';
      overlay.style.cssText =
        'position:fixed;inset:0;z-index:9998;background:rgba(17,24,39,0.5);backdrop-filter:blur(5px);display:flex;align-items:center;justify-content:center;animation:rsPinFadeIn 0.18s ease;';
      overlay.innerHTML = `
        <div style="background:var(--surface,#fff);border:1px solid var(--stroke-2,#e5e7eb);border-radius:20px;padding:28px 24px 24px;width:320px;box-shadow:0 20px 60px rgba(0,0,0,0.15);animation:rsPinSlideUp 0.22s cubic-bezier(0.34,1.56,0.64,1);text-align:center;">
          <div style="width:48px;height:48px;border-radius:50%;background:rgba(239,68,68,0.12);display:flex;align-items:center;justify-content:center;font-size:20px;color:#ef4444;margin:0 auto 16px;"><i class="fa-solid fa-trash-can"></i></div>
          <div style="font-weight:800;font-size:16px;color:var(--text,#111);margin-bottom:8px;">Delete Bill?</div>
          <div style="font-size:13px;color:var(--text-soft,#6b7280);line-height:1.6;margin-bottom:22px;"><strong>${_e(b.no || b.id || 'This bill')}</strong> will be permanently removed from records.<br>This action <strong>cannot be undone</strong>.</div>
          <div style="display:flex;gap:10px;">
            <button id="rs-del-cancel" style="flex:1;padding:11px;border:1px solid var(--stroke-2,#e5e7eb);border-radius:10px;background:transparent;font-family:inherit;font-size:13px;cursor:pointer;color:var(--text-soft,#6b7280);">Cancel</button>
            <button id="rs-del-confirm" style="flex:2;padding:11px;background:#ef4444;color:#fff;border:none;border-radius:10px;font-weight:700;font-size:14px;cursor:pointer;font-family:inherit;">Yes, Delete</button>
          </div>
        </div>
      `;
      document.body.appendChild(overlay);
      document.getElementById('rs-del-confirm').onclick = () => {
        overlay.remove();
        resolve(true);
      };
      document.getElementById('rs-del-cancel').onclick = () => {
        overlay.remove();
        resolve(false);
      };
      overlay.addEventListener('click', (e) => {
        if (e.target === overlay) {
          overlay.remove();
          resolve(false);
        }
      });
    });
  }

  async function markBillRefunded(b) {
    if (!b || b.status === 'refunded') {return;}

    // Shift gate only when Settings → Require open shift is ON (default OFF)
    try {
      const shiftRequired =
        global.RSOps &&
        typeof RSOps.isShiftRequired === 'function' &&
        RSOps.isShiftRequired();
      const needShift =
        shiftRequired &&
        global.RSOps &&
        typeof RSOps.getOpenShift === 'function' &&
        !RSOps.getOpenShift();
      const isSuper =
        document.documentElement.classList.contains('rs-role-superadmin');
      if (needShift && !isSuper) {
        if (typeof RSOps.promptRequireOpenShift === 'function') {
          const ok = await RSOps.promptRequireOpenShift({
            action: 'void / refund',
            reason:
              'Open a shift before voiding or refunding so the refund is tied to this counter’s Z-report.',
          });
          if (!ok) {return;}
        } else {
          toast(
            'Open a shift first (orange Shift button), then void / refund',
            'fa-unlock'
          );
          return;
        }
      }
    } catch (shiftErr) {
      console.warn('[refund] shift gate', shiftErr);
      if (global.RSOps && typeof RSOps.isShiftRequired === 'function' && RSOps.isShiftRequired()) {
        toast('Open a shift first, then void / refund', 'fa-unlock');
        return;
      }
    }

    // PIN for refunds: Settings → Require PIN for refunds (default ON)
    try {
      const pinRequired =
        typeof global.RS_featureOn === 'function'
          ? global.RS_featureOn('set_require_pin_for_refunds', global.RS_SETTINGS, true)
          : global.RS_SETTINGS?.set_require_pin_for_refunds !== false &&
            global.RS_SETTINGS?.set_require_pin_for_refunds !== 'false';
      if (pinRequired && global.RSPinModal && typeof RSPinModal.request === 'function') {
        const ok = await RSPinModal.request(`Void / Refund ${b.no || b.id || 'bill'}`);
        if (!ok) {
          toast('Void / refund cancelled — manager PIN required', 'fa-lock');
          return;
        }
      }
    } catch (pinErr) {
      console.warn('[refund] PIN gate', pinErr);
    }

    const reason = await showRefundModal(b);
    if (reason === null) {
      try { if (window.RSActionFeedback) {window.RSActionFeedback.error();} } catch(_) {}
      toast('Void / refund cancelled', 'fa-circle-info');
      return;
    }

    b.status = 'refunded';
    b.refundReason = reason || 'POS void/refund';
    b.refundedAt = new Date().toISOString();
    b.voided = true;
    try {
      const s = global.RS_API && RS_API.session ? RS_API.session() : {};
      b.refundedBy = s.display_name || s.username || 'staff';
      b.refundStation =
        global.RSOps && RSOps.getStationLabel ? RSOps.getStationLabel() : '';
      b.refundShiftId =
        global.RSOps && RSOps.getOpenShift && RSOps.getOpenShift()
          ? RSOps.getOpenShift().shiftId
          : b.shiftId || '';
    } catch (_) {}

    // Upsert into local store so server-only hits (_fromServer) persist as voided
    const BILLS = getBills();
    const voidKey = String(b.no || b.orderId || b.id || '');
    const localIdx = BILLS.findIndex(
      (x) =>
        x === b ||
        String(x.no || '') === voidKey ||
        String(x.orderId || '') === voidKey ||
        String(x.id || '') === voidKey
    );
    if (localIdx === -1) {BILLS.unshift(b);}
    else {BILLS[localIdx] = Object.assign({}, BILLS[localIdx], b);}

    let cloudMarked = false;
    try {
      if (global.RS_DB && RS_DB.writeLocal) {await RS_DB.writeLocal('bills', BILLS);}
      if (global.RS_API && RS_API.data && RS_API.session && RS_API.session()) {
        await RS_API.data({
          table: 'doppio_refund_requests',
          operation: 'insert',
          data: {
            order_id: String(b.no || b.orderId || b.id),
            amount: Number(b.amount || b.total || 0),
            reason: b.refundReason,
            status: 'approved',
            metadata: {
              refunded_by: b.refundedBy || '',
              station: b.refundStation || '',
              shift_id: b.refundShiftId || '',
              bill_id: b.id,
            },
          },
          returning: false,
        }).catch(() => {});
        try {
          await RS_API.data({
            table: 'tenant_audit_logs',
            operation: 'insert',
            data: {
              action: 'bill.refund',
              target_type: 'doppio_bills',
              metadata: {
                order_id: b.no || b.orderId,
                amount: Number(b.amount || b.total || 0),
                reason: b.refundReason,
                station: b.refundStation,
              },
            },
            returning: false,
          });
        } catch (_) {}
        const billFilters = Number.isFinite(Number(b.id))
          ? [{ operator: 'eq', column: 'id', value: Number(b.id) }]
          : [{ operator: 'eq', column: 'order_id', value: String(b.no || b.orderId || '') }];
        await RS_API.update(
          'doppio_bills',
          {
            status: 'refunded',
            refund_reason: b.refundReason,
            refunded_at: b.refundedAt,
          },
          billFilters,
          { returning: false }
        );
        cloudMarked = true;
      }
    } catch (e) {
      console.warn('Refund cloud update failed', e);
    }
    renderBills();
    try { if (window.RSActionFeedback) {window.RSActionFeedback.success();} } catch(_) {}
    const msg = cloudMarked
      ? 'Void recorded + audit · tap to rebill'
      : 'Void marked locally · tap to rebill';
    if (typeof global.__toast === 'function') {
      global.__toast(msg, 'fa-rotate-left', () => rebillToPos(b));
    } else {
      toast(msg, 'fa-rotate-left');
    }
    // Auto-offer rebill when reason is amend
    if (/amend|rebill|wrong order|duplicate/i.test(String(reason || ''))) {
      setTimeout(() => rebillToPos(b), 350);
    }
  }

  async function deleteBill(b) {
    if (!b) {return;}
    // Always gate with Admin PIN when modal is available (setup on first use if unset)
    if (global.RSPinModal && typeof RSPinModal.request === 'function') {
      const ok = await RSPinModal.request(`Delete Bill ${b.no || b.id || ''}`);
      if (!ok) {
        try { if (window.RSActionFeedback) {window.RSActionFeedback.error();} } catch(_) {}
        toast('Delete cancelled — manager PIN required', 'fa-lock');
        return;
      }
    }
    const confirmed = await showDeleteConfirm(b);
    if (!confirmed) {
      toast('Delete cancelled', 'fa-circle-info');
      return;
    }

    const BILLS = getBills();
    const billKey = String(b.no || b.orderId || b.id || '');
    const idx = BILLS.findIndex(
      (x) =>
        x === b ||
        String(x.no || '') === billKey ||
        String(x.orderId || '') === billKey ||
        String(x.id || '') === billKey
    );
    if (idx !== -1) {BILLS.splice(idx, 1);}

    // Only on DELETE — refund does NOT restore stock (food was served)
    try {
      const MENU = getMenu();
      const INVENTORY = getInventory();
      const bItems = b._items || [];
      let invChanged = false;
      bItems.forEach((it) => {
        const menuItem = MENU.find((m) => m.name === it.name);
        if (!menuItem || !Array.isArray(menuItem.ingredients) || !menuItem.ingredients.length) {return;}
        const orderedQty = Number(it.qty) || 1;
        menuItem.ingredients.forEach((ing) => {
          const invItem = INVENTORY.find((x) => x.name === ing.name);
          if (!invItem) {return;}
          invItem.stock = (Number(invItem.stock) || 0) + (Number(ing.qty) || 0) * orderedQty;
          invChanged = true;
        });
      });
      if (invChanged && global.RS_DB && RS_DB.writeLocal) {
        await RS_DB.writeLocal('inventory', INVENTORY);
      }
    } catch (e) {
      console.warn('Inventory restore failed', e);
    }

    try {
      if (global.RS_DB && RS_DB.writeLocal) {await RS_DB.writeLocal('bills', BILLS);}
      // CRITICAL: filters must be an array of {operator,column,value}.
      // Object filters become [] server-side and would delete ALL tenant bills.
      if (global.RS_API && RS_API.data && RS_API.session && RS_API.session()) {
        const billFilters = Number.isFinite(Number(b.id))
          ? [{ operator: 'eq', column: 'id', value: Number(b.id) }]
          : [
              {
                operator: 'eq',
                column: 'order_id',
                value: String(b.no || b.orderId || b.id || ''),
              },
            ];
        const hasTarget = billFilters.some(
          (f) => f && f.value !== '' && f.value != null && !(typeof f.value === 'number' && !Number.isFinite(f.value))
        );
        if (!hasTarget) {
          console.warn('[BillsHistory] Refusing cloud delete without bill id/order_id');
        } else {
          await RS_API.data({
            table: 'doppio_bills',
            operation: 'delete',
            filters: billFilters,
            returning: false,
          }).catch((e) => console.warn('Cloud delete', e));
        }
      }
    } catch (e) {
      console.warn('Bill delete sync failed', e);
    }
    renderBills();
    try { if (window.RSActionFeedback) {window.RSActionFeedback.success();} } catch(_) {}
    toast(`Bill ${b.no || b.id || ''} deleted -- inventory restored`, 'fa-trash');
  }

  /**
   * Wave 6/7: broader client filter — bill no, table, customer name/phone, pay method.
   */
  let billsDateRange = 'today';
  let billsCustomFrom = '';
  let billsCustomTo = '';
  try {
    const saved = localStorage.getItem('rs_bills_date_range');
    if (saved && /^(today|yesterday|7d|all|custom)$/.test(saved)) {billsDateRange = saved;}
    billsCustomFrom = localStorage.getItem('rs_bills_date_from') || '';
    billsCustomTo = localStorage.getItem('rs_bills_date_to') || '';
  } catch (_) {}

  function startOfLocalDay(d) {
    const x = new Date(d);
    x.setHours(0, 0, 0, 0);
    return x;
  }

  /** Parse bill timestamp from ISO or common POS display strings. */
  function parseBillDate(b) {
    const raw = b && (b.dateTime || b.time || b.created_at || b.createdAt || '');
    if (!raw) {return null;}
    let d = new Date(raw);
    if (!Number.isNaN(d.getTime())) {return d;}
    const s = String(raw).trim();
    // "13 Jul, 11:18 am" / "13 Jul 2026, 11:18 am"
    const m = s.match(
      /^(\d{1,2})\s+([A-Za-z]{3})[a-z]*\.?,?\s*(\d{4})?(?:,?\s*(\d{1,2}):(\d{2})\s*(am|pm))?/i
    );
    if (m) {
      const months = {
        jan: 0, feb: 1, mar: 2, apr: 3, may: 4, jun: 5,
        jul: 6, aug: 7, sep: 8, oct: 9, nov: 10, dec: 11,
      };
      const mon = months[String(m[2]).toLowerCase().slice(0, 3)];
      if (mon != null) {
        const year = m[3] ? Number(m[3]) : new Date().getFullYear();
        let hour = m[4] != null ? Number(m[4]) : 12;
        const min = m[5] != null ? Number(m[5]) : 0;
        const ap = (m[6] || '').toLowerCase();
        if (ap === 'pm' && hour < 12) {hour += 12;}
        if (ap === 'am' && hour === 12) {hour = 0;}
        d = new Date(year, mon, Number(m[1]), hour, min, 0, 0);
        if (!Number.isNaN(d.getTime())) {return d;}
      }
    }
    return null;
  }

  function billInDateRange(b) {
    const range = billsDateRange || 'today';
    if (range === 'all') {return true;}
    const d = parseBillDate(b);
    if (!d) {
      // Unparseable timestamps only show in All (avoids polluting Today stats)
      return false;
    }
    const t = d.getTime();
    const today0 = startOfLocalDay(new Date()).getTime();
    const dayMs = 86400000;
    if (range === 'today') {return t >= today0 && t < today0 + dayMs;}
    if (range === 'yesterday') {return t >= today0 - dayMs && t < today0;}
    if (range === '7d') {return t >= today0 - 6 * dayMs && t < today0 + dayMs;}
    if (range === 'custom') {
      let from = -Infinity;
      let to = Infinity;
      if (billsCustomFrom) {
        const f = new Date(billsCustomFrom + 'T00:00:00');
        if (!Number.isNaN(f.getTime())) {from = startOfLocalDay(f).getTime();}
      }
      if (billsCustomTo) {
        const e = new Date(billsCustomTo + 'T00:00:00');
        if (!Number.isNaN(e.getTime())) {to = startOfLocalDay(e).getTime() + dayMs;}
      }
      return t >= from && t < to;
    }
    return true;
  }

  function dateRangeLabels() {
    switch (billsDateRange) {
      case 'yesterday':
        return { sales: "Yesterday's sales", count: 'Bills yesterday', refunds: 'Refunds yesterday' };
      case '7d':
        return { sales: '7-day sales', count: 'Bills (7 days)', refunds: 'Refunds (7 days)' };
      case 'all':
        return { sales: 'All-time sales', count: 'All bills', refunds: 'All refunds' };
      case 'custom':
        return { sales: 'Sales in range', count: 'Bills in range', refunds: 'Refunds in range' };
      default:
        return { sales: "Today's sales", count: "Today's bills", refunds: 'Refunds today' };
    }
  }

  function filterBills(bills, q, payFilter, statusFilter) {
    const needle = String(q || '').toLowerCase().trim();
    let filtered = (bills || []).filter(billInDateRange);
    if (needle) {
      filtered = filtered.filter((b) => {
        const hay = [
          b.no,
          b.orderId,
          b.id,
          b.table,
          b.customerName,
          b.customer,
          b.customerPhone,
          b.pay,
          b.paymentMethod,
        ]
          .map((x) => String(x || '').toLowerCase())
          .join(' ');
        return hay.includes(needle);
      });
    }
    const pf = String(payFilter || 'All').toLowerCase();
    if (pf !== 'all') {
      filtered = filtered.filter((b) => b.pay && String(b.pay).toLowerCase() === pf);
    }
    const sf = String(statusFilter || 'All').toLowerCase();
    if (sf !== 'all') {
      filtered = filtered.filter((b) => b.status && String(b.status).toLowerCase() === sf);
    }
    return filtered;
  }

  function getFilteredBills() {
    const q = ($('#bills-search') && $('#bills-search').value) || '';
    const payFilter = ($('#bills-pay-filter') && $('#bills-pay-filter').value) || 'All';
    const statusFilter = ($('#bills-status-filter') && $('#bills-status-filter').value) || 'All';
    const localFiltered = filterBills(getBills(), q, payFilter, statusFilter);
    return mergeBillsForDisplay(localFiltered, _serverHits, q, payFilter, statusFilter);
  }

  /** Map cloud doppio_bills row → local bill shape used by the table. */
  function normalizeServerBill(row) {
    if (!row || typeof row !== 'object') {return null;}
    const items = row.items;
    let itemCount = row.items;
    if (Array.isArray(items)) {itemCount = items.length;}
    else if (typeof items === 'object' && items) {itemCount = Object.keys(items).length;}
    return {
      id: row.id,
      no: row.orderId || row.order_id || row.no || String(row.id || ''),
      orderId: row.orderId || row.order_id || row.no,
      time: row.dateTime || row.date_time || row.created_at || '',
      dateTime: row.dateTime || row.date_time || row.created_at || '',
      table: row.tableNumber || row.table_number || row.table || '',
      items: itemCount,
      amount: Number(row.total != null ? row.total : row.amount) || 0,
      pay: row.paymentMethod || row.payment_method || row.pay || 'Cash',
      paymentMethod: row.paymentMethod || row.payment_method || row.pay || 'Cash',
      status: String(row.status || 'paid').toLowerCase() === 'refunded' ? 'refunded' : 'paid',
      customerName: row.customerName || row.customer_name || '',
      customerPhone: row.customerPhone || row.customer_phone || '',
      subtotal: Number(row.subtotal) || 0,
      gst: Number(row.gst) || 0,
      discount: Number(row.discount) || 0,
      _items: Array.isArray(items) ? items : [],
      _fromServer: true,
    };
  }

  let _serverHits = [];
  let _searchGen = 0;

  /**
   * Wave 7: query tenant-data search_bills for history beyond the client cache.
   * Returns [] on empty, null on skip/failure (caller keeps local-only).
   */
  async function searchBillsServer(q, limit) {
    const needle = String(q || '').trim();
    if (needle.length < 2) {return null;}
    if (!global.RS_API || typeof RS_API.data !== 'function') {return null;}
    if (global.RS_API.zeroCostLaunchMode) {return null;}
    if (navigator.onLine === false) {return null;}
    try {
      const res = await Promise.race([
        RS_API.data({ operation: 'search_bills', q: needle, limit: limit || 50 }),
        new Promise((_, rej) => { setTimeout(() => rej(new Error('search_bills timeout')), 5000); }),
      ]);
      const rows =
        (res && res.data && Array.isArray(res.data.rows) && res.data.rows) ||
        (res && Array.isArray(res.rows) && res.rows) ||
        (res && Array.isArray(res.data) && res.data) ||
        [];
      return rows.map(normalizeServerBill).filter(Boolean);
    } catch (e) {
      console.warn('[BillsHistory] server search failed', e && e.message);
      return null;
    }
  }

  function mergeBillsForDisplay(localFiltered, serverRows, q, payFilter, statusFilter) {
    const map = new Map();
    (localFiltered || []).forEach((b) => {
      const key = String(b.no || b.orderId || b.id || '');
      if (key) {map.set(key, b);}
    });
    const serverFiltered = filterBills(serverRows || [], q, payFilter, statusFilter);
    serverFiltered.forEach((b) => {
      const key = String(b.no || b.orderId || b.id || '');
      if (key && !map.has(key)) {map.set(key, b);}
    });
    return Array.from(map.values());
  }

  /** Human + Excel-friendly bill timestamp */
  function formatBillTime(b) {
    const raw = b && (b.dateTime || b.time || b.created_at || '');
    if (!raw) {return '';}
    const d = new Date(raw);
    if (!Number.isNaN(d.getTime())) {
      try {
        const loc =
          typeof global.RS_getOutletLocale === 'function' ? RS_getOutletLocale() : 'en-IN';
        const tz =
          typeof global.RS_getOutletTimezone === 'function' ? RS_getOutletTimezone() : 'Asia/Kolkata';
        return d.toLocaleString(loc, {
          day: '2-digit',
          month: 'short',
          year: 'numeric',
          hour: 'numeric',
          minute: '2-digit',
          hour12: true,
          timeZone: tz,
        });
      } catch (_) {
        return d.toLocaleString();
      }
    }
    // Already formatted (e.g. "11 Jul, 3:30 pm")
    return String(raw);
  }

  function formatBillTimeIsoExcel(b) {
    const raw = b && (b.dateTime || b.time || b.created_at || '');
    if (!raw) {return '';}
    const d = new Date(raw);
    if (Number.isNaN(d.getTime())) {return String(raw);}
    const pad = (n) => String(n).padStart(2, '0');
    // Local wall time yyyy-mm-dd HH:mm:ss — Excel-friendly
    return (
      d.getFullYear() +
      '-' +
      pad(d.getMonth() + 1) +
      '-' +
      pad(d.getDate()) +
      ' ' +
      pad(d.getHours()) +
      ':' +
      pad(d.getMinutes()) +
      ':' +
      pad(d.getSeconds())
    );
  }

  function lineItemsSummary(b) {
    const items = Array.isArray(b._items) ? b._items : [];
    if (items.length) {
      return items
        .map((i) => {
          const q = Number(i.qty) || 1;
          const name = String(i.name || 'Item').replace(/[;\n\r]+/g, ' ');
          return q + 'x ' + name;
        })
        .join('; ');
    }
    if (b.items != null && b.items !== '') {return String(b.items);}
    return '';
  }

  function csvEscape(value) {
    const s = value == null ? '' : String(value);
    if (/[",\n\r]/.test(s)) {return '"' + s.replace(/"/g, '""') + '"';}
    return s;
  }

  function collectExportList() {
    const q = ($('#bills-search') && $('#bills-search').value) || '';
    const payFilter = ($('#bills-pay-filter') && $('#bills-pay-filter').value) || 'All';
    const statusFilter = ($('#bills-status-filter') && $('#bills-status-filter').value) || 'All';
    const all = getBills();
    const localFiltered = filterBills(all, q, payFilter, statusFilter);
    return mergeBillsForDisplay(localFiltered, _serverHits, q, payFilter, statusFilter);
  }

  function exportRangeLabel() {
    switch (billsDateRange) {
      case 'yesterday':
        return 'Yesterday';
      case '7d':
        return '7-days';
      case 'all':
        return 'All';
      case 'custom': {
        const a = billsCustomFrom || 'start';
        const b = billsCustomTo || 'end';
        return a + '_to_' + b;
      }
      default:
        return 'Today';
    }
  }

  function exportOutletSlug() {
    const settings = global.RS_SETTINGS || {};
    const sess = global.RS_API && RS_API.session ? RS_API.session() : null;
    const name =
      settings.set_restaurant_name ||
      settings.set_outlet_name ||
      (sess && (sess.tenant_name || sess.business_name)) ||
      'RestroSuite';
    return (
      String(name)
        .replace(/[^\w\-]+/g, '-')
        .replace(/-+/g, '-')
        .replace(/^-|-$/g, '')
        .slice(0, 40) || 'RestroSuite'
    );
  }

  function exportStamp() {
    const d = new Date();
    const pad = (n) => String(n).padStart(2, '0');
    return d.getFullYear() + pad(d.getMonth() + 1) + pad(d.getDate());
  }

  function numOrBlank(v) {
    if (v == null || v === '') {return '';}
    const n = Number(v);
    return Number.isFinite(n) ? n : '';
  }

  function paymentBreakdown(list) {
    const map = {};
    (list || []).forEach((b) => {
      if (String(b.status || '').toLowerCase() === 'refunded') {return;}
      if (Array.isArray(b.tenders) && b.tenders.length) {
        b.tenders.forEach((t) => {
          const method = t.method || b.pay || 'Cash';
          map[method] = (map[method] || 0) + (Number(t.amount) || 0);
        });
      } else {
        const method = b.pay || b.paymentMethod || 'Cash';
        map[method] = (map[method] || 0) + (Number(b.amount) || Number(b.total) || 0);
      }
    });
    return map;
  }

  /**
   * Real Excel .xlsx — Summary + Bills + Line items sheets.
   * Respects date range, search, payment, and status filters.
   */
  function exportBillsXlsx() {
    const list = collectExportList();
    if (!list.length) {
      toast('No bills to export for this range', 'fa-circle-exclamation');
      return false;
    }
    if (!global.RSXlsxLite || typeof RSXlsxLite.buildXlsx !== 'function') {
      toast('Excel engine missing — exporting CSV instead', 'fa-circle-exclamation');
      return exportBillsCsv();
    }

    const settings = global.RS_SETTINGS || {};
    const taxLabel = settings.set_tax_label || 'GST';
    const rangeLabel = exportRangeLabel();
    const outlet = exportOutletSlug();
    const paid = list.filter((b) => String(b.status || '').toLowerCase() === 'paid');
    const refunded = list.filter((b) => String(b.status || '').toLowerCase() === 'refunded');
    const sales = paid.reduce((s, b) => s + (Number(b.amount) || Number(b.total) || 0), 0);
    const aov = paid.length ? Math.round(sales / paid.length) : 0;
    const gstTotal = paid.reduce((s, b) => s + (Number(b.gst) || 0), 0);
    const payMap = paymentBreakdown(list);
    const now = new Date();

    const summaryRows = [
      ['RestroSuite Bill Export'],
      ['Outlet', outlet.replace(/-/g, ' ')],
      ['Range', rangeLabel.replace(/_/g, ' ')],
      ['Exported at', now.toLocaleString('en-IN')],
      [],
      ['Metric', 'Value'],
      ['Bills in export', list.length],
      ['Paid bills', paid.length],
      ['Refunded bills', refunded.length],
      ['Sales (paid)', sales],
      ['Avg order value', aov],
      [taxLabel + ' (from bills)', gstTotal],
      [],
      ['Payment breakdown', 'Amount'],
    ];
    Object.keys(payMap)
      .sort()
      .forEach((k) => summaryRows.push([k, payMap[k]]));
    if (!Object.keys(payMap).length) {summaryRows.push(['—', 0]);}
    summaryRows.push([]);
    summaryRows.push(['Notes']);
    summaryRows.push(['Stats match the active Bills date range and filters.']);
    summaryRows.push(['Open the Bills sheet for one row per bill; Line items for pivots.']);

    const billHeaders = [
      'Bill No',
      'Date',
      'Date Display',
      'Table',
      'Customer',
      'Phone',
      'Item Count',
      'Line Items',
      'Subtotal',
      taxLabel,
      'Discount',
      'Total',
      'Payment',
      'Tenders',
      'Status',
      'Channel',
      'Station',
      'Shift',
      'Cashier',
      'Order Type',
    ];
    const billRows = [billHeaders];
    list.forEach((b) => {
      const tenders = Array.isArray(b.tenders)
        ? b.tenders.map((t) => (t.method || '') + ':' + (Number(t.amount) || 0)).join(' | ')
        : '';
      const itemCount =
        Array.isArray(b._items) && b._items.length
          ? b._items.reduce((acc, i) => acc + (Number(i.qty) || 1), 0)
          : numOrBlank(b.items);
      billRows.push([
        b.no || b.orderId || b.id || '',
        formatBillTimeIsoExcel(b),
        formatBillTime(b),
        b.table || '',
        b.customerName || b.customer || '',
        b.customerPhone || '',
        itemCount,
        lineItemsSummary(b),
        numOrBlank(b.subtotal),
        numOrBlank(b.gst),
        numOrBlank(b.discount != null ? b.discount : b.disc),
        numOrBlank(b.amount != null ? b.amount : b.total),
        b.pay || b.paymentMethod || '',
        tenders,
        b.status || '',
        b.channel || b.channelCode || '',
        b.stationLabel || b.stationId || '',
        b.shiftId || '',
        b.cashier || '',
        b.orderType || '',
      ]);
    });

    const lineHeaders = [
      'Bill No',
      'Date',
      'Table',
      'Customer',
      'Payment',
      'Status',
      'Item',
      'Qty',
      'Unit Price',
      'Line Total',
      'Note',
    ];
    const lineRows = [lineHeaders];
    list.forEach((b) => {
      const billNo = b.no || b.orderId || b.id || '';
      const date = formatBillTimeIsoExcel(b);
      const table = b.table || '';
      const cust = b.customerName || b.customer || '';
      const pay = b.pay || b.paymentMethod || '';
      const status = b.status || '';
      const items = Array.isArray(b._items) ? b._items : [];
      if (items.length) {
        items.forEach((it) => {
          const qty = Number(it.qty) || 1;
          const price = Number(it.price) || 0;
          lineRows.push([
            billNo,
            date,
            table,
            cust,
            pay,
            status,
            it.name || 'Item',
            qty,
            price,
            Math.round(qty * price * 100) / 100,
            it.note || it.notes || '',
          ]);
        });
      } else {
        lineRows.push([
          billNo,
          date,
          table,
          cust,
          pay,
          status,
          lineItemsSummary(b) || 'Bill total',
          1,
          numOrBlank(b.amount != null ? b.amount : b.total) || 0,
          numOrBlank(b.amount != null ? b.amount : b.total) || 0,
          '',
        ]);
      }
    });

    try {
      const bytes = RSXlsxLite.buildXlsx([
        { name: 'Summary', cols: [28, 22], rows: summaryRows },
        {
          name: 'Bills',
          cols: [16, 18, 18, 14, 16, 14, 10, 28, 10, 10, 10, 10, 10, 16, 10, 10, 12, 12, 12, 12],
          rows: billRows,
        },
        {
          name: 'Line items',
          cols: [16, 18, 14, 16, 10, 10, 24, 8, 10, 10, 16],
          rows: lineRows,
        },
      ]);
      const fname = outlet + '-Bills-' + rangeLabel + '-' + exportStamp() + '.xlsx';
      RSXlsxLite.downloadXlsx(bytes, fname);
      try { if (window.RSActionFeedback) {window.RSActionFeedback.success();} } catch(_) {}
      toast(
        'Exported ' + list.length + ' bills · ' + rangeLabel.replace(/_/g, ' ') + ' · Excel',
        'fa-file-excel'
      );
      return true;
    } catch (e) {
      console.warn('[BillsHistory] xlsx export failed', e);
      toast('Excel export failed — try CSV', 'fa-circle-exclamation');
      return false;
    }
  }

  /**
   * Export bills as Excel-friendly CSV (UTF-8 BOM).
   * Respects current search / payment / status / date filters.
   */
  function exportBillsCsv() {
    const prog =
      global.RSProgress &&
      RSProgress.open({
        title: 'Exporting bills…',
        sub: 'Building CSV for the selected range',
        total: 0,
        unit: 'bills',
      });
    try {
      if (prog) {prog.setIndeterminate('Preparing rows…');}
      const result = _exportBillsCsvInner(prog);
      if (prog) {prog.close();}
      return result;
    } catch (e) {
      if (prog) {prog.close();}
      throw e;
    }
  }
  function _exportBillsCsvInner(prog) {
    const list = collectExportList();
    if (!list.length) {
      toast('No bills to export for this range', 'fa-circle-exclamation');
      return false;
    }
    if (prog) {prog.update({ total: list.length, done: 0, unit: 'bills', label: 'Writing rows…' });}

    const settings = global.RS_SETTINGS || {};
    const taxLabel = settings.set_tax_label || 'GST';
    const headers = [
      'Bill No',
      'Date (Excel)',
      'Date (Display)',
      'Table',
      'Item Count',
      'Line Items',
      'Customer',
      'Phone',
      'Subtotal',
      taxLabel,
      'Discount',
      'Total',
      'Payment',
      'Tenders',
      'Status',
      'Channel',
      'Station',
      'Shift',
      'Cashier',
      'Order Type',
    ];

    const rows = list.map((b, idx) => {
      const tenders = Array.isArray(b.tenders)
        ? b.tenders.map((t) => (t.method || '') + ':' + (Number(t.amount) || 0)).join('|')
        : '';
      const itemCount =
        Array.isArray(b._items) && b._items.length
          ? b._items.reduce((acc, i) => acc + (Number(i.qty) || 1), 0)
          : b.items != null
            ? b.items
            : '';
      if (prog && (idx % 25 === 0 || idx === list.length - 1)) {prog.update({ done: idx + 1 });}
      return [
        b.no || b.orderId || b.id || '',
        formatBillTimeIsoExcel(b),
        formatBillTime(b),
        b.table || '',
        itemCount,
        lineItemsSummary(b),
        b.customerName || b.customer || '',
        b.customerPhone || '',
        b.subtotal != null ? b.subtotal : '',
        b.gst != null ? b.gst : '',
        b.discount != null ? b.discount : b.disc != null ? b.disc : '',
        b.amount != null ? b.amount : b.total != null ? b.total : '',
        b.pay || b.paymentMethod || '',
        tenders,
        b.status || '',
        b.channel || b.channelCode || '',
        b.stationLabel || b.stationId || '',
        b.shiftId || '',
        b.cashier || '',
        b.orderType || '',
      ]
        .map(csvEscape)
        .join(',');
    });

    const csv = '\uFEFF' + [headers.join(','), ...rows].join('\r\n');
    const fname = exportOutletSlug() + '-Bills-' + exportRangeLabel() + '-' + exportStamp() + '.csv';

    try {
      if (global.RS && typeof RS.downloadFile === 'function') {
        RS.downloadFile(csv, 'text/csv;charset=utf-8;', fname);
      } else {
        const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = fname;
        document.body.appendChild(a);
        a.click();
        a.remove();
        URL.revokeObjectURL(url);
      }
      toast('Exported ' + list.length + ' bills · CSV', 'fa-file-csv');
      return true;
    } catch (e) {
      console.warn('[BillsHistory] export failed', e);
      toast('Export failed — try again', 'fa-circle-exclamation');
      return false;
    }
  }

  function wireExportButton() {
    const btn = document.getElementById('btn-export-bills');
    if (btn && btn.dataset.rsExportBound !== '1') {
      btn.dataset.rsExportBound = '1';
      btn.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        try { if (window.RSActionFeedback) {window.RSActionFeedback.click();} } catch(_) {}
        exportBillsXlsx();
      });
    }
    const csvBtn = document.getElementById('btn-export-bills-csv');
    if (csvBtn && csvBtn.dataset.rsExportBound !== '1') {
      csvBtn.dataset.rsExportBound = '1';
      csvBtn.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        exportBillsCsv();
      });
    }
  }

  function rangeDisplayLabel() {
    switch (billsDateRange) {
      case 'yesterday':
        return 'Yesterday';
      case '7d':
        return 'Last 7 days';
      case 'all':
        return 'All history';
      case 'custom': {
        const a = billsCustomFrom || '…';
        const b = billsCustomTo || '…';
        return a + ' → ' + b;
      }
      default:
        return 'Today';
    }
  }

  function reportTitleForRange() {
    switch (billsDateRange) {
      case 'yesterday':
        return 'YESTERDAY SALES SUMMARY';
      case '7d':
        return '7-DAY SALES SUMMARY';
      case 'all':
        return 'FULL HISTORY SALES SUMMARY';
      case 'custom':
        return 'CUSTOM RANGE SALES SUMMARY';
      default:
        return 'DAILY SALES SUMMARY';
    }
  }

  function formatShortDate(d) {
    if (!d || Number.isNaN(d.getTime())) {return '—';}
    try {
      return d.toLocaleDateString('en-IN', {
        day: '2-digit',
        month: 'short',
        year: 'numeric',
      });
    } catch (_) {
      return d.toLocaleDateString();
    }
  }

  function periodFromBills(list) {
    let min = null;
    let max = null;
    (list || []).forEach((b) => {
      const d = parseBillDate(b);
      if (!d) {return;}
      if (!min || d < min) {min = d;}
      if (!max || d > max) {max = d;}
    });
    if (min && max) {
      const a = formatShortDate(min);
      const b = formatShortDate(max);
      return a === b ? a : a + ' – ' + b;
    }
    return rangeDisplayLabel();
  }

  function money(n) {
    return rs(Number(n) || 0);
  }

  /**
   * 10/10 printable / PDF sales report for the active Bills range + filters.
   * A4 layout with clean margins (no thermal-on-A4 empty page look).
   */
  function printSalesReport() {
    const list = collectExportList();
    if (!list.length) {
      toast('No bills in this range to report', 'fa-circle-exclamation');
      return false;
    }

    const settings = global.RS_SETTINGS || {};
    const sess = global.RS_API && RS_API.session ? RS_API.session() : null;
    let outletName =
      settings.set_restaurant_name ||
      settings.set_outlet_name ||
      (sess && (sess.tenant_name || sess.business_name)) ||
      'RestroSuite Outlet';
    if (!outletName || /outlet name/i.test(outletName)) {outletName = 'RestroSuite Outlet';}

    const taxLabel = settings.set_tax_label || 'GST';
    const taxPct =
      settings.set_tax_rate != null && settings.set_tax_rate !== ''
        ? Number(settings.set_tax_rate)
        : settings.set_gst_rate != null
          ? Number(settings.set_gst_rate)
          : null;

    const paidBills = list.filter((b) => String(b.status || 'paid').toLowerCase() === 'paid');
    const refundBills = list.filter((b) => {
      const st = String(b.status || '').toLowerCase();
      return st === 'refunded' || st === 'voided' || st === 'void';
    });
    const totalRevenue = paidBills.reduce(
      (sum, b) => sum + (Number(b.amount) || Number(b.total) || 0),
      0
    );
    const refundTotal = refundBills.reduce(
      (sum, b) => sum + (Number(b.amount) || Number(b.total) || 0),
      0
    );
    const totalOrders = paidBills.length;
    const aov = totalOrders > 0 ? Math.round(totalRevenue / totalOrders) : 0;
    const gstFromBills = paidBills.reduce((sum, b) => sum + (Number(b.gst) || 0), 0);
    const divisor = taxPct && taxPct > 0 ? 1 + taxPct / 100 : 1.05;
    const gstCollected =
      gstFromBills > 0
        ? Math.round(gstFromBills * 100) / 100
        : Math.round((totalRevenue - totalRevenue / divisor) * 100) / 100;
    const netTaxableSales = Math.round((totalRevenue - gstCollected) * 100) / 100;
    const taxPctLabel =
      taxPct != null && Number.isFinite(taxPct) ? String(taxPct) + '%' : gstFromBills > 0 ? 'as billed' : 'est. 5%';

    const paymentMethods = {};
    paidBills.forEach((b) => {
      if (b.tenders && Array.isArray(b.tenders) && b.tenders.length) {
        b.tenders.forEach((t) => {
          const method = t.method || 'Cash';
          paymentMethods[method] = (paymentMethods[method] || 0) + Number(t.amount || 0);
        });
      } else {
        const method = b.pay || b.paymentMethod || 'Cash';
        paymentMethods[method] =
          (paymentMethods[method] || 0) + (Number(b.amount) || Number(b.total) || 0);
      }
    });

    const payRows = Object.keys(paymentMethods)
      .sort()
      .map(
        (method) =>
          `<tr><td>${_e(method)}</td><td class="num">${_e(money(paymentMethods[method]))}</td></tr>`
      )
      .join('');

    // Compact bill list (latest first-ish — keep list order)
    const billListRows = list
      .slice(0, 25)
      .map((b) => {
        const st = String(b.status || 'paid');
        return `<tr>
          <td>${_e(b.no || b.orderId || b.id || '—')}</td>
          <td>${_e(formatBillTime(b) || '—')}</td>
          <td>${_e(b.pay || b.paymentMethod || '—')}</td>
          <td class="num">${_e(money(b.amount != null ? b.amount : b.total))}</td>
          <td>${_e(st)}</td>
        </tr>`;
      })
      .join('');
    const moreNote =
      list.length > 25
        ? `<p class="note">Showing 25 of ${list.length} bills. Use Export Excel for the full list.</p>`
        : '';

    const now = new Date();
    const printedAt = now.toLocaleString('en-IN', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
      hour12: true,
    });
    const period = periodFromBills(list);
    const rangeLabel = rangeDisplayLabel();
    const title = reportTitleForRange();
    const docTitle = 'Sales Report · ' + rangeLabel + ' · ' + outletName;

    const staff =
      (sess && (sess.display_name || sess.username || sess.email)) ||
      sessionStorage.getItem('logged_in_user') ||
      'Staff';

    const html = `
<div class="rs-sales-report">
  <header class="sr-head">
    <div class="sr-brand">
      <div class="sr-outlet">${_e(outletName)}</div>
      <div class="sr-title">${_e(title)}</div>
    </div>
    <div class="sr-meta">
      <div><span>Period</span><strong>${_e(period)}</strong></div>
      <div><span>Filter</span><strong>${_e(rangeLabel)}</strong></div>
      <div><span>Printed</span><strong>${_e(printedAt)}</strong></div>
      <div><span>By</span><strong>${_e(String(staff))}</strong></div>
    </div>
  </header>

  <section class="sr-kpis">
    <div class="kpi"><div class="k-l">Paid bills</div><div class="k-v">${totalOrders}</div></div>
    <div class="kpi"><div class="k-l">Gross sales</div><div class="k-v">${_e(money(totalRevenue))}</div></div>
    <div class="kpi"><div class="k-l">Avg order</div><div class="k-v">${_e(money(aov))}</div></div>
    <div class="kpi"><div class="k-l">Refunds</div><div class="k-v">${refundBills.length} · ${_e(money(refundTotal))}</div></div>
  </section>

  <div class="sr-grid">
    <section class="sr-card">
      <h3>Payment breakdown</h3>
      <table class="sr-table">
        <thead><tr><th>Method</th><th class="num">Amount</th></tr></thead>
        <tbody>
          ${payRows || '<tr><td colspan="2">No paid tenders</td></tr>'}
        </tbody>
        <tfoot><tr><td>Total paid</td><td class="num">${_e(money(totalRevenue))}</td></tr></tfoot>
      </table>
    </section>
    <section class="sr-card">
      <h3>Tax &amp; totals</h3>
      <table class="sr-table">
        <tbody>
          <tr><td>Net taxable sales</td><td class="num">${_e(money(netTaxableSales))}</td></tr>
          <tr><td>${_e(taxLabel)} (${_e(taxPctLabel)})</td><td class="num">${_e(money(gstCollected))}</td></tr>
          <tr><td>Refunds / voids</td><td class="num">${_e(money(refundTotal))}</td></tr>
          <tr class="em"><td>Gross revenue (paid)</td><td class="num">${_e(money(totalRevenue))}</td></tr>
          <tr><td>Net after refunds</td><td class="num">${_e(money(totalRevenue - refundTotal))}</td></tr>
        </tbody>
      </table>
    </section>
  </div>

  <section class="sr-card">
    <h3>Bills in this report (${list.length})</h3>
    <table class="sr-table sr-bills">
      <thead>
        <tr>
          <th>Bill No.</th>
          <th>Time</th>
          <th>Pay</th>
          <th class="num">Amount</th>
          <th>Status</th>
        </tr>
      </thead>
      <tbody>${billListRows}</tbody>
    </table>
    ${moreNote}
  </section>

  <footer class="sr-foot">
    <div>RestroSuite · Sales report · ${_e(rangeLabel)}</div>
    <div>*** End of report ***</div>
  </footer>
</div>`;

    const style = `
      @page { size: A4; margin: 14mm 12mm; }
      * { box-sizing: border-box; }
      html, body {
        margin: 0; padding: 0;
        color: #111;
        font-family: "Segoe UI", system-ui, -apple-system, sans-serif;
        font-size: 12px;
        background: #fff;
        -webkit-print-color-adjust: exact;
        print-color-adjust: exact;
      }
      .rs-sales-report { max-width: 720px; margin: 0 auto; }
      .sr-head {
        display: flex; justify-content: space-between; gap: 16px;
        border-bottom: 2px solid #111; padding-bottom: 12px; margin-bottom: 14px;
      }
      .sr-outlet { font-size: 18px; font-weight: 800; letter-spacing: -0.02em; }
      .sr-title { font-size: 11px; font-weight: 700; color: #555; margin-top: 4px; letter-spacing: 0.06em; }
      .sr-meta { display: grid; grid-template-columns: 1fr 1fr; gap: 4px 14px; font-size: 11px; min-width: 220px; }
      .sr-meta span { display: block; color: #777; font-size: 10px; text-transform: uppercase; letter-spacing: 0.04em; }
      .sr-meta strong { font-weight: 700; }
      .sr-kpis {
        display: grid; grid-template-columns: repeat(4, 1fr); gap: 8px; margin-bottom: 14px;
      }
      .kpi {
        border: 1px solid #ddd; border-radius: 8px; padding: 10px 10px 8px;
        background: #fafafa;
      }
      .k-l { font-size: 10px; color: #666; text-transform: uppercase; letter-spacing: 0.04em; }
      .k-v { font-size: 15px; font-weight: 800; margin-top: 4px; }
      .sr-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; margin-bottom: 14px; }
      .sr-card {
        border: 1px solid #e5e5e5; border-radius: 10px; padding: 12px 14px; margin-bottom: 12px;
      }
      .sr-card h3 {
        margin: 0 0 8px; font-size: 12px; font-weight: 800;
        text-transform: uppercase; letter-spacing: 0.05em; color: #333;
      }
      .sr-table { width: 100%; border-collapse: collapse; }
      .sr-table th, .sr-table td {
        text-align: left; padding: 5px 4px; border-bottom: 1px solid #eee; font-size: 11.5px;
      }
      .sr-table th { color: #666; font-size: 10px; text-transform: uppercase; letter-spacing: 0.04em; }
      .sr-table .num, .sr-table td.num, .sr-table th.num { text-align: right; font-variant-numeric: tabular-nums; }
      .sr-table tfoot td { font-weight: 800; border-top: 1px solid #ccc; border-bottom: 0; }
      .sr-table tr.em td { font-weight: 800; font-size: 13px; border-top: 1px dashed #bbb; }
      .sr-bills td { font-size: 11px; }
      .note { margin: 8px 0 0; font-size: 10.5px; color: #777; }
      .sr-foot {
        margin-top: 16px; padding-top: 10px; border-top: 1px dashed #bbb;
        display: flex; justify-content: space-between; font-size: 10px; color: #777;
      }
      @media print {
        body { padding: 0; }
        .sr-card, .kpi { break-inside: avoid; }
      }
      @media screen {
        body { padding: 18px; background: #f3f3f3; }
        .rs-sales-report {
          background: #fff; padding: 22px 24px; border-radius: 8px;
          box-shadow: 0 8px 24px rgba(0,0,0,.08);
        }
      }
      @media (max-width: 640px) {
        .sr-kpis, .sr-grid, .sr-head { grid-template-columns: 1fr 1fr; display: grid; }
        .sr-head { display: block; }
        .sr-meta { margin-top: 10px; }
      }
    `;

    const fullHtml =
      '<!doctype html><html><head><meta charset="utf-8"><title>' +
      _e(docTitle) +
      '</title><style>' +
      style +
      '</style></head><body>' +
      html +
      '</body></html>';

    try {
      // Prefer iframe with our A4 styles (RSPrint forces thermal width)
      const f = document.createElement('iframe');
      f.setAttribute('title', docTitle);
      f.style.cssText = 'position:fixed;right:0;bottom:0;width:0;height:0;border:0;';
      document.body.appendChild(f);
      const w = f.contentWindow;
      const d = w.document;
      d.open();
      d.write(fullHtml);
      d.close();
      const trigger = () => {
        try {
          w.focus();
          w.print();
        } catch (e) {
          console.warn('[BillsHistory] print failed', e);
        }
        setTimeout(() => {
          try {
            f.remove();
          } catch (_) {}
        }, 1500);
      };
      // Wait for layout
      setTimeout(trigger, 250);
      try { if (window.RSActionFeedback) {window.RSActionFeedback.success();} } catch(_) {}
      toast('Opening sales report · ' + rangeLabel, 'fa-print');
      return true;
    } catch (e) {
      console.warn('[BillsHistory] printSalesReport failed', e);
      toast('Could not open print report', 'fa-circle-exclamation');
      return false;
    }
  }

  function wirePrintReportButton() {
    const btn = document.getElementById('btn-print-day-report');
    if (!btn || btn.dataset.rsPrintBound === '1') {return;}
    btn.dataset.rsPrintBound = '1';
    btn.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      printSalesReport();
    });
  }

  /** Filter button focuses the inline Payment / Status selects (no dead control). */
  function wireFilterButton() {
    const btn = document.getElementById('btn-bills-filter');
    if (!btn || btn.dataset.rsFilterBound === '1') {return;}
    btn.dataset.rsFilterBound = '1';
    btn.addEventListener('click', (e) => {
      e.preventDefault();
      const pay = document.getElementById('bills-pay-filter');
      const status = document.getElementById('bills-status-filter');
      const bar = document.getElementById('bills-filter-hint');
      if (bar) {
        bar.hidden = false;
        bar.setAttribute('aria-hidden', 'false');
      }
      [pay, status].forEach((el) => {
        if (!el) {return;}
        el.classList.add('bills-filter-flash');
        setTimeout(() => el.classList.remove('bills-filter-flash'), 1600);
      });
      if (pay) {
        try {
          pay.focus();
        } catch (_) {}
      }
      toast('Use date chips + Payment / Status filters', 'fa-filter');
    });
  }

  function statusPillHtml(b) {
    const st = String((b && b.status) || '').toLowerCase();
    if (st === 'paid') {return '<span class="pill pill-green" style="padding:3px 9px">Paid</span>';}
    if (st === 'refunded' || st === 'voided' || st === 'void')
      {return '<span class="pill pill-red" style="padding:3px 9px">Refunded</span>';}
    return `<span class="pill" style="padding:3px 9px">${_e(b.status || '—')}</span>`;
  }

  function closeAllBillMoreMenus(except) {
    document.querySelectorAll('.bills-more-menu').forEach((menu) => {
      if (except && menu === except) {return;}
      menu.hidden = true;
    });
    document.querySelectorAll('.bills-more.is-open').forEach((wrap) => {
      if (except && wrap.contains(except)) {return;}
      wrap.classList.remove('is-open');
    });
  }

  function paintBillsTable(filtered) {
    const body = $('#bills-table-body');
    if (!body) {return;}
    try {
      if (window.RSSkel && RSSkel.clear) {RSSkel.clear(body);}
    } catch (_) {}

    if (!filtered.length) {
      const q = ($('#bills-search') && $('#bills-search').value) || '';
      const hasFilter =
        q.trim() ||
        (($('#bills-pay-filter') && $('#bills-pay-filter').value) || 'All') !== 'All' ||
        (($('#bills-status-filter') && $('#bills-status-filter').value) || 'All') !== 'All' ||
        (billsDateRange && billsDateRange !== 'all');
      const emptyTitle =
        hasFilter
          ? 'No bills match your filters'
          : billsDateRange === 'today'
            ? 'No bills yet today'
            : 'No bills in this range';
      const emptyHint = hasFilter
        ? 'Try another date chip, clear search, or set Payment / Status to All.'
        : 'Completed sales from POS appear here for reprint, export, and reports.';
      body.innerHTML = `<tr class="bills-empty-row"><td colspan="9" style="padding:0;border:none">
        <div class="sr-empty" style="padding:40px 20px">
          <i class="fa-solid fa-file-invoice-dollar" style="font-size:24px;opacity:.4;display:block;margin-bottom:8px"></i>
          <div style="font-weight:700;color:var(--text);margin-bottom:4px">${emptyTitle}</div>
          <div style="color:var(--text-soft);font-size:13px;max-width:380px;margin:0 auto">${emptyHint}</div>
        </div>
      </td></tr>`;
      return;
    }

    body.innerHTML = filtered
      .map((b) => {
        const cust = b.customerName || b.customer || '';
        const phone = b.customerPhone || '';
        const custHtml = cust
          ? `<div class="bc-name">${_e(cust)}</div>${phone ? `<div class="bc-phone">${_e(phone)}</div>` : ''}`
          : phone
            ? `<div class="bc-phone">${_e(phone)}</div>`
            : '<span class="bc-empty">—</span>';
        const refunded = String(b.status || '').toLowerCase() === 'refunded';
        return `
      <tr data-bill-no="${_e(b.no || b.orderId || b.id || '')}">
        <td><b>${_e(b.no || b.orderId || b.id || '-')}</b></td>
        <td class="td-time" title="${_e(formatBillTimeIsoExcel(b) || '')}">${_e(formatBillTime(b) || '-')}</td>
        <td>${_e(b.table || '-')}</td>
        <td class="td-cust">${custHtml}</td>
        <td>${_e(b.items)}</td>
        <td><span class="pill ${payPill[b.pay] || ''}" style="padding:3px 9px">${_e(b.pay || '—')}</span></td>
        <td class="td-strong">${rs(b.amount)}</td>
        <td>${statusPillHtml(b)}</td>
        <td>
          <div class="row-actions bills-row-actions">
            <button type="button" class="icon-act go" title="Reprint preview" aria-label="Reprint bill ${_e(b.no || b.orderId || '')}"><i class="fa-solid fa-print"></i></button>
            <button type="button" class="icon-act thermal-act" title="Thermal print" aria-label="Thermal print bill ${_e(b.no || b.orderId || '')}"><i class="fa-solid fa-receipt"></i></button>
            <button type="button" class="icon-act rebill-act" title="Rebill / load into POS" aria-label="Rebill ${_e(b.no || b.orderId || '')}"><i class="fa-solid fa-rotate"></i></button>
            <button type="button" class="icon-act wa-act" title="Share on WhatsApp" aria-label="Share bill ${_e(b.no || b.orderId || '')}"><i class="fa-brands fa-whatsapp"></i></button>
            <div class="bills-more">
              <button type="button" class="icon-act more-act" title="More actions" aria-label="More actions" aria-haspopup="true" aria-expanded="false"><i class="fa-solid fa-ellipsis"></i></button>
              <div class="bills-more-menu" hidden role="menu">
                <button type="button" class="bills-more-item refund-act" role="menuitem" ${refunded ? 'disabled' : ''}><i class="fa-solid fa-ban"></i> Void / refund</button>
                <button type="button" class="bills-more-item del-act danger" role="menuitem"><i class="fa-solid fa-trash-can"></i> Delete bill</button>
              </div>
            </div>
          </div>
        </td>
      </tr>`;
      })
      .join('');

    const visibleBills = filtered;
    if (body._rsBillActionHandler) {body.removeEventListener('click', body._rsBillActionHandler, true);}
    body._rsBillActionHandler = (e) => {
      const moreBtn = e.target.closest('.more-act');
      if (moreBtn && body.contains(moreBtn)) {
        e.preventDefault();
        e.stopPropagation();
        const wrap = moreBtn.closest('.bills-more');
        const menu = wrap && wrap.querySelector('.bills-more-menu');
        if (!menu) {return;}
        const open = menu.hidden;
        closeAllBillMoreMenus();
        if (open) {
          menu.hidden = false;
          wrap.classList.add('is-open');
          moreBtn.setAttribute('aria-expanded', 'true');
        }
        return;
      }

      const menuItem = e.target.closest('.bills-more-item');
      const btn = menuItem || e.target.closest('.icon-act');
      if (!btn || !body.contains(btn) || btn.disabled) {return;}
      if (btn.classList.contains('more-act')) {return;}
      e.preventDefault();
      e.stopPropagation();
      e.stopImmediatePropagation();
      const row = btn.closest('tr');
      const bill = visibleBills[[...body.querySelectorAll('tr')].indexOf(row)];
      if (!bill) {return;}
      const live = getBills().find(
        (x) => x === bill || String(x.no || x.orderId) === String(bill.no || bill.orderId)
      );
      const target = live || bill;
      closeAllBillMoreMenus();
      if (btn.classList.contains('go')) {return showBillReceipt(target);}
      if (btn.classList.contains('thermal-act')) {return printBillThermal(target);}
      if (btn.classList.contains('rebill-act')) {return rebillToPos(target);}
      if (btn.classList.contains('refund-act')) {return markBillRefunded(target);}
      if (btn.classList.contains('del-act')) {return deleteBill(target);}
      if (btn.classList.contains('wa-act')) {return shareBillReceipt(target);}
      return shareBillReceipt(target);
    };
    body.addEventListener('click', body._rsBillActionHandler, true);

    if (!document._rsBillsMoreDocBound) {
      document._rsBillsMoreDocBound = true;
      document.addEventListener('click', (ev) => {
        if (!ev.target.closest('.bills-more')) {closeAllBillMoreMenus();}
      });
    }
    // Notify mobile card layer (product-10x) without thrashing on unrelated DOM
    try {
      document.dispatchEvent(new CustomEvent('rs:render-bills', { detail: { count: filtered.length } }));
    } catch (_) {}
  }

  function renderBills() {
    const BILLS = getBills();
    // Pre-hydrate + no local rows → skeleton (never blank hang)
    try {
      if (
        window.RSSkel &&
        typeof RSSkel.shouldShow === 'function' &&
        RSSkel.shouldShow(BILLS && BILLS.length > 0)
      ) {
        const body = $('#bills-table-body');
        if (body && RSSkel.billsTable) {
          RSSkel.paint(body, RSSkel.billsTable({ rows: 7 }));
        }
        return;
      }
    } catch (_) {}

    // Stats always match the active date range (before search/pay/status filters)
    const ranged = BILLS.filter(billInDateRange);
    const paidBills = ranged.filter((b) => String(b.status || '').toLowerCase() === 'paid');
    const totalSales = paidBills.reduce((sum, b) => sum + (Number(b.amount) || 0), 0);
    const countInRange = ranged.length;
    const aov = paidBills.length > 0 ? Math.round(totalSales / paidBills.length) : 0;
    const refunds = ranged.filter((b) => String(b.status || '').toLowerCase() === 'refunded').length;
    const labels = dateRangeLabels();

    const salesEl = document.getElementById('bills-stat-sales');
    if (salesEl) {salesEl.textContent = rs(totalSales);}
    const countEl = document.getElementById('bills-stat-count');
    if (countEl) {countEl.textContent = countInRange;}
    const aovEl = document.getElementById('bills-stat-aov');
    if (aovEl) {aovEl.textContent = rs(aov);}
    const refundsEl = document.getElementById('bills-stat-refunds');
    if (refundsEl) {refundsEl.textContent = refunds;}
    const salesLbl = document.getElementById('bills-stat-sales-label');
    if (salesLbl) {salesLbl.textContent = labels.sales;}
    const countLbl = document.getElementById('bills-stat-count-label');
    if (countLbl) {countLbl.textContent = labels.count;}
    const refundsLbl = document.getElementById('bills-stat-refunds-label');
    if (refundsLbl) {refundsLbl.textContent = labels.refunds;}

    syncDateChipsUi();

    const q = ($('#bills-search')?.value || '').toLowerCase();
    const payFilter = $('#bills-pay-filter')?.value || 'All';
    const statusFilter = $('#bills-status-filter')?.value || 'All';

    const localFiltered = filterBills(BILLS, q, payFilter, statusFilter);
    const merged = mergeBillsForDisplay(localFiltered, _serverHits, q, payFilter, statusFilter);
    paintBillsTable(merged);

    const meta = document.getElementById('bills-result-meta');
    if (meta) {
      const n = merged.length;
      const extraFilter =
        (q && q.trim()) || payFilter !== 'All' || statusFilter !== 'All';
      meta.textContent = extraFilter
        ? `${n} of ${countInRange}`
        : n
          ? `${n} bill${n === 1 ? '' : 's'}`
          : '';
      meta.hidden = !n && !extraFilter;
    }

    const gen = ++_searchGen;
    if (String(q || '').trim().length >= 2) {
      searchBillsServer(q, 50).then((rows) => {
        if (gen !== _searchGen) {return;}
        if (!rows) {return;}
        _serverHits = rows;
        const list = getBills();
        rows.forEach((r) => {
          const key = String(r.no || r.orderId || '');
          if (!key) {return;}
          const idx = list.findIndex((b) => String(b.no || b.orderId) === key);
          if (idx === -1) {list.push(r);}
        });
        const q2 = ($('#bills-search')?.value || '').toLowerCase();
        const pf2 = $('#bills-pay-filter')?.value || 'All';
        const sf2 = $('#bills-status-filter')?.value || 'All';
        const local2 = filterBills(getBills(), q2, pf2, sf2);
        paintBillsTable(mergeBillsForDisplay(local2, rows, q2, pf2, sf2));
      });
    } else {
      _serverHits = [];
    }
  }

  function syncDateChipsUi() {
    const chips = document.getElementById('bills-date-chips');
    if (chips) {
      chips.querySelectorAll('[data-range]').forEach((btn) => {
        btn.classList.toggle('is-active', btn.getAttribute('data-range') === billsDateRange);
      });
    }
    const custom = document.getElementById('bills-custom-range');
    if (custom) {custom.hidden = billsDateRange !== 'custom';}
    const from = document.getElementById('bills-date-from');
    const to = document.getElementById('bills-date-to');
    if (from && billsCustomFrom) {from.value = billsCustomFrom;}
    if (to && billsCustomTo) {to.value = billsCustomTo;}
  }

  function wireDateChips() {
    const chips = document.getElementById('bills-date-chips');
    if (chips && !chips.dataset.rsBound) {
      chips.dataset.rsBound = '1';
      chips.addEventListener('click', (e) => {
        const btn = e.target.closest('[data-range]');
        if (!btn || !chips.contains(btn)) {return;}
        billsDateRange = btn.getAttribute('data-range') || 'today';
        try {
          localStorage.setItem('rs_bills_date_range', billsDateRange);
        } catch (_) {}
        if (billsDateRange === 'custom') {
          syncDateChipsUi();
          const from = document.getElementById('bills-date-from');
          if (from) {
            try {
              from.focus();
            } catch (_) {}
          }
          return;
        }
        renderBills();
      });
    }
    const apply = document.getElementById('bills-date-apply');
    if (apply && !apply.dataset.rsBound) {
      apply.dataset.rsBound = '1';
      apply.addEventListener('click', () => {
        const from = document.getElementById('bills-date-from');
        const to = document.getElementById('bills-date-to');
        billsCustomFrom = (from && from.value) || '';
        billsCustomTo = (to && to.value) || '';
        billsDateRange = 'custom';
        try {
          localStorage.setItem('rs_bills_date_range', 'custom');
          localStorage.setItem('rs_bills_date_from', billsCustomFrom);
          localStorage.setItem('rs_bills_date_to', billsCustomTo);
        } catch (_) {}
        if (!billsCustomFrom && !billsCustomTo) {
          toast('Pick a from and/or to date', 'fa-calendar');
          return;
        }
        renderBills();
      });
    }
  }

  function wireFilterHint() {
    const bar = document.getElementById('bills-filter-hint');
    const dismiss = document.getElementById('bills-hint-dismiss');
    let dismissed = false;
    try {
      dismissed = localStorage.getItem('rs_bills_hint_dismissed') === '1';
    } catch (_) {}
    if (bar && !dismissed) {
      bar.hidden = false;
      bar.setAttribute('aria-hidden', 'false');
    }
    if (dismiss && !dismiss.dataset.rsBound) {
      dismiss.dataset.rsBound = '1';
      dismiss.addEventListener('click', () => {
        if (bar) {
          bar.hidden = true;
          bar.setAttribute('aria-hidden', 'true');
        }
        try {
          localStorage.setItem('rs_bills_hint_dismissed', '1');
        } catch (_) {}
      });
    }
  }

  function debounce(fn, wait) {
    let t;
    return function debounced() {
      const args = arguments;
      const ctx = this;
      clearTimeout(t);
      t = setTimeout(() => fn.apply(ctx, args), wait || 60);
    };
  }

  function bindFilters() {
    wireDateChips();
    wireFilterHint();
    renderBills();
    wireExportButton();
    wirePrintReportButton();
    wireFilterButton();
    const search = $('#bills-search');
    if (search && !search._rsListenerBound) {
      search._rsListenerBound = true;
      search.addEventListener('input', debounce(renderBills, 180));
    }
    const payFil = $('#bills-pay-filter');
    if (payFil && !payFil._rsListenerBound) {
      payFil._rsListenerBound = true;
      payFil.addEventListener('change', renderBills);
    }
    const statusFil = $('#bills-status-filter');
    if (statusFil && !statusFil._rsListenerBound) {
      statusFil._rsListenerBound = true;
      statusFil.addEventListener('change', renderBills);
    }
  }

  const api = {
    receiptPayloadFromBill,
    showBillReceipt,
    printBillThermal,
    shareBillReceipt,
    rebillToPos,
    markBillRefunded,
    deleteBill,
    renderBills,
    bindFilters,
    filterBills,
    getFilteredBills,
    billInDateRange,
    parseBillDate,
    searchBillsServer,
    normalizeServerBill,
    showRefundModal,
    showDeleteConfirm,
    exportBillsCsv,
    exportBillsXlsx,
    printSalesReport,
    formatBillTime,
    wireExportButton,
    wirePrintReportButton,
    wireFilterButton,
    getDateRange: () => billsDateRange,
    rangeDisplayLabel,
  };

  global.RSBillsHistory = api;

  // Attach thin helpers on RS when ready
  function attachToRS() {
    if (!global.RS) {return;}
    global.RS.renderBills = renderBills;
    global.RS.receiptPayloadFromBill = receiptPayloadFromBill;
    global.RS.exportBillsCsv = exportBillsCsv;
    global.RS.exportBillsXlsx = exportBillsXlsx;
    global.RS.printSalesReport = printSalesReport;
  }
  if (global.RS) {attachToRS();}
  document.addEventListener('rs:ready', attachToRS);
  // After first data hydrate: replace skeleton with real bills (or true empty)
  document.addEventListener('rs:hydrated', () => {
    try {
      if (global.RSSkel && RSSkel.markHydrated) {RSSkel.markHydrated();}
      renderBills();
    } catch (_) {}
  });
  // Late-bind export if bills tab mounts after ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
      try {
        wireExportButton();
        wireFilterButton();
      } catch (_) {}
    });
  } else {
    try {
      wireExportButton();
      wireFilterButton();
    } catch (_) {}
  }
})(typeof window !== 'undefined' ? window : globalThis);



/* === assets/modules/inventory-ui.js === */
/* ============================================================
   RestroSuite — Inventory stock/recipes UI (Wave 7 code-split)
   Extracted from dashboard.js — operates on RS.INVENTORY / RS.MENU.
   ============================================================ */
(function (global) {
  'use strict';

  function toast(msg, icon) {
    if (global.RS && typeof RS.toast === 'function') {RS.toast(msg, icon);}
  }
  function rs(n) {
    if (global.RS && typeof RS.rs === 'function') {return RS.rs(n);}
    return '₹' + (Number(n) || 0).toLocaleString('en-IN');
  }
  function esc(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }
  const _e = esc;
  function $(sel) {
    return document.querySelector(sel);
  }
  function $$(sel, root) {
    return Array.from((root || document).querySelectorAll(sel));
  }
  function getInventory() {
    return (global.RS && RS.INVENTORY) || [];
  }
  function getMenu() {
    return (global.RS && RS.MENU) || [];
  }
  function stockCls() {
    return (global.RS && RS.stockCls) || { ok: 'stock-ok', low: 'stock-low', out: 'stock-out' };
  }
  function nextLogicalNo(prefix) {
    if (global.RS && typeof RS.nextLogicalNo === 'function') {return RS.nextLogicalNo(prefix);}
    return prefix + '-' + Date.now().toString(36).toUpperCase();
  }
  function setOperationStatus(msg, state) {
    if (global.RS && typeof RS.setOperationStatus === 'function') {return RS.setOperationStatus(msg, state);}
  }
  function finishOperationStatus(msg, state) {
    if (global.RS && typeof RS.finishOperationStatus === 'function') {return RS.finishOperationStatus(msg, state);}
  }
  function getModalRoot() {
    if (global.RS && typeof RS.getModalRoot === 'function') {return RS.getModalRoot();}
    let root = document.getElementById('rs-modal-root');
    if (!root) {
      root = document.createElement('div');
      root.id = 'rs-modal-root';
      document.body.appendChild(root);
    }
    return root;
  }

  function isLowStock(i) {
    return Number(i.stock) < Number(i.min);
  }

  /** Pretty label for keys like hoagie_roll → Hoagie roll */
  function displayInvName(raw) {
    const s = String(raw == null ? '' : raw).trim();
    if (!s) {return '—';}
    if (!/[_-]/.test(s) && !/^[a-z0-9]+$/i.test(s)) {return s;}
    // Only auto-prettify snake/kebab or all-lowercase keys
    if (/[A-Z]/.test(s) && !/[_-]/.test(s) && s.includes(' ')) {return s;}
    return s
      .replace(/[_-]+/g, ' ')
      .replace(/\s+/g, ' ')
      .trim()
      .replace(/\b\w/g, (c) => c.toUpperCase());
  }

  function invMatchKey(i) {
    return String((i && (i.id || i.name || i.key)) || '');
  }

  function findInvByRow(row) {
    if (!row) {return null;}
    const id = row.getAttribute('data-inv-id');
    const list = getInventory();
    if (id) {
      const byId = list.find((x) => String(x.id) === id || String(x.name) === id || String(x.key) === id);
      if (byId) {return byId;}
    }
    const name = row.querySelector('b') && row.querySelector('b').textContent;
    if (!name) {return null;}
    return list.find(
      (x) =>
        x.name === name ||
        displayInvName(x.name) === name ||
        String(x.key || '').replace(/[_-]+/g, ' ') === name.toLowerCase()
    );
  }

  function rebuildCatFilterOptions(inventory) {
    const sel = $('#inv-cat-filter');
    if (!sel) {return;}
    const prev = sel.value || 'All';
    const cats = Array.from(
      new Set(
        (inventory || [])
          .map((i) => String(i.cat || i.category || '').trim())
          .filter(Boolean)
      )
    ).sort((a, b) => a.localeCompare(b, undefined, { sensitivity: 'base' }));
    const opts = ['All'].concat(cats);
    sel.innerHTML = opts
      .map((c) => `<option value="${esc(c)}">${esc(c === 'All' ? 'All' : c)}</option>`)
      .join('');
    if (opts.some((c) => String(c).toLowerCase() === String(prev).toLowerCase())) {
      // restore previous selection (case-insensitive)
      const match = opts.find((c) => String(c).toLowerCase() === String(prev).toLowerCase());
      sel.value = match || 'All';
    } else {
      sel.value = 'All';
    }
  }
  function reorderQty(i) {
    const min = Math.max(0, Number(i.min) || 0);
    const stock = Math.max(0, Number(i.stock) || 0);
    return Math.max(1, Math.ceil(min * 2 - stock));
  }
  function lineValue(i, qty) {
    return Math.round(Math.max(0, Number(qty) || 0) * Math.max(0, Number(i.cost) || 0));
  }
  function lowStockItems() {
    return getInventory().filter(isLowStock);
  }
  function paintInventoryBadge() {
    const nLow = lowStockItems().length;
    let nExp = 0;
    try {
      if (global.RSInventoryBatches && RSInventoryBatches.listExpiring) {
        nExp = RSInventoryBatches.listExpiring(RSInventoryBatches.NEAR_DAYS || 3).length;
      }
    } catch (_) {}
    const n = nLow + nExp;
    global.__rsLowStockCount = nLow;
    global.__rsNearExpiryCount = nExp;
    document
      .querySelectorAll('.sidebar-link[data-tab="inventory-tab"], .mnav-link[data-tab="inventory-tab"]')
      .forEach((link) => {
        let badge = link.querySelector('.badge-count');
        if (!badge && n > 0) {
          badge = document.createElement('span');
          badge.className = 'badge-count';
          link.appendChild(badge);
        }
        if (badge) {
          badge.textContent = String(n);
          badge.style.display = n > 0 ? '' : 'none';
          badge.classList.toggle('badge-urgent', n > 0);
          const bits = [];
          if (nLow) {bits.push(nLow + ' low stock');}
          if (nExp) {bits.push(nExp + ' near expiry');}
          badge.title = bits.join(' · ') || '';
        }
      });
    try {
      if (global.RS && typeof RS.updateTabAttentionBlinking === 'function') {RS.updateTabAttentionBlinking();}
    } catch (_) {}
  }

  function paintExpiryBanner() {
    let bar = document.getElementById('inv-expiry-banner');
    if (!bar) {
      const stockPanel = document.getElementById('inv-panel-stock');
      const host = stockPanel && stockPanel.parentElement;
      if (!host) {return;}
      bar = document.createElement('div');
      bar.id = 'inv-expiry-banner';
      bar.className = 'banner warn inv-expiry-banner';
      bar.style.display = 'none';
      host.insertBefore(bar, stockPanel);
    }
    const Batches = global.RSInventoryBatches;
    if (!Batches || !Batches.listExpiring) {
      bar.style.display = 'none';
      return;
    }
    const list = Batches.listExpiring(Batches.NEAR_DAYS || 3);
    if (!list.length) {
      bar.style.display = 'none';
      return;
    }
    const preview = list
      .slice(0, 4)
      .map((b) => {
        const label =
          b.daysLeft < 0
            ? 'EXPIRED'
            : b.daysLeft === 0
              ? 'today'
              : b.daysLeft === 1
                ? 'tomorrow'
                : b.daysLeft + 'd';
        return `<b>${esc(b.prettyName || b.ingredientName)}</b> ${esc(String(b.qty))} ${esc(b.unit || '')} (${label})`;
      })
      .join(' · ');
    bar.style.display = 'flex';
    bar.innerHTML = `
      <i class="fa-solid fa-clock"></i>
      <div style="flex:1;min-width:0">
        <b>${list.length} batch${list.length === 1 ? '' : 'es'} near expiry</b>
        — use these first (FEFO). ${preview}${list.length > 4 ? '…' : ''}
      </div>
      <button type="button" class="btn btn-ghost btn-sm banner-cta" id="btn-show-expiring">View</button>`;
    const btn = bar.querySelector('#btn-show-expiring');
    if (btn)
      {btn.onclick = () => {
        openExpiringModal(list);
      };}
  }

  function openExpiringModal(list) {
    if (!global.RSModal) {
      toast(
        list
          .slice(0, 5)
          .map((b) => (b.prettyName || '') + ' ' + (b.daysLeft < 0 ? 'expired' : b.daysLeft + 'd'))
          .join(', '),
        'fa-clock'
      );
      return;
    }
    const rows = (list || [])
      .map((b) => {
        const when =
          b.daysLeft < 0
            ? '<span style="color:var(--red);font-weight:700">Expired</span>'
            : b.daysLeft === 0
              ? '<span style="color:var(--amber);font-weight:700">Today</span>'
              : b.daysLeft + ' day' + (b.daysLeft === 1 ? '' : 's');
        const exp =
          global.RSInventoryBatches && RSInventoryBatches.formatShort
            ? RSInventoryBatches.formatShort(b.expiryDate)
            : b.expiryDate || '—';
        return `<tr>
          <td><b>${esc(b.prettyName || b.ingredientName || b.ingredientKey)}</b></td>
          <td>${esc(String(b.qty))} ${esc(b.unit || '')}</td>
          <td>${esc(exp)}</td>
          <td>${when}</td>
          <td style="font-size:12px;color:var(--text-soft)">Use this batch first</td>
        </tr>`;
      })
      .join('');
    RSModal.open({
      title: 'Use first — near expiry',
      sub: 'FEFO: kitchen should consume these batches before fresher stock',
      icon: 'fa-clock',
      size: 'md',
      body: `<div class="table-scroll"><table class="data-table">
        <thead><tr><th>Ingredient</th><th>Qty</th><th>Expiry</th><th>In</th><th></th></tr></thead>
        <tbody>${rows || '<tr><td colspan="5" style="text-align:center;padding:20px">None</td></tr>'}</tbody>
      </table></div>`,
      foot: '<button type="button" class="btn btn-primary" data-ok style="flex:1">Got it</button>',
      onMount(m, close) {
        const ok = m.querySelector('[data-ok]');
        if (ok) {ok.onclick = close;}
      },
    });
  }

  function openBatchesModal(inv) {
    if (!inv || !global.RSModal) {return;}
    const Batches = global.RSInventoryBatches;
    const list =
      Batches && Batches.batchesForItem ? Batches.batchesForItem(inv) : [];
    const rows = list
      .map((b, i) => {
        const d = Batches.daysUntil(b.expiryDate);
        const exp = Batches.formatShort(b.expiryDate) || 'No date';
        const tag =
          d == null
            ? '<span class="pill" style="padding:2px 8px">No expiry</span>'
            : d < 0
              ? '<span class="pill pill-red" style="padding:2px 8px">Expired · use/waste</span>'
              : d <= (Batches.NEAR_DAYS || 3)
                ? '<span class="pill pill-amber" style="padding:2px 8px">Use first</span>'
                : '<span class="pill pill-green" style="padding:2px 8px">OK</span>';
        return `<tr>
          <td style="font-weight:700">${i === 0 && d != null ? '① ' : ''}${esc(String(b.qty))} ${esc(b.unit || inv.unit || '')}</td>
          <td>${esc(exp)}</td>
          <td>${tag}</td>
          <td style="font-size:11.5px;color:var(--text-mute)">${esc(b.source || 'batch')}</td>
        </tr>`;
      })
      .join('');
    RSModal.open({
      title: 'Batches · ' + (inv.name || ''),
      sub: 'Soonest expiry is used first when stock is deducted (FEFO)',
      icon: 'fa-boxes-stacked',
      size: 'md',
      body: list.length
        ? `<div class="table-scroll"><table class="data-table">
            <thead><tr><th>Qty</th><th>Expiry</th><th>Priority</th><th>Source</th></tr></thead>
            <tbody>${rows}</tbody>
          </table></div>
          <p style="margin:12px 0 0;font-size:12.5px;color:var(--text-soft)">Total on batches: <b>${list.reduce((a, b) => a + (Number(b.qty) || 0), 0)}</b> · Book stock: <b>${Number(inv.stock) || 0}</b> ${esc(inv.unit || '')}</p>`
        : `<div class="sr-empty" style="padding:28px 12px">
            <div style="font-weight:700;margin-bottom:6px">No batches yet</div>
            <div style="font-size:13px;color:var(--text-soft);max-width:340px;margin:0 auto">
              Receive a purchase order with an <b>expiry date</b>, or restock with expiry, to create batches.
            </div>
          </div>`,
      foot: '<button type="button" class="btn btn-primary" data-ok style="flex:1">Close</button>',
      onMount(m, close) {
        const ok = m.querySelector('[data-ok]');
        if (ok) {ok.onclick = close;}
      },
    });
  }
  function buildPoRowsFromLow(items) {
    const bySup = {};
    (items || []).forEach((i) => {
      const sup = (i.supplier || i.vendor || i.cat || 'General') + '';
      if (!bySup[sup]) {bySup[sup] = [];}
      bySup[sup].push(i);
    });
    const rows = [];
    Object.entries(bySup).forEach(([sup, list]) => {
      const lines = list.map((i) => {
        const qty = reorderQty(i);
        return {
          name: i.name,
          unit: i.unit || 'unit',
          qty,
          cost: Number(i.cost) || 0,
          value: lineValue(i, qty),
          stock: Number(i.stock) || 0,
          min: Number(i.min) || 0,
          invId: i.id,
        };
      });
      const value = lines.reduce((a, l) => a + l.value, 0);
      const slug = String(sup)
        .replace(/[^a-z0-9]+/gi, '')
        .slice(0, 4)
        .toUpperCase() || 'GEN';
      const poNum = nextLogicalNo('PO') + '-' + slug;
      rows.push({
        id: poNum,
        poNumber: poNum,
        supplier: /supplier/i.test(sup) ? sup : sup + ' Supplier',
        lines,
        items: lines.map((l) => `${l.qty} ${l.unit} ${l.name}`).join(', '),
        value,
        date: new Date().toISOString(),
        status: 'pending',
        channel: 'auto_reorder',
      });
    });
    return rows;
  }
  async function savePurchaseOrder(poRow) {
    if (global.RS && typeof RS.saveOne === 'function') {
      return RS.saveOne('purchase_orders', poRow);
    }
    if (global.RS_DB && RS_DB.put) {
      return RS_DB.put('purchase_orders', poRow.id, poRow);
    }
    throw new Error('No save path for purchase orders');
  }
  function printPurchaseOrder(po) {
    const lines = (po.lines || [])
      .map(
        (l) =>
          `<div style="display:flex;justify-content:space-between;font-size:13px;padding:4px 0;border-bottom:1px dashed #ddd"><span>${esc(l.qty)} ${esc(l.unit)} · ${esc(l.name)}</span><span>${rs(l.value)}</span></div>`
      )
      .join('');
    const html = `<div style="max-width:360px;margin:0 auto;font-family:system-ui,sans-serif">
      <div style="text-align:center;font-weight:800;font-size:18px">PURCHASE ORDER</div>
      <div style="text-align:center;font-size:12px;color:#666;margin:4px 0 12px">${esc(po.poNumber || po.id)}</div>
      <div style="font-size:12px;margin-bottom:8px"><b>Supplier:</b> ${esc(po.supplier)}</div>
      <div style="font-size:12px;margin-bottom:10px"><b>Date:</b> ${esc(new Date(po.date || Date.now()).toLocaleString())}</div>
      ${lines || `<div style="font-size:13px">${esc(po.items || '')}</div>`}
      <div style="display:flex;justify-content:space-between;font-weight:800;margin-top:12px;font-size:15px"><span>Total</span><span>${rs(po.value)}</span></div>
      <div style="text-align:center;font-size:11px;color:#888;margin-top:14px">RestroSuite · ${esc(po.status || 'pending')}</div>
    </div>`;
    if (typeof global.RSPrint === 'function') {global.RSPrint(html, 'PO ' + (po.poNumber || po.id));}
    else if (global.RSPrintBridge && RSPrintBridge.printHtml) {RSPrintBridge.printHtml(html, 'PO');}
  }
  function unitCostOf(i) {
    return Math.max(0, Number(i && (i.cost != null ? i.cost : i.unit_cost)) || 0);
  }
  function stockValueOf(i) {
    return Math.round(unitCostOf(i) * Math.max(0, Number(i && i.stock) || 0) * 100) / 100;
  }
  function missingCostItems() {
    return getInventory().filter((i) => !(unitCostOf(i) > 0));
  }
  async function persistInvCost(inv, newCost) {
    inv.cost = Math.max(0, Number(newCost) || 0);
    // Keep alias for older payloads / exports
    inv.unit_cost = inv.cost;
    if (global.RS_DB) {await RS_DB.put('inventory', inv.id, inv);}
    else if (global.RS && RS.saveOne) {await RS.saveOne('inventory', inv);}
  }

  /**
   * Quick set unit cost — links this stock item to plate cost / margin / PO value.
   */
  function openSetCostModal(inv, opts) {
    opts = opts || {};
    if (!inv || !global.RSModal) {return;}
    const unit = inv.unit || 'unit';
    const cur = unitCostOf(inv);
    const stock = Math.max(0, Number(inv.stock) || 0);
    RSModal.open({
      title: 'Unit cost · ' + displayInvName(inv.name),
      sub: 'Every stock item should have a cost — used for plate cost, margin & stock value',
      icon: 'fa-indian-rupee-sign',
      size: 'sm',
      body: `
        <div style="display:flex;flex-direction:column;gap:12px">
          <p style="margin:0;font-size:13.5px;line-height:1.5;color:var(--text-soft)">
            What do you pay for <b>1 ${esc(unit)}</b> of <b>${esc(displayInvName(inv.name))}</b>?
            Recipes use this to show plate cost when a dish is sold.
          </p>
          <div>
            <label class="fl">Cost per ${esc(unit)} (₹)</label>
            <input class="form-input" id="set-cost-val" type="number" min="0" step="any" value="${cur || ''}" placeholder="e.g. 80">
          </div>
          <div class="inv-cost-preview" id="set-cost-preview">
            Stock value now: <b>${rs(stockValueOf(inv))}</b>
            ${stock ? ` · ${stock} ${esc(unit)} × unit cost` : ''}
          </div>
          ${
            opts.showNext
              ? '<p style="margin:0;font-size:12px;color:var(--text-mute)">After save we can open the next item still missing cost.</p>'
              : ''
          }
        </div>`,
      foot: `<button type="button" class="btn btn-ghost" style="flex:1" data-x>Cancel</button>
        <button type="button" class="btn btn-primary" style="flex:1.2" data-ok><i class="fa-solid fa-link"></i> Save cost</button>`,
      onMount(modal, close) {
        const inp = modal.querySelector('#set-cost-val');
        const prev = modal.querySelector('#set-cost-preview');
        const refresh = () => {
          const c = Math.max(0, Number(inp.value) || 0);
          const val = Math.round(c * stock * 100) / 100;
          prev.innerHTML =
            'Stock value: <b>' +
            rs(val) +
            '</b>' +
            (stock ? ' · ' + stock + ' ' + esc(unit) + ' × ' + rs(c) : '');
        };
        inp.addEventListener('input', refresh);
        modal.querySelector('[data-x]').onclick = close;
        modal.querySelector('[data-ok]').onclick = async () => {
          const c = Math.max(0, Number(inp.value) || 0);
          if (!(c > 0)) {
            try { if (window.RSActionFeedback) {window.RSActionFeedback.error();} } catch(_) {}
            toast('Enter a unit cost greater than 0', 'fa-circle-exclamation');
            inp.focus();
            return;
          }
          try {
            await persistInvCost(inv, c);
            try { if (window.RSActionFeedback) {window.RSActionFeedback.success();} } catch(_) {}
            toast(displayInvName(inv.name) + ' · cost ' + rs(c) + '/' + unit + ' linked', 'fa-link');
            close();
            renderInventory();
            if (opts.showNext) {
              const next = missingCostItems().find((x) => String(x.id) !== String(inv.id));
              if (next) {setTimeout(() => openSetCostModal(next, { showNext: true }), 280);}
            }
          } catch (e) {
            console.warn(e);
            toast('Could not save cost', 'fa-circle-exclamation');
          }
        };
        setTimeout(() => {
          inp.focus();
          inp.select();
        }, 80);
      },
    });
  }

  function openMissingCostsWizard() {
    const list = missingCostItems();
    if (!list.length) {
      toast('All stock items already have a unit cost', 'fa-circle-check');
      return;
    }
    openSetCostModal(list[0], { showNext: true });
  }

  function paintCostBanner() {
    let bar = document.getElementById('inv-cost-tip');
    const missing = missingCostItems();
    const totalVal = getInventory().reduce((a, i) => a + stockValueOf(i), 0);
    if (!bar) {
      bar = document.createElement('div');
      bar.id = 'inv-cost-tip';
      bar.className = 'banner warn inv-cost-banner';
      bar.style.display = 'none';
      bar.setAttribute('role', 'status');
      const stockPanel = document.getElementById('inv-panel-stock');
      const host = stockPanel && stockPanel.parentElement;
      if (host) {
        const linkTip = document.getElementById('inv-link-tip');
        if (linkTip && linkTip.parentElement === host) {host.insertBefore(bar, linkTip.nextSibling);}
        else if (stockPanel) {host.insertBefore(bar, stockPanel);}
        else {host.appendChild(bar);}
      }
    }
    if (!getInventory().length) {
      bar.style.display = 'none';
      return;
    }
    if (missing.length) {
      bar.style.display = 'flex';
      bar.className = 'banner warn inv-cost-banner';
      bar.innerHTML = `<i class="fa-solid fa-indian-rupee-sign"></i>
        <div style="flex:1"><b>${missing.length} stock item${missing.length === 1 ? '' : 's'}</b> have no unit cost (₹0).
        Link a cost so recipes can show plate cost &amp; margin. Stock value so far: <b>${rs(totalVal)}</b>.
        <button type="button" class="btn btn-primary btn-sm" id="inv-cost-set-all" style="margin-left:8px">Set costs</button>
        <button type="button" class="btn btn-ghost btn-sm" id="inv-cost-filter">Show ₹0 only</button></div>`;
      const a = bar.querySelector('#inv-cost-set-all');
      const b = bar.querySelector('#inv-cost-filter');
      if (a) {a.onclick = () => openMissingCostsWizard();}
      if (b)
        {b.onclick = () => {
          toast('Amber rows = missing cost — click ₹0 · set cost on each row', 'fa-circle-info');
          const row = document.querySelector('#inv-table-body .inv-cost-btn.is-zero');
          if (row) {row.scrollIntoView({ block: 'center', behavior: 'smooth' });}
        };}
    } else {
      bar.style.display = 'flex';
      bar.className = 'banner inv-cost-banner inv-cost-banner-ok';
      bar.innerHTML = `<i class="fa-solid fa-circle-check" style="color:var(--green)"></i>
        <div style="flex:1">All stock items have unit cost linked · total stock value <b>${rs(totalVal)}</b></div>
        <button type="button" class="btn btn-ghost btn-sm" id="inv-cost-dismiss">OK</button>`;
      const d = bar.querySelector('#inv-cost-dismiss');
      if (d)
        {d.onclick = () => {
          bar.style.display = 'none';
          try {
            if (global.sessionStorage) {sessionStorage.setItem('rs_inv_cost_ok_hide', '1');}
          } catch (_) {}
        };}
      try {
        if (global.sessionStorage && sessionStorage.getItem('rs_inv_cost_ok_hide') === '1') {
          bar.style.display = 'none';
        }
      } catch (_) {}
    }
  }

  function exportLowStockCsv() {
    const low = lowStockItems();
    if (!low.length) {
      toast('No low-stock items to export', 'fa-circle-check');
      return;
    }
    const lines = [
      ['name', 'category', 'stock', 'min', 'unit', 'unit_cost', 'reorder_qty', 'est_value', 'supplier'].join(','),
    ];
    low.forEach((i) => {
      const qty = reorderQty(i);
      const row = [
        i.name,
        i.cat || '',
        i.stock,
        i.min,
        i.unit || '',
        i.cost || 0,
        qty,
        lineValue(i, qty),
        i.supplier || i.vendor || (i.cat ? i.cat + ' Supplier' : ''),
      ].map((c) => '"' + String(c == null ? '' : c).replace(/"/g, '""') + '"');
      lines.push(row.join(','));
    });
    const csv = lines.join('\n');
    const name = 'low-stock-' + new Date().toISOString().slice(0, 10) + '.csv';
    if (global.RS && typeof RS.downloadFile === 'function') {
      RS.downloadFile(csv, 'text/csv;charset=utf-8;', name);
    } else {
      const a = document.createElement('a');
      a.href = 'data:text/csv;charset=utf-8,' + encodeURIComponent(csv);
      a.download = name;
      a.click();
    }
    toast('Low-stock CSV · ' + low.length + ' items', 'fa-file-csv');
  }
  async function confirmAndDraftPos() {
    const lowItems = lowStockItems();
    if (!lowItems.length) {return toast('All inventory levels are healthy', 'fa-circle-check');}
    const drafts = buildPoRowsFromLow(lowItems);
    const totalVal = drafts.reduce((a, p) => a + (p.value || 0), 0);
    const preview = drafts
      .map(
        (p) =>
          `<div style="padding:10px 0;border-bottom:1px solid var(--stroke)">
            <div style="font-weight:800;font-size:13px">${esc(p.poNumber)} · ${esc(p.supplier)}</div>
            <div style="font-size:12px;color:var(--text-soft);margin-top:4px;line-height:1.45">${esc(p.items)}</div>
            <div style="font-size:12.5px;font-weight:700;color:var(--orange);margin-top:4px">${rs(p.value)}</div>
          </div>`
      )
      .join('');
    if (!global.RSModal) {
      // Fallback: draft without preview
      return executeDraftPos(drafts);
    }
    RSModal.open({
      title: 'Auto-draft purchase orders',
      sub: lowItems.length + ' low items · ' + drafts.length + ' PO(s) · ' + rs(totalVal),
      icon: 'fa-truck',
      size: 'md',
      body: `<div style="font-size:13px;color:var(--text-soft);margin-bottom:10px">Qty targets ~2× min level. Review and confirm to create pending POs.</div>
        <div style="max-height:320px;overflow:auto">${preview}</div>`,
      foot: `<button class="btn btn-ghost" style="flex:1" data-x>Cancel</button>
        <button class="btn btn-ghost" style="flex:1" data-csv><i class="fa-solid fa-file-csv"></i> CSV only</button>
        <button class="btn btn-primary" style="flex:1.2" data-ok><i class="fa-solid fa-truck"></i> Create ${drafts.length} PO(s)</button>`,
      onMount(modal, close) {
        modal.querySelector('[data-x]').onclick = close;
        modal.querySelector('[data-csv]').onclick = () => {
          exportLowStockCsv();
        };
        modal.querySelector('[data-ok]').onclick = async () => {
          close();
          await executeDraftPos(drafts);
        };
      },
    });
  }
  async function executeDraftPos(drafts) {
    setOperationStatus('Creating purchase orders...');
    try {
      let n = 0;
      for (const po of drafts) {
        await savePurchaseOrder(po);
        n++;
      }
      finishOperationStatus('Drafted ' + n + ' PO(s)');
      try { if (window.RSActionFeedback) {window.RSActionFeedback.success();} } catch(_) {}
      toast(`Created ${n} purchase order${n === 1 ? '' : 's'}`, 'fa-truck');
      // Offer print / jump to Purchase orders
      if (drafts[0]) {
        setTimeout(() => {
          if (typeof global.__toast === 'function') {
            global.__toast('POs ready · tap to print first', 'fa-print', () => printPurchaseOrder(drafts[0]));
          }
        }, 400);
      }
      document.dispatchEvent(new CustomEvent('rs:render-inventory'));
      renderInventory();
      if (global.RS && RS.render) {RS.render('inventory-tab');}
    } catch (e) {
      console.warn('Auto-draft POs failed', e);
      finishOperationStatus('Auto-draft failed', 'error');
      try { if (window.RSActionFeedback) {window.RSActionFeedback.error();} } catch(_) {}
      toast('Could not create all POs', 'fa-circle-exclamation');
    }
  }

  function renderInventory() {
    const INVENTORY = getInventory();
    const MENU = getMenu();
    const cls = stockCls();
    const Batches = global.RSInventoryBatches;

    // Pre-hydrate empty stock → skeleton table (not a false empty store)
    try {
      if (
        global.RSSkel &&
        RSSkel.shouldShow &&
        RSSkel.shouldShow(INVENTORY && INVENTORY.length > 0)
      ) {
        const invBody = $('#inv-table-body');
        if (invBody && RSSkel.dataTable) {
          RSSkel.paint(invBody, RSSkel.dataTable({ rows: 8, cols: 6 }));
        }
        return;
      }
    } catch (_) {}

    // Ensure batches loaded then re-paint once (near-expiry banner / FEFO labels)
    if (Batches && typeof Batches.loadBatches === 'function' && !renderInventory._batchWarm) {
      renderInventory._batchWarm = true;
      Batches.loadBatches(true)
        .then(() => {
          try {
            renderInventory();
          } catch (_) {}
        })
        .catch(() => {});
    }

    const low = INVENTORY.filter(isLowStock);
    paintInventoryBadge();
    paintExpiryBanner();
    try {
      paintCostBanner();
    } catch (_) {}
    // Naive-user tip on stock: recipes still missing
    try {
      const tip = document.getElementById('inv-link-tip');
      if (tip) {
        const menu = (global.RS && RS.MENU) || [];
        const missing = menu.filter((m) => !Array.isArray(m.ingredients) || !m.ingredients.length).length;
        if (missing > 0 && menu.length) {
          tip.style.display = 'flex';
          tip.innerHTML = `<i class="fa-solid fa-link"></i>
            <div style="flex:1"><b>Next:</b> ${missing} dish${missing === 1 ? '' : 'es'} still need a recipe so sales reduce stock.
            <button type="button" class="btn btn-primary btn-sm" id="inv-tip-link" style="margin-left:8px">Help me link</button>
            <button type="button" class="btn btn-ghost btn-sm" id="inv-tip-check">3-step setup</button>
            <button type="button" class="btn btn-ghost btn-sm" id="inv-tip-recipes">Open Recipes</button></div>`;
          const a = tip.querySelector('#inv-tip-link');
          const b = tip.querySelector('#inv-tip-recipes');
          const c = tip.querySelector('#inv-tip-check');
          if (a)
            {a.onclick = () => {
              if (global.RSKitchenLinkCoach) {RSKitchenLinkCoach.openLinkWizard();}
            };}
          if (c)
            {c.onclick = () => {
              if (global.RSKitchenLinkCoach && RSKitchenLinkCoach.openSetupChecklist)
                {RSKitchenLinkCoach.openSetupChecklist();}
            };}
          if (b)
            {b.onclick = () => {
              if (global.RSKitchenLinkCoach) {RSKitchenLinkCoach.goInventoryTab('recipes');}
              else {
                const btn = document.querySelector('#inv-seg [data-inv-tab="recipes"]');
                if (btn) {btn.click();}
              }
            };}
        } else {
          tip.style.display = 'none';
        }
      }
    } catch (_) {}
    const banner = $('#inv-banner');
    if (banner) {banner.style.display = low.length ? 'flex' : 'none';}
    const lowCount = $('#inv-low-count');
    if (lowCount) {lowCount.textContent = low.length;}

    const btnAutoDraft = $('#btn-auto-draft-pos');
    if (btnAutoDraft) {
      btnAutoDraft.onclick = () => confirmAndDraftPos();
    }
    const btnCsv = $('#btn-export-low-stock');
    if (btnCsv) {
      btnCsv.onclick = () => exportLowStockCsv();
    }
    const btnCsv2 = $('#btn-export-low-stock-toolbar');
    if (btnCsv2) {
      btnCsv2.onclick = () => exportLowStockCsv();
    }

    const invBody = $('#inv-table-body');
    if (invBody) {
      rebuildCatFilterOptions(INVENTORY);
      const catFil = $('#inv-cat-filter');
      if (catFil && !catFil._rsListenerBound) {
        catFil._rsListenerBound = true;
        catFil.addEventListener('change', renderInventory);
      }
      const statusFil = $('#inv-status-filter');
      if (statusFil && !statusFil._rsListenerBound) {
        statusFil._rsListenerBound = true;
        statusFil.addEventListener('change', renderInventory);
      }
      const searchEl = $('#inv-stock-search');
      if (searchEl && !searchEl._rsListenerBound) {
        searchEl._rsListenerBound = true;
        let t;
        searchEl.addEventListener('input', () => {
          clearTimeout(t);
          t = setTimeout(renderInventory, 120);
        });
      }

      const catFilter = ($('#inv-cat-filter')?.value || 'All').toLowerCase();
      const statusFilter = ($('#inv-status-filter')?.value || 'All').toLowerCase();
      const q = (($('#inv-stock-search') && $('#inv-stock-search').value) || '').toLowerCase().trim();

      try {
        if (global.RSSkel && RSSkel.clear) {RSSkel.clear(invBody);}
      } catch (_) {}

      let filtered = INVENTORY;
      if (catFilter !== 'all') {
        filtered = filtered.filter((i) => {
          const c = String(i.cat || i.category || '').toLowerCase();
          return c === catFilter;
        });
      }
      if (statusFilter !== 'all') {
        filtered = filtered.filter((i) => {
          const st = i.stock < i.min ? 'out' : i.stock < i.min * 1.4 ? 'low' : 'ok';
          return st === statusFilter;
        });
      }
      if (q) {
        filtered = filtered.filter((i) => {
          const hay = [i.name, i.key, i.cat, i.unit, i.supplier, displayInvName(i.name)]
            .map((x) => String(x || '').toLowerCase())
            .join(' ');
          return hay.includes(q);
        });
      }

      if (!filtered.length) {
        const hasFilters = catFilter !== 'all' || statusFilter !== 'all' || !!q;
        invBody.innerHTML = `<tr class="inv-empty-row"><td colspan="7" style="padding:0;border:none">
          <div class="sr-empty" style="padding:40px 20px">
            <i class="fa-solid fa-boxes-stacked" style="font-size:24px;opacity:.4;display:block;margin-bottom:8px"></i>
            <div style="font-weight:700;color:var(--text);margin-bottom:4px">${
              hasFilters ? 'No stock items match filters' : 'No stock items yet'
            }</div>
            <div style="color:var(--text-soft);font-size:13px;max-width:380px;margin:0 auto 14px;line-height:1.45">${
              hasFilters
                ? 'Clear search / category / status filters to see full stock.'
                : 'Add food, packaging (boxes, bags), disposables (napkins, spoons), and other kitchen supplies. Link them on recipes so sales reduce stock.'
            }</div>
            <div style="display:flex;gap:8px;justify-content:center;flex-wrap:wrap">
              ${
                hasFilters
                  ? '<button type="button" class="btn btn-ghost btn-sm" id="inv-clear-filters"><i class="fa-solid fa-filter-circle-xmark"></i> Clear filters</button>'
                  : ''
              }
              <button type="button" class="btn btn-primary btn-sm" id="inv-empty-add"><i class="fa-solid fa-plus"></i> Add stock item</button>
              <button type="button" class="btn btn-ghost btn-sm" id="inv-empty-pack"><i class="fa-solid fa-box"></i> Add packaging</button>
            </div>
          </div>
        </td></tr>`;
        const clear = document.getElementById('inv-clear-filters');
        if (clear)
          {clear.onclick = () => {
            const c = document.getElementById('inv-cat-filter');
            const s = document.getElementById('inv-status-filter');
            const se = document.getElementById('inv-stock-search');
            if (c) {c.value = 'All';}
            if (s) {s.value = 'All';}
            if (se) {se.value = '';}
            renderInventory();
          };}
        const add = document.getElementById('inv-empty-add');
        if (add)
          {add.onclick = () => {
            openAddStockModal({ typeId: 'food' });
          };}
        const addPack = document.getElementById('inv-empty-pack');
        if (addPack)
          {addPack.onclick = () => {
            openAddStockModal({ typeId: 'packaging' });
          };}
      } else {
      invBody.innerHTML = filtered
        .map((i) => {
          const st = i.stock < i.min ? 'out' : i.stock < i.min * 1.4 ? 'low' : 'ok';
          const pct = Math.min(100, Math.round((i.stock / (i.min * 2 || 1)) * 100));
          const pretty = displayInvName(i.name);
          const costN = unitCostOf(i);
          const valN = stockValueOf(i);
          const idAttr = esc(invMatchKey(i));
          const costHtml =
            costN > 0
              ? `<button type="button" class="inv-cost-btn" data-set-cost title="Edit unit cost (links to plate cost)">
                  <span class="inv-cost-amt">${rs(costN)}</span><span class="inv-unit-suffix">/${_e(i.unit || 'unit')}</span>
                  <span class="inv-stock-val">value ${rs(valN)}</span>
                </button>`
              : `<button type="button" class="inv-cost-btn is-zero" data-set-cost title="Set unit cost — required for plate cost">
                  <span class="inv-cost-zero">₹0 · set cost</span>
                  <span class="inv-stock-val">not linked</span>
                </button>`;
          const sum =
            Batches && typeof Batches.summarizeItem === 'function'
              ? Batches.summarizeItem(i)
              : null;
          let statusLabel = st === 'out' ? 'Reorder' : st === 'low' ? 'Low' : 'Healthy';
          let statusCls = cls[st] || '';
          if (sum && sum.status === 'expired') {
            statusLabel = 'Expired batch';
            statusCls = cls.out || 'stock-out';
          } else if (sum && sum.status === 'near') {
            statusLabel = 'Use first';
            statusCls = cls.low || 'stock-low';
          }
          const fefoLine = sum && sum.useFirstLabel
            ? `<div class="inv-fefo-line inv-fefo-${esc(sum.status || 'ok')}" title="First expiry first out">${_e(sum.useFirstLabel)}</div>`
            : '';
          return `<tr data-inv-id="${idAttr}" class="${costN > 0 ? '' : 'inv-row-no-cost'}">
          <td>
            <button type="button" class="inv-name-btn" data-batches="${idAttr}" title="View batches / expiry">
              <b class="inv-name">${_e(pretty)}</b>
            </button>
            ${pretty !== String(i.name) ? `<div class="inv-key-sub" title="Stored key">${_e(i.name)}</div>` : ''}
            ${fefoLine}
          </td>
          <td><span class="inv-cat-pill">${_e(i.cat || '—')}</span></td>
          <td><div style="display:flex;align-items:center;gap:10px"><span class="td-strong" style="min-width:58px">${i.stock} ${_e(i.unit)}</span><div style="flex:1;height:6px;background:var(--glass-2);border-radius:99px;overflow:hidden;min-width:60px"><span style="display:block;height:100%;width:${pct}%;background:${sum && sum.status === 'expired' ? 'var(--red)' : sum && sum.status === 'near' ? 'var(--amber)' : st === 'out' ? 'var(--red)' : st === 'low' ? 'var(--amber)' : 'var(--green)'}"></span></div></div></td>
          <td>${i.min} ${_e(i.unit)}</td>
          <td>${costHtml}</td>
          <td><span class="stock-dot ${statusCls}">${_e(statusLabel)}</span></td>
          <td><div class="row-actions"><button type="button" class="icon-act go" title="Raise purchase order / restock with expiry" aria-label="Restock ${_e(pretty)}"><i class="fa-solid fa-truck"></i></button><button type="button" class="icon-act inv-edit" title="Edit stock item" aria-label="Edit ${_e(pretty)}"><i class="fa-solid fa-pen"></i></button></div></td>
        </tr>`;
        })
        .join('');
      }

      $$('#inv-table-body .inv-name-btn').forEach((btn) => {
        btn.onclick = () => {
          const row = btn.closest('tr');
          const inv = findInvByRow(row);
          if (inv) {openBatchesModal(inv);}
        };
      });
      $$('#inv-table-body [data-set-cost]').forEach((btn) => {
        btn.onclick = (e) => {
          e.preventDefault();
          e.stopPropagation();
          const row = btn.closest('tr');
          const inv = findInvByRow(row);
          if (inv) {openSetCostModal(inv, { showNext: !(unitCostOf(inv) > 0) });}
        };
      });

      $$('#inv-table-body .icon-act.go').forEach((b) => {
        b.addEventListener('click', () => {
          const row = b.closest('tr');
          const inv = findInvByRow(row);
          if (!inv) {return;}
          const qtyToOrder = Math.max(1, Math.round(inv.min * 2 - inv.stock));
          const estimatedCost = Math.round(qtyToOrder * inv.cost);

          if (!global.RSModal) {
            toast('Modal module is unavailable', 'fa-circle-exclamation');
            return;
          }

          const defExp = (() => {
            const d = new Date();
            d.setDate(d.getDate() + 7);
            return d.toISOString().slice(0, 10);
          })();
          const body = `
            <div style="display:flex;flex-direction:column;gap:12px">
              <div style="font-size:13px;color:var(--text-soft)">
                Restock <b>${_e(displayInvName(inv.name))}</b> (current: ${inv.stock} ${_e(inv.unit)}, min: ${inv.min} ${_e(inv.unit)}).
              </div>
              <div class="form-grid-2" style="margin-top:4px; display: grid; grid-template-columns: 1fr 1fr; gap: 12px;">
                <div>
                  <label class="form-label" style="display:block;font-size:12px;margin-bottom:4px;color:var(--text-soft)">Qty (${_e(inv.unit)})</label>
                  <input type="number" id="po-qty" class="form-control" value="${qtyToOrder}" style="width:100%;padding:8px;border:1px solid var(--stroke);border-radius:6px;background:var(--panel);color:var(--text)">
                </div>
                <div>
                  <label class="form-label" style="display:block;font-size:12px;margin-bottom:4px;color:var(--text-soft)">Unit cost (₹ / ${_e(inv.unit || 'unit')})</label>
                  <input type="number" id="po-unit-cost" class="form-control" min="0" step="any" value="${unitCostOf(inv) || ''}" placeholder="What you paid per unit" style="width:100%;padding:8px;border:1px solid var(--stroke);border-radius:6px;background:var(--panel);color:var(--text)">
                </div>
                <div>
                  <label class="form-label" style="display:block;font-size:12px;margin-bottom:4px;color:var(--text-soft)">Batch expiry</label>
                  <input type="date" id="po-expiry" class="form-control" value="${defExp}" style="width:100%;padding:8px;border:1px solid var(--stroke);border-radius:6px;background:var(--panel);color:var(--text)">
                </div>
                <div>
                  <label class="form-label" style="display:block;font-size:12px;margin-bottom:4px;color:var(--text-soft)">Supplier</label>
                  <input type="text" id="po-supplier" class="form-control" value="${_e(inv.supplier || inv.cat || '')} Supplier" style="width:100%;padding:8px;border:1px solid var(--stroke);border-radius:6px;background:var(--panel);color:var(--text)">
                </div>
              </div>
              <div style="font-size:12px;color:var(--text-mute)">
                Est. value: <strong style="color:var(--orange)" id="po-cost-preview">${rs(estimatedCost)}</strong>
                · Unit cost is saved on the item (links recipes / plate cost)
              </div>
            </div>
          `;

          RSModal.open({
            title: 'Restock · ' + displayInvName(inv.name),
            sub: 'Receive now with cost + expiry, or draft a PO',
            icon: 'fa-truck',
            size: 'sm',
            body,
            foot: `<button class="btn btn-ghost" data-cancel>Cancel</button>
              <button class="btn btn-ghost" data-po title="Create PO only"><i class="fa-solid fa-file-invoice"></i> PO</button>
              <button class="btn btn-primary" data-recv><i class="fa-solid fa-box-open"></i> Receive now</button>`,
            onMount(modal, close) {
              const qtyInput = modal.querySelector('#po-qty');
              const costInput = modal.querySelector('#po-unit-cost');
              const refreshEst = () => {
                const q = Math.max(0, Number(qtyInput.value) || 0);
                const c = Math.max(0, Number(costInput.value) || 0);
                modal.querySelector('#po-cost-preview').textContent = rs(Math.round(q * c));
              };
              qtyInput.oninput = refreshEst;
              costInput.oninput = refreshEst;
              modal.querySelector('[data-cancel]').onclick = close;
              const makeLine = () => {
                const qty = Math.max(1, Number(qtyInput.value) || 1);
                const unitCost = Math.max(0, Number(costInput.value) || 0);
                const supplier = modal.querySelector('#po-supplier').value || 'Default Supplier';
                const expiryDate = (modal.querySelector('#po-expiry') && modal.querySelector('#po-expiry').value) || null;
                return { qty, supplier, expiryDate, unitCost };
              };
              modal.querySelector('[data-po]').onclick = async () => {
                const { qty, supplier, expiryDate, unitCost } = makeLine();
                if (unitCost > 0) {
                  try {
                    await persistInvCost(inv, unitCost);
                  } catch (_) {}
                }
                const poNum = nextLogicalNo('PO');
                const line = {
                  name: inv.name,
                  unit: inv.unit || 'unit',
                  qty,
                  cost: unitCost || unitCostOf(inv),
                  value: Math.round(qty * (unitCost || unitCostOf(inv))),
                  invId: inv.id,
                  expiryDate,
                };
                const poRow = {
                  id: poNum,
                  poNumber: poNum,
                  supplier,
                  lines: [line],
                  items: `${qty} ${inv.unit || 'unit'} ${inv.name}`,
                  value: line.value,
                  date: new Date().toISOString(),
                  status: 'pending',
                  channel: 'manual_restock',
                };
                close();
                try {
                  if (global.RS && RS.saveOne) {await RS.saveOne('purchase_orders', poRow);}
                  else if (global.RS_DB) {await RS_DB.put('purchase_orders', poRow.id, poRow);}
                  toast('PO raised · receive later with expiry', 'fa-circle-check');
                  document.dispatchEvent(new CustomEvent('rs:render-inventory'));
                  renderInventory();
                } catch (e) {
                  toast('Could not save PO', 'fa-circle-exclamation');
                }
              };
              modal.querySelector('[data-recv]').onclick = async () => {
                const { qty, expiryDate, unitCost } = makeLine();
                close();
                setOperationStatus('Receiving stock...');
                try {
                  const oldQty = Math.max(0, Number(inv.stock) || 0);
                  const oldCost = unitCostOf(inv);
                  inv.stock = oldQty + qty;
                  // Industry standard: weighted average unit cost on receive
                  if (unitCost > 0) {
                    const avg =
                      global.RSRecipeUnits && RSRecipeUnits.weightedAverageCost
                        ? RSRecipeUnits.weightedAverageCost(oldQty, oldCost, qty, unitCost)
                        : oldQty > 0 && oldCost > 0
                          ? (oldQty * oldCost + qty * unitCost) / (oldQty + qty)
                          : unitCost;
                    inv.cost = Math.round(avg * 10000) / 10000;
                    inv.unit_cost = inv.cost;
                    inv.lastBuyCost = unitCost;
                  }
                  if (global.RS_DB) {await RS_DB.put('inventory', inv.id, inv);}
                  if (global.RSInventoryBatches && RSInventoryBatches.receiveBatch) {
                    await RSInventoryBatches.receiveBatch({
                      item: inv,
                      qty,
                      unit: inv.unit,
                      expiryDate,
                      source: 'quick_receive',
                      cost: unitCost || inv.cost,
                    });
                  }
                  finishOperationStatus('Stock received');
                  toast(
                    `+${qty} ${inv.unit || ''} ${displayInvName(inv.name)}` +
                      (unitCost > 0
                        ? ' · buy ' +
                          rs(unitCost) +
                          ' · avg cost ' +
                          rs(inv.cost) +
                          '/' +
                          (inv.unit || '')
                        : '') +
                      (expiryDate ? ' · use by ' + expiryDate : ''),
                    'fa-box-open'
                  );
                  renderInventory();
                } catch (e) {
                  console.warn(e);
                  finishOperationStatus('Receive failed', 'error');
                  toast('Could not receive stock', 'fa-circle-exclamation');
                }
              };
            },
          });
        });
      });

      $$('#inv-table-body .icon-act.inv-edit').forEach((b) => {
        b.addEventListener('click', () => {
          const row = b.closest('tr');
          const inv = findInvByRow(row);
          if (!inv) {return;}

          if (!global.RSModal) {
            toast('Modal module is unavailable', 'fa-circle-exclamation');
            return;
          }

          const catOpts = [
            'Food',
            'Dairy',
            'Meat & seafood',
            'Produce',
            'Spices & dry',
            'Beverages',
            'Packaging',
            'Disposables',
            'Cleaning',
            'Fuel & utilities',
            'Other',
            'General',
          ];
          const curCat = inv.cat || 'General';
          const catSelect =
            catOpts
              .map((c) => `<option value="${_e(c)}" ${c === curCat ? 'selected' : ''}>${_e(c)}</option>`)
              .join('') +
            (!catOpts.includes(curCat)
              ? `<option value="${_e(curCat)}" selected>${_e(curCat)}</option>`
              : '') +
            '<option value="__custom__">+ Custom…</option>';

          const body = `
            <div style="display:flex;flex-direction:column;gap:14px">
              <div><label class="fl">Item name</label><input class="form-input" id="edit-ing-name" value="${_e(inv.name)}"></div>
              <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px">
                <div>
                  <label class="fl">Category</label>
                  <select class="form-input" id="edit-ing-cat">${catSelect}</select>
                  <input class="form-input" id="edit-ing-cat-custom" placeholder="Custom category" style="display:none;margin-top:6px">
                </div>
                <div>
                  <label class="fl">Unit</label>
                  ${
                    global.RSRecipeUnits && RSRecipeUnits.unitSelectHtml
                      ? RSRecipeUnits.unitSelectHtml(inv.unit || 'kg', 'edit-ing-unit')
                      : `<select class="form-input" id="edit-ing-unit">
                          ${['kg', 'gm', 'ltr', 'ml']
                            .map(
                              (u) =>
                                `<option value="${u}" ${String(inv.unit || 'kg').toLowerCase() === u || (inv.unit === 'g' && u === 'gm') || ((inv.unit === 'L' || inv.unit === 'l') && u === 'ltr') ? 'selected' : ''}>${u}</option>`
                            )
                            .join('')}
                        </select>`
                  }
                </div>
              </div>
              <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px">
                <div><label class="fl">Current stock</label><input class="form-input" id="edit-ing-stock" type="number" min="0" value="${inv.stock}"></div>
                <div><label class="fl">Min level (reorder at)</label><input class="form-input" id="edit-ing-min" type="number" min="0" value="${inv.min}"></div>
              </div>
              <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px">
                <div>
                  <label class="fl">Unit cost (${rs(1).replace(/[\d.,]/g, '').trim() || '₹'} / ${_e(inv.unit || 'unit')}) <span style="color:var(--amber)">· linked</span></label>
                  <input class="form-input" id="edit-ing-cost" type="number" min="0" step="any" value="${unitCostOf(inv) || ''}" placeholder="What you pay per unit">
                  <div style="font-size:11.5px;color:var(--text-mute);margin-top:4px">Stock value: <b id="edit-ing-val">${rs(stockValueOf(inv))}</b></div>
                </div>
                <div><label class="fl">Supplier</label><input class="form-input" id="edit-ing-supplier" value="${_e(inv.supplier || inv.vendor || '')}" placeholder="Optional"></div>
              </div>
              <p style="margin:0;font-size:12px;color:var(--text-soft);line-height:1.45">Unit cost feeds recipe plate cost &amp; margin. Packaging works the same as food when linked on a recipe.</p>
            </div>`;

          RSModal.open({
            title: 'Edit stock item',
            sub: 'Food, packaging, or any kitchen supply',
            icon: 'fa-pen',
            size: 'sm',
            body,
            foot: '<button class="btn btn-ghost" style="flex:1" data-cancel>Cancel</button><button class="btn btn-danger" style="flex:0" data-delete title="Remove from stock"><i class="fa-solid fa-trash"></i></button><button class="btn btn-primary" style="flex:1" data-confirm><i class="fa-solid fa-circle-check"></i> Save changes</button>',
            onMount(modal, close) {
              const catSel = modal.querySelector('#edit-ing-cat');
              const catCustom = modal.querySelector('#edit-ing-cat-custom');
              const costEl = modal.querySelector('#edit-ing-cost');
              const valEl = modal.querySelector('#edit-ing-val');
              const stockEl = modal.querySelector('#edit-ing-stock');
              const refreshVal = () => {
                if (!valEl) {return;}
                const c = Math.max(0, Number(costEl.value) || 0);
                const s = Math.max(0, Number(stockEl.value) || 0);
                valEl.textContent = rs(Math.round(c * s * 100) / 100);
              };
              if (costEl) {costEl.addEventListener('input', refreshVal);}
              if (stockEl) {stockEl.addEventListener('input', refreshVal);}
              if (catSel)
                {catSel.onchange = () => {
                  if (catSel.value === '__custom__') {
                    catCustom.style.display = '';
                    catCustom.focus();
                  } else {catCustom.style.display = 'none';}
                };}
              modal.querySelector('[data-cancel]').onclick = close;
              modal.querySelector('[data-delete]').onclick = async () => {
                close();
                setOperationStatus('Removing stock item...');
                try {
                  const idx = INVENTORY.findIndex((x) => x.id === inv.id);
                  if (idx > -1) {INVENTORY.splice(idx, 1);}
                  if (global.RS_DB) {await RS_DB.del('inventory', inv.id);}
                  finishOperationStatus('Stock item removed');
                  toast(`${inv.name} removed from inventory`, 'fa-circle-check');
                  renderInventory();
                } catch (e) {
                  console.warn('Failed to remove stock item', e);
                  finishOperationStatus('Failed to remove item', 'error');
                  toast('Could not remove item -- try again', 'fa-circle-exclamation');
                }
              };
              modal.querySelector('[data-confirm]').onclick = async () => {
                const newName = modal.querySelector('#edit-ing-name').value.trim();
                if (!newName) {return toast('Enter item name', 'fa-circle-exclamation');}
                inv.name = newName;
                let cat = modal.querySelector('#edit-ing-cat').value;
                if (cat === '__custom__') {cat = (catCustom.value || '').trim() || 'Other';}
                inv.cat = cat || 'General';
                inv.unit = modal.querySelector('#edit-ing-unit').value.trim() || 'unit';
                inv.stock = +modal.querySelector('#edit-ing-stock').value || 0;
                inv.min = +modal.querySelector('#edit-ing-min').value || 0;
                inv.cost = +modal.querySelector('#edit-ing-cost').value || 0;
                inv.unit_cost = inv.cost;
                inv.supplier = (modal.querySelector('#edit-ing-supplier').value || '').trim();
                if (!(inv.cost > 0)) {
                  toast('Set unit cost so this item is linked for plate costing', 'fa-indian-rupee-sign');
                  modal.querySelector('#edit-ing-cost').focus();
                  return;
                }
                close();
                setOperationStatus('Saving changes...');
                try {
                  if (global.RS_DB) {await RS_DB.put('inventory', inv.id, inv);}
                  finishOperationStatus('Stock item updated');
                  toast(`${displayInvName(inv.name)} updated · cost ${rs(inv.cost)}/${inv.unit || 'unit'}`, 'fa-link');
                  renderInventory();
                } catch (e) {
                  console.warn('Failed to save ingredient edit', e);
                  finishOperationStatus('Saved locally -- cloud sync pending', 'error');
                  toast('Saved locally. Cloud sync pending.', 'fa-circle-exclamation');
                  renderInventory();
                }
              };
            },
          });
        });
      });
    }

    const recipeBody = $('#recipe-table-body');
    if (recipeBody) {
      const invCost = (name) => {
        const inv = INVENTORY.find((x) => x.name === name);
        return inv ? inv.cost : 0;
      };
      recipeBody.innerHTML = MENU.length
        ? MENU.map((m) => {
            const ings = m.ingredients || [];
            const cost = ings.reduce((a, g) => a + g.qty * invCost(g.name), 0);
            const margin = m.price && cost ? Math.round((1 - cost / m.price) * 100) : m.price ? 100 : 0;
            const ingText = ings.length
              ? ings.map((g) => `${_e(g.qty)}${_e(g.unit)} ${_e(g.name)}`).join(', ')
              : '<span style="color:var(--text-mute)">No recipe -- click ✎ to define</span>';
            return `<tr>
            <td><div style="display:flex;align-items:center;gap:9px"><span class="veg ${m.veg ? '' : 'nonveg'}"></span><b>${_e(m.name)}</b></div></td>
            <td>${_e(m.cat)}</td>
            <td style="max-width:220px;font-size:12px">${ingText}</td>
            <td class="td-strong">${cost ? rs(cost) : '--'}</td>
            <td class="td-strong">${rs(m.price)}</td>
            <td><span class="stock-dot ${margin >= 50 ? 'stock-ok' : margin >= 20 ? 'stock-low' : 'stock-out'}">${cost ? margin + '%' : '--'}</span></td>
            <td><button class="icon-act go" data-recipe-edit="${_e(m.id)}" title="Define recipe"><i class="fa-solid fa-pen"></i></button></td>
          </tr>`;
          }).join('')
        : '<tr><td colspan="7" style="text-align:center;color:var(--text-mute);padding:30px">No menu items yet - add items in Menu Editor first</td></tr>';

      $$('#recipe-table-body [data-recipe-edit]').forEach((btn) => {
        btn.onclick = () => {
          if (global.RS && RS.activateTab) {RS.activateTab('editor-tab');}
          setTimeout(() => {
            const m = MENU.find((x) => String(x.id) === String(btn.dataset.recipeEdit));
            if (m && global.buildFormLoad) {global.buildFormLoad(m);}
          }, 200);
        };
      });
    }

    const bulkRecBtn = $('#btn-bulk-recipe-import');
    if (bulkRecBtn && !bulkRecBtn._wired) {
      bulkRecBtn._wired = true;
      bulkRecBtn.onclick = () => {
        const root = getModalRoot();
        const wrap = document.createElement('div');
        wrap.className = 'dash-modal active';
        wrap.innerHTML =
          '<div class="dm-card" style="max-width:520px">' +
          '<h3 style="margin:0 0 4px;font-size:17px">Bulk Import Recipes</h3>' +
          '<p style="margin:0 0 12px;color:var(--text-mute);font-size:12.5px">One ingredient per line: <b>Menu Item, Ingredient, Qty, Unit</b>. Items &amp; ingredients must already exist. Repeated item rows accumulate; existing recipes for listed items are replaced.</p>' +
          '<textarea id="bulk-rec-ta" rows="8" placeholder="Masala Dosa, Dosa Batter, 0.15, kg\nMasala Dosa, Potato, 0.1, kg" style="width:100%;box-sizing:border-box;font-family:monospace;font-size:12.5px;padding:10px;border:1px solid var(--stroke-2);border-radius:8px;background:var(--panel);color:var(--text);resize:vertical"></textarea>' +
          '<div id="bulk-rec-out" style="font-size:12px;margin-top:8px;line-height:1.5"></div>' +
          '<div style="display:flex;gap:10px;margin-top:14px"><button class="btn btn-ghost" id="bulk-rec-cancel" style="flex:1">Cancel</button><button class="btn btn-primary" id="bulk-rec-go" style="flex:1"><i class="fa-solid fa-circle-check"></i> Import</button></div>' +
          '</div>';
        root.appendChild(wrap);
        const close = () => {
          try {
            root.removeChild(wrap);
          } catch (e) {}
        };
        wrap.querySelector('#bulk-rec-cancel').onclick = close;
        wrap.addEventListener('click', (e) => {
          if (e.target === wrap) {close();}
        });
        wrap.querySelector('#bulk-rec-go').onclick = async () => {
          const raw = (wrap.querySelector('#bulk-rec-ta').value || '').trim();
          const out = wrap.querySelector('#bulk-rec-out');
          if (!raw) {
            out.innerHTML = '<span style="color:var(--red)">Nothing to import.</span>';
            return;
          }
          const byItem = {};
          const errors = [];
          raw.split(/\r?\n/).forEach((line, idx) => {
            const t = line.trim();
            if (!t) {return;}
            const parts = t.split(',').map((s) => s.trim());
            if (parts.length < 3) {
              errors.push('Line ' + (idx + 1) + ': need Item, Ingredient, Qty, Unit');
              return;
            }
            const menuItem = MENU.find((m) => m.name.toLowerCase() === parts[0].toLowerCase());
            if (!menuItem) {
              errors.push('Line ' + (idx + 1) + ': item "' + _e(parts[0]) + '" not found');
              return;
            }
            const invItem = INVENTORY.find((i) => i.name.toLowerCase() === parts[1].toLowerCase());
            if (!invItem) {
              errors.push('Line ' + (idx + 1) + ': ingredient "' + _e(parts[1]) + '" not in inventory');
              return;
            }
            const qty = parseFloat(parts[2]);
            if (!(qty > 0)) {
              errors.push('Line ' + (idx + 1) + ': bad qty "' + _e(parts[2]) + '"');
              return;
            }
            (byItem[menuItem.id] = byItem[menuItem.id] || { m: menuItem, ings: [] }).ings.push({
              name: invItem.name,
              qty: qty,
              unit: parts[3] || invItem.unit || '',
            });
          });
          const ids = Object.keys(byItem);
          if (!ids.length) {
            out.innerHTML =
              '<span style="color:var(--red)">No valid rows.</span>' +
              (errors.length ? '<br>' + errors.slice(0, 6).join('<br>') : '');
            return;
          }
          let links = 0;
          ids.forEach((id) => {
            byItem[id].m.ingredients = byItem[id].ings;
            links += byItem[id].ings.length;
          });
          const prog =
            global.RSProgress &&
            RSProgress.open({
              title: 'Importing recipes…',
              sub: 'Linking ingredients to menu items',
              total: ids.length,
              unit: 'items',
            });
          try {
            for (let i = 0; i < ids.length; i++) {
              const row = byItem[ids[i]];
              if (global.RS && RS.saveOne) {await RS.saveOne('menu', row.m);}
              if (prog) {prog.update({ done: i + 1 });}
            }
            if (global.RS && RS.save && !global.RS.saveOne) {await RS.save('menu');}
            if (prog) {prog.close();}
            toast('Recipes imported: ' + ids.length + ' item(s), ' + links + ' ingredient links', 'fa-circle-check');
            if (errors.length) {
              out.innerHTML =
                '<span style="color:var(--green)">Imported ' +
                ids.length +
                '.</span> <span style="color:var(--red)">' +
                errors.length +
                ' skipped:</span><br>' +
                errors.slice(0, 6).join('<br>');
            } else {
              close();
              renderInventory();
            }
          } catch (e) {
            if (prog) {prog.close();}
            console.warn('Recipe import save failed', e);
            out.innerHTML = '<span style="color:var(--red)">Save failed -- recipes were not saved. Try again.</span>';
            toast('Recipe import failed to save -- try again', 'fa-circle-exclamation');
          }
        };
      };
    }

    const seg = $('#inv-seg');
    if (seg && !seg.dataset.wired) {
      seg.dataset.wired = '1';
      seg.querySelectorAll('[data-inv-tab]').forEach((btn) => {
        btn.onclick = () => {
          const tab = btn.dataset.invTab || 'stock';
          seg.querySelectorAll('button').forEach((b) => b.classList.remove('active'));
          btn.classList.add('active');
          // Legacy stock panel
          const stockPanel = $('#inv-panel-stock');
          if (stockPanel) {
            stockPanel.style.display = tab === 'stock' ? '' : 'none';
            stockPanel.classList.toggle('active', tab === 'stock');
          }
          // features-manage sub-panes (recipes / suppliers / pos / waste)
          document.querySelectorAll('#inventory-tab .subtab-pane').forEach((p) => {
            const isStockPane = p.id === 'inv-panel-stock' || p.dataset.pane === 'stock';
            const match = p.dataset.pane === tab || (tab === 'stock' && isStockPane);
            p.classList.toggle('active', match);
            if (p.id && p.id.startsWith('inv-panel-')) {
              p.style.display = match ? '' : 'none';
            }
          });
          if (global.RSInventoryToolbar && RSInventoryToolbar.sync) {
            RSInventoryToolbar.sync(tab);
          } else {
            // Hide toolbar actions that only apply to stock list when on other tabs
            const stockOnly = [
              'btn-add-ingredient',
              'btn-import-inventory',
              'btn-download-inventory-template',
              'btn-export-inventory',
              'btn-export-low-stock-toolbar',
              'btn-inv-variance',
              'btn-inv-prep',
              'btn-inv-takeaway-pack',
              'inv-stock-search',
            ];
            stockOnly.forEach((id) => {
              const el = document.getElementById(id);
              if (!el) {return;}
              if (id === 'inv-stock-search') {
                const wrap = el.closest('.inv-search-wrap') || el;
                wrap.style.display = tab === 'stock' ? '' : 'none';
              } else {
                el.style.display = tab === 'stock' ? '' : 'none';
              }
            });
          }
        };
      });
    }

    // Shared: stock-only chrome (Variance / Prep / Export / search) only on Stock levels
    global.RSInventoryToolbar = {
      sync(pane) {
        const isStock = !pane || pane === 'stock';
        const stockOnly = [
          'btn-add-ingredient',
          'btn-import-inventory',
          'btn-download-inventory-template',
          'btn-export-inventory',
          'btn-export-low-stock-toolbar',
          'btn-inv-variance',
          'btn-inv-prep',
          'btn-inv-takeaway-pack',
          'inv-stock-search',
        ];
        stockOnly.forEach((id) => {
          const el = document.getElementById(id);
          if (!el) {return;}
          if (id === 'inv-stock-search') {
            const wrap = el.closest('.inv-search-wrap') || el;
            wrap.style.display = isStock ? '' : 'none';
          } else {
            el.style.display = isStock ? '' : 'none';
          }
        });
      },
      activePane() {
        const a = document.querySelector('#inv-seg button.active');
        return (a && (a.getAttribute('data-inv-tab') || a.dataset.invTab)) || 'stock';
      },
    };
    try {
      global.RSInventoryToolbar.sync(global.RSInventoryToolbar.activePane());
    } catch (_) {}

    // Stock types: food + packaging + disposables + cleaning + other (all reduce on recipe link)
    const STOCK_TYPE_PRESETS = [
      { id: 'food', label: 'Food / raw', icon: 'fa-carrot', cat: 'Food', unit: 'kg', ph: 'e.g. Paneer, Basmati rice' },
      { id: 'packaging', label: 'Packaging', icon: 'fa-box', cat: 'Packaging', unit: 'gm', ph: 'e.g. Foil sheet weight / pack weight' },
      { id: 'disposables', label: 'Disposables', icon: 'fa-spoon', cat: 'Disposables', unit: 'gm', ph: 'e.g. Napkin pack weight' },
      { id: 'cleaning', label: 'Cleaning', icon: 'fa-spray-can-sparkles', cat: 'Cleaning', unit: 'ltr', ph: 'e.g. Dishwash liquid' },
      { id: 'other', label: 'Other', icon: 'fa-cube', cat: 'Other', unit: 'kg', ph: 'e.g. Charcoal, dry goods' },
    ];
    const STOCK_CAT_OPTIONS = [
      'Food',
      'Dairy',
      'Meat & seafood',
      'Produce',
      'Spices & dry',
      'Beverages',
      'Packaging',
      'Disposables',
      'Cleaning',
      'Fuel & utilities',
      'Other',
      'General',
    ];
    const PACKAGING_QUICK = [
      { name: 'Takeaway box', cat: 'Packaging', unit: 'gm', min: 50, cost: 0 },
      { name: 'Paper bag', cat: 'Packaging', unit: 'gm', min: 50, cost: 0 },
      { name: 'Plastic container', cat: 'Packaging', unit: 'gm', min: 50, cost: 0 },
      { name: 'Aluminium foil', cat: 'Packaging', unit: 'gm', min: 100, cost: 0 },
      { name: 'Butter paper', cat: 'Packaging', unit: 'gm', min: 100, cost: 0 },
      { name: 'Carry bag', cat: 'Packaging', unit: 'gm', min: 50, cost: 0 },
      { name: 'Napkin', cat: 'Disposables', unit: 'gm', min: 200, cost: 0 },
      { name: 'Spoon / fork set', cat: 'Disposables', unit: 'gm', min: 100, cost: 0 },
      { name: 'Straw', cat: 'Disposables', unit: 'gm', min: 100, cost: 0 },
      { name: 'Tissue', cat: 'Disposables', unit: 'gm', min: 20, cost: 0 },
    ];
    // Standard kitchen units only (as used in recipes + stock)
    const UNIT_OPTIONS =
      (global.RSRecipeUnits && RSRecipeUnits.STOCK_UNITS) || ['kg', 'gm', 'ltr', 'ml'];

    async function saveStockItem(item) {
      INVENTORY.push(item);
      try {
        if (global.RS_DB) {await RS_DB.put('inventory', item.id, item);}
        toast(item.name + ' added · synced', 'fa-circle-check');
      } catch (e) {
        console.warn('add stock save', e);
        toast(item.name + ' added locally · cloud pending', 'fa-circle-exclamation');
      }
      renderInventory();
      try {
        if (global.RSKitchenLinkCoach && RSKitchenLinkCoach.refreshSetupNav) {
          RSKitchenLinkCoach.refreshSetupNav();
        }
      } catch (_) {}
    }

    function openAddStockModal(opts) {
      opts = opts || {};
      if (!global.RSModal) {return;}
      let typeId = opts.typeId || 'food';
      const preset0 = STOCK_TYPE_PRESETS.find((t) => t.id === typeId) || STOCK_TYPE_PRESETS[0];

      RSModal.open({
        title: 'Add stock item',
        sub: 'Food, packaging, disposables — anything the kitchen uses',
        icon: 'fa-boxes-stacked',
        size: 'md',
        body: `
          <div class="inv-add-stock">
            <div class="klc-p" style="margin-bottom:10px">Not only food. Add boxes, bags, napkins, foil — link them on a recipe so sales reduce them too.</div>
            <div class="inv-type-chips" id="add-ing-types">
              ${STOCK_TYPE_PRESETS.map(
                (t) =>
                  `<button type="button" class="inv-type-chip ${t.id === typeId ? 'active' : ''}" data-type="${t.id}">
                    <i class="fa-solid ${t.icon}"></i> ${t.label}
                  </button>`
              ).join('')}
            </div>
            <div class="inv-quick-pack" id="add-ing-quick">
              <div class="inv-quick-title"><i class="fa-solid fa-bolt"></i> Quick add common packaging</div>
              <div class="inv-quick-chips">
                ${PACKAGING_QUICK.map(
                  (q, i) =>
                    `<button type="button" class="klc-chip" data-quick="${i}" title="${esc(q.cat)}">
                      <i class="fa-solid fa-plus"></i> ${esc(q.name)}
                    </button>`
                ).join('')}
              </div>
            </div>
            <div style="display:flex;flex-direction:column;gap:12px;margin-top:12px">
              <div><label class="fl">Item name</label><input class="form-input" id="add-ing-name" placeholder="${esc(preset0.ph)}"></div>
              <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px">
                <div>
                  <label class="fl">Category</label>
                  <select class="form-input" id="add-ing-cat">
                    ${STOCK_CAT_OPTIONS.map((c) => `<option value="${esc(c)}" ${c === preset0.cat ? 'selected' : ''}>${esc(c)}</option>`).join('')}
                    <option value="__custom__">+ Custom…</option>
                  </select>
                  <input class="form-input" id="add-ing-cat-custom" placeholder="Custom category" style="display:none;margin-top:6px">
                </div>
                <div>
                  <label class="fl">Unit</label>
                  <select class="form-input" id="add-ing-unit">
                    ${UNIT_OPTIONS.map((u) => `<option value="${esc(u)}" ${u === preset0.unit ? 'selected' : ''}>${esc(u)}</option>`).join('')}
                  </select>
                </div>
              </div>
              <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px">
                <div><label class="fl">Current stock</label><input class="form-input" id="add-ing-stock" type="number" min="0" placeholder="0"></div>
                <div><label class="fl">Min level (reorder at)</label><input class="form-input" id="add-ing-min" type="number" min="0" placeholder="10" value="10"></div>
              </div>
              <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px">
                <div>
                  <label class="fl">Unit cost (₹) <span style="color:var(--amber);font-weight:700">· links recipes</span></label>
                  <input class="form-input" id="add-ing-cost" type="number" min="0" step="any" placeholder="What you pay per unit">
                  <div style="font-size:11.5px;color:var(--text-mute);margin-top:4px">Per 1 unit — used for plate cost &amp; stock value</div>
                </div>
                <div><label class="fl">Supplier (optional)</label><input class="form-input" id="add-ing-supplier" placeholder="e.g. Metro Cash"></div>
              </div>
            </div>
          </div>`,
        foot: '<button class="btn btn-ghost" style="flex:1" data-x>Cancel</button><button class="btn btn-primary" style="flex:1.2" data-ok><i class="fa-solid fa-circle-check"></i> Add to stock</button>',
        onMount(modal, close) {
          modal.querySelector('[data-x]').onclick = close;
          const nameEl = modal.querySelector('#add-ing-name');
          const catEl = modal.querySelector('#add-ing-cat');
          const catCustom = modal.querySelector('#add-ing-cat-custom');
          const unitEl = modal.querySelector('#add-ing-unit');
          const minEl = modal.querySelector('#add-ing-min');

          function applyType(id) {
            typeId = id;
            const p = STOCK_TYPE_PRESETS.find((t) => t.id === id) || STOCK_TYPE_PRESETS[0];
            modal.querySelectorAll('.inv-type-chip').forEach((b) => b.classList.toggle('active', b.getAttribute('data-type') === id));
            if (catEl && !catCustom.value) {
              if ([...catEl.options].some((o) => o.value === p.cat)) {catEl.value = p.cat;}
            }
            if (unitEl && UNIT_OPTIONS.includes(p.unit)) {unitEl.value = p.unit;}
            if (nameEl && !nameEl.value) {nameEl.placeholder = p.ph;}
            // Higher default min for packaging/disposables
            if (minEl && (id === 'packaging' || id === 'disposables') && (!minEl.value || minEl.value === '10')) {
              minEl.value = '50';
            }
          }

          modal.querySelectorAll('[data-type]').forEach((btn) => {
            btn.onclick = () => applyType(btn.getAttribute('data-type'));
          });
          if (catEl)
            {catEl.onchange = () => {
              if (catEl.value === '__custom__') {
                catCustom.style.display = '';
                catCustom.focus();
              } else {
                catCustom.style.display = 'none';
              }
            };}

          modal.querySelectorAll('[data-quick]').forEach((chip) => {
            chip.onclick = async () => {
              const q = PACKAGING_QUICK[+chip.getAttribute('data-quick')];
              if (!q) {return;}
              const exists = INVENTORY.find((x) => String(x.name).toLowerCase() === q.name.toLowerCase());
              if (exists) {
                toast(q.name + ' is already in stock', 'fa-circle-info');
                return;
              }
              const item = {
                id: 'inv_' + q.name.toLowerCase().replace(/[^a-z0-9]+/g, '_') + '_' + Date.now(),
                name: q.name,
                cat: q.cat,
                unit: q.unit,
                stock: 0,
                min: q.min || 50,
                cost: q.cost || 0,
                supplier: '',
              };
              await saveStockItem(item);
              chip.disabled = true;
              chip.style.opacity = '0.5';
              toast('Added “' + q.name + '” — set stock qty anytime', 'fa-box');
            };
          });

          modal.querySelector('[data-ok]').onclick = async () => {
            const name = nameEl.value.trim();
            if (!name) {return toast('Enter item name', 'fa-circle-exclamation');}
            let cat = catEl.value;
            if (cat === '__custom__') {cat = (catCustom.value || '').trim() || 'Other';}
            if (!cat) {cat = 'General';}
            const costVal = +modal.querySelector('#add-ing-cost').value || 0;
            if (!(costVal > 0)) {
              toast('Add unit cost (₹ per unit) so this item links to plate cost', 'fa-indian-rupee-sign');
              modal.querySelector('#add-ing-cost').focus();
              return;
            }
            const item = {
              id: 'inv_' + name.toLowerCase().replace(/[^a-z0-9]+/g, '_') + '_' + Date.now(),
              name,
              cat,
              unit: (unitEl.value || 'unit').trim(),
              stock: +modal.querySelector('#add-ing-stock').value || 0,
              min: +modal.querySelector('#add-ing-min').value || 10,
              cost: costVal,
              unit_cost: costVal,
              supplier: (modal.querySelector('#add-ing-supplier').value || '').trim(),
            };
            await saveStockItem(item);
            close();
          };
          if (nameEl) {nameEl.focus();}
        },
      });
    }

    function openVarianceReport() {
      if (!global.RSModal) {return;}
      const bills = (global.RS && RS.BILLS) || [];
      const menu = (global.RS && RS.MENU) || [];
      const now = Date.now();
      const dayMs = 86400000;
      function inRange(b, days) {
        const t = b.dateTime || b.created_at || b.time;
        const ms = t ? new Date(t).getTime() : 0;
        if (!ms) {return days >= 30;} // include undated in long window
        return now - ms <= days * dayMs;
      }
      const periods = [
        { key: '1', label: 'Today', days: 1 },
        { key: '7', label: '7 days', days: 7 },
        { key: '30', label: '30 days', days: 30 },
      ];
      let period = periods[1];
      function rowsFor() {
        const subset = bills.filter((b) => inRange(b, period.days));
        const usage =
          global.RSRecipeUnits && RSRecipeUnits.theoreticalUsageFromBills
            ? RSRecipeUnits.theoreticalUsageFromBills(subset, menu, INVENTORY)
            : [];
        usage.sort((a, b) => b.qty - a.qty);
        return { usage, billN: subset.length };
      }
      function bodyHtml() {
        const { usage, billN } = rowsFor();
        const tabs = periods
          .map(
            (p) =>
              `<button type="button" class="btn btn-ghost btn-sm${p.key === period.key ? ' active' : ''}" data-per="${p.key}" style="${
                p.key === period.key ? 'border-color:var(--orange);color:var(--orange);font-weight:700' : ''
              }">${p.label}</button>`
          )
          .join('');
        if (!usage.length) {
          return `<div class="klc-p">${tabs}</div>
            <div class="sr-empty" style="padding:28px">No recipe-based usage in this period (${billN} bills). Link recipes and sell dishes to see variance.</div>`;
        }
        const lines = usage
          .slice(0, 40)
          .map((u) => {
            const inv = INVENTORY.find(
              (i) => String(i.name).toLowerCase() === String(u.name).toLowerCase()
            );
            const stock = inv ? Number(inv.stock) || 0 : '—';
            const unit = (global.RSRecipeUnits && RSRecipeUnits.displayUnit
              ? RSRecipeUnits.displayUnit(u.unit || (inv && inv.unit) || 'kg')
              : u.unit) || '';
            const cost = inv ? unitCostOf(inv) : 0;
            const used = Math.round(u.qty * 1000) / 1000;
            const val = cost > 0 ? rs(Math.round(used * cost * 100) / 100) : '—';
            return `<tr>
              <td><b>${esc(displayInvName(u.name))}</b></td>
              <td class="td-strong">${used} ${esc(unit)}</td>
              <td>${stock === '—' ? '—' : stock + ' ' + esc(unit)}</td>
              <td>${val}</td>
            </tr>`;
          })
          .join('');
        return `<div style="display:flex;flex-wrap:wrap;gap:6px;margin-bottom:10px">${tabs}</div>
          <p class="klc-p" style="margin-bottom:8px"><b>${billN}</b> paid bills · theoretical use from recipes (industry variance base). Compare to physical count.</p>
          <div class="table-scroll"><table class="data-table">
            <thead><tr><th>Stock item</th><th>Used (theory)</th><th>On hand now</th><th>Est. cost used</th></tr></thead>
            <tbody>${lines}</tbody>
          </table></div>`;
      }
      function remount() {
        global.RSModal.open({
          title: 'Stock variance',
          sub: 'Recipe theory from sales · PetPooja-style usage view',
          icon: 'fa-chart-column',
          size: 'md',
          body: bodyHtml(),
          foot: `<button type="button" class="btn btn-ghost" style="flex:1" data-x>Close</button>
            <button type="button" class="btn btn-primary" style="flex:1" data-csv><i class="fa-solid fa-file-csv"></i> Export CSV</button>`,
          onMount(m, close) {
            m.querySelector('[data-x]').onclick = close;
            m.querySelectorAll('[data-per]').forEach((btn) => {
              btn.onclick = () => {
                period = periods.find((p) => p.key === btn.getAttribute('data-per')) || period;
                close();
                remount();
              };
            });
            const csvBtn = m.querySelector('[data-csv]');
            if (csvBtn)
              {csvBtn.onclick = () => {
                const { usage } = rowsFor();
                if (!usage.length) {return toast('Nothing to export', 'fa-circle-info');}
                const escC = (v) => '"' + String(v == null ? '' : v).replace(/"/g, '""') + '"';
                const csv =
                  '\uFEFF' +
                  ['item', 'theory_used', 'unit', 'on_hand', 'est_cost']
                    .map(escC)
                    .join(',') +
                  '\r\n' +
                  usage
                    .map((u) => {
                      const inv = INVENTORY.find(
                        (i) => String(i.name).toLowerCase() === String(u.name).toLowerCase()
                      );
                      const used = Math.round(u.qty * 1000) / 1000;
                      const cost = inv ? unitCostOf(inv) : 0;
                      return [
                        u.name,
                        used,
                        u.unit || '',
                        inv ? inv.stock : '',
                        cost > 0 ? Math.round(used * cost * 100) / 100 : '',
                      ]
                        .map(escC)
                        .join(',');
                    })
                    .join('\r\n');
                if (global.RS && RS.downloadFile)
                  {RS.downloadFile(csv, 'text/csv;charset=utf-8;', 'stock-variance.csv');}
                toast('Variance CSV exported', 'fa-file-csv');
              };}
          },
        });
      }
      remount();
    }

    function openPrepBatchModal() {
      if (!global.RSModal) {return;}
      if (!INVENTORY.length) {
        toast('Add stock items first', 'fa-boxes-stacked');
        return;
      }
      const inputs = [];
      RSModal.open({
        title: 'Run prep batch',
        sub: 'Use stock to make more stock (gravy, batter, sauce…) — industry prep recipe',
        icon: 'fa-blender',
        size: 'md',
        body: `
          <div style="display:flex;flex-direction:column;gap:12px">
            <p class="klc-p" style="margin:0">Example: onion + oil + spices → <b>curry gravy</b>. Inputs leave stock; output is added. Output cost is calculated from inputs.</p>
            <div style="display:grid;grid-template-columns:1.2fr 0.8fr 0.6fr;gap:8px">
              <div>
                <label class="fl">Output (what you make)</label>
                <select class="form-input" id="prep-out">
                  ${INVENTORY.map(
                    (i) =>
                      `<option value="${esc(i.id)}">${esc(displayInvName(i.name))} (${esc(
                        (global.RSRecipeUnits && RSRecipeUnits.displayUnit
                          ? RSRecipeUnits.displayUnit(i.unit)
                          : i.unit) || 'kg'
                      )})</option>`
                  ).join('')}
                </select>
              </div>
              <div>
                <label class="fl">Qty produced</label>
                <input class="form-input" id="prep-out-qty" type="number" min="0" step="any" value="1">
              </div>
              <div>
                <label class="fl">Unit</label>
                <input class="form-input" id="prep-out-unit" readonly value="">
              </div>
            </div>
            <div>
              <label class="fl">Inputs used</label>
              <div id="prep-inputs"></div>
              <button type="button" class="btn btn-ghost btn-block" id="prep-add-in" style="border-style:dashed;margin-top:8px"><i class="fa-solid fa-plus"></i> Add input from stock</button>
            </div>
            <div id="prep-cost-line" style="font-size:13px;color:var(--text-soft)"></div>
          </div>`,
        foot: `<button type="button" class="btn btn-ghost" style="flex:1" data-x>Cancel</button>
          <button type="button" class="btn btn-primary" style="flex:1.2" data-ok><i class="fa-solid fa-blender"></i> Run prep</button>`,
        onMount(modal, close) {
          const outSel = modal.querySelector('#prep-out');
          const outQty = modal.querySelector('#prep-out-qty');
          const outUnit = modal.querySelector('#prep-out-unit');
          const box = modal.querySelector('#prep-inputs');
          const costLine = modal.querySelector('#prep-cost-line');
          function syncOutUnit() {
            const inv = INVENTORY.find((i) => String(i.id) === String(outSel.value));
            outUnit.value =
              inv && global.RSRecipeUnits && RSRecipeUnits.displayUnit
                ? RSRecipeUnits.displayUnit(inv.unit)
                : (inv && inv.unit) || 'kg';
            refreshCost();
          }
          function refreshCost() {
            let total = 0;
            inputs.forEach((g) => {
              const inv = INVENTORY.find((i) => i.name === g.name);
              total += (Number(g.qty) || 0) * unitCostOf(inv || {});
            });
            const pq = Math.max(0, Number(outQty.value) || 0);
            const unitC = pq > 0 ? total / pq : 0;
            costLine.innerHTML =
              'Input cost <b>' +
              rs(Math.round(total * 100) / 100) +
              '</b>' +
              (pq > 0
                ? ' · output unit cost <b>' + rs(Math.round(unitC * 10000) / 10000) + '</b>/' + esc(outUnit.value)
                : '');
          }
          function drawInputs() {
            box.innerHTML =
              inputs
                .map(
                  (g, i) =>
                    `<div style="display:flex;gap:8px;align-items:center;margin-bottom:6px">
                  <span style="flex:1;font-weight:600">${esc(displayInvName(g.name))}</span>
                  <input type="number" class="form-input" data-pi="${i}" min="0" step="any" value="${esc(g.qty)}" style="width:90px">
                  <span style="width:40px;font-size:12px;color:var(--text-mute)">${esc(g.unit || '')}</span>
                  <button type="button" class="icon-act danger" data-pd="${i}"><i class="fa-solid fa-trash"></i></button>
                </div>`
                )
                .join('') ||
              '<div class="sr-empty" style="padding:12px;font-size:13px">Add what you consume from the store room.</div>';
            box.querySelectorAll('[data-pi]').forEach((inp) => {
              inp.oninput = () => {
                inputs[+inp.getAttribute('data-pi')].qty = Number(inp.value) || 0;
                refreshCost();
              };
            });
            box.querySelectorAll('[data-pd]').forEach((btn) => {
              btn.onclick = () => {
                inputs.splice(+btn.getAttribute('data-pd'), 1);
                drawInputs();
                refreshCost();
              };
            });
          }
          outSel.onchange = syncOutUnit;
          outQty.oninput = refreshCost;
          syncOutUnit();
          drawInputs();
          modal.querySelector('[data-x]').onclick = close;
          modal.querySelector('#prep-add-in').onclick = () => {
            global.RSModal.open({
              title: 'Add prep input',
              sub: 'Stock consumed to make the batch',
              icon: 'fa-cube',
              size: 'sm',
              body: '<input class="form-input" id="prep-q" placeholder="Search…" style="margin-bottom:10px"><div id="prep-pick" class="klc-pick-list"></div>',
              foot: '<button type="button" class="btn btn-ghost" style="flex:1" data-x>Close</button>',
              onMount(sm, sc) {
                sm.querySelector('[data-x]').onclick = sc;
                const q = sm.querySelector('#prep-q');
                const pick = sm.querySelector('#prep-pick');
                function draw() {
                  const t = (q.value || '').toLowerCase();
                  pick.innerHTML = INVENTORY.filter((i) =>
                    displayInvName(i.name).toLowerCase().includes(t)
                  )
                    .map(
                      (i) =>
                        `<button type="button" class="klc-pick" data-n="${esc(i.name)}" data-u="${esc(i.unit || 'kg')}">
                      <span class="klc-pick-t">${esc(displayInvName(i.name))}</span>
                      <span class="klc-pick-s">${Number(i.stock) || 0} ${esc(
                          global.RSRecipeUnits && RSRecipeUnits.displayUnit
                            ? RSRecipeUnits.displayUnit(i.unit)
                            : i.unit || ''
                        )}</span>
                    </button>`
                    )
                    .join('');
                  pick.querySelectorAll('[data-n]').forEach((el) => {
                    el.onclick = () => {
                      if (!inputs.find((g) => g.name === el.getAttribute('data-n'))) {
                        inputs.push({
                          name: el.getAttribute('data-n'),
                          qty: 1,
                          unit: el.getAttribute('data-u') || 'kg',
                        });
                      }
                      sc();
                      drawInputs();
                      refreshCost();
                    };
                  });
                }
                q.oninput = draw;
                draw();
              },
            });
          };
          modal.querySelector('[data-ok]').onclick = async () => {
            const out = INVENTORY.find((i) => String(i.id) === String(outSel.value));
            const pq = Math.max(0, Number(outQty.value) || 0);
            if (!out || pq <= 0) {return toast('Enter output quantity', 'fa-circle-exclamation');}
            if (!inputs.length) {return toast('Add at least one input', 'fa-circle-exclamation');}
            for (const g of inputs) {
              const inv = INVENTORY.find((i) => i.name === g.name);
              if (!inv || (Number(inv.stock) || 0) < (Number(g.qty) || 0)) {
                return toast('Not enough ' + (g.name || 'input') + ' in stock', 'fa-triangle-exclamation');
              }
            }
            let inputCost = 0;
            for (const g of inputs) {
              const inv = INVENTORY.find((i) => i.name === g.name);
              const q = Number(g.qty) || 0;
              inputCost += q * unitCostOf(inv);
              inv.stock = Math.max(0, (Number(inv.stock) || 0) - q);
              if (global.RSInventoryBatches && RSInventoryBatches.deductFefo) {
                try {
                  await RSInventoryBatches.deductFefo(inv, q);
                } catch (_) {}
              }
              if (global.RS_DB) {await RS_DB.put('inventory', inv.id, inv);}
            }
            const oldQty = Math.max(0, Number(out.stock) || 0);
            const oldCost = unitCostOf(out);
            const unitC = inputCost / pq;
            out.stock = oldQty + pq;
            out.cost =
              global.RSRecipeUnits && RSRecipeUnits.weightedAverageCost
                ? RSRecipeUnits.weightedAverageCost(oldQty, oldCost, pq, unitC)
                : unitC;
            out.unit_cost = out.cost;
            if (global.RS_DB) {await RS_DB.put('inventory', out.id, out);}
            close();
            toast(
              'Prep done · +' + pq + ' ' + (out.unit || '') + ' ' + displayInvName(out.name) + ' · avg ' + rs(out.cost),
              'fa-blender'
            );
            renderInventory();
          };
        },
      });
    }

    const addIngBtn = $('#btn-add-ingredient');
    if (addIngBtn && !addIngBtn.dataset.wired) {
      addIngBtn.dataset.wired = '1';
      addIngBtn.onclick = () => openAddStockModal();
    }
    const varBtn = $('#btn-inv-variance');
    if (varBtn && !varBtn.dataset.wired) {
      varBtn.dataset.wired = '1';
      varBtn.onclick = () => openVarianceReport();
    }
    const prepBtn = $('#btn-inv-prep');
    if (prepBtn && !prepBtn.dataset.wired) {
      prepBtn.dataset.wired = '1';
      prepBtn.onclick = () => openPrepBatchModal();
    }

    function loadTakeawayPackCfg() {
      try {
        if (global.RSInventoryLedger && RSInventoryLedger.loadTakeawayPackConfig) {
          return RSInventoryLedger.loadTakeawayPackConfig();
        }
        const raw = localStorage.getItem('rs_takeaway_pack');
        if (raw) {return JSON.parse(raw);}
      } catch (_) {}
      return { enabled: false, items: [], applyDelivery: true };
    }
    async function saveTakeawayPackCfg(cfg) {
      try {
        localStorage.setItem('rs_takeaway_pack', JSON.stringify(cfg));
      } catch (_) {}
      try {
        if (!global.RS_SETTINGS) {global.RS_SETTINGS = {};}
        global.RS_SETTINGS.set_takeaway_pack = cfg;
        if (global.RS && RS.saveSettings) {await RS.saveSettings(global.RS_SETTINGS);}
      } catch (_) {}
    }
    function openTakeawayPackModal() {
      if (!global.RSModal) {return;}
      const cfg = loadTakeawayPackCfg();
      let items = (cfg.items || []).map((x) => ({
        name: x.name,
        qty: Number(x.qty) || 1,
        unit: x.unit || 'gm',
      }));
      let enabled = cfg.enabled !== false;
      let applyDelivery = cfg.applyDelivery !== false;
      if (!items.length && INVENTORY.length) {
        // Suggest common packaging already in stock
        const sug = INVENTORY.filter((i) => {
          const hay = String(i.name || '').toLowerCase() + ' ' + String(i.cat || '').toLowerCase();
          return /pack|bag|box|napkin|foil|container|carry|parcel/.test(hay);
        }).slice(0, 4);
        items = sug.map((i) => ({
          name: i.name,
          qty: 1,
          unit: i.unit || 'gm',
        }));
      }
      RSModal.open({
        title: 'Takeaway packaging pack',
        sub: 'Auto-used on Takeaway / Delivery — not added to the customer cart',
        icon: 'fa-bag-shopping',
        size: 'md',
        body: `
          <div style="display:flex;flex-direction:column;gap:12px">
            <p class="klc-p" style="margin:0">
              <b>Do not put bags in the POS cart</b> (unless you charge a bag fee as a menu item).
              Industry practice: when order type is <b>Takeaway</b> or <b>Delivery</b>, stock of bag/box/napkin is deducted <b>once per bill</b> automatically.
              Per-dish packaging (e.g. pizza box) still belongs on that dish’s <b>recipe</b>.
            </p>
            <label style="display:flex;align-items:center;gap:8px;font-weight:700;cursor:pointer">
              <input type="checkbox" id="tk-en" ${enabled ? 'checked' : ''} style="width:16px;height:16px;accent-color:var(--orange)">
              Enable takeaway pack deduction
            </label>
            <label style="display:flex;align-items:center;gap:8px;font-size:13px;cursor:pointer">
              <input type="checkbox" id="tk-del" ${applyDelivery ? 'checked' : ''} style="width:16px;height:16px;accent-color:var(--orange)">
              Also apply on <b>Delivery</b> orders
            </label>
            <div>
              <label class="fl">Pack contents (from stock)</label>
              <div id="tk-list"></div>
              <button type="button" class="btn btn-ghost btn-block" id="tk-add" style="border-style:dashed;margin-top:8px">
                <i class="fa-solid fa-plus"></i> Add packaging item
              </button>
            </div>
            <div style="font-size:12px;color:var(--text-mute);line-height:1.45">
              Example: 1× Paper bag + 2× Napkin per takeaway bill. Units stay kg/gm/ltr/ml as on stock cards.
            </div>
          </div>`,
        foot: `<button type="button" class="btn btn-ghost" style="flex:1" data-x>Cancel</button>
          <button type="button" class="btn btn-primary" style="flex:1.2" data-ok><i class="fa-solid fa-circle-check"></i> Save pack</button>`,
        onMount(modal, close) {
          const listEl = modal.querySelector('#tk-list');
          function draw() {
            listEl.innerHTML =
              items
                .map(
                  (g, i) =>
                    `<div style="display:flex;gap:8px;align-items:center;margin-bottom:6px;flex-wrap:wrap">
                  <span style="flex:1;min-width:100px;font-weight:700">${esc(displayInvName(g.name))}</span>
                  <label style="font-size:11px;color:var(--text-mute)">Qty / order</label>
                  <input type="number" class="form-input" data-tq="${i}" min="0" step="any" value="${esc(g.qty)}" style="width:80px">
                  <span style="font-size:12px;color:var(--text-mute);min-width:36px">${esc(
                    global.RSRecipeUnits && RSRecipeUnits.displayUnit
                      ? RSRecipeUnits.displayUnit(g.unit)
                      : g.unit || ''
                  )}</span>
                  <button type="button" class="icon-act danger" data-td="${i}"><i class="fa-solid fa-trash"></i></button>
                </div>`
                )
                .join('') ||
              '<div class="sr-empty" style="padding:14px;font-size:13px">No items yet — add bag, box, napkin from stock.</div>';
            listEl.querySelectorAll('[data-tq]').forEach((inp) => {
              inp.oninput = () => {
                items[+inp.getAttribute('data-tq')].qty = Number(inp.value) || 0;
              };
            });
            listEl.querySelectorAll('[data-td]').forEach((btn) => {
              btn.onclick = () => {
                items.splice(+btn.getAttribute('data-td'), 1);
                draw();
              };
            });
          }
          draw();
          modal.querySelector('#tk-en').onchange = (e) => {
            enabled = !!e.target.checked;
          };
          modal.querySelector('#tk-del').onchange = (e) => {
            applyDelivery = !!e.target.checked;
          };
          modal.querySelector('[data-x]').onclick = close;
          modal.querySelector('#tk-add').onclick = () => {
            if (!INVENTORY.length) {
              toast('Add packaging to stock first (e.g. Paper bag)', 'fa-box');
              return;
            }
            global.RSModal.open({
              title: 'Add to takeaway pack',
              sub: 'Pick from store room',
              icon: 'fa-box',
              size: 'sm',
              body: '<input class="form-input" id="tk-q" placeholder="Search packaging…" style="margin-bottom:10px"><div id="tk-pick" class="klc-pick-list"></div>',
              foot: '<button type="button" class="btn btn-ghost" style="flex:1" data-x>Close</button>',
              onMount(sm, sc) {
                sm.querySelector('[data-x]').onclick = sc;
                const q = sm.querySelector('#tk-q');
                const pick = sm.querySelector('#tk-pick');
                function drawP() {
                  const t = (q.value || '').toLowerCase();
                  pick.innerHTML = INVENTORY.filter((i) =>
                    displayInvName(i.name).toLowerCase().includes(t)
                  )
                    .map(
                      (i) =>
                        `<button type="button" class="klc-pick" data-n="${esc(i.name)}" data-u="${esc(i.unit || 'gm')}">
                      <span class="klc-pick-t">${esc(displayInvName(i.name))}</span>
                      <span class="klc-pick-s">${esc(i.cat || '')} · ${Number(i.stock) || 0} ${esc(
                          global.RSRecipeUnits && RSRecipeUnits.displayUnit
                            ? RSRecipeUnits.displayUnit(i.unit)
                            : i.unit || ''
                        )}</span>
                    </button>`
                    )
                    .join('');
                  pick.querySelectorAll('[data-n]').forEach((el) => {
                    el.onclick = () => {
                      const n = el.getAttribute('data-n');
                      if (!items.find((x) => x.name === n)) {
                        items.push({
                          name: n,
                          qty: 1,
                          unit: el.getAttribute('data-u') || 'gm',
                        });
                      }
                      sc();
                      draw();
                    };
                  });
                }
                q.oninput = drawP;
                drawP();
              },
            });
          };
          modal.querySelector('[data-ok]').onclick = async () => {
            const clean = items.filter((x) => x.name && Number(x.qty) > 0);
            const next = {
              enabled: enabled && clean.length > 0,
              applyDelivery,
              items: clean,
            };
            await saveTakeawayPackCfg(next);
            close();
            toast(
              next.enabled
                ? 'Takeaway pack on · ' + clean.length + ' item(s) per Takeaway/Delivery bill'
                : 'Takeaway pack saved (disabled or empty)',
              'fa-bag-shopping'
            );
          };
        },
      });
    }

    const packBtn = $('#btn-inv-takeaway-pack');
    if (packBtn && !packBtn.dataset.wired) {
      packBtn.dataset.wired = '1';
      packBtn.onclick = () => openTakeawayPackModal();
    }
    if (global.RSInventoryUI) {global.RSInventoryUI._openAddStockModal = openAddStockModal;}
    document.dispatchEvent(new CustomEvent('rs:render-inventory'));
    try {
      if (global.RS && typeof RS.updateTabAttentionBlinking === 'function') {
        RS.updateTabAttentionBlinking();
      }
    } catch (e) {}
  }

  // Keep a stable openAdd entry that uses latest modal builder after first render
  function openAddStockModalPublic(opts) {
    if (global.RSInventoryUI && typeof global.RSInventoryUI._openAddStockModal === 'function') {
      return global.RSInventoryUI._openAddStockModal(opts);
    }
    const btn = document.getElementById('btn-add-ingredient');
    if (btn) {btn.click();}
  }

  global.RSInventoryUI = {
    renderInventory,
    lowStockItems,
    exportLowStockCsv,
    confirmAndDraftPos,
    printPurchaseOrder,
    reorderQty,
    paintInventoryBadge,
    openAddStockModal: openAddStockModalPublic,
    openSetCostModal,
    openMissingCostsWizard,
    unitCostOf,
    stockValueOf,
  };

  function attachToRS() {
    if (!global.RS) {return;}
    global.RS.renderInventory = renderInventory;
    global.RS.exportLowStockCsv = exportLowStockCsv;
    global.RS.autoDraftPurchaseOrders = confirmAndDraftPos;
    global.RS.openAddStockModal = openAddStockModalPublic;
  }
  if (global.RS) {attachToRS();}
  document.addEventListener('rs:ready', attachToRS);
  document.addEventListener('rs:hydrated', () => {
    try {
      if (global.RSSkel && RSSkel.markHydrated) {RSSkel.markHydrated();}
      renderInventory();
    } catch (_) {}
  });
})(typeof window !== 'undefined' ? window : globalThis);



/* === assets/modules/reports-ui.js === */
/* ============================================================
   RestroSuite — Reports UI (Wave 8 code-split)
   ============================================================ */
(function (global) {
  'use strict';

  function toast(msg, icon) {
    if (global.RS && typeof RS.toast === 'function') {RS.toast(msg, icon);}
  }
  function rs(n) {
    if (global.RS && typeof RS.rs === 'function') {return RS.rs(n);}
    return '₹' + (Number(n) || 0).toLocaleString('en-IN');
  }
  function esc(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }
  const _e = esc;
  function $$(sel, r) {
    return Array.from((r || document).querySelectorAll(sel));
  }

  async function renderReports(period) {
    const BILLS = (global.RS && Array.isArray(RS.BILLS) ? RS.BILLS : []) || [];
    const MENU = (global.RS && RS.MENU) || [];
    const tabEl = document.getElementById('reports-tab');

  period = period || 'Last 30 days';
  const days = period==='Today'?1:period==='This week'?7:period==='This month'?30:period==='Last 90 days'?90:30;
  const now = Date.now();
  const cutoff = now - days * 86400000;
  const todayStart = (function(){ const d=new Date(); d.setHours(0,0,0,0); return d.getTime(); })();

  // Instant report shape while first hydrate/summary resolves (not when truly empty after hydrate)
  try {
    if (
      tabEl &&
      global.RSSkel &&
      RSSkel.reportsDash &&
      RSSkel.shouldShow &&
      RSSkel.shouldShow(!!(BILLS && BILLS.length))
    ) {
      RSSkel.paint(tabEl, RSSkel.reportsDash({ stats: 4 }));
    }
  } catch (_) {}

  // Wave 2: prefer server aggregate (full history, not capped client list)
  let serverSummary = null;
  try {
    if (window.RS_API && typeof RS_API.data === 'function' && !RS_API.zeroCostLaunchMode && navigator.onLine !== false) {
      const res = await Promise.race([
        RS_API.data({ operation: 'sales_summary', days }),
        new Promise((_, rej) => { setTimeout(() => rej(new Error('timeout')), 6000); }),
      ]);
      const payload = res && res.ok != null ? res : (res && res.data) || res;
      if (payload && payload.ok) {serverSummary = payload;}
    }
  } catch (e) {
    try { if (window.RSActionFeedback) {window.RSActionFeedback.error();} } catch(_) {}
    console.warn('[Reports] sales_summary unavailable, using local bills', e && e.message);
  }

  const paidBills = BILLS.filter(b => {
    if (b.status !== 'paid') {return false;}
    const t = b.dateTime ? new Date(b.dateTime).getTime() : (b.time ? new Date(b.time).getTime() : 0);
    return t >= cutoff;
  });

  let totalRevenue = paidBills.reduce((sum,b)=>sum+(b.amount||b.total||0),0);
  let totalOrders = paidBills.length;
  let aov = totalOrders>0 ? Math.round(totalRevenue/totalOrders) : 0;
  if (serverSummary) {
    totalRevenue = Number(serverSummary.revenue) || 0;
    totalOrders = Number(serverSummary.orders) || 0;
    aov = Number(serverSummary.aov) || (totalOrders > 0 ? Math.round(totalRevenue / totalOrders) : 0);
  }

  // Tax: use stored fields when available, else estimate by tax category
  let gst5=0, gst12=0, gst18=0, gst28=0;
  paidBills.forEach(b => {
    if (b.taxSummary && typeof b.taxSummary === 'object') {
      Object.entries(b.taxSummary).forEach(([rate, obj]) => {
        const tax = (obj && obj.tax) ? obj.tax : 0;
        if (rate==='5') {gst5+=tax;}
        else if (rate==='12') {gst12+=tax;}
        else if (rate==='18') {gst18+=tax;}
        else if (rate==='28') {gst28+=tax;}
        else {gst5+=tax;}
      });
    } else {
      // Fallback estimate
      gst5 += Math.round((b.cgst||0) + (b.sgst||0));
      if (!b.cgst && !b.sgst) {gst5 += Math.round((b.amount||0)/1.05*0.05);}
    }
  });
  let totalGST = gst5+gst12+gst18+gst28;
  let netSales = totalRevenue - totalGST;
  if (serverSummary) {
    totalGST = Number(serverSummary.gst) || totalGST;
    netSales = serverSummary.net_sales != null ? Number(serverSummary.net_sales) : (totalRevenue - totalGST);
  }

  // Daily revenue (days slots, oldest->newest)
  const dailySlots = Array(days).fill(0);
  const dailyLabels = [];
  for (let i=days-1;i>=0;i--) {
    const d = new Date(now - i*86400000);
    dailyLabels.push(days<=7 ? ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'][d.getDay()] : (d.getDate()+'/'+((d.getMonth()+1))));
  }
  if (serverSummary && Array.isArray(serverSummary.daily) && serverSummary.daily.length) {
    serverSummary.daily.forEach(row => {
      const t = row.day ? new Date(row.day).getTime() : 0;
      const age = Math.floor((now - t) / 86400000);
      if (age >= 0 && age < days) {dailySlots[days - 1 - age] += Number(row.revenue || 0);}
    });
  } else {
    paidBills.forEach(b => {
      const t = b.dateTime ? new Date(b.dateTime).getTime() : 0;
      const age = Math.floor((now-t)/86400000);
      if (age>=0 && age<days) {dailySlots[days-1-age] += (b.amount||b.total||0);}
    });
  }
  const maxSlot = Math.max(...dailySlots,1);
  const hasDailyData = dailySlots.some(v=>v>0);

  // Payment mix
  const payMap = {};
  if (serverSummary && serverSummary.payment_mix && typeof serverSummary.payment_mix === 'object') {
    Object.entries(serverSummary.payment_mix).forEach(([m, val]) => {
      payMap[m] = Number(val) || 0;
    });
  } else {
    paidBills.forEach(b => {
      if (b.tenders && Array.isArray(b.tenders) && b.tenders.length) {
        b.tenders.forEach(t => { const m=t.method||'Cash'; payMap[m]=(payMap[m]||0)+Number(t.amount||0); });
      } else {
        const m=b.pay||b.paymentMethod||'Cash'; payMap[m]=(payMap[m]||0)+(b.amount||0);
      }
    });
  }
  const payTotal = Object.values(payMap).reduce((a,v)=>a+v,0)||1;
  const payColors = {Cash:'var(--green)',UPI:'var(--violet)',Card:'var(--orange)',Due:'var(--red)',Stripe:'var(--blue-soft)',Online:'var(--violet-soft)'};
  const payEntries = Object.entries(payMap).sort((a,b)=>b[1]-a[1]);
  const acc=0;
  const payMix = payEntries.map(([name,val])=>{
    const pct=Math.round(val/payTotal*100);
    return [name,pct,payColors[name]||'var(--amber)'];
  }).filter(p=>p[1]>0);
  let conicAcc=0;
  const seg = payMix.map(p=>{const s=`${p[2]} ${conicAcc}% ${conicAcc+p[1]}%`;conicAcc+=p[1];return s;}).join(',');

  // Category breakdown from _items
  const catSales = {};
  paidBills.forEach(b => {
    (b._items||[]).forEach(it => {
      if (!it||!it.name) {return;}
      // Older bills didn't store the category on each line item -- fall back
      // to looking the item up in the current menu by name so it isn't
      // lumped under "Uncategorized" in the category breakdown.
      let cat = it.category||it.cat;
      if (!cat) { const mm = MENU.find(x=>x.name===it.name); cat = (mm && mm.cat) || 'Uncategorized'; }
      catSales[cat] = (catSales[cat]||0) + (it.price||0)*(it.qty||1);
    });
    // fallback: parse old string-format items
    if (!b._items || !b._items.length) {
      const items = typeof b.items==='string' ? b.items.split(',') : [];
      items.forEach(str => {
        const m = MENU.find(x=>str.trim().startsWith(x.name));
        if (m) { const cat=m.cat||'Uncategorized'; catSales[cat]=(catSales[cat]||0)+(m.price||0); }
      });
    }
  });
  const catTotal = Object.values(catSales).reduce((a,v)=>a+v,0)||1;
  const sortedCats = Object.entries(catSales).sort((a,b)=>b[1]-a[1]).map(([name,val])=>[name,Math.round(val/catTotal*100)]);

  // Top items table
  const itemMap = {};
  paidBills.forEach(b => {
    (b._items||[]).forEach(it => {
      if (!it||!it.name) {return;}
      if (!itemMap[it.name]) {itemMap[it.name]={qty:0,rev:0};}
      itemMap[it.name].qty += (it.qty||1);
      itemMap[it.name].rev += (it.price||0)*(it.qty||1);
    });
  });
  const topItems = Object.entries(itemMap).sort((a,b)=>b[1].rev-a[1].rev).slice(0,6);

  const tab = document.getElementById('reports-tab');
  if (!tab) {return;}

  tab.innerHTML = `
    <div class="toolbar-row" style="margin-bottom:4px">
      <span class="eyebrow">${period}${serverSummary ? ' · <span style="color:var(--green);font-weight:700">server totals</span>' : ' · local bills'}</span>
      <div class="grow"></div>
      <div style="display:flex;gap:6px;flex-wrap:wrap">
        ${['Today','This week','This month','Last 30 days','Last 90 days'].map(p=>
          `<button class="btn btn-sm ${p===period?'btn-primary':'btn-ghost'}" onclick="window._renderReports('${p}')">${p}</button>`
        ).join('')}
      </div>
    </div>

    <div class="stat-row">
      <div class="stat-card"><div class="stat-ic bg-o"><i class="fa-solid fa-chart-line"></i></div><div><div class="sv">${rs(totalRevenue)}</div><div class="sl">Revenue</div><div class="sd">${_e(period)}</div></div></div>
      <div class="stat-card"><div class="stat-ic bg-v"><i class="fa-solid fa-receipt"></i></div><div><div class="sv">${totalOrders}</div><div class="sl">Orders</div><div class="sd">bills generated</div></div></div>
      <div class="stat-card"><div class="stat-ic bg-g"><i class="fa-solid fa-money-bill-trend-up"></i></div><div><div class="sv">${rs(aov)}</div><div class="sl">Avg order value</div></div></div>
      <div class="stat-card"><div class="stat-ic bg-a"><i class="fa-solid fa-percent"></i></div><div><div class="sv">${rs(totalGST)}</div><div class="sl">${_e((global.RS_SETTINGS && RS_SETTINGS.set_tax_label) || 'Tax')} collected</div></div></div>
    </div>
    ${
      !totalOrders
        ? (() => { try { if (window.RSActionFeedback) {window.RSActionFeedback.error();} } catch(_) {} return `<div class="sr-empty" style="margin:8px 0 16px;padding:28px;border:1px dashed var(--stroke);border-radius:var(--r-md)">
            <i class="fa-solid fa-chart-pie" style="font-size:22px;opacity:.4;display:block;margin-bottom:8px"></i>
            <div style="font-weight:700;margin-bottom:4px">No sales in this period</div>
            <div style="font-size:13px;color:var(--text-soft);max-width:360px;margin:0 auto">Ring a sale on POS or widen the date range to see revenue, tax, and top items.</div>
          </div>`; })()
        : (() => { try { if (window.RSActionFeedback) {window.RSActionFeedback.success();} } catch(_) {} return ''; })()
    }

    <div class="report-grid report-grid-charts">
      <div class="panel panel-pad report-panel-bars">
        <div class="panel-head"><h3>Daily revenue</h3><span class="ph-sub">${period} · hover for value</span></div>
        <div class="chart-bars${days > 14 ? ' dense' : ''}" id="chart-revenue">
          ${hasDailyData
            ? dailySlots.map((v, i) => {
                // 30/90-day: sparse labels so min-content width cannot force bars into Payment mix
                const labelStep = days > 60 ? 10 : days > 30 ? 7 : days > 14 ? 5 : 1;
                const showLabel = i === 0 || i === dailySlots.length - 1 || i % labelStep === 0;
                const h = Math.max(v > 0 ? 4 : 0, Math.round((v / maxSlot) * 100));
                // Short labels on dense charts (day number only) to avoid overflow
                let lab = dailyLabels[i] || '';
                if (days > 14 && showLabel && lab.indexOf('/') !== -1) {
                  lab = String(lab).split('/')[0]; // "27" not "27/6"
                }
                return `<div class="cbar" title="${_e(dailyLabels[i])}: ${rs(v)}">
                  <div class="bar-track">
                    <div class="bar" style="height:0" data-h="${h}"><span class="bv">${rs(v)}</span></div>
                  </div>
                  <span class="bl${showLabel ? '' : ' is-muted'}">${showLabel ? _e(lab) : ''}</span>
                </div>`;
              }).join('')
            : '<div style="height:100%;display:flex;align-items:center;justify-content:center;color:var(--text-mute);font-size:12px;width:100%">No sales data for this period</div>'
          }
        </div>
      </div>
      <div class="panel panel-pad report-panel-donut">
        <div class="panel-head"><h3>Payment mix</h3></div>
        <div class="donut-wrap">
          <div class="donut" id="donut-pay" style="${seg?`background:conic-gradient(${seg})`:'background:var(--glass-2)'}">
            <div class="donut-center"><div class="dc-v">${rs(totalRevenue)}</div><div class="dc-l">collected</div></div>
          </div>
          <div class="legend" id="legend-pay">
            ${payMix.length>0
              ? payMix.map(p=>`<div class="lg-item"><span class="lg-sw" style="background:${p[2]}"></span>${_e(p[0])}<span class="lg-val">${p[1]}%</span></div>`).join('')
              : '<div style="color:var(--text-mute);font-size:12px;margin-top:10px;text-align:center">No payments recorded</div>'
            }
          </div>
        </div>
      </div>
    </div>

    <div class="report-grid" style="margin-top:16px">
      <div class="panel panel-pad">
        <div class="panel-head"><h3>Top categories by revenue</h3></div>
        <div id="cat-bars">
          ${sortedCats.length>0
            ? sortedCats.map(c=>`<div style="margin-bottom:13px">
                <div style="display:flex;justify-content:space-between;font-size:12.5px;margin-bottom:6px"><span>${_e(c[0])}</span><b style="color:var(--text)">${c[1]}%</b></div>
                <div style="height:8px;background:var(--glass-2);border-radius:99px;overflow:hidden"><span style="display:block;height:100%;width:0;background:linear-gradient(90deg,var(--orange-soft),var(--orange-deep));transition:width 1s var(--ease)" data-w="${c[1]}"></span></div>
              </div>`).join('')
            : '<div style="color:var(--text-mute);font-size:12px;text-align:center;padding:20px">No category data yet</div>'
          }
        </div>
      </div>
      <div class="panel panel-pad">
        <div class="panel-head"><h3>Tax summary</h3></div>
        <table class="data-table"><tbody>
          <tr><td>GST @ 5% (food)</td><td class="td-strong" style="text-align:right">${rs(gst5)}</td></tr>
          ${gst12>0?`<tr><td>GST @ 12%</td><td class="td-strong" style="text-align:right">${rs(gst12)}</td></tr>`:''}
          ${gst18>0?`<tr><td>GST @ 18% (packaged)</td><td class="td-strong" style="text-align:right">${rs(gst18)}</td></tr>`:''}
          ${gst28>0?`<tr><td>GST @ 28% (luxury)</td><td class="td-strong" style="text-align:right">${rs(gst28)}</td></tr>`:''}
          <tr><td>Net taxable sales</td><td class="td-strong" style="text-align:right">${rs(netSales)}</td></tr>
          <tr><td><b style="color:var(--text)">Total tax payable</b></td><td style="text-align:right"><b style="color:var(--orange);font-size:15px">${rs(totalGST)}</b></td></tr>
        </tbody></table>
        <button class="btn btn-ghost btn-block" id="btn-download-gstr" style="margin-top:14px"><i class="fa-solid fa-file-arrow-down"></i> Download GSTR-ready CSV</button>
      </div>
    </div>

    ${topItems.length>0?`
    <div class="panel panel-pad" style="margin-top:16px">
      <div class="panel-head"><h3>Top items by revenue</h3><span class="pill">${period}</span></div>
      <table class="data-table"><thead><tr><th>#</th><th>Item</th><th>Qty sold</th><th style="text-align:right">Revenue</th></tr></thead><tbody>
        ${topItems.map(([name,d],i)=>`<tr><td style="color:var(--text-mute);width:24px">${i+1}</td><td><b>${_e(name)}</b></td><td>${d.qty}</td><td style="text-align:right;color:var(--green)">${rs(d.rev)}</td></tr>`).join('')}
      </tbody></table>
    </div>`:''}
  `;

  // Animate bars
  setTimeout(()=>$$('#chart-revenue .bar').forEach(b=>b.style.height=b.dataset.h+'%'),60);
  setTimeout(()=>$$('#cat-bars [data-w]').forEach(s=>s.style.width=s.dataset.w+'%'),80);

  // GSTR CSV download — richer columns for accountant handoff
  const gstrBtn = document.getElementById('btn-download-gstr');
  if (gstrBtn) {gstrBtn.onclick = () => {
    try { if (window.RSActionFeedback) {window.RSActionFeedback.click();} } catch(_) {}
    if (!paidBills.length) {
      try { if (window.RSActionFeedback) {window.RSActionFeedback.error();} } catch(_) {}
      toast('No paid bills in this period to export', 'fa-circle-exclamation');
      return;
    }
    const rows = [[
      'Bill No', 'DateTime', 'Customer', 'Phone', 'Place of Supply',
      'Taxable Value', 'GST 5%', 'GST 12%', 'GST 18%', 'GST 28%', 'Total Tax',
      'Invoice Value', 'Payment Method', 'Station', 'Channel', 'Status',
    ]];
    paidBills.forEach((b) => {
      const ts = b.taxSummary || {};
      const g5 = ts['5'] ? ts['5'].tax || 0 : 0;
      const g12 = ts['12'] ? ts['12'].tax || 0 : 0;
      const g18 = ts['18'] ? ts['18'].tax || 0 : 0;
      const g28 = ts['28'] ? ts['28'].tax || 0 : 0;
      const taxSum = Number(g5) + Number(g12) + Number(g18) + Number(g28) || Number(b.gst) || 0;
      const inv = Number(b.amount != null ? b.amount : b.total) || 0;
      const taxable = b.subtotal != null ? Number(b.subtotal) : Math.max(0, inv - taxSum);
      rows.push([
        b.no || b.orderId || b.id || '',
        b.dateTime || b.time || '',
        b.customerName || 'Walk-in Guest',
        b.customerPhone || '',
        (window.RS_SETTINGS && RS_SETTINGS.set_gst_state) || '',
        taxable,
        g5,
        g12,
        g18,
        g28,
        taxSum,
        inv,
        b.pay || b.paymentMethod || '',
        b.stationLabel || b.stationId || '',
        b.channel || b.channelCode || '',
        b.status || 'paid',
      ]);
    });
    // Totals footer
    const sumCol = (idx) => rows.slice(1).reduce((a, r) => a + (Number(r[idx]) || 0), 0);
    rows.push([
      'TOTALS', '', '', '', '',
      sumCol(5), sumCol(6), sumCol(7), sumCol(8), sumCol(9), sumCol(10), sumCol(11),
      '', '', '', '',
    ]);
    const csv = rows.map((r) => r.map((v) => '"' + String(v).replace(/"/g, '""') + '"').join(',')).join('\n');
    const a = document.createElement('a');
    a.href = 'data:text/csv;charset=utf-8,\uFEFF' + encodeURIComponent(csv);
    a.download = 'GSTR_report_' + new Date().toISOString().slice(0, 10) + '.csv';
    a.click();
    try { if (window.RSActionFeedback) {window.RSActionFeedback.success();} } catch(_) {}
    toast('GSTR CSV downloaded (' + paidBills.length + ' bills)', 'fa-file-arrow-down');
  };}
  }

  global.RSReportsUI = { renderReports };
  global._renderReports = (p) => { try { if (window.RSActionFeedback) {window.RSActionFeedback.click();} } catch(_) {} renderReports(p); };

  function attach() {
    if (!global.RS) {return;}
    global.RS.renderReports = renderReports;
  }
  if (global.RS) {attach();}
  document.addEventListener('rs:ready', attach);
  document.addEventListener('rs:hydrated', () => {
    try {
      if (global.RSSkel && RSSkel.markHydrated) {RSSkel.markHydrated();}
      renderReports();
    } catch (_) {}
  });
})(typeof window !== 'undefined' ? window : globalThis);



/* === assets/modules/gateway-monitor.js === */
/* ============================================================
   RestroSuite — Gateway monitor & app incidents (Wave 8)
   ============================================================ */
(function (global) {
  'use strict';

  let saasGatewayPollingInterval = null;

  function toast(msg, icon) {
    if (global.RS && typeof RS.toast === 'function') {RS.toast(msg, icon);}
  }

  function escHtml(str) {
    if (!str) {return '';}
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }

  function formatIncidentTime(value) {
    if (!value) {return 'Unknown time';}
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) {return 'Unknown time';}
    return date.toLocaleString('en-IN', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  }

  function formatDateTimeIN(value) {
    if (!value) {return '—';}
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) {return '—';}
    return date.toLocaleString('en-IN', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  }

  function stripUuid(text) {
    return String(text || '').replace(
      /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi,
      'workspace'
    );
  }

  function humanizeGatewayEvent(event, details) {
    const ev = String(event || '').toUpperCase();
    const raw = stripUuid(details?.message || details?.error || details?.reason || '');
    const titles = {
      CONNECTED: 'WhatsApp connected',
      DISCONNECTED: 'Connection closed',
      SESSION_SAVED: 'Session backup saved',
      ALERT_SENT: 'Alert sent',
      APPROVAL_WHATSAPP_SENT: 'Approval sent via WhatsApp',
      APPROVAL_EMAIL_SKIPPED: 'Approval email skipped',
      APPROVAL_RECEIVED: 'Approval received',
      GATEWAY_SEND: 'Message sent',
      MESSAGE_SENT: 'Message sent',
      QR: 'Waiting for QR scan',
      READY: 'Gateway ready',
    };
    let title = titles[ev] || ev.replace(/_/g, ' ').toLowerCase().replace(/^\w/, (c) => c.toUpperCase());
    let detail = raw;
    // Soften noisy stream errors
    if (/stream errored/i.test(detail)) {
      title = 'Connection interrupted';
      detail = 'WhatsApp stream dropped — reconnecting automatically when possible.';
    } else if (/session backup/i.test(detail) || /session saved/i.test(detail)) {
      const kb = detail.match(/([\d.]+)\s*KB/i);
      detail = kb ? `Backup size ${kb[1]} KB` : 'Session snapshot stored';
    } else if (detail.length > 90) {
      detail = detail.slice(0, 87) + '…';
    }
    const technical = `[${ev}] ${raw || 'System event'}`;
    return { title, detail, technical };
  }

  function friendlyErrorMessage(msg) {
    const m = String(msg || '').trim();
    if (!m || /^unknown/i.test(m)) {return 'Application error (no message captured)';}
    if (m.length > 140) {return m.slice(0, 137) + '…';}
    return m;
  }

  function shortPath(urlPath) {
    if (!urlPath) {return '';}
    const s = String(urlPath);
    if (s.includes('#')) {return '#' + s.split('#').pop();}
    try {
      const u = new URL(s, typeof location !== 'undefined' ? location.origin : 'https://local');
      return (u.pathname + u.hash) || s;
    } catch (_) {
      return s.length > 48 ? s.slice(0, 45) + '…' : s;
    }
  }

  function friendlyTenantLabel(slug) {
    if (!slug) {return 'Unknown workspace';}
    return String(slug)
      .replace(/[-_]+/g, ' ')
      .replace(/\b\w/g, (c) => c.toUpperCase());
  }

  function updateGatewayKpis(logs, statusData) {
    const sentEl = document.getElementById('gw-sent-count');
    const rateEl = document.getElementById('gw-delivery-rate');
    const latEl = document.getElementById('gw-latency');
    const qEl = document.getElementById('gw-queued');
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const list = Array.isArray(logs) ? logs : [];
    const sendLike = list.filter((log) => {
      const ev = String(log.event || '').toUpperCase();
      const t = log.created_at ? new Date(log.created_at) : null;
      if (!t || Number.isNaN(t.getTime()) || t < today) {return false;}
      return /SEND|SENT|ALERT|APPROVAL_WHATSAPP|DISPATCH|MESSAGE/.test(ev);
    });
    const ok = sendLike.filter((l) => String(l.status || '').toLowerCase() === 'ok' || !l.status).length;
    const fail = sendLike.filter((l) => /err|fail|warn/i.test(String(l.status || ''))).length;
    if (sentEl) {sentEl.textContent = String(sendLike.length);}
    if (rateEl) {
      if (sendLike.length === 0) {rateEl.textContent = 'n/a';}
      else {
        const pct = Math.round((ok / Math.max(1, ok + fail)) * 100);
        rateEl.textContent = pct + '%';
      }
    }
    if (latEl) {
      const lat = statusData && (statusData.avgLatencyMs != null ? statusData.avgLatencyMs : statusData.latency_ms);
      latEl.textContent = lat != null && Number(lat) >= 0 ? Math.round(Number(lat)) + ' ms' : 'n/a';
    }
    if (qEl) {
      const q = statusData && (statusData.queued != null ? statusData.queued : statusData.queue_length);
      qEl.textContent = q != null ? String(q) : '0';
    }
  }

  function renderIncidentEmpty(title, detail, icon) {
    icon = icon || 'fa-circle-check';
    return (
      '<div class="app-incidents-empty">' +
      '<i class="fa-solid ' +
      icon +
      '"></i>' +
      '<strong>' +
      escHtml(title) +
      '</strong>' +
      '<span>' +
      escHtml(detail) +
      '</span>' +
      '</div>'
    );
  }

async function pollSuperAdminGateway() {
  const RS_API = global.RS_API;
  if (!RS_API) {return;}
  // Zero-cost launch still uses FREE platform Baileys (your PC + ngrok). No paid API.
  const isZeroCost = !!RS_API.zeroCostLaunchMode;

  const statusBadge = document.getElementById('saas-gateway-status');
  const phoneEl = document.getElementById('saas-gateway-phone');
  const sessionEl = document.getElementById('saas-gateway-session-saved');
  const qrContainer = document.getElementById('saas-gateway-qr-container');
  const qrSpinner = document.getElementById('saas-gateway-qr-spinner');
  const qrImg = document.getElementById('saas-gateway-qr-img');
  const connectedView = document.getElementById('saas-gateway-connected-view');
  const logsContainer = document.getElementById('saas-notification-logs-container');

  // 1. Fetch Gateway Status (platform line — free automation for all clients)
  try {
    const data = await RS_API.admin({ action: 'gateway_status' });
    if (data && !data.error) {
      const statusLabelEl = document.getElementById('saas-gateway-status-label');
      if (statusBadge) {
        const st = String(data.status || 'unknown').toLowerCase();
        const pretty = st === 'ready' ? 'Ready' : st === 'qr' ? 'Scan QR' : st === 'connecting' ? 'Connecting' : (st.charAt(0).toUpperCase() + st.slice(1));
        statusBadge.textContent = pretty;
        if (statusLabelEl) {
          statusLabelEl.textContent = st === 'ready' ? 'Online' : pretty;
        }
        if (data.status === 'ready') {
          statusBadge.className = 'pill pill-green';
          statusBadge.style.background = '';
          statusBadge.style.color = '';
          if (qrContainer) {qrContainer.style.display = 'none';}
          if (connectedView) {connectedView.style.display = 'flex';}
        } else if (data.status === 'qr') {
          statusBadge.className = 'pill pill-amber';
          statusBadge.style.background = '';
          statusBadge.style.color = '';
          if (connectedView) {connectedView.style.display = 'none';}
          if (qrContainer) {qrContainer.style.display = 'flex';}
          if (data.qr) {
            if (qrSpinner) {qrSpinner.style.display = 'none';}
            if (qrImg) {
              qrImg.src = data.qr;
              qrImg.style.display = 'block';
            }
          } else {
            if (qrSpinner) {
              qrSpinner.style.display = 'block';
              qrSpinner.innerHTML = '<i class="fa-solid fa-spinner fa-spin" style="margin-bottom:6px;font-size:16px;color:#FF4F00"></i><br>Preparing QR…';
            }
            if (qrImg) {qrImg.style.display = 'none';}
          }
        } else if (st === 'connecting' || st === 'starting' || st === 'syncing' || st === 'authenticated') {
          statusBadge.className = 'pill pill-amber';
          statusBadge.style.background = '';
          statusBadge.style.color = '';
          if (connectedView) {connectedView.style.display = 'none';}
          if (qrContainer) {qrContainer.style.display = 'flex';}
          if (qrSpinner) {
            qrSpinner.style.display = 'block';
            qrSpinner.innerHTML = `<i class="fa-solid fa-spinner fa-spin" style="margin-bottom: 6px; font-size: 16px; color: #FF4F00;"></i><br>${escHtml(pretty)}…`;
          }
          if (qrImg) {qrImg.style.display = 'none';}
        } else {
          // disconnected / offline / closed / unknown — not "connecting"
          statusBadge.className = 'pill pill-red';
          statusBadge.style.background = '';
          statusBadge.style.color = '';
          if (connectedView) {connectedView.style.display = 'none';}
          if (qrContainer) {qrContainer.style.display = 'flex';}
          if (qrSpinner) {
            qrSpinner.style.display = 'block';
            qrSpinner.innerHTML =
              '<i class="fa-solid fa-link-slash" style="margin-bottom:8px;font-size:18px;color:#ef4444;display:block"></i>' +
              '<strong style="color:var(--text);font-size:13px">WhatsApp not linked</strong>' +
              '<span style="display:block;margin-top:8px;font-size:11.5px;color:var(--text-soft);line-height:1.45;max-width:260px">' +
              'Click <b>Reset Gateway Connection</b> above, then scan the QR from WhatsApp → Linked devices.' +
              '</span>';
          }
          if (qrImg) {qrImg.style.display = 'none';}
        }
      }
      if (phoneEl) {phoneEl.textContent = data.number ? `+${data.number}` : 'Not Linked';}
      if (sessionEl) {
        if (data.sessionSavedAt) {
          sessionEl.textContent = formatDateTimeIN(data.sessionSavedAt);
        } else {
          sessionEl.textContent = 'Never';
        }
      }
      // stash for KPI use after logs load
      global.__rsGwLastStatus = data;
    } else {
      throw new Error(data?.error || 'Failed to fetch status');
    }
  } catch(err) {
    if (statusBadge) {
      statusBadge.textContent = 'Offline';
      statusBadge.className = 'pill pill-red';
    }
    const statusLabelEl = document.getElementById('saas-gateway-status-label');
    if (statusLabelEl) {statusLabelEl.textContent = 'Offline';}
    if (phoneEl) {phoneEl.textContent = 'Unknown';}
    if (sessionEl) {sessionEl.textContent = 'Unknown';}
    if (connectedView) {connectedView.style.display = 'none';}
    if (qrContainer) {qrContainer.style.display = 'flex';}
    if (qrSpinner) {
      qrSpinner.innerHTML = '<i class="fa-solid fa-triangle-exclamation" style="margin-bottom: 6px; font-size: 16px; color: #EF4444;"></i><br>Gateway Server Offline<br><span style="font-size: 10px; color: #9CA3AF; margin-top: 4px; display: block;">Check cloud space status</span>';
      qrSpinner.style.display = 'block';
    }
    if (qrImg) {qrImg.style.display = 'none';}
  }

  // 2. Fetch Gateway Debug-Logs (human-readable primary, technical in title)
  try {
    const data = await RS_API.admin({ action: 'gateway_logs' });
    if (data && !data.error) {
      const logs = (data.logs || []).slice(0, 20);
      updateGatewayKpis(logs, global.__rsGwLastStatus || null);
      if (logsContainer) {
        if (logs.length === 0) {
          logsContainer.innerHTML = '<div style="text-align: center; padding: 32px; color: #9CA3AF;">No recent gateway activity.</div>';
        } else {
          logsContainer.innerHTML = logs.map(log => {
            const logDate = log.created_at ? new Date(log.created_at) : new Date();
            const timeStr = Number.isNaN(logDate.getTime())
              ? '--:--:--'
              : logDate.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false });
            const st = String(log.status || '').toLowerCase();
            const hum = humanizeGatewayEvent(log.event, log.details || {});
            const cls = st === 'ok' || st === 'success' || !st
              ? 'ti'
              : (st === 'warning' || st === 'warn' ? 'tw' : 'te');
            // Soften disconnect noise to warning tone when humanized
            const tone = /interrupt|closed|disconnect/i.test(hum.title) ? 'tw' : cls;
            const detailHtml = hum.detail
              ? ` <span style="opacity:.75">${escHtml(hum.detail)}</span>`
              : '';
            return `<div class="tl" title="${escHtml(hum.technical)}"><span class="tt">${escHtml(timeStr)}</span><span class="${tone}"><strong>${escHtml(hum.title)}</strong>${detailHtml}</span></div>`;
          }).join('');
          logsContainer.scrollTop = 0;
        }
      }
    } else {
      throw new Error(data?.error || 'Failed to fetch logs');
    }
  } catch(err) {
    if (logsContainer) {
      const msg = escHtml(err.message || 'Gateway request failed');
      logsContainer.innerHTML = `<div style="text-align: center; padding: 32px; color: var(--red);"><i class="fa-solid fa-circle-exclamation" style="display:block;margin-bottom:8px"></i>Could not load gateway logs: ${msg}</div>`;
    }
    updateGatewayKpis([], global.__rsGwLastStatus || null);
  }
}

function startSaaSGatewayPolling() {
  if (saasGatewayPollingInterval) {clearInterval(saasGatewayPollingInterval);}
  pollSuperAdminGateway();
  saasGatewayPollingInterval = setInterval(pollSuperAdminGateway, 5000);
}

function stopSaaSGatewayPolling() {
  if (saasGatewayPollingInterval) {
    clearInterval(saasGatewayPollingInterval);
    saasGatewayPollingInterval = null;
  }
}

function parseReportId(value) {
  const n = Number(value);
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : 0;
}

function notifyIncident(msg, icon) {
  try {
    toast(msg, icon);
  } catch (_) {}
  // Always log so failures are visible in DevTools if toast is missing
  if (icon && String(icon).includes('exclamation')) {console.warn('[Incidents]', msg);}
  else {console.info('[Incidents]', msg);}
}

async function resolveIncidentById(reportId, button) {
  const id = parseReportId(reportId);
  if (!id) {
    try { if (window.RSActionFeedback) {window.RSActionFeedback.error();} } catch(_) {}
    notifyIncident('Missing incident id — refresh the page and try again.', 'fa-circle-exclamation');
    return false;
  }
  const api = global.RS_API;
  if (!api || typeof api.admin !== 'function') {
    try { if (window.RSActionFeedback) {window.RSActionFeedback.error();} } catch(_) {}
    notifyIncident('Admin API not ready. Re-login as super-admin.', 'fa-circle-exclamation');
    return false;
  }
  const label = button ? button.textContent : '';
  if (button) {
    button.disabled = true;
    button.textContent = '…';
  }
  try {
    const out = await api.admin({ action: 'resolve_error_report', report_id: id });
    if (out && out.error) {throw new Error(out.error);}
    try { if (window.RSActionFeedback) {window.RSActionFeedback.success();} } catch(_) {}
    notifyIncident('Incident marked resolved.');
    return true;
  } catch (error) {
    const msg = (error && error.message) || 'Could not resolve incident.';
    try { if (window.RSActionFeedback) {window.RSActionFeedback.error();} } catch(_) {}
    notifyIncident(msg, 'fa-circle-exclamation');
    // Surface hard failures so a missing toast still informs the user
    if (/session expired|not ready|Valid report|Failed to resolve|401|403/i.test(msg)) {
      try { if (window.RSActionFeedback) {window.RSActionFeedback.error();} } catch(_) {}
      try { toast('Resolve failed: ' + msg, 'fa-circle-exclamation'); } catch (_) {}
    }
    if (button) {
      button.disabled = false;
      button.textContent = label || 'Resolve';
    }
    return false;
  }
}

function bindIncidentResolveButtons(list) {
  if (!list) {return;}
  list.querySelectorAll('.app-incident-resolve-btn').forEach((btn) => {
    if (btn.dataset.bound === '1') {return;}
    btn.dataset.bound = '1';
    btn.addEventListener('click', async (e) => {
      e.preventDefault();
      e.stopPropagation();
      try { if (window.RSActionFeedback) {window.RSActionFeedback.click();} } catch(_) {}
      const id = btn.getAttribute('data-report-id');
      const ok = await resolveIncidentById(id, btn);
      if (ok) {await loadAppIncidents();}
    });
  });
}

async function resolveAllOpenIncidents() {
  const api = global.RS_API;
  try { if (window.RSActionFeedback) {window.RSActionFeedback.click();} } catch(_) {}
  if (!api || typeof api.admin !== 'function') {
    notifyIncident('Admin API not ready. Re-login as super-admin.', 'fa-circle-exclamation');
    return;
  }
  const btn = document.getElementById('btn-resolve-all-incidents');
  try {
    if (btn) { btn.disabled = true; btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i>'; }
    const result = await api.admin({ action: 'list_error_reports', status: 'open', limit: 100 });
    const reports = Array.isArray(result.reports) ? result.reports : [];
    if (!reports.length) {
      try { if (window.RSActionFeedback) {window.RSActionFeedback.error();} } catch(_) {}
      notifyIncident('No open incidents to clear.');
      await loadAppIncidents();
      return;
    }
    if (!confirm('Mark all ' + reports.length + ' open incident(s) as resolved?\n\nThis only clears your inbox — it does not change tenant data.')) {
      return;
    }
    let ok = 0;
    let fail = 0;
    for (const r of reports) {
      const id = parseReportId(r.id);
      if (!id) { fail++; continue; }
      try {
        const out = await api.admin({ action: 'resolve_error_report', report_id: id });
        if (out && out.error) {throw new Error(out.error);}
        ok++;
      } catch (_) { fail++; }
    }
    try { if (window.RSActionFeedback) {window.RSActionFeedback.success();} } catch(_) {}
    notifyIncident(fail ? ('Resolved ' + ok + ', failed ' + fail + '.') : ('Resolved ' + ok + ' incident(s).'));
    await loadAppIncidents();
  } catch (error) {
    notifyIncident((error && error.message) || 'Could not clear incidents.', 'fa-circle-exclamation');
  } finally {
    if (btn) {
      btn.disabled = false;
      btn.innerHTML = '<i class="fa-solid fa-check-double"></i> Resolve all';
    }
  }
}

async function loadAppIncidents() {
  const list = document.getElementById('app-incidents-list');
  const filter = document.getElementById('app-incidents-status-filter');
  if (!list) {return;}
  const RS_API = global.RS_API;
  list.innerHTML = renderIncidentEmpty('Loading incidents', 'Checking the latest platform error reports.', 'fa-spinner fa-spin');
  try {
    if (!RS_API || typeof RS_API.admin !== 'function') {
      list.innerHTML = renderIncidentEmpty('Incidents unavailable', 'Admin API not ready.', 'fa-triangle-exclamation');
      return;
    }
    const status = filter ? filter.value : 'open';
    const result = await RS_API.admin({ action: 'list_error_reports', status: status === 'all' ? null : status });
    if (result && result.error) {throw new Error(result.error);}
    const reports = Array.isArray(result.reports) ? result.reports : [];
    if (!reports.length) {
      list.innerHTML = renderIncidentEmpty('No incidents found', 'This status queue is currently clear.');
      return;
    }
    list.innerHTML = reports.map((report) => {
      const severity = String(report.severity || 'error').toLowerCase();
      const statusLabel = String(report.status || 'open').toLowerCase();
      // DB columns are message/stack (app_error_reports); accept legacy aliases too
      const rawMsg = report.message || report.error_message || '';
      const rawStack = report.stack || report.stack_trace || '';
      const msg = friendlyErrorMessage(rawMsg);
      const tenant = friendlyTenantLabel(report.tenant_slug);
      const path = shortPath(report.url_path || report.page_url || '');
      const source = report.source || 'dashboard';
      const metaLine = [tenant, source, path].filter(Boolean).join(' · ');
      const stack = rawStack
        ? `<details style="margin-top:6px"><summary style="cursor:pointer;font-size:11px;color:var(--text-mute)">Technical details</summary><code style="display:block;margin-top:6px;font-size:10px;white-space:pre-wrap;max-height:120px;overflow:auto">${escHtml(String(rawStack).slice(0, 1200))}</code></details>`
        : '';
      const rid = parseReportId(report.id);
      const resolveButton = statusLabel === 'open' && rid
        ? `<button type="button" class="app-incident-resolve-btn" data-report-id="${rid}" title="Mark as reviewed (does not fix the original crash)">Resolve</button>`
        : (statusLabel === 'open'
          ? '<span style="font-size:11px;color:var(--red)">No id</span>'
          : '');
      return `
        <article class="app-incident-card" data-report-id="${rid || ''}" title="Client-side error report stored in app_error_reports">
          <div style="flex: 1; min-width: 0;">
            <strong>${escHtml(msg)}</strong>
            <span>${escHtml(metaLine)}</span>
            ${stack}
            <div class="app-incident-meta">
              <span class="app-incident-pill ${escHtml(severity)}">${escHtml(severity)}</span>
              <span class="app-incident-pill">${escHtml(statusLabel)}</span>
              <span class="app-incident-pill">${escHtml(report.app_version || 'v?')}</span>
            </div>
          </div>
          <div class="app-incident-actions">
            <time>${escHtml(formatIncidentTime(report.created_at))}</time>
            ${resolveButton}
          </div>
        </article>
      `;
    }).join('');
    bindIncidentResolveButtons(list);
  } catch (error) {
    list.innerHTML = renderIncidentEmpty('Incidents unavailable', error.message || 'Try refreshing this panel.', 'fa-triangle-exclamation');
  }
}

function renderGateway() {
  // Basic init of gateway monitor handlers
  const RS_API = global.RS_API;
  const resetBtn = document.getElementById('btn-saas-gateway-reset');
  if (resetBtn && !resetBtn.dataset.listenerBound) {
    resetBtn.dataset.listenerBound = 'true';
    resetBtn.addEventListener('click', async () => {
      if (confirm('Are you absolutely sure you want to RESET the WhatsApp Gateway?\n\nThis will completely purge the WhatsApp session files from the gateway storage. You will need to scan a new QR code to re-link your device!')) {
        try {
          resetBtn.disabled = true;
          resetBtn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Resetting...';

          if (!RS_API) {
            try { if (window.RSActionFeedback) {window.RSActionFeedback.error();} } catch(_) {}
            toast('API not ready. Refresh and try again.', 'fa-circle-exclamation');
            return;
          }

          const data = await RS_API.admin({ action: 'gateway_reset' });

          if (data && !data.error) {
            try { if (window.RSActionFeedback) {window.RSActionFeedback.success();} } catch(_) {}
            toast('WhatsApp Gateway reset successfully. Scan QR code to re-authenticate.', 'fa-circle-check');
            await pollSuperAdminGateway();
          } else {
            try { if (window.RSActionFeedback) {window.RSActionFeedback.error();} } catch(_) {}
            toast('Failed to reset gateway: ' + (data?.error || data?.message || 'Unknown error'), 'fa-circle-exclamation');
          }
        } catch (err) {
          console.error(err);
          try { if (window.RSActionFeedback) {window.RSActionFeedback.error();} } catch(_) {}
          toast('Error communicating with gateway: ' + (err.message || err), 'fa-circle-exclamation');
        } finally {
          resetBtn.disabled = false;
          resetBtn.innerHTML = '<i class="fa-solid fa-power-off"></i> Reset Gateway Connection';
        }
      }
    });
  }

  const refreshLogsBtn = document.getElementById('btn-refresh-saas-logs');
  if (refreshLogsBtn && !refreshLogsBtn.dataset.listenerBound) {
    refreshLogsBtn.dataset.listenerBound = 'true';
    refreshLogsBtn.addEventListener('click', async () => {
      try { if (window.RSActionFeedback) {window.RSActionFeedback.click();} } catch(_) {}
      const icon = refreshLogsBtn.querySelector('i');
      if (icon) {icon.classList.add('fa-spin');}
      await pollSuperAdminGateway();
      if (icon) {
        setTimeout(() => {
          icon.classList.remove('fa-spin');
        }, 600);
      }
    });
  }

  const refreshIncidentsBtn = document.getElementById('btn-refresh-app-incidents');
  if (refreshIncidentsBtn && !refreshIncidentsBtn.dataset.listenerBound) {
    refreshIncidentsBtn.dataset.listenerBound = 'true';
    refreshIncidentsBtn.addEventListener('click', () => { try { if (window.RSActionFeedback) {window.RSActionFeedback.click();} } catch(_) {} loadAppIncidents(); });
  }

  const resolveAllBtn = document.getElementById('btn-resolve-all-incidents');
  if (resolveAllBtn && !resolveAllBtn.dataset.listenerBound) {
    resolveAllBtn.dataset.listenerBound = 'true';
    resolveAllBtn.addEventListener('click', () => { try { if (window.RSActionFeedback) {window.RSActionFeedback.click();} } catch(_) {} resolveAllOpenIncidents(); });
  }

  const incidentFilter = document.getElementById('app-incidents-status-filter');
  if (incidentFilter && !incidentFilter.dataset.listenerBound) {
    incidentFilter.dataset.listenerBound = 'true';
    incidentFilter.addEventListener('change', loadAppIncidents);
  }

  // Delegation fallback + direct binds after each render
  const incidentsList = document.getElementById('app-incidents-list');
  if (incidentsList && !incidentsList.dataset.listenerBound) {
    incidentsList.dataset.listenerBound = 'true';
    incidentsList.addEventListener('click', async (event) => {
      const target = event.target;
      const button = target && typeof target.closest === 'function' ? target.closest('.app-incident-resolve-btn') : null;
      if (!button || button.dataset.bound === '1') {return;} // direct bind already handles
      event.preventDefault();
      const ok = await resolveIncidentById(button.getAttribute('data-report-id'), button);
      if (ok) {await loadAppIncidents();}
    });
  }

  startSaaSGatewayPolling();
  loadAppIncidents();
}

  global.RSGatewayMonitor = {
    renderGateway,
    pollSuperAdminGateway,
    startSaaSGatewayPolling,
    stopSaaSGatewayPolling,
    loadAppIncidents,
    resolveAllOpenIncidents,
    resolveIncidentById,
  };
  global.startSaaSGatewayPolling = startSaaSGatewayPolling;
  global.stopSaaSGatewayPolling = stopSaaSGatewayPolling;
  global.RSResolveIncident = resolveIncidentById;
  global.RSResolveAllIncidents = resolveAllOpenIncidents;
})(typeof window !== 'undefined' ? window : globalThis);



/* === assets/modules/kds-ui.js === */
/* ============================================================
   RestroSuite — KDS board UI (Wave 9 code-split)
   ============================================================ */
(function (global) {
  'use strict';

  function toast(msg, icon) {
    if (global.RS && typeof RS.toast === 'function') {RS.toast(msg, icon);}
  }
  function esc(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }
  const _e = esc;
  function $(sel, r) {
    return (r || document).querySelector(sel);
  }
  function $$(sel, r) {
    return Array.from((r || document).querySelectorAll(sel));
  }
  function getKDS() {
    return (global.RS && Array.isArray(RS.KDS) ? RS.KDS : []) || [];
  }
  function syncPendingOrders(opts) {
    if (global.RS_SYNC && typeof RS_SYNC.syncPendingOrders === 'function') {
      return RS_SYNC.syncPendingOrders(opts);
    }
  }
  function activateTab(id) {
    if (global.RS && typeof RS.activateTab === 'function') {return RS.activateTab(id);}
  }

  let activeStation = 'all';

  const STATION_KEYWORDS = {
    tandoor: ['tandoor', 'naan', 'roti', 'kulcha', 'tandoori', 'tikka', 'kebab', 'seekh', 'bread'],
    curry: ['curry', 'gravy', 'dal', 'paneer', 'masala', 'korma', 'butter', 'biryani', 'rice', 'pulao'],
    beverages: ['beverage', 'drink', 'lassi', 'juice', 'soda', 'water', 'tea', 'coffee', 'shake', 'mocktail', 'chai', 'cold'],
  };

  function itemMatchesStation(it, station) {
    if (!station || station === 'all') {return true;}
    const keys = STATION_KEYWORDS[station] || [];
    const name = String((Array.isArray(it) ? it[1] : it && it.name) || '').toLowerCase();
    const note = String((Array.isArray(it) ? it[2] : it && (it.notes || it.note)) || '').toLowerCase();
    const cat = String((!Array.isArray(it) && it && (it.cat || it.category || it.station)) || '').toLowerCase();
    const hay = name + ' ' + note + ' ' + cat;
    if (cat && cat.includes(station)) {return true;}
    return keys.some((k) => hay.includes(k));
  }

  function orderMatchesStation(o, station) {
    if (!station || station === 'all') {return true;}
    const items = o.items || [];
    if (!items.length) {return true;}
    return items.some((it) => itemMatchesStation(it, station));
  }

  function wireStationSeg() {
    const tab = document.getElementById('kds-tab');
    if (!tab) {return;}
    const seg = tab.querySelector('.toolbar-row .seg');
    if (!seg || seg.dataset.kdsStationBound === '1') {return;}
    seg.dataset.kdsStationBound = '1';
    const buttons = Array.from(seg.querySelectorAll('button'));
    const map = ['all', 'tandoor', 'curry', 'beverages'];
    buttons.forEach((btn, i) => {
      btn.dataset.station = map[i] || 'all';
      btn.addEventListener('click', () => {
        buttons.forEach((b) => b.classList.toggle('active', b === btn));
        activeStation = btn.dataset.station || 'all';
        try { if (window.RSActionFeedback) {window.RSActionFeedback.click();} } catch(_) {}
        try {
          renderKDS();
        } catch (e) {}
      });
    });
  }

  function emptyKdsHtml(reason) {
    if (reason === 'search') {
      return `<div class="sr-empty kds-empty" style="grid-column:1/-1;padding:40px 24px">
        <i class="fa-solid fa-magnifying-glass" style="font-size:24px;opacity:.4;display:block;margin-bottom:8px"></i>
        <div style="font-weight:700;color:var(--text);margin-bottom:4px">No tickets match</div>
        <div style="color:var(--text-soft);font-size:13px">Try another search or switch to All stations.</div>
      </div>`;
    }
    if (reason === 'station') {
      return `<div class="sr-empty kds-empty" style="grid-column:1/-1;padding:40px 24px">
        <i class="fa-solid fa-filter" style="font-size:24px;opacity:.4;display:block;margin-bottom:8px"></i>
        <div style="font-weight:700;color:var(--text);margin-bottom:4px">Nothing for this station</div>
        <div style="color:var(--text-soft);font-size:13px">Other stations may still have tickets — switch to All stations.</div>
      </div>`;
    }
    return `<div class="sr-empty kds-empty" style="grid-column:1/-1;padding:48px 24px">
      <i class="fa-solid fa-fire-burner" style="font-size:28px;opacity:.4;display:block;margin-bottom:10px"></i>
      <div style="font-weight:700;font-size:15px;color:var(--text);margin-bottom:6px">Kitchen is clear</div>
      <div style="max-width:360px;margin:0 auto 14px;line-height:1.45;color:var(--text-soft)">
        Tickets appear when staff send a <b>KOT</b> from POS, or when a QR order is accepted.
      </div>
      <div style="display:flex;gap:8px;justify-content:center;flex-wrap:wrap">
        <button type="button" class="btn btn-primary btn-sm" data-kds-goto-pos><i class="fa-solid fa-cash-register"></i> Open POS</button>
        <button type="button" class="btn btn-ghost btn-sm" data-kds-refresh><i class="fa-solid fa-rotate"></i> Refresh</button>
      </div>
    </div>`;
  }

  function bindEmptyActions(grid) {
    const pos = grid.querySelector('[data-kds-goto-pos]');
    if (pos)
      {pos.onclick = () => {
        activateTab('pos-tab');
      };}
    const ref = grid.querySelector('[data-kds-refresh]');
    if (ref)
      {ref.onclick = () => {
        syncPendingOrders({ forceCloud: true });
        toast('Refreshing kitchen…', 'fa-rotate');
      };}
  }

  function renderKDS() {
    const KDS = getKDS();
    wireStationSeg();

    const avgPrepEl = document.getElementById('kds-avg-prep');
    if (avgPrepEl) {
      if (KDS.length > 0) {
        let totalMins = 0;
        KDS.forEach((o) => {
          const mins = (Date.now() - (o.start || Date.now())) / 60000;
          totalMins += mins;
        });
        const avg = totalMins / KDS.length;
        const m = Math.floor(avg),
          s = Math.floor((avg - m) * 60);
        avgPrepEl.textContent = `Avg prep ${m}:${String(s).padStart(2, '0')}`;
      } else {
        avgPrepEl.textContent = 'Avg prep —:—';
      }
    }

    // Sidebar / mnav badge for active kitchen tickets
    document.querySelectorAll('.sidebar-link[data-tab="kds-tab"], .mnav-link[data-tab="kds-tab"]').forEach((link) => {
      let badge = link.querySelector('.badge-count');
      if (!badge && KDS.length > 0) {
        badge = document.createElement('span');
        badge.className = 'badge-count';
        link.appendChild(badge);
      }
      if (badge) {
        badge.textContent = String(KDS.length);
        badge.style.display = KDS.length > 0 ? '' : 'none';
        badge.title = KDS.length ? KDS.length + ' kitchen tickets' : '';
        const late = KDS.some((o) => (Date.now() - (o.start || 0)) / 60000 > 10);
        badge.classList.toggle('badge-urgent', late);
      }
    });

    const grid = $('#kds-grid');
    if (!grid) {return;}

    const _ksEl = document.getElementById('kds-search');
    if (_ksEl && !_ksEl.dataset.bound) {
      _ksEl.dataset.bound = '1';
      _ksEl.addEventListener('input', () => {
        try {
          renderKDS();
        } catch (e) {}
      });
    }
    const _kq = ((_ksEl && _ksEl.value) || '').trim().toLowerCase();
    const _kmatch = (o) =>
      !_kq ||
      String(o.tok || '')
        .toLowerCase()
        .includes(_kq) ||
      String(o.type || '')
        .toLowerCase()
        .includes(_kq) ||
      (o.items || []).some((it) =>
        String(it[1] || '')
          .toLowerCase()
          .includes(_kq)
      );

    if (!KDS.length) {
      // Pre-hydrate: skeleton tickets (not a false "kitchen empty")
      try {
        if (
          window.RSSkel &&
          typeof RSSkel.shouldShow === 'function' &&
          RSSkel.shouldShow(false) &&
          RSSkel.kdsCards
        ) {
          RSSkel.paint(grid, RSSkel.kdsCards({ count: 3 }));
          return;
        }
      } catch (_) {}
      try {
        if (window.RSSkel && RSSkel.clear) {RSSkel.clear(grid);}
      } catch (_) {}
      grid.innerHTML = emptyKdsHtml('empty');
      bindEmptyActions(grid);
      return;
    }
    try {
      if (window.RSSkel && RSSkel.clear) {RSSkel.clear(grid);}
    } catch (_) {}

    // Oldest first (kitchen priority)
    const ordered = KDS.map((o, i) => ({ o, i }))
      .filter(({ o }) => _kmatch(o) && orderMatchesStation(o, activeStation))
      .sort((a, b) => (a.o.start || 0) - (b.o.start || 0));

    if (!ordered.length) {
      grid.innerHTML = emptyKdsHtml(_kq ? 'search' : activeStation !== 'all' ? 'station' : 'empty');
      bindEmptyActions(grid);
      return;
    }

    grid.innerHTML = ordered
      .map(({ o, i }) => {
        const ageMin = (Date.now() - (o.start || Date.now())) / 60000;
        const urgentCls = o.recoveredOffline
          ? ' recovered'
          : ageMin > 10
            ? ' urgent'
            : ageMin > 5
              ? ' aging'
              : '';
        const showItems =
          activeStation === 'all'
            ? o.items || []
            : (o.items || []).filter((it) => itemMatchesStation(it, activeStation));
        const items = showItems.length ? showItems : o.items || [];
        const recoverBanner = o.recoveredOffline
          ? `<div class="kds-recover-banner" style="background:#fef3c7;color:#92400e;font-size:11px;font-weight:700;padding:6px 8px;border-radius:8px;margin-bottom:6px">
              ⚠ Recovered after offline — if kitchen already cooked this, tap <b>Mark ready</b> (do not re-cook)
            </div>`
          : '';
        return `
    <div class="kds-card${urgentCls}" data-k="${i}" data-kds-id="${_e(o.id || '')}" data-recovered="${o.recoveredOffline ? '1' : '0'}">
      <div class="kds-h"><div><div class="ktok">${_e(o.tok)}</div><div class="ktype">${_e(o.type)}</div></div><span class="kds-timer" data-start="${_e(o.start)}">0:00</span></div>
      ${recoverBanner}
      <div class="kds-items">${items
        .map((it, j) => {
          // j may not match original index when station-filtered; store name for toggle only
          return `<div class="kds-item" data-i="${j}"><span class="kq">${_e(it[0])}×</span><div><span class="kn">${_e(it[1])}</span>${
            it[2] ? `<div class="knote"><i class="fa-solid fa-circle-info"></i> ${_e(it[2])}</div>` : ''
          }</div></div>`;
        })
        .join('')}</div>
      <div class="kds-eta" style="display:flex;align-items:center;gap:6px;flex-wrap:wrap;padding:6px 0 2px;border-top:1px dashed var(--stroke);margin-top:6px">
        <span style="font-size:11px;color:var(--text-soft);font-weight:600;margin-right:2px">${o.prepMinutes ? 'ETA ' + o.prepMinutes + 'm' : 'Prep:'}</span>
        ${[10, 15, 20, 30]
          .map(
            (mn) =>
              `<button type="button" class="kds-eta-btn" data-eta="${i}" data-mins="${mn}" style="font-size:11px;padding:3px 8px;border:1px solid var(--stroke);border-radius:5px;background:${
                o.prepMinutes === mn ? 'var(--orange)' : 'var(--panel)'
              };color:${o.prepMinutes === mn ? '#fff' : 'var(--text)'};cursor:pointer">${mn}m</button>`
          )
          .join('')}
        <button type="button" class="kds-eta-btn" data-eta="${i}" data-mins="custom" style="font-size:11px;padding:3px 8px;border:1px solid var(--stroke);border-radius:5px;background:var(--panel);color:var(--text);cursor:pointer">…</button>
      </div>
      <div class="kds-foot"><button type="button" class="btn btn-primary btn-block" data-done="${i}"><i class="fa-solid fa-check"></i> Mark ready</button></div>
    </div>`;
      })
      .join('');

    $$('#kds-grid .kds-item').forEach((it) => it.addEventListener('click', () => it.classList.toggle('done')));
    $$('#kds-grid [data-done]').forEach((b) =>
      b.addEventListener('click', async () => {
        const item = KDS[+b.dataset.done];
        let failed = false;
        if (item && item.id && window.RS_DB) {
          try {
            const rows = await RS_DB.list('pending_orders');
            const row = rows.find((r) => r.id === item.id);
            if (row) {
              row.status = 'Ready';
              // Prevent reconnect chaos: cloud/LAN must not re-open this as a new KOT
              row.kitchenHandled = true;
              row.kitchenHandledAt = new Date().toISOString();
              row.manualFulfilled = true;
              row.skipKdsAlarm = true;
              await RS_DB.put('pending_orders', item.id, row);
              try {
                if (window.RSLanSync && typeof RSLanSync.pushRow === 'function') {RSLanSync.pushRow(row);}
              } catch (_) {}
              syncPendingOrders();
            }
          } catch (e) {
            console.warn('Failed updating KDS status', e);
            failed = true;
          }
        } else if (item && global.RS && Array.isArray(RS.KDS)) {
          // Local-only: drop ticket from board
          const idx = RS.KDS.indexOf(item);
          if (idx >= 0) {RS.KDS.splice(idx, 1);}
        }
        if (failed) {
          try { if (window.RSActionFeedback) {window.RSActionFeedback.error();} } catch(_) {}
          toast('Could not mark order ready — try again', 'fa-circle-exclamation');
          return;
        }
        const c = b.closest('.kds-card');
        if (c) {
          c.style.transition = 'all .4s var(--ease)';
          c.style.opacity = '0';
          c.style.transform = 'scale(.9)';
          setTimeout(() => {
            c.remove();
            // If board emptied, show proper empty state
            if (!$('#kds-grid .kds-card')) {
              try {
                renderKDS();
              } catch (e) {}
            }
          }, 400);
        }
        try { if (window.RSActionFeedback) {window.RSActionFeedback.success();} } catch(_) {}
        toast('Order ' + (item ? item.tok : '') + ' ready', 'fa-bell');
        // Settings → Order ready alerts (default OFF)
        try {
          const alertsOn =
            typeof global.RS_featureOn === 'function'
              ? global.RS_featureOn('set_order_ready_alerts', global.RS_SETTINGS, false)
              : global.RS_SETTINGS?.set_order_ready_alerts === true ||
                global.RS_SETTINGS?.set_order_ready_alerts === 'true';
          if (alertsOn && item) {
            const phone = String(item.phone || item.customerPhone || '').replace(/\D/g, '');
            if (phone.length >= 10 && global.RS_API && typeof RS_API.data === 'function') {
              const outlet =
                (global.RS_SETTINGS &&
                  (RS_SETTINGS.set_restaurant_name || RS_SETTINGS.set_outlet_name)) ||
                'our restaurant';
              const msg =
                'Hi! Your order ' +
                (item.tok || item.orderId || '') +
                ' is ready at ' +
                outlet +
                '. Please collect. Thank you!';
              RS_API.data({
                operation: 'gateway_send',
                phone: phone.length === 10 ? '91' + phone : phone,
                message: msg,
              }).catch((e) => console.warn('[kds] order ready WA', e && e.message));
            }
          }
        } catch (waReadyErr) {
          console.warn('[kds] order ready alert', waReadyErr);
        }
      })
    );
    $$('#kds-grid [data-eta]').forEach((b) =>
      b.addEventListener('click', async () => {
        const item = KDS[+b.dataset.eta];
        if (!item) {return;}
        let mins = b.dataset.mins;
        if (mins === 'custom') {
          const v = prompt('Prep time in minutes?', item.prepMinutes || '15');
          if (v == null) {return;}
          mins = parseInt(v, 10);
        } else {
          mins = parseInt(mins, 10);
        }
        if (!Number.isFinite(mins) || mins <= 0) {return;}
        item.prepMinutes = mins;
        item.prepStartedAt = new Date().toISOString();
        if (item.id && window.RS_DB) {
          try {
            const rows = await RS_DB.list('pending_orders');
            const row = rows.find((r) => r.id === item.id);
            if (row) {
              row.prepMinutes = mins;
              row.prepStartedAt = item.prepStartedAt;
              if (row.status === 'Pending Review' || row.status === 'Accepted') {row.status = 'preparing';}
              await RS_DB.put('pending_orders', item.id, row);
              if (typeof syncPendingOrders === 'function') {syncPendingOrders();}
            }
          } catch (e) {
            console.warn('set ETA failed', e);
            try { if (window.RSActionFeedback) {window.RSActionFeedback.error();} } catch(_) {}
            toast('Could not set prep time', 'fa-circle-exclamation');
            return;
          }
        }
        toast('ETA set: ' + mins + ' min', 'fa-clock');
        renderKDS();
      })
    );
    tickKDS();
  }

  function tickKDS() {
    $$('#kds-grid .kds-timer').forEach((t) => {
      const mins = (Date.now() - +t.dataset.start) / 60000;
      const m = Math.floor(mins);
      const s = Math.floor((mins - m) * 60);
      t.textContent = m + ':' + String(s).padStart(2, '0');
      t.className = 'kds-timer ' + (mins > 10 ? 'late' : mins > 5 ? 'mid' : '');
      const card = t.closest('.kds-card');
      if (card) {
        card.classList.toggle('urgent', mins > 10);
        card.classList.toggle('aging', mins > 5 && mins <= 10);
      }
    });
  }

  if (!global.__rsKdsTickBound) {
    global.__rsKdsTickBound = true;
    setInterval(() => {
      const tab = document.getElementById('kds-tab');
      if (tab && tab.classList.contains('active')) {tickKDS();}
    }, 1000);
  }

  global.RSKdsUI = { renderKDS, tickKDS };
  function attach() {
    if (!global.RS) {return;}
    global.RS.renderKDS = renderKDS;
  }
  if (global.RS) {attach();}
  document.addEventListener('rs:ready', attach);
  document.addEventListener('rs:hydrated', () => {
    try {
      if (global.RSSkel && RSSkel.markHydrated) {RSSkel.markHydrated();}
      renderKDS();
    } catch (_) {}
  });
})(typeof window !== 'undefined' ? window : globalThis);



/* === assets/modules/qr-orders-ui.js === */
/* ============================================================
   RestroSuite — QR orders UI (Wave 10 code-split)
   ============================================================ */
(function (global) {
  'use strict';

  function toast(msg, icon) {
    if (global.RS && typeof RS.toast === 'function') {RS.toast(msg, icon);}
  }
  function rs(n) {
    if (global.RS && typeof RS.rs === 'function') {return RS.rs(n);}
    return '₹' + (Number(n) || 0).toLocaleString('en-IN');
  }
  function esc(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }
  const _e = esc;
  function $(sel, r) {
    return (r || document).querySelector(sel);
  }
  function $$(sel, r) {
    return Array.from((r || document).querySelectorAll(sel));
  }
  function getOrders() {
    return (global.RS && Array.isArray(RS.QR_ORDERS) ? RS.QR_ORDERS : []) || [];
  }
  function syncPendingOrders(opts) {
    if (global.RS_SYNC && typeof RS_SYNC.syncPendingOrders === 'function') {
      return RS_SYNC.syncPendingOrders(opts);
    }
  }
  function setOperationStatus(msg, state) {
    if (global.RS && typeof RS.setOperationStatus === 'function') {return RS.setOperationStatus(msg, state);}
  }
  function finishOperationStatus(msg, state) {
    if (global.RS && typeof RS.finishOperationStatus === 'function') {return RS.finishOperationStatus(msg, state);}
  }
  function activateTab(id) {
    if (global.RS && typeof RS.activateTab === 'function') {return RS.activateTab(id);}
  }

  let QR_ORDERS = getOrders();

  const statusPill = { pending: 'pill-amber', preparing: 'pill-orange', served: 'pill-green' };
  const statusTxt = { pending: 'Pending', preparing: 'Preparing', served: 'Served' };

  function parseTs(dateStr) {
    if (dateStr == null || dateStr === '') {return null;}
    if (typeof dateStr === 'number' && Number.isFinite(dateStr)) {return dateStr;}
    const m = String(dateStr)
      .trim()
      .match(/^(\d{1,2})\/(\d{1,2})\/(\d{4}),?\s+(\d{1,2}):(\d{2})(?::(\d{2}))?\s*([ap]m)?$/i);
    if (m) {
      const [, d, mo, y, h, mi, s, meridiem] = m;
      let hour = Number(h);
      if (meridiem) {
        const pm = meridiem.toLowerCase() === 'pm';
        if (pm && hour < 12) {hour += 12;}
        if (!pm && hour === 12) {hour = 0;}
      }
      const parsed = new Date(Number(y), Number(mo) - 1, Number(d), hour, Number(mi), Number(s || 0)).getTime();
      return Number.isNaN(parsed) ? null : parsed;
    }
    const nativeTime = new Date(dateStr).getTime();
    return Number.isNaN(nativeTime) ? null : nativeTime;
  }

  /** Live relative age — never show a frozen "9h ago" from last sync. */
  function relativeAge(o) {
    const ts = o && (o.start || parseTs(o.dateTime) || parseTs(o.time));
    if (!ts) {
      // Fall back to preformatted string only if it already looks relative
      const t = String((o && o.time) || '');
      if (/ago|just now|min|h\s/i.test(t)) {return t;}
      return 'just now';
    }
    const elapsed = Date.now() - ts;
    if (elapsed < 0) {return 'just now';}
    const mins = Math.floor(elapsed / 60000);
    if (mins < 1) {return 'just now';}
    if (mins < 60) {return mins + ' min ago';}
    const hrs = Math.floor(mins / 60);
    if (hrs < 24) {return hrs + 'h ' + (mins % 60) + 'm ago';}
    const days = Math.floor(hrs / 24);
    return days + 'd ago';
  }

  function ageMinutes(o) {
    const ts = o && (o.start || parseTs(o.dateTime));
    if (!ts) {return 0;}
    return Math.max(0, (Date.now() - ts) / 60000);
  }

  function tableTotalCount() {
    try {
      if (global.RS && Array.isArray(RS.TABLES) && RS.TABLES.length) {return RS.TABLES.length;}
      const cards = document.querySelectorAll('#floor-tab .table-card');
      if (cards.length) {return cards.length;}
    } catch (_) {}
    return 12;
  }

  function qrItemLabel(item) {
    if (Array.isArray(item)) {return item[0];}
    return `${Number(item.qty || 1)}× ${item.name || 'Item'}`;
  }
  function qrItemTotal(item) {
    if (Array.isArray(item)) {return Number(item[1] || 0);}
    return Number(item.price || 0) * Number(item.qty || 1);
  }
  function qrItemNote(item) {
    if (Array.isArray(item)) {return item[2] || '';}
    return item.notes || item.note || '';
  }
  function qrTableName(table) {
    const raw = String(table || '').trim();
    if (!raw) {return 'Walk-in / Takeaway';}
    if (/^table\s+/i.test(raw)) {return raw.replace(/^table/i, 'Table');}
    if (/^\d+$/.test(raw)) {return `Table ${raw}`;}
    return raw;
  }
  function qrTableShort(table) {
    const raw = String(table || '').trim();
    if (!raw) {return '—';}
    const parts = raw.split('-');
    if (parts.length > 1 && /^\d+$/.test(parts[parts.length - 1])) {return parts[parts.length - 1];}
    const m = raw.match(/(\d+)/);
    if (m) {return m[1];}
    return raw;
  }
  function normalizeStatus(s) {
    const st = String(s || '').toLowerCase().trim();
    if (/pending|new|hold|draft|review/.test(st) && !/prepar|ready|serv|paid|cancel/.test(st)) {return 'pending';}
    if (/prepar|accept|cook|kitchen/.test(st)) {return 'preparing';}
    if (/serv|ready|paid|settled|complet/.test(st)) {return 'served';}
    return st || 'pending';
  }

  function canStaffAmend(order) {
    if (global.RSAmend && typeof RSAmend.canAmendOrderLine === 'function') {
      return RSAmend.canAmendOrderLine(order);
    }
    const st = normalizeStatus(order && order.status);
    if (st === 'pending') {return { ok: true };}
    if (st === 'preparing') {
      return { ok: false, reason: 'In kitchen — cannot rewrite items. Void from kitchen if needed.' };
    }
    return { ok: false, reason: 'Order already served / closed' };
  }

  function orderItemsEditable(order) {
    return (order.items || []).map((item) => {
      if (Array.isArray(item)) {
        const label = String(item[0] || 'Item').replace(/^\s*\d+\s*[×x]\s*/i, '').trim() || 'Item';
        return { name: label, qty: 1, price: Number(item[1] || 0), note: item[2] || '' };
      }
      return {
        id: item.id,
        name: item.name || 'Item',
        qty: Math.max(1, Number(item.qty || 1)),
        price: Number(item.price || 0),
        note: item.notes || item.note || '',
      };
    });
  }

  async function openStaffAmendModal(orderIdx) {
    const o = QR_ORDERS[orderIdx];
    if (!o) {return;}
    const check = canStaffAmend(o);
    if (!check.ok) {
      try { if (window.RSActionFeedback) {window.RSActionFeedback.error();} } catch(_) {}
      toast(check.reason || 'Cannot amend', 'fa-lock');
      return;
    }
    if (!global.RSModal) {
      try { if (window.RSActionFeedback) {window.RSActionFeedback.error();} } catch(_) {}
      toast('Modal unavailable', 'fa-circle-exclamation');
      return;
    }
    let lines = orderItemsEditable(o);
    const sess = (() => {
      try {
        return (global.RS_API && RS_API.session && RS_API.session()) || {};
      } catch (_) {
        return {};
      }
    })();
    const staffName = sess.display_name || sess.username || 'Staff';

    RSModal.open({
      title: 'Amend order · Table ' + qrTableShort(o.table),
      sub: 'Guest & waiter share this order. Changes notify kitchen/guest devices.',
      icon: 'fa-pen-to-square',
      size: 'md',
      body: `<div class="qr-amend-modal">
        <p style="font-size:12.5px;color:var(--text-soft);margin:0 0 10px">Only while <b>Pending</b>. After Accept → kitchen, lines are locked.</p>
        <div id="qr-amend-lines" class="qr-amend-lines"></div>
        <div class="form-grid-2" style="margin-top:12px">
          <div class="set-field"><label class="fl">Guests (covers)</label>
            <input type="number" id="qr-amend-covers" class="form-input" min="0" max="99" value="${Math.max(0, Number(o.covers != null ? o.covers : o.pax) || 0)}" inputmode="numeric">
          </div>
          <div class="set-field"><label class="fl">Note to kitchen</label>
            <input type="text" id="qr-amend-note" class="form-input" placeholder="Optional" maxlength="120">
          </div>
        </div>
        <div style="margin-top:10px;display:flex;justify-content:space-between;font-weight:800">
          <span>Total</span><span id="qr-amend-total">${rs(0)}</span>
        </div>
      </div>`,
      foot: `<button type="button" class="btn btn-ghost" style="flex:1" data-x>Cancel</button>
             <button type="button" class="btn btn-primary" style="flex:1" data-ok><i class="fa-solid fa-check"></i> Save &amp; notify</button>`,
      onMount(m, close) {
        const listEl = m.querySelector('#qr-amend-lines');
        const totalEl = m.querySelector('#qr-amend-total');
        const paint = () => {
          listEl.innerHTML = lines
            .map(
              (l, i) => `<div class="qr-amend-row" style="display:grid;grid-template-columns:1fr auto auto auto;gap:8px;align-items:center;padding:8px 0;border-bottom:1px solid var(--stroke)">
              <span style="font-size:13px;font-weight:600">${esc(l.name)}</span>
              <button type="button" class="btn btn-ghost btn-sm" data-d="-1" data-i="${i}">−</button>
              <b style="min-width:22px;text-align:center">${l.qty}</b>
              <button type="button" class="btn btn-ghost btn-sm" data-d="1" data-i="${i}">+</button>
            </div>`
            )
            .join('');
          const tot = lines.reduce((a, l) => a + l.price * l.qty, 0);
          totalEl.textContent = rs(tot);
          listEl.querySelectorAll('[data-d]').forEach((btn) => {
            btn.onclick = () => {
              const i = +btn.getAttribute('data-i');
              const d = +btn.getAttribute('data-d');
              if (!lines[i]) {return;}
              lines[i].qty += d;
              if (lines[i].qty <= 0) {lines.splice(i, 1);}
              if (!lines.length) {
                try { if (window.RSActionFeedback) {window.RSActionFeedback.error();} } catch(_) {}
                toast('Keep at least one item', 'fa-circle-exclamation');
                lines = orderItemsEditable(o);
              }
              paint();
            };
          });
        };
        paint();
        m.querySelector('[data-x]').onclick = close;
        m.querySelector('[data-ok]').onclick = async () => {
          const covers = Math.max(0, Number(m.querySelector('#qr-amend-covers').value) || 0);
          const note = (m.querySelector('#qr-amend-note').value || '').trim();
          const items = lines.map((l) => ({
            id: l.id || l.name,
            name: l.name,
            qty: l.qty,
            price: l.price,
            note: l.note || '',
            notes: note || l.note || '',
          }));
          const total = items.reduce((a, it) => a + it.price * it.qty, 0);
          try {
            let row = null;
            if (window.RS_DB && o.id) {
              const rows = await RS_DB.list('pending_orders');
              row = rows.find((r) => r.id === o.id) || null;
            }
            if (row && global.RSAmend && typeof RSAmend.amendViaStaffDb === 'function') {
              await RSAmend.amendViaStaffDb(row, items, { by: staffName, covers });
            } else if (row && window.RS_DB) {
              row.items = items;
              row.total = total;
              row.subtotal = total;
              row.covers = covers;
              row.pax = covers;
              row.amendedBy = staffName;
              row.amendedAt = new Date().toISOString();
              await RS_DB.put('pending_orders', row.id, row);
              syncPendingOrders({ forceCloud: true });
              if (global.RS10 && RS10.notifyOrderAmendment) {
                RS10.notifyOrderAmendment({ by: staffName, table: o.table });
              }
            } else {
              o.items = items;
              o.total = total;
              o.covers = covers;
            }
            o.items = items;
            o.total = total;
            o.covers = covers;
            close();
            try { if (window.RSActionFeedback) {window.RSActionFeedback.success();} } catch(_) {}
            toast('Order amended · guest & kitchen notified', 'fa-bell');
            renderQR();
            try {
              document.dispatchEvent(
                new CustomEvent('rs:order-amended', {
                  detail: { by: staffName, table: o.table, order: o },
                })
              );
            } catch (_) {}
          } catch (err) {
            try { if (window.RSActionFeedback) {window.RSActionFeedback.error();} } catch(_) {}
            toast((err && err.message) || 'Amend failed', 'fa-circle-exclamation');
          }
        };
      },
    });
  }

  function qrCartItems(order) {
    return (order.items || [])
      .map((item) => {
        if (Array.isArray(item)) {
          const label = String(item[0] || 'Item').replace(/^\s*\d+\s*[×x]\s*/i, '').trim() || 'Item';
          return { id: label, name: label, qty: 1, price: Number(item[1] || 0), cat: 'QR Orders', stock: 'ok' };
        }
        const qty = Math.max(1, Number(item.qty || 1));
        return {
          id: item.id || item.name,
          name: item.name || 'Item',
          qty,
          price: Number(item.price || 0),
          cat: item.cat || item.category || 'QR Orders',
          stock: 'ok',
          taxCategory: item.taxCategory || item.tax_category,
          notes: item.notes || item.note || '',
        };
      })
      .filter((item) => item.name && Number.isFinite(item.price));
  }
  async function openQrOrderInPos(order) {
    if (!order) {return;}
    try { if (window.RSActionFeedback) {window.RSActionFeedback.click();} } catch(_) {}
    const items = qrCartItems(order);
    if (!items.length) {
      try { if (window.RSActionFeedback) {window.RSActionFeedback.error();} } catch(_) {}
      toast('This QR order has no billable items', 'fa-circle-exclamation');
      return;
    }
    const tableName = qrTableName(order.table);
    activateTab('pos-tab');
    // Wait for POS tab DOM + cart helpers (RS.setCart) to be ready after tab switch.
    await new Promise((resolve) => { setTimeout(resolve, 120); });
    let attempts = 0;
    while (attempts < 8 && !(window.RS && typeof RS.setCart === 'function')) {
      await new Promise((resolve) => { setTimeout(resolve, 60); });
      attempts += 1;
    }

    // Block showMenuGridForTable from clearing/replacing this cart on table change
    if (typeof window.RS_PRESERVE_CART_LOAD === 'function') {
      window.RS_PRESERVE_CART_LOAD(2000);
    } else {
      window.__rsPreserveCartUntil = Date.now() + 2000;
    }

    const applyCart = () => {
      if (window.RS && typeof RS.setCart === 'function') {
        RS.setCart(items);
      } else if (window.RS && Array.isArray(RS.cart)) {
        RS.cart.length = 0;
        items.forEach((it) => RS.cart.push(it));
      }
      try {
        if (window.RS && typeof RS.renderCart === 'function') {RS.renderCart();}
      } catch (e) {}
      try {
        if (typeof window.saveActiveCart === 'function') {window.saveActiveCart();}
      } catch (e) {}
    };

    const tableSelect =
      document.getElementById('cart-table') ||
      document.getElementById('pos-table-select') ||
      document.querySelector('#pos-tab select[name="table"], #pos-tab #table-select');
    if (tableSelect) {
      const matchValue = order.table || tableName;
      let opt = [...tableSelect.options].find(
        (o) =>
          o.value === tableName ||
          o.text === tableName ||
          o.value === matchValue ||
          o.text === matchValue ||
          o.value === String(order.table) ||
          o.textContent.trim() === tableName
      );
      if (!opt) {
        opt = document.createElement('option');
        opt.value = tableName;
        opt.textContent = tableName;
        tableSelect.appendChild(opt);
      }
      tableSelect.value = opt.value;
      tableSelect.dispatchEvent(new Event('change', { bubbles: true }));
      tableSelect.dispatchEvent(new Event('input', { bubbles: true }));
    }

    if (window.RS && typeof RS.setTable === 'function') {
      try {
        RS.setTable(tableName);
      } catch (e) {}
    }
    const nameEl = document.getElementById('cust-name') || document.getElementById('cust-input-name');
    const phoneEl = document.getElementById('cust-phone') || document.getElementById('cust-input-phone');
    if (nameEl && order.customerName) {
      nameEl.value = order.customerName;
      nameEl.dispatchEvent(new Event('input', { bubbles: true }));
    }
    if (phoneEl && order.customerPhone) {
      phoneEl.value = order.customerPhone;
      phoneEl.dispatchEvent(new Event('input', { bubbles: true }));
    }
    // Apply after table hydrate; re-apply once async showMenuGridForTable may have finished
    applyCart();
    await new Promise((resolve) => { setTimeout(resolve, 350); });
    applyCart();
    toast(`Loaded ${tableName} in POS`, 'fa-receipt');
  }

  function emptyQrHtml() {
    return `<div class="sr-empty qr-empty" style="grid-column:1/-1;padding:48px 24px">
      <i class="fa-solid fa-qrcode" style="font-size:28px;opacity:.45;margin-bottom:10px;display:block"></i>
      <div style="font-weight:700;font-size:15px;color:var(--text);margin-bottom:6px">No QR orders right now</div>
      <div style="max-width:340px;margin:0 auto 14px;line-height:1.45">When guests scan a table QR and place an order, it appears here for accept → kitchen → serve.</div>
      <div style="display:flex;gap:8px;justify-content:center;flex-wrap:wrap">
        <button type="button" class="btn btn-ghost btn-sm" data-qr-goto-floor><i class="fa-solid fa-chair"></i> Open floor</button>
        <button type="button" class="btn btn-primary btn-sm" data-qr-refresh><i class="fa-solid fa-rotate"></i> Refresh</button>
      </div>
    </div>`;
  }

  function renderQR() {
    QR_ORDERS = getOrders();
    const pendingCount = QR_ORDERS.filter((o) => o.status === 'pending').length;
    const preparingCount = QR_ORDERS.filter((o) => o.status === 'preparing').length;
    const servedCount = QR_ORDERS.filter((o) => o.status === 'served').length;
    const activeTables = new Set(QR_ORDERS.filter((o) => o.status !== 'served').map((o) => o.table)).size;
    const totalTables = tableTotalCount();

    const qrTab = document.getElementById('qr-orders-tab');
    if (qrTab) {
      const svElements = qrTab.querySelectorAll('.stat-row .stat-card .sv');
      if (svElements.length >= 4) {
        svElements[0].textContent = pendingCount;
        svElements[1].textContent = preparingCount;
        svElements[2].textContent = servedCount;
        svElements[3].textContent = `${activeTables} / ${totalTables}`;
      }
    }

    // Sidebar badge — pending first for attention
    const qrBadge = document.querySelector('.sidebar-link[data-tab="qr-orders-tab"] .badge-count');
    if (qrBadge) {
      const activeCount = pendingCount + preparingCount;
      qrBadge.textContent = pendingCount > 0 ? pendingCount : activeCount;
      qrBadge.style.display = activeCount > 0 ? '' : 'none';
      qrBadge.classList.toggle('badge-urgent', pendingCount > 0);
      if (pendingCount > 0) {qrBadge.title = pendingCount + ' awaiting accept';}
      else if (activeCount > 0) {qrBadge.title = activeCount + ' active QR orders';}
      else {qrBadge.title = '';}
    }

    const grid = $('#qr-grid');
    if (!grid) {return;}

    let qrView =
      global.RSViewMode && RSViewMode.get ? RSViewMode.get('qr-orders', 'cards') : 'cards';
    (function ensureQrViewBar() {
      const tab = document.getElementById('qr-orders-tab');
      if (!tab || !global.RSViewMode) {return;}
      let bar = tab.querySelector('.qr-view-bar');
      if (!bar) {
        bar = document.createElement('div');
        bar.className = 'qr-view-bar';
        bar.style.cssText = 'display:flex;justify-content:flex-end;margin:0 0 10px;';
        const host = grid.parentElement;
        if (host) {host.insertBefore(bar, grid);}
      }
      bar.innerHTML = RSViewMode.toggleHtml('qr-orders', qrView);
      qrView = RSViewMode.wire(bar, 'qr-orders', function (m) {
        qrView = m;
        renderQR();
      }, 'cards');
    })();

    if (!QR_ORDERS.length) {
      grid.classList.remove('is-list');
      // Pre-hydrate: skeleton cards (not a false "no orders")
      try {
        if (
          global.RSSkel &&
          RSSkel.shouldShow &&
          RSSkel.shouldShow(false) &&
          RSSkel.qrCards
        ) {
          RSSkel.paint(grid, RSSkel.qrCards({ count: 4 }));
          return;
        }
      } catch (_) {}
      try {
        if (global.RSSkel && RSSkel.clear) {RSSkel.clear(grid);}
      } catch (_) {}
      grid.innerHTML = emptyQrHtml();
      const floorBtn = grid.querySelector('[data-qr-goto-floor]');
      if (floorBtn)
        {floorBtn.onclick = () => {
          try { if (window.RSActionFeedback) {window.RSActionFeedback.click();} } catch(_) {}
          if (typeof activateTab === 'function') {activateTab('floor-tab');}
          else if (global.RS && RS.activateTab) {RS.activateTab('floor-tab');}
        };}
      const refreshBtn = grid.querySelector('[data-qr-refresh]');
      if (refreshBtn)
        {refreshBtn.onclick = () => {
          try { if (window.RSActionFeedback) {window.RSActionFeedback.click();} } catch(_) {}
          syncPendingOrders({ forceCloud: true });
          toast('Refreshing QR orders…', 'fa-rotate');
        };}
      return;
    }
    try {
      if (global.RSSkel && RSSkel.clear) {RSSkel.clear(grid);}
    } catch (_) {}

    // Pending first, then oldest within status
    const sortedIdx = QR_ORDERS.map((o, i) => ({ o, i })).sort((a, b) => {
      const rank = (s) => (s === 'pending' ? 0 : s === 'preparing' ? 1 : 2);
      const r = rank(a.o.status) - rank(b.o.status);
      if (r !== 0) {return r;}
      return ageMinutes(b.o) - ageMinutes(a.o); // older first within bucket
    });

    if (qrView === 'list') {
      grid.classList.add('is-list');
      grid.innerHTML = `
        <div class="rs-line-list">
          <div class="rs-line-head qr-line-head">
            <span>Table</span><span>Guest</span><span>Items</span><span>Age</span><span class="rl-num">Total</span><span class="rl-acts">Actions</span>
          </div>
          ${sortedIdx
            .map(({ o, i }) => {
              const mins = ageMinutes(o);
              const itemSummary = (o.items || [])
                .slice(0, 3)
                .map((it) => qrItemLabel(it))
                .join(', ');
              const more = (o.items || []).length > 3 ? '…' : '';
              return `
            <div class="rs-line-row qr-line-row s-${_e(o.status)}" data-order-id="${_e(o.id || '')}">
              <span class="rl-name">T ${_e(qrTableShort(o.table))}</span>
              <span class="rl-mute">${_e(o.customerName || '—')}</span>
              <span class="rl-mute" title="${_e(itemSummary + more)}">${_e((itemSummary || '—') + more)}</span>
              <span class="rl-mute qtime" data-qr-start="${_e(o.start || parseTs(o.dateTime) || '')}">${_e(relativeAge(o))}</span>
              <span class="rl-num">${rs(o.total)}</span>
              <span class="rl-acts">
                <span class="pill ${statusPill[o.status] || 'pill-amber'}" style="padding:2px 8px;font-size:10px">${statusTxt[o.status] || o.status}</span>
                ${canStaffAmend(o).ok ? `<button class="btn btn-ghost btn-sm" data-amend="${i}" title="Amend items"><i class="fa-solid fa-pen-to-square"></i></button>` : ''}
                ${o.status === 'pending' || o.status === 'preparing' ? `<button class="btn btn-ghost btn-sm" data-pos="${i}" title="POS"><i class="fa-solid fa-cash-register"></i></button>` : ''}
                ${o.status !== 'served'
                  ? `<button class="btn btn-primary btn-sm" data-adv="${i}">${o.status === 'pending' ? 'Accept' : 'Serve'}</button>`
                  : `<button class="btn btn-ghost btn-sm" data-bill="${i}"><i class="fa-solid fa-receipt"></i></button>`}
              </span>
            </div>`;
            })
            .join('')}
        </div>`;
    } else {
      grid.classList.remove('is-list');
      grid.innerHTML = sortedIdx
      .map(({ o, i }) => {
        const guest = o.customerName
          ? `<div class="qguest"><i class="fa-solid fa-user"></i> ${_e(o.customerName)}</div>`
          : '';
        const mins = ageMinutes(o);
        const ageCls = o.status === 'served' ? '' : mins > 15 ? ' late' : mins > 8 ? ' mid' : '';
        const openPosBtn =
          o.status === 'pending' || o.status === 'preparing'
            ? `<button class="btn btn-ghost btn-sm" data-pos="${i}" title="Load into POS"><i class="fa-solid fa-cash-register"></i></button>`
            : '';
        const amendBtn = canStaffAmend(o).ok
          ? `<button class="btn btn-ghost btn-sm" data-amend="${i}" title="Amend items / guests"><i class="fa-solid fa-pen-to-square"></i> Amend</button>`
          : o.status === 'preparing'
            ? '<span class="qr-lock-hint" title="Locked in kitchen" style="font-size:10px;color:var(--text-mute)"><i class="fa-solid fa-lock"></i> Locked</span>'
            : '';
        const lines = (o.items || [])
          .map((it) => {
            const note = qrItemNote(it);
            return `<div class="ql"><span>${_e(qrItemLabel(it))}${
              note ? `<div class="qnote"><i class="fa-solid fa-circle-info"></i> ${_e(note)}</div>` : ''
            }</span><b>${rs(qrItemTotal(it))}</b></div>`;
          })
          .join('');
        const coversN = Math.max(0, Number(o.covers != null ? o.covers : o.pax) || 0);
        return `
    <div class="qr-card s-${_e(o.status)}${o.status === 'pending' ? ' needs-attention' : ''}${mins > 15 && o.status !== 'served' ? ' qr-aging' : ''}" data-order-id="${_e(o.id || '')}">
      <div class="qr-ch"><div><span class="tnum">Table ${_e(qrTableShort(o.table))}</span><div class="qtime${ageCls}" data-qr-start="${_e(o.start || parseTs(o.dateTime) || '')}">${_e(relativeAge(o))}${coversN ? ' · ' + coversN + ' guests' : ''}</div>${guest}</div><span class="pill ${statusPill[o.status] || 'pill-amber'}"><span class="dot ${o.status === 'preparing' || o.status === 'pending' ? 'dot-live' : ''}"></span>${statusTxt[o.status] || o.status}</span></div>
      <div class="qr-lines">${lines}</div>
      <div class="qr-cf"><span class="qtot">${rs(o.total)}</span>
        ${
          o.status !== 'served'
            ? `${amendBtn}${openPosBtn}<button class="btn btn-ghost btn-sm" data-merge="${i}" title="Merge into another table"><i class="fa-solid fa-code-merge"></i> Merge</button><button class="btn btn-primary btn-sm" data-adv="${i}">${o.status === 'pending' ? 'Accept' : 'Mark served'}</button>`
            : `<button class="btn btn-ghost btn-sm" data-bill="${i}"><i class="fa-solid fa-receipt"></i> Bill</button>`
        }
      </div>
    </div>`;
      })
      .join('');
    }

    $$('#qr-grid [data-pos]').forEach((b) =>
      b.addEventListener('click', () => {
        openQrOrderInPos(QR_ORDERS[+b.dataset.pos]);
      })
    );
    $$('#qr-grid [data-amend]').forEach((b) =>
      b.addEventListener('click', () => {
        openStaffAmendModal(+b.dataset.amend);
      })
    );
    $$('#qr-grid [data-adv]').forEach((b) =>
      b.addEventListener('click', async () => {
        const o = QR_ORDERS[+b.dataset.adv];
        if (!o) {return;}
        const nextStatus = o.status === 'pending' ? 'preparing' : 'served';
        const dbStatus = nextStatus === 'preparing' ? 'preparing' : 'served';
        const tableLabel = qrTableShort(o.table);
        // Billing only: accept stays on manager POS — never kitchen fire
        const billingOnly =
          window.RSOpsMode && typeof RSOpsMode.isBillingOnly === 'function'
            ? RSOpsMode.isBillingOnly()
            : !!(window.RS_SETTINGS && RS_SETTINGS.set_pos_only_mode);
        const printKitchen =
          !billingOnly &&
          nextStatus === 'preparing' &&
          window.RSOpsMode &&
          typeof RSOpsMode.usesKitchenPrint === 'function' &&
          RSOpsMode.usesKitchenPrint() &&
          (typeof RSOpsMode.autoPrintKot !== 'function' || RSOpsMode.autoPrintKot());

        if (o.id && window.RS_DB) {
          try {
            const rows = await RS_DB.list('pending_orders');
            const row = rows.find((r) => r.id === o.id);
            if (row) {
              row.status = billingOnly && nextStatus === 'preparing' ? 'Accepted' : dbStatus;
              if (billingOnly) {row.kitchenRoute = 'none';}
              await RS_DB.put('pending_orders', o.id, row);
              syncPendingOrders();
            }
            if (printKitchen && window.RSOps && typeof RSOps.printKotThermal === 'function') {
              const items = (o.items || []).map((it) => ({
                qty: it.qty || 1,
                name: it.name || 'Item',
                note: it.notes || it.note || '',
              }));
              await RSOps.printKotThermal(items, {
                token: o.orderId || o.id,
                table: o.table,
                orderType: o.orderType || 'Dine-in',
                kind: 'KOT',
              });
            }
            toast(
              billingOnly && nextStatus === 'preparing'
                ? 'Table ' + tableLabel + ' accepted (billing only — no kitchen)'
                : 'Table ' + tableLabel + ' → ' + statusTxt[nextStatus]
            );
          } catch (e) {
            console.warn('Failed updating order status', e);
            try { if (window.RSActionFeedback) {window.RSActionFeedback.error();} } catch(_) {}
            toast('Could not update Table ' + tableLabel + ' — try again', 'fa-circle-exclamation');
          }
        } else {
          o.status = nextStatus;
          renderQR();
          try { if (window.RSActionFeedback) {window.RSActionFeedback.success();} } catch(_) {}
          toast('Table ' + tableLabel + ' → ' + statusTxt[nextStatus]);
        }
      })
    );
    $$('#qr-grid [data-merge]').forEach((b) =>
      b.addEventListener('click', () => {
        const srcIdx = +b.dataset.merge;
        const src = QR_ORDERS[srcIdx];
        if (!src) {return;}
        const candidates = QR_ORDERS.map((o, idx) => ({ o, idx })).filter(
          ({ o, idx }) => idx !== srcIdx && o.status !== 'served' && o.table !== src.table
        );
        if (!candidates.length) {
          try { if (window.RSActionFeedback) {window.RSActionFeedback.error();} } catch(_) {}
          toast('No other open tables to merge into', 'fa-code-merge');
          return;
        }
        if (!window.RSModal) {
          try { if (window.RSActionFeedback) {window.RSActionFeedback.error();} } catch(_) {}
          toast('Modal module is unavailable', 'fa-circle-exclamation');
          return;
        }
        const options = candidates
          .map(
            ({ o, idx }) =>
              `<option value="${idx}">Table ${_e(qrTableShort(o.table))} — ${rs(o.total)}</option>`
          )
          .join('');
        RSModal.open({
          title: 'Merge table',
          sub: 'Combine Table ' + qrTableShort(src.table) + ' into another open table',
          icon: 'fa-code-merge',
          size: 'sm',
          body: `
        <div style="display:flex;flex-direction:column;gap:12px">
          <div style="font-size:13px;color:var(--text-soft)">
            This will move all items from Table ${_e(qrTableShort(src.table))} onto the table you pick below, then close out Table ${_e(qrTableShort(src.table))}. This cannot be undone.
          </div>
          <div>
            <label class="fl">Merge into</label>
            <select class="form-input" id="merge-target">${options}</select>
          </div>
        </div>`,
          foot: '<button class="btn btn-ghost" style="flex:1" data-cancel>Cancel</button><button class="btn btn-primary" style="flex:1" data-confirm><i class="fa-solid fa-code-merge"></i> Merge tables</button>',
          onMount(modal, close) {
            modal.querySelector('[data-cancel]').onclick = close;
            modal.querySelector('[data-confirm]').onclick = async () => {
              const targetIdx = +modal.querySelector('#merge-target').value;
              const target = QR_ORDERS[targetIdx];
              if (!target) {
                close();
                return;
              }
              close();
              setOperationStatus('Merging tables...');
              const mergedItems = target.items.concat(src.items);
              const mergedTotal = (Number(target.total) || 0) + (Number(src.total) || 0);
              target.items = mergedItems;
              target.total = mergedTotal;
              try {
                if (window.RS_DB) {
                  const rows = await RS_DB.list('pending_orders');
                  const targetRow = rows.find((r) => r.id === target.id);
                  const srcRow = rows.find((r) => r.id === src.id);
                  if (targetRow) {
                    targetRow.items = mergedItems;
                    targetRow.total = mergedTotal;
                    await RS_DB.put('pending_orders', target.id, targetRow);
                  }
                  if (srcRow) {
                    await RS_DB.del('pending_orders', src.id);
                  }
                  await syncPendingOrders();
                } else {
                  QR_ORDERS.splice(srcIdx, 1);
                  renderQR();
                }
                finishOperationStatus('Tables merged');
                try { if (window.RSActionFeedback) {window.RSActionFeedback.success();} } catch(_) {}
                toast('Merged into Table ' + qrTableShort(target.table), 'fa-code-merge');
              } catch (e) {
                console.warn('Failed to merge tables', e);
                finishOperationStatus('Merge failed', 'error');
                try { if (window.RSActionFeedback) {window.RSActionFeedback.error();} } catch(_) {}
                toast('Could not merge tables — try again', 'fa-circle-exclamation');
              }
            };
          },
        });
      })
    );
    $$('#qr-grid [data-bill]').forEach((b) =>
      b.addEventListener('click', () => {
        openQrOrderInPos(QR_ORDERS[+b.dataset.bill]);
      })
    );
  }

  function tickQRAges() {
    const tab = document.getElementById('qr-orders-tab');
    if (!tab || !tab.classList.contains('active')) {return;}
    $$('#qr-grid .qtime[data-qr-start]').forEach((el) => {
      const start = +el.dataset.qrStart;
      if (!start) {return;}
      const mins = (Date.now() - start) / 60000;
      const m = Math.floor(mins);
      let text = 'just now';
      if (m >= 1 && m < 60) {text = m + ' min ago';}
      else if (m >= 60) {
        const hrs = Math.floor(m / 60);
        text = hrs < 24 ? hrs + 'h ' + (m % 60) + 'm ago' : Math.floor(hrs / 24) + 'd ago';
      }
      el.textContent = text;
      el.classList.toggle('mid', mins > 8 && mins <= 15);
      el.classList.toggle('late', mins > 15);
      const card = el.closest('.qr-card');
      if (card && !card.classList.contains('s-served')) {
        card.classList.toggle('qr-aging', mins > 15);
      }
    });
  }

  if (!global.__rsQrTickBound) {
    global.__rsQrTickBound = true;
    setInterval(tickQRAges, 15000);
  }

  global.RSQrOrdersUI = { renderQR, openQrOrderInPos, qrCartItems, qrTableName, qrItemLabel, qrItemTotal, tickQRAges };
  global.openQrOrderInPos = openQrOrderInPos;
  function attach() {
    if (!global.RS) {return;}
    global.RS.renderQR = renderQR;
    global.RS.openQrOrderInPos = openQrOrderInPos;
  }
  if (global.RS) {attach();}
  document.addEventListener('rs:ready', attach);
  document.addEventListener('rs:hydrated', () => {
    try {
      if (global.RSSkel && RSSkel.markHydrated) {RSSkel.markHydrated();}
      renderQR();
    } catch (_) {}
  });
})(typeof window !== 'undefined' ? window : globalThis);



/* === assets/modules/tax-helpers.js === */
/* ============================================================
   RestroSuite — Tax rate resolution + tenant tax profile (Wave 12)
   Loaded before dashboard / pos-ui so RS_resolveRate is global.
   ============================================================ */
(function (global) {
  'use strict';

  const TAX_RATES = [];
  global.RS_TAX_RATES = TAX_RATES;

  function resolveRate(country, rateCode, dateStr) {
    const list = global.RS_TAX_RATES || [];
    const date = dateStr ? new Date(dateStr) : new Date();
    const matches = list.filter(
      (r) =>
        String(r.country).toUpperCase() === String(country || 'IN').toUpperCase() &&
        String(r.rateCode || r.rate_code).toUpperCase() === String(rateCode).toUpperCase()
    );
    const active = matches.find((r) => {
      const from = new Date(r.validFrom || r.valid_from);
      const to = r.validTo || r.valid_to ? new Date(r.validTo || r.valid_to) : null;
      return date >= from && (!to || date <= to);
    });
    if (active) {
      return {
        percent: Number(active.percent),
        itc_allowed: !!(active.itcAllowed || active.itc_allowed),
        label: active.label,
      };
    }
    if (String(country).toUpperCase() === 'IE') {
      if (rateCode === 'IE_FOOD_9' || rateCode === 'IE_FOOD_135') {
        const cutover = new Date('2026-07-01');
        return { percent: date >= cutover ? 9.0 : 13.5, itc_allowed: true, label: 'VAT Hot Food' };
      }
      if (rateCode === 'IE_DRINK_23') {return { percent: 23.0, itc_allowed: true, label: 'VAT Drinks' };}
      if (rateCode === 'IE_COLD_0') {return { percent: 0.0, itc_allowed: true, label: 'VAT Cold Takeaway' };}
      if (rateCode === 'IE_DELIVERY_23') {return { percent: 23.0, itc_allowed: true, label: 'VAT Delivery' };}
      if (rateCode === 'IE_ACCOM_135') {return { percent: 13.5, itc_allowed: true, label: 'VAT Accommodation' };}
    }
    if (String(country).toUpperCase() === 'IN') {
      if (rateCode === 'IN_REST_5') {return { percent: 5.0, itc_allowed: false, label: 'GST Standalone' };}
      if (rateCode === 'IN_REST_18') {return { percent: 18.0, itc_allowed: true, label: 'GST Specified' };}
      if (rateCode === 'IN_CATER_18') {return { percent: 18.0, itc_allowed: true, label: 'GST Catering' };}
      if (rateCode === 'IN_COMP_5') {return { percent: 5.0, itc_allowed: false, label: 'GST Composition' };}
      if (rateCode === 'IN_GOODS_5') {return { percent: 5.0, itc_allowed: false, label: 'GST Goods' };}
      if (rateCode === 'IN_GOODS_18') {return { percent: 18.0, itc_allowed: true, label: 'GST Goods' };}
      if (rateCode === 'IN_NIL_0') {return { percent: 0.0, itc_allowed: false, label: 'GST Nil Rated' };}
    }
    const m = String(rateCode).match(/_(\d+)(?:5)?$/);
    const pct = m ? Number(m[1]) : 5;
    return { percent: pct, itc_allowed: false, label: rateCode };
  }

  function getTenantTaxProfile() {
    const settings = global.RS_SETTINGS || {};

    let country = 'IN';
    if (settings.set_country) {
      const entry =
        (global.RS_getCountryByName && global.RS_getCountryByName(settings.set_country)) || null;
      if (entry) {
        country = entry.code;
      } else {
        const fallbackMap = {
          india: 'IN',
          ireland: 'IE',
          'united kingdom': 'GB',
          uk: 'GB',
          'great britain': 'GB',
          'united states': 'US',
          usa: 'US',
          australia: 'AU',
          canada: 'CA',
          'new zealand': 'NZ',
          singapore: 'SG',
          'united arab emirates': 'AE',
          uae: 'AE',
          'saudi arabia': 'SA',
          'south africa': 'ZA',
          germany: 'DE',
          france: 'FR',
          netherlands: 'NL',
          spain: 'ES',
          italy: 'IT',
          portugal: 'PT',
          belgium: 'BE',
          austria: 'AT',
          sweden: 'SE',
          denmark: 'DK',
          norway: 'NO',
          finland: 'FI',
          greece: 'GR',
          malaysia: 'MY',
          thailand: 'TH',
          vietnam: 'VN',
          indonesia: 'ID',
          philippines: 'PH',
          kenya: 'KE',
          nigeria: 'NG',
          ghana: 'GH',
          pakistan: 'PK',
          bangladesh: 'BD',
          'sri lanka': 'LK',
          nepal: 'NP',
        };
        country = fallbackMap[String(settings.set_country || '').toLowerCase()] || 'IN';
      }
    }

    const vatCountries = [
      'IE',
      'GB',
      'DE',
      'FR',
      'NL',
      'ES',
      'IT',
      'PT',
      'BE',
      'AT',
      'FI',
      'GR',
      'DK',
      'SE',
      'NO',
      'SA',
      'AE',
      'ZA',
      'KE',
      'NG',
      'GH',
      'PH',
      'TH',
      'ID',
    ];
    const salesTaxCodes = ['US'];
    let taxSystem;
    if (vatCountries.includes(country)) {taxSystem = 'VAT';}
    else if (salesTaxCodes.includes(country)) {taxSystem = 'Sales Tax';}
    else {taxSystem = 'GST';}

    if (settings.set_tax_label) {taxSystem = settings.set_tax_label;}

    let profile = {};
    try {
      if (settings.set_tax_profile) {
        profile =
          typeof settings.set_tax_profile === 'string'
            ? JSON.parse(settings.set_tax_profile)
            : settings.set_tax_profile;
      }
    } catch (e) {}
    return {
      country: country,
      tax_system: taxSystem,
      inclusive_pricing: !!settings.set_inclusive_pricing,
      tax_registration_no: settings.set_gstin || profile.tax_registration_no || '',
      gst_scheme: profile.gst_scheme || settings.set_gst_scheme || 'regular',
      state_code: settings.set_gst_state || profile.state_code || (country === 'IN' ? '07' : ''),
      specified_premises: !!(profile.specified_premises || settings.set_specified_premises),
      vat_filing_frequency: profile.vat_filing_frequency || 'bi_monthly',
      accounting_year_end: profile.accounting_year_end || null,
      apply_gst_on_service_charge: !!(
        profile.apply_gst_on_service_charge || settings.set_apply_gst_on_service_charge
      ),
      liquor_vat_rate: Number(settings.set_liquor_vat_rate || profile.liquor_vat_rate || 20),
    };
  }

  global.RS_resolveRate = resolveRate;
  global.RS_getTenantTaxProfile = getTenantTaxProfile;
  global.RSTax = {
    TAX_RATES,
    resolveRate,
    getTenantTaxProfile,
  };
})(typeof window !== 'undefined' ? window : globalThis);



/* === assets/modules/pos-ui.js === */
/* ============================================================
   RestroSuite — POS cart / menu grid / init (Wave 11 code-split)
   Owns cart state; dashboard + features-pos use RS.* APIs.
   ============================================================ */
(function (global) {
  'use strict';

  function toast(msg, icon) {
    if (global.RS && typeof RS.toast === 'function') {RS.toast(msg, icon);}
  }
  function rs(n) {
    if (global.RS && typeof RS.rs === 'function') {return RS.rs(n);}
    return '₹' + (Number(n) || 0).toLocaleString('en-IN');
  }
  function esc(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }
  const _e = esc;
  function $(sel, r) {
    return (r || document).querySelector(sel);
  }
  function $$(sel, r) {
    return Array.from((r || document).querySelectorAll(sel));
  }
  function getMenu() {
    return (global.RS && Array.isArray(RS.MENU) ? RS.MENU : []) || [];
  }

  /** Settings → Cashier can edit prices (default OFF). Owners/admins always may. */
  function canCashierEditPrice() {
    try {
      const sess = global.RS_API && RS_API.session && RS_API.session();
      const role = String((sess && sess.role) || sessionStorage.getItem('logged_in_role') || 'owner')
        .toLowerCase()
        .trim();
      if (['owner', 'admin', 'superadmin', 'brand_admin', 'manager'].includes(role)) {return true;}
      if (typeof global.RS_featureOn === 'function') {
        return global.RS_featureOn('set_cashier_can_edit_prices', global.RS_SETTINGS, false);
      }
      const v = (global.RS_SETTINGS || {}).set_cashier_can_edit_prices;
      return v === true || v === 'true' || v === 1 || v === '1';
    } catch (_) {
      return false;
    }
  }

  /** Calm cart chrome: hide pay/KOT/hold until there is at least one line */
  function updatePosCartChrome(isEmpty) {
    const cartEl = document.querySelector('#pos-tab .pos-cart') || document.querySelector('.pos-cart');
    const zone = document.getElementById('cart-pay-zone');
    const hint = document.getElementById('cart-empty-hint');
    const more = document.getElementById('cart-more-opts');
    if (cartEl) {cartEl.classList.toggle('pos-cart-empty', !!isEmpty);}
    if (zone) {
      zone.hidden = !!isEmpty;
      zone.setAttribute('aria-hidden', isEmpty ? 'true' : 'false');
      zone.style.display = isEmpty ? 'none' : '';
    }
    if (hint) {
      hint.hidden = !isEmpty;
      hint.style.display = isEmpty ? 'block' : 'none';
    }
    if (more) {
      // Keep discount/tip collapsed chrome quiet when empty
      if (isEmpty) {more.open = false;}
    }
    document.getElementById('pos-tab')?.classList.toggle('pos-cart-is-empty', !!isEmpty);
  }

  function maskPhoneForChip(phone) {
    const d = String(phone || '').replace(/\D/g, '');
    if (d.length < 4) {return phone || '';}
    if (d.length <= 10) {return '··' + d.slice(-4);}
    return '··' + d.slice(-4);
  }

  function syncCartCustomerChrome() {
    const btn = document.getElementById('cart-cust-toggle');
    const panel = document.getElementById('cart-cust-direct-inputs');
    const label = document.getElementById('cart-cust-toggle-label');
    const clearBtn = document.getElementById('cart-cust-clear');
    if (!btn || !panel) {return;}
    const name = ((document.getElementById('cust-input-name') || {}).value || '').trim();
    const phone = ((document.getElementById('cust-input-phone') || {}).value || '').trim();
    const hasCust = !!(name || phone);
    const open = btn.getAttribute('aria-expanded') === 'true';
    btn.classList.toggle('has-customer', hasCust);
    btn.classList.toggle('is-walkin', !hasCust);
    btn.classList.toggle('is-open', open);
    const hint = btn.querySelector('.cart-cust-hint');
    if (hint) {hint.style.display = hasCust ? 'none' : '';}
    if (label) {
      if (hasCust) {
        const phoneBit = phone ? maskPhoneForChip(phone) : '';
        label.textContent = (name || 'Guest') + (phoneBit ? ' · ' + phoneBit : '');
      } else {
        label.textContent = open ? 'Add details' : 'Walk-in';
      }
    }
    if (clearBtn) {
      clearBtn.hidden = !hasCust;
      clearBtn.style.display = hasCust ? '' : 'none';
    }
  }

  function setCartCustomerPanelOpen(open) {
    const btn = document.getElementById('cart-cust-toggle');
    const panel = document.getElementById('cart-cust-direct-inputs');
    if (!btn || !panel) {return;}
    btn.setAttribute('aria-expanded', open ? 'true' : 'false');
    if (open) {
      panel.hidden = false;
      panel.removeAttribute('hidden');
      panel.classList.add('is-open');
      panel.style.display = '';
      panel.style.pointerEvents = 'auto';
      panel.style.visibility = 'visible';
    } else {
      panel.hidden = true;
      panel.setAttribute('hidden', '');
      panel.classList.remove('is-open');
      panel.style.display = '';
      panel.style.pointerEvents = 'none';
      panel.style.visibility = 'hidden';
      const pop = document.getElementById('cust-search-popover');
      if (pop) {
        pop.style.display = 'none';
        pop.innerHTML = '';
      }
      // Blur phone widgets so country picker cannot keep intercepting cart clicks
      try {
        document.getElementById('cust-input-name')?.blur();
        document.getElementById('cust-input-phone')?.blur();
      } catch (_) {}
    }
    btn.classList.toggle('is-open', open);
    syncCartCustomerChrome();
  }

  function clearCartCustomer() {
    const sel = document.getElementById('cart-customer-sel');
    const nameEl = document.getElementById('cust-input-name');
    const phoneEl = document.getElementById('cust-input-phone');
    if (nameEl) {nameEl.value = '';}
    if (phoneEl) {phoneEl.value = '';}
    if (sel) {
      const tempOpt = sel.querySelector('option[data-temp="true"]');
      if (tempOpt) {tempOpt.remove();}
      sel.value = '';
      try { sel.dispatchEvent(new Event('change', { bubbles: true })); } catch (_) {}
    }
    const banner = document.getElementById('cart-customer-dues-banner');
    if (banner) {
      banner.style.display = 'none';
      banner.innerHTML = '';
    }
    setCartCustomerPanelOpen(false);
    syncCartCustomerChrome();
  }

  function wireCartCustomerToggle() {
    const btn = document.getElementById('cart-cust-toggle');
    const panel = document.getElementById('cart-cust-direct-inputs');
    if (!btn || !panel || btn.dataset.bound === '1') {return;}
    btn.dataset.bound = '1';

    // Ensure clear control sits beside toggle (chip row)
    if (!document.getElementById('cart-cust-clear')) {
      const clear = document.createElement('button');
      clear.type = 'button';
      clear.id = 'cart-cust-clear';
      clear.className = 'cart-cust-clear';
      clear.title = 'Clear customer';
      clear.setAttribute('aria-label', 'Clear customer');
      clear.innerHTML = '<i class="fa-solid fa-xmark"></i>';
      clear.hidden = true;
      clear.style.display = 'none';
      const row = btn.closest('.cart-cust-row') || btn.parentElement;
      if (row) {row.appendChild(clear);}
      else {btn.insertAdjacentElement('afterend', clear);}
      clear.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        clearCartCustomer();
        toast('Walk-in customer', 'fa-user');
      });
    }

    btn.addEventListener('click', () => {
      const open = btn.getAttribute('aria-expanded') !== 'true';
      setCartCustomerPanelOpen(open);
      if (open) {setTimeout(() => document.getElementById('cust-input-name')?.focus(), 40);}
    });
    ['cust-input-name', 'cust-input-phone'].forEach((id) => {
      document.getElementById(id)?.addEventListener('input', syncCartCustomerChrome);
    });
    // Clicking cart lines / pay foot closes customer so phone picker never blocks qty
    if (!document.body.dataset.cartCustOutsideBound) {
      document.body.dataset.cartCustOutsideBound = '1';
      document.addEventListener(
        'pointerdown',
        (e) => {
          const t = e.target;
          if (!t || !t.closest) {return;}
          if (t.closest('#custom-customer-widget')) {return;}
          if (t.closest('#cart-items, .cart-foot, #pos-grid, .order-type-btn')) {
            const open = btn.getAttribute('aria-expanded') === 'true';
            if (open) {setCartCustomerPanelOpen(false);}
          }
        },
        true
      );
    }
    // Stay collapsed by default (walk-in path).
    setCartCustomerPanelOpen(false);
  }
  function catColor(c) {
    if (global.RS && typeof RS.catColor === 'function') {return RS.catColor(c);}
    return 'var(--orange)';
  }
  function stockLabelMap() {
    return (global.RS && RS.stockLabel) || { ok: 'In stock', low: 'Low', out: 'Out' };
  }
  function stockClsMap() {
    return (global.RS && RS.stockCls) || { ok: 'stock-ok', low: 'stock-low', out: 'stock-out' };
  }
  function activateTab(id) {
    if (global.RS && typeof RS.activateTab === 'function') {return RS.activateTab(id);}
  }

  /* ---- Happy hour (time-window menu pricing) ---- */
  function parseHHMM(str) {
    const m = String(str || '').trim().match(/^(\d{1,2}):(\d{2})$/);
    if (!m) {return null;}
    const h = Number(m[1]);
    const mi = Number(m[2]);
    if (h > 23 || mi > 59) {return null;}
    return h * 60 + mi;
  }
  function isHappyHourActive() {
    const s = global.RS_SETTINGS || {};
    if (typeof global.RS_featureOn === 'function') {
      if (!global.RS_featureOn('set_happy_hour', s, false)) {return false;}
    } else if (!(s.set_happy_hour === true || s.set_happy_hour === 'true')) {
      return false;
    }
    const start = parseHHMM(s.set_happy_hour_start || '17:00');
    const end = parseHHMM(s.set_happy_hour_end || '20:00');
    if (start == null || end == null) {return false;}
    const now = new Date();
    const cur = now.getHours() * 60 + now.getMinutes();
    // Support overnight windows (e.g. 22:00–02:00)
    if (start <= end) {return cur >= start && cur < end;}
    return cur >= start || cur < end;
  }
  function happyHourPct() {
    const n = Number((global.RS_SETTINGS || {}).set_happy_hour_pct);
    return Number.isFinite(n) && n > 0 && n <= 90 ? n : 15;
  }
  function effectiveMenuPrice(m) {
    if (!m) {return 0;}
    const base = Number(m.price) || 0;
    if (!isHappyHourActive()) {return base;}
    if (m.happyHourPrice != null && m.happy_hour_price != null) {
      const hp = Number(m.happyHourPrice != null ? m.happyHourPrice : m.happy_hour_price);
      if (Number.isFinite(hp) && hp >= 0) {return hp;}
    }
    if (m.happyHourPrice != null) {
      const hp = Number(m.happyHourPrice);
      if (Number.isFinite(hp) && hp >= 0) {return hp;}
    }
    const pct = happyHourPct();
    return Math.round(base * (1 - pct / 100) * 100) / 100;
  }
  function paintHappyHourBanner() {
    const posTab = document.getElementById('pos-tab');
    if (!posTab) {return;}
    let ban = document.getElementById('rs-happy-hour-banner');
    const active = isHappyHourActive();
    if (!active) {
      if (ban) {ban.style.display = 'none';}
      return;
    }
    const s = global.RS_SETTINGS || {};
    const end = s.set_happy_hour_end || '20:00';
    const pct = happyHourPct();
    if (!ban) {
      ban = document.createElement('div');
      ban.id = 'rs-happy-hour-banner';
      ban.setAttribute('role', 'status');
      ban.style.cssText =
        'margin:0 0 10px;padding:8px 12px;border-radius:10px;border:1px solid rgba(255,79,0,.35);background:rgba(255,79,0,.1);font-size:12.5px;font-weight:700;color:var(--text);display:flex;align-items:center;gap:8px';
      const grid = document.getElementById('pos-grid');
      if (grid && grid.parentNode) {grid.parentNode.insertBefore(ban, grid);}
      else {posTab.insertBefore(ban, posTab.firstChild);}
    }
    ban.style.display = 'flex';
    ban.innerHTML = `<i class="fa-solid fa-bolt" style="color:var(--orange)"></i> Happy Hour · ${pct}% off menu until ${esc(end)}`;
  }

/* Singleton cart store — safety if this file is ever evaluated twice.
   Boot is single-path (critical.bundle only); store still protects HMR/dev reloads. */
const _pos = (global.__rsPosStore = global.__rsPosStore || {
  activeCat: 'All',
  cart: [],
  discountPct: 0,
  tipAmount: 0,
  loyaltyRedeem: 0,
  loyaltyPointsUsed: 0,
  activePromo: { code: '', pct: 0, fixed: 0, title: '', offerId: null },
  cartActionsDelegated: false,
});
let activeCat = _pos.activeCat;
/** Always the shared array reference (reassigned only via replaceCart). */
let cart = _pos.cart;
let discountPct = _pos.discountPct;
let tipAmount = _pos.tipAmount;
let loyaltyRedeem = _pos.loyaltyRedeem;
let loyaltyPointsUsed = _pos.loyaltyPointsUsed;
/** @type {{ code: string, pct: number, fixed: number, title: string, offerId: string|null }} */
let activePromo = _pos.activePromo || { code: '', pct: 0, fixed: 0, title: '', offerId: null };
function replaceCart(next) {
  const arr = Array.isArray(next) ? next : [];
  _pos.cart = arr;
  cart = _pos.cart;
}
function syncPosScalars() {
  _pos.activeCat = activeCat;
  _pos.discountPct = discountPct;
  _pos.tipAmount = tipAmount;
  _pos.loyaltyRedeem = loyaltyRedeem;
  _pos.loyaltyPointsUsed = loyaltyPointsUsed;
  _pos.activePromo = activePromo;
}
const renderPOS = () => {
  paintHappyHourBanner();
  const grid = $('#pos-grid');
  if (!grid) {return;}
  const q = ($('#pos-search-input')?.value||'').toLowerCase();
  const sortMode = ($('#pos-sort-select') && $('#pos-sort-select').value) || 'popular';
  let items = getMenu().filter(m=>{
    const mc = ((m.cat || '').trim() || 'Uncategorized').toLowerCase();
    if (activeCat === '__specials__') {
      return !!(m.isSpecial || m.special) && (m.name||'').toLowerCase().includes(q);
    }
    if (activeCat === '__staples__') {
      const staple = !!(m.isStaple || m.staple) || /roti|chapati|naan|rice|paratha/i.test(String(m.name||''));
      return staple && (m.name||'').toLowerCase().includes(q);
    }
    return (activeCat==='All'||mc===String(activeCat).toLowerCase()) && (m.name||'').toLowerCase().includes(q);
  });
  if (global.RSMenuIntel && typeof RSMenuIntel.sortMenu === 'function') {
    items = RSMenuIntel.sortMenu(items, sortMode);
  } else if (sortMode === 'popular' || sortMode === 'default') {
    items = items.slice().sort((a, b) => (Number(b.orderCount)||0) - (Number(a.orderCount)||0) || String(a.name||'').localeCompare(String(b.name||'')));
  } else if (sortMode === 'name-asc') {
    items = items.slice().sort((a, b) => String(a.name||'').localeCompare(String(b.name||'')));
  } else if (sortMode === 'name-desc') {
    items = items.slice().sort((a, b) => String(b.name||'').localeCompare(String(a.name||'')));
  } else if (sortMode === 'price-asc') {
    items = items.slice().sort((a, b) => (Number(a.price)||0) - (Number(b.price)||0));
  } else if (sortMode === 'price-desc') {
    items = items.slice().sort((a, b) => (Number(b.price)||0) - (Number(a.price)||0));
  } else if (sortMode === 'veg-first') {
    items = items.slice().sort((a, b) => (b.veg?1:0) - (a.veg?1:0));
  } else if (sortMode === 'nonveg-first') {
    items = items.slice().sort((a, b) => (a.veg?1:0) - (b.veg?1:0));
  }
  // Search miss → always offer custom item
  const showCustomCta = !!q && !items.length;
  const hh = isHappyHourActive();
  // 10/10 card: veg + name + price. Category only on All/search. Stock only low/out.
  const showCat = activeCat === 'All' || activeCat === '__specials__' || activeCat === '__staples__' || !!q;
  grid.innerHTML = (showCustomCta
    ? `<div class="pos-item" id="pos-custom-miss" style="border:1.5px dashed var(--orange);grid-column:1/-1;min-height:72px;display:flex;align-items:center;justify-content:center;gap:10px;cursor:pointer">
        <i class="fa-solid fa-pen-to-square" style="color:var(--orange)"></i>
        <span style="font-weight:700">No match for “${_e(q)}” — add custom item with price</span>
      </div>`
    : '') + items.map(m=>{
    const inCart = cart.find(c=>String(c.id)===String(m.id));
    const base = Number(m.price) || 0;
    const eff = effectiveMenuPrice(m);
    const stock = m.stock || 'ok';
    const deal = hh && eff < base;
    const showStock = stock === 'low' || stock === 'out';
    const priceHtml = deal
      ? `<span class="pprice pprice-deal">${rs(eff)} <small class="pprice-was">${rs(base)}</small></span>`
      : `<span class="pprice">${rs(base)}</span>`;
    const badges = [
      m.isSpecial || m.special ? '<span class="pos-hh-chip" style="background:#7c3aed">Special</span>' : '',
      m.bestseller ? '<span class="pos-hh-chip">Best</span>' : '',
      m.isStaple || m.staple ? '<span class="pos-hh-chip" style="background:#0891b2">Staple</span>' : '',
    ].join('');
    return `
    <div class="pos-item ${stock==='out'?'out':''} ${inCart?'in-cart':''}${deal ? ' hh-deal' : ''}" data-id="${_e(m.id)}" style="--cc:${catColor(m.cat)}">
      ${inCart ? `<div class="pos-item-qty-badge bounce-scale" aria-label="${inCart.qty} in cart">${inCart.qty}</div>` : ''}
      <div class="pi-top">
        <span class="veg ${m.veg ? '' : 'nonveg'}" title="${m.veg ? 'Veg' : 'Non-veg'}" aria-hidden="true"></span>
        ${showCat ? `<span class="picat">${_e(m.cat || 'Uncategorized')}</span>` : ''}
      </div>
      <div class="pname">${_e(m.name)}</div>
      <div class="prow">
        ${priceHtml}
        ${showStock ? `<span class="stock-dot ${stockClsMap()[stock]}">${stockLabelMap()[stock]}</span>` : ''}
        ${deal ? '<span class="pos-hh-chip">HH</span>' : ''}
        ${badges}
      </div>
    </div>`;
  }).join('');
  $$('.pos-item', grid).forEach(el=> {
    if (el.id === 'pos-custom-miss') {
      el.addEventListener('click', () => {
        if (global.RSMenuIntel && RSMenuIntel.openCustomCartItem) {
          RSMenuIntel.openCustomCartItem({ name: q });
        }
      });
      return;
    }
    el.addEventListener('click', ()=> addToCartSmart(el.dataset.id));
  });
};
async function addToCartSmart(id) {
  const m = getMenu().find(x => String(x.id) === String(id));
  if (!m) {return;}
  // Add-ons
  let addons = [];
  try {
    if (global.RSMenuIntel && RSMenuIntel.itemAddons && RSMenuIntel.itemAddons(m).length) {
      addons = await RSMenuIntel.promptAddons(m);
    }
  } catch (_) {}
  addToCart(id);
  // Attach add-on lines
  if (addons && addons.length) {
    addons.forEach((a) => {
      cart.push({
        id: 'addon-' + id + '-' + a.name,
        name: a.name + ' (add-on)',
        price: Number(a.price) || 0,
        qty: 1,
        veg: true,
        cat: 'Add-on',
        isAddon: true,
        parentId: id,
        stock: 'ok',
      });
    });
    renderCart();
  }
  // Water pairing for roti/chapati etc.
  try {
    if (sessionStorage.getItem('rs_skip_water_prompt') === '1') {return;}
    if (global.RSMenuIntel && RSMenuIntel.promptWaterPairing) {
      const w = await RSMenuIntel.promptWaterPairing(m);
      if (w) {
        if (w.free || !(Number(w.price) > 0)) {
          // complimentary — note on line only
          const line = cart.find(c => String(c.id) === String(id));
          if (line) {
            line.note = (line.note ? line.note + ' · ' : '') + 'Normal water';
            renderCart();
          }
        } else {
          cart.push({
            id: 'water-bottle-' + Date.now(),
            name: w.name,
            price: Number(w.price) || 0,
            qty: 1,
            veg: true,
            cat: 'Beverages',
            isWater: true,
            stock: 'ok',
          });
          renderCart();
          toast(w.name + ' added', 'fa-glass-water');
        }
      }
    }
  } catch (_) {}
}
function refreshPosCats(){
  const catsEl = $('#pos-cats');
  if (!catsEl) {return;}
  const menu = getMenu();
  const hasSpecials = menu.some(m => m.isSpecial || m.special);
  const hasStaples = menu.some(m => m.isStaple || m.staple || /roti|chapati|naan|rice|paratha/i.test(String(m.name||'')));
  const liveCats = ['All']
    .concat(hasSpecials ? ['__specials__'] : [])
    .concat(hasStaples ? ['__staples__'] : [])
    .concat(Array.from(new Set(
      menu.map(m => (m.cat || '').trim() || 'Uncategorized')
    )).sort((a, b) => a.localeCompare(b)));
  const catLabel = (c) => c === '__specials__' ? '★ Specials' : c === '__staples__' ? '🍚 Staples' : c;
  if (!liveCats.some(c => String(c).toLowerCase() === String(activeCat).toLowerCase())) {activeCat = 'All';}
  catsEl.innerHTML = liveCats.map(c=>`<button class="pos-cat-btn ${String(c).toLowerCase()===String(activeCat).toLowerCase()?'active':''}" data-cat="${_e(c)}">${_e(catLabel(c))}</button>`).join('');
  $$('#pos-cats .pos-cat-btn').forEach(b=> b.addEventListener('click',()=>{
    activeCat=b.dataset.cat;
    $$('#pos-cats .pos-cat-btn').forEach(x=>x.classList.toggle('active',x===b));
    renderPOS();
    const container = document.getElementById('pos-cats');
    if (container) {
      container.scrollTo({
        left: (b.offsetLeft + b.clientWidth / 2) - container.clientWidth / 2,
        behavior: 'smooth'
      });
    }
  }));
}
window.refreshPosCats = refreshPosCats;
let lastMobileCartOpenAt = 0;
function updateMobileCartBar(countArg, totalsArg){
  const barCount = $('#pos-m-cart-bar-count');
  const barTotal = $('#pos-m-cart-bar-total');
  const cartBar = $('#pos-m-cart-bar');
  if (!barCount || !barTotal || !cartBar) {return;}
  const count = countArg != null ? countArg : cart.reduce((a,c)=>a+c.qty,0);
  const totals = totalsArg || getTotals();
  barCount.textContent = count + (count === 1 ? ' item' : ' items');
  barTotal.textContent = rs(totals.grand);
  const posActive = !!document.querySelector('#pos-tab.active');
  const cartViewOpen = !!document.querySelector('.pos-cart.active');
  const shouldShow = count > 0 && window.innerWidth <= 1024 && posActive && !cartViewOpen;
  cartBar.classList.toggle('hidden', !shouldShow);
}
function openMobilePOSCart(e){
  if (e) {
    e.preventDefault();
    e.stopPropagation();
  }
  const now = Date.now();
  if (now - lastMobileCartOpenAt < 250) {return;}
  lastMobileCartOpenAt = now;
  if (window.innerWidth > 1024 || !cart.length) {return;}
  const posLeft = $('.pos-left');
  const posCart = $('.pos-cart');
  const cartBar = $('#pos-m-cart-bar');
  if (!posLeft || !posCart || !cartBar) {return;}
  posLeft.classList.add('hidden');
  posCart.classList.add('active', 'rs10-cart-sheet');
  cartBar.classList.add('hidden');
  // Lock page scroll so only the cart sheet scrolls (not menu behind)
  document.body.classList.add('rs10-cart-open', 'pos-mobile-cart-open');
  try {
    const items = posCart.querySelector('#cart-items, .cart-items');
    if (items) {items.scrollTop = 0;}
  } catch (_) {}
}
function closeMobilePOSCart(showBar = true){
  const posLeft = $('.pos-left');
  const posCart = $('.pos-cart');
  const cartBar = $('#pos-m-cart-bar');
  if (!posLeft || !posCart || !cartBar) {return;}
  posLeft.classList.remove('hidden');
  posCart.classList.remove('active', 'rs10-cart-sheet');
  document.body.classList.remove('rs10-cart-open', 'pos-mobile-cart-open');
  if (showBar) {updateMobileCartBar();}
  else {cartBar.classList.add('hidden');}
}
function bindMobileCartBar(){
  const cartBar = $('#pos-m-cart-bar');
  if (!cartBar || cartBar.dataset.rsBound) {return;}
  cartBar.dataset.rsBound = '1';
  cartBar.addEventListener('click', openMobilePOSCart);
  cartBar.addEventListener('pointerup', openMobilePOSCart);
  cartBar.addEventListener('keydown', e => {
    if (e.key === 'Enter' || e.key === ' ') {openMobilePOSCart(e);}
  });
}
function addToCart(id, opts){
  cart = _pos.cart;
  opts = opts || {};
  const m=getMenu().find(x=>String(x.id)===String(id));
  if (!m) {return;}
  const portion = opts.portion != null ? Number(opts.portion) : 1; // 0.5 half · 1 full · 2 double
  const pFactor = portion > 0 ? portion : 1;
  // Harder recipe/cost/stock checks
  try {
    const health =
      global.RSRecipeUnits && RSRecipeUnits.recipeHealth
        ? RSRecipeUnits.recipeHealth(m, INVENTORY)
        : null;
    if (health && !health.ok) {
      if (health.code === 'no_recipe') {
        if (global.RSKitchenLinkCoach && typeof RSKitchenLinkCoach.posUnlinkedHint === 'function') {
          RSKitchenLinkCoach.posUnlinkedHint(m.name);
        } else {
          toast('“' + m.name + '” has no recipe — stock will not reduce', 'fa-link');
        }
      } else if (health.code === 'no_cost') {
        toast('Recipe cost incomplete — set unit costs on stock', 'fa-indian-rupee-sign');
      } else if (health.code === 'missing_stock') {
        toast('Recipe stock missing: ' + (health.missing || []).slice(0, 2).join(', '), 'fa-triangle-exclamation');
      }
    }
    if (Array.isArray(m.ingredients) && m.ingredients.length && INVENTORY.length) {
      const short = m.ingredients.filter(ing => {
        let need = Number(ing.qty) || 0;
        if (global.RSRecipeUnits && RSRecipeUnits.deductQtyForIngredient) {
          need = RSRecipeUnits.deductQtyForIngredient(ing, m, 1, pFactor, INVENTORY);
        } else {
          const base = Math.max(1, Number(m.recipeServings) || 1);
          need = (need / base) * pFactor;
        }
        const inv = INVENTORY.find(i => i.name === ing.name);
        return inv && (Number(inv.stock) || 0) < need;
      });
      if (short.length) {
        toast(`Low stock for ${short.map(s => s.name).slice(0,2).join(', ')}`, 'fa-triangle-exclamation');
      }
    }
  } catch (_) {}
  const listPrice = Number(m.price) || 0;
  const effFull = effectiveMenuPrice(m);
  const basePrice = listPrice;
  const price = Math.round(effFull * pFactor * 100) / 100;
  const hh = isHappyHourActive() && effFull < listPrice;
  // Match same dish + same portion + same unit price
  const line = cart.find(
    (c) =>
      String(c.id) === String(id) &&
      Number(c.portion || 1) === pFactor &&
      Number(c.price) === price
  );
  if (line) {line.qty++;}
  else {
    cart.push({
      ...m,
      qty: 1,
      price,
      basePrice,
      fullPrice: effFull,
      portion: pFactor,
      servings: pFactor, // inventory deduction multiplier
      happyHour: hh,
    });
  }
  try { if (global.RSActionFeedback) {global.RSActionFeedback.click();} } catch (_) {}
  renderCart();
  const pLab = pFactor === 0.5 ? '½' : pFactor === 2 ? '×2' : '';
  toast(
    hh
      ? `${m.name} · Happy Hour ${rs(price)}`
      : `${m.name}${pLab ? ' ' + pLab : ''} added`,
    hh ? 'fa-bolt' : 'fa-plus'
  );
}
function changeQty(id,d){
  cart = _pos.cart;
  // Prefer line matching data-line-key if present via event — fallback first match by id
  const line = cart.find((c) => String(c.id) === String(id));
  if (!line) {return;}
  line.qty += d;
  if (line.qty <= 0) {replaceCart(cart.filter((c) => c !== line));}
  renderCart();
}
function setLinePortion(lineKey, portion) {
  cart = _pos.cart;
  const p = Number(portion);
  if (!(p > 0)) {return;}
  const line =
    cart.find((c) => cartLineKey(c) === String(lineKey)) ||
    cart.find((c) => String(c.id) === String(lineKey));
  if (!line) {return;}
  const full = Number(line.fullPrice != null ? line.fullPrice : line.basePrice != null ? line.basePrice : line.price) || 0;
  line.portion = p;
  line.servings = p;
  line.price = Math.round(full * p * 100) / 100;
  renderCart();
  toast(
    (line.name || 'Item') + (p === 0.5 ? ' · half' : p === 2 ? ' · double' : ' · full'),
    'fa-utensils'
  );
}
function cartLineKey(c) {
  return String(c.id) + '|' + String(c.portion || 1) + '|' + String(c.price);
}
function setLineNote(id, note) {
  const line = cart.find((c) => String(c.id) === String(id));
  if (!line) {return false;}
  const text = String(note == null ? '' : note).trim().slice(0, 140);
  line.note = text;
  if (!text) {delete line.note;}
  try {
    renderCart();
  } catch (_) {}
  return true;
}
function getLineNote(id) {
  const line = cart.find((c) => String(c.id) === String(id));
  return line && line.note ? String(line.note) : '';
}
function openLineNoteEditor(id) {
  const line = cart.find((c) => String(c.id) === String(id));
  if (!line) {return;}
  const chips = ['No onion', 'Extra spicy', 'Less oil', 'Well done', 'No ice', 'Pack separate'];
  if (!global.RSModal) {
    const n = window.prompt('Kitchen note for ' + (line.name || 'item'), line.note || '');
    if (n != null) {setLineNote(id, n);}
    return;
  }
  global.RSModal.open({
    title: 'Kitchen note',
    sub: line.name || 'Item',
    icon: 'fa-comment',
    size: 'sm',
    body: `<div style="display:flex;flex-direction:column;gap:10px">
      <input type="text" id="line-note-input" class="form-input" maxlength="140" placeholder="e.g. No onion, less spicy…" value="${_e(line.note || '')}" style="width:100%;height:36px;font-size:13px">
      <div style="display:flex;flex-wrap:wrap;gap:6px" id="line-note-chips">
        ${chips
          .map(
            (c) =>
              `<button type="button" class="btn btn-ghost btn-sm" data-chip="${_e(c)}" style="font-size:11px;height:28px;padding:0 10px">${_e(c)}</button>`
          )
          .join('')}
      </div>
      <p style="font-size:11.5px;color:var(--text-soft);margin:0">Prints on KOT / kitchen display and appears under the item on the bill.</p>
    </div>`,
    foot:
      '<button class="btn btn-ghost" style="flex:1" data-ln-clear>Clear</button>' +
      '<button class="btn btn-ghost" style="flex:1" data-ln-x>Cancel</button>' +
      '<button class="btn btn-primary" style="flex:1" data-ln-ok><i class="fa-solid fa-check"></i> Save</button>',
    onMount(m, close) {
      const inp = m.querySelector('#line-note-input');
      m.querySelectorAll('[data-chip]').forEach((btn) => {
        btn.onclick = () => {
          const chip = btn.getAttribute('data-chip') || '';
          if (!inp) {return;}
          const cur = (inp.value || '').trim();
          if (!cur) {inp.value = chip;}
          else if (cur.toLowerCase().includes(chip.toLowerCase())) {return;}
          else {inp.value = cur + ', ' + chip;}
          inp.focus();
        };
      });
      const x = m.querySelector('[data-ln-x]');
      if (x) {x.onclick = close;}
      const cl = m.querySelector('[data-ln-clear]');
      if (cl)
        {cl.onclick = () => {
          setLineNote(id, '');
          close();
          toast('Note cleared', 'fa-comment');
        };}
      const ok = m.querySelector('[data-ln-ok]');
      if (ok)
        {ok.onclick = () => {
          setLineNote(id, inp ? inp.value : '');
          close();
          toast(inp && inp.value.trim() ? 'Kitchen note saved' : 'Note cleared', 'fa-comment');
        };}
      if (inp) {setTimeout(() => { inp.focus(); inp.select?.(); }, 40);}
    },
  });
}
function renderCart(){
  cart = _pos.cart;
  const wrap=$('#cart-items'); const count=cart.reduce((a,c)=>a+c.qty,0);
  const countEl = $('#cart-count');
  // Symbol chrome: show count number only (title has "items")
  if (countEl) {
    countEl.textContent = String(count);
    countEl.parentElement && countEl.parentElement.setAttribute('title', count + (count === 1 ? ' item' : ' items'));
  }
  try { syncTablePaxForOrderType(); } catch (_) {}

  const totals = getTotals();
  const isIncl = totals.taxProfile.inclusive_pricing;
  const taxLabel = totals.taxProfile.tax_system || 'GST';
  const settings = window.RS_SETTINGS || {};

  // Plain labels — Sub / Tax / Total always scannable (10/10 readability)
  let metaHTML = `<span title="Subtotal">Sub <b id="t-sub">${rs(totals.sub)}</b></span>`;
  if (totals.disc > 0) {
    metaHTML += `<span style="color:var(--orange)" title="Discount">Disc <b id="t-disc">- ${rs(totals.disc)}</b></span>`;
  }
  if (totals.promo > 0) {
    metaHTML += `<span style="color:var(--orange)" title="Promo${totals.promoCode ? ' ' + _e(totals.promoCode) : ''}">Promo <b id="t-promo">- ${rs(totals.promo)}</b></span>`;
  }
  if (totals.serviceCharge > 0) {
    metaHTML += `<span title="Service charge">SC <b id="t-sc">${rs(totals.serviceCharge)}</b></span>`;
  }
  if (totals.tip > 0) {
    metaHTML += `<span style="color:var(--green)" title="Tip">Tip <b id="t-tip">${rs(totals.tip)}</b></span>`;
  }
  if (totals.deliveryCharge > 0) {
    metaHTML += `<span title="Delivery">Del <b id="t-del">${rs(totals.deliveryCharge)}</b></span>`;
  }
  if (totals.loyaltyRedeem > 0) {
    metaHTML += `<span style="color:var(--violet-soft)" title="Loyalty">Pts <b id="t-loyal">- ${rs(totals.loyaltyRedeem)}</b></span>`;
  }

  // Hide Tax/GST cart line when Calculate taxes is OFF (simple café default).
  // Default OFF; only show when ON and cart has items / real tax amount.
  const rawTaxFlag = settings.set_calculate_taxes;
  const taxesOn =
    rawTaxFlag === false || rawTaxFlag === 'false' || rawTaxFlag === 0 || rawTaxFlag === '0'
      ? false
      : typeof global.RS_featureOn === 'function'
        ? global.RS_featureOn('set_calculate_taxes', settings, false)
        : rawTaxFlag === true || rawTaxFlag === 'true' || rawTaxFlag === 1 || rawTaxFlag === '1';
  const showTaxLine = taxesOn && (count > 0 || Number(totals.gst) > 0);
  if (taxesOn && totals.taxProfile.gst_scheme === 'composition' && totals.taxProfile.country === 'IN' && count > 0) {
    metaHTML += '<span style="font-size:10px;color:var(--text-mute)" title="Composition scheme">Comp</span>';
  } else if (showTaxLine) {
    const taxShort = String(taxLabel || 'Tax').length > 4 ? 'Tax' : taxLabel;
    metaHTML += `<span id="t-gst-wrap" title="${_e(taxLabel)}${isIncl ? ' inclusive' : ''}">${_e(taxShort)}${isIncl ? '*' : ''} <b id="t-gst">${rs(totals.gst)}</b></span>`;
  }

  if (taxesOn && totals.liquorTax > 0) {
    metaHTML += `<span title="Liquor tax">Liquor <b id="t-liquor-tax">${rs(totals.liquorTax)}</b></span>`;
  }

  // Drive CSS nuclear hide (works even if an old shell left hard-coded GST in HTML)
  try {
    document.documentElement.classList.toggle('rs-taxes-on', !!taxesOn);
    document.documentElement.classList.toggle('rs-cart-has-items', count > 0);
    document.documentElement.classList.toggle('rs-hide-cart-tax', !showTaxLine);
  } catch (_) {}

  const metaDiv = document.querySelector('.totals-meta') || document.getElementById('cart-totals-meta');
  if (metaDiv) {
    metaDiv.innerHTML = metaHTML;
    // Scrub any leftover GST node if taxes should be hidden
    if (!showTaxLine) {
      metaDiv.querySelectorAll('#t-gst-wrap, #t-gst').forEach((el) => {
        try {
          const wrap = el.id === 't-gst' ? el.parentElement : el;
          if (wrap && wrap !== metaDiv) {wrap.remove();}
          else {el.remove();}
        } catch (_) {}
      });
      // Remove bare "Tax" / "GST" spans from old HTML
      Array.from(metaDiv.querySelectorAll('span')).forEach((sp) => {
        const t = (sp.getAttribute('title') || '') + ' ' + (sp.textContent || '');
        if (/\b(GST|Tax|CGST|SGST)\b/i.test(t) && !/Subtotal|Discount|Promo|Service|Tip|Delivery|Loyalty|Pts/i.test(t)) {
          try { sp.remove(); } catch (_) {}
        }
      });
    }
  }

  $('#t-grand').textContent=rs(totals.grand);

  updateMobileCartBar(count, totals);

  if(!cart.length){ wrap.innerHTML='<div class="cart-empty"><i class="fa-solid fa-cart-shopping"></i><div>Cart is empty<br><span style="font-size:12px">Tap menu items to add them</span></div></div>'; }
  else { wrap.innerHTML = cart.map(c=>{
    const p = Number(c.portion || 1);
    const lk = cartLineKey(c);
    const noRec = !Array.isArray(c.ingredients) || !c.ingredients.length;
    return `
    <div class="cart-line${c.note ? ' has-note' : ''}${noRec ? ' cart-line-norecipe' : ''}" data-line-id="${_e(c.id)}" data-line-key="${_e(lk)}" title="Long-press for kitchen note">
      <div class="cdot" style="--cc:${catColor(c.cat)}"></div>
      <div class="cinfo">
        <div class="cn-row">
          <span class="cn">${_e(c.name)}${c.happyHour ? ' <span class="cart-hh">HH</span>' : ''}${noRec ? ' <span class="cart-nr" title="No recipe — stock won\'t move">⚠</span>' : ''}</span>
          <span class="cp cart-unit-price" data-lk="${_e(lk)}" title="Unit price${canCashierEditPrice() ? ' · tap to edit' : ''}" style="${canCashierEditPrice() ? 'cursor:pointer;text-decoration:underline dotted' : ''}">${rs(c.price)}${c.happyHour && c.basePrice != null && c.basePrice > c.price ? ' <s class="cp-was">' + rs(c.basePrice) + '</s>' : ''}</span>
        </div>
        <div class="cart-portion" role="group" aria-label="Portion size">
          <button type="button" class="cart-p-btn${p===0.5?' active':''}" data-portion="0.5" data-lk="${_e(lk)}" title="Half portion · half stock">½</button>
          <button type="button" class="cart-p-btn${p===1?' active':''}" data-portion="1" data-lk="${_e(lk)}" title="Full">Full</button>
          <button type="button" class="cart-p-btn${p===2?' active':''}" data-portion="2" data-lk="${_e(lk)}" title="Double · 2× stock">×2</button>
        </div>
        ${c.note ? `<button type="button" class="cnote cart-line-note" data-note-id="${_e(c.id)}" title="Edit kitchen note"><i class="fa-solid fa-comment" aria-hidden="true"></i> ${_e(c.note)}</button>` : ''}
      </div>
      <div class="qty"><button type="button" data-d="-1" data-id="${_e(c.id)}" data-lk="${_e(lk)}" aria-label="Decrease"><i class="fa-solid fa-minus"></i></button><span class="qn">${c.qty}</span><button type="button" data-d="1" data-id="${_e(c.id)}" data-lk="${_e(lk)}" aria-label="Increase"><i class="fa-solid fa-plus"></i></button></div>
      <div class="cline-total">${rs(c.price*c.qty)}</div>
    </div>`;
  }).join('');
    $$('#cart-items .qty button').forEach(b=> b.addEventListener('click',(e)=>{
      e.stopPropagation();
      const lk = b.getAttribute('data-lk');
      const line = lk ? cart.find((c) => cartLineKey(c) === lk) : cart.find((c) => String(c.id) === String(b.dataset.id));
      if (!line) {return;}
      line.qty += +b.dataset.d;
      if (line.qty <= 0) {replaceCart(cart.filter((c) => c !== line));}
      renderCart();
    }));
    $$('#cart-items .cart-p-btn').forEach((b) =>
      b.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        setLinePortion(b.getAttribute('data-lk'), b.getAttribute('data-portion'));
      })
    );
    $$('#cart-items .cart-unit-price').forEach((el) =>
      el.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        if (!canCashierEditPrice()) {
          toast('Price edit is off — enable in Settings → Team', 'fa-lock');
          return;
        }
        const lk = el.getAttribute('data-lk');
        const line = lk ? cart.find((c) => cartLineKey(c) === lk) : null;
        if (!line) {return;}
        const cur = Number(line.price) || 0;
        const raw = window.prompt('Unit price for ' + (line.name || 'item'), String(cur));
        if (raw == null) {return;}
        const next = Math.max(0, Math.round((Number(raw) || 0) * 100) / 100);
        if (!Number.isFinite(next)) {
          toast('Enter a valid price', 'fa-circle-exclamation');
          return;
        }
        line.price = next;
        line.fullPrice = next;
        line.basePrice = next;
        line.priceOverridden = true;
        renderCart();
        toast('Price updated', 'fa-indian-rupee-sign');
      })
    );
    $$('#cart-items .cart-line-note').forEach((b) =>
      b.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        openLineNoteEditor(b.getAttribute('data-note-id'));
      })
    );
    // Long-press / double-click line body → kitchen note (keeps default row clean)
    $$('#cart-items .cart-line').forEach((row) => {
      let pressTimer = null;
      const id = row.getAttribute('data-line-id');
      const startPress = (e) => {
        if (e.target.closest('.qty, .cart-line-note')) {return;}
        pressTimer = setTimeout(() => {
          pressTimer = null;
          openLineNoteEditor(id);
        }, 480);
      };
      const clearPress = () => {
        if (pressTimer) {
          clearTimeout(pressTimer);
          pressTimer = null;
        }
      };
      row.addEventListener('pointerdown', startPress);
      row.addEventListener('pointerup', clearPress);
      row.addEventListener('pointerleave', clearPress);
      row.addEventListener('pointercancel', clearPress);
      row.addEventListener('dblclick', (e) => {
        if (e.target.closest('.qty, .cart-line-note')) {return;}
        e.preventDefault();
        openLineNoteEditor(id);
      });
    });
  }

  try { if(window.RSPOS && window.RSPOS.refreshPaymentPanel) {window.RSPOS.refreshPaymentPanel();} } catch (e) {}
  // Never leave Print & Pay stuck grey when cart has lines (stale empty-cart gate)
  try {
    const checkoutBtn = document.getElementById('btn-checkout');
    if (checkoutBtn && cart.length > 0) {
      checkoutBtn.disabled = false;
      const reason = checkoutBtn.dataset.blockReason || '';
      if (
        checkoutBtn.getAttribute('aria-disabled') === 'true' &&
        (!reason || /add items|cart is empty|empty cart/i.test(reason))
      ) {
        checkoutBtn.removeAttribute('aria-disabled');
        checkoutBtn.classList.remove('is-blocked');
        delete checkoutBtn.dataset.blockReason;
        checkoutBtn.title = 'Print bill and take payment';
      }
    }
  } catch (_) {}
  wireCartActions();
  try { updatePosCartChrome(cart.length === 0); } catch (e) {}

  // Refresh POS Grid to update card badges
  try { renderPOS(); } catch (e) {}

  // Auto-save active cart to localStorage (per order type)
  try {
    const activeOrderTypeBtn = document.querySelector('.order-type-btn.active');
    const activeOrderType = activeOrderTypeBtn ? activeOrderTypeBtn.textContent.trim() : 'Takeaway';
    // Helper function to get tab key (same as in initPOS)
    const getTabKeyForOrderType = (orderTypeText) => {
      const lowerText = orderTypeText.toLowerCase();
      if (lowerText.includes('delivery')) {return 'Delivery';}
      if (lowerText.includes('dine')) {return 'Dine-in';}
      return 'Takeaway';
    };
    const tabKey = getTabKeyForOrderType(activeOrderType);
    const da = document.getElementById('delivery-address');
    const dc = document.getElementById('delivery-charge');
    const dr = document.getElementById('delivery-rider');
    // Save per-order-type cart
    localStorage.setItem('rs_tab_cart_' + tabKey, JSON.stringify({
      items: cart.map(c=>({...c})),
      total: cart.reduce((a,c)=>a+c.price*c.qty,0),
      deliveryAddress: da ? da.value : '',
      deliveryCharge: dc ? dc.value : '',
      deliveryRider: dr ? dr.value : ''
    }));
    // Also save to old key for backwards compatibility
    localStorage.setItem('rs_active_cart', JSON.stringify(cart));
    localStorage.setItem('rs_active_cart_discount', String(discountPct));
    localStorage.setItem('rs_active_cart_tip', String(tipAmount || 0));
    localStorage.setItem('rs_active_cart_customer', JSON.stringify(getCustomer()));
    localStorage.setItem('rs_active_order_type', activeOrderType.toLowerCase());
  } catch (e) {
    console.warn('[Cart Persistence Warning] Failed to persist active cart:', e);
  }

  // Keep Floor table status in sync while cart has dine-in items
  try {
    scheduleFloorOccupancyFromCart();
  } catch (_) {}
}

/** Debounced: cart + table selected → pending_orders so Floor shows Dining everywhere */
let __floorOccTimer = null;
let __floorOccId = null;
function scheduleFloorOccupancyFromCart() {
  if (__floorOccTimer) {clearTimeout(__floorOccTimer);}
  __floorOccTimer = setTimeout(() => {
    syncFloorOccupancyFromCart().catch((e) =>
      console.warn('[floor occupancy]', e)
    );
  }, 500);
}

async function syncFloorOccupancyFromCart() {
  if (!window.RS_DB || typeof RS_DB.put !== 'function') {return;}
  let cust = {};
  try {
    cust = typeof getCustomer === 'function' ? getCustomer() : {};
  } catch (_) {
    cust = {};
  }
  // Prefer live select value (getCustomer can lag after seat-from-floor)
  let tableRaw = '';
  try {
    const sel = document.getElementById('cart-table');
    tableRaw = String((sel && sel.value) || cust.table || '').trim();
  } catch (_) {
    tableRaw = String(cust.table || '').trim();
  }
  if (!tableRaw || /walk-?in|take\s*away|takeaway/i.test(tableRaw)) {
    return;
  }
  // Any real table selection with cart items marks Dining on floor.
  // (Default POS order-type is Takeaway — do not require staff to toggle Dine-in.)
  const looksLikeTable =
    /table/i.test(tableRaw) ||
    /^\d{1,4}[A-Za-z]?$/.test(tableRaw) ||
    /^t[\s.-]*\d+/i.test(tableRaw);
  let isDine = looksLikeTable;
  try {
    const btn = document.querySelector('.order-type-btn.active');
    const t = (btn && (btn.textContent || btn.getAttribute('aria-label') || btn.title || '')) || '';
    if (/dine/i.test(t)) {isDine = true;}
    if (/deliver/i.test(t) && !/dine/i.test(t) && !looksLikeTable) {isDine = false;}
  } catch (_) {}
  if (!isDine) {return;}

  // When a table is selected, force dine-in chrome so floor + cart stay consistent
  try {
    if (looksLikeTable) {
      const cartEl = document.querySelector('.pos-cart');
      if (cartEl) {cartEl.classList.add('is-dinein');}
      const btns = document.querySelectorAll('.order-type-btn');
      btns.forEach((b) => {
        const lab = (b.textContent || b.getAttribute('aria-label') || b.title || '').toLowerCase();
        if (lab.includes('dine')) {b.classList.add('active');}
        else if (lab.includes('take') || lab.includes('deliv')) {b.classList.remove('active');}
      });
    }
  } catch (_) {}

  const items = (cart || []).map((c) => ({
    id: c.id || c.name,
    name: c.name,
    qty: Number(c.qty) || 1,
    price: Number(c.price) || 0,
    notes: c.note || c.notes || '',
    note: c.note || c.notes || '',
  }));
  if (!items.length) {return;}

  let totals = { grand: 0, sub: 0, gst: 0, disc: 0 };
  try {
    totals = getTotals() || totals;
  } catch (_) {}

  const dig = (v) => parseInt(String(v == null ? '' : v).replace(/\D/g, ''), 10);
  const tableDig = dig(tableRaw);
  const rows = await RS_DB.list('pending_orders').catch(() => []);
  const active = (rows || []).filter((r) => {
    const tn = String(r.tableNumber || r.table || '');
    const same =
      tn === tableRaw ||
      tn.toLowerCase() === tableRaw.toLowerCase() ||
      (Number.isFinite(tableDig) && dig(tn) === tableDig);
    if (!same) {return false;}
    const st = String(r.status || '');
    const oid = String(r.orderId || r.id || '');
    return (
      st === 'DineIn Active' ||
      st === 'Accepted' ||
      st === 'preparing' ||
      st === 'Pending Review' ||
      st === 'Billed' ||
      st === 'Ready' ||
      st === 'served' ||
      r.source === 'floor_seat' ||
      r.source === 'pos_cart' ||
      oid.indexOf('cart_') === 0 ||
      oid.indexOf('seat_') === 0
    );
  });

  // Prefer our cart-driven row, else any seat placeholder, else create
  const row =
    active.find(
      (r) =>
        r.source === 'pos_cart' ||
        String(r.orderId || '').indexOf('cart_') === 0 ||
        String(r.id || '').indexOf('cart_') === 0
    ) ||
    active.find(
      (r) =>
        r.source === 'floor_seat' ||
        String(r.orderId || '').indexOf('seat_') === 0
    ) ||
    active[0] ||
    null;

  const covers = Math.max(0, Number(cust.covers != null ? cust.covers : 0) || 0);
  const orderKey =
    (row && (row.orderId || row.id)) ||
    __floorOccId ||
    'cart_' + Date.now() + '_' + Math.random().toString(36).slice(2, 6);

  if (row && row.id != null) {
    const next = {
      ...row,
      // Keep cloud bigint id when present; keep logical orderId for matching
      orderId: row.orderId || orderKey,
      tableNumber: tableRaw,
      table: tableRaw,
      items,
      subtotal: totals.sub,
      gst: totals.gst,
      total: totals.grand,
      customerName: cust.name || row.customerName || '',
      customerPhone: cust.phone || row.customerPhone || '',
      covers: covers || row.covers || 0,
      pax: covers || row.pax || 0,
      orderType: 'Dine-in',
      // Keep kitchen status if already sent; otherwise show as active on floor
      status:
        row.status === 'Pending Review' ||
        row.status === 'Accepted' ||
        row.status === 'preparing' ||
        row.status === 'Ready' ||
        row.status === 'served' ||
        row.status === 'Billed'
          ? row.status
          : 'DineIn Active',
      source: row.source === 'waiter_pos' || row.source === 'qr' ? row.source : row.source || 'pos_cart',
      dateTime: row.dateTime || new Date().toISOString(),
    };
    try {
      const saved = await RS_DB.put('pending_orders', row.id, next);
      __floorOccId = (saved && saved.id != null ? saved.id : row.id);
    } catch (e) {
      console.warn('[floor occupancy] update failed', e);
    }
  } else {
    const logicalId = String(orderKey);
    const next = {
      // Do NOT set numeric-only id — let cloud identity allocate; dual-write uses orderId
      orderId: logicalId,
      tableNumber: tableRaw,
      table: tableRaw,
      status: 'DineIn Active',
      items,
      subtotal: totals.sub,
      gst: totals.gst,
      total: totals.grand,
      customerName: cust.name || '',
      customerPhone: cust.phone || '',
      covers,
      pax: covers,
      orderType: 'Dine-in',
      paymentMethod: 'Cash',
      dateTime: new Date().toISOString(),
      priority: 'normal',
      source: 'pos_cart',
    };
    try {
      // Pass logical id so local cache can key it; CLOUD path strips non-numeric PK
      const saved = await RS_DB.put('pending_orders', logicalId, next);
      __floorOccId = saved && saved.id != null ? saved.id : logicalId;
    } catch (e) {
      console.warn('[floor occupancy] create failed', e);
    }
  }

  try {
    document.dispatchEvent(new Event('rs:tables-updated'));
  } catch (_) {}
  try {
    if (window.RS_SYNC && typeof RS_SYNC.syncPendingOrders === 'function') {
      RS_SYNC.syncPendingOrders({ forceCloud: true });
    }
  } catch (_) {}
}

function getTotals(){
  // Always read shared cart (double-load safety)
  cart = _pos.cart;
  const settings = window.RS_SETTINGS || {};
  const taxProfile = window.RS_getTenantTaxProfile ? window.RS_getTenantTaxProfile() : { country: 'IN', tax_system: 'GST', gst_scheme: 'regular', specified_premises: false };
  const country = taxProfile.country;

  let channel = 'dine_in';
  const activeTypeBtn = document.querySelector('.order-type-btn.active');
  if (activeTypeBtn) {
    const t = activeTypeBtn.textContent.trim().toLowerCase();
    if (t.includes('dine')) {channel = 'dine_in';}
    else if (t.includes('take') || t.includes('carry')) {channel = 'takeaway';}
    else if (t.includes('deliv')) {channel = 'delivery';}
  }

  const featureOn = (k, fb) =>
    typeof global.RS_featureOn === 'function'
      ? global.RS_featureOn(k, settings, fb)
      : (settings[k] === true || settings[k] === 'true' || (fb && settings[k] == null));
  const calculateTaxesEnabled = featureOn('set_calculate_taxes', false);
  const serviceChargeEnabled = featureOn('set_service_charge', false) && channel === 'dine_in';
  const scPctRaw = Number(settings.set_service_charge_pct);
  const serviceChargePct = Number.isFinite(scPctRaw) && scPctRaw >= 0 ? scPctRaw : 5;
  const roundOffEnabled = featureOn('set_round_off_totals', true);
  const inclusivePricing = featureOn('set_inclusive_pricing', false);

  const rawSubtotal = cart.reduce((a,c)=>a+c.price*c.qty,0);
  const discAmount = Math.round(rawSubtotal * discountPct / 100);
  const netAfterDiscount = rawSubtotal - discAmount;

  // Delivery fee from cart field (shown for Delivery order type)
  let deliveryCharge = 0;
  try {
    const dcEl = document.getElementById('delivery-charge');
    if (dcEl && (channel === 'delivery' || (Number(dcEl.value) || 0) > 0)) {
      deliveryCharge = Math.max(0, Number(dcEl.value) || 0);
    }
  } catch (_) {}

  let serviceChargeAmount = 0;
  if (serviceChargeEnabled && serviceChargePct > 0) {
    serviceChargeAmount = Math.round(netAfterDiscount * (serviceChargePct / 100));
  }
  const tip = Math.max(0, Number(tipAmount) || 0);
  const loyaltyOff = Math.max(0, Number(loyaltyRedeem) || 0);
  let promoOff = 0;
  if (activePromo.fixed > 0) {
    promoOff = Math.min(activePromo.fixed, Math.max(0, netAfterDiscount));
  } else if (activePromo.pct > 0) {
    promoOff = Math.round(Math.max(0, netAfterDiscount) * (activePromo.pct / 100));
  }

  const items = cart.map(c => {
    const lineGross = c.price * c.qty;
    const lineDisc = Math.round(lineGross * discountPct / 100);
    const lineTaxableBase = lineGross - lineDisc;

    let lineServiceCharge = 0;
    if (serviceChargeEnabled && rawSubtotal > 0) {
      lineServiceCharge = Math.round(serviceChargeAmount * (lineTaxableBase / netAfterDiscount));
    }

    let lineTaxableValue = lineTaxableBase;
    if (serviceChargeEnabled && taxProfile.apply_gst_on_service_charge) {
      lineTaxableValue += lineServiceCharge;
    }

    let rateCode = c.taxCategory || c.tax_category;
    if (!rateCode) {
      if (country === 'IE') {
        rateCode = 'IE_FOOD_9';
      } else {
        if (taxProfile.gst_scheme === 'composition') {
          rateCode = 'IN_COMP_5';
        } else if (taxProfile.specified_premises) {
          rateCode = 'IN_REST_18';
        } else {
          rateCode = 'IN_REST_5';
        }
      }
    }

    const resolved = window.RS_resolveRate(country, rateCode);
    const taxPercent = resolved.percent;
    const isAlcohol = (rateCode === 'IN_ALCOHOL_EXEMPT');
    let liquorTax = 0;
    let tax = 0;

    if (isAlcohol) {
      const liquorRate = taxProfile.liquor_vat_rate || 20;
      if (inclusivePricing) {
        liquorTax = Number((lineTaxableValue - (lineTaxableValue / (1 + liquorRate/100))).toFixed(2));
        lineTaxableValue = Number((lineTaxableValue - liquorTax).toFixed(2));
      } else {
        liquorTax = Number((lineTaxableValue * (liquorRate / 100)).toFixed(2));
      }
    } else {
      if (calculateTaxesEnabled) {
        if (inclusivePricing) {
          tax = Number((lineTaxableValue - (lineTaxableValue / (1 + taxPercent/100))).toFixed(2));
          lineTaxableValue = Number((lineTaxableValue - tax).toFixed(2));
        } else {
          tax = Number((lineTaxableValue * (taxPercent / 100)).toFixed(2));
        }
      }
    }

    return {
      ...c,
      lineGross,
      lineDisc,
      lineTaxableValue,
      taxPercent,
      tax,
      liquorTax,
      rateCode,
      serviceCharge: lineServiceCharge,
      itcAllowed: resolved.itc_allowed,
      label: resolved.label
    };
  });

  const bandMap = {};
  let totalGst = 0;
  let totalLiquorTax = 0;
  let totalTaxableValue = 0;

  items.forEach(item => {
    totalGst += item.tax;
    totalLiquorTax += item.liquorTax;
    totalTaxableValue += item.lineTaxableValue;

    // Only build tax bands when taxes are ON and there is actual tax/VAT.
    // Old bug: `taxPercent >= 0` always true → empty CGST/SGST/SAC on every receipt.
    if (calculateTaxesEnabled && (item.tax > 0 || item.liquorTax > 0)) {
      const key = item.rateCode;
      if (!bandMap[key]) {
        bandMap[key] = {
          rateCode: key,
          label: item.label,
          percent: item.taxPercent,
          net: 0,
          tax: 0,
          gross: 0,
          itcAllowed: item.itcAllowed
        };
      }
      bandMap[key].net += item.lineTaxableValue;
      bandMap[key].tax += item.tax + item.liquorTax;
      bandMap[key].gross += item.lineTaxableValue + item.tax + item.liquorTax;
    }
  });

  const taxSummary = calculateTaxesEnabled
    ? Object.values(bandMap).map(b => ({
        rateCode: b.rateCode,
        label: b.label,
        percent: Number(b.percent.toFixed(2)),
        net: Number(b.net.toFixed(2)),
        tax: Number(b.tax.toFixed(2)),
        gross: Number(b.gross.toFixed(2)),
        itcAllowed: b.itcAllowed
      }))
    : [];

  let cgst = 0;
  let sgst = 0;
  const igst = 0;
  if (country === 'IN' && taxProfile.gst_scheme !== 'composition') {
    cgst = Number((totalGst / 2).toFixed(2));
    sgst = Number((totalGst - cgst).toFixed(2));
  }

  let grand = netAfterDiscount - promoOff + serviceChargeAmount + tip + deliveryCharge - loyaltyOff;
  if (!inclusivePricing) {
    grand += totalGst + totalLiquorTax;
  }
  if (grand < 0) {grand = 0;}

  if (roundOffEnabled) {
    grand = Math.round(grand);
  } else {
    grand = Number(grand.toFixed(2));
  }

  return {
    sub: rawSubtotal,
    disc: discAmount,
    promo: promoOff,
    promoCode: activePromo.code || '',
    promoTitle: activePromo.title || '',
    promoPct: activePromo.pct || 0,
    promoOfferId: activePromo.offerId || null,
    gst: totalGst,
    cgst,
    sgst,
    igst,
    liquorTax: totalLiquorTax,
    serviceCharge: serviceChargeAmount,
    serviceChargePct,
    tip,
    deliveryCharge,
    loyaltyRedeem: loyaltyOff,
    loyaltyPointsUsed: loyaltyPointsUsed || 0,
    covers: getCovers(),
    pax: getCovers(),
    grand,
    count: cart.reduce((a,c)=>a+c.qty,0),
    discountPct,
    taxSummary,
    taxProfile,
    channel,
    items
  };
}
function clearPromo() {
  activePromo = { code: '', pct: 0, fixed: 0, title: '', offerId: null };
  const pe = document.getElementById('promo-input');
  if (pe) {pe.value = '';}
  const badge = document.getElementById('promo-applied-badge');
  if (badge) {
    badge.style.display = 'none';
    badge.textContent = '';
  }
}
function setPromo(p) {
  activePromo = {
    code: (p && p.code) || '',
    pct: Math.max(0, Number(p && p.pct) || 0),
    fixed: Math.max(0, Number(p && p.fixed) || 0),
    title: (p && p.title) || '',
    offerId: (p && p.offerId) || null,
  };
  const pe = document.getElementById('promo-input');
  if (pe && activePromo.code) {pe.value = activePromo.code;}
  const badge = document.getElementById('promo-applied-badge');
  if (badge) {
    if (activePromo.code) {
      badge.style.display = '';
      const off =
        activePromo.fixed > 0
          ? rs(activePromo.fixed)
          : activePromo.pct + '%';
      badge.textContent = activePromo.code + ' · ' + off;
    } else {
      badge.style.display = 'none';
      badge.textContent = '';
    }
  }
  try {
    renderCart();
  } catch (_) {}
}
function getPromo() {
  return { ...activePromo };
}
function clearCart(){
  replaceCart([]);
  discountPct=0; tipAmount=0; loyaltyRedeem=0; loyaltyPointsUsed=0;
  syncPosScalars();
  clearPromo();
  setCovers(0);
  const d=$('#disc-input'); if(d) {d.value='';}
  const tipEl=$('#tip-input'); if(tipEl) {tipEl.value='';}
  renderCart();
  if (window.innerWidth <= 1024) {closeMobilePOSCart(false);}
}
function getCovers() {
  const el = document.getElementById('cart-covers');
  if (!el) {return 0;}
  const n = Math.floor(Number(el.value));
  if (!Number.isFinite(n) || n < 0) {return 0;}
  return Math.min(99, n);
}
function setCovers(n) {
  const el = document.getElementById('cart-covers');
  const v = Math.max(0, Math.min(99, Math.floor(Number(n) || 0)));
  if (el) {el.value = v > 0 ? String(v) : '';}
  return v;
}
function getCustomer(){
  const nameEl = $('#cust-input-name') || $('#cust-name');
  const phoneEl = $('#cust-input-phone') || $('#cust-phone');
  const gstEl = $('#cust-gst');
  const covers = getCovers();

  let phoneVal = '';
  if (phoneEl) {
    phoneVal = window.RS_getFullPhoneNumber ? window.RS_getFullPhoneNumber(phoneEl) : phoneEl.value;
  }

  const sel = $('#cart-customer-sel');
  if (sel && sel.value) {
    const opt = sel.options[sel.selectedIndex];
    const selPhone = sel.value;
    const finalPhone = (selPhone.startsWith('temp-') || !selPhone.startsWith('+')) ? phoneVal.trim() : selPhone.trim();
    return {
      name: opt.getAttribute('data-name') || '',
      phone: finalPhone,
      gst: opt.getAttribute('data-gst') || '',
      table: ($('#cart-table')?.value || 'Walk-in / Takeaway'),
      covers,
      pax: covers,
    };
  }
  return {
    name: (nameEl?.value || '').trim(),
    phone: phoneVal.trim(),
    gst: (gstEl?.value || '').trim(),
    table: ($('#cart-table')?.value || 'Walk-in / Takeaway'),
    covers,
    pax: covers,
  };
}
function runKotAction(){
  if(!cart.length) {return toast('Cart is empty','fa-circle-exclamation');}
  try {
    if(window.RSPOS && window.RSPOS.kot) {
      try { if (global.RSActionFeedback) {global.RSActionFeedback.success();} } catch (_) {}
      return window.RSPOS.kot();
    }
  } catch (err) {
    console.error('[KOT Error]', err);
    try { if (global.RSActionFeedback) {global.RSActionFeedback.error();} } catch (_) {}
    return toast('KOT Error: ' + err.message, 'fa-circle-exclamation');
  }
  toast('KOT sent to kitchen','fa-fire');
}
function runCheckoutAction(){
  if(!cart.length) {return toast('Cart is empty','fa-circle-exclamation');}
  try {
    if(window.RSPOS && window.RSPOS.checkout) {
      try { if (global.RSActionFeedback) {global.RSActionFeedback.success();} } catch (_) {}
      return window.RSPOS.checkout();
    }
  } catch (err) {
    console.error('[Checkout Error]', err);
    try { if (global.RSActionFeedback) {global.RSActionFeedback.error();} } catch (_) {}
    return toast('Checkout Error: ' + err.message, 'fa-circle-exclamation');
  }
  // RSPOS module not loaded -- do not silently show false success
  return toast('Checkout module not ready -- please refresh', 'fa-circle-exclamation');
}
function ensureCartActionDelegation(){
  // Shared flag — avoid double document listeners when pos-ui loads twice
  if (_pos.cartActionsDelegated) {return;}
  _pos.cartActionsDelegated = true;
  document.addEventListener('click', e => {
    const btn = e.target.closest('#btn-kot, #btn-checkout');
    if (!btn) {return;}
    // features-pos owns these actions when its guarded handler is active.
    // Keep this listener only as a fallback for partial/module-load failures.
    if (document.documentElement.dataset.rsPosActionsBound) {return;}
    e.preventDefault();
    // Soft-blocked (empty cart / cash short): prefer features-pos checkout which explains why
    if (btn.id === 'btn-checkout') {
      if (btn.disabled || btn.getAttribute('aria-disabled') === 'true') {
        if (window.RSPOS && typeof window.RSPOS.checkout === 'function') {return window.RSPOS.checkout();}
      }
      return runCheckoutAction();
    }
    if (btn.id === 'btn-kot') {return runKotAction();}
  });
}
function wireCartActions(){
  ensureCartActionDelegation();
  const kotBtn = $('#btn-kot');
  if (kotBtn) {kotBtn.onclick = null;}
  const checkoutBtn = $('#btn-checkout');
  if (checkoutBtn) {checkoutBtn.onclick = null;}
}
// POS init (static parts present in HTML, wire them)
function syncTablePaxForOrderType() {
  const active = document.querySelector('.order-type-btn.active');
  const t = (active && active.textContent || '').toLowerCase();
  const dineIn = t.includes('dine');
  const delivery = t.includes('deliv');
  const cartEl = document.querySelector('.pos-cart');
  if (cartEl) {
    cartEl.classList.toggle('is-dinein', dineIn);
    cartEl.classList.toggle('is-delivery', delivery);
  }
  const row = document.getElementById('cart-table-pax-row');
  if (row) {
    // Takeaway/delivery: hide table+pax clutter (walk-in default)
    row.style.display = dineIn ? 'grid' : 'none';
    row.classList.toggle('is-visible', dineIn);
  }
}

function initPOS(){
  try { wireCartCustomerToggle(); } catch (_) {}
  try { updatePosCartChrome(!cart || cart.length === 0); } catch (_) {}
  try { syncTablePaxForOrderType(); } catch (_) {}
  // Refresh happy-hour banner periodically (window can start/end mid-shift)
  if (!global.__rsHappyHourTick) {
    global.__rsHappyHourTick = true;
    setInterval(() => {
      try {
        const tab = document.getElementById('pos-tab');
        if (tab && tab.classList.contains('active')) {
          paintHappyHourBanner();
          // Re-render prices if HH state flipped
          if (document.getElementById('pos-grid')) {renderPOS();}
        }
      } catch (_) {}
    }, 60000);
  }
  // Helper function to get tab key for an order type (fixed, not dependent on table number)
  function getTabKeyForOrderType(orderTypeText) {
    const lowerText = orderTypeText.toLowerCase();
    if (lowerText.includes('delivery')) {return 'Delivery';}
    if (lowerText.includes('dine')) {return 'Dine-in';}
    return 'Takeaway';
  }

  // Load saved active order type and corresponding cart
  try {
    // Load saved active order type
    const savedOrderType = localStorage.getItem('rs_active_order_type');
    let activeOrderTypeBtn = document.querySelector('.order-type-btn.active');

    // If we have a saved order type, activate that button first
    if (savedOrderType) {
      const btns = document.querySelectorAll('.order-type-btn');
      let matched = false;
      btns.forEach(b => {
        const match = b.textContent.trim().toLowerCase() === savedOrderType.toLowerCase();
        b.classList.toggle('active', match);
        if (match) {
          activeOrderTypeBtn = b;
          matched = true;
        }
      });
      // Fallback: activate first button if no match
      if (!matched && btns.length) {
        btns[0].classList.add('active');
        activeOrderTypeBtn = btns[0];
      }
    } else if (!activeOrderTypeBtn) {
      // No active button and no saved type, activate first button
      const btns = document.querySelectorAll('.order-type-btn');
      if (btns.length) {
        btns[0].classList.add('active');
        activeOrderTypeBtn = btns[0];
      }
    }

    // Now load the cart for the active order type
    const activeOrderType = activeOrderTypeBtn ? activeOrderTypeBtn.textContent.trim() : 'Takeaway';
    const initialTabKey = getTabKeyForOrderType(activeOrderType);
    const savedTabCart = localStorage.getItem('rs_tab_cart_' + initialTabKey);
    if (savedTabCart) {
      const tabData = JSON.parse(savedTabCart);
      replaceCart(tabData.items || []);
      // Also load delivery-specific fields if applicable
      const da = document.getElementById('delivery-address');
      const dc = document.getElementById('delivery-charge');
      const dr = document.getElementById('delivery-rider');
      if (da) {da.value = tabData.deliveryAddress || '';}
      if (dc) {dc.value = tabData.deliveryCharge || '';}
      if (dr) {dr.value = tabData.deliveryRider || '';}
    } else {
      // Fall back to the old active cart key if no tab-specific cart exists
      const savedCart = localStorage.getItem('rs_active_cart');
      if (savedCart) {
        try { replaceCart(JSON.parse(savedCart)); } catch (_) { replaceCart([]); }
      }
    }
    const savedDiscount = localStorage.getItem('rs_active_cart_discount');
    if (savedDiscount) {
      discountPct = Number(savedDiscount) || 0;
      const discInput = $('#disc-input');
      if (discInput) {discInput.value = discountPct;}
    }
    const savedTip = localStorage.getItem('rs_active_cart_tip');
    if (savedTip) {
      tipAmount = Math.max(0, Number(savedTip) || 0);
      const tipInput = $('#tip-input');
      if (tipInput) {tipInput.value = tipAmount > 0 ? tipAmount : '';}
    }
    const savedCustomer = localStorage.getItem('rs_active_cart_customer');
    if (savedCustomer) {
      const customer = JSON.parse(savedCustomer);
      const cartTable = $('#cart-table');
      if (cartTable && customer.table) {cartTable.value = customer.table;}
      const custName = $('#cust-input-name') || $('#cust-name');
      if (custName && customer.name) {custName.value = customer.name;}
      const custPhone = $('#cust-input-phone') || $('#cust-phone');
      if (custPhone && customer.phone) {custPhone.value = customer.phone;}
      const custGst = $('#cust-gst');
      if (custGst && customer.gst) {custGst.value = customer.gst;}
    }
  } catch (e) {
    console.warn('[Cart Persistence Warning] Failed to load saved cart:', e);
  }

  // -- Mount country-code prefix picker on cart customer phone --
  (function mountCartPhonePicker() {
    const phoneEl = document.getElementById('cust-input-phone');
    if (!phoneEl || phoneEl.dataset.phonePrefixBuilt) {return;}
    const settings = window.RS_SETTINGS || {};
    let countryCode = 'IN';
    if (settings.set_country && window.RS_getCountryByName) {
      const entry = window.RS_getCountryByName(settings.set_country);
      if (entry) {countryCode = entry.code;}
    }
    if (window.RS_buildPhonePrefix) {
      window.RS_buildPhonePrefix(phoneEl, countryCode);
    }
  })();

  // Category chips are derived from the live menu, including custom categories.
  refreshPosCats();
  $('#pos-search-input').addEventListener('input', renderPOS);
  if ($('#pos-sort-select')) {$('#pos-sort-select').addEventListener('change', renderPOS);}
  // Manual / off-menu cart item
  (function wireCustomItemBtn() {
    const head = document.querySelector('.cart-head-actions') || document.querySelector('.pos-toolbar-secondary');
    if (!head || document.getElementById('btn-custom-cart-item')) {return;}
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.id = 'btn-custom-cart-item';
    btn.className = 'btn btn-ghost btn-sm';
    btn.title = 'Add custom item not on menu';
    btn.innerHTML = '<i class="fa-solid fa-pen-to-square"></i>';
    btn.addEventListener('click', (e) => {
      e.preventDefault();
      if (global.RSMenuIntel && RSMenuIntel.openCustomCartItem) {RSMenuIntel.openCustomCartItem();}
      else {toast('Custom item module loading…', 'fa-circle-info');}
    });
    head.insertBefore(btn, head.firstChild);
  })();
  // Expose cart helpers for menu-intelligence custom lines
  function setCart(next) {
    if (Array.isArray(next)) {replaceCart(next);}
    renderCart();
  }
  function addCustomLine(line) {
    if (!line) {return;}
    cart.push(line);
    renderCart();
  }
  global.RSPOS = Object.assign(global.RSPOS || {}, {
    setCart,
    addCustomLine,
    getCart: () => cart.slice(),
    renderCart,
  });
  if (global.RS) {
    global.RS.getCart = () => cart.slice();
    global.RS.setCart = setCart;
    global.RS.renderCart = renderCart;
  }
  document.addEventListener('rs:ready', () => {
    if (global.RS) {
      global.RS.getCart = () => cart.slice();
      global.RS.setCart = setCart;
      global.RS.renderCart = renderCart;
    }
  });
  $$('.order-type-btn').forEach(b=> b.addEventListener('click',()=>{
    // Snapshot the outgoing tab's cart to localStorage before the active class changes,
    // so the per-tab fallback always has the latest data even without RS_DB.
    try {
      const curActiveBtn = document.querySelector('.order-type-btn.active');
      if (curActiveBtn && curActiveBtn !== b) {
        const outType = curActiveBtn.textContent.trim().toLowerCase();
        const tabKey = getTabKeyForOrderType(curActiveBtn.textContent.trim());
        const da = document.getElementById('delivery-address');
        const dc = document.getElementById('delivery-charge');
        const dr = document.getElementById('delivery-rider');
        localStorage.setItem('rs_tab_cart_' + tabKey, JSON.stringify({
          items: cart.map(c=>({...c})),
          total: cart.reduce((a,c)=>a+c.price*c.qty,0),
          deliveryAddress: da ? da.value : '',
          deliveryCharge: dc ? dc.value : '',
          deliveryRider: dr ? dr.value : ''
        }));
        const nameEl = document.getElementById('cust-input-name') || document.getElementById('cust-name');
        const phoneEl = document.getElementById('cust-input-phone') || document.getElementById('cust-phone');
        localStorage.setItem('rs_tab_cust_' + tabKey, JSON.stringify({
          name: nameEl ? nameEl.value.trim() : '',
          phone: phoneEl ? phoneEl.value.trim() : ''
        }));

        // Now load the new tab's cart!
        const newTabKey = getTabKeyForOrderType(b.textContent.trim());
        // Save new active order type
        localStorage.setItem('rs_active_order_type', b.textContent.trim().toLowerCase());
        const savedNewTabCart = localStorage.getItem('rs_tab_cart_' + newTabKey);
        if (savedNewTabCart) {
          const newTabData = JSON.parse(savedNewTabCart);
          replaceCart(newTabData.items || []);
          // Load delivery fields if applicable
          if (da) {da.value = newTabData.deliveryAddress || '';}
          if (dc) {dc.value = newTabData.deliveryCharge || '';}
          if (dr) {dr.value = newTabData.deliveryRider || '';}
        } else {
          replaceCart([]); // If no saved cart for new tab, start fresh!
          // Clear delivery fields too
          if (da) {da.value = '';}
          if (dc) {dc.value = '';}
          if (dr) {dr.value = '';}
        }

        // Load the new tab's customer data
        const savedNewTabCust = localStorage.getItem('rs_tab_cust_' + newTabKey);
        if (savedNewTabCust) {
          const newCustData = JSON.parse(savedNewTabCust);
          const nameEl = document.getElementById('cust-input-name') || document.getElementById('cust-name');
          const phoneEl = document.getElementById('cust-input-phone') || document.getElementById('cust-phone');
          if (nameEl) {nameEl.value = newCustData.name || '';}
          if (phoneEl) {phoneEl.value = newCustData.phone || '';}
        }

        // Re-render the cart!
        renderCart();
      }
    } catch(e) {
      console.error('[Order Type Switch Error]', e);
    }
    $$('.order-type-btn').forEach(x=>x.classList.remove('active')); b.classList.add('active');
    try { syncTablePaxForOrderType(); } catch (_) {}
  }));
  let lastAuthorizedDiscount = 0;
  function wireTipControls() {
    const tipInput = $('#tip-input');
    if (tipInput && !tipInput.dataset.bound) {
      tipInput.dataset.bound = '1';
      tipInput.addEventListener('input', () => {
        tipAmount = Math.max(0, Number(tipInput.value) || 0);
        renderCart();
      });
    }
    document.querySelectorAll('[data-tip-pct]').forEach((btn) => {
      if (btn.dataset.bound) {return;}
      btn.dataset.bound = '1';
      btn.addEventListener('click', () => {
        const pct = Number(btn.dataset.tipPct) || 0;
        const totals = getTotals();
        // base for % tip = sub - disc (before tip)
        const base = Math.max(0, (totals.sub || 0) - (totals.disc || 0));
        tipAmount = pct <= 0 ? 0 : Math.round(base * (pct / 100));
        if (tipInput) {tipInput.value = tipAmount > 0 ? tipAmount : '';}
        renderCart();
      });
    });
  }
  wireTipControls();

  // Delivery charge recalculates cart total live
  const delChargeEl = document.getElementById('delivery-charge');
  if (delChargeEl && !delChargeEl.dataset.boundTotals) {
    delChargeEl.dataset.boundTotals = '1';
    delChargeEl.addEventListener('input', () => {
      try {
        renderCart();
      } catch (_) {}
    });
  }

  $('#disc-input')?.addEventListener('input', e=>{
    const val = Math.min(100,Math.max(0,+e.target.value||0));
    if (val <= 10) {
      discountPct = val;
      renderCart();
    }
  });
  $('#disc-input')?.addEventListener('change', async e=>{
    const val = Math.min(100,Math.max(0,+e.target.value||0));
    const thr = Number((window.RS_SETTINGS || {}).set_pin_discount_threshold);
    const discThr = Number.isFinite(thr) && thr > 0 ? thr : 10;
    if (val > discThr) {
      if (val === lastAuthorizedDiscount) {
        discountPct = val;
        renderCart();
        return;
      }
      if (window.RSPinModal) {
        e.target.disabled = true;
        const ok = typeof RSPinModal.require === 'function'
          ? await RSPinModal.require('Discount override · ' + val + '%', {
              settingKey: 'set_pin_gate_discount',
              always: true,
            })
          : await RSPinModal.request('Discount Override');
        e.target.disabled = false;
        if (ok) {
          discountPct = val;
          lastAuthorizedDiscount = val;
          renderCart();
          toast('Discount override approved', 'fa-percent');
        } else {
          e.target.value = discountPct > 0 ? discountPct : '';
          toast('Discount override rejected', 'fa-circle-xmark');
          renderCart();
        }
      } else {
        discountPct = val;
        renderCart();
      }
    } else {
      discountPct = val;
      lastAuthorizedDiscount = val;
      renderCart();
    }
  });
  $('#btn-kot').onclick = () => {
    if(!cart.length) {return toast('Cart is empty','fa-circle-exclamation');}
    try {
      if(window.RSPOS && window.RSPOS.kot) {return window.RSPOS.kot();}
    } catch (err) {
      console.error('[KOT Error]', err);
      return toast('KOT Error: ' + err.message, 'fa-circle-exclamation');
    }
    toast('KOT sent to kitchen','fa-fire');
  };
  $('#btn-checkout').onclick = () => {
    if(!cart.length) {return toast('Cart is empty','fa-circle-exclamation');}
    try {
      if(window.RSPOS && window.RSPOS.checkout) {return window.RSPOS.checkout();}
    } catch (err) {
      console.error('[Checkout Error]', err);
      return toast('Checkout Error: ' + err.message, 'fa-circle-exclamation');
    }
    return toast('Checkout module not ready -- please refresh', 'fa-circle-exclamation');
  };

  // Grid size slider controls
  const slider = $('#pos-grid-slider');
  const grid = $('#pos-grid');
  const decBtn = $('#btn-grid-dec');
  const incBtn = $('#btn-grid-inc');
  if (slider && grid && decBtn && incBtn) {
    const updateGridSize = (val) => {
      val = Math.min(250, Math.max(110, val));
      slider.value = val;
      grid.style.setProperty('--pos-grid-size', val + 'px');
      try { localStorage.setItem('rs-pos-grid-size', val); } catch(e){}
    };
    slider.oninput = () => updateGridSize(parseInt(slider.value, 10) || 158);
    decBtn.onclick = () => updateGridSize((parseInt(slider.value, 10) || 158) - 15);
    incBtn.onclick = () => updateGridSize((parseInt(slider.value, 10) || 158) + 15);
    try {
      const savedSize = localStorage.getItem('rs-pos-grid-size') || 158;
      updateGridSize(parseInt(savedSize, 10));
    } catch(e) {
      updateGridSize(158);
    }
  }

  // Mobile view toggles
  const cartBar = $('#pos-m-cart-bar');
  const backBtn = $('#btn-pos-back-menu');
  bindMobileCartBar();
  if (backBtn && cartBar) {backBtn.onclick = () => { if (window.innerWidth <= 1024) {closeMobilePOSCart(true);} };}

  renderPOS(); renderCart();

  // Mobile "More" is owned by features-shell.js (RSModal "All sections").
  // Do NOT toggle #mobile-more-sheet here — that older bottom sheet was still
  // opening underneath the modal, flashing "MORE SECTIONS" when a tile closed.
  const legacyMore = document.getElementById('mobile-more-sheet');
  if (legacyMore) {
    legacyMore.style.display = 'none';
    legacyMore.setAttribute('hidden', '');
    legacyMore.setAttribute('aria-hidden', 'true');
  }
}

  function getCart() {
    return cart.map((c) => ({ ...c }));
  }
  function setCart(items) {
    replaceCart((items || []).map((c) => ({ ...c })));
    renderCart();
  }
  function setDiscountPct(n) {
    discountPct = Number(n) || 0;
    syncPosScalars();
  }
  function getDiscountPct() {
    return discountPct;
  }
  function setTip(n) {
    tipAmount = Math.max(0, Number(n) || 0);
    syncPosScalars();
    const tipInput = document.getElementById('tip-input');
    if (tipInput) {tipInput.value = tipAmount > 0 ? tipAmount : '';}
  }
  function getTip() {
    return tipAmount;
  }
  function setLoyaltyRedeem(currencyAmount, pointsUsed) {
    loyaltyRedeem = Math.max(0, Number(currencyAmount) || 0);
    loyaltyPointsUsed = Math.max(0, Number(pointsUsed) || 0);
    syncPosScalars();
    try {
      renderCart();
    } catch (_) {}
  }
  function getLoyaltyRedeem() {
    return { amount: loyaltyRedeem, points: loyaltyPointsUsed };
  }

  global.RSPosUI = {
    renderPOS,
    renderCart,
    addToCart,
    changeQty,
    getTotals,
    clearCart,
    getCustomer,
    initPOS,
    refreshPosCats,
    getCart,
    updatePosCartChrome,
    syncCartCustomerChrome,
    setCartCustomerPanelOpen,
    clearCartCustomer,
    setCart,
    setDiscountPct,
    getDiscountPct,
    setPromo,
    getPromo,
    clearPromo,
    setLineNote,
    getLineNote,
    openLineNoteEditor,
    getCovers,
    setCovers,
    setTip,
    getTip,
    setLoyaltyRedeem,
    getLoyaltyRedeem,
    isHappyHourActive,
    effectiveMenuPrice,
    happyHourPct,
    paintHappyHourBanner,
    updateMobileCartBar,
    openMobilePOSCart,
    closeMobilePOSCart,
    bindMobileCartBar,
    runKotAction,
    runCheckoutAction,
    ensureCartActionDelegation,
    wireCartActions,
  };

  global.refreshPosCats = refreshPosCats;

  function attachToRS() {
    if (!global.RS) {return;}
    const api = global.RSPosUI;
    global.RS.renderPOS = api.renderPOS;
    global.RS.renderCart = api.renderCart;
    global.RS.addToCart = api.addToCart;
    global.RS.getTotals = api.getTotals;
    global.RS.clearCart = api.clearCart;
    global.RS.getCustomer = api.getCustomer;
    global.RS.getCart = api.getCart;
    global.RS.setCart = api.setCart;
    global.RS.initPOS = api.initPOS;
    global.RS.setTip = api.setTip;
    global.RS.getTip = api.getTip;
    global.RS.setLoyaltyRedeem = api.setLoyaltyRedeem;
    global.RS.getLoyaltyRedeem = api.getLoyaltyRedeem;
    global.RS.setPromo = api.setPromo;
    global.RS.getPromo = api.getPromo;
    global.RS.clearPromo = api.clearPromo;
    global.RS.setLineNote = api.setLineNote;
    global.RS.getLineNote = api.getLineNote;
    global.RS.openLineNoteEditor = api.openLineNoteEditor;
    global.RS.getCovers = api.getCovers;
    global.RS.setCovers = api.setCovers;
    global.RS.isHappyHourActive = api.isHappyHourActive;
    global.RS.effectiveMenuPrice = api.effectiveMenuPrice;
  }
  if (global.RS) {attachToRS();}
  document.addEventListener('rs:ready', attachToRS);
})(typeof window !== 'undefined' ? window : globalThis);



/* === assets/print-bridge.js === */
/* ============================================================
   RestroSuite — Print Bridge (Wave 4)
   Desktop silent print · ESC/POS text · browser iframe fallback
   ============================================================ */
(function (global) {
  'use strict';

  function paperMaxW() {
    const paperSize = (global.RS_SETTINGS && global.RS_SETTINGS.set_paper_size) || '80 mm';
    return paperSize === '58 mm' ? '200px' : '300px';
  }

  function wrapHtml(innerHTML, title) {
    const maxW = paperMaxW();
    // Match Bill settled preview / receipt.js EXPORT_CSS so thermal looks formatted
    const style = `
      <style>
        @page { margin: 0; size: auto; }
        *{margin:0;padding:0;box-sizing:border-box;}
        html,body{background:#fff;color:#16151c;}
        body{
          padding:6px 4px 10px;
          font-family: system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif;
          -webkit-print-color-adjust: exact;
          print-color-adjust: exact;
          display: flex;
          flex-direction: column;
          align-items: center;
        }
        body > div, .receipt-paper {
          max-width: ${maxW} !important; width: 100% !important; margin: 0 auto !important;
        }
        .receipt-paper {
          background: #fbfaf7; color: #16151c; border-radius: 0;
          padding: 10px 8px 14px; box-shadow: none; position: relative;
        }
        .rcp-center { text-align: center; }
        .rcp-logo {
          font-family: Georgia, 'Times New Roman', Times, serif;
          font-weight: 800; font-size: 18px; letter-spacing: -.02em; color: #16151c;
        }
        .rcp-sub { font-size: 10.5px; color: #4a4842; margin-top: 2px; }
        .rcp-hr { border: 0; border-top: 1px dashed #8a877c; margin: 10px 0; }
        .rcp-meta {
          display: flex; justify-content: space-between; font-size: 11px;
          color: #4a4842; gap: 6px; padding: 1px 0;
        }
        .rcp-line {
          display: flex; justify-content: space-between; font-size: 12px;
          padding: 2px 0; color: #16151c; gap: 6px;
        }
        .rcp-line .q { color: #6b6960; }
        .rcp-tot {
          display: flex; justify-content: space-between;
          font-family: Georgia, 'Times New Roman', Times, serif;
          font-weight: 800; font-size: 15px; margin-top: 6px; color: #16151c;
        }
        .rcp-foot { text-align: center; font-size: 10.5px; color: #6b6960; margin-top: 12px; }
        .rcp-foot b { color: #16151c; }
        .rcp-qr-wrap {
          width:100% !important; max-width:100% !important; margin:14px 0 0 !important;
          border-collapse:collapse !important; border-top:1px dashed #8a877c !important;
          table-layout:fixed !important;
        }
        .rcp-qr-wrap td {
          width:100% !important; text-align:center !important; padding:12px 0 0 !important;
          vertical-align:middle !important;
        }
        .rcp-qr-wrap img {
          width:110px !important; height:110px !important; display:block !important;
          margin:0 auto !important; float:none !important; border:0 !important;
        }
        .rcp-qr-label {
          display:block !important; width:100% !important; text-align:center !important;
          font-size:10px !important; color:#6b6960 !important; margin:6px 0 0 !important;
        }
        .rcp-foot { text-align:center !important; width:100% !important; display:block !important; }
        .kot-h{display:flex;justify-content:space-between;border-bottom:2px solid #111;padding-bottom:8px;margin-bottom:10px}
        .kot-h .kt{font-weight:700;font-size:18px}
        .kot-item{display:flex;gap:10px;padding:6px 0;border-bottom:1px dashed #ccc;font-size:15px}
        .kot-item .kq{font-weight:700;min-width:28px}
        pre.escpos{font:12px/1.35 "Consolas",monospace;width:100%;white-space:pre-wrap}
      </style>`;
    return `<!doctype html><html><head><meta charset="utf-8"><title>${title || 'Print'}</title>${style}</head><body>${innerHTML}</body></html>`;
  }

  function iframePrint(fullHtml) {
    return new Promise((resolve) => {
      const f = document.createElement('iframe');
      f.style.cssText = 'position:fixed;right:0;bottom:0;width:0;height:0;border:0;';
      document.body.appendChild(f);
      const d = f.contentWindow.document;
      d.open();
      d.write(fullHtml);
      d.close();
      const done = () => {
        try {
          f.contentWindow.focus();
          f.contentWindow.print();
        } catch (_) {}
        setTimeout(() => { try { f.remove(); } catch (_) {} resolve({ ok: true, mode: 'iframe' }); }, 800);
      };
      const imgs = Array.from(f.contentWindow.document.getElementsByTagName('img'));
      if (!imgs.length) return done();
      let n = 0;
      imgs.forEach((img) => {
        if (img.complete) { if (++n === imgs.length) setTimeout(done, 200); }
        else {
          img.onload = img.onerror = () => { if (++n === imgs.length) setTimeout(done, 200); };
        }
      });
    });
  }

  /** Build simple ESC/POS text receipt from plain lines */
  function toEscPosText(lines) {
    const arr = Array.isArray(lines) ? lines : String(lines || '').split('\n');
    return arr.map((l) => String(l || '')).join('\n') + '\n\n\n';
  }

  /** Web Bluetooth ESC/POS (Chrome / Edge / Android Chrome). Printer must support BLE serial. */
  async function printWebBluetoothEscPos(base64OrText) {
    if (!navigator.bluetooth || typeof navigator.bluetooth.requestDevice !== 'function') {
      return { ok: false, error: 'no_web_bluetooth' };
    }
    try {
      let bytes;
      if (typeof base64OrText === 'string' && /^[A-Za-z0-9+/=]+$/.test(base64OrText) && base64OrText.length > 32) {
        const bin = atob(base64OrText);
        bytes = new Uint8Array(bin.length);
        for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
      } else {
        const text = String(base64OrText || '');
        bytes = new TextEncoder().encode(text + '\n\n\n');
      }
      // Reuse bonded device if user already chose one
      let device = global.__rsBtPrinter;
      if (!device) {
        device = await navigator.bluetooth.requestDevice({
          acceptAllDevices: true,
          optionalServices: [
            '000018f0-0000-1000-8000-00805f9b34fb', // common thermal
            '49535343-fe7d-4ae5-8fa9-9fafd205e455', // ISSC transparent UART
            'e7810a71-73ae-499d-8c15-faa9aef0c3f2',
            0x18f0,
          ],
        });
        global.__rsBtPrinter = device;
      }
      const server = await device.gatt.connect();
      let service;
      const svcIds = [
        '000018f0-0000-1000-8000-00805f9b34fb',
        '49535343-fe7d-4ae5-8fa9-9fafd205e455',
        'e7810a71-73ae-499d-8c15-faa9aef0c3f2',
      ];
      for (const id of svcIds) {
        try {
          service = await server.getPrimaryService(id);
          if (service) break;
        } catch (_) {}
      }
      if (!service) {
        const services = await server.getPrimaryServices();
        service = services && services[0];
      }
      if (!service) return { ok: false, error: 'no_bt_service' };
      const chars = await service.getCharacteristics();
      const writeChar =
        chars.find((c) => c.properties.write || c.properties.writeWithoutResponse) || chars[0];
      if (!writeChar) return { ok: false, error: 'no_bt_characteristic' };
      // Chunk writes (BLE MTU ~20–180)
      const chunk = 100;
      for (let i = 0; i < bytes.length; i += chunk) {
        const slice = bytes.slice(i, i + chunk);
        if (writeChar.properties.writeWithoutResponse) {
          await writeChar.writeValueWithoutResponse(slice);
        } else {
          await writeChar.writeValue(slice);
        }
      }
      return { ok: true, mode: 'web-bluetooth', device: device.name || 'BT printer' };
    } catch (e) {
      console.warn('[Print] Web Bluetooth failed', e);
      return { ok: false, error: (e && e.message) || 'bt_failed' };
    }
  }

  /** Network (Wi‑Fi) raw ESC/POS via desktop agent or optional gateway */
  async function printNetworkEscPos(base64, opts) {
    const options = opts || {};
    const host =
      options.host ||
      (global.RS_SETTINGS && (RS_SETTINGS.set_wifi_printer_host || RS_SETTINGS.set_printer_ip)) ||
      '';
    const port = Number(options.port || (global.RS_SETTINGS && RS_SETTINGS.set_wifi_printer_port) || 9100);
    if (!host) return { ok: false, error: 'no_wifi_host' };
    const desk = global.RS_DESKTOP || global.rsDesktop;
    if (desk && typeof desk.printNetworkEscPos === 'function') {
      try {
        return await desk.printNetworkEscPos({ base64, host, port });
      } catch (e) {
        return { ok: false, error: e.message };
      }
    }
    // Browser cannot open raw TCP sockets — guide user
    return {
      ok: false,
      error: 'wifi_needs_desktop_or_android',
      hint: 'Set Wi‑Fi printer in Desktop app, or pair printer in Android Print settings',
    };
  }

  async function printHtml(innerHTML, title, opts) {
    const options = opts || {};
    const fullHtml = wrapHtml(innerHTML, title);

    // Android WebView — system Print dialog covers USB, Bluetooth & Wi‑Fi printers
    if (global.AndroidInterface && typeof global.AndroidInterface.printReceipt === 'function') {
      try {
        global.AndroidInterface.printReceipt(fullHtml);
        return { ok: true, mode: 'android-print-service' };
      } catch (e) {
        console.warn('[Print] Android failed', e);
      }
    }

    // Electron desktop silent print
    const desk = global.RS_DESKTOP || global.rsDesktop;
    if (desk && typeof desk.printHtml === 'function') {
      try {
        const res = await desk.printHtml(fullHtml, {
          silent: options.silent !== false,
          deviceName: options.deviceName || null,
        });
        if (res && res.ok) return { ok: true, mode: 'desktop', ...res };
        console.warn('[Print] desktop print failed', res && res.error);
      } catch (e) {
        console.warn('[Print] desktop bridge error', e);
      }
    }

    // PWA / mobile browser: prefer system share of text if print blocked
    if (options.preferShare && navigator.share) {
      try {
        const tmp = document.createElement('div');
        tmp.innerHTML = innerHTML;
        await navigator.share({ title: title || 'Receipt', text: tmp.innerText || '' });
        return { ok: true, mode: 'web-share' };
      } catch (_) {}
    }

    // Browser fallback (USB/Wi‑Fi if OS has printer drivers)
    return iframePrint(fullHtml);
  }

  async function printEscPosText(text, opts) {
    const options = opts || {};
    const desk = global.RS_DESKTOP || global.rsDesktop;
    let deviceName = options.deviceName || null;
    if (!deviceName && desk && typeof desk.getPreferredPrinter === 'function') {
      try {
        const pref = await desk.getPreferredPrinter();
        deviceName = pref && pref.name;
      } catch (_) {}
    }
    // Prefer binary ESC/POS when encoder is available
    let base64 = null;
    if (global.RSEscPos && RSEscPos.Encoder) {
      try {
        const enc = new RSEscPos.Encoder().init().text(String(text || '')).feed(3).cut();
        base64 = enc.toBase64();
      } catch (_) {}
    }

    // Android raw ESC/POS hook (if native bridge added)
    if (global.AndroidInterface && typeof global.AndroidInterface.printEscPos === 'function' && base64) {
      try {
        global.AndroidInterface.printEscPos(base64);
        return { ok: true, mode: 'android-escpos' };
      } catch (e) {
        console.warn('[Print] Android ESC/POS failed', e);
      }
    }

    if (desk && typeof desk.printEscPos === 'function') {
      try {
        const res = await desk.printEscPos({
          text: toEscPosText(text),
          base64,
          deviceName,
        });
        if (res && res.ok) {
          return { ok: true, mode: res.mode || 'escpos', spool: res.spool, deviceName };
        }
        console.warn('[Print] escpos failed', res && res.error);
      } catch (e) {
        console.warn('[Print] escpos failed', e);
      }
    }

    // Wi‑Fi raw (desktop)
    if (base64 && (options.wifi || (global.RS_SETTINGS && RS_SETTINGS.set_wifi_printer_host))) {
      const net = await printNetworkEscPos(base64, options);
      if (net && net.ok) return net;
    }

    // Web Bluetooth (Chrome mobile/desktop)
    if (options.bluetooth !== false && base64) {
      const bt = await printWebBluetoothEscPos(base64);
      if (bt && bt.ok) return bt;
    }

    return printHtml(`<pre class="escpos">${String(text || '').replace(/&/g, '&amp;').replace(/</g, '&lt;')}</pre>`, 'Receipt', options);
  }

  function forceRawThermal(opts) {
    const o = opts || {};
    if (o.raw === true || o.mode === 'raw' || o.mode === 'escpos') return true;
    try {
      const s = global.RS_SETTINGS || {};
      const mode = String(s.set_thermal_mode || s.set_receipt_thermal_mode || '').toLowerCase();
      return mode === 'raw' || mode === 'escpos' || s.set_thermal_raw === true || s.set_thermal_raw === 'true';
    } catch (_) {
      return false;
    }
  }

  /** Same HTML body as Bill settled preview (formatted), sized for roll paper. */
  function formattedBillHtml(bill, outlet, qrDataUri) {
    const out = outlet || {};
    let body = '';
    if (global.RSReceiptEngine && typeof RSReceiptEngine.toHTML === 'function') {
      body = RSReceiptEngine.toHTML(bill, qrDataUri || null, out);
    } else if (global.RSReceipt && typeof RSReceipt.html === 'function') {
      body = RSReceipt.html(bill, qrDataUri || null);
    } else {
      const items = (bill && (bill.items || bill._items)) || [];
      const name = out.name || 'Outlet';
      const total = bill && (bill.grand != null ? bill.grand : bill.amount);
      body = `<div class="rcp-center"><div class="rcp-logo">${String(name).replace(/</g, '&lt;')}</div></div>
        <hr class="rcp-hr">
        <div class="rcp-meta"><span>${String((bill && bill.no) || '')}</span><span></span></div>
        ${items.map((i) => `<div class="rcp-line"><span><span class="q">${i.qty || 1}x </span>${String(i.name || '').replace(/</g, '&lt;')}</span><span></span></div>`).join('')}
        <div class="rcp-tot"><span>TOTAL</span><span>${total != null ? total : ''}</span></div>`;
    }
    const maxW = paperMaxW();
    return `<div class="receipt-paper" style="max-width:${maxW};margin:0 auto;box-shadow:none">${body}</div>`;
  }

  async function qrDataUriForBill(bill) {
    try {
      if (global.RSReceiptEngine && typeof RSReceiptEngine.qrDataUriFor === 'function') {
        return await RSReceiptEngine.qrDataUriFor(bill);
      }
    } catch (_) {}
    return new Promise((resolve) => {
      try {
        if (!global.QRCode || !bill) return resolve(null);
        const no = bill.no || bill.orderId || bill.id;
        if (!no) return resolve(null);
        const digitalUrl =
          (global.RSReceiptEngine && typeof RSReceiptEngine.digitalBillUrl === 'function')
            ? RSReceiptEngine.digitalBillUrl(no)
            : (() => {
                const slug = sessionStorage.getItem('tenant_slug') || 'outlet';
                return `https://restrosuite.codearc.co.in/bill?slug=${encodeURIComponent(slug)}&no=${encodeURIComponent(no)}`;
              })();
        global.QRCode.toDataURL(
          digitalUrl,
          { width: 200, margin: 1 },
          (err, url) => resolve(err ? null : url)
        );
      } catch (_) {
        resolve(null);
      }
    });
  }

  async function printBillEscPos(bill, outlet, opts) {
    const options = opts || {};
    // Default: print the SAME formatted receipt as the on-screen preview (with QR).
    // Plain ESC/POS text only when settings/opts force raw mode.
    if (!forceRawThermal(options)) {
      try {
        const qr = await qrDataUriForBill(bill);
        const html = formattedBillHtml(bill, outlet, qr);
        const title = 'Receipt ' + ((bill && (bill.no || bill.orderId)) || '');
        const res = await printHtml(html, title, options);
        if (res && res.ok) return { ...res, mode: res.mode || 'html-thermal' };
      } catch (e) {
        console.warn('[Print] formatted thermal failed, trying raw', e);
      }
    }

    if (global.RSEscPos && typeof RSEscPos.receiptFromBill === 'function') {
      const enc = RSEscPos.receiptFromBill(bill, outlet);
      const desk = global.RS_DESKTOP || global.rsDesktop;
      if (desk && desk.printEscPos) {
        const res = await desk.printEscPos({
          base64: enc.toBase64(),
          text: null,
          deviceName: options.deviceName || null,
        });
        if (res && res.ok) return res;
      }
    }
    // Last resort: plain text lines
    const items = (bill && (bill.items || bill._items)) || [];
    const lines = [
      (outlet && outlet.name) || 'Outlet',
      bill && bill.no,
      'TOTAL ' + (bill && (bill.grand != null ? bill.grand : bill.amount)),
      ...items.map((i) => (i.qty || 1) + 'x ' + (i.name || '')),
    ];
    return printEscPosText(lines.join('\n'), options);
  }

  async function listPrinters() {
    const desk = global.RS_DESKTOP || global.rsDesktop;
    if (desk && typeof desk.listPrinters === 'function') {
      try { return await desk.listPrinters(); } catch (_) { return []; }
    }
    return [];
  }

  /** Pulse cash drawer via preferred thermal printer (desktop ESC/POS). */
  async function openCashDrawer(opts) {
    const options = opts || {};
    const desk = global.RS_DESKTOP || global.rsDesktop;
    let deviceName = options.deviceName || null;
    if (!deviceName && desk && typeof desk.getPreferredPrinter === 'function') {
      try {
        const pref = await desk.getPreferredPrinter();
        deviceName = pref && pref.name;
      } catch (_) {}
    }
    let base64 = null;
    if (global.RSEscPos && typeof RSEscPos.openDrawerBase64 === 'function') {
      try {
        base64 = RSEscPos.openDrawerBase64(options.pin || 0);
      } catch (_) {}
    } else if (global.RSEscPos && RSEscPos.Encoder) {
      try {
        base64 = new RSEscPos.Encoder().init().cashDrawer(options.pin || 0).toBase64();
      } catch (_) {}
    }
    if (desk && typeof desk.printEscPos === 'function' && base64) {
      try {
        const res = await desk.printEscPos({
          base64,
          text: null,
          deviceName,
        });
        if (res && res.ok) return { ok: true, mode: 'escpos', ...res };
        console.warn('[Print] cash drawer failed', res && res.error);
      } catch (e) {
        console.warn('[Print] cash drawer error', e);
      }
    }
    // Android WebView hook if present
    if (global.AndroidInterface && typeof global.AndroidInterface.openCashDrawer === 'function') {
      try {
        global.AndroidInterface.openCashDrawer();
        return { ok: true, mode: 'android' };
      } catch (e) {
        console.warn('[Print] Android cash drawer failed', e);
      }
    }
    return { ok: false, error: 'no_drawer_bridge' };
  }

  // Global API
  global.RSPrintBridge = {
    __fromOverlay: true, // marks latest print-bridge so stale critical.bundle can defer
    printHtml,
    printEscPosText,
    printBillEscPos,
    openCashDrawer,
    listPrinters,
    wrapHtml,
    toEscPosText,
    printWebBluetoothEscPos,
    printNetworkEscPos,
    /**
     * Smart print path for mobile/PWA/Android/desktop:
     * Android print service (BT/USB/Wi‑Fi) → Desktop ESC/POS → Web BT → browser dialog
     */
    async printSmart(innerHTML, title, opts) {
      const options = opts || {};
      // Android system printers (Bluetooth, USB, Wi‑Fi all appear in Print dialog)
      if (global.AndroidInterface && typeof global.AndroidInterface.printReceipt === 'function') {
        return printHtml(innerHTML, title, options);
      }
      const desk = global.RS_DESKTOP || global.rsDesktop;
      if (desk) return printHtml(innerHTML, title, options);
      // Try Web Bluetooth raw if user opted in
      if (options.bluetooth && global.RSEscPos && RSEscPos.Encoder) {
        try {
          const tmp = document.createElement('div');
          tmp.innerHTML = innerHTML;
          const text = tmp.innerText || '';
          const enc = new RSEscPos.Encoder().init().text(text).feed(3).cut();
          const bt = await printWebBluetoothEscPos(enc.toBase64());
          if (bt && bt.ok) return bt;
        } catch (_) {}
      }
      return printHtml(innerHTML, title, options);
    },
    async choosePreferredPrinter() {
      const desk = global.RS_DESKTOP || global.rsDesktop;
      if (!desk || !desk.listPrinters) {
        // Mobile: offer Web Bluetooth pair
        if (navigator.bluetooth) {
          const ok = window.confirm
            ? confirm('Pair a Bluetooth thermal printer for raw ESC/POS?\n\n(Or use Android Print for USB/Wi‑Fi printers.)')
            : false;
          if (ok) {
            const res = await printWebBluetoothEscPos(btoa('\nRestroSuite BT test\n\n\n'));
            if (res && res.ok && global.RS && RS.toast) RS.toast('Bluetooth printer ready: ' + (res.device || ''), 'fa-bluetooth');
            return res;
          }
        }
        if (global.RS && RS.toast) {
          RS.toast('On phone: use Android Print (BT/USB/Wi‑Fi). Desktop app lists printers.', 'fa-print');
        }
        return null;
      }
      const printers = await desk.listPrinters();
      const list = Array.isArray(printers) ? printers : [];
      if (!list.length) {
        if (global.RS && RS.toast) RS.toast('No printers found — install a Windows printer first', 'fa-print');
        return null;
      }
      const names = list.map((p) => p.name || p.displayName || String(p)).filter(Boolean);
      if (!names.length) {
        if (global.RS && RS.toast) RS.toast('No printers found', 'fa-print');
        return null;
      }

      // Electron/Chromium desktop does NOT support window.prompt() — use RSModal or a simple picker.
      const name = await pickPrinterName(names, desk);
      if (!name) return null;
      if (desk.setPreferredPrinter) await desk.setPreferredPrinter(name);
      if (global.RS && RS.toast) RS.toast('Printer set: ' + name, 'fa-print');
      try {
        const pchip = document.getElementById('rs-printer-chip');
        if (pchip) pchip.innerHTML = '<i class="fa-solid fa-print"></i> ' + String(name).slice(0, 18).replace(/</g, '');
      } catch (_) {}
      return name;
    },
  };

  function escHtml(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  /** Pick a printer without window.prompt (unsupported in Electron). */
  function pickPrinterName(names, desk) {
    return new Promise(async (resolve) => {
      let current = '';
      try {
        if (desk && desk.getPreferredPrinter) {
          const pref = await desk.getPreferredPrinter();
          if (pref && pref.name) current = String(pref.name);
        }
      } catch (_) {}

      if (global.RSModal && typeof RSModal.open === 'function') {
        const opts = names
          .map((n) => {
            const sel = n === current ? ' selected' : '';
            return `<option value="${escHtml(n)}"${sel}>${escHtml(n)}</option>`;
          })
          .join('');
        RSModal.open({
          title: 'Preferred printer',
          sub: 'Used for silent thermal / receipt print on this PC',
          icon: 'fa-print',
          size: 'sm',
          body: `
            <label class="fl" style="display:block;margin-bottom:6px;font-weight:600">Windows printer</label>
            <select class="form-input" id="rs-pick-printer" style="width:100%">${opts}</select>
            <p style="font-size:12px;color:var(--text-soft);margin:10px 0 0;line-height:1.45">
              Install the printer in Windows first. Leave connected for auto-print after bills.
            </p>`,
          foot: `<button type="button" class="btn btn-ghost" style="flex:1" data-x>Cancel</button>
                 <button type="button" class="btn btn-primary" style="flex:1" data-ok><i class="fa-solid fa-check"></i> Use printer</button>`,
          onMount(modal, close) {
            modal.querySelector('[data-x]').onclick = () => {
              close();
              resolve(null);
            };
            modal.querySelector('[data-ok]').onclick = () => {
              const sel = modal.querySelector('#rs-pick-printer');
              const v = sel && sel.value ? String(sel.value) : '';
              close();
              resolve(v || null);
            };
          },
        });
        return;
      }

      // Fallback lightweight picker (no prompt / no RSModal)
      const wrap = document.createElement('div');
      wrap.setAttribute('role', 'dialog');
      wrap.style.cssText =
        'position:fixed;inset:0;z-index:2147483000;background:rgba(15,17,21,.55);display:flex;align-items:center;justify-content:center;padding:20px';
      wrap.innerHTML =
        '<div style="background:#fff;border-radius:14px;max-width:400px;width:100%;padding:20px;box-shadow:0 16px 48px rgba(0,0,0,.2)">' +
        '<div style="font-weight:800;font-size:16px;margin-bottom:6px">Preferred printer</div>' +
        '<div style="font-size:12.5px;color:#6b6570;margin-bottom:12px">Select the Windows printer for receipts</div>' +
        '<select id="rs-pick-printer-fb" style="width:100%;padding:10px;border-radius:8px;border:1px solid #ddd;font-size:14px">' +
        names.map((n) => `<option value="${escHtml(n)}"${n === current ? ' selected' : ''}>${escHtml(n)}</option>`).join('') +
        '</select>' +
        '<div style="display:flex;gap:8px;margin-top:16px">' +
        '<button type="button" id="rs-pick-x" style="flex:1;padding:10px;border-radius:8px;border:1px solid #ddd;background:#f5f5f5;font-weight:700;cursor:pointer">Cancel</button>' +
        '<button type="button" id="rs-pick-ok" style="flex:1;padding:10px;border-radius:8px;border:none;background:#FF4F00;color:#fff;font-weight:700;cursor:pointer">Use printer</button>' +
        '</div></div>';
      document.body.appendChild(wrap);
      wrap.querySelector('#rs-pick-x').onclick = () => {
        wrap.remove();
        resolve(null);
      };
      wrap.querySelector('#rs-pick-ok').onclick = () => {
        const sel = wrap.querySelector('#rs-pick-printer-fb');
        const v = sel && sel.value ? String(sel.value) : '';
        wrap.remove();
        resolve(v || null);
      };
    });
  }

  // Override / enhance RSPrint when features-pos defines it later
  function installRsPrintShim() {
    const prev = global.RSPrint;
    global.RSPrint = function (innerHTML, title, opts) {
      // Prefer bridge; supports deviceName for kitchen vs counter printers
      const p = printHtml(innerHTML, title, opts || {});
      if (p && typeof p.then === 'function') {
        return p.catch(() => {
          if (typeof prev === 'function') return prev(innerHTML, title);
          return { ok: false };
        });
      }
      return p;
    };
    if (typeof prev === 'function') global.RSPrint.__previous = prev;
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => setTimeout(installRsPrintShim, 50));
  } else {
    setTimeout(installRsPrintShim, 50);
  }
  // Re-shim after features-pos loads
  document.addEventListener('rs:hydrated', () => setTimeout(installRsPrintShim, 100));
})(typeof window !== 'undefined' ? window : globalThis);



/* === assets/receipt.js === */
/* ============================================================
   RestroSuite — Unified Receipt Engine (professional single source)
   One model → HTML preview · text · PDF · WhatsApp caption
   ============================================================ */
(function (global) {
  'use strict';

  const PDF_CACHE = new Map(); // billNo -> { dataUri, at }
  const PDF_CACHE_TTL_MS = 10 * 60 * 1000;
  const PDF_SCALE = 2; // balanced quality vs CPU/RAM
  let libsPreloaded = false;

  // MUST be scoped under [data-rs-receipt-export] — unscoped rules injected during
  // PDF warm would restyle the LIVE Bill settled preview (font flash after ~1s).
  const EXPORT_CSS = `
    [data-rs-receipt-export] .receipt-paper {
      background: #fbfaf7; color: #16151c; border-radius: 10px;
      padding: 22px 22px 26px; font-family: system-ui, -apple-system, 'Segoe UI', sans-serif;
      max-width: 320px; margin: 0 auto; position: relative; box-sizing: border-box;
    }
    [data-rs-receipt-export] .rcp-center { text-align: center; }
    [data-rs-receipt-export] .rcp-logo { font-family: Georgia, 'Times New Roman', serif; font-weight: 800; font-size: 20px; letter-spacing: -.02em; color: #16151c; }
    [data-rs-receipt-export] .rcp-sub { font-size: 11px; color: #6b6960; margin-top: 2px; }
    [data-rs-receipt-export] .rcp-hr { border: 0; border-top: 1px dashed #c9c6bd; margin: 13px 0; }
    [data-rs-receipt-export] .rcp-meta { display: flex; justify-content: space-between; font-size: 11.5px; color: #4a4842; gap: 8px; }
    [data-rs-receipt-export] .rcp-line { display: flex; justify-content: space-between; font-size: 12.5px; padding: 3px 0; color: #16151c; gap: 8px; }
    [data-rs-receipt-export] .rcp-line .q { color: #6b6960; }
    [data-rs-receipt-export] .rcp-tot { display: flex; justify-content: space-between; font-family: Georgia, 'Times New Roman', serif; font-weight: 800; font-size: 17px; margin-top: 6px; color: #16151c; }
    [data-rs-receipt-export] .rcp-foot { text-align: center; font-size: 11px; color: #6b6960; margin-top: 14px; }
    [data-rs-receipt-export] .rcp-foot b { color: #16151c; }
    [data-rs-receipt-export] .rcp-qr-wrap {
      width: 100% !important; margin: 14px 0 0 !important; border-collapse: collapse !important;
      border-top: 1px dashed #c9c6bd !important;
    }
    [data-rs-receipt-export] .rcp-qr-wrap td {
      text-align: center !important; padding-top: 12px !important; vertical-align: middle !important;
    }
    [data-rs-receipt-export] .rcp-qr-wrap img {
      width: 110px !important; height: 110px !important; display: block !important;
      margin: 0 auto !important; float: none !important;
    }
    [data-rs-receipt-export] .rcp-qr-label {
      font-size: 10px !important; color: #6b6960 !important; margin-top: 6px !important;
      text-align: center !important; display: block !important; width: 100% !important;
    }
  `;

  /** Print-safe centered QR (table + inline styles — flex is flaky in browser print). */
  function qrBlockHtml(qrDataUri) {
    if (!qrDataUri) return '';
    const src = String(qrDataUri).replace(/"/g, '&quot;');
    return `
      <table class="rcp-qr-wrap" role="presentation" cellpadding="0" cellspacing="0" border="0"
        style="width:100%;max-width:100%;margin:14px 0 0;border-collapse:collapse;border-top:1px dashed #8a877c;table-layout:fixed;">
        <tr>
          <td align="center" valign="middle" style="width:100%;text-align:center;padding:12px 0 0;margin:0;">
            <img src="${src}" width="110" height="110" alt="Digital bill QR" crossorigin="anonymous"
              style="display:block;margin:0 auto;width:110px;height:110px;max-width:110px;border:0;float:none;" />
            <div class="rcp-qr-label" style="display:block;width:100%;text-align:center;font-size:10px;color:#6b6960;margin:6px 0 0;line-height:1.3;">
              Scan to view digital bill
            </div>
          </td>
        </tr>
      </table>`;
  }

  function esc(v) {
    return String(v == null ? '' : v).replace(/[&<>"']/g, (ch) =>
      ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]));
  }

  function money(n, rsFn) {
    if (typeof rsFn === 'function') return rsFn(n);
    const v = Number(n) || 0;
    if (Math.abs(v - Math.round(v)) < 0.001) return '₹' + Math.round(v);
    return '₹' + v.toFixed(2);
  }

  function getRs() {
    return (global.RS && typeof global.RS.rs === 'function') ? global.RS.rs.bind(global.RS) : null;
  }

  function sessionOutletName() {
    try {
      const s = (global.RS_API && RS_API.session && RS_API.session()) || {};
      const raw = s.tenant_name || s.outlet_name || s.business_name || s.tenant_slug || sessionStorage.getItem('tenant_slug') || 'Outlet';
      return String(raw).replace(/[-_]+/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase()).trim();
    } catch (_) {
      return 'Outlet';
    }
  }

  function featureOn(key, fallback) {
    try {
      const settings = global.RS_SETTINGS || {};
      if (typeof global.RS_featureOn === 'function') {
        return !!global.RS_featureOn(key, settings, fallback);
      }
      const v = settings[key];
      if (v === true || v === 'true' || v === 1 || v === '1') return true;
      if (v === false || v === 'false' || v === 0 || v === '0') return false;
      return !!fallback;
    } catch (_) {
      return !!fallback;
    }
  }

  /** Settings → Calculate taxes (default OFF for simple cafés). */
  function taxesEnabled() {
    return featureOn('set_calculate_taxes', false);
  }

  /** Settings → Show HSN codes (only when taxes are on). */
  function showHsnCodes() {
    return taxesEnabled() && featureOn('set_show_hsn_codes', false);
  }

  function getOutletProfile(override) {
    if (override && (override.name || override.address)) return override;
    const settings = global.RS_SETTINGS || {};
    const raw = settings._raw || {};
    const tax = (typeof global.RS_getTenantTaxProfile === 'function')
      ? global.RS_getTenantTaxProfile()
      : { country: 'IN', tax_system: 'GST', gst_scheme: 'regular' };
    return {
      name: settings.set_restaurant_name || settings.set_outlet_name || raw.business_name || sessionOutletName(),
      address: settings.set_address || raw.address || '',
      phone: settings.set_phone || raw.phone || '',
      gstin: settings.set_gstin || raw.gst_number || raw.gstin || '',
      tax,
    };
  }

  /** Normalize any bill-like object into one canonical model. */
  function normalizeBill(bill) {
    const b = bill || {};
    let items = b.items;
    if (!Array.isArray(items)) items = Array.isArray(b._items) ? b._items : [];
    // If items is a count number from list views, fall back to _items
    if (typeof items === 'number') items = Array.isArray(b._items) ? b._items : [];
    items = items.map((i) => ({
      name: i.name || i.item_name || 'Item',
      qty: Number(i.qty != null ? i.qty : i.quantity) || 1,
      price: Number(i.price != null ? i.price : i.unit_price) || 0,
      taxCategory: i.taxCategory || i.tax_category || '',
      cat: i.cat || i.category || '',
      note: i.note || i.notes || '',
    }));
    const grand = b.grand != null ? Number(b.grand) : Number(b.amount != null ? b.amount : b.total) || 0;
    const sub = b.sub != null ? Number(b.sub) : Number(b.subtotal) || 0;
    const gst = Number(b.gst) || 0;
    return {
      no: String(b.no || b.orderId || b.order_id || b.id || ''),
      time: b.time || b.dateTime || b.date_time || new Date().toLocaleString(),
      table: b.table || b.tableNumber || b.table_number || '--',
      customer: b.customer || b.customerName || b.customer_name || 'Walk-in',
      customerPhone: b.customerPhone || b.customer_phone || '',
      customerGst: b.customerGst || b.customer_gst || '',
      covers: Math.max(0, Number(b.covers != null ? b.covers : b.pax) || 0),
      items,
      sub,
      disc: Number(b.disc != null ? b.disc : b.discount) || 0,
      gst,
      grand,
      tenders: Array.isArray(b.tenders) ? b.tenders : [],
      change: Number(b.change != null ? b.change : b.changeAmount) || 0,
      taxSummary: Array.isArray(b.taxSummary) ? b.taxSummary : (Array.isArray(b.tax_summary) ? b.tax_summary : []),
      serviceChargeAmount: Number(b.serviceChargeAmount || b.service_charge_amount) || 0,
      serviceChargePct: b.serviceChargePct != null ? Number(b.serviceChargePct) : null,
      tipAmount: Number(b.tipAmount || b.tip || b.tip_amount) || 0,
      deliveryCharge: Number(b.deliveryCharge || b.delivery_charge || b.deliveryFee) || 0,
      loyaltyRedeemAmount: Number(b.loyaltyRedeemAmount || b.loyalty_redeem_amount) || 0,
      promoCode: b.promoCode || b.promo_code || '',
      promoAmount: Number(b.promoAmount || b.promo_amount || b.promo) || 0,
      promoTitle: b.promoTitle || b.promo_title || '',
      liquorTaxAmount: Number(b.liquorTaxAmount || b.liquor_tax_amount) || 0,
      taxProfile: b.taxProfile || b.tax_profile || null,
      channel: b.channel || b.orderType || 'dine_in',
    };
  }

  function buildModel(bill, outletProfile) {
    const m = normalizeBill(bill);
    const outlet = getOutletProfile(outletProfile);
    const tax = m.taxProfile || outlet.tax || { country: 'IN', tax_system: 'GST', gst_scheme: 'regular' };
    return { bill: m, outlet, tax };
  }

  function toHTML(bill, qrDataUri, outletProfile) {
    const { bill: m, outlet, tax } = buildModel(bill, outletProfile);
    const rsFn = getRs();
    const $ = (n) => money(n, rsFn);
    const country = tax.country || 'IN';
    const taxSystem = tax.tax_system || 'GST';
    const isIreland = country === 'IE';

    const custName = m.customer || 'Walk-in';
    let custSection = '';
    if (custName !== 'Walk-in' || m.customerPhone || m.customerGst) {
      custSection = `
        <div class="rcp-meta"><span>Customer:</span><span>${esc(custName)}</span></div>
        ${m.customerPhone ? `<div class="rcp-meta"><span>Phone:</span><span>${esc(m.customerPhone)}</span></div>` : ''}
        ${m.customerGst ? `<div class="rcp-meta"><span>${esc(taxSystem)} Reg:</span><span>${esc(m.customerGst)}</span></div>` : ''}
      `;
    } else {
      custSection = `<div class="rcp-meta"><span>Customer:</span><span>Walk-in</span></div>`;
    }

    // Human-readable time (avoid raw ISO flash / ugly Z timestamps)
    let timeDisp = m.time || '';
    try {
      const d = new Date(m.time);
      if (!isNaN(d.getTime())) {
        timeDisp = d.toLocaleString(undefined, {
          day: '2-digit', month: 'short', year: 'numeric',
          hour: '2-digit', minute: '2-digit',
        });
      }
    } catch (_) {}

    const taxOn = taxesEnabled();
    const hsnOn = showHsnCodes();
    const profileLines = [
      outlet.address,
      outlet.phone ? `Phone ${outlet.phone}` : '',
      // State code / GSTIN only when tax engine is on (simple cafés leave taxes OFF)
      (taxOn && country === 'IN' && tax.state_code) ? `State Code: ${tax.state_code}` : '',
      (taxOn && (tax.tax_registration_no || outlet.gstin))
        ? `${taxSystem} No: ${tax.tax_registration_no || outlet.gstin}`
        : '',
    ].filter(Boolean).map((line) => `<div class="rcp-sub">${esc(line)}</div>`).join('');

    const itemsHTML = m.items.map((i) => {
      const rateLabel = isIreland ? (i.taxCategory === 'IE_DRINK_23' ? '23%' : '9%') : '5%';
      const note = i.note || '';
      const rateBit = (taxOn && isIreland)
        ? ` <small style="font-size:10px;color:#6b6960">(${rateLabel})</small>`
        : '';
      return `<div class="rcp-line"><span><span class="q">${i.qty}x </span>${esc(i.name)}${rateBit}${note ? `<div style="font-size:10.5px;color:#6b6960;margin-top:1px">* ${esc(note)}</div>` : ''}</span><span>${$(i.price * i.qty)}</span></div>`;
    }).join('');

    let taxBreakdownHTML = '';
    if (!taxOn) {
      taxBreakdownHTML = '';
    } else if (tax.gst_scheme === 'composition' && country === 'IN') {
      taxBreakdownHTML = `<div class="rcp-line" style="text-align:center;font-size:11px;color:#6b6960;margin-top:6px;font-style:italic;">Composition taxable person, not eligible to collect tax</div>`;
    } else {
      const summary = m.taxSummary || [];
      const hasTax = Number(m.gst) > 0 || summary.some((b) => Number(b && b.tax) > 0);
      if (hasTax && summary.length > 0) {
        taxBreakdownHTML = `<div style="margin-top:6px;border-top:1px dashed #c9c6bd;padding-top:6px;">`;
        if (country === 'IN') {
          const halfGst = Math.round((m.gst || 0) / 2);
          taxBreakdownHTML += `
            <div class="rcp-line"><span>CGST (2.5%)</span><span>${$(halfGst)}</span></div>
            <div class="rcp-line"><span>SGST (2.5%)</span><span>${$(m.gst - halfGst)}</span></div>`;
          if (hsnOn) {
            taxBreakdownHTML += `<div class="rcp-sub" style="font-size:10.5px;color:#6b6960;margin-top:2px;">SAC 9963</div>`;
          }
        } else {
          taxBreakdownHTML += `<div style="font-size:11px;color:#6b6960;margin-bottom:4px;font-weight:700;">VAT Breakout</div>`;
          summary.forEach((band) => {
            taxBreakdownHTML += `
              <div class="rcp-line" style="font-size:11.5px;color:#4a4842">
                <span>Rate ${band.percent}%</span>
                <span>Net ${$(band.net)} | VAT ${$(band.tax)}</span>
              </div>`;
          });
        }
        taxBreakdownHTML += `</div>`;
      } else if (Number(m.gst) > 0) {
        const halfGst = Math.round((m.gst || 0) / 2);
        taxBreakdownHTML = country === 'IN'
          ? `
            <div class="rcp-line"><span>CGST (2.5%)</span><span>${$(halfGst)}</span></div>
            <div class="rcp-line"><span>SGST (2.5%)</span><span>${$(m.gst - halfGst)}</span></div>
            ${hsnOn ? '<div class="rcp-sub" style="font-size:10.5px;color:#6b6960;margin-top:2px;">SAC 9963</div>' : ''}`
          : `<div class="rcp-line"><span>Tax</span><span>${$(m.gst)}</span></div>`;
      }
    }

    const tenders = m.tenders.length
      ? m.tenders.map((t) => `<div class="rcp-line"><span class="q">${esc(t.method)}</span><span>${$(t.amount)}</span></div>`).join('')
      : `<div class="rcp-line"><span class="q">Cash</span><span>${$(m.grand)}</span></div>`;

    return `<div class="rcp-center"><div class="rcp-logo">${esc(outlet.name || 'Outlet')}</div>${profileLines || ''}</div>
      <hr class="rcp-hr">
      <div class="rcp-meta"><span>${esc(m.no)}</span><span>${esc(timeDisp)}</span></div>
      <div class="rcp-meta"><span>Table:</span><span>${esc(m.table)}</span></div>
      ${m.covers ? `<div class="rcp-meta"><span>Covers:</span><span>${m.covers}</span></div>` : ''}
      ${custSection}
      <hr class="rcp-hr">
      ${itemsHTML}
      <hr class="rcp-hr">
      <div class="rcp-line"><span>Subtotal</span><span>${$(m.sub)}</span></div>
      ${m.disc ? `<div class="rcp-line"><span>Discount</span><span>- ${$(m.disc)}</span></div>` : ''}
      ${m.serviceChargeAmount ? `<div class="rcp-line"><span>Service Charge (${m.serviceChargePct != null ? m.serviceChargePct : 5}%)</span><span>${$(m.serviceChargeAmount)}</span></div>` : ''}
      ${m.tipAmount ? `<div class="rcp-line"><span>Tip</span><span>${$(m.tipAmount)}</span></div>` : ''}
      ${m.deliveryCharge ? `<div class="rcp-line"><span>Delivery</span><span>${$(m.deliveryCharge)}</span></div>` : ''}
      ${m.loyaltyRedeemAmount ? `<div class="rcp-line"><span>Loyalty redeem</span><span>- ${$(m.loyaltyRedeemAmount)}</span></div>` : ''}
      ${m.promoAmount ? `<div class="rcp-line"><span>Promo${m.promoCode ? ' ' + esc(m.promoCode) : ''}</span><span>- ${$(m.promoAmount)}</span></div>` : ''}
      ${m.liquorTaxAmount ? `<div class="rcp-line"><span>Liquor VAT</span><span>${$(m.liquorTaxAmount)}</span></div>` : ''}
      ${taxBreakdownHTML}
      <div class="rcp-tot"><span>TOTAL</span><span>${$(m.grand)}</span></div>
      <hr class="rcp-hr">
      ${tenders}
      ${m.change ? `<div class="rcp-line"><span class="q">Change</span><span>${$(m.change)}</span></div>` : ''}
      ${qrBlockHtml(qrDataUri)}
      <div class="rcp-foot" style="text-align:center;width:100%;display:block;margin-top:12px;">Thank you for dining with us!<br><b>Powered by CodeArc RestroSuite</b></div>`;
  }

  function toText(bill, outletProfile) {
    const { bill: m, outlet, tax } = buildModel(bill, outletProfile);
    const rsFn = getRs();
    const $ = (n) => money(n, rsFn);
    const country = tax.country || 'IN';
    const isIreland = country === 'IE';
    const lines = [
      outlet.name || 'Outlet',
      outlet.address,
      outlet.phone ? `Phone: ${outlet.phone}` : '',
      (tax.tax_registration_no || outlet.gstin) ? `${tax.tax_system || 'GST'} No: ${tax.tax_registration_no || outlet.gstin}` : '',
      `Bill: ${m.no}`,
      `${m.table} | ${m.time}`,
      m.covers ? `Covers: ${m.covers}` : '',
      m.customer && m.customer !== 'Walk-in' ? `Customer: ${m.customer}` : '',
      m.customerPhone ? `Phone: ${m.customerPhone}` : '',
      '',
      ...m.items.flatMap((i) => {
        const rateLabel = isIreland ? (i.taxCategory === 'IE_DRINK_23' ? '23%' : '9%') : '5%';
        const main = `${i.qty} x ${i.name}${isIreland ? ` (${rateLabel})` : ''} - ${$(i.price * i.qty)}`;
        return i.note ? [main, '  * ' + i.note] : [main];
      }),
      '',
      `Subtotal: ${$(m.sub)}`,
      m.disc ? `Discount: - ${$(m.disc)}` : '',
      m.serviceChargeAmount ? `Service Charge (${m.serviceChargePct != null ? m.serviceChargePct : 5}%): ${$(m.serviceChargeAmount)}` : '',
      m.tipAmount ? `Tip: ${$(m.tipAmount)}` : '',
      m.deliveryCharge ? `Delivery: ${$(m.deliveryCharge)}` : '',
      m.loyaltyRedeemAmount ? `Loyalty redeem: - ${$(m.loyaltyRedeemAmount)}` : '',
      m.promoAmount
        ? `Promo${m.promoCode ? ' ' + m.promoCode : ''}: - ${$(m.promoAmount)}`
        : '',
      m.liquorTaxAmount ? `Liquor VAT: ${$(m.liquorTaxAmount)}` : '',
    ];
    if (taxesEnabled()) {
      if (tax.gst_scheme === 'composition' && country === 'IN') {
        lines.push('Composition taxable person, not eligible to collect tax');
      } else if (m.gst > 0) {
        const halfGst = Math.round((m.gst || 0) / 2);
        if (country === 'IN') {
          lines.push(`CGST (2.5%): ${$(halfGst)}`);
          lines.push(`SGST (2.5%): ${$(m.gst - halfGst)}`);
          if (showHsnCodes()) lines.push('SAC: 9963');
        } else {
          lines.push(`Tax: ${$(m.gst)}`);
        }
      }
    }
    lines.push(
      `Total: ${$(m.grand)}`,
      `Paid by: ${(m.tenders[0] && m.tenders[0].method) || 'Cash'}`,
      '',
      'Thank you for dining with us!',
      'Powered by CodeArc RestroSuite',
    );
    return lines.filter((x) => x !== '' && x != null).join('\n');
  }

  function caption(bill, outletProfile) {
    const { bill: m, outlet } = buildModel(bill, outletProfile);
    const rsFn = getRs();
    const $ = (n) => money(n, rsFn);
    return [outlet.name || 'RestroSuite', m.no ? `Bill ${m.no}` : '', m.grand != null ? `Total ${$(m.grand)}` : '']
      .filter(Boolean).join(' | ');
  }

  function loadScript(src) {
    return new Promise((resolve, reject) => {
      const existing = document.querySelector(`script[src="${src}"]`);
      if (existing) {
        if (existing.dataset.loaded === '1') return resolve();
        existing.addEventListener('load', () => resolve());
        existing.addEventListener('error', () => reject(new Error('load fail ' + src)));
        return;
      }
      const s = document.createElement('script');
      s.src = src;
      s.onload = () => { s.dataset.loaded = '1'; resolve(); };
      s.onerror = () => reject(new Error('Failed to load ' + src));
      document.head.appendChild(s);
    });
  }

  async function ensureJsPDF() {
    if (global.jspdf && global.jspdf.jsPDF) return global.jspdf;
    if (global.jsPDF) return { jsPDF: global.jsPDF };
    try {
      await loadScript('assets/lib/jspdf.umd.min.js');
    } catch (_) {
      await loadScript('https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js');
    }
    if (global.jspdf && global.jspdf.jsPDF) return global.jspdf;
    if (global.jsPDF) return { jsPDF: global.jsPDF };
    throw new Error('jsPDF not available');
  }

  async function ensureHtml2Canvas() {
    if (typeof global.html2canvas === 'function') return global.html2canvas;
    await loadScript('https://cdnjs.cloudflare.com/ajax/libs/html2canvas/1.4.1/html2canvas.min.js');
    if (typeof global.html2canvas === 'function') return global.html2canvas;
    throw new Error('html2canvas not available');
  }

  /** Preload PDF libs after login so first WhatsApp send is fast. */
  function preload() {
    if (libsPreloaded || typeof document === 'undefined') return;
    libsPreloaded = true;
    const run = () => {
      ensureJsPDF().catch(() => {});
      ensureHtml2Canvas().catch(() => {});
    };
    if (global.requestIdleCallback) global.requestIdleCallback(run, { timeout: 4000 });
    else setTimeout(run, 1500);
  }

  /**
   * Public digital bill URL for QR codes.
   * IMPORTANT: use query form `/bill?slug=&no=` — production returns 404 for
   * path form `/bill/:slug/:no` (rewrite not applied on host).
   */
  function resolveTenantSlug() {
    try {
      const fromSess = sessionStorage.getItem('tenant_slug') || sessionStorage.getItem('outlet_slug');
      if (fromSess) return String(fromSess).trim();
    } catch (_) {}
    try {
      const s = global.RS_SETTINGS || {};
      const cand = s.set_outlet_code || s.set_tenant_slug || s.tenant_slug;
      if (cand) return String(cand).trim();
    } catch (_) {}
    try {
      const api = global.RS_API && RS_API.session && RS_API.session();
      if (api && (api.tenant_slug || api.slug)) return String(api.tenant_slug || api.slug).trim();
    } catch (_) {}
    return 'outlet';
  }

  function digitalBillUrl(billNo, slugOpt) {
    const no = String(billNo || '').trim();
    if (!no) return '';
    const slug = String(slugOpt || resolveTenantSlug() || 'outlet').trim() || 'outlet';
    let origin = 'https://restrosuite.codearc.co.in';
    try {
      if (typeof location !== 'undefined' && location.origin &&
          /^https?:/i.test(location.origin) &&
          location.hostname !== 'localhost' &&
          location.hostname !== '127.0.0.1' &&
          location.protocol !== 'file:') {
        origin = location.origin.replace(/\/$/, '');
      }
    } catch (_) {}
    return origin + '/bill?slug=' + encodeURIComponent(slug) + '&no=' + encodeURIComponent(no);
  }

  async function qrDataUriFor(bill) {
    const m = normalizeBill(bill);
    if (!global.QRCode || !m.no) return null;
    return new Promise((resolve) => {
      try {
        const digitalUrl = digitalBillUrl(m.no);
        global.QRCode.toDataURL(digitalUrl, { width: 200, margin: 1 }, (err, url) => {
          resolve(err ? null : url);
        });
      } catch (_) {
        resolve(null);
      }
    });
  }

  function cacheKey(bill) {
    const m = normalizeBill(bill);
    return String(m.no || '') + '|' + String(m.grand) + '|' + String((m.items || []).length);
  }

  function getCachedPdf(bill) {
    const key = cacheKey(bill);
    const hit = PDF_CACHE.get(key);
    if (!hit) return null;
    if (Date.now() - hit.at > PDF_CACHE_TTL_MS) {
      PDF_CACHE.delete(key);
      return null;
    }
    return hit.dataUri;
  }

  function setCachedPdf(bill, dataUri) {
    PDF_CACHE.set(cacheKey(bill), { dataUri, at: Date.now() });
    // Cap cache size
    if (PDF_CACHE.size > 30) {
      const first = PDF_CACHE.keys().next().value;
      PDF_CACHE.delete(first);
    }
  }

  /** PDF = pixel capture of the same HTML used in Bill settled preview.
   *  opts.mode = 'thermal' uses lighter pure-jsPDF path when RS.compileThermalPDF exists.
   */
  async function toPDF(bill, opts) {
    const options = opts || {};
    const preferThermal = options.mode === 'thermal'
      || (global.RS_SETTINGS && (global.RS_SETTINGS.set_wa_thermal_pdf === true || global.RS_SETTINGS.set_wa_thermal_pdf === 'true' || global.RS_SETTINGS.set_receipt_pdf_mode === 'thermal'));
    if (preferThermal && global.RS && typeof global.RS.compileThermalPDF === 'function') {
      try {
        const thermal = await global.RS.compileThermalPDF(bill);
        if (thermal) {
          setCachedPdf(bill, thermal);
          return thermal;
        }
      } catch (e) {
        console.warn('[Receipt] thermal PDF failed, using preview capture', e && e.message);
      }
    }
    if (!options.skipCache) {
      const cached = getCachedPdf(bill);
      if (cached) return cached;
    }
    const { jsPDF } = await ensureJsPDF();
    const html2canvas = await ensureHtml2Canvas();
    const qr = options.qrDataUri !== undefined ? options.qrDataUri : await qrDataUriFor(bill);
    const html = toHTML(bill, qr, options.outletProfile);

    const host = document.createElement('div');
    host.setAttribute('data-rs-receipt-export', '1');
    host.style.cssText = 'position:fixed;left:-10000px;top:0;width:360px;padding:16px;margin:0;background:#efebe6;z-index:2147483000;pointer-events:none;';
    host.innerHTML = `<style>${EXPORT_CSS}</style><div class="receipt-paper">${html}</div>`;
    document.body.appendChild(host);

    try {
      const qrImg = host.querySelector('img');
      if (qrImg && !qrImg.complete) {
        await new Promise((resolve) => {
          qrImg.onload = resolve;
          qrImg.onerror = resolve;
          setTimeout(resolve, 1200);
        });
      }
      await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));

      const paper = host.querySelector('.receipt-paper') || host;
      const canvas = await html2canvas(paper, {
        scale: PDF_SCALE,
        backgroundColor: '#fbfaf7',
        useCORS: true,
        allowTaint: true,
        logging: false,
        imageTimeout: 4000,
        width: Math.max(paper.scrollWidth || 320, 280),
        windowWidth: 400,
      });
      const img = canvas.toDataURL('image/png');
      const pageWmm = 80;
      const pageHmm = Math.max(110, (canvas.height / canvas.width) * pageWmm + 2);
      const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: [pageWmm, pageHmm] });
      doc.setFillColor(251, 250, 247);
      doc.rect(0, 0, pageWmm, pageHmm, 'F');
      doc.addImage(img, 'PNG', 0, 0, pageWmm, pageHmm);
      const dataUri = doc.output('datauristring');
      setCachedPdf(bill, dataUri);
      return dataUri;
    } finally {
      if (host.parentNode) host.parentNode.removeChild(host);
    }
  }

  async function withRetry(fn, attempts, label) {
    let lastErr;
    for (let i = 0; i < attempts; i++) {
      try {
        return await fn(i);
      } catch (e) {
        lastErr = e;
        console.warn('[Receipt]', label, 'attempt', i + 1, e && e.message);
        if (i < attempts - 1) await new Promise((r) => setTimeout(r, 400 * (i + 1)));
      }
    }
    throw lastErr || new Error(label + ' failed');
  }

  async function sendWhatsApp(bill, phone, options) {
    const opts = options || {};
    const cleanPhone = String(phone || '').replace(/\D/g, '');
    if (cleanPhone.length < 10) throw new Error('Invalid WhatsApp number');

    const text = toText(bill);
    const cap = caption(bill);
    global.__rsLastWaError = null;

    // Refresh gateway status when possible (skip when queue retry already knows Ready)
    if (!opts.skipStatusRefresh) {
      try {
        if (typeof global.updateTopbarWhatsAppStatus === 'function') {
          await Promise.race([
            global.updateTopbarWhatsAppStatus(),
            new Promise((r) => setTimeout(r, 2000)),
          ]);
        }
      } catch (_) {}
    }

    // Zero-cost launch: still use FREE platform Baileys gateway when online.
    // (zeroCostLaunchMode only blocks paid Meta Cloud API / paid BSPs — not our own PC gateway.)
    const gatewayReady = global.__rsGatewayReady === true
      || global.__rsPlatformReady === true
      || (global.RS_API && typeof global.RS_API.data === 'function');

    if (global.RS_API && typeof global.RS_API.data === 'function') {
      // Prefer PDF = exact preview (retry compile + send once)
      try {
        const dataUri = await withRetry(
          async (attempt) => toPDF(bill, attempt > 0 ? { skipCache: true } : {}),
          2,
          'toPDF'
        );
        const base64 = String(dataUri).includes(',') ? String(dataUri).split(',')[1] : String(dataUri);
        if (!base64 || base64.length < 100) throw new Error('Empty PDF');
        await withRetry(
          async () =>
            Promise.race([
              global.RS_API.data({
                operation: 'gateway_send',
                phone: cleanPhone,
                message: cap,
                caption: cap,
                pdfData: base64,
                filename: `receipt-${normalizeBill(bill).no || 'bill'}.pdf`,
                orderId: String(normalizeBill(bill).no || ''),
                outletName:
                  (global.RS_SETTINGS && (RS_SETTINGS.set_outlet_name || RS_SETTINGS.set_restaurant_name)) ||
                  '',
              }),
              new Promise((_, rej) =>
                setTimeout(() => rej(new Error('Gateway send timed out')), opts.timeoutMs || 30000)
              ),
            ]),
          2,
          'gateway_send pdf'
        );
        global.__rsGatewayReady = true;
        global.__rsLastWaMode = 'pdf';
        return { mode: 'pdf', phone: cleanPhone };
      } catch (pdfErr) {
        console.warn('[Receipt] PDF WhatsApp failed:', pdfErr && pdfErr.message);
        global.__rsLastWaError = (pdfErr && pdfErr.message) || 'PDF send failed';
        try {
          await withRetry(
            async () =>
              global.RS_API.data({
                operation: 'gateway_send',
                phone: cleanPhone,
                message: text,
                orderId: String(normalizeBill(bill).no || ''),
              }),
            2,
            'gateway_send text'
          );
          global.__rsLastWaMode = 'text';
          return { mode: 'text', phone: cleanPhone, warning: pdfErr && pdfErr.message };
        } catch (textErr) {
          console.warn('[Receipt] Text WhatsApp failed:', textErr && textErr.message);
          global.__rsLastWaError = (textErr && textErr.message) || global.__rsLastWaError;
        }
      }
    }

    // Queue for auto-retry when gateway is Ready (unless caller disables)
    let queued = false;
    if (!opts.skipQueue && global.RSWaSendQueue && typeof RSWaSendQueue.enqueue === 'function') {
      try {
        const q = RSWaSendQueue.enqueue({
          phone: cleanPhone,
          bill,
          message: text,
          caption: cap,
          lastError: global.__rsLastWaError || 'gateway unavailable',
        });
        queued = !!(q && q.ok);
      } catch (_) {}
    }

    // Last resort: WhatsApp Web with same text content (unless queue-only silent)
    if (!opts.skipWaMe) {
      const waUrl = `https://wa.me/${cleanPhone}?text=${encodeURIComponent(text)}`;
      global.open(waUrl, '_blank', 'noopener,noreferrer');
    }
    global.__rsLastWaMode = 'wa.me';
    return {
      mode: 'wa.me',
      phone: cleanPhone,
      gatewayReady,
      warning: global.__rsLastWaError,
      queued,
    };
  }

  // Do NOT warm PDF on bill-paid while Bill settled is open — html2canvas freezes
  // main-thread scroll for several seconds. Warm only after modal is gone, or on demand.
  document.addEventListener('rs:bill-paid', (ev) => {
    try {
      const bill = ev && ev.detail && (ev.detail.bill || ev.detail);
      if (!bill || !global.RSReceiptEngine) return;
      const warm = () => {
        if (global.__rsSettleModalOpen || document.querySelector('.rc-settle-modal')) return;
        toPDF(bill).catch(() => {});
      };
      // Far after settle UI interaction so scroll never fights the capture
      setTimeout(() => {
        if (global.requestIdleCallback) global.requestIdleCallback(warm, { timeout: 12000 });
        else warm();
      }, 12000);
    } catch (_) {}
  });

  const api = {
    normalizeBill,
    buildModel,
    toHTML,
    toText,
    caption,
    toPDF,
    sendWhatsApp,
    preload,
    getCachedPdf,
    qrDataUriFor,
    digitalBillUrl,
    resolveTenantSlug,
    qrBlockHtml,
    clearPdfCache: () => PDF_CACHE.clear(),
    EXPORT_CSS,
  };

  global.RSReceiptEngine = api;

  // Friendly alias used by POS
  global.RSReceiptCore = api;
})(typeof window !== 'undefined' ? window : globalThis);



/* === assets/modules/wa-send-queue.js === */
/* ============================================================
   RestroSuite — WhatsApp failed-send queue
   Local queue; auto-retry when gateway status is ready.
   Does NOT store PDF base64 (quota) — recompiles from bill snapshot.
   ============================================================ */
(function (global) {
  'use strict';

  const STORAGE_KEY = 'rs:wa_send_queue';
  const MAX_ITEMS = 40;
  const MAX_ATTEMPTS = 8;
  const RETRY_COOLDOWN_MS = 8000;

  let processing = false;
  let lastProcessAt = 0;

  function toast(msg, icon) {
    if (global.RS && typeof RS.toast === 'function') {RS.toast(msg, icon);}
  }

  function tenantKey() {
    try {
      const s = (global.RS_API && RS_API.session && RS_API.session()) || {};
      return String(s.tenant_id || s.tenant_slug || sessionStorage.getItem('tenant_id') || sessionStorage.getItem('tenant_slug') || 'local');
    } catch (_) {
      return 'local';
    }
  }

  function readAll() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) {return [];}
      const arr = JSON.parse(raw);
      return Array.isArray(arr) ? arr : [];
    } catch (_) {
      return [];
    }
  }

  function writeAll(list) {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify((list || []).slice(-MAX_ITEMS)));
    } catch (e) {
      console.warn('[WaQueue] write failed', e);
    }
    paintBadge();
    try {
      document.dispatchEvent(new CustomEvent('rs:wa-queue-changed', { detail: { count: count() } }));
    } catch (_) {}
  }

  function list() {
    const tk = tenantKey();
    return readAll().filter((x) => !x.tenantKey || x.tenantKey === tk);
  }

  function count() {
    return list().length;
  }

  function slimBill(bill) {
    if (!bill || typeof bill !== 'object') {return null;}
    // Keep fields needed to re-render PDF/text — skip huge blobs
    const items = Array.isArray(bill.items)
      ? bill.items
      : Array.isArray(bill._items)
        ? bill._items
        : [];
    return {
      no: bill.no || bill.orderId || bill.id,
      orderId: bill.orderId || bill.no,
      id: bill.id,
      time: bill.time || bill.dateTime,
      dateTime: bill.dateTime || bill.time,
      table: bill.table || bill.tableNumber || '--',
      tableNumber: bill.tableNumber || bill.table,
      customer: bill.customer || bill.customerName || '',
      customerName: bill.customerName || bill.customer || '',
      customerPhone: bill.customerPhone || '',
      items: items.map((i) => ({
        name: i.name || 'Item',
        qty: Number(i.qty) || 1,
        price: Number(i.price) || 0,
        note: i.note || i.notes || '',
      })),
      _items: items.map((i) => ({
        name: i.name || 'Item',
        qty: Number(i.qty) || 1,
        price: Number(i.price) || 0,
      })),
      sub: bill.sub != null ? bill.sub : bill.subtotal,
      subtotal: bill.subtotal != null ? bill.subtotal : bill.sub,
      gst: bill.gst,
      disc: bill.disc || bill.discount || 0,
      discount: bill.discount || bill.disc || 0,
      grand: bill.grand != null ? bill.grand : bill.amount != null ? bill.amount : bill.total,
      amount: bill.amount != null ? bill.amount : bill.grand != null ? bill.grand : bill.total,
      total: bill.total != null ? bill.total : bill.amount,
      tenders: Array.isArray(bill.tenders) ? bill.tenders : undefined,
      pay: bill.pay || bill.paymentMethod,
      paymentMethod: bill.paymentMethod || bill.pay,
    };
  }

  /**
   * Enqueue a failed WhatsApp bill send.
   * @returns {{ ok:boolean, id?:string, reason?:string, count?:number }}
   */
  function enqueue(entry) {
    if (!entry || !entry.phone) {return { ok: false, reason: 'missing phone' };}
    const phone = String(entry.phone).replace(/\D/g, '');
    if (phone.length < 10) {return { ok: false, reason: 'bad phone' };}

    const billSnap = slimBill(entry.bill);
    const orderId = String(
      (billSnap && (billSnap.no || billSnap.orderId)) || entry.orderId || ''
    );
    const all = readAll();
    // Dedupe same bill+phone pending
    const exists = all.findIndex(
      (x) =>
        x.phone === phone &&
        String(x.orderId || '') === orderId &&
        (!x.tenantKey || x.tenantKey === tenantKey())
    );
    const row = {
      id: exists >= 0 ? all[exists].id : 'waq-' + Date.now() + '-' + Math.random().toString(36).slice(2, 7),
      tenantKey: tenantKey(),
      phone,
      orderId,
      bill: billSnap,
      message: entry.message || entry.text || '',
      caption: entry.caption || '',
      attempts: exists >= 0 ? all[exists].attempts || 0 : 0,
      lastError: entry.lastError || entry.error || '',
      createdAt: exists >= 0 ? all[exists].createdAt : new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    if (exists >= 0) {all[exists] = row;}
    else {all.push(row);}
    writeAll(all);
    return { ok: true, id: row.id, count: count() };
  }

  function remove(id) {
    writeAll(readAll().filter((x) => x.id !== id));
  }

  function clear() {
    const tk = tenantKey();
    writeAll(readAll().filter((x) => x.tenantKey && x.tenantKey !== tk));
  }

  function gatewayReady() {
    return (
      global.__rsGatewayReady === true ||
      global.__rsGatewayLastStatus === 'ready' ||
      global.__rsGatewayLastStatus === 'authenticated'
    );
  }

  async function sendOne(item) {
    if (!global.RS_API || typeof RS_API.data !== 'function' || RS_API.zeroCostLaunchMode) {
      throw new Error('Gateway API unavailable');
    }
    if (!gatewayReady()) {throw new Error('WhatsApp not ready');}

    const bill = item.bill || {};
    const phone = item.phone;
    const orderId = String(item.orderId || bill.no || '');

    // Prefer engine send (PDF → text)
    if (global.RSReceiptEngine && typeof RSReceiptEngine.sendWhatsApp === 'function') {
      const result = await RSReceiptEngine.sendWhatsApp(bill, phone, {
        timeoutMs: 28000,
        skipStatusRefresh: true,
      });
      if (result && (result.mode === 'pdf' || result.mode === 'text')) {
        return result;
      }
      throw new Error((result && result.warning) || 'Send fell back to wa.me');
    }

    // Text-only fallback
    const text =
      item.message ||
      (global.RSReceiptEngine && RSReceiptEngine.toText
        ? RSReceiptEngine.toText(bill)
        : 'Bill ' + orderId);
    await RS_API.data({
      operation: 'gateway_send',
      phone,
      message: text,
      orderId,
    });
    return { mode: 'text', phone };
  }

  async function processQueue(opts) {
    const options = opts || {};
    if (processing) {return { processed: 0, skipped: true };}
    if (!gatewayReady() && !options.force) {return { processed: 0, ready: false };}
    if (Date.now() - lastProcessAt < RETRY_COOLDOWN_MS && !options.force) {
      return { processed: 0, cooldown: true };
    }

    const pending = list().filter((x) => (x.attempts || 0) < MAX_ATTEMPTS);
    if (!pending.length) {
      paintBadge();
      return { processed: 0, empty: true };
    }

    processing = true;
    lastProcessAt = Date.now();
    let okN = 0;
    let failN = 0;

    try {
      for (const item of pending) {
        if (!gatewayReady() && !options.force) {break;}
        try {
          await sendOne(item);
          remove(item.id);
          okN++;
        } catch (e) {
          failN++;
          const all = readAll();
          const idx = all.findIndex((x) => x.id === item.id);
          if (idx >= 0) {
            all[idx].attempts = (all[idx].attempts || 0) + 1;
            all[idx].lastError = (e && e.message) || 'send failed';
            all[idx].updatedAt = new Date().toISOString();
            if (all[idx].attempts >= MAX_ATTEMPTS) {
              all[idx].dead = true;
            }
            writeAll(all);
          }
        }
        // Small gap between retries (human / ban hygiene)
        await new Promise((r) => { setTimeout(r, 1200); });
      }
    } finally {
      processing = false;
      paintBadge();
    }

    if (okN > 0) {
      toast(
        okN === 1
          ? 'Queued WhatsApp bill sent'
          : okN + ' queued WhatsApp bills sent',
        'fa-whatsapp'
      );
    }
    return { processed: okN, failed: failN };
  }

  function paintBadge() {
    const n = count();
    let el = document.getElementById('rs-wa-queue-pill');
    if (n <= 0) {
      if (el) {el.style.display = 'none';}
      return;
    }
    if (!el) {
      el = document.createElement('button');
      el.type = 'button';
      el.id = 'rs-wa-queue-pill';
      el.className = 'rs-wa-queue-pill';
      el.setAttribute('role', 'status');
      el.style.cssText =
        'position:fixed;right:14px;bottom:14px;z-index:99996;' +
        'background:#128C7E;color:#fff;padding:8px 14px;border-radius:999px;border:none;' +
        'font-size:12.5px;font-weight:700;box-shadow:0 6px 18px rgba(0,0,0,.22);' +
        'display:flex;align-items:center;gap:8px;cursor:pointer;font-family:inherit;max-width:90vw';
      el.innerHTML =
        '<i class="fa-brands fa-whatsapp"></i><span id="rs-wa-queue-pill-text"></span>';
      el.onclick = () => openQueuePanel();
      document.body.appendChild(el);
    }
    const t = document.getElementById('rs-wa-queue-pill-text');
    if (t) {
      t.textContent =
        n + ' bill' + (n === 1 ? '' : 's') + ' waiting for WhatsApp';
    }
    el.style.display = 'flex';
    el.title = 'Click to view queue · auto-sends when WhatsApp is Ready';
  }

  function openQueuePanel() {
    const items = list();
    const body =
      items.length === 0
        ? '<p style="color:var(--text-soft);font-size:13px">No pending WhatsApp bills.</p>'
        : `<div style="display:flex;flex-direction:column;gap:8px;max-height:320px;overflow:auto">
        ${items
          .map(
            (x) => `
          <div style="padding:10px 12px;border:1px solid var(--stroke);border-radius:10px;font-size:12.5px">
            <div style="font-weight:700;color:var(--text)">${esc(x.orderId || 'Bill')} · +${esc(x.phone)}</div>
            <div style="color:var(--text-soft);margin-top:4px">Tries ${x.attempts || 0}/${MAX_ATTEMPTS}${
              x.lastError ? ' · ' + esc(String(x.lastError).slice(0, 60)) : ''
            }${x.dead ? ' · <b style="color:var(--red)">stopped</b>' : ''}</div>
            <button type="button" class="btn btn-ghost btn-sm" data-drop="${esc(x.id)}" style="margin-top:6px">Remove</button>
          </div>`
          )
          .join('')}
      </div>`;

    if (!global.RSModal) {
      toast(count() + ' pending WhatsApp send(s)', 'fa-whatsapp');
      processQueue({ force: false });
      return;
    }
    RSModal.open({
      title: 'WhatsApp send queue',
      sub: 'Auto-retries when status is Ready',
      icon: 'fa-brands fa-whatsapp',
      size: 'sm',
      body,
      foot: `<button type="button" class="btn btn-ghost" id="waq-clear">Clear all</button>
             <button type="button" class="btn btn-primary" id="waq-retry" style="flex:1"><i class="fa-solid fa-rotate"></i> Retry now</button>`,
      onMount(modal, close) {
        modal.querySelectorAll('[data-drop]').forEach((b) => {
          b.onclick = () => {
            remove(b.getAttribute('data-drop'));
            close();
            setTimeout(openQueuePanel, 100);
          };
        });
        const clearBtn = modal.querySelector('#waq-clear');
        if (clearBtn)
          {clearBtn.onclick = () => {
            if (confirm('Clear all queued WhatsApp bills for this outlet?')) {
              clear();
              close();
            }
          };}
        const retry = modal.querySelector('#waq-retry');
        if (retry)
          {retry.onclick = async () => {
            retry.disabled = true;
            retry.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Sending…';
            await processQueue({ force: true });
            close();
            if (count() > 0) {setTimeout(openQueuePanel, 120);}
          };}
      },
    });
  }

  function esc(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  // When status becomes ready, drain queue
  let prevReady = false;
  function onStatusMaybeReady() {
    const ready = gatewayReady();
    if (ready && count() > 0) {
      processQueue({ force: false });
    }
    if (ready && !prevReady && count() > 0) {
      toast('WhatsApp back online — sending queued bills…', 'fa-whatsapp');
    }
    prevReady = ready;
    paintBadge();
  }

  // Hook status updates
  const _origUpdate = () => {};
  function installStatusHook() {
    const wrap = () => {
      if (typeof global.updateTopbarWhatsAppStatus !== 'function') {return;}
      if (global.updateTopbarWhatsAppStatus.__waQueueHooked) {return;}
      const orig = global.updateTopbarWhatsAppStatus;
      global.updateTopbarWhatsAppStatus = async function () {
        const r = await orig.apply(this, arguments);
        try {
          onStatusMaybeReady();
        } catch (_) {}
        return r;
      };
      global.updateTopbarWhatsAppStatus.__waQueueHooked = true;
    };
    wrap();
    document.addEventListener('rs:ready', wrap);
    setInterval(wrap, 5000);
    setInterval(() => {
      if (gatewayReady() && count() > 0) {processQueue({ force: false });}
      else {paintBadge();}
    }, 20000);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
      paintBadge();
      installStatusHook();
    });
  } else {
    paintBadge();
    installStatusHook();
  }

  const api = {
    enqueue,
    list,
    count,
    remove,
    clear,
    processQueue,
    paintBadge,
    openQueuePanel,
    slimBill,
  };

  global.RSWaSendQueue = api;
})(typeof window !== 'undefined' ? window : globalThis);



/* === assets/competitive-ops.js === */
/* ============================================================
   RestroSuite — Competitive Ops Layer (Wave 3)
   Multi-station · keyboard POS · shifts/Z-report · stock warns
   thermal print preference · bills paging · owner strip · dues
   ============================================================ */
(function (global) {
  'use strict';

  const STATION_KEY = 'rs_station_id';
  const SHIFT_KEY = 'rs_open_shift';
  const BILLS_PAGE_SIZE = 50;
  let billsPage = 0;
  let stockWarnCache = {};

  function toast(msg, icon) {
    if (global.RS && RS.toast) RS.toast(msg, icon || 'fa-circle-info');
  }
  function rs(n) {
    return (global.RS && RS.rs) ? RS.rs(n) : ('₹' + (Number(n) || 0));
  }
  function esc(v) {
    return String(v == null ? '' : v).replace(/[&<>"']/g, (ch) =>
      ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]));
  }
  function session() {
    try { return (global.RS_API && RS_API.session && RS_API.session()) || {}; } catch (_) { return {}; }
  }

  /* ---------------- Loyalty (earn / redeem / tiers) ---------------- */
  function loyaltyEnabled() {
    if (typeof global.RS_featureOn === 'function') {
      return global.RS_featureOn('set_loyalty_program', global.RS_SETTINGS, false);
    }
    const s = global.RS_SETTINGS || {};
    return s.set_loyalty_program === true || s.set_loyalty_program === 'true';
  }
  function loyaltyEarnRate() {
    const n = Number((global.RS_SETTINGS || {}).set_loyalty_earn_rate);
    return Number.isFinite(n) && n > 0 ? n : 100; // 1 pt per N currency of spend
  }
  function loyaltyPointValue() {
    const n = Number((global.RS_SETTINGS || {}).set_loyalty_point_value);
    return Number.isFinite(n) && n > 0 ? n : 1; // 1 pt = N currency when redeeming
  }
  function tierFromSpend(spend) {
    const s = Number(spend) || 0;
    if (s >= 10000) return 'vip';
    if (s >= 5000) return 'gold';
    return 'silver';
  }
  function tierEarnMult(tier) {
    const t = String(tier || 'silver').toLowerCase();
    if (t === 'vip' || t === 'platinum') return 3;
    if (t === 'gold') return 2;
    return 1;
  }
  function calcEarnPoints(spendAmount, tier) {
    if (!loyaltyEnabled()) return 0;
    const base = Math.floor(Math.max(0, Number(spendAmount) || 0) / loyaltyEarnRate());
    return base * tierEarnMult(tier);
  }
  function pointsToCurrency(pts) {
    return Math.round((Math.max(0, Number(pts) || 0) * loyaltyPointValue()) * 100) / 100;
  }
  function currencyToPoints(amount) {
    const v = loyaltyPointValue();
    if (v <= 0) return 0;
    return Math.ceil(Math.max(0, Number(amount) || 0) / v);
  }
  function customerPoints(c) {
    if (!c) return 0;
    if (c.points != null && Number.isFinite(Number(c.points))) return Math.max(0, Math.floor(Number(c.points)));
    // Backfill from lifetime spend for older CRM rows
    return Math.max(0, Math.floor((Number(c.spend) || 0) / loyaltyEarnRate()));
  }
  function applyLoyaltyEarnToCustomer(matched, bill, dueAmount) {
    const earnBase = Math.max(
      0,
      (Number(bill.grand) || 0) - (Number(bill.tipAmount) || 0) + (Number(bill.loyaltyRedeemAmount) || 0)
    );
    // spend still tracks full bill; points earn on food+tax after redeem already applied to grand
    matched.visits = (matched.visits || 0) + 1;
    matched.spend = (matched.spend || 0) + (Number(bill.grand) || 0);
    matched.last = new Date().toLocaleDateString('en-CA');
    if (dueAmount > 0) matched.dues = (matched.dues || 0) + dueAmount;
    const ptsUsed = Math.max(0, Number(bill.loyaltyPointsUsed) || 0);
    let pts = customerPoints(matched);
    if (ptsUsed > 0) pts = Math.max(0, pts - ptsUsed);
    matched.tier = tierFromSpend(matched.spend);
    const earned = calcEarnPoints(earnBase, matched.tier);
    matched.points = pts + earned;
    matched.pointsEarnedLast = earned;
    matched.pointsRedeemedLast = ptsUsed;
    return { earned, ptsUsed, balance: matched.points, tier: matched.tier };
  }
  function paintLoyaltyBanner(customer) {
    let ban = document.getElementById('cart-loyalty-banner');
    if (!loyaltyEnabled()) {
      if (ban) ban.style.display = 'none';
      return;
    }
    // Prefer after dues banner / under customer chip (not inside expanding form overlay)
    const dues = document.getElementById('cart-customer-dues-banner');
    const host =
      dues?.parentElement ||
      document.getElementById('custom-customer-widget') ||
      document.querySelector('.pos-cart');
    if (!host) return;
    if (!ban) {
      ban = document.createElement('div');
      ban.id = 'cart-loyalty-banner';
      ban.style.cssText =
        'display:none;font-size:11px;padding:5px 8px;border-radius:8px;border:1px solid rgba(139,92,246,.3);background:rgba(139,92,246,.08);color:var(--text-soft);line-height:1.3;margin-top:4px';
      if (dues && dues.parentElement === host) dues.insertAdjacentElement('afterend', ban);
      else host.appendChild(ban);
    }
    if (!customer) {
      ban.style.display = 'none';
      ban.innerHTML = '';
      return;
    }
    const pts = customerPoints(customer);
    const redeem = (global.RS && RS.getLoyaltyRedeem && RS.getLoyaltyRedeem()) || { amount: 0, points: 0 };
    const applied =
      redeem.amount > 0
        ? ` · applied −${rs(redeem.amount)} (${redeem.points} pts)`
        : '';
    ban.style.display = 'block';
    ban.innerHTML = `<div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap">
      <span><i class="fa-solid fa-star" style="color:#a78bfa"></i> <b style="color:var(--text)">${pts}</b> pts · ${esc(String(customer.tier || 'silver').toUpperCase())}${applied}</span>
      <button type="button" class="btn btn-ghost btn-sm" id="btn-loyalty-redeem" style="margin-left:auto;height:28px;font-size:11px;padding:0 10px" ${pts < 1 ? 'disabled' : ''}><i class="fa-solid fa-gift"></i> Redeem</button>
      ${redeem.amount > 0 ? '<button type="button" class="btn btn-ghost btn-sm" id="btn-loyalty-clear" style="height:28px;font-size:11px;padding:0 8px">Clear</button>' : ''}
    </div>`;
    const btn = ban.querySelector('#btn-loyalty-redeem');
    if (btn && !btn.disabled) {
      btn.onclick = () => openRedeemModal(customer);
    }
    const clr = ban.querySelector('#btn-loyalty-clear');
    if (clr) {
      clr.onclick = () => {
        if (global.RS && RS.setLoyaltyRedeem) RS.setLoyaltyRedeem(0, 0);
        paintLoyaltyBanner(customer);
        toast('Loyalty redeem cleared', 'fa-gift');
      };
    }
  }
  function openRedeemModal(customer) {
    if (!global.RSModal) {
      toast('Modal unavailable', 'fa-circle-exclamation');
      return;
    }
    const pts = customerPoints(customer);
    const maxCurrency = pointsToCurrency(pts);
    const totals = global.RS && RS.getTotals ? RS.getTotals() : { grand: 0 };
    // Cap redeem so cart still has a non-negative payable (leave tip alone)
    const cap = Math.max(0, (Number(totals.grand) || 0) + ((global.RS && RS.getLoyaltyRedeem && RS.getLoyaltyRedeem().amount) || 0));
    const maxApply = Math.min(maxCurrency, cap);
    RSModal.open({
      title: 'Redeem loyalty points',
      sub: `${customer.name || 'Guest'} · ${pts} pts available (≈ ${rs(maxCurrency)})`,
      icon: 'fa-gift',
      size: 'sm',
      body: `<p style="font-size:13px;color:var(--text-soft);margin:0 0 12px">1 pt = ${rs(loyaltyPointValue())}. Earn 1 pt per ${rs(loyaltyEarnRate())} spent (×2 Gold, ×3 VIP).</p>
        <label class="fl">Points to redeem</label>
        <input type="number" class="form-input" id="loyal-pts" min="0" max="${pts}" value="${Math.min(pts, currencyToPoints(maxApply))}" style="margin-bottom:8px">
        <div style="font-size:12.5px;color:var(--text-soft)">Value: <b id="loyal-val">${rs(Math.min(maxApply, pointsToCurrency(Math.min(pts, currencyToPoints(maxApply)))))}</b> · max ${rs(maxApply)}</div>
        <div style="display:flex;gap:6px;margin-top:10px;flex-wrap:wrap">
          <button type="button" class="btn btn-ghost btn-sm" data-loyal-max>Max</button>
          <button type="button" class="btn btn-ghost btn-sm" data-loyal-half>Half</button>
        </div>`,
      foot: `<button class="btn btn-ghost" style="flex:1" data-x>Cancel</button><button class="btn btn-primary" style="flex:1" data-ok><i class="fa-solid fa-check"></i> Apply</button>`,
      onMount(m, close) {
        const inp = m.querySelector('#loyal-pts');
        const valEl = m.querySelector('#loyal-val');
        const sync = () => {
          let p = Math.max(0, Math.min(pts, Math.floor(Number(inp.value) || 0)));
          let cur = pointsToCurrency(p);
          if (cur > maxApply) {
            cur = maxApply;
            p = currencyToPoints(cur);
            if (pointsToCurrency(p) > maxApply) p = Math.max(0, p - 1);
            inp.value = p;
            cur = pointsToCurrency(p);
          }
          if (valEl) valEl.textContent = rs(cur);
          return { p, cur };
        };
        inp.addEventListener('input', sync);
        m.querySelector('[data-loyal-max]').onclick = () => {
          inp.value = currencyToPoints(maxApply);
          if (pointsToCurrency(Number(inp.value)) > maxApply) inp.value = Math.max(0, Number(inp.value) - 1);
          // walk down until under cap
          while (pointsToCurrency(Number(inp.value) || 0) > maxApply && Number(inp.value) > 0) {
            inp.value = Number(inp.value) - 1;
          }
          sync();
        };
        m.querySelector('[data-loyal-half]').onclick = () => {
          inp.value = Math.floor(pts / 2);
          sync();
        };
        m.querySelector('[data-x]').onclick = close;
        m.querySelector('[data-ok]').onclick = async () => {
          const { p, cur } = sync();
          if (p < 1 || cur <= 0) {
            toast('Enter points to redeem', 'fa-circle-exclamation');
            return;
          }
          // PIN for large redemptions (default threshold 100 pts)
          const thr = Number((global.RS_SETTINGS || {}).set_pin_loyalty_threshold) || 100;
          if (p >= thr && global.RSPinModal && typeof RSPinModal.require === 'function') {
            const ok = await RSPinModal.require('Redeem ' + p + ' loyalty points', {
              settingKey: 'set_pin_gate_loyalty',
            });
            if (!ok) {
              toast('Redeem cancelled — PIN required', 'fa-lock');
              return;
            }
          }
          if (global.RS && RS.setLoyaltyRedeem) RS.setLoyaltyRedeem(cur, p);
          close();
          paintLoyaltyBanner(customer);
          toast(`Redeemed ${p} pts (−${rs(cur)})`, 'fa-gift');
        };
        sync();
      },
    });
  }
  global.RSLoyalty = {
    enabled: loyaltyEnabled,
    earnRate: loyaltyEarnRate,
    pointValue: loyaltyPointValue,
    tierFromSpend,
    calcEarnPoints,
    pointsToCurrency,
    currencyToPoints,
    customerPoints,
    applyLoyaltyEarnToCustomer,
    paintBanner: paintLoyaltyBanner,
  };

  /* ---------------- POS promo / coupon codes ---------------- */
  function promoEnabled() {
    if (typeof global.RS_featureOn === 'function') {
      return global.RS_featureOn('set_pos_promo_codes', global.RS_SETTINGS, false);
    }
    const s = global.RS_SETTINGS || {};
    return s.set_pos_promo_codes === true || s.set_pos_promo_codes === 'true';
  }
  function parseOfferExpiry(o) {
    if (!o) return null;
    if (o.expiresAt) {
      const t = Date.parse(o.expiresAt);
      if (!Number.isNaN(t)) return t;
      // en-IN style or "14 days" stored as display string — treat missing parse as open
      return null;
    }
    if (o.expires_at) {
      const t = Date.parse(o.expires_at);
      return Number.isNaN(t) ? null : t;
    }
    return null;
  }
  function offerIsActive(o) {
    if (!o) return false;
    const st = String(o.status || 'active').toLowerCase();
    // paused / inactive / expired must NOT apply on POS
    if (
      st === 'redeemed' ||
      st === 'expired' ||
      st === 'cancelled' ||
      st === 'canceled' ||
      st === 'paused' ||
      st === 'inactive' ||
      st === 'disabled'
    ) {
      return false;
    }
    // Accept active POS offers and CRM "sent" personal coupons
    if (st && st !== 'active' && st !== 'sent' && st !== 'open') return false;
    const exp = parseOfferExpiry(o);
    if (exp && exp < Date.now()) return false;
    return true;
  }
  async function findOfferByCode(code) {
    const c = String(code || '')
      .trim()
      .toUpperCase();
    if (!c) return null;
    let rows = [];
    try {
      if (global.RS_DB && RS_DB.list) rows = (await RS_DB.list('offers')) || [];
    } catch (_) {}
    return (
      rows.find((o) => String(o.code || '').trim().toUpperCase() === c && offerIsActive(o)) || null
    );
  }
  async function applyPromoCode(rawCode) {
    if (!promoEnabled()) {
      toast('Promo codes disabled in settings', 'fa-circle-info');
      return false;
    }
    const code = String(rawCode || '')
      .trim()
      .toUpperCase();
    if (!code) {
      toast('Enter a promo code', 'fa-circle-exclamation');
      return false;
    }
    const offer = await findOfferByCode(code);
    if (!offer) {
      // Allow local quick promos from settings: set_promo_demo_code / pct
      const s = global.RS_SETTINGS || {};
      const demo = String(s.set_demo_promo_code || 'WELCOME10').toUpperCase();
      const rawPct = s.set_demo_promo_pct;
      const demoPct = Number(
        rawPct != null && rawPct !== '' ? rawPct : 10
      );
      if (code === demo && Number.isFinite(demoPct) && demoPct > 0) {
        if (global.RS && RS.setPromo) {
          RS.setPromo({ code, pct: demoPct, fixed: 0, title: 'Outlet promo', offerId: null });
        }
        toast(`Promo ${code} applied · ${demoPct}% off`, 'fa-tags');
        return true;
      }
      toast('Invalid or expired promo code', 'fa-circle-exclamation');
      return false;
    }
    const pct = Math.max(0, Math.min(100, Number(offer.pct != null ? offer.pct : offer.discount_pct) || 0));
    const fixed = Math.max(0, Number(offer.fixed != null ? offer.fixed : offer.amount) || 0);
    if (!(pct > 0 || fixed > 0)) {
      toast('Offer has no discount value', 'fa-circle-exclamation');
      return false;
    }
    // Optional phone lock: offer.customerPhone
    if (offer.customerPhone && global.RS && RS.getCustomer) {
      const cust = RS.getCustomer() || {};
      const want = String(offer.customerPhone).replace(/\D/g, '');
      const got = String(cust.phone || '').replace(/\D/g, '');
      if (want && got && !got.endsWith(want.slice(-10)) && want !== got) {
        toast('This code is for another guest phone', 'fa-circle-exclamation');
        return false;
      }
    }
    if (global.RS && RS.setPromo) {
      RS.setPromo({
        code: String(offer.code || code).toUpperCase(),
        pct,
        fixed,
        title: offer.title || offer.name || offer.description || 'Promo',
        offerId: offer.id || null,
      });
    }
    // Bump usage_count in cloud (best-effort) so Growth Hub shows real usage
    try {
      if (offer.id && global.RS_DB && RS_DB.put) {
        const next = {
          ...offer,
          usageCount: (Number(offer.usageCount) || 0) + 1,
        };
        RS_DB.put('offers', offer.id, next).catch(() => {});
      }
    } catch (_) {}
    toast(
      `Promo ${code} · ${fixed > 0 ? rs(fixed) + ' off' : pct + '% off'}`,
      'fa-tags'
    );
    return true;
  }
  function clearPromoCode() {
    if (global.RS && RS.clearPromo) RS.clearPromo();
    try {
      if (global.RS && RS.renderCart) RS.renderCart();
    } catch (_) {}
    toast('Promo cleared', 'fa-tags');
  }
  function wirePromoUi() {
    if (global.__rsPromoWired) return;
    global.__rsPromoWired = true;
    const apply = async () => {
      const inp = document.getElementById('promo-input');
      await applyPromoCode(inp && inp.value);
    };
    document.addEventListener(
      'click',
      (e) => {
        if (e.target.closest('#promo-apply')) {
          e.preventDefault();
          apply();
        }
        if (e.target.closest('#promo-clear')) {
          e.preventDefault();
          clearPromoCode();
        }
      },
      true
    );
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && e.target && e.target.id === 'promo-input') {
        e.preventDefault();
        apply();
      }
    });
  }
  global.RSPromo = {
    apply: applyPromoCode,
    clear: clearPromoCode,
    find: findOfferByCode,
    enabled: promoEnabled,
    wire: wirePromoUi,
  };

  /* ---------------- Multi-station identity ---------------- */
  function getStationId() {
    try {
      let id = localStorage.getItem(STATION_KEY);
      if (!id) {
        id = 'ST-' + Math.random().toString(36).slice(2, 8).toUpperCase();
        localStorage.setItem(STATION_KEY, id);
      }
      return id;
    } catch (_) {
      return 'ST-LOCAL';
    }
  }
  function getStationLabel() {
    try {
      let label = localStorage.getItem('rs_station_label');
      // Force-migrate ugly auto station ids to a human counter name
      if (!label || /^ST-[A-Z0-9]+$/i.test(String(label).trim())) {
        const friendly = localStorage.getItem('rs_station_label_friendly') || 'Counter 1';
        localStorage.setItem('rs_station_label', friendly);
        localStorage.setItem('rs_station_label_friendly', friendly);
        return friendly;
      }
      return label;
    } catch (_) {
      return 'Counter 1';
    }
  }
  function setStationLabel(label) {
    try {
      const v = String(label || '').trim().slice(0, 32) || 'Counter 1';
      localStorage.setItem('rs_station_label', v);
      localStorage.setItem('rs_station_label_friendly', v);
      paintStationChip();
    } catch (_) {}
  }

  function openCounterRenameModal() {
    const current = getStationLabel();
    if (global.RSModal && typeof RSModal.open === 'function') {
      RSModal.open({
        title: 'Counter name',
        sub: 'Multi-terminal label (Counter 1, Bar, Takeaway…)',
        icon: 'fa-desktop',
        size: 'sm',
        body: `<label class="fl">Name</label>
               <input class="form-input" id="rs-station-rename" value="${esc(current)}" maxlength="32" autocomplete="off">`,
        foot: `<button type="button" class="btn btn-ghost" style="flex:1" data-x>Cancel</button>
               <button type="button" class="btn btn-primary" style="flex:1" data-ok>Save</button>`,
        onMount(modal, close) {
          const inp = modal.querySelector('#rs-station-rename');
          if (inp) { inp.focus(); inp.select(); }
          modal.querySelector('[data-x]').onclick = close;
          modal.querySelector('[data-ok]').onclick = () => {
            const next = (inp && inp.value || '').trim();
            if (next) setStationLabel(next);
            close();
          };
        },
      });
      return;
    }
    if (global.RS && RS.toast) RS.toast('Rename counter from Settings if dialog unavailable', 'fa-desktop');
  }

  function openPrinterPicker() {
    const bridge = global.RSPrintBridge;
    if (bridge && typeof bridge.choosePreferredPrinter === 'function') {
      Promise.resolve(bridge.choosePreferredPrinter()).catch((err) => {
        console.warn('[printer chip]', err);
        if (global.RS && RS.toast) RS.toast('Could not open printer list', 'fa-print');
      });
      return;
    }
    if (global.RS && RS.toast) RS.toast('Printer bridge unavailable', 'fa-print');
  }

  function paintStationChip() {
    // Super-admin platform shell never shows POS station chrome
    try {
      if (document.documentElement.classList.contains('rs-role-superadmin')) return;
    } catch (_) {}
    const host =
      document.getElementById('tb-left') ||
      document.querySelector('.topbar-right, .topbar-actions, .topbar');
    if (!host) return;

    // Unified station group: one pill with Counter | Printer (desktop only)
    // Matches topbar chip language (glass, stroke, pill radius) instead of two orphan buttons.
    let group = document.getElementById('rs-station-group');
    if (!group) {
      group = document.createElement('div');
      group.id = 'rs-station-group';
      group.className = 'rs-station-group';
      group.setAttribute('role', 'group');
      group.setAttribute('aria-label', 'Station');
      const title = host.querySelector('.tb-title');
      if (title) host.insertBefore(group, title);
      else host.insertBefore(group, host.firstChild);
    }

    // Remove legacy free-floating chips if an older paint left them outside the group
    ['rs-station-chip', 'rs-printer-chip'].forEach((id) => {
      const el = document.getElementById(id);
      if (el && el.parentElement !== group) el.remove();
    });

    let chip = document.getElementById('rs-station-chip');
    if (!chip) {
      chip = document.createElement('button');
      chip.id = 'rs-station-chip';
      chip.type = 'button';
      chip.className = 'rs-station-seg rs-station-chip';
      group.appendChild(chip);
      chip.addEventListener('click', (ev) => {
        ev.preventDefault();
        openCounterRenameModal();
      });
    }

    const label = getStationLabel();
    const display = /^ST-/i.test(label) ? 'Counter' : label;
    chip.innerHTML =
      '<span class="rs-station-seg-ico" aria-hidden="true"><i class="fa-solid fa-desktop"></i></span>' +
      '<span class="rs-station-seg-txt">' + esc(display) + '</span>';
    chip.title = 'Counter: ' + label + ' · click to rename';
    chip.setAttribute('aria-label', 'Counter ' + display);

    // Desktop only — printer is a second segment inside the same pill
    const isDesktop = !!(global.RS_DESKTOP || global.rsDesktop);
    let pchip = document.getElementById('rs-printer-chip');
    if (isDesktop && global.RSPrintBridge) {
      group.classList.add('has-printer');
      if (!pchip) {
        pchip = document.createElement('button');
        pchip.id = 'rs-printer-chip';
        pchip.type = 'button';
        pchip.className = 'rs-station-seg rs-printer-chip';
        group.appendChild(pchip);
        pchip.addEventListener('click', (ev) => {
          ev.preventDefault();
          openPrinterPicker();
        });
      }
      let pLabel = 'Printer';
      let pTitle = 'Preferred receipt printer · click to choose';
      pchip.innerHTML =
        '<span class="rs-station-seg-ico" aria-hidden="true"><i class="fa-solid fa-print"></i></span>' +
        '<span class="rs-station-seg-txt" data-rs-printer-label>' + esc(pLabel) + '</span>';
      pchip.title = pTitle;
      pchip.setAttribute('aria-label', 'Preferred printer');
      const desk = global.RS_DESKTOP || global.rsDesktop;
      if (desk && desk.getPreferredPrinter) {
        desk.getPreferredPrinter().then((pref) => {
          if (!pref || !pref.name) return;
          const short = String(pref.name).trim();
          const shown = short.length > 14 ? short.slice(0, 13) + '…' : short;
          const txt = pchip.querySelector('[data-rs-printer-label]');
          if (txt) txt.textContent = shown;
          pchip.title = 'Printer: ' + short + ' · click to change';
          pchip.setAttribute('aria-label', 'Printer ' + short);
        }).catch(() => {});
      }
    } else {
      group.classList.remove('has-printer');
      if (pchip) pchip.remove();
    }
  }

  /* ---------------- Channel bill series ---------------- */
  function channelPrefix(channel) {
    const c = String(channel || 'dine_in').toLowerCase();
    if (c.includes('deliver') || c.includes('online') || c.includes('swig') || c.includes('zom')) return 'DL';
    if (c.includes('take') || c.includes('parcel')) return 'TK';
    if (c.includes('agg')) return 'AG';
    return 'DI'; // dine-in
  }

  /** Prefer server no; stamp channel series + station metadata onto bill rows. */
  function stampServedBy(billRow) {
    if (!billRow) return billRow;
    try {
      const s = session();
      const name = s.display_name || s.username || s.name || '';
      if (name && !billRow.servedBy) billRow.servedBy = name;
      if (name && !billRow.cashier) billRow.cashier = name;
      if (name && !billRow.cashierName) billRow.cashierName = name;
    } catch (_) {}
    return billRow;
  }
  function decorateBillMeta(billRow, bill) {
    if (!billRow) return billRow;
    billRow.stationId = getStationId();
    billRow.stationLabel = getStationLabel();
    billRow.channelCode = channelPrefix(bill && (bill.channel || bill.orderType));
    try {
      const s = session();
      const name = s.display_name || s.username || s.name || '';
      if (name) {
        billRow.cashier = name;
        billRow.cashierName = name;
        if (!billRow.servedBy) billRow.servedBy = name;
        if (!billRow.waiter && /waiter|captain|manager|owner/i.test(String(s.role || s.staff_role || ''))) {
          billRow.waiter = name;
        }
      }
    } catch (_) {}
    stampServedBy(billRow);
    const sh = getOpenShift();
    if (sh) billRow.shiftId = sh.shiftId;
    return billRow;
  }

  /* ---------------- Shift open / close + Z-report ---------------- */
  /**
   * Most simple cafés only bill + print — they do not use float/Z-report.
   * Settings → Printer: "Require open shift" (default OFF).
   * When OFF, Print & Pay / Hold / refunds / drawer work without opening a shift.
   * When ON, staff must open a shift first (float + accurate Z-report).
   */
  function isShiftRequired() {
    try {
      if (typeof global.RS_featureOn === 'function') {
        return global.RS_featureOn('set_require_open_shift', global.RS_SETTINGS, false);
      }
      const s = global.RS_SETTINGS || {};
      const v = s.set_require_open_shift;
      // Explicit true only — missing / false / "false" = OFF (simple café default)
      return v === true || v === 'true' || v === 1 || v === '1';
    } catch (_) {
      return false;
    }
  }

  function getOpenShift() {
    try { return JSON.parse(localStorage.getItem(SHIFT_KEY) || 'null'); } catch (_) { return null; }
  }
  function saveOpenShift(sh) {
    try {
      if (sh) localStorage.setItem(SHIFT_KEY, JSON.stringify(sh));
      else localStorage.removeItem(SHIFT_KEY);
    } catch (_) {}
    paintShiftBar();
  }

  async function openShift(floatAmt) {
    const s = session();
    const shift = {
      shiftId: 'SH-' + Date.now(),
      cashierName: s.display_name || s.username || 'Cashier',
      stationId: getStationId(),
      stationLabel: getStationLabel(),
      openedAt: new Date().toISOString(),
      closedAt: null,
      openingFloat: Number(floatAmt) || 0,
      cashMovements: [],
      status: 'OPEN',
    };
    saveOpenShift(shift);
    try {
      if (global.RS_DB && RS_DB.put) await RS_DB.put('shifts', shift.shiftId, shift);
    } catch (e) {
      console.warn('[Shift] cloud open failed', e);
    }
    toast('Shift opened · float ' + rs(shift.openingFloat), 'fa-cash-register');
    return shift;
  }

  /* ---------------- Cash drawer movements (pay-in / pay-out / safe drop) ---------------- */
  function getShiftMovements(shift) {
    const m = shift && shift.cashMovements;
    return Array.isArray(m) ? m : [];
  }
  function sumCashMovements(shift) {
    let payIn = 0;
    let payOut = 0;
    let safeDrop = 0;
    getShiftMovements(shift).forEach((mv) => {
      const a = Math.max(0, Number(mv.amount) || 0);
      const t = String(mv.type || '').toLowerCase();
      if (t === 'pay_in' || t === 'payin' || t === 'in') payIn += a;
      else if (t === 'pay_out' || t === 'payout' || t === 'out') payOut += a;
      else if (t === 'safe_drop' || t === 'safedrop' || t === 'drop') safeDrop += a;
    });
    return { payIn, payOut, safeDrop };
  }
  function movementLabel(type) {
    const t = String(type || '').toLowerCase();
    if (t === 'pay_in' || t === 'payin' || t === 'in') return 'Pay-in';
    if (t === 'pay_out' || t === 'payout' || t === 'out') return 'Pay-out';
    if (t === 'safe_drop' || t === 'safedrop' || t === 'drop') return 'Safe drop';
    return type || 'Move';
  }
  async function persistOpenShift(shift) {
    saveOpenShift(shift);
    try {
      if (shift && global.RS_DB && RS_DB.put) await RS_DB.put('shifts', shift.shiftId, shift);
    } catch (e) {
      console.warn('[Shift] cash move save failed', e);
    }
  }
  /**
   * Hard gate + clear UI when shift is closed.
   * Returns true if a shift is open; false after notifying (and optional Open shift CTA).
   */
  function promptRequireOpenShift(opts) {
    // Simple outlets: shift is optional unless Settings enables it
    if (!isShiftRequired()) return Promise.resolve(true);
    if (getOpenShift()) return Promise.resolve(true);
    try {
      if (document.documentElement.classList.contains('rs-role-superadmin')) {
        return Promise.resolve(true);
      }
    } catch (_) {}

    const action = (opts && opts.action) || 'billing';
    const reason =
      (opts && opts.reason) ||
      'Open a shift first so bills, cash, and the Z-report stay accurate for this counter.';

    toast('Shift is closed — open a shift to continue ' + action, 'fa-unlock');

    const triggerOpen = () => {
      const btn =
        document.getElementById('rs-shift-open') ||
        document.getElementById('rs-cart-shift-hint');
      if (btn) {
        btn.click();
        return;
      }
      // Fallback: open float prompt directly
      if (global.RS10 && typeof RS10.promptDenomination === 'function') {
        Promise.resolve(
          RS10.promptDenomination({
            title: (global.RS10.t && RS10.t('shift_open')) || 'Open shift',
            sub: (global.RS10.t && RS10.t('shift_float')) || 'Opening cash (notes & coins)',
            initial: 0,
          })
        ).then((result) => {
          if (!result) return;
          openShift(result.total).then((shift) => {
            if (shift) {
              shift.openingDenom = result.counts;
              shift.openingNote = result.note;
            }
          });
        });
        return;
      }
      const f = window.prompt('Opening cash float (drawer start amount)', '0');
      if (f !== null) openShift(Number(f) || 0);
    };

    if (global.RSModal && typeof RSModal.open === 'function') {
      return new Promise((resolve) => {
        RSModal.open({
          title: 'Shift is closed',
          sub: 'Required before ' + action,
          icon: 'fa-cash-register',
          size: 'sm',
          body:
            '<p style="margin:0 0 10px;font-size:13.5px;line-height:1.55;color:var(--text-soft)">' +
            esc(reason) +
            '</p>' +
            '<p style="margin:0;font-size:12.5px;line-height:1.45;color:var(--text-mute)">' +
            'Tap <b>Open shift</b>, set your opening float, then try again.</p>',
          foot:
            '<button type="button" class="btn btn-ghost" style="flex:1" data-shift-cancel>Not now</button>' +
            '<button type="button" class="btn btn-primary" style="flex:1.4" data-shift-open>' +
            '<i class="fa-solid fa-unlock"></i> Open shift</button>',
          onMount(modal, close) {
            const cancel = modal.querySelector('[data-shift-cancel]');
            const openBtn = modal.querySelector('[data-shift-open]');
            if (cancel) {
              cancel.onclick = () => {
                close();
                resolve(false);
              };
            }
            if (openBtn) {
              openBtn.onclick = () => {
                close();
                resolve(false);
                setTimeout(triggerOpen, 80);
              };
            }
          },
        });
      });
    }

    triggerOpen();
    return Promise.resolve(false);
  }

  async function addCashMovement(type, amount, reason) {
    const shift = getOpenShift();
    if (!shift) {
      await promptRequireOpenShift({
        action: 'cash drawer moves',
        reason: 'Pay-in, pay-out, and safe drop need an open shift so cash stays balanced.',
      });
      return false;
    }
    const t = String(type || '').toLowerCase();
    const norm =
      t === 'pay_in' || t === 'payin' || t === 'in'
        ? 'pay_in'
        : t === 'pay_out' || t === 'payout' || t === 'out'
          ? 'pay_out'
          : t === 'safe_drop' || t === 'safedrop' || t === 'drop'
            ? 'safe_drop'
            : '';
    if (!norm) {
      toast('Unknown cash movement type', 'fa-circle-exclamation');
      return false;
    }
    const amt = Math.abs(Number(amount) || 0);
    if (!(amt > 0)) {
      toast('Enter an amount greater than zero', 'fa-circle-exclamation');
      return false;
    }
    // PIN for money leaving the drawer (toggle: Settings → Security → Pin gate cash move)
    if (norm === 'pay_out' || norm === 'safe_drop') {
      if (global.RSPinModal && typeof RSPinModal.require === 'function') {
        const pinOk = await RSPinModal.require(movementLabel(norm) + ' ' + rs(amt), {
          settingKey: 'set_pin_gate_cash_move',
        });
        if (!pinOk) {
          toast('Cash movement cancelled — PIN required', 'fa-lock');
          return false;
        }
      }
    }
    const s = session();
    const mv = {
      id: 'CM-' + Date.now(),
      type: norm,
      amount: amt,
      reason: String(reason || '').trim().slice(0, 140),
      at: new Date().toISOString(),
      by: s.display_name || s.username || shift.cashierName || '',
      stationId: getStationId(),
      stationLabel: getStationLabel(),
    };
    if (!Array.isArray(shift.cashMovements)) shift.cashMovements = [];
    shift.cashMovements.push(mv);
    // Stamp totals used by close/Z (pay-ins are not on totalPayouts column)
    const summed = sumCashMovements(shift);
    shift.totalPayIns = summed.payIn;
    shift.totalPayouts = summed.payOut;
    shift.totalSafeDrops = summed.safeDrop;
    await persistOpenShift(shift);
    // Also mirror to existing doppio_shift_events (no new table)
    try {
      if (global.RS_DB && RS_DB.put) {
        await RS_DB.put('shift_events', mv.id, {
          eventId: mv.id,
          shiftId: shift.shiftId,
          eventType:
            norm === 'pay_in' ? 'PAY_IN' : norm === 'safe_drop' ? 'SAFE_DROP' : 'PAYOUT',
          amount: amt,
          reason: mv.reason || movementLabel(norm),
          createdAt: mv.at,
        });
      }
    } catch (e) {
      console.warn('[Shift] event mirror failed', e);
    }
    paintShiftBar();
    toast(movementLabel(norm) + ' ' + rs(amt), norm === 'pay_in' ? 'fa-arrow-down' : 'fa-arrow-up');
    return true;
  }
  function openCashMovementModal() {
    const shift = getOpenShift();
    if (!shift) {
      promptRequireOpenShift({
        action: 'cash drawer',
        reason: 'Open a shift first to record pay-in, pay-out, or safe drop on this counter.',
      });
      return;
    }
    if (!global.RSModal) {
      const type = window.prompt('Type: pay_in | pay_out | safe_drop', 'pay_in');
      if (type == null) return;
      const amt = window.prompt('Amount', '0');
      if (amt == null) return;
      const reason = window.prompt('Reason / note', '') || '';
      addCashMovement(type, amt, reason);
      return;
    }
    const mov = sumCashMovements(shift);
    const recent = getShiftMovements(shift)
      .slice(-6)
      .reverse()
      .map(
        (m) =>
          `<div style="display:flex;justify-content:space-between;gap:8px;font-size:12px;padding:4px 0;border-bottom:1px solid var(--stroke-2)">
            <span><b>${esc(movementLabel(m.type))}</b> · ${esc(m.reason || '—')}</span>
            <span style="font-weight:700;white-space:nowrap">${rs(m.amount)}</span>
          </div>`
      )
      .join('');
    RSModal.open({
      title: 'Cash drawer',
      sub: 'Pay-in · pay-out · safe drop · ' + (shift.shiftId || ''),
      icon: 'fa-money-bill-wave',
      body: `<div style="display:flex;flex-direction:column;gap:12px">
        <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:8px;font-size:12px">
          <div style="padding:8px;border-radius:8px;border:1px solid var(--stroke-2);background:var(--glass-1)"><div style="color:var(--text-mute);font-size:10px;font-weight:700;text-transform:uppercase">Pay-ins</div><div style="font-weight:800;color:var(--green)">${rs(mov.payIn)}</div></div>
          <div style="padding:8px;border-radius:8px;border:1px solid var(--stroke-2);background:var(--glass-1)"><div style="color:var(--text-mute);font-size:10px;font-weight:700;text-transform:uppercase">Pay-outs</div><div style="font-weight:800;color:#ef4444">${rs(mov.payOut)}</div></div>
          <div style="padding:8px;border-radius:8px;border:1px solid var(--stroke-2);background:var(--glass-1)"><div style="color:var(--text-mute);font-size:10px;font-weight:700;text-transform:uppercase">Safe drops</div><div style="font-weight:800">${rs(mov.safeDrop)}</div></div>
        </div>
        <div style="display:flex;flex-wrap:wrap;gap:6px" id="cm-type-row">
          <button type="button" class="btn btn-ghost btn-sm active" data-cm-type="pay_in" style="font-weight:700"><i class="fa-solid fa-arrow-down"></i> Pay-in</button>
          <button type="button" class="btn btn-ghost btn-sm" data-cm-type="pay_out" style="font-weight:700"><i class="fa-solid fa-arrow-up"></i> Pay-out</button>
          <button type="button" class="btn btn-ghost btn-sm" data-cm-type="safe_drop" style="font-weight:700"><i class="fa-solid fa-vault"></i> Safe drop</button>
        </div>
        <div>
          <label class="fl" style="font-size:12px">Amount</label>
          <input type="number" id="cm-amount" class="form-input" min="0" step="1" placeholder="0" style="width:100%;height:36px" inputmode="decimal">
        </div>
        <div>
          <label class="fl" style="font-size:12px">Reason / note</label>
          <input type="text" id="cm-reason" class="form-input" placeholder="e.g. Bank deposit, change order, tips tip-out" style="width:100%;height:36px" maxlength="140">
        </div>
        <div>
          <div style="font-size:11px;font-weight:700;color:var(--text-mute);margin-bottom:4px;text-transform:uppercase;letter-spacing:.04em">Recent on this shift</div>
          ${recent || '<div style="font-size:12px;color:var(--text-mute)">No movements yet</div>'}
        </div>
        <p style="font-size:11.5px;color:var(--text-soft);margin:0">Expected cash on Z = float + cash sales + pay-ins − pay-outs − safe drops. Pay-out &amp; safe drop ask for manager PIN when configured.</p>
      </div>`,
      foot:
        '<button class="btn btn-ghost" style="flex:1" data-cm-x>Cancel</button>' +
        '<button class="btn btn-primary" style="flex:1" data-cm-ok><i class="fa-solid fa-check"></i> Record</button>',
      onMount(m, close) {
        let chosen = 'pay_in';
        const row = m.querySelector('#cm-type-row');
        if (row) {
          row.querySelectorAll('[data-cm-type]').forEach((btn) => {
            btn.onclick = () => {
              chosen = btn.getAttribute('data-cm-type') || 'pay_in';
              row.querySelectorAll('[data-cm-type]').forEach((b) => b.classList.toggle('active', b === btn));
            };
          });
        }
        const x = m.querySelector('[data-cm-x]');
        if (x) x.onclick = close;
        const ok = m.querySelector('[data-cm-ok]');
        if (ok)
          ok.onclick = async () => {
            const amtEl = m.querySelector('#cm-amount');
            const reasonEl = m.querySelector('#cm-reason');
            const done = await addCashMovement(
              chosen,
              amtEl && amtEl.value,
              reasonEl && reasonEl.value
            );
            if (done) close();
          };
        const amtEl = m.querySelector('#cm-amount');
        if (amtEl) setTimeout(() => amtEl.focus(), 50);
      },
    });
  }

  const SHIFT_HISTORY_KEY = 'rs_shift_history';
  const Z_SCOPE_KEY = 'rs_z_scope'; // station | all

  function getZScope() {
    try {
      return localStorage.getItem(Z_SCOPE_KEY) === 'all' ? 'all' : 'station';
    } catch (_) {
      return 'station';
    }
  }
  function setZScope(scope) {
    try {
      localStorage.setItem(Z_SCOPE_KEY, scope === 'all' ? 'all' : 'station');
    } catch (_) {}
  }

  function billsForShift(shift, opts) {
    const bills = (global.RS && RS.BILLS) || [];
    if (!shift) return [];
    const scope = (opts && opts.scope) || getZScope();
    const stationId = getStationId();
    const openTs = new Date(shift.openedAt).getTime();
    return bills.filter((b) => {
      if (scope === 'station') {
        // Prefer stamped station; fall back to "no stamp" as this station (legacy bills)
        const bid = b.stationId || b.station_id || '';
        if (bid && bid !== stationId) return false;
      }
      if (shift.shiftId && b.shiftId === shift.shiftId) return true;
      const t = b.dateTime ? new Date(b.dateTime).getTime() : 0;
      return t >= openTs && (!shift.closedAt || t <= new Date(shift.closedAt).getTime());
    });
  }

  function summarizeShift(shift, actualCash, opts) {
    const rows = billsForShift(shift, opts);
    const paid = rows.filter((b) => String(b.status || 'paid').toLowerCase() !== 'refunded');
    const refunded = rows.filter((b) => String(b.status || '').toLowerCase() === 'refunded');
    const byPay = {};
    const byStation = {};
    let gross = 0;
    let taxTotal = 0;
    let tipsTotal = 0;
    let serviceChargeTotal = 0;
    let deliveryTotal = 0;
    let coversTotal = 0;
    let refundTotal = 0;
    paid.forEach((b) => {
      const amt = Number(b.amount != null ? b.amount : b.total) || 0;
      gross += amt;
      taxTotal += Number(b.gst || b.tax || 0) || 0;
      tipsTotal += Number(b.tipAmount || b.tip || 0) || 0;
      serviceChargeTotal += Number(b.serviceChargeAmount || 0) || 0;
      deliveryTotal += Number(b.deliveryCharge || b.delivery_charge || 0) || 0;
      coversTotal += Math.max(0, Number(b.covers != null ? b.covers : b.pax) || 0);
      const method = b.pay || b.paymentMethod || 'Cash';
      byPay[method] = (byPay[method] || 0) + amt;
      const st = b.stationLabel || b.stationId || shift.stationLabel || 'This station';
      byStation[st] = (byStation[st] || 0) + amt;
    });
    refunded.forEach((b) => {
      refundTotal += Number(b.amount != null ? b.amount : b.total) || 0;
    });
    const cashSales = byPay.Cash || byPay.cash || 0;
    const mov = sumCashMovements(shift);
    const expectedCash =
      (Number(shift.openingFloat) || 0) + cashSales + mov.payIn - mov.payOut - mov.safeDrop;
    const actual = Number(actualCash);
    const variance = Number.isFinite(actual) ? actual - expectedCash : null;
    return {
      bills: paid.length,
      refunds: refunded.length,
      refundTotal,
      gross,
      taxTotal,
      tipsTotal,
      serviceChargeTotal,
      deliveryTotal,
      coversTotal,
      avgPerCover: coversTotal > 0 ? Math.round((gross / coversTotal) * 100) / 100 : null,
      byPay,
      byStation,
      cashSales,
      payInTotal: mov.payIn,
      payOutTotal: mov.payOut,
      safeDropTotal: mov.safeDrop,
      cashMovements: getShiftMovements(shift),
      expectedCash,
      actualCash: Number.isFinite(actual) ? actual : null,
      variance,
      openingFloat: Number(shift.openingFloat) || 0,
      scope: (opts && opts.scope) || getZScope(),
      stationId: getStationId(),
      stationLabel: getStationLabel(),
    };
  }

  function zReportHtml(shift, summary) {
    const payLines = Object.entries(summary.byPay || {})
      .sort((a, b) => b[1] - a[1])
      .map(([m, v]) => `<div class="rcp-line" style="display:flex;justify-content:space-between;font-size:12px;padding:3px 0"><span>${esc(m)}</span><span>${rs(v)}</span></div>`)
      .join('');
    const stationLines = Object.entries(summary.byStation || {})
      .sort((a, b) => b[1] - a[1])
      .map(([m, v]) => `<div class="rcp-line" style="display:flex;justify-content:space-between;font-size:12px;padding:3px 0"><span>${esc(m)}</span><span>${rs(v)}</span></div>`)
      .join('');
    const scopeLabel = summary.scope === 'all' ? 'All stations' : 'This station only';
    return `<div class="receipt-paper" style="max-width:320px;margin:0 auto;padding:16px;font-family:system-ui,sans-serif">
      <div style="text-align:center;font-weight:800;font-size:18px">Z-REPORT</div>
      <div style="text-align:center;font-size:12px;color:#666;margin:4px 0 4px">${esc(shift.shiftId)} · ${esc(shift.stationLabel || summary.stationLabel || '')}</div>
      <div style="text-align:center;font-size:11px;color:#888;margin:0 0 12px">${esc(scopeLabel)}</div>
      <div class="rcp-line" style="display:flex;justify-content:space-between;font-size:12px;padding:3px 0"><span>Cashier</span><span>${esc(shift.cashierName)}</span></div>
      <div class="rcp-line" style="display:flex;justify-content:space-between;font-size:12px;padding:3px 0"><span>Opened</span><span>${esc(new Date(shift.openedAt).toLocaleString())}</span></div>
      <div class="rcp-line" style="display:flex;justify-content:space-between;font-size:12px;padding:3px 0"><span>Closed</span><span>${esc(shift.closedAt ? new Date(shift.closedAt).toLocaleString() : '—')}</span></div>
      <hr style="border:0;border-top:1px dashed #ccc;margin:10px 0">
      <div class="rcp-line" style="display:flex;justify-content:space-between;font-size:12px;padding:3px 0"><span>Bills</span><span>${summary.bills}</span></div>
      <div class="rcp-line" style="display:flex;justify-content:space-between;font-size:12px;padding:3px 0"><span>Voids / refunds</span><span>${summary.refunds}${summary.refundTotal ? ' · ' + rs(summary.refundTotal) : ''}</span></div>
      <div class="rcp-line" style="display:flex;justify-content:space-between;font-size:12px;padding:3px 0"><span>Tax (GST/VAT)</span><span>${rs(summary.taxTotal || 0)}</span></div>
      <div class="rcp-line" style="display:flex;justify-content:space-between;font-size:12px;padding:3px 0"><span>Tips</span><span>${rs(summary.tipsTotal || 0)}</span></div>
      <div class="rcp-line" style="display:flex;justify-content:space-between;font-size:12px;padding:3px 0"><span>Service charge</span><span>${rs(summary.serviceChargeTotal || 0)}</span></div>
      <div class="rcp-line" style="display:flex;justify-content:space-between;font-size:12px;padding:3px 0"><span>Delivery fees</span><span>${rs(summary.deliveryTotal || 0)}</span></div>
      <div class="rcp-line" style="display:flex;justify-content:space-between;font-size:12px;padding:3px 0"><span>Covers (pax)</span><span>${summary.coversTotal || 0}</span></div>
      ${
        summary.avgPerCover != null
          ? `<div class="rcp-line" style="display:flex;justify-content:space-between;font-size:12px;padding:3px 0"><span>Avg / cover</span><span>${rs(summary.avgPerCover)}</span></div>`
          : ''
      }
      <div class="rcp-line" style="display:flex;justify-content:space-between;font-weight:800;font-size:15px;padding:6px 0"><span>Gross</span><span>${rs(summary.gross)}</span></div>
      <hr style="border:0;border-top:1px dashed #ccc;margin:10px 0">
      <div style="font-size:11px;font-weight:700;margin-bottom:4px">Payment mix</div>
      ${payLines || '<div style="font-size:12px;color:#666">No sales</div>'}
      ${stationLines && summary.scope === 'all' ? `<hr style="border:0;border-top:1px dashed #ccc;margin:10px 0"><div style="font-size:11px;font-weight:700;margin-bottom:4px">By station</div>${stationLines}` : ''}
      <hr style="border:0;border-top:1px dashed #ccc;margin:10px 0">
      <div class="rcp-line" style="display:flex;justify-content:space-between;font-size:12px;padding:3px 0"><span>Opening float</span><span>${rs(summary.openingFloat)}</span></div>
      <div class="rcp-line" style="display:flex;justify-content:space-between;font-size:12px;padding:3px 0"><span>Cash sales</span><span>${rs(summary.cashSales)}</span></div>
      <div class="rcp-line" style="display:flex;justify-content:space-between;font-size:12px;padding:3px 0"><span>Pay-ins</span><span>${rs(summary.payInTotal || 0)}</span></div>
      <div class="rcp-line" style="display:flex;justify-content:space-between;font-size:12px;padding:3px 0"><span>Pay-outs</span><span>− ${rs(summary.payOutTotal || 0)}</span></div>
      <div class="rcp-line" style="display:flex;justify-content:space-between;font-size:12px;padding:3px 0"><span>Safe drops</span><span>− ${rs(summary.safeDropTotal || 0)}</span></div>
      <div class="rcp-line" style="display:flex;justify-content:space-between;font-size:12px;padding:3px 0"><span>Expected cash</span><span>${rs(summary.expectedCash)}</span></div>
      <div class="rcp-line" style="display:flex;justify-content:space-between;font-size:12px;padding:3px 0"><span>Actual cash</span><span>${summary.actualCash != null ? rs(summary.actualCash) : '—'}</span></div>
      <div class="rcp-line" style="display:flex;justify-content:space-between;font-weight:800;font-size:14px;padding:6px 0;color:${summary.variance != null && summary.variance !== 0 ? '#ef4444' : 'inherit'}"><span>Variance</span><span>${summary.variance != null ? rs(summary.variance) : '—'}</span></div>
      ${
        Array.isArray(summary.cashMovements) && summary.cashMovements.length
          ? `<hr style="border:0;border-top:1px dashed #ccc;margin:10px 0"><div style="font-size:11px;font-weight:700;margin-bottom:4px">Cash movements</div>` +
            summary.cashMovements
              .map(
                (m) =>
                  `<div class="rcp-line" style="display:flex;justify-content:space-between;font-size:11px;padding:2px 0;color:#444"><span>${esc(movementLabel(m.type))}${m.reason ? ' · ' + esc(m.reason) : ''}</span><span>${rs(m.amount)}</span></div>`
              )
              .join('')
          : ''
      }
      <div style="text-align:center;font-size:11px;color:#666;margin-top:14px">Powered by CodeArc RestroSuite</div>
    </div>`;
  }

  function zReportCsv(shift, summary) {
    const lines = [
      ['Field', 'Value'],
      ['Shift', shift.shiftId || ''],
      ['Station', shift.stationLabel || summary.stationLabel || ''],
      ['Scope', summary.scope === 'all' ? 'all stations' : 'this station'],
      ['Cashier', shift.cashierName || ''],
      ['Opened', shift.openedAt || ''],
      ['Closed', shift.closedAt || ''],
      ['Bills', summary.bills],
      ['Refunds', summary.refunds],
      ['Refund total', summary.refundTotal || 0],
      ['Gross', summary.gross],
      ['Tax', summary.taxTotal || 0],
      ['Tips', summary.tipsTotal || 0],
      ['Service charge', summary.serviceChargeTotal || 0],
      ['Delivery fees', summary.deliveryTotal || 0],
      ['Covers (pax)', summary.coversTotal || 0],
      ['Avg per cover', summary.avgPerCover != null ? summary.avgPerCover : ''],
      ['Opening float', summary.openingFloat],
      ['Cash sales', summary.cashSales],
      ['Pay-ins', summary.payInTotal || 0],
      ['Pay-outs', summary.payOutTotal || 0],
      ['Safe drops', summary.safeDropTotal || 0],
      ['Expected cash', summary.expectedCash],
      ['Actual cash', summary.actualCash != null ? summary.actualCash : ''],
      ['Variance', summary.variance != null ? summary.variance : ''],
    ];
    Object.entries(summary.byPay || {}).forEach(([m, v]) => lines.push(['Pay:' + m, v]));
    Object.entries(summary.byStation || {}).forEach(([m, v]) => lines.push(['Station:' + m, v]));
    (summary.cashMovements || []).forEach((m) => {
      lines.push([
        'Move:' + movementLabel(m.type),
        (Number(m.amount) || 0) + (m.reason ? ' | ' + m.reason : ''),
      ]);
    });
    return lines.map((r) => r.map((c) => '"' + String(c).replace(/"/g, '""') + '"').join(',')).join('\n');
  }

  function downloadZCsv(shift, summary) {
    const csv = zReportCsv(shift, summary);
    const name = 'z-report-' + (shift.shiftId || 'shift') + '.csv';
    if (global.RS && typeof RS.downloadFile === 'function') {
      RS.downloadFile(csv, 'text/csv;charset=utf-8;', name);
    } else {
      const a = document.createElement('a');
      a.href = 'data:text/csv;charset=utf-8,' + encodeURIComponent(csv);
      a.download = name;
      a.click();
    }
    toast('Z-report CSV downloaded', 'fa-file-csv');
  }

  function pushShiftHistory(shift, summary) {
    try {
      const raw = JSON.parse(localStorage.getItem(SHIFT_HISTORY_KEY) || '[]');
      const list = Array.isArray(raw) ? raw : [];
      list.unshift({
        shiftId: shift.shiftId,
        stationLabel: shift.stationLabel,
        cashierName: shift.cashierName,
        openedAt: shift.openedAt,
        closedAt: shift.closedAt,
        gross: summary.gross,
        variance: summary.variance,
        bills: summary.bills,
        scope: summary.scope,
      });
      while (list.length > 20) list.pop();
      localStorage.setItem(SHIFT_HISTORY_KEY, JSON.stringify(list));
    } catch (_) {}
  }

  function showZReportModal(shift, summary, title) {
    const html = zReportHtml(shift, summary);
    if (global.RSModal) {
      RSModal.open({
        title: title || 'Z-Report',
        sub: shift.shiftId + ' · ' + (summary.scope === 'all' ? 'All stations' : 'This station'),
        icon: 'fa-file-invoice-dollar',
        body: html,
        foot:
          '<button class="btn btn-ghost" id="zr-csv"><i class="fa-solid fa-file-csv"></i> CSV</button>' +
          '<button class="btn btn-ghost" id="zr-print"><i class="fa-solid fa-print"></i> Print</button>' +
          '<button class="btn btn-primary" id="zr-ok">Done</button>',
        onMount(m, close) {
          const ok = m.querySelector('#zr-ok');
          if (ok) ok.onclick = close;
          const pr = m.querySelector('#zr-print');
          if (pr)
            pr.onclick = () => {
              if (global.RSPrint) RSPrint(html, 'Z-Report ' + shift.shiftId);
              else window.print();
            };
          const csv = m.querySelector('#zr-csv');
          if (csv) csv.onclick = () => downloadZCsv(shift, summary);
        },
      });
    } else if (global.RSPrint) {
      RSPrint(html, 'Z-Report ' + shift.shiftId);
    }
  }

  async function closeShift() {
    const shift = getOpenShift();
    if (!shift) {
      toast('No open shift to close — open a shift first from the orange Shift button', 'fa-circle-exclamation');
      return;
    }
    if (global.RSPinModal && RSPinModal.isConfigured()) {
      const ok = await RSPinModal.request('Close shift · Z-report');
      if (!ok) return;
    }
    const pre = summarizeShift(shift);
    let actual = 0;
    let closeDenom = null;
    let closeNote = '';
    if (global.RS10 && typeof RS10.promptDenomination === 'function') {
      const result = await RS10.promptDenomination({
        title: (global.RS10.t && RS10.t('shift_close')) || 'Close shift',
        sub: (global.RS10.t && RS10.t('shift_count')) || 'Closing cash count',
        initial: pre.expectedCash,
      });
      if (!result) return;
      actual = result.total;
      closeDenom = result.counts;
      closeNote = result.note || '';
    } else {
      const actualStr = window.prompt('Actual cash in drawer (count)', String(pre.expectedCash));
      if (actualStr === null) return;
      actual = Number(actualStr);
    }
    shift.closedAt = new Date().toISOString();
    shift.status = 'CLOSED';
    shift.actualCash = Number.isFinite(actual) ? actual : 0;
    if (closeDenom) shift.closingDenom = closeDenom;
    if (closeNote) shift.closingNote = closeNote;
    const summary = summarizeShift(shift, shift.actualCash);
    shift.expectedCash = summary.expectedCash;
    shift.variance = summary.variance;
    shift.totalSalesCash = summary.cashSales;
    shift.totalPayIns = summary.payInTotal || 0;
    shift.totalPayouts = summary.payOutTotal || 0;
    shift.totalSafeDrops = summary.safeDropTotal || 0;
    shift.zScope = summary.scope;
    try {
      if (global.RS_DB && RS_DB.put) await RS_DB.put('shifts', shift.shiftId, shift);
    } catch (e) {
      console.warn('[Shift] close save failed', e);
    }
    pushShiftHistory(shift, summary);
    saveOpenShift(null);
    showZReportModal(shift, summary, 'Z-Report · shift closed');
    if (global.RSPrint) {
      try {
        RSPrint(zReportHtml(shift, summary), 'Z-Report ' + shift.shiftId);
      } catch (_) {}
    }
    // Notify owner (WhatsApp / print) when product-10x is present
    try {
      if (global.RS10 && closeDenom) {
        const ownerPhone =
          (global.RS_SETTINGS && (RS_SETTINGS.set_owner_phone || RS_SETTINGS.set_phone)) || '';
        const lines = [
          'RestroSuite · Shift closed',
          'Shift: ' + (shift.shiftId || ''),
          'Cashier: ' + (shift.cashierName || ''),
          'Expected: ' + rs(summary.expectedCash),
          'Counted: ' + rs(shift.actualCash),
          'Variance: ' + rs(summary.variance),
          closeNote ? 'Note: ' + closeNote : '',
          new Date().toLocaleString('en-IN'),
        ]
          .filter(Boolean)
          .join('\n');
        if (ownerPhone) {
          const digits = String(ownerPhone).replace(/\D/g, '');
          const wa = digits.length === 10 ? '91' + digits : digits;
          if (wa.length >= 10) {
            window.open('https://wa.me/' + wa + '?text=' + encodeURIComponent(lines), '_blank', 'noopener');
          }
        }
      }
    } catch (_) {}
    toast('Shift closed · variance ' + (summary.variance != null ? rs(summary.variance) : 'n/a'), 'fa-lock');
  }

  function paintShiftBar() {
    // Petpooja-style: shift/register tools live in the TOP BAR (station-level),
    // never permanently inside the order cart (items-first).
    try {
      if (document.documentElement.classList.contains('rs-role-superadmin')) {
        const existing = document.getElementById('rs-shift-bar');
        if (existing) existing.style.display = 'none';
        const cartSlot = document.getElementById('pos-shift-slot');
        if (cartSlot) cartSlot.innerHTML = '';
        return;
      }
    } catch (_) {}

    const mustShift = isShiftRequired();
    const openShiftNow = getOpenShift();

    // Simple café: Require open shift OFF → hide Z / lock / shift chrome completely.
    // (Previously a leftover open shift still showed Z + padlock and confused staff.)
    if (!mustShift) {
      const hostHide = document.getElementById('rs-topbar-shift');
      if (hostHide) {
        hostHide.style.display = 'none';
        hostHide.innerHTML = '';
      }
      const barHide = document.getElementById('rs-shift-bar');
      if (barHide) {
        barHide.style.display = 'none';
        barHide.innerHTML = '';
      }
      const cartHintHide = document.getElementById('rs-cart-shift-hint');
      if (cartHintHide) {
        cartHintHide.hidden = true;
        cartHintHide.style.display = 'none';
        cartHintHide.onclick = null;
      }
      document.getElementById('pos-tab')?.classList.remove('rs-shift-is-closed');
      const cartSlot0 = document.getElementById('pos-shift-slot');
      if (cartSlot0) {
        cartSlot0.innerHTML = '';
        cartSlot0.style.display = 'none';
      }
      // Clear a stale open shift when the setting is OFF so it cannot reappear later
      if (openShiftNow) {
        try { localStorage.removeItem(SHIFT_KEY); } catch (_) {}
      }
      return;
    }

    let host = document.getElementById('rs-topbar-shift');
    if (!host) {
      const topbar = document.querySelector('.topbar');
      if (!topbar) return;
      host = document.createElement('div');
      host.id = 'rs-topbar-shift';
      host.className = 'rs-topbar-shift';
      host.setAttribute('aria-label', 'Shift / register');
      // Between brand and right tray — register ops are primary mid-header
      const right = topbar.querySelector('.tb-right');
      const spacer = topbar.querySelector('.tb-spacer');
      if (right) topbar.insertBefore(host, right);
      else if (spacer) spacer.insertAdjacentElement('afterend', host);
      else topbar.appendChild(host);
    }
    host.style.display = '';

    // Clear legacy cart-side mount (v91–93 put shift on cart)
    const cartSlot = document.getElementById('pos-shift-slot');
    if (cartSlot) {
      cartSlot.innerHTML = '';
      cartSlot.style.display = 'none';
    }

    let bar = document.getElementById('rs-shift-bar');
    const shift = openShiftNow;
    if (!bar) {
      bar = document.createElement('div');
      bar.id = 'rs-shift-bar';
      bar.className = 'rs-shift-bar rs-shift-bar-top';
    }
    bar.style.display = '';
    if (bar.parentNode !== host) host.appendChild(bar);

    // Cart banner only when shift is REQUIRED and closed
    let cartHint = document.getElementById('rs-cart-shift-hint');
    const cartEl = document.querySelector('.pos-cart');
    if (cartEl && !cartHint) {
      cartHint = document.createElement('button');
      cartHint.type = 'button';
      cartHint.id = 'rs-cart-shift-hint';
      cartHint.className = 'rs-cart-shift-hint';
      cartHint.hidden = true;
      const head = cartEl.querySelector('.cart-head');
      if (head && head.parentNode) head.insertAdjacentElement('afterend', cartHint);
      else cartEl.insertBefore(cartHint, cartEl.firstChild);
    }

    if (shift) {
      const sum = summarizeShift(shift);
      const movHint =
        sum.payInTotal || sum.payOutTotal || sum.safeDropTotal
          ? ` · ${rs(sum.expectedCash)}`
          : '';
      bar.classList.remove('rs-shift-bar-closed');
      bar.classList.add('rs-shift-bar-open');
      bar.innerHTML = `<div class="rs-shift-compact rs-shift-icons rs-shift-topbar" title="Shift open · ${esc(sum.bills)} bills · ${esc(rs(sum.gross))}${esc(movHint)}">
        <span class="rs-shift-dot open" title="Shift open"></span>
        <span class="rs-shift-text"><b>${esc(sum.bills)}</b><span class="rs-shift-amt">${esc(rs(sum.gross))}</span></span>
        <button type="button" class="btn btn-ghost btn-sm" id="rs-cash-move" title="Cash drawer (pay-in / pay-out)"><i class="fa-solid fa-cash-register"></i></button>
        <button type="button" class="btn btn-ghost btn-sm" id="rs-shift-z" title="Z-report">Z</button>
        <button type="button" class="btn btn-primary btn-sm" id="rs-shift-close" title="Close shift"><i class="fa-solid fa-lock"></i></button>
      </div>`;
      const cm = bar.querySelector('#rs-cash-move');
      if (cm) cm.onclick = () => openCashMovementModal();
      const z = bar.querySelector('#rs-shift-z');
      if (z)
        z.onclick = () => {
          showZReportModal(shift, summarizeShift(shift), 'Z-Report (open shift)');
        };
      const cl = bar.querySelector('#rs-shift-close');
      if (cl) cl.onclick = () => closeShift();
      if (cartHint) {
        cartHint.hidden = true;
        cartHint.onclick = null;
      }
      // If require-shift is OFF but a shift was left open, still show open controls so staff can close it
      if (!mustShift) {
        // keep open UI only
      }
      document.getElementById('pos-tab')?.classList.remove('rs-shift-is-closed');
    } else {
      // mustShift is true here (required + no open shift)
      bar.classList.add('rs-shift-bar-closed');
      bar.classList.remove('rs-shift-bar-open');
      bar.innerHTML = `<div class="rs-shift-compact closed rs-shift-icons rs-shift-topbar" title="No shift open — required before billing">
        <span class="rs-shift-dot closed"></span>
        <button type="button" class="btn btn-primary btn-sm" id="rs-shift-open" title="Open shift"><i class="fa-solid fa-unlock"></i><span class="rs-shift-open-lbl">Shift</span></button>
      </div>`;
      const op = bar.querySelector('#rs-shift-open');
      if (op)
        op.onclick = async () => {
          if (global.RS10 && typeof RS10.promptDenomination === 'function') {
            const result = await RS10.promptDenomination({
              title: (global.RS10.t && RS10.t('shift_open')) || 'Open shift',
              sub: (global.RS10.t && RS10.t('shift_float')) || 'Opening cash (notes & coins)',
              initial: 0,
            });
            if (!result) return;
            const shift = await openShift(result.total);
            if (shift) {
              shift.openingDenom = result.counts;
              shift.openingNote = result.note;
              try {
                if (global.RS_DB && RS_DB.put) await RS_DB.put('shifts', shift.shiftId, shift);
              } catch (_) {}
            }
            return;
          }
          const f = window.prompt('Opening cash float (drawer start amount)', '0');
          if (f === null) return;
          await openShift(Number(f) || 0);
        };
      if (cartHint) {
        cartHint.hidden = false;
        cartHint.style.display = '';
        cartHint.innerHTML =
          '<i class="fa-solid fa-unlock"></i> <span>Open shift to bill</span>';
        cartHint.onclick = () => {
          const btn = document.getElementById('rs-shift-open');
          if (btn) btn.click();
          else op && op.click();
        };
      }
      document.getElementById('pos-tab')?.classList.add('rs-shift-is-closed');
    }
  }

  /* ---------------- Keyboard-first POS ---------------- */
  function installKeyboard() {
    if (document.documentElement.dataset.rsKeys === '1') return;
    document.documentElement.dataset.rsKeys = '1';
    document.addEventListener('keydown', (e) => {
      const tag = (e.target && e.target.tagName) || '';
      const typing = tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || (e.target && e.target.isContentEditable);
      const posActive = document.getElementById('pos-tab')?.classList.contains('active');
      if (!posActive) return;

      // F2 = focus search, F4 = KOT, F8 = checkout, F9 = clear, / = search
      if (e.key === 'F2' || (e.key === '/' && !typing)) {
        e.preventDefault();
        const search = document.getElementById('pos-search') || document.querySelector('#pos-tab input[type="search"], #pos-tab .pos-search input');
        if (search) { search.focus(); search.select?.(); }
        return;
      }
      if (typing) return;
      if (e.key === 'F4') {
        e.preventDefault();
        document.getElementById('btn-kot')?.click();
      } else if (e.key === 'F8' || (e.key === 'Enter' && e.ctrlKey)) {
        e.preventDefault();
        document.getElementById('btn-checkout')?.click();
      } else if (e.key === 'F9' || (e.key === 'Escape' && e.shiftKey)) {
        e.preventDefault();
        document.getElementById('btn-clear-cart')?.click();
      } else if (e.key === 'F1') {
        e.preventDefault();
        showShortcutsHelp();
      }
    });
  }

  function showShortcutsHelp() {
    const body = `<div style="font-size:13px;line-height:1.7;color:var(--text-soft)">
      <div><b style="color:var(--text)">F1</b> — Shortcuts help</div>
      <div><b style="color:var(--text)">F2</b> or <b>/</b> — Focus menu search</div>
      <div><b style="color:var(--text)">F4</b> — Send KOT</div>
      <div><b style="color:var(--text)">F8</b> / <b>Ctrl+Enter</b> — Checkout</div>
      <div><b style="color:var(--text)">F9</b> — Clear cart</div>
      <div style="margin-top:10px;font-size:12px">Station: <b>${esc(getStationLabel())}</b> · Shift: <b>${getOpenShift() ? 'OPEN' : 'closed'}</b></div>
      <div style="margin-top:8px;font-size:12px">Use <b>Day pack</b> for today's sales CSV · <b>Demo</b> for the 15-min checklist</div>
    </div>`;
    if (global.RSModal) {
      RSModal.open({
        title: 'POS keyboard',
        icon: 'fa-keyboard',
        size: 'sm',
        body,
        foot:
          '<button class="btn btn-ghost" id="kh-demo">Demo</button><button class="btn btn-primary" id="kh-ok">Got it</button>',
        onMount(m, c) {
          const ok = m.querySelector('#kh-ok');
          if (ok) ok.onclick = c;
          const d = m.querySelector('#kh-demo');
          if (d)
            d.onclick = () => {
              c();
              if (typeof global.openDemoScript === 'function') global.openDemoScript();
            };
        },
      });
    } else toast('F2 search · F4 KOT · F8 pay · F9 clear', 'fa-keyboard');
  }

  /* ---------------- Recipe stock warnings at cart ---------------- */
  function estimateCartStockIssues() {
    if (!global.RS || !RS.getCart || !RS.INVENTORY) return [];
    const cart = RS.getCart() || [];
    const menu = RS.MENU || [];
    const inv = RS.INVENTORY || [];
    const issues = [];
    cart.forEach((line) => {
      const m = menu.find((x) => String(x.id) === String(line.id) || x.name === line.name);
      if (!m || !Array.isArray(m.ingredients) || !m.ingredients.length) {
        issues.push({ type: 'no_recipe', name: line.name });
        return;
      }
      m.ingredients.forEach((ing) => {
        const need = (Number(ing.qty) || 0) * (Number(line.qty) || 1);
        const item = inv.find((i) => i.name === ing.name || (i.key && ing.name && i.key === String(ing.name).toLowerCase().replace(/[^a-z0-9]+/g, '_')));
        if (!item) {
          issues.push({ type: 'missing_ing', name: line.name, ing: ing.name });
        } else if ((Number(item.stock) || 0) < need) {
          issues.push({ type: 'low', name: line.name, ing: item.name, have: item.stock, need });
        }
      });
    });
    return issues;
  }

  function paintStockBanner() {
    const cartPanel = document.querySelector('#pos-tab .cart-panel, #pos-tab .pos-cart, #cart-panel') || document.getElementById('pos-tab');
    if (!cartPanel) return;
    let ban = document.getElementById('rs-stock-warn');
    const issues = estimateCartStockIssues().filter((i) => i.type === 'low' || i.type === 'missing_ing');
    if (!issues.length) {
      if (ban) ban.remove();
      return;
    }
    if (!ban) {
      ban = document.createElement('div');
      ban.id = 'rs-stock-warn';
      ban.style.cssText = 'margin:8px 0;padding:8px 10px;border-radius:8px;border:1px solid rgba(234,179,8,.4);background:rgba(234,179,8,.1);font-size:12px;color:var(--text-soft);line-height:1.4';
      const foot = cartPanel.querySelector('.cart-footer, #btn-checkout')?.parentNode;
      if (foot) foot.insertBefore(ban, foot.firstChild);
      else cartPanel.appendChild(ban);
    }
    const low = issues.filter((i) => i.type === 'low').slice(0, 3);
    const miss = issues.filter((i) => i.type === 'missing_ing').slice(0, 2);
    ban.innerHTML = '<i class="fa-solid fa-triangle-exclamation" style="color:#ca8a04;margin-right:6px"></i><b style="color:var(--text)">Stock risk:</b> '
      + low.map((i) => `${esc(i.ing)} short for ${esc(i.name)}`).join('; ')
      + (miss.length ? (low.length ? '; ' : '') + 'missing: ' + miss.map((i) => esc(i.ing)).join(', ') : '');
  }

  /* ---------------- Thermal print preference for WhatsApp ---------------- */
  function preferThermalPdf() {
    const s = global.RS_SETTINGS || {};
    const mode = String(s.set_receipt_pdf_mode || s.set_whatsapp_bill_pdf_mode || s.set_whatsapp_bill_pdf || '').toLowerCase();
    if (s.set_wa_thermal_pdf === true || s.set_wa_thermal_pdf === 'true') return true;
    if (mode.indexOf('thermal') >= 0 || mode.indexOf('fast') >= 0) return true;
    if (s.set_paper_size === '58 mm') return true;
    return false;
  }

  async function compilePreferredPdf(bill) {
    if (preferThermalPdf() && global.RS && typeof RS.compileThermalPDF === 'function') {
      try { return await RS.compileThermalPDF(bill); } catch (e) {
        console.warn('[PDF] thermal failed, preview fallback', e);
      }
    }
    if (global.RS && typeof RS.compilePreviewPDF === 'function') return RS.compilePreviewPDF(bill);
    if (global.RSReceiptEngine && RSReceiptEngine.toPDF) return RSReceiptEngine.toPDF(bill);
    throw new Error('No PDF compiler');
  }

  /* ---------------- Bills pagination UI ---------------- */
  function enhanceBillsPaging() {
    const body = document.getElementById('bills-table-body');
    if (!body || body.dataset.paged === '1') return;
    // Wrap renderBills to page results
    if (!global.RS || !global.__rsOriginalRenderBills) {
      // Hook after render via MutationObserver-ish re-render patch
    }
    let pager = document.getElementById('rs-bills-pager');
    const tableWrap = body.closest('.table-scroll, .panel, #bills-tab');
    if (!tableWrap) return;
    if (!pager) {
      pager = document.createElement('div');
      pager.id = 'rs-bills-pager';
      pager.style.cssText = 'display:flex;align-items:center;gap:10px;padding:10px 0;font-size:12.5px';
      body.parentNode?.parentNode?.appendChild(pager);
    }
    const apply = () => {
      const rows = Array.from(body.querySelectorAll('tr'));
      const total = rows.length;
      const pages = Math.max(1, Math.ceil(total / BILLS_PAGE_SIZE));
      if (billsPage >= pages) billsPage = pages - 1;
      rows.forEach((tr, i) => {
        const show = i >= billsPage * BILLS_PAGE_SIZE && i < (billsPage + 1) * BILLS_PAGE_SIZE;
        tr.style.display = show ? '' : 'none';
      });
      pager.innerHTML = `<span style="color:var(--text-soft)">${total} bills · page ${billsPage + 1}/${pages}</span>
        <div style="flex:1"></div>
        <button type="button" class="btn btn-ghost btn-sm" id="bp-prev" ${billsPage <= 0 ? 'disabled' : ''}>Prev</button>
        <button type="button" class="btn btn-ghost btn-sm" id="bp-next" ${billsPage >= pages - 1 ? 'disabled' : ''}>Next</button>`;
      const prev = pager.querySelector('#bp-prev');
      const next = pager.querySelector('#bp-next');
      if (prev) prev.onclick = () => { billsPage = Math.max(0, billsPage - 1); apply(); };
      if (next) next.onclick = () => { billsPage = Math.min(pages - 1, billsPage + 1); apply(); };
    };
    // Observe re-renders
    const mo = new MutationObserver(() => apply());
    mo.observe(body, { childList: true });
    body.dataset.paged = '1';
    apply();
  }

  function todayBills(stationOnly) {
    const bills = (global.RS && RS.BILLS) || [];
    const start = new Date();
    start.setHours(0, 0, 0, 0);
    const sid = getStationId();
    return bills.filter((b) => {
      if (String(b.status || 'paid').toLowerCase() === 'refunded') return false;
      if (stationOnly) {
        const bid = b.stationId || b.station_id || '';
        if (bid && bid !== sid) return false;
      }
      const t = b.dateTime ? new Date(b.dateTime).getTime() : 0;
      return t >= start.getTime();
    });
  }

  function exportDayPackCsv() {
    const stationOnly = getZScope() !== 'all';
    const rows = todayBills(stationOnly);
    if (!rows.length) return toast('No sales today to export', 'fa-circle-exclamation');
    const headers = [
      'Bill No',
      'DateTime',
      'Total',
      'Payment',
      'Station',
      'Shift',
      'Cashier',
      'Customer',
      'Phone',
      'Status',
    ];
    const lines = [headers.join(',')];
    rows.forEach((b) => {
      lines.push(
        [
          b.no || b.orderId || '',
          b.dateTime || b.time || '',
          b.amount != null ? b.amount : b.total || 0,
          b.pay || b.paymentMethod || '',
          b.stationLabel || b.stationId || '',
          b.shiftId || '',
          b.cashier || '',
          b.customerName || '',
          b.customerPhone || '',
          b.status || 'paid',
        ]
          .map((v) => '"' + String(v).replace(/"/g, '""') + '"')
          .join(',')
      );
    });
    const shift = getOpenShift();
    if (shift) {
      const sum = summarizeShift(shift);
      lines.push('');
      lines.push('"Z summary (open shift)"');
      lines.push('"Gross","' + sum.gross + '"');
      lines.push('"Cash sales","' + sum.cashSales + '"');
      lines.push('"Expected cash","' + sum.expectedCash + '"');
      lines.push('"Bills","' + sum.bills + '"');
    }
    const name =
      'day-pack-' +
      new Date().toISOString().slice(0, 10) +
      (stationOnly ? '-station' : '-all') +
      '.csv';
    if (global.RS && typeof RS.downloadFile === 'function') {
      RS.downloadFile(lines.join('\n'), 'text/csv;charset=utf-8;', name);
    } else {
      const a = document.createElement('a');
      a.href = 'data:text/csv;charset=utf-8,' + encodeURIComponent(lines.join('\n'));
      a.download = name;
      a.click();
    }
    toast('Day pack CSV · ' + rows.length + ' bills', 'fa-file-csv');
  }

  /* ---------------- Owner strip — hidden; metrics only under More ---------------- */
  function paintOwnerStrip() {
    const strip = document.getElementById('rs-owner-strip');
    if (strip) {
      strip.style.display = 'none';
      strip.setAttribute('hidden', '');
    }
    try {
      const today = todayBills(false);
      const sales = today.reduce((a, b) => a + (Number(b.amount != null ? b.amount : b.total) || 0), 0);
      global.__rsTodaySales = sales;
      global.__rsTodayOrders = today.length;
      global.__rsShiftOpen = !!getOpenShift();
    } catch (_) {}
    try { ensurePosQuickTools(); } catch (_) {}
  }

  function canShowDemoTools() {
    try {
      if (global.RS_API && RS_API.enableDemoTools) return true;
      const sess = global.RS_API && RS_API.session && RS_API.session();
      if (sess && sess.role === 'superadmin') return true;
      if (new URLSearchParams(location.search).get('demo') === '1') return true;
      if (sess && String(sess.username || '').indexOf('superadmin:') === 0) return true;
    } catch (_) {}
    return false;
  }

  function ensurePosQuickTools() {
    const pos = document.getElementById('pos-tab');
    if (!pos) return;
    let tools = document.getElementById('rs-pos-quick-tools');
    if (!tools) {
      tools = document.createElement('div');
      tools.id = 'rs-pos-quick-tools';
      tools.className = 'rs-pos-more-tools';
    }
    // Mount into menu toolbar (not a separate row under the menu)
    const secondary = document.getElementById('pos-toolbar-secondary') || pos.querySelector('.pos-toolbar-secondary');
    if (secondary) {
      if (tools.parentNode !== secondary) secondary.appendChild(tools);
    } else if (!tools.parentNode) {
      pos.insertBefore(tools, pos.firstChild);
    }
    const lowN = Number(global.__rsLowStockCount) || 0;
    const showDemo = canShowDemoTools();
    const sales = Number(global.__rsTodaySales) || 0;
    const orders = Number(global.__rsTodayOrders) || 0;
    const shiftOpen = !!global.__rsShiftOpen;
    const summary =
      rs(sales) +
      ' today · ' +
      orders +
      ' orders · ' +
      (isShiftRequired()
        ? shiftOpen
          ? 'Shift open'
          : 'Shift closed'
        : 'Shift optional');
    tools.innerHTML = `
      <div class="rs-pos-more" id="rs-pos-more">
        <button type="button" class="btn btn-ghost btn-sm rs-pos-more-btn" id="rs-pos-more-toggle" aria-expanded="false" aria-haspopup="true" title="Tools">
          <i class="fa-solid fa-ellipsis"></i>
        </button>
        <div class="rs-pos-more-menu" id="rs-pos-more-menu" hidden role="menu">
          <div class="rs-pos-more-hint rs-pos-more-stats">${esc(summary)}</div>
          <div class="rs-pos-more-sep"></div>
          <button type="button" role="menuitem" id="rs-day-pack"><i class="fa-solid fa-file-export"></i> Day pack CSV</button>
          <button type="button" role="menuitem" id="rs-keys-help"><i class="fa-solid fa-keyboard"></i> Shortcuts (F1)</button>
          ${lowN > 0 ? `<button type="button" role="menuitem" id="rs-low-stock-btn" class="warn"><i class="fa-solid fa-boxes-stacked"></i> Low stock (${lowN})</button>` : ''}
          ${showDemo ? `<button type="button" role="menuitem" id="rs-demo-btn"><i class="fa-solid fa-clapperboard"></i> Demo checklist</button>` : ''}
          <div class="rs-pos-more-sep"></div>
          <div class="rs-pos-more-hint">F2 search · F4 KOT · F8 pay</div>
        </div>
      </div>`;
    const toggle = tools.querySelector('#rs-pos-more-toggle');
    const menu = tools.querySelector('#rs-pos-more-menu');
    if (toggle && menu && !toggle.dataset.bound) {
      toggle.dataset.bound = '1';
      toggle.addEventListener('click', (e) => {
        e.stopPropagation();
        const open = menu.hasAttribute('hidden');
        if (open) {
          menu.removeAttribute('hidden');
          toggle.setAttribute('aria-expanded', 'true');
        } else {
          menu.setAttribute('hidden', '');
          toggle.setAttribute('aria-expanded', 'false');
        }
      });
      document.addEventListener('click', (e) => {
        if (!tools.contains(e.target)) {
          menu.setAttribute('hidden', '');
          toggle.setAttribute('aria-expanded', 'false');
        }
      });
    }
    const day = tools.querySelector('#rs-day-pack');
    if (day) day.onclick = () => { exportDayPackCsv(); menu && menu.setAttribute('hidden', ''); };
    const keys = tools.querySelector('#rs-keys-help');
    if (keys) keys.onclick = () => { showShortcutsHelp(); menu && menu.setAttribute('hidden', ''); };
    const lowBtn = tools.querySelector('#rs-low-stock-btn');
    if (lowBtn)
      lowBtn.onclick = () => {
        if (global.RS && typeof RS.activateTab === 'function') RS.activateTab('inventory-tab');
      };
    const demo = tools.querySelector('#rs-demo-btn');
    if (demo)
      demo.onclick = () => {
        if (typeof global.openDemoScript === 'function') global.openDemoScript();
        else toast('Demo checklist loading…', 'fa-clapperboard');
        menu && menu.setAttribute('hidden', '');
      };
  }

  /**
   * Soft entry toast only — hard gate + modal lives in Print & Pay (features-pos).
   * Keeps one clear place that explains "why billing will not proceed".
   */
  function installShiftNudge() {
    if (document.documentElement.dataset.rsShiftNudge === '1') return;
    document.documentElement.dataset.rsShiftNudge = '1';
    // no capture-phase silent tip; checkout shows Shift is closed modal
  }

  function maybePromptOpenShift() {
    try {
      if (!isShiftRequired()) return;
      if (sessionStorage.getItem('rs_shift_prompted') === '1') return;
      if (getOpenShift()) return;
      const pos = document.getElementById('pos-tab');
      if (!pos || !pos.classList.contains('active')) return;
      sessionStorage.setItem('rs_shift_prompted', '1');
      // Soft reminder only when outlet requires shifts
      setTimeout(() => {
        if (isShiftRequired() && !getOpenShift()) {
          toast(
            'Shift is closed — open Shift before Print & Pay (float + Z-report)',
            'fa-unlock'
          );
        }
      }, 1200);
    } catch (_) {}
  }

  /* ---------------- Dues quick strip on customers (soft) ---------------- */
  function enhanceDuesHint() {
    // already strong in features-growth; ensure export helper
    global.RS_exportDuesCsv = function () {
      const customers = (global.RS && RS.CUSTOMERS) || [];
      // try CRM list from DOM data not available — use RS_DB
      if (global.RS_DB) {
        RS_DB.list('customers').then((rows) => {
          const due = (rows || []).filter((c) => Number(c.dues) > 0);
          const lines = ['name,phone,dues,tier'];
          due.forEach((c) => lines.push([c.name, c.phone, c.dues, c.tier].map((x) => `"${String(x || '').replace(/"/g, '""')}"`).join(',')));
          const blob = new Blob([lines.join('\n')], { type: 'text/csv' });
          const a = document.createElement('a');
          a.href = URL.createObjectURL(blob);
          a.download = 'outstanding-dues.csv';
          a.click();
          toast('Dues CSV exported', 'fa-file-csv');
        }).catch(() => toast('Could not export dues', 'fa-circle-exclamation'));
      }
    };
  }

  /* ---------------- Hook checkout bill decoration ---------------- */
  function installCheckoutHooks() {
    // Patch RS.saveOne for bills to stamp station/shift
    if (!global.RS || global.RS.__competitiveSavePatched) return;
    const orig = global.RS.saveOne && global.RS.saveOne.bind(global.RS);
    if (!orig) return;
    global.RS.saveOne = async function (coll, obj) {
      if (coll === 'bills' && obj) decorateBillMeta(obj, obj);
      return orig(coll, obj);
    };
    global.RS.__competitiveSavePatched = true;
  }

  function installPdfPreference() {
    if (!global.RS) return;
    const orig = global.RS.compilePreviewPDF;
    // Prefer thermal when settings say so for WhatsApp path via RS.compilePreferredPDF
    global.RS.compilePreferredPDF = compilePreferredPdf;
    if (global.RSReceipt && !global.RSReceipt.__prefPdf) {
      const share = global.RSReceipt.share;
      // leave share; engine already uses toPDF — override RS.compilePreviewPDF when thermal preferred
      if (orig && preferThermalPdf()) {
        global.RS.compilePreviewPDF = async function (bill) {
          return compilePreferredPdf(bill);
        };
      }
      global.RSReceipt.__prefPdf = true;
    }
  }

  /* ---------------- KOT thermal print helper ---------------- */
  function kitchenDeviceName() {
    try {
      if (global.RSOpsMode && typeof RSOpsMode.kitchenPrinterName === 'function') {
        return RSOpsMode.kitchenPrinterName() || null;
      }
    } catch (_) {}
    const s = global.RS_SETTINGS || {};
    return String(s.set_kitchen_printer_name || s.set_kot_printer_name || '').trim() || null;
  }

  function kotCopyCount() {
    try {
      if (global.RSOpsMode && typeof RSOpsMode.kotCopies === 'function') return RSOpsMode.kotCopies();
    } catch (_) {}
    const n = parseInt(String((global.RS_SETTINGS || {}).set_kot_copies || '1'), 10);
    return Math.min(5, Math.max(1, isFinite(n) ? n : 1));
  }

  function kitchenStationForKot() {
    try {
      if (global.RSOpsMode && typeof RSOpsMode.kitchenStationLabel === 'function') {
        return RSOpsMode.kitchenStationLabel();
      }
    } catch (_) {}
    return String((global.RS_SETTINGS || {}).set_kitchen_station_label || '').trim() || getStationLabel();
  }

  /**
   * Print kitchen ticket(s). Supports ADD / VOID banners (delta KOTs),
   * multiple copies, and a dedicated kitchen printer when configured.
   * Never fails silently — toasts if print bridge reports failure.
   */
  async function printKotThermal(items, meta) {
    const m = meta || {};
    const kind = String(m.kind || m.banner || 'KOT').toUpperCase();
    const banner =
      kind === 'ADD' || kind === 'ADD-ON' || kind === 'ADDON'
        ? 'ADD'
        : kind === 'VOID' || kind === 'CANCEL'
          ? 'VOID'
          : kind === 'FULL' || kind === 'NEW'
            ? 'KOT'
            : kind === 'KOT'
              ? 'KOT'
              : String(m.banner || 'KOT').toUpperCase();

    const lines = (items || []).map((i) => {
      const n = i.note || i.notes || '';
      const voidMark = i.void || banner === 'VOID';
      return `<div class="kot-item"${voidMark ? ' style="text-decoration:line-through;opacity:.85"' : ''}>` +
        `<span class="kq">${esc(i.qty)}×</span>` +
        `<span>${voidMark ? 'VOID ' : ''}${esc(i.name)}${n ? `<div style="font-size:11px;font-weight:600;color:#b45309;margin-top:2px">※ ${esc(n)}</div>` : ''}</span></div>`;
    }).join('');

    if (!lines) {
      return { ok: false, error: 'empty' };
    }

    const coversN = Math.max(0, Number(m.covers != null ? m.covers : m.pax) || 0);
    const station = kitchenStationForKot();
    const bannerStyle =
      banner === 'VOID'
        ? 'background:#111;color:#fff;text-align:center;font-weight:800;padding:6px;margin-bottom:8px;letter-spacing:.08em'
        : banner === 'ADD'
          ? 'background:#b45309;color:#fff;text-align:center;font-weight:800;padding:6px;margin-bottom:8px;letter-spacing:.08em'
          : 'display:none';

    const html = `<div style="max-width:280px;margin:0 auto">
      <div style="${bannerStyle}">${esc(banner === 'KOT' ? '' : banner)}</div>
      <div class="kot-h"><span class="kt">${esc(banner === 'KOT' ? 'KOT' : banner)}</span><span>${esc(m.token || m.no || '')}</span></div>
      <div style="font-size:12px;margin-bottom:8px">${esc(m.table || '')} · ${esc(m.orderType || '')}${coversN ? ' · ' + coversN + ' pax' : ''} · ${esc(station)}</div>
      ${lines}
      <div style="margin-top:12px;font-size:11px;color:#666">${new Date().toLocaleString()}</div>
    </div>`;

    const copies = Math.max(1, Number(m.copies) || kotCopyCount());
    const deviceName = m.deviceName || kitchenDeviceName();
    const title = (banner === 'KOT' ? 'KOT' : banner + ' KOT') + (m.token ? ' ' + m.token : '');
    let last = { ok: false };
    let anyOk = false;

    for (let c = 0; c < copies; c++) {
      try {
        if (global.RSPrintBridge && typeof RSPrintBridge.printHtml === 'function') {
          last = await RSPrintBridge.printHtml(html, title, {
            silent: true,
            deviceName: deviceName || undefined,
          });
        } else if (global.RSPrint) {
          const ret = global.RSPrint(html, title, { deviceName: deviceName || undefined });
          last = ret && typeof ret.then === 'function' ? await ret : { ok: true, mode: 'rsprint' };
        } else {
          last = { ok: false, error: 'no_print_bridge' };
        }
        if (last && last.ok) anyOk = true;
      } catch (e) {
        console.warn('[KOT] print failed', e);
        last = { ok: false, error: (e && e.message) || 'print_failed' };
      }
    }

    if (!anyOk) {
      toast(
        'Kitchen printer offline — order saved, ticket not printed. Check printer cable / name in Settings.',
        'fa-triangle-exclamation'
      );
    }
    return anyOk ? Object.assign({ ok: true, copies }, last || {}) : last;
  }

  /* ---------------- Bill thermal (ESC/POS or HTML width) ---------------- */
  function outletForPrint() {
    const s = global.RS_SETTINGS || {};
    return {
      name: s.set_business_name || s.set_outlet_name || (session().tenant_name) || 'Outlet',
      address: s.set_address || '',
      phone: s.set_phone || '',
      gstin: s.set_gstin || '',
    };
  }

  function billHasCashTender(bill) {
    if (!bill) return false;
    const tenders = Array.isArray(bill.tenders) ? bill.tenders : [];
    if (tenders.some((t) => /cash/i.test(String(t.method || '')) && Number(t.amount) > 0)) return true;
    const pay = String(bill.pay || bill.paymentMethod || '').toLowerCase();
    return pay === 'cash' || pay.includes('cash');
  }

  async function openCashDrawer() {
    try {
      if (
        isShiftRequired() &&
        !getOpenShift() &&
        !document.documentElement.classList.contains('rs-role-superadmin')
      ) {
        const ok = await promptRequireOpenShift({
          action: 'open cash drawer',
          reason:
            'Open a shift before kicking the cash drawer so cash activity stays on this counter’s shift.',
        });
        if (!ok) return { ok: false, error: 'shift_closed' };
      }
    } catch (_) {}
    try {
      if (global.RSPrintBridge && typeof RSPrintBridge.openCashDrawer === 'function') {
        const res = await RSPrintBridge.openCashDrawer({});
        if (res && res.ok) {
          toast('Cash drawer opened', 'fa-cash-register');
          return res;
        }
      }
    } catch (e) {
      console.warn('[Drawer] open failed', e);
    }
    // Soft fallback: still useful on web to confirm intent during demos
    return { ok: false };
  }

  /** Thermal must match Bill settled preview (same HTML). Raw ESC/POS is opt-in only. */
  function preferRawEscPosThermal() {
    try {
      const s = global.RS_SETTINGS || {};
      const mode = String(s.set_thermal_mode || s.set_receipt_thermal_mode || '').toLowerCase();
      return mode === 'raw' || mode === 'escpos' || s.set_thermal_raw === true || s.set_thermal_raw === 'true';
    } catch (_) {
      return false;
    }
  }

  function billReceiptPreviewHtml(bill, outlet, qrDataUri) {
    const engine = global.RSReceiptEngine;
    let body = '';
    if (engine && typeof engine.toHTML === 'function') {
      body = engine.toHTML(bill, qrDataUri || null, outlet || outletForPrint());
    } else if (global.RSReceipt && typeof RSReceipt.html === 'function') {
      body = RSReceipt.html(bill, qrDataUri || null);
    } else {
      body = `<div class="rcp-center"><div class="rcp-logo">${esc((outlet && outlet.name) || 'Outlet')}</div></div>
        <hr class="rcp-hr"><div class="rcp-tot"><span>TOTAL</span><span>${esc(String((bill && (bill.grand != null ? bill.grand : bill.amount)) || 0))}</span></div>`;
    }
    const paperSize = (global.RS_SETTINGS && global.RS_SETTINGS.set_paper_size) || '80 mm';
    const maxW = paperSize === '58 mm' ? '220px' : '300px';
    return `<div class="receipt-paper" style="max-width:${maxW};margin:0 auto;box-shadow:none">${body}</div>`;
  }

  async function qrForThermalBill(bill) {
    try {
      if (global.RSReceiptEngine && typeof RSReceiptEngine.qrDataUriFor === 'function') {
        return await RSReceiptEngine.qrDataUriFor(bill);
      }
    } catch (_) {}
    return new Promise((resolve) => {
      try {
        if (!global.QRCode || !bill || !bill.no) return resolve(null);
        const digitalUrl =
          (global.RSReceiptEngine && typeof RSReceiptEngine.digitalBillUrl === 'function')
            ? RSReceiptEngine.digitalBillUrl(bill.no)
            : (() => {
                const slug = sessionStorage.getItem('tenant_slug') || 'outlet';
                return `https://restrosuite.codearc.co.in/bill?slug=${encodeURIComponent(slug)}&no=${encodeURIComponent(bill.no)}`;
              })();
        global.QRCode.toDataURL(digitalUrl, { width: 200, margin: 1 }, (err, url) => {
          resolve(err ? null : url);
        });
      } catch (_) {
        resolve(null);
      }
    });
  }

  async function printBillThermal(bill) {
    if (!bill) {
      toast('No bill to print', 'fa-circle-exclamation');
      return { ok: false };
    }
    const outlet = outletForPrint();

    // Optional: pure raw ESC/POS (plain text) only when settings force it
    if (preferRawEscPosThermal()) {
      try {
        if (global.RSPrintBridge && typeof RSPrintBridge.printBillEscPos === 'function') {
          const res = await RSPrintBridge.printBillEscPos(bill, outlet, { raw: true });
          if (res && res.ok) {
            toast('Thermal receipt sent (raw)', 'fa-print');
            return res;
          }
        }
      } catch (e) {
        console.warn('[Thermal] raw escpos failed', e);
      }
    }

    // Default: same formatted preview as Bill settled (includes QR when available)
    try {
      const qr = await qrForThermalBill(bill);
      const html = billReceiptPreviewHtml(bill, outlet, qr);
      const title = 'Receipt ' + (bill.no || bill.orderId || '');
      if (global.RSPrintBridge && typeof RSPrintBridge.printHtml === 'function') {
        const res = await RSPrintBridge.printHtml(html, title, { silent: true });
        if (res && res.ok) {
          toast('Thermal print — same as preview', 'fa-receipt');
          return { ok: true, mode: res.mode || 'html-thermal', ...res };
        }
      }
      if (global.RSPrint) {
        RSPrint(html, title);
        toast('Print opened — same format as preview', 'fa-print');
        return { ok: true, mode: 'html' };
      }
      if (global.RSReceipt && typeof RSReceipt.print === 'function') {
        await RSReceipt.print(bill);
        toast('Print opened — same format as preview', 'fa-print');
        return { ok: true, mode: 'html' };
      }
    } catch (e) {
      console.warn('[Thermal] formatted html print failed', e);
    }

    // Last resort: raw ESC/POS text (unformatted) if HTML path unavailable
    try {
      if (global.RSPrintBridge && typeof RSPrintBridge.printBillEscPos === 'function') {
        const res = await RSPrintBridge.printBillEscPos(bill, outlet, {});
        if (res && res.ok) {
          toast('Thermal sent as plain text (fallback)', 'fa-print');
          return res;
        }
      }
    } catch (e) {
      console.warn('[Thermal] escpos fallback failed', e);
    }
    toast('Could not print receipt', 'fa-circle-exclamation');
    return { ok: false };
  }

  /* ---------------- New QR order alerts (sound + toast) ---------------- */
  const SEEN_PENDING_KEY = 'rs_seen_pending_order_ids';
  let floorAlertBooted = false;
  const seenPendingIds = new Set();
  let floorAudioCtx = null;

  function loadSeenPending() {
    try {
      const raw = sessionStorage.getItem(SEEN_PENDING_KEY);
      if (!raw) return;
      JSON.parse(raw).forEach((id) => seenPendingIds.add(String(id)));
    } catch (_) {}
  }

  function saveSeenPending() {
    try {
      sessionStorage.setItem(SEEN_PENDING_KEY, JSON.stringify([...seenPendingIds].slice(-200)));
    } catch (_) {}
  }

  function unlockFloorAudio() {
    try {
      const Ctx = global.AudioContext || global.webkitAudioContext;
      if (!Ctx) return;
      if (!floorAudioCtx) floorAudioCtx = new Ctx();
      if (floorAudioCtx.state === 'suspended') floorAudioCtx.resume().catch(() => {});
    } catch (_) {}
  }

  function playFloorChime() {
    try {
      const mute = localStorage.getItem('rs_service_alert_mute') === '1';
      if (mute) return;
      const Ctx = global.AudioContext || global.webkitAudioContext;
      if (!Ctx) return;
      if (!floorAudioCtx) floorAudioCtx = new Ctx();
      const ctx = floorAudioCtx;
      if (ctx.state === 'suspended') {
        ctx.resume().catch(() => {});
        return;
      }
      // Rising three-tone "new order" (distinct from waiter ding-dong)
      [[880, 0], [1174.7, 0.12], [1396.9, 0.24]].forEach(([freq, delay]) => {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = 'sine';
        osc.frequency.value = freq;
        const t0 = ctx.currentTime + delay;
        gain.gain.setValueAtTime(0.0001, t0);
        gain.gain.exponentialRampToValueAtTime(0.18, t0 + 0.02);
        gain.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.28);
        osc.connect(gain).connect(ctx.destination);
        osc.start(t0);
        osc.stop(t0 + 0.32);
      });
    } catch (_) {}
  }

  function tableLabelFromOrder(o) {
    const raw = String((o && o.table) || '').trim();
    if (!raw) return '—';
    const parts = raw.split('-');
    return parts.length > 1 ? parts[parts.length - 1] : raw.replace(/^table\s*/i, '') || raw;
  }

  function checkNewPendingOrders() {
    const orders = (global.RS && Array.isArray(RS.QR_ORDERS) ? RS.QR_ORDERS : []) || [];
    const pending = orders.filter((o) => String(o.status || '').toLowerCase() === 'pending');
    const ids = pending.map((o) => String(o.id || o.orderId || '')).filter(Boolean);

    if (!floorAlertBooted) {
      floorAlertBooted = true;
      ids.forEach((id) => seenPendingIds.add(id));
      saveSeenPending();
      return;
    }

    const fresh = pending.filter((o) => {
      const id = String(o.id || o.orderId || '');
      return id && !seenPendingIds.has(id);
    });
    if (!fresh.length) return;

    fresh.forEach((o) => seenPendingIds.add(String(o.id || o.orderId)));
    // Drop ids no longer pending so re-orders of same id can alert later
    const live = new Set(ids);
    [...seenPendingIds].forEach((id) => {
      if (!live.has(id) && !pending.some((p) => String(p.id || p.orderId) === id)) {
        // keep history for session; do not prune aggressively
      }
    });
    saveSeenPending();

    playFloorChime();
    try {
      if (navigator.vibrate) navigator.vibrate([180, 80, 180]);
    } catch (_) {}

    const first = fresh[0];
    const tbl = tableLabelFromOrder(first);
    const label =
      fresh.length === 1
        ? `New QR order · Table ${tbl}`
        : `${fresh.length} new QR orders`;

    const openQr = () => {
      if (global.RS && typeof RS.activateTab === 'function') RS.activateTab('qr-orders-tab');
    };
    if (typeof global.__toast === 'function') {
      global.__toast(label + ' — tap to open', 'fa-bell', openQr);
    } else {
      toast(label, 'fa-bell');
    }

    try {
      if (!document.title.startsWith('🔔')) {
        const prev = document.title;
        document.title = '🔔 ' + label + ' · ' + prev.replace(/^🔔\s*/, '');
        setTimeout(() => {
          try {
            document.title = prev;
          } catch (_) {}
        }, 8000);
      }
    } catch (_) {}
  }

  function installFloorOrderAlerts() {
    if (global.__rsFloorOrderAlerts) return;
    global.__rsFloorOrderAlerts = true;
    loadSeenPending();
    document.addEventListener('rs:pending_orders_synced', () => {
      try {
        checkNewPendingOrders();
      } catch (_) {}
    });
    document.addEventListener('pointerdown', unlockFloorAudio, { once: true, capture: true });
    document.addEventListener('keydown', unlockFloorAudio, { once: true, capture: true });
  }

  /* ---------------- Boot ---------------- */
  function refreshOpsUi() {
    try {
      paintStationChip();
    } catch (_) {}
    try {
      paintShiftBar();
    } catch (_) {}
    try {
      paintOwnerStrip();
    } catch (_) {}
    try {
      ensurePosQuickTools();
    } catch (_) {}
    try {
      paintStockBanner();
    } catch (_) {}
    try {
      enhanceBillsPaging();
    } catch (_) {}
    try {
      maybePromptOpenShift();
    } catch (_) {}
  }

  function publishRsOps() {
    global.RSOps = {
      getStationId,
      getStationLabel,
      setStationLabel,
      openShift,
      closeShift,
      getOpenShift,
      isShiftRequired,
      promptRequireOpenShift,
      summarizeShift,
      addCashMovement,
      openCashMovementModal,
      sumCashMovements,
      zReportHtml,
      zReportCsv,
      downloadZCsv,
      exportDayPackCsv,
      getZScope,
      setZScope,
      showZReportModal,
      printKotThermal,
      printBillThermal,
      openCashDrawer,
      billHasCashTender,
      checkNewPendingOrders,
      compilePreferredPdf,
      decorateBillMeta,
      estimateCartStockIssues,
      refresh: refreshOpsUi,
    };
  }

  function boot() {
    // Always refresh API surface (so reloading after critical.bundle picks up thermal fixes)
    publishRsOps();
    if (global.__rsCompetitiveOpsBooted) {
      try { refreshOpsUi(); } catch (_) {}
      return;
    }
    global.__rsCompetitiveOpsBooted = true;

    installKeyboard();
    installCheckoutHooks();
    installPdfPreference();
    enhanceDuesHint();
    installShiftNudge();
    installFloorOrderAlerts();
    try {
      wirePromoUi();
    } catch (_) {}
    refreshOpsUi();

    document.addEventListener('rs:hydrated', () => {
      installCheckoutHooks();
      installPdfPreference();
      installFloorOrderAlerts();
      refreshOpsUi();
    });
    document.addEventListener('rs:settings-changed', () => {
      try { refreshOpsUi(); } catch (_) {}
    });
    document.addEventListener('rs:bill-paid', (ev) => {
      setTimeout(refreshOpsUi, 200);
      const bill = ev && ev.detail && ev.detail.bill;
      try {
        const s = global.RS_SETTINGS || {};
        // Wire Settings → Auto-print receipt → thermal (formatted preview)
        const auto =
          s.set_auto_print_receipt === true ||
          s.set_auto_print_receipt === 'true' ||
          s.set_auto_print_receipt === 1;
        if (auto && bill) {
          setTimeout(() => {
            if (global.RSOps && typeof RSOps.printBillThermal === 'function') {
              RSOps.printBillThermal(bill).catch(() => {});
            }
          }, 450);
        }
        // Cash drawer: only when toggle is ON (default OFF for simple cafés)
        const drawerOn =
          typeof global.RS_featureOn === 'function'
            ? global.RS_featureOn('set_open_cash_drawer_on_cash', s, false)
            : s.set_open_cash_drawer_on_cash === true ||
              s.set_open_cash_drawer_on_cash === 'true' ||
              s.set_open_cash_drawer_on_cash === 1;
        if (drawerOn && bill && billHasCashTender(bill)) {
          setTimeout(() => openCashDrawer(), 200);
        }
      } catch (_) {}
    });
    window.addEventListener('rs:sync-queue-changed', () => {
      setTimeout(refreshOpsUi, 100);
    });
    window.addEventListener('online', () => setTimeout(refreshOpsUi, 300));
    window.addEventListener('offline', () => setTimeout(refreshOpsUi, 100));
    // Cart mutations — re-check stock
    const cartObs = new MutationObserver(() => paintStockBanner());
    const cartRoot = document.getElementById('pos-tab');
    if (cartRoot) cartObs.observe(cartRoot, { childList: true, subtree: true, characterData: true });

    // Re-paint on tab activate
    const _at = global.RS && RS.activateTab;
    if (_at && !RS.__competitiveActivate) {
      RS.activateTab = async function (id) {
        const r = await _at.apply(this, arguments);
        setTimeout(refreshOpsUi, 100);
        return r;
      };
      RS.__competitiveActivate = true;
    }
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', () => setTimeout(boot, 600));
  else setTimeout(boot, 600);
})(typeof window !== 'undefined' ? window : globalThis);

