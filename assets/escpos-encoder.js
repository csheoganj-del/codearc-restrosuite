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
    enc.bold(false).hr(32).align('center').line('Thank you!').line('RestroSuite').feed(3).cut();
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
