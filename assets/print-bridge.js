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
        .rcp-qr-wrap { margin-top:8px;padding-top:8px;border-top:1px dashed #8a877c;display:flex;flex-direction:column;align-items:center; }
        .rcp-qr-wrap img { width:90px;height:90px;display:block; }
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

  async function printHtml(innerHTML, title, opts) {
    const options = opts || {};
    const fullHtml = wrapHtml(innerHTML, title);

    // Android WebView
    if (global.AndroidInterface && typeof global.AndroidInterface.printReceipt === 'function') {
      try {
        global.AndroidInterface.printReceipt(fullHtml);
        return { ok: true, mode: 'android' };
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

    // Browser fallback
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
        const slug = sessionStorage.getItem('tenant_slug') || 'outlet';
        global.QRCode.toDataURL(
          `https://restrosuite.codearc.co.in/bill/${slug}/${no}`,
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
    printHtml,
    printEscPosText,
    printBillEscPos,
    openCashDrawer,
    listPrinters,
    wrapHtml,
    toEscPosText,
    async choosePreferredPrinter() {
      const desk = global.RS_DESKTOP || global.rsDesktop;
      if (!desk || !desk.listPrinters) {
        if (global.RS && RS.toast) RS.toast('Printer picker needs desktop app', 'fa-print');
        return null;
      }
      const printers = await desk.listPrinters();
      const list = Array.isArray(printers) ? printers : [];
      if (!list.length) {
        if (global.RS && RS.toast) RS.toast('No printers found', 'fa-print');
        return null;
      }
      const names = list.map((p) => p.name || p.displayName || String(p));
      const pick = window.prompt('Preferred thermal printer:\n' + names.map((n, i) => (i + 1) + '. ' + n).join('\n'), names[0]);
      if (!pick) return null;
      const byNum = Number(pick);
      const name = (Number.isFinite(byNum) && byNum >= 1 && byNum <= names.length) ? names[byNum - 1] : pick;
      if (desk.setPreferredPrinter) await desk.setPreferredPrinter(name);
      if (global.RS && RS.toast) RS.toast('Printer set: ' + name, 'fa-print');
      return name;
    },
  };

  // Override / enhance RSPrint when features-pos defines it later
  function installRsPrintShim() {
    const prev = global.RSPrint;
    global.RSPrint = function (innerHTML, title) {
      // Prefer bridge (async fire-and-forget)
      printHtml(innerHTML, title).catch(() => {
        if (typeof prev === 'function') prev(innerHTML, title);
      });
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
