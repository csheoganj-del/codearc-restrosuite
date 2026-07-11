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

  const EXPORT_CSS = `
    .receipt-paper {
      background: #fbfaf7; color: #16151c; border-radius: 10px;
      padding: 22px 22px 26px; font-family: system-ui, -apple-system, 'Segoe UI', sans-serif;
      max-width: 320px; margin: 0 auto; position: relative; box-sizing: border-box;
    }
    .rcp-center { text-align: center; }
    .rcp-logo { font-family: Georgia, 'Times New Roman', serif; font-weight: 800; font-size: 20px; letter-spacing: -.02em; color: #16151c; }
    .rcp-sub { font-size: 11px; color: #6b6960; margin-top: 2px; }
    .rcp-hr { border: 0; border-top: 1px dashed #c9c6bd; margin: 13px 0; }
    .rcp-meta { display: flex; justify-content: space-between; font-size: 11.5px; color: #4a4842; gap: 8px; }
    .rcp-line { display: flex; justify-content: space-between; font-size: 12.5px; padding: 3px 0; color: #16151c; gap: 8px; }
    .rcp-line .q { color: #6b6960; }
    .rcp-tot { display: flex; justify-content: space-between; font-family: Georgia, 'Times New Roman', serif; font-weight: 800; font-size: 17px; margin-top: 6px; color: #16151c; }
    .rcp-foot { text-align: center; font-size: 11px; color: #6b6960; margin-top: 14px; }
    .rcp-foot b { color: #16151c; }
    .rcp-qr-wrap { margin-top:10px;padding-top:10px;border-top:1px dashed #c9c6bd;display:flex;flex-direction:column;align-items:center; }
    .rcp-qr-wrap img { width:100px;height:100px;display:block; }
  `;

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

    const profileLines = [
      outlet.address,
      outlet.phone ? `Phone ${outlet.phone}` : '',
      (country === 'IN' && tax.state_code) ? `State Code: ${tax.state_code}` : '',
      (tax.tax_registration_no || outlet.gstin) ? `${taxSystem} No: ${tax.tax_registration_no || outlet.gstin}` : '',
    ].filter(Boolean).map((line) => `<div class="rcp-sub">${esc(line)}</div>`).join('');

    const itemsHTML = m.items.map((i) => {
      const rateLabel = isIreland ? (i.taxCategory === 'IE_DRINK_23' ? '23%' : '9%') : '5%';
      return `<div class="rcp-line"><span><span class="q">${i.qty}× </span>${esc(i.name)}${isIreland ? ` <small style="font-size:10px;color:#6b6960">(${rateLabel})</small>` : ''}</span><span>${$(i.price * i.qty)}</span></div>`;
    }).join('');

    let taxBreakdownHTML = '';
    if (tax.gst_scheme === 'composition' && country === 'IN') {
      taxBreakdownHTML = `<div class="rcp-line" style="text-align:center;font-size:11px;color:#6b6960;margin-top:6px;font-style:italic;">Composition taxable person, not eligible to collect tax</div>`;
    } else {
      const summary = m.taxSummary || [];
      if (summary.length > 0) {
        taxBreakdownHTML = `<div style="margin-top:6px;border-top:1px dashed #c9c6bd;padding-top:6px;">`;
        if (country === 'IN') {
          const halfGst = Math.round((m.gst || 0) / 2);
          taxBreakdownHTML += `
            <div class="rcp-line"><span>CGST (2.5%)</span><span>${$(halfGst)}</span></div>
            <div class="rcp-line"><span>SGST (2.5%)</span><span>${$(m.gst - halfGst)}</span></div>
            <div class="rcp-sub" style="font-size:10.5px;color:#6b6960;margin-top:2px;">SAC 9963</div>`;
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
      } else if (m.gst > 0) {
        const halfGst = Math.round((m.gst || 0) / 2);
        taxBreakdownHTML = country === 'IN'
          ? `
            <div class="rcp-line"><span>CGST (2.5%)</span><span>${$(halfGst)}</span></div>
            <div class="rcp-line"><span>SGST (2.5%)</span><span>${$(m.gst - halfGst)}</span></div>
            <div class="rcp-sub" style="font-size:10.5px;color:#6b6960;margin-top:2px;">SAC 9963</div>`
          : `<div class="rcp-line"><span>Tax</span><span>${$(m.gst)}</span></div>`;
      }
    }

    const tenders = m.tenders.length
      ? m.tenders.map((t) => `<div class="rcp-line"><span class="q">${esc(t.method)}</span><span>${$(t.amount)}</span></div>`).join('')
      : `<div class="rcp-line"><span class="q">Cash</span><span>${$(m.grand)}</span></div>`;

    return `<div class="rcp-center"><div class="rcp-logo">${esc(outlet.name || 'Outlet')}</div>${profileLines || '<div class="rcp-sub">CodeArc RestroSuite</div>'}</div>
      <hr class="rcp-hr">
      <div class="rcp-meta"><span>${esc(m.no)}</span><span>${esc(m.time)}</span></div>
      <div class="rcp-meta"><span>Table:</span><span>${esc(m.table)}</span></div>
      ${custSection}
      <hr class="rcp-hr">
      ${itemsHTML}
      <hr class="rcp-hr">
      <div class="rcp-line"><span>Subtotal</span><span>${$(m.sub)}</span></div>
      ${m.disc ? `<div class="rcp-line"><span>Discount</span><span>- ${$(m.disc)}</span></div>` : ''}
      ${m.serviceChargeAmount ? `<div class="rcp-line"><span>Service Charge (${m.serviceChargePct != null ? m.serviceChargePct : 5}%)</span><span>${$(m.serviceChargeAmount)}</span></div>` : ''}
      ${m.tipAmount ? `<div class="rcp-line"><span>Tip</span><span>${$(m.tipAmount)}</span></div>` : ''}
      ${m.liquorTaxAmount ? `<div class="rcp-line"><span>Liquor VAT</span><span>${$(m.liquorTaxAmount)}</span></div>` : ''}
      ${taxBreakdownHTML}
      <div class="rcp-tot"><span>TOTAL</span><span>${$(m.grand)}</span></div>
      <hr class="rcp-hr">
      ${tenders}
      ${m.change ? `<div class="rcp-line"><span class="q">Change</span><span>${$(m.change)}</span></div>` : ''}
      ${qrDataUri ? `
        <div class="rcp-center rcp-qr-wrap">
          <div style="font-size:10px;color:#6b6960;margin-bottom:6px;text-align:center;">Scan to view digital bill</div>
          <img src="${qrDataUri}" width="100" height="100" alt="Digital bill QR" style="width:100px;height:100px;display:block;" crossorigin="anonymous" />
        </div>` : ''}
      <div class="rcp-foot">Thank you for dining with us!<br><b>Powered by RestroSuite</b></div>`;
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
      m.customer && m.customer !== 'Walk-in' ? `Customer: ${m.customer}` : '',
      m.customerPhone ? `Phone: ${m.customerPhone}` : '',
      '',
      ...m.items.map((i) => {
        const rateLabel = isIreland ? (i.taxCategory === 'IE_DRINK_23' ? '23%' : '9%') : '5%';
        return `${i.qty} x ${i.name}${isIreland ? ` (${rateLabel})` : ''} - ${$(i.price * i.qty)}`;
      }),
      '',
      `Subtotal: ${$(m.sub)}`,
      m.disc ? `Discount: - ${$(m.disc)}` : '',
      m.serviceChargeAmount ? `Service Charge (${m.serviceChargePct != null ? m.serviceChargePct : 5}%): ${$(m.serviceChargeAmount)}` : '',
      m.tipAmount ? `Tip: ${$(m.tipAmount)}` : '',
      m.liquorTaxAmount ? `Liquor VAT: ${$(m.liquorTaxAmount)}` : '',
    ];
    if (tax.gst_scheme === 'composition' && country === 'IN') {
      lines.push('Composition taxable person, not eligible to collect tax');
    } else if (m.gst > 0) {
      const halfGst = Math.round((m.gst || 0) / 2);
      if (country === 'IN') {
        lines.push(`CGST (2.5%): ${$(halfGst)}`);
        lines.push(`SGST (2.5%): ${$(m.gst - halfGst)}`);
        lines.push('SAC: 9963');
      } else {
        lines.push(`Tax: ${$(m.gst)}`);
      }
    }
    lines.push(
      `Total: ${$(m.grand)}`,
      `Paid by: ${(m.tenders[0] && m.tenders[0].method) || 'Cash'}`,
      '',
      'Thank you for dining with us!',
      'Powered by RestroSuite',
    );
    return lines.filter((x) => x !== '' && x != null).join('\n');
  }

  function caption(bill, outletProfile) {
    const { bill: m, outlet } = buildModel(bill, outletProfile);
    const rsFn = getRs();
    const $ = (n) => money(n, rsFn);
    return [outlet.name || 'RestroSuite', m.no ? `Bill ${m.no}` : '', m.grand != null ? `Total ${$(m.grand)}` : '']
      .filter(Boolean).join(' · ');
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

  async function qrDataUriFor(bill) {
    const m = normalizeBill(bill);
    if (!global.QRCode || !m.no) return null;
    return new Promise((resolve) => {
      try {
        const slug = sessionStorage.getItem('tenant_slug') || 'outlet';
        const digitalUrl = `https://restrosuite.codearc.co.in/bill/${slug}/${m.no}`;
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

    // Refresh gateway status when possible
    try {
      if (typeof global.updateTopbarWhatsAppStatus === 'function') {
        await Promise.race([
          global.updateTopbarWhatsAppStatus(),
          new Promise((r) => setTimeout(r, 2000)),
        ]);
      }
    } catch (_) {}

    const gatewayReady = global.__rsGatewayReady === true
      || (global.RS_API && !global.RS_API.zeroCostLaunchMode);

    if (global.RS_API && typeof global.RS_API.data === 'function' && !global.RS_API.zeroCostLaunchMode) {
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

    // Last resort: WhatsApp Web with same text content
    const waUrl = `https://wa.me/${cleanPhone}?text=${encodeURIComponent(text)}`;
    global.open(waUrl, '_blank', 'noopener,noreferrer');
    global.__rsLastWaMode = 'wa.me';
    return { mode: 'wa.me', phone: cleanPhone, gatewayReady, warning: global.__rsLastWaError };
  }

  // Warm PDF cache as soon as a bill is paid (faster WhatsApp tap)
  document.addEventListener('rs:bill-paid', (ev) => {
    try {
      const bill = ev && ev.detail && (ev.detail.bill || ev.detail);
      if (!bill || !global.RSReceiptEngine) return;
      const warm = () => toPDF(bill).catch(() => {});
      if (global.requestIdleCallback) global.requestIdleCallback(warm, { timeout: 3000 });
      else setTimeout(warm, 500);
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
    clearPdfCache: () => PDF_CACHE.clear(),
    EXPORT_CSS,
  };

  global.RSReceiptEngine = api;

  // Friendly alias used by POS
  global.RSReceiptCore = api;
})(typeof window !== 'undefined' ? window : globalThis);
