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
    // ESC @ reset, then force font A + normal 1×1 size using BOTH command
    // families (Epson GS ! and Star ESC !) — printers that default to a
    // large or double-width font would otherwise wrap every 32-column line
    // into a single stacked column, and some cheap clones ignore one set.
    return this._push([ESC, 0x40, ESC, 0x4d, 0x00, GS, 0x21, 0x00, ESC, 0x21, 0x00]);
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

  /**
   * Native QR code via GS ( k — the printer itself renders it.
   * Supported by most 58/80mm thermal printers (Epson + compatibles).
   * Printers without QR firmware ignore the command safely.
   */
  Encoder.prototype.qr = function (data, opts) {
    const text = String(data == null ? '' : data);
    if (!text) return this;
    const options = opts || {};
    const model = options.model === 1 ? 49 : 50; // 49 = model 1, 50 = model 2
    const size = Math.max(1, Math.min(16, options.size || 5)); // module size 1–16
    const ec = String(options.ec || 'M').toUpperCase();
    const ecCode = ec === 'L' ? 48 : ec === 'Q' ? 50 : ec === 'H' ? 51 : 49;
    const bytes = BufferFrom(text);
    const len = bytes.length + 3;
    // Select model (function 162)
    this._push([GS, 0x28, 0x6b, 4, 0, 49, 65, model]);
    // Set module size (function 67)
    this._push([GS, 0x28, 0x6b, 3, 0, 49, 67, size]);
    // Set error correction (function 69)
    this._push([GS, 0x28, 0x6b, 3, 0, 49, 69, ecCode]);
    // Store data (function 80)
    this._push([GS, 0x28, 0x6b, len & 0xff, (len >> 8) & 0xff, 49, 80]);
    this.chunks.push(bytes);
    // Print (function 81)
    this._push([GS, 0x28, 0x6b, 3, 0, 49, 81, 48]);
    return this;
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

  const COLS = 32;

  function moneyPlain(n) {
    const v = Number(n) || 0;
    const num = Math.abs(v - Math.round(v)) < 0.001 ? String(Math.round(v)) : v.toFixed(2);
    return 'Rs.' + num;
  }

  function padLine(left, right, width) {
    const w = width || COLS;
    const L = String(left == null ? '' : left);
    const R = String(right == null ? '' : right);
    if (L.length + R.length >= w) {
      return (L.slice(0, Math.max(0, w - R.length - 1)) + ' ' + R).slice(0, w);
    }
    return L + ' '.repeat(w - L.length - R.length) + R;
  }

  function wrapWords(str, width) {
    const w = width || COLS;
    const s = String(str || '').replace(/\s+/g, ' ').trim();
    if (!s) return [];
    const out = [];
    let line = '';
    s.split(' ').forEach((word) => {
      if (!line) {
        line = word.slice(0, w);
        return;
      }
      if ((line + ' ' + word).length <= w) line = line + ' ' + word;
      else {
        out.push(line);
        line = word.slice(0, w);
      }
    });
    if (line) out.push(line);
    return out;
  }

  function centerLine(str, width) {
    const w = width || COLS;
    const s = String(str || '').slice(0, w);
    const pad = Math.max(0, Math.floor((w - s.length) / 2));
    return ' '.repeat(pad) + s;
  }

  /** Format bill date/time the same way the web receipt does (year always present). */
  function receiptDateLine(b) {
    let time = String(b.time || b.dateTime || b.date_time || '').replace(/\s+/g, ' ').trim();
    // Year-less locale strings ("09 Aug, 2:14 pm") parse as year 2001 in V8 —
    // patch the current year so thermal receipts never print the wrong year.
    if (time && !/\b\d{4}\b/.test(time) && /^\d{1,2} [A-Za-z]{3,9},? \d{1,2}:\d{2}(:\d{2})?( ?[AP]M)?$/i.test(time)) {
      time = time + ', ' + new Date().getFullYear();
    }
    try {
      const d = new Date(time);
      if (!isNaN(d.getTime())) {
        const datePart = d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
        const timePart = d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', hour12: true });
        time = (datePart + ' ' + timePart).replace(/\s+/g, ' ').trim();
      }
    } catch (_) {}
    return time;
  }

  /** Digital bill link used by the QR — same URL the web receipt prints. */
  function digitalUrlFor(bill) {
    try {
      if (global.RSReceiptEngine && typeof global.RSReceiptEngine.digitalBillUrl === 'function') {
        return global.RSReceiptEngine.digitalBillUrl(bill.no || bill.orderId || bill.id);
      }
    } catch (_) {}
    try {
      const slug = (global.sessionStorage && sessionStorage.getItem('tenant_slug')) || 'outlet';
      return 'https://restrosuite.codearc.co.in/bill?slug=' + encodeURIComponent(slug) + '&no=' + encodeURIComponent(bill.no || bill.orderId || '');
    } catch (_) {}
    return '';
  }

  /**
   * Plain 32-col receipt matching web layout as closely as POS58 allows:
   * centered outlet, two-col meta/items/totals, Rs. amounts (no ₹ / no "?").
   * Same content order as the web receipt (Subtotal · Discount · Tax · Tip ·
   * TOTAL · payment · Change).
   *
   * `cols` overrides the line width (default 32) — the browser print dialog
   * fallback uses a narrower width so it can render BIGGER characters while
   * still fitting the dialog's reduced printable area.
   */
  function receiptTextFromBill(bill, outlet, cols) {
    const b = bill || {};
    const o = outlet || {};
    const W = cols && cols > 0 ? Math.floor(cols) : COLS;
    const items = Array.isArray(b.items) ? b.items : (b._items || []);
    const lines = [];
    const name = String(o.name || b.outletName || 'Outlet').trim();
    // Match web: large centered outlet name (split if long)
    wrapWords(name, W).forEach((l) => lines.push(centerLine(l, W)));
    if (o.address) wrapWords(o.address, W).forEach((l) => lines.push(centerLine(l, W)));
    if (o.phone) lines.push(centerLine(('Ph ' + o.phone).slice(0, W), W));
    lines.push('-'.repeat(W));

    // Meta: bill no, then date/time (web uses two columns; 32-col uses 2 lines if needed)
    const no = String(b.no || b.orderId || b.order_id || '').trim();
    const time = receiptDateLine(b);
    if (no) lines.push(no.slice(0, W));
    if (time) lines.push(time.slice(0, W));

    const table = String(b.table || b.tableNumber || b.table_number || '--').trim();
    lines.push(padLine('Table:', table.slice(0, W - 8), W));
    const cust = String(b.customer || b.customerName || b.customer_name || 'Walk-in').trim();
    lines.push(padLine('Customer:', cust.slice(0, W - 11), W));
    lines.push('-'.repeat(W));

    items.forEach((it) => {
      const qty = Number(it.qty != null ? it.qty : it.quantity) || 1;
      const itemName = String(it.name || it.item_name || 'Item').trim();
      const price = Number(it.price != null ? it.price : it.unit_price) || 0;
      const lineTotal = moneyPlain(price * qty);
      // "1x Name .............. Rs.12" like web flex row
      const left = (qty + 'x ' + itemName).slice(0, W - lineTotal.length - 1);
      lines.push(padLine(left, lineTotal, W));
      const note = it.note || it.notes || '';
      if (note) wrapWords('  * ' + note, W).forEach((l) => lines.push(l));
    });
    lines.push('-'.repeat(W));

    const sub = Number(b.sub != null ? b.sub : b.subtotal) || 0;
    const disc = Number(b.disc != null ? b.disc : b.discount) || 0;
    const gst = Number(b.gst) || 0;
    const tip = Number(b.tipAmount || b.tip || b.tip_amount) || 0;
    const grand = Number(b.grand != null ? b.grand : b.amount != null ? b.amount : b.total) || 0;
    if (sub > 0) lines.push(padLine('Subtotal', moneyPlain(sub), W));
    if (disc > 0) lines.push(padLine('Discount', '-' + moneyPlain(disc), W));
    if (gst > 0) lines.push(padLine('Tax', moneyPlain(gst), W));
    if (tip > 0) lines.push(padLine('Tip', moneyPlain(tip), W));
    lines.push(padLine('TOTAL', moneyPlain(grand), W));
    lines.push('-'.repeat(W));

    const tenders = Array.isArray(b.tenders) ? b.tenders : [];
    if (tenders.length) {
      tenders.forEach((t) => {
        lines.push(padLine(String(t.method || t.name || 'Paid'), moneyPlain(t.amount), W));
      });
    } else {
      const pay = String(b.payment || b.payMethod || b.method || 'Cash');
      lines.push(padLine(pay, moneyPlain(grand), W));
    }
    const change = Number(b.change != null ? b.change : b.changeAmount) || 0;
    if (change > 0) lines.push(padLine('Change', moneyPlain(change), W));
    lines.push('-'.repeat(W));
    lines.push(centerLine('Thank you for dining with us!', W));
    lines.push(centerLine('Powered by CodeArc RestroSuite', W));
    return lines.join('\n');
  }

  /**
   * Build a formatted 58mm receipt from bill-like object — mirrors the web
   * layout as closely as ESC/POS allows: bold centered outlet header, bold
   * TOTAL, native printer-rendered QR (same digital bill link as web).
   */
  function receiptFromBill(bill, outlet) {
    const b = bill || {};
    const o = outlet || {};
    const items = Array.isArray(b.items) ? b.items : (b._items || []);
    const name = String(o.name || b.outletName || 'Outlet').trim();
    const no = String(b.no || b.orderId || b.order_id || '').trim();
    const time = receiptDateLine(b);
    const grand = Number(b.grand != null ? b.grand : b.amount != null ? b.amount : b.total) || 0;

    const enc = new Encoder().init();

    // Header: bold + centered (matches web serif logo)
    enc.align('center').bold(true);
    wrapWords(name, COLS).forEach((l) => enc.line(l));
    enc.bold(false);
    if (o.address) wrapWords(String(o.address || '').trim(), COLS).forEach((l) => enc.line(l));
    if (o.phone) enc.line(('Ph ' + o.phone).slice(0, COLS));
    enc.align('left').line('-'.repeat(COLS));

    // Meta: bill no, date, table, customer
    if (no) enc.line(no.slice(0, COLS));
    if (time) enc.line(time.slice(0, COLS));
    enc.line(padLine('Table:', String(b.table || b.tableNumber || b.table_number || '--').trim().slice(0, COLS - 8), COLS));
    enc.line(padLine('Customer:', String(b.customer || b.customerName || b.customer_name || 'Walk-in').trim().slice(0, COLS - 11), COLS));
    enc.line('-'.repeat(COLS));

    // Items
    items.forEach((it) => {
      const qty = Number(it.qty != null ? it.qty : it.quantity) || 1;
      const itemName = String(it.name || it.item_name || 'Item').trim();
      const price = Number(it.price != null ? it.price : it.unit_price) || 0;
      const lineTotal = moneyPlain(price * qty);
      const left = (qty + 'x ' + itemName).slice(0, COLS - lineTotal.length - 1);
      enc.line(padLine(left, lineTotal, COLS));
      const note = it.note || it.notes || '';
      if (note) wrapWords('  * ' + note, COLS).forEach((l) => enc.line(l));
    });
    enc.line('-'.repeat(COLS));

    // Totals — same order as web: Subtotal, Discount, Tax, Tip, TOTAL
    const sub = Number(b.sub != null ? b.sub : b.subtotal) || 0;
    const disc = Number(b.disc != null ? b.disc : b.discount) || 0;
    const gst = Number(b.gst) || 0;
    const tip = Number(b.tipAmount || b.tip || b.tip_amount) || 0;
    if (sub > 0) enc.line(padLine('Subtotal', moneyPlain(sub), COLS));
    if (disc > 0) enc.line(padLine('Discount', '-' + moneyPlain(disc), COLS));
    if (gst > 0) enc.line(padLine('Tax', moneyPlain(gst), COLS));
    if (tip > 0) enc.line(padLine('Tip', moneyPlain(tip), COLS));
    enc.bold(true).line(padLine('TOTAL', moneyPlain(grand), COLS)).bold(false);
    enc.line('-'.repeat(COLS));

    // Payment + change
    const tenders = Array.isArray(b.tenders) ? b.tenders : [];
    if (tenders.length) {
      tenders.forEach((t) => {
        enc.line(padLine(String(t.method || t.name || 'Paid'), moneyPlain(t.amount), COLS));
      });
    } else {
      const pay = String(b.payment || b.payMethod || b.method || 'Cash');
      enc.line(padLine(pay, moneyPlain(grand), COLS));
    }
    const change = Number(b.change != null ? b.change : b.changeAmount) || 0;
    if (change > 0) enc.line(padLine('Change', moneyPlain(change), COLS));
    enc.line('-'.repeat(COLS));

    // Native QR — the printer renders the same digital bill link as the web receipt
    const url = digitalUrlFor(b);
    if (url) {
      enc.align('center');
      enc.qr(url, { size: 5, ec: 'M' });
      enc.line('Scan to view digital bill');
      enc.align('left');
    }

    // Footer
    enc.align('center');
    enc.line('Thank you for dining with us!');
    enc.line('Powered by CodeArc RestroSuite');
    enc.feed(3).cut();
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
    receiptTextFromBill,
    moneyPlain,
    padLine,
    COLS,
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
