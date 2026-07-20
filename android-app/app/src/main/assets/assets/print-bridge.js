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
