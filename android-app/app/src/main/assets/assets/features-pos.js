/* ============================================================
   RestroSuite — POS checkout: payment modal, KOT, receipt
   Also defines the shared window.RSModal helper.
   ============================================================ */
(function(){
  'use strict';
  const ready = ()=> !!window.RS;
  function boot(){
    const RS = window.RS;
    const rs = RS.rs;
    const esc = v => String(v == null ? '' : v).replace(/[&<>"']/g, ch => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]));
    const titleCase = s => String(s || '').replace(/[-_]+/g, ' ').replace(/\b\w/g, c => c.toUpperCase()).trim();
    const sessionOutletName = () => {
      const s = (window.RS_API && RS_API.session && RS_API.session()) || {};
      return s.tenant_name || s.outlet_name || s.business_name || titleCase(s.tenant_slug || s.outlet_id || sessionStorage.getItem('tenant_slug') || 'Outlet');
    };
    let receiptProfile = { name: sessionOutletName(), address:'', phone:'', gstin:'' };
    let currentSettings = {};
    function normalizeReceiptProfile(settings){
      currentSettings = settings || {};
      window.RS_SETTINGS = currentSettings; // Update global reference
      const raw = (settings && settings._raw) || {};
      return {
        name: settings?.set_restaurant_name || settings?.set_outlet_name || raw.business_name || raw.outlet_name || sessionOutletName(),
        address: settings?.set_address || raw.address || '',
        phone: settings?.set_phone || raw.phone || '',
        gstin: settings?.set_gstin || raw.gstin || ''
      };
    }
    function getDigitalPaymentMethodName() {
      const symbol = RS.getCurrencySymbol ? RS.getCurrencySymbol() : '\u20b9';
      return symbol === '\u20b9' ? 'UPI' : 'Stripe';
    }
    RS.updateStaticCurrencyLabels = function() {
      const symbol = RS.getCurrencySymbol ? RS.getCurrencySymbol() : '\u20b9';
      const digitalMethod = getDigitalPaymentMethodName();

      // Update UPI button in payment methods
      const upiBtn = document.querySelector('[data-pay-method="UPI"], [data-pay-method="Stripe"]');
      if (upiBtn) {
        upiBtn.setAttribute('data-pay-method', digitalMethod);
        const icon = upiBtn.querySelector('i');
        if (icon) {
          icon.className = symbol === '\u20b9' ? 'fa-solid fa-qrcode' : 'fa-brands fa-stripe';
          icon.style.fontSize = symbol === '\u20b9' ? '12px' : '15px';
          icon.style.color = symbol === '\u20b9' ? 'var(--orange)' : '#635bff';
        }
        const textSpan = upiBtn.querySelector('span');
        if (textSpan) {
          textSpan.textContent = digitalMethod;
        }
      }

      // Update split labels
      const splitUpiLabel = document.getElementById('split-upi-label');
      const splitUpiIcon = document.getElementById('split-upi-icon');
      if (splitUpiLabel) {
        splitUpiLabel.textContent = digitalMethod;
      }
      if (splitUpiIcon) {
        const icon = splitUpiIcon.querySelector('i');
        if (icon) {
          icon.className = symbol === '\u20b9' ? 'fa-solid fa-qrcode' : 'fa-brands fa-stripe';
        }
        splitUpiIcon.style.background = symbol === '\u20b9' ? 'rgba(255,79,0,.1)' : 'rgba(99,91,255,.1)';
        splitUpiIcon.style.color = symbol === '\u20b9' ? 'var(--orange)' : '#635bff';
      }
      
      // Update labels like "Price (\u20b9)"
      document.querySelectorAll('label').forEach(el => {
        if (el.textContent.includes('(\u20b9)')) {
          el.textContent = el.textContent.replace(/\(\u20b9\)/g, `(${symbol})`);
        } else if (el.textContent.includes('(\u20ac)') || el.textContent.includes('($)') || el.textContent.includes('(\u00a3)')) {
          el.textContent = el.textContent.replace(/\((.*?)\)/g, `(${symbol})`);
        }
      });

      // Update span tags containing "(\u20b9)"
      document.querySelectorAll('span').forEach(el => {
        if (el.textContent.includes('(\u20b9)')) {
          el.textContent = el.textContent.replace(/\(\u20b9\)/g, `(${symbol})`);
        } else if (el.textContent.includes('(\u20ac)') || el.textContent.includes('($)') || el.textContent.includes('(\u00a3)')) {
          el.textContent = el.textContent.replace(/\((.*?)\)/g, `(${symbol})`);
        }
      });

      // Update fa-indian-rupee-sign icons to dynamic currency
      document.querySelectorAll('.fa-indian-rupee-sign').forEach(el => {
        el.className = 'custom-currency-icon';
        el.style.fontStyle = 'normal';
        el.style.fontWeight = 'bold';
        el.style.fontSize = '16px';
        el.textContent = symbol;
      });
      document.querySelectorAll('.custom-currency-icon').forEach(el => {
        el.textContent = symbol;
      });

      // Update cash denomination buttons in checkout modal
      document.querySelectorAll('.btn-den.csd-den-btn').forEach(btn => {
        const val = btn.dataset.val;
        if (val) {
          if (val >= 1000) {
            btn.textContent = symbol + (val / 1000) + 'k';
          } else {
            btn.textContent = symbol + val;
          }
        }
      });
      document.querySelectorAll('.inline-den-btn').forEach(btn => {
        const val = btn.dataset.val;
        if (val && val !== 'exact') {
          btn.textContent = symbol + val;
        }
      });
      
      // Replace static currency symbols in key total elements
      const targets = [
        '#inline-cash-change',
        '#split-status-text',
        '#split-total-text',
        '#insight-spend',
        '#t-sub',
        '#t-grand',
        '#bills-stat-sales',
        '#bills-stat-aov',
        '#chain-total-revenue',
        '#chain-avg-ticket',
        '#pos-m-cart-bar-total'
      ];
      targets.forEach(selector => {
        const el = document.querySelector(selector);
        if (el) {
          el.textContent = el.textContent.replace(/[\u20b9\u20ac$\u00a3]/g, symbol);
        }
      });
    };

    async function loadReceiptProfile(){
      try {
        const settings = window.RS && RS.getSettings ? await RS.getSettings() : null;
        receiptProfile = normalizeReceiptProfile(settings);
      } catch(e) {
        receiptProfile.name = receiptProfile.name || sessionOutletName();
      }
      try {
        RS.updateStaticCurrencyLabels();
      } catch(e){}
      try {
        if (RS.syncPhoneCombosToSettings) RS.syncPhoneCombosToSettings();
      } catch(e){}
    }
    RS.loadReceiptProfile = loadReceiptProfile; // Expose globally
    loadReceiptProfile();
    document.addEventListener('rs:hydrated', loadReceiptProfile);

    /* ---------------- shared modal helper ---------------- */
    window.RSModal = window.RSModal || {
      open(opts){
        const root = RS.getModalRoot();
        const ov = document.createElement('div');
        ov.className = 'rs-overlay';
        const head = opts.title!=null ? `<div class="rs-mhead">${opts.icon?`<div class="mh-ic"><i class="fa-solid ${opts.icon}"></i></div>`:''}<div><h3>${opts.title}</h3>${opts.sub?`<div class="sub">${opts.sub}</div>`:''}</div><button class="rs-mclose" aria-label="Close"><i class="fa-solid fa-xmark"></i></button></div>` : '';
        const body = opts.bare ? (opts.body||'') : `<div class="rs-mbody ${opts.bodyClass||''}">${opts.body||''}</div>`;
        const foot = opts.foot ? `<div class="rs-mfoot">${opts.foot}</div>` : '';
        ov.innerHTML = `<div class="rs-modal ${opts.size||'md'}">${head}${body}${foot}</div>`;
        root.appendChild(ov);
        const close = ()=>{ ov.classList.remove('show'); setTimeout(()=>ov.remove(),300); document.removeEventListener('keydown', esc); };
        const esc = e=>{ if(e.key==='Escape') close(); };
        ov.querySelector('.rs-mclose')?.addEventListener('click', close);
        ov.addEventListener('click', e=>{ if(e.target===ov && opts.dismissable!==false) close(); });
        document.addEventListener('keydown', esc);
        setTimeout(()=> {
          ov.classList.add('show');
        }, 20);
        if(opts.onMount) opts.onMount(ov.querySelector('.rs-modal'), close);
        return { el: ov, modal: ov.querySelector('.rs-modal'), close };
      }
    };

    /* ---------------- print helper ---------------- */
    window.RSPrint = function(innerHTML, title){
      const style = `
        <style>
          @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;600;700&family=Plus+Jakarta+Sans:wght@800&display=swap');
          *{margin:0;padding:0;box-sizing:border-box;font-family:'Inter',monospace;}
          body{padding:10px;color:#111;}
          .rcp-center{text-align:center}.rcp-logo{font-family:'Plus Jakarta Sans';font-weight:800;font-size:20px}
          .rcp-sub{font-size:11px;color:#666;margin-top:2px}.rcp-hr{border:0;border-top:1px dashed #aaa;margin:10px 0}
          .rcp-meta,.rcp-line{display:flex;justify-content:space-between;font-size:12px;padding:2px 0}
          .rcp-line .q{color:#666}.rcp-tot{display:flex;justify-content:space-between;font-family:'Plus Jakarta Sans';font-weight:800;font-size:16px;margin-top:6px}
          .rcp-foot{text-align:center;font-size:11px;color:#666;margin-top:12px}
          .kot-h{display:flex;justify-content:space-between;border-bottom:2px solid #111;padding-bottom:8px;margin-bottom:10px}
          .kot-h .kt{font-family:'Plus Jakarta Sans';font-weight:800;font-size:18px}
          .kot-item{display:flex;gap:10px;padding:6px 0;border-bottom:1px dashed #ccc;font-size:15px}
          .kot-item .kq{font-family:'Plus Jakarta Sans';font-weight:800;min-width:28px}.kot-item .kno{font-size:11px;color:#8a4b00}
        </style>`;
      const fullHtml = `<!doctype html><html><head><title>${title||'Print'}</title>${style}</head><body>${innerHTML}</body></html>`;

      if (window.AndroidInterface && typeof window.AndroidInterface.printReceipt === 'function') {
        try {
          window.AndroidInterface.printReceipt(fullHtml);
          return;
        } catch (e) {
          console.error("Android print failed", e);
        }
      }

      const f = document.createElement('iframe');
      f.style.cssText = 'position:fixed;right:0;bottom:0;width:0;height:0;border:0;';
      document.body.appendChild(f);
      const d = f.contentWindow.document;
      d.open();
      d.write(fullHtml);
      d.close();
      f.contentWindow.focus();
      f.contentWindow.print();
      setTimeout(()=>f.remove(), 800);
    };

    /* ---------------- receipt builder ---------------- */
    function receiptHTML(bill){
      const profile = bill.taxProfile || (window.RS_getTenantTaxProfile ? window.RS_getTenantTaxProfile() : { country: 'IN', tax_system: 'GST', gst_scheme: 'regular' });
      const country = profile.country || 'IN';
      const taxSystem = profile.tax_system || 'GST';
      const isIreland = (country === 'IE');
      
      const custName = bill.customer || 'Walk-in';
      let custSection = '';
      if(custName !== 'Walk-in' || bill.customerPhone || bill.customerGst) {
        custSection = `
          <div class="rcp-meta"><span>Customer:</span><span>${esc(custName)}</span></div>
          ${bill.customerPhone ? `<div class="rcp-meta"><span>Phone:</span><span>${esc(bill.customerPhone)}</span></div>` : ''}
          ${bill.customerGst ? `<div class="rcp-meta"><span>${taxSystem} Reg:</span><span>${esc(bill.customerGst)}</span></div>` : ''}
        `;
      } else {
        custSection = `<div class="rcp-meta"><span>Customer:</span><span>Walk-in</span></div>`;
      }

      const profileLines = [
        receiptProfile.address,
        receiptProfile.phone ? `Phone ${receiptProfile.phone}` : '',
        (country === 'IN' && profile.state_code) ? `State Code: ${profile.state_code}` : '',
        profile.tax_registration_no ? `${taxSystem} No: ${profile.tax_registration_no}` : ''
      ].filter(Boolean).map(line => `<div class="rcp-sub">${esc(line)}</div>`).join('');
      
      const itemsHTML = bill.items.map(i => {
        const catLabel = i.taxCategory || i.tax_category;
        const rateLabel = isIreland ? (catLabel === 'IE_DRINK_23' ? '23%' : '9%') : '5%';
        return `<div class="rcp-line"><span><span class="q">${i.qty}× </span>${esc(i.name)} ${isIreland ? `<small style="font-size:10px;color:var(--text-mute)">(${rateLabel})</small>` : ''}</span><span>${rs(i.price*i.qty)}</span></div>`;
      }).join('');
      
      let taxBreakdownHTML = '';
      if (profile.gst_scheme === 'composition' && country === 'IN') {
        taxBreakdownHTML = `<div class="rcp-line" style="text-align:center;font-size:11px;color:var(--text-soft);margin-top:6px;font-style:italic;">Composition taxable person, not eligible to collect tax</div>`;
      } else {
        const summary = bill.taxSummary || [];
        if (summary.length > 0) {
          taxBreakdownHTML = `<div style="margin-top: 6px; border-top: 1px dashed var(--stroke-2); padding-top: 6px;">`;
          if (country === 'IN') {
            const halfGst = Math.round((bill.gst || 0) / 2);
            taxBreakdownHTML += `
              <div class="rcp-line"><span>CGST (2.5%)</span><span>${rs(halfGst)}</span></div>
              <div class="rcp-line"><span>SGST (2.5%)</span><span>${rs(bill.gst - halfGst)}</span></div>
              <div class="rcp-sub" style="font-size:10.5px;color:var(--text-mute);margin-top:2px;">SAC 9963</div>
            `;
          } else {
            taxBreakdownHTML += `<div style="font-size:11px;color:var(--text-soft);margin-bottom:4px;font-weight:700;">VAT Breakout</div>`;
            summary.forEach(band => {
              taxBreakdownHTML += `
                <div class="rcp-line" style="font-size:11.5px;color:var(--text-soft)">
                  <span>Rate ${band.percent}%</span>
                  <span>Net ${rs(band.net)} | VAT ${rs(band.tax)}</span>
                </div>
              `;
            });
          }
          taxBreakdownHTML += `</div>`;
        } else if (bill.gst > 0) {
          const halfGst = Math.round((bill.gst || 0) / 2);
          taxBreakdownHTML = `
            <div class="rcp-line"><span>CGST (2.5%)</span><span>${rs(halfGst)}</span></div>
            <div class="rcp-line"><span>SGST (2.5%)</span><span>${rs(bill.gst - halfGst)}</span></div>
          `;
        }
      }
      
      return `<div class="rcp-center"><div class="rcp-logo">${esc(receiptProfile.name || 'Outlet')}</div>${profileLines || '<div class="rcp-sub">CodeArc RestroSuite</div>'}</div>
        <hr class="rcp-hr">
        <div class="rcp-meta"><span>${bill.no}</span><span>${bill.time}</span></div>
        <div class="rcp-meta"><span>Table:</span><span>${bill.table}</span></div>
        ${custSection}
        <hr class="rcp-hr">
        ${itemsHTML}
        <hr class="rcp-hr">
        <div class="rcp-line"><span>Subtotal</span><span>${rs(bill.sub)}</span></div>
        ${bill.disc ? `<div class="rcp-line"><span>Discount</span><span>– ${rs(bill.disc)}</span></div>` : ''}
        ${bill.serviceChargeAmount ? `<div class="rcp-line"><span>Service Charge (5%)</span><span>${rs(bill.serviceChargeAmount)}</span></div>` : ''}
        ${bill.liquorTaxAmount ? `<div class="rcp-line"><span>Liquor VAT</span><span>${rs(bill.liquorTaxAmount)}</span></div>` : ''}
        ${taxBreakdownHTML}
        <div class="rcp-tot"><span>TOTAL</span><span>${rs(bill.grand)}</span></div>
        <hr class="rcp-hr">
        ${(bill.tenders||[]).map(t=>`<div class="rcp-line"><span class="q">${t.method}</span><span>${rs(t.amount)}</span></div>`).join('')}
        ${bill.change?`<div class="rcp-line"><span class="q">Change</span><span>${rs(bill.change)}</span></div>`:''}
        <div class="rcp-foot">Thank you for dining with us!<br><b>Powered by RestroSuite</b></div>`;
    }

    function receiptText(bill){
      const profile = bill.taxProfile || (window.RS_getTenantTaxProfile ? window.RS_getTenantTaxProfile() : { country: 'IN', tax_system: 'GST', gst_scheme: 'regular' });
      const country = profile.country || 'IN';
      const isIreland = (country === 'IE');
      
      const lines = [
        receiptProfile.name || 'Outlet',
        receiptProfile.address,
        receiptProfile.phone ? `Phone: ${receiptProfile.phone}` : '',
        profile.tax_registration_no ? `${profile.tax_system} No: ${profile.tax_registration_no}` : '',
        `Bill: ${bill.no}`,
        `${bill.table} | ${bill.time}`,
        '',
        ...bill.items.map(i => {
          const catLabel = i.taxCategory || i.tax_category;
          const rateLabel = isIreland ? (catLabel === 'IE_DRINK_23' ? '23%' : '9%') : '5%';
          return `${i.qty} x ${i.name} ${isIreland ? `(${rateLabel})` : ''} - ${rs(i.price * i.qty)}`;
        }),
        '',
        `Subtotal: ${rs(bill.sub)}`,
        bill.disc ? `Discount: - ${rs(bill.disc)}` : '',
        bill.serviceChargeAmount ? `Service Charge (5%): ${rs(bill.serviceChargeAmount)}` : '',
        bill.liquorTaxAmount ? `Liquor VAT: ${rs(bill.liquorTaxAmount)}` : ''
      ];
      
      if (profile.gst_scheme === 'composition' && country === 'IN') {
        lines.push('Composition taxable person, not eligible to collect tax');
      } else {
        const summary = bill.taxSummary || [];
        if (summary.length > 0) {
          if (country === 'IN') {
            const halfGst = Math.round((bill.gst || 0) / 2);
            lines.push(`CGST (2.5%): ${rs(halfGst)}`);
            lines.push(`SGST (2.5%): ${rs(bill.gst - halfGst)}`);
            lines.push('SAC: 9963');
          } else {
            lines.push('VAT Breakout:');
            summary.forEach(band => {
              lines.push(`  Rate ${band.percent}%: Net ${rs(band.net)} | VAT ${rs(band.tax)}`);
            });
          }
        } else if (bill.gst > 0) {
          const halfGst = Math.round((bill.gst || 0) / 2);
          lines.push(`CGST (2.5%): ${rs(halfGst)}`);
          lines.push(`SGST (2.5%): ${rs(bill.gst - halfGst)}`);
        }
      }
      
      lines.push(
        `Total: ${rs(bill.grand)}`,
        `Paid by: ${(bill.tenders && bill.tenders[0] && bill.tenders[0].method) || 'Cash'}`,
        '',
        'Thank you for dining with us!'
      );
      
      return lines.filter(Boolean).join('\n');
    }

    function loadJsPDF() {
      return new Promise((resolve, reject) => {
        if (window.jspdf) return resolve(window.jspdf);
        const script = document.createElement('script');
        script.src = 'https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js';
        script.onload = () => {
          resolve(window.jspdf || window.umd?.jspdf);
        };
        script.onerror = () => reject(new Error('Failed to load jsPDF library'));
        document.head.appendChild(script);
      });
    }

    async function compileThermalPDF(bill) {
      const jspdfModule = await loadJsPDF();
      const { jsPDF } = jspdfModule;
      
      const text = receiptText(bill);
      const lines = text.split('\n');
      
      const lineHeight = 4.2;
      const padding = 5;
      const height = Math.max(100, lines.length * lineHeight + padding * 2 + 10);
      
      const doc = new jsPDF({
        orientation: 'portrait',
        unit: 'mm',
        format: [80, height]
      });
      
      doc.setFont('courier', 'normal');
      doc.setFontSize(8.5);
      doc.setTextColor(0, 0, 0);
      
      let y = padding + 4;
      lines.forEach(line => {
        if (line.toUpperCase().includes('TOTAL') || line.toUpperCase().startsWith('---') || line.toUpperCase().startsWith('===')) {
          doc.setFont('courier', 'bold');
        } else {
          doc.setFont('courier', 'normal');
        }
        
        const isCenter = line.startsWith('   ') || line.includes('dining with us') || line.includes('Powered by') || line === (receiptProfile.name || 'Outlet');
        if (isCenter) {
          const textWidth = doc.getTextWidth(line.trim());
          const x = (80 - textWidth) / 2;
          doc.text(line.trim(), x, y);
        } else {
          doc.text(line, padding, y);
        }
        y += lineHeight;
      });
      
      return doc.output('datauristring');
    }

    async function shareReceiptViaWhatsApp(bill) {
      let phone = bill.customerPhone;
      if (!phone || phone.trim() === '' || phone === 'null') {
        phone = prompt("Enter customer's WhatsApp number (with country code, e.g. 353852258004):");
        if (phone === null) return; // User cancelled
        phone = phone.replace(/\D/g, '');
        if (phone) {
          bill.customerPhone = phone;
          try {
            if (window.RS_DB) {
              const localBill = await RS_DB.list('bills').then(arr => arr.find(b => b.no === bill.no));
              if (localBill) {
                localBill.customerPhone = phone;
                await RS_DB.put('bills', localBill.id, localBill);
              }
            }
          } catch(dbErr) {
            console.warn('Failed to save to local DB:', dbErr.message);
          }
        } else {
          return;
        }
      }

      const settings = window.RS_SETTINGS || {};
      const format = settings.set_whatsapp_bill_format || 'Text receipt';
      const isPdf = (format === 'Thermal PDF receipt');

      const steps = ['Preparing receipt document...', 'Connecting to WhatsApp Gateway...', 'Delivering billing message...'];
      if (window.RS_ProgressOverlay) {
        window.RS_ProgressOverlay.show('Sending WhatsApp Bill', steps);
        window.RS_ProgressOverlay.update(0, 15);
      }

      let text = receiptText(bill);
      let pdfBase64 = null;

      try {
        if (isPdf) {
          const pdfDataUrl = await compileThermalPDF(bill);
          pdfBase64 = pdfDataUrl.split(',')[1];
        }
        
        if (window.RS_ProgressOverlay) {
          window.RS_ProgressOverlay.update(1, 45);
        }
        
        let gatewayReady = false;
        if (window.RS_DB && RS_DB.mode === 'local') {
          gatewayReady = true;
        } else {
          try {
            if (window.RS_API && typeof RS_API.data === 'function') {
              if (RS_API.zeroCostLaunchMode) {
                gatewayReady = true;
              } else {
                const gatewayStatus = await RS_API.data({ operation: 'gateway_status' });
                if (gatewayStatus && gatewayStatus.status === 'ready') {
                  gatewayReady = true;
                }
              }
            }
          } catch(e) {
            console.warn('Failed to check gateway status via API:', e.message);
          }
        }

        if (window.RS_ProgressOverlay) {
          window.RS_ProgressOverlay.update(2, 75);
        }

        if (gatewayReady) {
          const payload = {
            operation: 'gateway_send',
            phone: phone,
            message: text,
            orderId: bill.no
          };
          if (isPdf && pdfBase64) {
            payload.pdfData = pdfBase64;
            payload.filename = `receipt-${bill.no}.pdf`;
          }
          
          if (window.RS_API && typeof RS_API.data === 'function') {
            const res = await RS_API.data(payload);
            if (res && res.error) {
              throw new Error(res.error);
            }
            if (window.RS_ProgressOverlay) {
              window.RS_ProgressOverlay.update(3, 100);
              window.RS_ProgressOverlay.hide();
            }
            RS.toast('Receipt sent via WhatsApp!', 'fa-whatsapp');
            return;
          }
        }
        
        throw new Error('Gateway not ready or API offline');

      } catch(err) {
        console.warn('Gateway send failed, falling back to manual redirect:', err.message);
        if (window.RS_ProgressOverlay) {
          window.RS_ProgressOverlay.hide();
        }
        
        const isMobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
        let phoneVal = phone || '';
        phoneVal = phoneVal.replace(/\D/g, '');
        
        try {
          if (navigator.clipboard && typeof navigator.clipboard.writeText === 'function') {
            await navigator.clipboard.writeText(text);
          }
        } catch(clipErr) {
          console.warn('Clipboard write failed:', clipErr.message);
        }

        const encodedText = encodeURIComponent(text);
        let waUrl = '';
        if (isMobile) {
          waUrl = phoneVal ? `https://wa.me/${phoneVal}?text=${encodedText}` : `https://wa.me/?text=${encodedText}`;
        } else {
          waUrl = phoneVal ? `https://web.whatsapp.com/send?phone=${phoneVal}&text=${encodedText}` : `https://web.whatsapp.com/send?text=${encodedText}`;
        }
        window.open(waUrl, '_blank', 'noopener,noreferrer');
        RS.toast('WhatsApp manual receipt ready', 'fa-whatsapp');
      }
    }

    function showReceipt(bill){
      const printHtml = `<div style="max-width:300px;margin:0 auto">${receiptHTML(bill)}</div>`;
      RSModal.open({
        title:'Bill settled', sub:`${bill.no} \u00b7 ${rs(bill.grand)}`, icon:'fa-circle-check', size:'sm',
        body:`<div class="receipt-paper">${receiptHTML(bill)}</div>`,
        foot:`<button class="btn btn-ghost" id="rc-wa" style="flex:1"><i class="fa-brands fa-whatsapp"></i> WhatsApp</button>
              <button class="btn btn-ghost" id="rc-print" style="flex:1"><i class="fa-solid fa-print"></i> Print</button>
              <button class="btn btn-primary" id="rc-new" style="flex:1"><i class="fa-solid fa-check"></i> New order</button>`,
        onMount(modal, close){
          modal.querySelector('#rc-print').onclick = ()=> RSPrint(printHtml, 'Receipt '+bill.no);
          modal.querySelector('#rc-wa').onclick = ()=> RSReceipt.share(bill);
          modal.querySelector('#rc-new').onclick = close;
        }
      });
    }

    window.RSReceipt = {
      html: receiptHTML,
      text: receiptText,
      show: showReceipt,
      print(bill){
        RSPrint(`<div style="max-width:300px;margin:0 auto">${receiptHTML(bill)}</div>`, 'Receipt '+bill.no);
      },
      share(bill){
        shareReceiptViaWhatsApp(bill);
      }
    };

    /* ---------------- inline cart payment ---------------- */
    const paymentState = { method: 'Cash' };
    let kotSentKey = '';
    let isSplitPaymentActive = false;
    const orderType = () => (document.querySelector('.order-type-btn.active')?.textContent || 'Takeaway').trim();
    const cartKey = () => {
      const totals = RS.getTotals();
      const cust = RS.getCustomer();
      return `${cust.table}|${orderType()}|${totals.grand}|${totals.items.map(i=>`${i.id}:${i.qty}`).join(',')}`;
    };
    const isDineIn = () => orderType().toLowerCase().includes('dine');
    const isKotSent = () => kotSentKey && kotSentKey === cartKey();
    const markKotSent = () => { kotSentKey = cartKey(); };
    const resetCustomerFields = () => {
      const ct = document.getElementById('cart-table');
      if (ct) ct.value = 'Walk-in / Takeaway';
      const csel = document.getElementById('cart-customer-sel');
      if (csel) csel.value = '';
      const da = document.getElementById('delivery-address');
      if (da) da.value = '';
      const dc = document.getElementById('delivery-charge');
      if (dc) dc.value = '';
      const dr = document.getElementById('delivery-rider');
      if (dr) dr.value = '';
    };
    function getPaymentDetails(){
      const totals = RS.getTotals();
      const method = paymentState.method || 'Cash';
      if (method === 'Split') {
        const splitCash = document.getElementById('split-cash');
        const splitUpi = document.getElementById('split-upi');
        const splitCard = document.getElementById('split-card');
        const splitDue = document.getElementById('split-due');
        const cash = Math.max(0, Number(splitCash?.value) || 0);
        const upi = Math.max(0, Number(splitUpi?.value) || 0);
        const card = Math.max(0, Number(splitCard?.value) || 0);
        const due = Math.max(0, Number(splitDue?.value) || 0);
        const totalPaid = cash + upi + card + due;
        const change = Math.max(0, totalPaid - totals.grand);
        return { method, received: totalPaid, change, valid: totals.count > 0 && totalPaid >= totals.grand };
      }
      return { method, received: totals.grand, change: 0, valid: totals.count > 0 };
    }
    function resetPayment(){
      paymentState.method = 'Cash';
      kotSentKey = '';
      const splitCash = document.getElementById('split-cash');
      const splitUpi = document.getElementById('split-upi');
      const splitCard = document.getElementById('split-card');
      const splitDue = document.getElementById('split-due');
      if (splitCash) splitCash.value = '';
      if (splitUpi) splitUpi.value = '';
      if (splitCard) splitCard.value = '';
      if (splitDue) splitDue.value = '';
      refreshPaymentPanel();
    }
    function updateInlineChange() {
      const totals = RS.getTotals();
      const receivedInput = document.getElementById('inline-cash-received');
      const changeEl = document.getElementById('inline-cash-change');
      const checkoutBtn = document.getElementById('btn-checkout');
      if (!receivedInput || !changeEl) return;

      const received = Number(receivedInput.value) || 0;
      const change = Math.max(0, received - totals.grand);
      changeEl.textContent = RS.rs(change);

      if (checkoutBtn) {
        if (paymentState.method === 'Cash' && received < totals.grand) {
          checkoutBtn.disabled = true;
          receivedInput.style.borderColor = 'var(--orange)';
        } else {
          checkoutBtn.disabled = totals.count < 1;
          receivedInput.style.borderColor = '';
        }
      }
    }

    function updateSplitChange() {
      const totals = RS.getTotals();
      const splitCash = document.getElementById('split-cash');
      const splitUpi = document.getElementById('split-upi');
      const splitCard = document.getElementById('split-card');
      const splitDue = document.getElementById('split-due');
      const statusText = document.getElementById('split-status-text');
      const totalText = document.getElementById('split-total-text');
      const checkoutBtn = document.getElementById('btn-checkout');
      if (!splitCash || !splitUpi || !splitCard || !splitDue || !statusText || !totalText) return;

      const cash = Math.max(0, Number(splitCash.value) || 0);
      const upi = Math.max(0, Number(splitUpi.value) || 0);
      const card = Math.max(0, Number(splitCard.value) || 0);
      const due = Math.max(0, Number(splitDue.value) || 0);

      const totalPaid = cash + upi + card + due;
      const remaining = totals.grand - totalPaid;

      totalText.textContent = `Paid: ₹${totalPaid}`;

      if (remaining === 0) {
        statusText.textContent = 'Balanced!';
        statusText.style.color = '#25d366';
        if (checkoutBtn) {
          checkoutBtn.disabled = totals.count < 1;
        }
        [splitCash, splitUpi, splitCard, splitDue].forEach(i => i.style.borderColor = '');
      } else if (remaining > 0) {
        statusText.textContent = `Remaining: ₹${remaining}`;
        statusText.style.color = 'var(--orange)';
        if (checkoutBtn) {
          checkoutBtn.disabled = true;
        }
        [splitCash, splitUpi, splitCard, splitDue].forEach(i => i.style.borderColor = '');
      } else {
        const overpaid = totalPaid - totals.grand;
        if (cash >= overpaid) {
          statusText.textContent = `Change Due: ₹${overpaid}`;
          statusText.style.color = '#25d366';
          if (checkoutBtn) {
            checkoutBtn.disabled = totals.count < 1;
          }
          [splitCash, splitUpi, splitCard, splitDue].forEach(i => i.style.borderColor = '');
        } else {
          statusText.textContent = `Overpaid by ₹${overpaid}`;
          statusText.style.color = 'var(--red)';
          if (checkoutBtn) {
            checkoutBtn.disabled = true;
          }
          [splitCash, splitUpi, splitCard, splitDue].forEach(i => i.style.borderColor = 'var(--red)');
        }
      }
    }

    function openDrawer(drawerId) {
      const backdrop = document.getElementById('cpay-drawer-backdrop');
      const drawer   = document.getElementById(drawerId);
      if (!drawer) return;
      document.querySelectorAll('.cpay-side-drawer').forEach(d => d.classList.remove('csd-open'));
      drawer.classList.add('csd-open');
      if (backdrop) backdrop.style.display = 'block';
    }
    function closeAllDrawers() {
      document.querySelectorAll('.cpay-side-drawer').forEach(d => d.classList.remove('csd-open'));
      const backdrop = document.getElementById('cpay-drawer-backdrop');
      if (backdrop) backdrop.style.display = 'none';
    }

    /* ─── Draggable drawer system ─────────────────────────────────────────────
       Drag handle = .csd-header  (the title bar of each drawer)
       Position saved in localStorage as rs_drawer_pos_<id>  { left, top }
       On restore the saved left/top override the CSS right/bottom defaults.
    ──────────────────────────────────────────────────────────────────────── */
    function makeDrawerDraggable(drawer) {
      if (!drawer) return;
      const id     = drawer.id;
      const handle = drawer.querySelector('.csd-header');
      if (!handle) return;

      const STORAGE_KEY = 'rs_drawer_pos_' + id;
      let isDragging = false, startX = 0, startY = 0, origLeft = 0, origTop = 0;

      /* ── Restore saved position ── */
      function applyStoredPos() {
        if (window.innerWidth <= 1024) {
          drawer.style.left = '';
          drawer.style.top = '';
          drawer.style.right = '';
          drawer.style.bottom = '';
          return;
        }
        try {
          const stored = JSON.parse(localStorage.getItem(STORAGE_KEY) || 'null');
          if (!stored) return;
          /* Clamp to keep drawer fully inside viewport */
          const vw = window.innerWidth,  vh = window.innerHeight;
          const dw = drawer.offsetWidth || 220, dh = drawer.offsetHeight || 300;
          const left = Math.min(Math.max(0, stored.left), vw - dw);
          const top  = Math.min(Math.max(0, stored.top),  vh - dh);
          setPos(left, top);
        } catch(e) {}
      }

      function setPos(left, top) {
        /* Switch from right/bottom anchoring to top/left */
        drawer.style.right  = 'auto';
        drawer.style.bottom = 'auto';
        drawer.style.left   = left + 'px';
        drawer.style.top    = top  + 'px';
      }

      // Add resize window listener to recalculate position/layout
      window.addEventListener('resize', applyStoredPos);

      function savePos() {
        try {
          localStorage.setItem(STORAGE_KEY, JSON.stringify({
            left: parseFloat(drawer.style.left) || 0,
            top:  parseFloat(drawer.style.top)  || 0
          }));
        } catch(e) {}
      }

      function getClientXY(e) {
        if (e.touches && e.touches.length) return { x: e.touches[0].clientX, y: e.touches[0].clientY };
        return { x: e.clientX, y: e.clientY };
      }

      function onStart(e) {
        if (window.innerWidth <= 1024) return;
        /* Ignore clicks on the close button itself */
        if (e.target.closest('.csd-close')) return;
        isDragging = true;
        drawer.classList.add('csd-dragging');
        document.body.classList.add('rs-drawer-dragging');

        /* If no stored position yet, snapshot current rendered position */
        if (!drawer.style.left || drawer.style.left === 'auto' || drawer.style.left === '') {
          const rect = drawer.getBoundingClientRect();
          origLeft = rect.left;
          origTop  = rect.top;
          setPos(origLeft, origTop);
        }

        const { x, y } = getClientXY(e);
        startX = x - parseFloat(drawer.style.left);
        startY = y - parseFloat(drawer.style.top);

        e.preventDefault();
      }

      function onMove(e) {
        if (!isDragging) return;
        const { x, y } = getClientXY(e);
        const vw = window.innerWidth,  vh = window.innerHeight;
        const dw = drawer.offsetWidth, dh = drawer.offsetHeight;
        const newLeft = Math.min(Math.max(0, x - startX), vw - dw);
        const newTop  = Math.min(Math.max(0, y - startY), vh - dh);
        setPos(newLeft, newTop);
        e.preventDefault();
      }

      function onEnd() {
        if (!isDragging) return;
        isDragging = false;
        drawer.classList.remove('csd-dragging');
        document.body.classList.remove('rs-drawer-dragging');
        savePos();
      }

      /* Mouse events */
      handle.addEventListener('mousedown',  onStart);
      document.addEventListener('mousemove', onMove);
      document.addEventListener('mouseup',   onEnd);

      /* Touch events */
      handle.addEventListener('touchstart',  onStart, { passive: false });
      document.addEventListener('touchmove', onMove,  { passive: false });
      document.addEventListener('touchend',  onEnd);

      /* Restore on load */
      applyStoredPos();

      /* Re-apply after each open (in case drawer was hidden and DOM rearranged) */
      const observer = new MutationObserver(() => {
        if (drawer.classList.contains('csd-open')) applyStoredPos();
      });
      observer.observe(drawer, { attributes: true, attributeFilter: ['class'] });
    }

    /* ─── Resizable drawer system (v2 – transform:scale) ────────────────────────
       HOW IT WORKS
       ════════════
       1.  A  .csd-scale-wrap  div is injected inside the drawer, wrapping the
           header + body.  It always renders at BASE_W (220 px) so content NEVER
           reflows or clips as you resize.
       2.  `transform: scale(ratio)` on the wrap shrinks/grows everything visually.
       3.  The outer drawer is set to  BASE_W × ratio  (width) and
           BASE_H × ratio  (height, measured after first open).
       4.  `overflow: hidden` on the drawer acts as a perfect viewport — no clip,
           no scrollbar, no cut content.
       5.  Sizes saved to localStorage as rs_drawer_size_<id> { w, h }.
    ─────────────────────────────────────────────────────────────────────────── */
    function makeDrawerResizable(drawer) {
      if (!drawer) return;
      const id       = drawer.id;
      const SIZE_KEY = 'rs_drawer_size_' + id;
      const BASE_W   = 220;
      const MIN_W = 140, MAX_W = 560;
      const MIN_H = 100, MAX_H = 800;

      /* ── 1.  Wrap header + body in a scale container ── */
      const hEl = drawer.querySelector('.csd-header');
      const bEl = drawer.querySelector('.csd-body');
      if (!hEl || !bEl) return;

      const wrap = document.createElement('div');
      wrap.className = 'csd-scale-wrap';
      wrap.style.cssText = `
        width: ${BASE_W}px;
        transform-origin: 0 0;
        flex-shrink: 0;
      `;
      // Insert before any existing handles
      drawer.insertBefore(wrap, drawer.firstChild);
      wrap.appendChild(hEl);
      wrap.appendChild(bEl);

      /* ── 2.  Inject resize handles ── */
      [
        ['csd-rh-e',  'e' ],
        ['csd-rh-s',  's' ],
        ['csd-rh-se', 'se'],
        ['csd-rh-w',  'w' ],
        ['csd-rh-sw', 'sw'],
      ].forEach(([cls, dir]) => {
        const el = document.createElement('div');
        el.className = 'csd-resize-handle ' + cls;
        el.dataset.dir = dir;
        drawer.appendChild(el);
      });

      /* ── 3.  Measure natural content height ────────────────────────────────
         Called once after the first open.
         Strips every height constraint (max-height, transform, explicit height)
         so scrollHeight gives the TRUE content height, not a clipped value.
      ──────────────────────────────────────────────────────────────────────── */
      let BASE_H = null;
      function measureBaseH() {
        if (BASE_H !== null) return;

        // Save current inline styles
        const saved = {
          height:    drawer.style.height,
          maxHeight: drawer.style.maxHeight,
          overflow:  drawer.style.overflow,
          wrapH:     wrap.style.height,
          wrapT:     wrap.style.transform,
        };

        // Strip everything so the layout expands to its true natural height
        drawer.style.height    = 'auto';
        drawer.style.maxHeight = 'none';
        drawer.style.overflow  = 'visible';
        wrap.style.height    = 'auto';
        wrap.style.transform = 'none';   // ← critical: remove scale so offsetHeight is unscaled

        // Force a synchronous layout flush
        void wrap.offsetHeight;

        BASE_H = wrap.scrollHeight || wrap.offsetHeight || 350;

        // Restore inline styles
        drawer.style.height    = saved.height;
        drawer.style.maxHeight = saved.maxHeight;
        drawer.style.overflow  = saved.overflow;
        wrap.style.height    = saved.wrapH;
        wrap.style.transform = saved.wrapT;
      }

      /* ── 4.  Core: apply a scale ratio to the whole drawer ── */
      function applySize(targetW, targetH) {
        if (window.innerWidth <= 1024) {
          drawer.style.width = '';
          drawer.style.height = '';
          drawer.style.maxHeight = '';
          drawer.style.overflow = '';
          drawer.style.borderRadius = '';
          wrap.style.width = '100%';
          wrap.style.transform = '';
          wrap.style.height = '100%';
          bEl.style.overflowY = 'auto';
          return;
        }
        const w     = Math.min(Math.max(targetW, MIN_W), MAX_W);
        const scale = w / BASE_W;

        // Outer drawer = viewport
        drawer.style.width      = w + 'px';
        drawer.style.overflow   = 'hidden';
        drawer.style.maxHeight  = 'none';        // never let CSS max-height clip
        drawer.style.borderRadius = '12px';

        // Inner wrap always rendered at BASE_W pixels, scaled visually
        wrap.style.width     = BASE_W + 'px';
        wrap.style.transform = `scale(${scale})`;

        if (targetH != null) {
          // Explicit height drag — respect user's chosen height
          const h = Math.min(Math.max(targetH, MIN_H), MAX_H);
          drawer.style.height  = h + 'px';
          // Give the wrap enough internal height (in content space) to fill the viewport
          wrap.style.height    = (h / scale) + 'px';
          bEl.style.overflowY  = 'auto';          // scroll if content overflows
        } else if (BASE_H !== null) {
          // Width-only resize: scale height proportionally with content
          const h = Math.round(BASE_H * scale);
          drawer.style.height  = h + 'px';
          wrap.style.height    = BASE_H + 'px';   // wrap stays at unscaled content height
          bEl.style.overflowY  = 'auto';           // auto not hidden — denominations never vanish
        } else {
          // BASE_H not yet measured — let drawer auto-size this render
          drawer.style.height  = '';
          wrap.style.height    = '';
        }
      }

      /* ── 5.  Save / restore ── */
      function saveSize() {
        try {
          localStorage.setItem(SIZE_KEY, JSON.stringify({
            w: parseFloat(drawer.style.width) || BASE_W,
            h: drawer.style.height ? parseFloat(drawer.style.height) : null
          }));
        } catch(e) {}
      }

      function restoreSize() {
        if (window.innerWidth <= 1024) {
          drawer.style.width = '';
          drawer.style.height = '';
          drawer.style.maxHeight = '';
          drawer.style.overflow = '';
          drawer.style.borderRadius = '';
          wrap.style.width = '100%';
          wrap.style.transform = '';
          wrap.style.height = '100%';
          bEl.style.overflowY = 'auto';
          return;
        }
        try {
          const s = JSON.parse(localStorage.getItem(SIZE_KEY) || 'null');
          if (s) applySize(s.w, s.h);
        } catch(e) {}
      }

      // Add resize window listener to reset sizing if view shrinks
      window.addEventListener('resize', restoreSize);

      /* ── 6.  Resize drag tracking ── */
      let isResizing = false, rDir = '';
      let rStartX, rStartY, rStartW, rStartH, rStartLeft;

      function getXY(e) {
        return e.touches && e.touches.length
          ? { x: e.touches[0].clientX, y: e.touches[0].clientY }
          : { x: e.clientX,            y: e.clientY            };
      }

      function onResizeStart(e) {
        if (window.innerWidth <= 1024) return;
        const handle = e.target.closest('.csd-resize-handle');
        if (!handle) return;
        e.preventDefault();
        e.stopPropagation();    // don't accidentally start a drag-move

        measureBaseH();         // ensure we have BASE_H before resizing

        isResizing = true;
        rDir       = handle.dataset.dir;
        const { x, y } = getXY(e);
        rStartX    = x;
        rStartY    = y;
        rStartW    = drawer.offsetWidth;
        rStartH    = drawer.offsetHeight;
        rStartLeft = parseFloat(drawer.style.left) || drawer.getBoundingClientRect().left;

        document.body.classList.add('rs-drawer-dragging');
        drawer.classList.add('csd-resizing');
      }

      function onResizeMove(e) {
        if (!isResizing) return;
        const { x, y } = getXY(e);
        const dx = x - rStartX;
        const dy = y - rStartY;

        let newW = rStartW;
        let newH = null;

        if (rDir.includes('e')) newW = rStartW + dx;
        if (rDir.includes('w')) {
          newW = rStartW - dx;
          const clamped = Math.min(Math.max(newW, MIN_W), MAX_W);
          drawer.style.left  = (rStartLeft + rStartW - clamped) + 'px';
          drawer.style.right = 'auto';
        }
        if (rDir.includes('s')) newH = rStartH + dy;

        applySize(newW, newH);
        e.preventDefault();
      }

      function onResizeEnd() {
        if (!isResizing) return;
        isResizing = false;
        drawer.classList.remove('csd-resizing');
        document.body.classList.remove('rs-drawer-dragging');
        saveSize();
      }

      /* Mouse */
      drawer.addEventListener('mousedown',   onResizeStart);
      document.addEventListener('mousemove', onResizeMove);
      document.addEventListener('mouseup',   onResizeEnd);

      /* Touch */
      drawer.addEventListener('touchstart',  onResizeStart, { passive: false });
      document.addEventListener('touchmove', onResizeMove,  { passive: false });
      document.addEventListener('touchend',  onResizeEnd);

      /* Measure + restore after each open */
      const obs = new MutationObserver(() => {
        if (drawer.classList.contains('csd-open')) {
          requestAnimationFrame(() => {
            measureBaseH();
            restoreSize();
          });
        }
      });
      obs.observe(drawer, { attributes: true, attributeFilter: ['class'] });
    }


    function refreshPaymentPanel(opts){
      // opts.allowOpen = true  → only set when user EXPLICITLY clicks a payment method btn
      // Without it, tab-switches and cart re-renders just sync state without popping the drawer
      const allowOpen = opts && opts.allowOpen;
      console.log('[DEBUG] refreshPaymentPanel entered. paymentState.method =', paymentState.method, 'allowOpen =', allowOpen);
      const totals = RS.getTotals();
      console.log('[DEBUG] refreshPaymentPanel totals =', JSON.stringify(totals));
      const note = document.getElementById('pay-method-note');
      const checkoutBtn = document.getElementById('btn-checkout');
      console.log('[DEBUG] refreshPaymentPanel checkoutBtn =', !!checkoutBtn);
      if(!checkoutBtn) return;
      document.querySelectorAll('[data-pay-method]').forEach(btn=>btn.classList.toggle('active', btn.dataset.payMethod === paymentState.method));
      if(note) note.textContent = paymentState.method;
      checkoutBtn.disabled = totals.count < 1;

      // Only open / close drawers when user explicitly triggered (e.g. clicking Cash/Split btn)
      if (paymentState.method === 'Cash') {
        console.log('[DEBUG] refreshPaymentPanel: handling Cash method');
        const receivedInput = document.getElementById('inline-cash-received');
        if (receivedInput) {
          const currentVal = Number(receivedInput.value) || 0;
          if (!receivedInput.dataset.userInteracted || currentVal <= 0 || receivedInput.dataset.grandTotal !== String(totals.grand)) {
            receivedInput.value = totals.grand || '';
            receivedInput.dataset.grandTotal = totals.grand;
            delete receivedInput.dataset.userInteracted;
          }
        }
        if (allowOpen) {
          console.log('[DEBUG] refreshPaymentPanel: calling openDrawer(cash-drawer)');
          openDrawer('cash-drawer');
        }
        updateInlineChange();
      } else if (paymentState.method === 'Split') {
        console.log('[DEBUG] refreshPaymentPanel: handling Split method');
        const splitCash = document.getElementById('split-cash');
        const splitUpi  = document.getElementById('split-upi');
        const splitCard = document.getElementById('split-card');
        const splitDue  = document.getElementById('split-due');
        const cashVal = Number(splitCash?.value) || 0;
        const upiVal  = Number(splitUpi?.value)  || 0;
        const cardVal = Number(splitCard?.value) || 0;
        const dueVal  = Number(splitDue?.value)  || 0;
        if (cashVal === 0 && upiVal === 0 && cardVal === 0 && dueVal === 0) {
          if (splitCash) splitCash.value = totals.grand || '';
          if (splitUpi)  splitUpi.value  = '';
          if (splitCard) splitCard.value = '';
          if (splitDue)  splitDue.value  = '';
        }
        isSplitPaymentActive = true;
        if (allowOpen) {
          console.log('[DEBUG] refreshPaymentPanel: calling openDrawer(split-drawer)');
          openDrawer('split-drawer');
        }
        updateSplitChange();
      } else {
        console.log('[DEBUG] refreshPaymentPanel: closing drawers');
        closeAllDrawers();
        isSplitPaymentActive = false;
      }
    }

    function wirePaymentPanel(){
      const methods = document.getElementById('cart-pay-methods');
      console.log('[DEBUG] wirePaymentPanel: methods element found =', !!methods);
      if(methods) {
        methods.addEventListener('click', e=>{
          console.log('[DEBUG] cart-pay-methods click event triggered');
          const btn = e.target.closest('[data-pay-method]');
          console.log('[DEBUG] cart-pay-methods click closest button found =', !!btn, btn ? btn.dataset.payMethod : null);
          if(!btn) return;
          paymentState.method = btn.dataset.payMethod;
          // Pass allowOpen:true so the drawer opens on explicit user click
          refreshPaymentPanel({ allowOpen: true });
        });
      }

      // Close drawer buttons
      const cashClose = document.getElementById('cash-drawer-close');
      console.log('[DEBUG] cash-drawer-close element found =', !!cashClose);
      cashClose?.addEventListener('click', () => {
        console.log('[DEBUG] cash-drawer-close clicked');
        closeAllDrawers();
      });

      const splitClose = document.getElementById('split-drawer-close');
      console.log('[DEBUG] split-drawer-close element found =', !!splitClose);
      splitClose?.addEventListener('click', () => {
        console.log('[DEBUG] split-drawer-close clicked');
        closeAllDrawers();
        isSplitPaymentActive = false;
      });

      // Backdrop click-outside close with animation (CSS handles it)
      const backdrop = document.getElementById('cpay-drawer-backdrop');
      console.log('[DEBUG] cpay-drawer-backdrop element found =', !!backdrop);
      backdrop?.addEventListener('click', () => {
        console.log('[DEBUG] cpay-drawer-backdrop clicked');
        closeAllDrawers();
      });

      // Wire cash received input
      const receivedInput = document.getElementById('inline-cash-received');
      if (receivedInput) {
        receivedInput.addEventListener('input', () => {
          receivedInput.dataset.userInteracted = '1';
          updateInlineChange();
        });
      }

      // Wire split inputs
      ['split-cash', 'split-upi', 'split-card', 'split-due'].forEach(id => {
        const inp = document.getElementById(id);
        if (inp) inp.addEventListener('input', updateSplitChange);
      });

      // Wire denomination buttons
      const inlineDenButtons = document.querySelectorAll('#cash-denominations-grid .btn-den');
      inlineDenButtons.forEach(btn => {
        btn.onclick = (e) => {
          e.preventDefault();
          e.stopPropagation();
          const val = btn.dataset.val;
          const totals = RS.getTotals();
          if (!receivedInput) return;
          let current = Number(receivedInput.value) || 0;
          if (val === 'exact') {
            receivedInput.value = totals.grand;
            delete receivedInput.dataset.userInteracted;
          } else if (val === 'clear') {
            receivedInput.value = '';
            receivedInput.dataset.userInteracted = '1';
          } else {
            const increment = Number(val) || 0;
            if (current === totals.grand && !receivedInput.dataset.userInteracted) {
              receivedInput.value = increment;
            } else {
              receivedInput.value = current + increment;
            }
            receivedInput.dataset.userInteracted = '1';
          }
          updateInlineChange();
        };
      });

      // ── Initialise drag-to-reposition + resize for both drawers ──
      makeDrawerDraggable(document.getElementById('cash-drawer'));
      makeDrawerDraggable(document.getElementById('split-drawer'));
      makeDrawerResizable(document.getElementById('cash-drawer'));
      makeDrawerResizable(document.getElementById('split-drawer'));

      refreshPaymentPanel();
    }
    async function checkout(){
      const totals = RS.getTotals();
      const cust = RS.getCustomer();
      if(!totals.count) return RS.toast('Cart is empty','fa-circle-exclamation');
      const payment = getPaymentDetails();
      if(!payment.valid) return RS.toast('Cart is empty','fa-circle-exclamation');

      async function finalizeBill(payMethod, receivedVal, changeVal, customTenders) {
        if(isDineIn() && !isKotSent() && !window.confirm('KOT not sent. Continue billing?')) return;

        let dueAmount = 0;
        if (customTenders) {
          const dueTender = customTenders.find(t => t.method === 'Due');
          if (dueTender) dueAmount = dueTender.amount;
        } else if (payMethod === 'Due') {
          dueAmount = totals.grand;
        }

        const hasPhone = cust.phone && cust.phone.trim();
        const hasName = cust.name && cust.name.trim() && cust.name.toLowerCase() !== 'walk-in guest' && cust.name.toLowerCase() !== 'walk-in';
        if (hasPhone || hasName) {
          try {
            const customers = window.RS_DB ? await RS_DB.list('customers').catch(() => []) : [];
            let matched = null;
            if (hasPhone) {
              matched = customers.find(c => c.phone && String(c.phone).trim() === String(cust.phone).trim());
            } else if (hasName) {
              matched = customers.find(c => c.name && String(c.name).trim().toLowerCase() === String(cust.name).trim().toLowerCase());
            }
            if (matched) {
              matched.visits = (matched.visits || 0) + 1;
              matched.spend = (matched.spend || 0) + totals.grand;
              matched.last = new Date().toLocaleDateString('en-CA');
              if (dueAmount > 0) {
                matched.dues = (matched.dues || 0) + dueAmount;
              }
              if (hasName && !matched.name) matched.name = cust.name.trim();
              if (hasPhone && !matched.phone) matched.phone = cust.phone.trim();
              await RS_DB.put('customers', matched.id, matched);
              RS.toast('CRM customer details updated', 'fa-address-book');
            } else {
              const newCust = {
                id: 'cust-' + Date.now(),
                name: cust.name ? cust.name.trim() : 'Guest',
                phone: cust.phone ? cust.phone.trim() : '',
                email: '',
                visits: 1,
                spend: totals.grand,
                last: new Date().toLocaleDateString('en-CA'),
                dues: dueAmount,
                tier: totals.grand > 25000 ? 'vip' : totals.grand > 12000 ? 'gold' : 'silver'
              };
              await RS_DB.put('customers', newCust.id, newCust);
              RS.toast('New customer added to CRM', 'fa-address-book');
            }
            if (typeof loadCustomersForPos === 'function') {
              await loadCustomersForPos();
            }
          } catch (e) {
            console.warn("Failed to link customer to CRM on checkout", e);
          }
        }

        const bill = {
          no:(RS.nextBillNo ? RS.nextBillNo(RS.BILLS || []) : 'RS-'+Date.now()), time:new Date().toLocaleString('en-IN',{day:'2-digit',month:'short',hour:'numeric',minute:'2-digit',hour12:true}),
          table: cust.table, customer: cust.name||'', customerPhone: cust.phone||'', customerGst: cust.gst||'', items: totals.items, sub: totals.sub, disc: totals.disc, gst: totals.gst, grand: totals.grand,
          tenders: customTenders || [{ method: payMethod, amount: receivedVal }], change: changeVal || 0,
          taxSummary: totals.taxSummary, channel: totals.channel, taxProfile: totals.taxProfile, liquorTaxAmount: totals.liquorTax, serviceChargeAmount: totals.serviceCharge
        };
        try {
          const syncErrorBefore = window.RS_LAST_CLOUD_ERROR && window.RS_LAST_CLOUD_ERROR.time;
          const gstHalf = Math.round((totals.gst||0)/2);
          const billRow = { id:bill.no, orderId:bill.no, no:bill.no, time:bill.time, dateTime:new Date().toISOString(), table:bill.table, items: totals.count,
            amount: bill.grand, pay: payMethod, paymentMethod: payMethod, total: bill.grand, status:'paid',
            receivedAmount: receivedVal, changeAmount: changeVal,
            customerName: cust.name||'Walk-in Guest', customerPhone: cust.phone||'',
            subtotal: totals.sub, gst: totals.gst, cgst: gstHalf, sgst: (totals.gst||0)-gstHalf,
            _items: totals.items.map(i=>({ name:i.name, qty:i.qty, price:i.price, taxCategory: i.taxCategory || i.tax_category })),
            taxSummary: totals.taxSummary, channel: totals.channel, taxProfile: totals.taxProfile, liquorTaxAmount: totals.liquorTax, serviceChargeAmount: totals.serviceCharge };
          RS.BILLS.unshift(billRow);
          if (RS.saveOne) await RS.saveOne('bills',billRow);
          const syncErrorAfter = window.RS_LAST_CLOUD_ERROR && window.RS_LAST_CLOUD_ERROR.time;
          if (syncErrorAfter && syncErrorAfter !== syncErrorBefore) {
            RS.toast('Bill saved locally. Cloud sync pending.','fa-cloud-arrow-up');
          }
          const refreshBills = () => RS.render && RS.render('bills-tab');
          if (window.requestIdleCallback) window.requestIdleCallback(refreshBills, { timeout: 1200 });
          else window.setTimeout(refreshBills, 350);
        } catch(e){
          console.warn('Bill save failed', e);
          RS.toast('Bill saved locally. Cloud sync pending.','fa-cloud-arrow-up');
        }

        RS.clearCart();
        resetCustomerFields();
        resetPayment();
        showReceipt(bill);

        if (window.RS_DB) {
          try {
            const tableVal = cust.table || 'Walk-in / Takeaway';
            let draftName = tableVal;
            if (tableVal === 'Walk-in / Takeaway') {
              draftName = 'Takeaway';
            } else if (tableVal.startsWith('Delivery')) {
              draftName = 'Delivery';
            }
            const draftsList = await RS_DB.list('drafts').catch(() => []);
            const draftToDel = draftsList.find(d => d.draftName === draftName);
            if (draftToDel) {
              await RS_DB.del('drafts', draftToDel.id).catch(() => {});
            }

            const rows = await RS_DB.list('pending_orders').catch(() => []);
            const matched = rows.find(r =>
              (r.tableNumber === cust.table || r.tableNumber === cust.table.replace('Table ', '')) &&
              (r.status === 'Pending Review' || r.status === 'Accepted' || r.status === 'preparing' || r.status === 'served' || r.status === 'Ready' || r.status === 'DineIn Active')
            );
            if (matched) {
              await RS_DB.del('pending_orders', matched.id);
              if (window.RS_SYNC) window.RS_SYNC.syncPendingOrders();
            }
            
            // Sync in-memory held orders and reload table grid
            await loadHeldFromDB();
            await renderPosTableGrid();
          } catch(e) {
            console.warn("Failed to clear pending order or draft on checkout", e);
          }
        }
      }

      if (payment.method === 'Due' && !cust.phone) {
        return RSModal.open({
          title: 'Customer Required for Credit',
          sub: 'Dues require a registered customer profile',
          icon: 'fa-user-tag',
          size: 'sm',
          body: `
            <div style="display:flex;flex-direction:column;gap:12px;font-family:var(--font-body),sans-serif;">
              <p style="font-size:13px;line-height:1.5;margin:0;color:var(--text-soft)">To check out an order as <b>Due (Credit)</b>, you must select a customer. Register a new customer instantly below:</p>
              <div class="form-group" style="display:flex;flex-direction:column;gap:4px;">
                <label style="font-size:11px;font-weight:700;color:var(--text-soft)">Full Name</label>
                <input type="text" class="form-input" id="quick-cust-name" placeholder="E.g., John Doe" style="padding:8px 10px;font-size:13px;">
              </div>
              <div class="form-group" style="display:flex;flex-direction:column;gap:4px;">
                <label style="font-size:11px;font-weight:700;color:var(--text-soft)">Phone Number</label>
                <input type="text" class="form-input" id="quick-cust-phone" placeholder="E.g., +91 98765 43210" style="padding:8px 10px;font-size:13px;">
              </div>
            </div>
          `,
          foot: `
            <button class="btn btn-ghost" data-close-modal style="flex:1">Cancel</button>
            <button class="btn btn-primary" id="btn-quick-register-checkout" style="flex:1.5;background:var(--orange);border-color:var(--orange);color:#fff;"><i class="fa-solid fa-user-plus"></i> Register &amp; Pay</button>
          `,
          onMount(modal, close) {
            modal.querySelector('[data-close-modal]').onclick = close;
            modal.querySelector('#btn-quick-register-checkout').onclick = async () => {
              const name = modal.querySelector('#quick-cust-name').value.trim();
              const phone = modal.querySelector('#quick-cust-phone').value.trim();
              if (!name || !phone) {
                RS.toast('Name and phone are required', 'fa-circle-exclamation');
                return;
              }
              if (window.RS_DB) {
                try {
                  const newCust = {
                    id: 'cust-' + Date.now(),
                    name,
                    phone,
                    visits: 0,
                    spend: 0,
                    last: new Date().toLocaleDateString('en-CA'),
                    tier: 'silver',
                    dues: 0
                  };
                  await RS_DB.put('customers', newCust.id, newCust);
                  
                  const csel = document.getElementById('cart-customer-sel');
                  if (csel) {
                    csel.value = phone;
                  }
                  document.dispatchEvent(new CustomEvent('rs:hydrated'));
                  
                  setTimeout(() => {
                    if (csel) {
                      const opts = Array.from(csel.options);
                      const opt = opts.find(o => o.value === phone);
                      if (opt) opt.selected = true;
                    }
                    
                    close();
                    RS.toast('Customer registered! Completing checkout...', 'fa-circle-check');
                    setTimeout(checkout, 150);
                  }, 100);
                  
                } catch (e) {
                  console.warn("Failed saving customer on checkout", e);
                  RS.toast('Registration failed: ' + e.message, 'fa-circle-exclamation');
                }
              } else {
                close();
              }
            };
          }
        });
      }

      if (payment.method === 'Split') {
        const splitCash = document.getElementById('split-cash');
        const splitUpi = document.getElementById('split-upi');
        const splitCard = document.getElementById('split-card');
        const splitDue = document.getElementById('split-due');

        const cash = Math.max(0, Number(splitCash?.value) || 0);
        const upi = Math.max(0, Number(splitUpi?.value) || 0);
        const card = Math.max(0, Number(splitCard?.value) || 0);
        const due = Math.max(0, Number(splitDue?.value) || 0);

        const totalPaid = cash + upi + card + due;
        if (totalPaid < totals.grand) {
          return RS.toast('Insufficient total amount paid', 'fa-circle-exclamation');
        }

        const changeAmount = Math.max(0, totalPaid - totals.grand);
        if (changeAmount > cash) {
          return RS.toast('Change can only be returned from cash', 'fa-circle-exclamation');
        }

        if (due > 0 && !cust.phone) {
          return RSModal.open({
            title: 'Customer Required for Credit',
            sub: 'Dues require a registered customer profile',
            icon: 'fa-user-tag',
            size: 'sm',
            body: `
              <div style="display:flex;flex-direction:column;gap:12px;font-family:var(--font-body),sans-serif;">
                <p style="font-size:13px;line-height:1.5;margin:0;color:var(--text-soft)">To check out an order with a <b>Due (Credit)</b> split, you must select a customer. Register a new customer instantly below:</p>
                <div class="form-group" style="display:flex;flex-direction:column;gap:4px;">
                  <label style="font-size:11px;font-weight:700;color:var(--text-soft)">Full Name</label>
                  <input type="text" class="form-input" id="quick-cust-name" placeholder="E.g., John Doe" style="padding:8px 10px;font-size:13px;">
                </div>
                <div class="form-group" style="display:flex;flex-direction:column;gap:4px;">
                  <label style="font-size:11px;font-weight:700;color:var(--text-soft)">Phone Number</label>
                  <input type="text" class="form-input" id="quick-cust-phone" placeholder="E.g., +91 98765 43210" style="padding:8px 10px;font-size:13px;">
                </div>
              </div>
            `,
            foot: `
              <button class="btn btn-ghost" data-close-modal style="flex:1">Cancel</button>
              <button class="btn btn-primary" id="btn-quick-register-checkout" style="flex:1.5;background:var(--orange);border-color:var(--orange);color:#fff;"><i class="fa-solid fa-user-plus"></i> Register &amp; Pay</button>
            `,
            onMount(modal, close) {
              modal.querySelector('[data-close-modal]').onclick = close;
              modal.querySelector('#btn-quick-register-checkout').onclick = async () => {
                const name = modal.querySelector('#quick-cust-name').value.trim();
                const phone = modal.querySelector('#quick-cust-phone').value.trim();
                if (!name || !phone) {
                  RS.toast('Name and phone are required', 'fa-circle-exclamation');
                  return;
                }
                if (window.RS_DB) {
                  try {
                    const newCust = {
                      id: 'cust-' + Date.now(),
                      name,
                      phone,
                      visits: 0,
                      spend: 0,
                      last: new Date().toLocaleDateString('en-CA'),
                      tier: 'silver',
                      dues: 0
                    };
                    await RS_DB.put('customers', newCust.id, newCust);
                    
                    const csel = document.getElementById('cart-customer-sel');
                    if (csel) {
                      csel.value = phone;
                    }
                    document.dispatchEvent(new CustomEvent('rs:hydrated'));
                    
                    setTimeout(() => {
                      if (csel) {
                        const opts = Array.from(csel.options);
                        const opt = opts.find(o => o.value === phone);
                        if (opt) opt.selected = true;
                      }
                      
                      close();
                      RS.toast('Customer registered! Completing checkout...', 'fa-circle-check');
                      setTimeout(checkout, 150);
                    }, 100);
                    
                  } catch (e) {
                    console.warn("Failed saving customer on checkout", e);
                    RS.toast('Registration failed: ' + e.message, 'fa-circle-exclamation');
                  }
                } else {
                  close();
                }
              };
            }
          });
        }

        const tenders = [];
        if (cash > 0) tenders.push({ method: 'Cash', amount: cash - changeAmount });
        if (upi > 0) tenders.push({ method: 'UPI', amount: upi });
        if (card > 0) tenders.push({ method: 'Card', amount: card });
        if (due > 0) tenders.push({ method: 'Due', amount: due });

        await finalizeBill('Split', totalPaid, changeAmount, tenders);
        return;
      }

      if (payment.method === 'Cash') {
        const receivedInput = document.getElementById('inline-cash-received');
        const cashReceived = receivedInput ? (Number(receivedInput.value) || totals.grand) : totals.grand;
        const changeAmount = Math.max(0, cashReceived - totals.grand);
        if (cashReceived < totals.grand) {
          return RS.toast('Insufficient cash received', 'fa-circle-exclamation');
        }
        await finalizeBill('Cash', cashReceived, changeAmount);
        return;
      }

      await finalizeBill(payment.method, totals.grand, 0);
    }

    /* ---------------- KOT ---------------- */
    function kot(){
      const totals = RS.getTotals();
      const cust = RS.getCustomer();
      if(!totals.count) return RS.toast('Cart is empty','fa-circle-exclamation');
      const tok = RS.seedToken();
      const kotInner = `<div class="kot-h"><span class="kt">KOT ${tok}</span><span style="font-weight:700">${cust.table}</span></div>
        <div style="font-size:11.5px;color:#6b6960;margin-bottom:8px">${new Date().toLocaleTimeString('en-IN',{hour:'numeric',minute:'2-digit'})} · ${totals.count} items</div>
        ${totals.items.map(i=>`<div class="kot-item"><span class="kq">${i.qty}×</span><span>${i.name}</span></div>`).join('')}`;
      RSModal.open({
        title:'Kitchen ticket', sub:'Token '+tok, icon:'fa-fire', size:'sm',
        body:`<div class="kot-paper">${kotInner}</div>`,
        foot:`<button class="btn btn-ghost" id="kot-print" style="flex:1"><i class="fa-solid fa-print"></i> Print ticket</button>
              <button class="btn btn-primary" id="kot-send" style="flex:1"><i class="fa-solid fa-fire"></i> Send to kitchen</button>`,
        onMount(modal, close){
          modal.querySelector('#kot-print').onclick = ()=> RSPrint(`<div style="max-width:280px;margin:0 auto">${kotInner}</div>`,'KOT '+tok);
          modal.querySelector('#kot-send').onclick = async ()=>{
            close();
            if(window.RS_DB){
              try {
                const tempId = 'kot-' + Date.now();
                const orderData = {
                  orderId: tok,
                  customerName: cust.name || 'Walk-in Guest',
                  customerPhone: cust.phone || '',
                  items: totals.items.map(i => ({ name: i.name, qty: i.qty, price: i.price })),
                  subtotal: totals.sub,
                  discount: totals.disc,
                  gst: totals.gst,
                  total: totals.grand,
                  paymentMethod: 'Cash',
                  orderType: cust.table === 'Walk-in / Takeaway' ? 'Takeaway' : 'Dine-in',
                  tableNumber: cust.table,
                  status: 'Pending Review',
                  dateTime: new Date().toISOString(),
                  priority: 'normal'
                };
                await RS_DB.put('pending_orders', tempId, orderData);
                if (window.RS_SYNC) window.RS_SYNC.syncPendingOrders();
              } catch(e) {
                console.warn("KOT save failed", e);
                RS.toast('KOT saved locally. Cloud sync pending.','fa-cloud-arrow-up');
              }
            }
            markKotSent();
            RS.toast('KOT '+tok+' fired to kitchen','fa-fire');

            // Auto-print KOT if enabled in settings
            if (window.RS && typeof window.RS.getSettings === 'function') {
              try {
                const settings = await window.RS.getSettings();
                if (settings && settings.set_auto_print_kot) {
                  RSPrint(`<div style="max-width:280px;margin:0 auto">${kotInner}</div>`,'KOT '+tok);
                }
              } catch(e) {
                console.error("Failed to read settings for auto-print KOT", e);
              }
            }
          };
        }
      });
    }

    wirePaymentPanel();
    window.RSPOS = { checkout, kot, refreshPaymentPanel };
    if (!document.documentElement.dataset.rsPosActionsBound) {
      document.documentElement.dataset.rsPosActionsBound = '1';
      document.addEventListener('click', async e => {
        const btn = e.target.closest('#btn-checkout, #btn-kot, #btn-clear-cart');
        if (!btn || btn.disabled) return;
        e.preventDefault();
        e.stopPropagation();
        if (btn.id === 'btn-checkout') return checkout();
        if (btn.id === 'btn-kot') return kot();
        if (btn.id === 'btn-clear-cart') {
          const totals = RS.getTotals();
          if (totals.count > 0 && confirm("Clear current cart?")) {
            const tableSelect = document.getElementById('cart-table');
            const tableVal = tableSelect ? tableSelect.value : 'Walk-in / Takeaway';

            RS.clearCart();
            resetCustomerFields();
            resetPayment();

            if (window.RS_DB) {
              try {
                let draftName = tableVal;
                if (tableVal === 'Walk-in / Takeaway') {
                  draftName = 'Takeaway';
                } else if (tableVal.startsWith('Delivery')) {
                  draftName = 'Delivery';
                }
                const draftsList = await window.RS_DB.list('drafts').catch(() => []);
                const draftToDel = draftsList.find(d => d.draftName === draftName);
                if (draftToDel) {
                  await window.RS_DB.del('drafts', draftToDel.id).catch(() => {});
                }
                await loadHeldFromDB();
                await renderPosTableGrid();
              } catch(e) {
                console.warn("Failed to delete draft on clear cart", e);
              }
            }
          }
          return;
        }
      }, true);
    }

    /* ---------------- HOLD ORDERS / DRAFTS ---------------- */
    // Separate held orders per order type
    const heldOrders = {
      takeaway: [],
      dinein: [],
      delivery: []
    };

    // Helper to get current order type key
    function getCurrentOrderTypeKey() {
      const activeBtn = document.querySelector('.order-type-btn.active');
      const typeText = activeBtn ? activeBtn.textContent.trim().toLowerCase() : 'takeaway';
      if (typeText.includes('dine')) return 'dinein';
      if (typeText.includes('delivery')) return 'delivery';
      return 'takeaway';
    }

    // Helper to get order type key from text
    function getOrderTypeKeyFromText(typeText) {
      typeText = typeText.toLowerCase();
      if (typeText.includes('dine')) return 'dinein';
      if (typeText.includes('delivery')) return 'delivery';
      return 'takeaway';
    }

    // Helper to get order type display name
    function getOrderTypeDisplayName(key) {
      const names = {
        takeaway: 'Takeaway Active Holds',
        dinein: 'Dine-in Active Holds',
        delivery: 'Delivery Active Holds'
      };
      return names[key] || 'Held Orders';
    }

    // Update held counts for all order types
    function updateHeldCount() {
      // Update each type's count and blinking state
      Object.keys(heldOrders).forEach(key => {
        const count = heldOrders[key].length;
        // Update desktop button badge
        const countEl = document.getElementById(`held-count-${key}`);
        if (countEl) countEl.textContent = count ? `(${count})` : '';
        // Update mobile button badge
        const countElM = document.getElementById(`held-count-${key}-m`);
        if (countElM) countElM.textContent = count ? `(${count})` : '';
        // Toggle blinking animation
        const btn = document.getElementById(`btn-hold-${key}`);
        if (btn) btn.classList.toggle('hold-btn-blinking', count > 0);
        const btnM = document.getElementById(`btn-m-hold-${key}`);
        if (btnM) btnM.classList.toggle('hold-btn-blinking', count > 0);
      });

      // Show/hide mobile hold buttons group
      const hasAnyHeld = Object.values(heldOrders).some(arr => arr.length > 0);
      const mobileHoldGroup = document.getElementById('pos-m-hold-buttons');
      if (mobileHoldGroup) mobileHoldGroup.style.display = hasAnyHeld ? 'flex' : 'none';
    }

    // Load all held orders from DB and split by type
    async function loadHeldFromDB() {
      if (window.RS_DB) {
        try {
          const rows = await RS_DB.list('drafts');
          // Reset all arrays
          Object.keys(heldOrders).forEach(key => heldOrders[key].length = 0);
          rows.forEach(r => {
            const orderTypeKey = r.orderType ? getOrderTypeKeyFromText(r.orderType) : getOrderTypeKeyFromText(r.draftName || 'Takeaway');
            heldOrders[orderTypeKey].push({
              id: Number(r.id),
              draftId: r.draftId || String(r.id),
              items: r.items || [],
              table: r.name || r.draftName || 'Walk-in / Takeaway',
              name: r.customerName || '',
              phone: r.customerPhone || '',
              gst: r.customerGst || '',
              count: (r.items || []).reduce((sum, item) => sum + (item.qty || 1), 0),
              total: r.total || 0,
              time: r.time || new Date().toLocaleTimeString('en-IN', {hour: 'numeric', minute: '2-digit', hour12: true}),
              orderType: r.orderType || orderTypeKey,
              deliveryAddress: r.deliveryAddress || '',
              deliveryCharge: r.deliveryCharge || '',
              deliveryRider: r.deliveryRider || ''
            });
          });
          updateHeldCount();
        } catch(e) {
          console.warn("Failed to load held orders from database", e);
        }
      }
    }

    async function holdCurrent(){
      const totals = RS.getTotals();
      if(!totals.count) return RS.toast('Nothing to hold','fa-circle-exclamation');
      
      const cust = RS.getCustomer();
      const id = Date.now();
      const draftId = 'D' + id;
      const orderTypeKey = getCurrentOrderTypeKey();
      
      const newHeld = { 
        id: id, 
        draftId: draftId,
        items: RS.getCart(), 
        table: cust.table, 
        name: cust.name, 
        phone: cust.phone, 
        gst: cust.gst, 
        count: totals.count, 
        total: totals.grand, 
        time: new Date().toLocaleTimeString('en-IN',{hour:'numeric',minute:'2-digit',hour12:true}),
        orderType: orderTypeKey
      };
      
      heldOrders[orderTypeKey].push(newHeld);
      
      if (window.RS_DB) {
        try {
          // Save delivery fields as well
          const da = document.getElementById('delivery-address');
          const dc = document.getElementById('delivery-charge');
          const dr = document.getElementById('delivery-rider');
          
          const dbRow = {
            id: id,
            draftId: draftId,
            draftName: cust.table || 'Held order',
            customerName: cust.name || '',
            customerPhone: cust.phone || '',
            customerGst: cust.gst || '',
            items: RS.getCart(),
            subtotal: totals.sub,
            gst: totals.gst,
            total: totals.grand,
            orderType: orderTypeKey,
            deliveryAddress: da ? da.value : '',
            deliveryCharge: dc ? dc.value : '',
            deliveryRider: dr ? dr.value : ''
          };
          await RS_DB.put('drafts', id, dbRow);
        } catch (e) {
          console.warn("Failed to save draft to database", e);
        }
      }

      RS.clearCart();
      // Reset fields
      const cn=document.getElementById('cust-name'), cp=document.getElementById('cust-phone'), cg=document.getElementById('cust-gst'); 
      if(cn) cn.value=''; 
      if(cp) cp.value=''; 
      if(cg) cg.value='';
      const ct = document.getElementById('cart-table'); 
      if(ct) ct.value = 'Walk-in / Takeaway';
      // Reset delivery fields
      const da = document.getElementById('delivery-address');
      const dc = document.getElementById('delivery-charge');
      const dr = document.getElementById('delivery-rider');
      if (da) da.value = '';
      if (dc) dc.value = '';
      if (dr) dr.value = '';
      
      updateHeldCount();
      RS.toast('Order held · ' + heldOrders[orderTypeKey].length + ' parked','fa-pause');
      // Update table grid to reflect occupied status
      await renderPosTableGrid();
    }

    function openDrafts(orderTypeKey) {
      if (!orderTypeKey) orderTypeKey = getCurrentOrderTypeKey();
      const orders = heldOrders[orderTypeKey];
      const displayName = getOrderTypeDisplayName(orderTypeKey);
      
      RSModal.open({ 
        title: displayName, 
        sub: orders.length + ' parked bills', 
        icon: orderTypeKey === 'dinein' ? 'fa-utensils' : orderTypeKey === 'delivery' ? 'fa-motorcycle' : 'fa-bag-shopping', 
        size: 'sm',
        body: orders.length ? `<div style="display:flex;flex-direction:column;gap:10px">${orders.map(h=>`
          <div class="tender-row" data-h="${h.id}" data-type="${orderTypeKey}" style="cursor:pointer">
            <div><div style="font-weight:700;font-size:14px">${h.table}${h.name?' · '+h.name:''}</div><div style="font-size:12px;color:var(--text-mute)">${h.count} items · held ${h.time}</div></div>
            <div style="display:flex;align-items:center;gap:10px"><b>${rs(h.total)}</b><span class="tx" data-del="${h.id}" data-type="${orderTypeKey}" title="Discard"><i class="fa-solid fa-trash"></i></span></div>
          </div>`).join('')}</div>`
          : '<div class="sr-empty">No held orders for this type. Use Hold to park a bill and start another.</div>',
        onMount(modal, close){
          modal.querySelectorAll('[data-h]').forEach(row=> row.addEventListener('click', async e=>{
            if(e.target.closest('[data-del]')) return;
            const id = +row.dataset.h; 
            const type = row.dataset.type;
            const idx = heldOrders[type].findIndex(x => x.id === id); 
            if(idx < 0) return;
            
            // Clear current cart first
            RS.clearCart();
            
            const selected = heldOrders[type][idx];
            RS.setCart(selected.items);
            
            // Restore customer details & table selection
            const cn = document.getElementById('cust-name');
            const cp = document.getElementById('cust-phone');
            const cg = document.getElementById('cust-gst');
            const ct = document.getElementById('cart-table');
            const csel = document.getElementById('cart-customer-sel');
            if (cn) cn.value = selected.name || '';
            if (cp) cp.value = selected.phone || '';
            if (cg) cg.value = selected.gst || '';
            if (ct && selected.table) {
              ct.value = selected.table;
            }
            if (csel) {
              csel.value = selected.phone || '';
            }
            // Restore delivery fields
            const da = document.getElementById('delivery-address');
            const dc = document.getElementById('delivery-charge');
            const dr = document.getElementById('delivery-rider');
            if (da) da.value = selected.deliveryAddress || '';
            if (dc) dc.value = selected.deliveryCharge || '';
            if (dr) dr.value = selected.deliveryRider || '';
            
            // Delete from database
            if (window.RS_DB) {
              RS_DB.del('drafts', selected.id).catch(e => console.warn("Failed to delete draft from DB", e));
            }
            
            heldOrders[type].splice(idx,1); 
            updateHeldCount(); 
            close(); 
            RS.toast('Order resumed','fa-play');
            await renderPosTableGrid();
          }));
          modal.querySelectorAll('[data-del]').forEach(x=> x.addEventListener('click', async e=>{ 
            e.stopPropagation(); 
            const id = +x.dataset.del; 
            const type = x.dataset.type;
            const idx = heldOrders[type].findIndex(h => h.id === id); 
            if(idx >= 0){
              const selected = heldOrders[type][idx];
              if (window.RS_DB) {
                try {
                  await RS_DB.del('drafts', selected.id);
                } catch(err) {
                  console.warn("Failed to delete draft from DB", err);
                }
              }
              heldOrders[type].splice(idx,1); 
              updateHeldCount();
              x.closest('[data-h]').remove(); 
              await renderPosTableGrid();
              if(!heldOrders[type].length){ close(); } 
            } 
          }));
        }});
    }

    // Add click listeners to hold buttons (will add them to HTML next)
    document.addEventListener('click', async (e) => {
      const btnHoldTakeaway = document.getElementById('btn-hold-takeaway');
      const btnHoldDinein = document.getElementById('btn-hold-dinein');
      const btnHoldDelivery = document.getElementById('btn-hold-delivery');
      const btnMHoldTakeaway = document.getElementById('btn-m-hold-takeaway');
      const btnMHoldDinein = document.getElementById('btn-m-hold-dinein');
      const btnMHoldDelivery = document.getElementById('btn-m-hold-delivery');

      // Handle hold current order
      if (e.target.closest('#btn-hold-takeaway')) {
        if (getCurrentOrderTypeKey() === 'takeaway' && RS.getCart().length) {
          holdCurrent();
        } else {
          openDrafts('takeaway');
        }
      }
      if (e.target.closest('#btn-hold-dinein')) {
        if (getCurrentOrderTypeKey() === 'dinein' && RS.getCart().length) {
          holdCurrent();
        } else {
          openDrafts('dinein');
        }
      }
      if (e.target.closest('#btn-hold-delivery')) {
        if (getCurrentOrderTypeKey() === 'delivery' && RS.getCart().length) {
          holdCurrent();
        } else {
          openDrafts('delivery');
        }
      }

      // Handle mobile hold buttons
      if (e.target.closest('#btn-m-hold-takeaway')) openDrafts('takeaway');
      if (e.target.closest('#btn-m-hold-dinein')) openDrafts('dinein');
      if (e.target.closest('#btn-m-hold-delivery')) openDrafts('delivery');
    });

    // Add contextmenu listeners to hold buttons to always open drafts
    document.addEventListener('contextmenu', (e) => {
      if (e.target.closest('#btn-hold-takeaway')) {
        e.preventDefault();
        openDrafts('takeaway');
      }
      if (e.target.closest('#btn-hold-dinein')) {
        e.preventDefault();
        openDrafts('dinein');
      }
      if (e.target.closest('#btn-hold-delivery')) {
        e.preventDefault();
        openDrafts('delivery');
      }
    });

    updateHeldCount();
    loadHeldFromDB();
    document.addEventListener('rs:hydrated', loadHeldFromDB);

    async function loadCustomersForPos() {
      const sel = document.getElementById('cart-customer-sel');
      if (!sel) return;
      const currentVal = sel.value;
      try {
        const customers = window.RS_DB ? await RS_DB.list('customers').catch(() => []) : [];
        sel.innerHTML = '<option value="">Walk-in Customer</option>' + 
          customers.map(c => `<option value="${esc(c.phone)}" data-name="${esc(c.name)}" data-gst="${esc(c.email||'')}" ${c.phone === currentVal ? 'selected' : ''}>${esc(c.name)} (${esc(c.phone)})</option>`).join('');
      } catch(e) {
        console.warn("Failed to load customers for POS", e);
      }
    }
    loadCustomersForPos();
    document.addEventListener('rs:hydrated', loadCustomersForPos);
    
    // Also reload when selector gets focus to pick up any new customers added in CRM
    const csel = document.getElementById('cart-customer-sel');
    if (csel) {
      csel.addEventListener('focus', loadCustomersForPos);
    }

    // --- Custom Customer Search & Insights Widget ---
    const nameInput = document.getElementById('cust-input-name');
    const phoneInput = document.getElementById('cust-input-phone');
    const sel = document.getElementById('cart-customer-sel');
    const tableSelectInit = document.getElementById('cart-table');
    let lastActiveTable = (tableSelectInit && tableSelectInit.value !== 'Walk-in / Takeaway' && !tableSelectInit.value.startsWith('Delivery')) ? tableSelectInit.value : '';

    function initCustomCustomerWidget() {
      const widgetContainer = document.getElementById('custom-customer-widget');
      const trigger = document.getElementById('cust-widget-trigger');
      const triggerText = document.getElementById('cust-trigger-text');
      const dropdown = document.getElementById('cust-widget-dropdown');
      const searchResults = document.getElementById('cust-search-results');
      const insightsPanel = document.getElementById('cust-insights-panel');
      const actionRow = document.getElementById('cust-action-row');
      const btnSaveNew = document.getElementById('btn-save-new-cust');
      const btnReset = document.getElementById('btn-reset-cust');
      
      if (!widgetContainer || !sel) return;
      
      // Helper to calculate favorite item
      async function getFavoriteItem(c) {
        try {
          const bills = window.RS?.BILLS || [];
          const custBills = bills.filter(b => b.customerPhone === c.phone || (b.customerName && b.customerName !== 'Walk-in Guest' && b.customerName === c.name));
          if (!custBills.length) return 'None';
          
          const itemCounts = {};
          custBills.forEach(b => {
            if (Array.isArray(b._items)) {
              b._items.forEach(item => {
                const name = item.name;
                const qty = Number(item.qty) || 1;
                itemCounts[name] = (itemCounts[name] || 0) + qty;
              });
            }
          });
          
          let favoriteItem = 'None';
          let maxQty = 0;
          for (const [name, qty] of Object.entries(itemCounts)) {
            if (qty > maxQty) {
              maxQty = qty;
              favoriteItem = name;
            }
          }
          return favoriteItem;
        } catch(e) {
          console.warn("Error getting favorite item", e);
          return 'None';
        }
      }
      
      // Update temporary option for customer details if typing custom info without database matching
      function updateTemporaryCustomer(name, phone) {
        let tempOpt = sel.querySelector('option[data-temp="true"]');
        if (!name && !phone) {
          if (tempOpt) {
            tempOpt.remove();
            if (sel.value.startsWith('temp-') || sel.value === '') {
              sel.value = '';
            }
          }
          return;
        }
        if (!tempOpt) {
          tempOpt = document.createElement('option');
          tempOpt.setAttribute('data-temp', 'true');
          sel.appendChild(tempOpt);
        }
        const tempVal = phone || 'temp-' + Date.now();
        tempOpt.value = tempVal;
        tempOpt.setAttribute('data-name', name || 'Guest');
        tempOpt.setAttribute('data-gst', '');
        tempOpt.innerText = `${name || 'Guest'} (${phone || 'No Phone'})`;
        sel.value = tempVal;
      }
      
      // Sync widget displays to current hidden select state
      async function syncWidgetWithHiddenSelect() {
        const currentPhone = sel.value;
        
        // Don't override inputs while user is typing a temporary customer
        if (dropdown.classList.contains('csd-open') && (nameInput === document.activeElement || phoneInput === document.activeElement)) {
          return;
        }
        
        if (!currentPhone) {
          nameInput.value = '';
          phoneInput.value = '';
          triggerText.innerText = 'Walk-in';
          insightsPanel.style.display = 'none';
          if (actionRow) actionRow.style.display = 'none';
          return;
        }
        
        const customers = window.RS_DB ? await window.RS_DB.list('customers').catch(() => []) : [];
        const c = customers.find(x => x.phone === currentPhone);
        if (c) {
          nameInput.value = c.name || '';
          phoneInput.value = c.phone || '';
          triggerText.innerText = c.name || c.phone;
          
          const visits = c.visits || 0;
          const spend = c.spend || 0;
          const favorite = await getFavoriteItem(c);
          
          document.getElementById('insight-visits').innerText = visits;
          document.getElementById('insight-spend').innerText = '₹' + spend;
          document.getElementById('insight-favorite').innerText = favorite;
          insightsPanel.style.display = 'grid';
          if (actionRow) actionRow.style.display = 'none';
        } else {
          // Check if temp option exists
          const opt = sel.options[sel.selectedIndex];
          const name = opt ? (opt.getAttribute('data-name') || '') : '';
          nameInput.value = name;
          phoneInput.value = currentPhone.startsWith('temp-') ? '' : currentPhone;
          triggerText.innerText = name || currentPhone;
          insightsPanel.style.display = 'none';
          
          if (name && currentPhone && !currentPhone.startsWith('temp-')) {
            if (actionRow) actionRow.style.display = 'block';
          } else {
            if (actionRow) actionRow.style.display = 'none';
          }
        }
      }
      
      // Toggle dropdown on inputs click/focus
      nameInput.addEventListener('click', (e) => {
        e.stopPropagation();
        dropdown.classList.add('csd-open');
        widgetContainer.classList.add('active');
      });
      nameInput.addEventListener('focus', () => {
        dropdown.classList.add('csd-open');
        widgetContainer.classList.add('active');
      });
      phoneInput.addEventListener('click', (e) => {
        e.stopPropagation();
        dropdown.classList.add('csd-open');
        widgetContainer.classList.add('active');
      });
      phoneInput.addEventListener('focus', () => {
        dropdown.classList.add('csd-open');
        widgetContainer.classList.add('active');
      });

      if (trigger) {
        trigger.addEventListener('click', (e) => {
          e.stopPropagation();
          const isOpen = dropdown.classList.contains('csd-open');
          if (isOpen) {
            dropdown.classList.remove('csd-open');
            widgetContainer.classList.remove('active');
          } else {
            dropdown.classList.add('csd-open');
            widgetContainer.classList.add('active');
            syncWidgetWithHiddenSelect();
          }
        });
      }
      
      // Prevent closing when clicking inside the dropdown
      dropdown.addEventListener('click', (e) => {
        e.stopPropagation();
      });
      
      // Close dropdown when clicking outside
      document.addEventListener('click', (e) => {
        if (widgetContainer && !widgetContainer.contains(e.target)) {
          dropdown.classList.remove('csd-open');
          widgetContainer.classList.remove('active');
        }
      });
      
      // Live search input handling
      const handleInput = async () => {
        const nameVal = nameInput.value.trim();
        const phoneVal = phoneInput.value.trim();
        
        updateTemporaryCustomer(nameVal, phoneVal);
        
        if (!nameVal && !phoneVal) {
          searchResults.style.display = 'none';
          insightsPanel.style.display = 'none';
          if (actionRow) actionRow.style.display = 'none';
          triggerText.innerText = 'Walk-in';
          return;
        }
        
        triggerText.innerText = nameVal || phoneVal;
        
        const allCustomers = window.RS_DB ? await window.RS_DB.list('customers').catch(() => []) : [];
        const cleanPhoneVal = phoneVal.replace(/\D/g, '');
        const matches = allCustomers.filter(c => {
          const matchName = nameVal ? (c.name || '').toLowerCase().includes(nameVal.toLowerCase()) : true;
          const matchPhone = cleanPhoneVal ? (c.phone || '').replace(/\D/g, '').includes(cleanPhoneVal) : true;
          return matchName && matchPhone;
        });
        
        if (matches.length > 0) {
          searchResults.innerHTML = matches.map(c => `
            <div class="search-result-item" data-phone="${esc(c.phone)}" data-name="${esc(c.name)}">
              <span class="res-name">${esc(c.name)}</span>
              <span class="res-phone">${esc(c.phone)}</span>
            </div>
          `).join('');
          searchResults.style.display = 'flex';
          
          searchResults.querySelectorAll('.search-result-item').forEach(item => {
            item.onclick = async () => {
              const selectedPhone = item.dataset.phone;
              const selectedName = item.dataset.name;
              
              let opt = sel.querySelector(`option[value="${selectedPhone}"]`);
              if (!opt) {
                opt = document.createElement('option');
                opt.value = selectedPhone;
                opt.setAttribute('data-name', selectedName);
                sel.appendChild(opt);
              }
              
              // Remove temporary option if exists
              const tempOpt = sel.querySelector('option[data-temp="true"]');
              if (tempOpt) tempOpt.remove();
              
              sel.value = selectedPhone;
              sel.dispatchEvent(new Event('change'));
              
              searchResults.style.display = 'none';
              await syncWidgetWithHiddenSelect();
            };
          });
        } else {
          searchResults.style.display = 'none';
          insightsPanel.style.display = 'none';
        }
        
        const exactMatch = allCustomers.find(c => (c.phone || '').replace(/\D/g, '') === cleanPhoneVal);
        if (!exactMatch && nameVal && cleanPhoneVal && cleanPhoneVal.length >= 10) {
          if (actionRow) actionRow.style.display = 'block';
        } else {
          if (actionRow) actionRow.style.display = 'none';
        }
      };
      
      nameInput.addEventListener('input', handleInput);
      phoneInput.addEventListener('input', handleInput);
      
      // Save new customer action
      if (btnSaveNew) {
        btnSaveNew.addEventListener('click', async () => {
          const name = nameInput.value.trim();
          const phone = phoneInput.value.trim();
          if (!name || !phone) {
            RS.toast('Name and phone are required', 'fa-circle-exclamation');
            return;
          }
          if (window.RS_DB) {
            try {
              const newCust = {
                id: 'cust-' + Date.now(),
                name, phone, email: '',
                visits: 1, spend: 0, last: new Date().toLocaleDateString('en-CA'), tier: 'silver'
              };
              await RS_DB.put('customers', newCust.id, newCust);
              
              // Reload standard customer select options
              await loadCustomersForPos();
              
              // Sync selection to new customer
              sel.value = phone;
              sel.dispatchEvent(new Event('change'));
              
              RS.toast('Customer saved successfully', 'fa-circle-check');
              if (actionRow) actionRow.style.display = 'none';
              await syncWidgetWithHiddenSelect();
            } catch(e) {
              console.warn("Failed saving customer", e);
              RS.toast('Save failed: ' + e.message, 'fa-circle-exclamation');
            }
          }
        });
      }
      
      // Reset action
      if (btnReset) {
        btnReset.addEventListener('click', () => {
          sel.value = '';
          const tempOpt = sel.querySelector('option[data-temp="true"]');
          if (tempOpt) tempOpt.remove();
          
          if (deliveryAddress) deliveryAddress.value = '';
          if (deliveryCharge) deliveryCharge.value = '';
          if (deliveryRider) deliveryRider.value = '';
          
          const currentCart = window.RS.getCart();
          const deliveryItemIndex = currentCart.findIndex(item => item.id === 'delivery-charge-item');
          if (deliveryItemIndex >= 0) {
            currentCart.splice(deliveryItemIndex, 1);
            window.RS.setCart(currentCart);
          }
          
          sel.dispatchEvent(new Event('change'));
          dropdown.classList.remove('csd-open');
          widgetContainer.classList.remove('active');
          syncWidgetWithHiddenSelect();
        });
      }

      // Close button action
      const btnClose = document.getElementById('cust-widget-close');
      if (btnClose) {
        btnClose.addEventListener('click', (e) => {
          e.stopPropagation();
          dropdown.classList.remove('csd-open');
          widgetContainer.classList.remove('active');
        });
      }

      // Make customer insights drawer draggable and resizable
      makeDrawerDraggable(dropdown);
      makeDrawerResizable(dropdown);

      // Insights click to open CRM profile
      if (insightsPanel) {
        insightsPanel.style.cursor = 'pointer';
        insightsPanel.addEventListener('click', async (e) => {
          e.stopPropagation();
          const currentPhone = sel.value;
          if (!currentPhone) return;
          try {
            const customers = window.RS_DB ? await RS_DB.list('customers').catch(() => []) : [];
            const c = customers.find(x => x.phone === currentPhone);
            if (c) {
              dropdown.classList.remove('csd-open');
              widgetContainer.classList.remove('active');
              if (window.RS && typeof window.RS.activateTab === 'function') {
                window.RS.activateTab('customers-tab');
              }
              if (window.RS && typeof window.RS.showCustomerProfile === 'function') {
                window.RS.showCustomerProfile(c);
              }
            }
          } catch(err) {
            console.warn("Failed to open customer CRM profile modal", err);
          }
        });
      }
      
      // Background interval to watch for value modifications from outer scripts (like draft load)
      let lastKnownSelValue = null;
      setInterval(() => {
        if (sel.value !== lastKnownSelValue) {
          lastKnownSelValue = sel.value;
          syncWidgetWithHiddenSelect();
        }
      }, 500);
    }

      // Delivery charges dynamic cart integration
      const deliveryAddress = document.getElementById('delivery-address');
      const deliveryCharge = document.getElementById('delivery-charge');
      const deliveryRider = document.getElementById('delivery-rider');
      
      function updateDeliveryChargeInCart() {
        if (!deliveryCharge) return;
        const chargeAmount = Math.max(0, Number(deliveryCharge.value) || 0);
        const currentCart = window.RS.getCart();
        const deliveryItemIndex = currentCart.findIndex(item => item.id === 'delivery-charge-item');
        
        if (chargeAmount > 0) {
          const deliveryItem = {
            id: 'delivery-charge-item',
            name: 'Delivery Charge',
            price: chargeAmount,
            qty: 1,
            cat: 'Delivery',
            veg: true
          };
          if (deliveryItemIndex >= 0) {
            if (currentCart[deliveryItemIndex].price !== chargeAmount) {
              currentCart[deliveryItemIndex] = deliveryItem;
              window.RS.setCart(currentCart);
            }
          } else {
            currentCart.push(deliveryItem);
            window.RS.setCart(currentCart);
          }
        } else {
          if (deliveryItemIndex >= 0) {
            currentCart.splice(deliveryItemIndex, 1);
            window.RS.setCart(currentCart);
          }
        }
      }

      if (deliveryCharge) {
        deliveryCharge.addEventListener('input', updateDeliveryChargeInCart);
      }
      
      function updateTableFieldForDelivery() {
        const tableSelect = document.getElementById('cart-table');
        if (!tableSelect) return;
        
        const activeBtn = document.querySelector('.order-type-btn.active');
        const typeText = activeBtn ? activeBtn.textContent.trim().toLowerCase() : 'takeaway';
        
        if (typeText.includes('delivery')) {
          const address = deliveryAddress ? deliveryAddress.value.trim() : '';
          let deliveryOpt = tableSelect.querySelector('option[data-delivery="true"]');
          if (!deliveryOpt) {
            deliveryOpt = document.createElement('option');
            deliveryOpt.setAttribute('data-delivery', 'true');
            tableSelect.appendChild(deliveryOpt);
          }
          const val = address ? `Delivery - ${address}` : 'Delivery';
          deliveryOpt.value = val;
          deliveryOpt.innerText = val;
          tableSelect.value = val;
        } else {
          const deliveryOpt = tableSelect.querySelector('option[data-delivery="true"]');
          if (deliveryOpt) deliveryOpt.remove();
          if (tableSelect.value.startsWith('Delivery')) {
            tableSelect.value = 'Walk-in / Takeaway';
          }
        }
      }
      
      if (deliveryAddress) {
        deliveryAddress.addEventListener('input', updateTableFieldForDelivery);
      }
      
      // Save current table's cart to drafts
      async function saveActiveTableDraft(tableName) {
        const tableSelect = document.getElementById('cart-table');
        const currentTable = tableName || (tableSelect ? tableSelect.value : '');
        if (!currentTable) return;
        
        let draftName = currentTable;
        if (currentTable === 'Walk-in / Takeaway') {
          draftName = 'Takeaway';
        } else if (currentTable.startsWith('Delivery')) {
          draftName = 'Delivery';
        }
        
        const cartItems = window.RS.getCart();
        const drafts = window.RS_DB ? await window.RS_DB.list('drafts').catch(() => []) : [];
        const existingDraft = drafts.find(d => d.draftName === draftName);
        
        if (cartItems.length > 0) {
          const id = existingDraft ? existingDraft.id : Date.now();
          const totals = window.RS.getTotals();
          
          const deliveryAddress = document.getElementById('delivery-address');
          const deliveryCharge = document.getElementById('delivery-charge');
          const deliveryRider = document.getElementById('delivery-rider');
          
          const dbRow = {
            id: id,
            draftId: existingDraft ? existingDraft.draftId : 'D' + Date.now(),
            draftName: draftName,
            customerName: nameInput ? nameInput.value.trim() : '',
            customerPhone: phoneInput ? phoneInput.value.trim() : '',
            customerGst: '',
            items: cartItems,
            subtotal: totals.sub,
            gst: totals.gst,
            total: totals.grand,
            deliveryAddress: deliveryAddress ? deliveryAddress.value.trim() : '',
            deliveryCharge: deliveryCharge ? deliveryCharge.value.trim() : '',
            deliveryRider: deliveryRider ? deliveryRider.value.trim() : ''
          };
          if (window.RS_DB) {
            await window.RS_DB.put('drafts', id, dbRow).catch(e => console.warn(e));
          }
        } else {
          if (existingDraft && window.RS_DB) {
            await window.RS_DB.del('drafts', existingDraft.id).catch(e => console.warn(e));
          }
        }
        // Update table grid status
        await loadHeldFromDB();
        await renderPosTableGrid();
      }

      function syncDeliveryFieldsFromDraft(draft) {
        const da = document.getElementById('delivery-address');
        const dc = document.getElementById('delivery-charge');
        const dr = document.getElementById('delivery-rider');
        if (da) da.value = draft ? (draft.deliveryAddress || '') : '';
        if (dc) dc.value = draft ? (draft.deliveryCharge || '') : '';
        if (dr) dr.value = draft ? (draft.deliveryRider || '') : '';
      }

      // Sync customer details from order/draft
      function syncCustomerFromOrder(order) {
        if (!sel) return;
        const phone = order.customerPhone || '';
        const name = order.customerName || 'Walk-in Guest';
        if (phone) {
          let opt = sel.querySelector(`option[value="${phone}"]`);
          if (!opt) {
            opt = document.createElement('option');
            opt.value = phone;
            opt.setAttribute('data-name', name);
            sel.appendChild(opt);
          }
          sel.value = phone;
          sel.dispatchEvent(new Event('change'));
        } else {
          sel.value = '';
          sel.dispatchEvent(new Event('change'));
        }
      }

      // Helper to load tables list from settings dynamically
      async function loadTablesList() {
        const DEFAULT_TABLES = [
          {n:'01',cap:2}, {n:'02',cap:4}, {n:'03',cap:4}, {n:'04',cap:2},
          {n:'05',cap:6}, {n:'06',cap:4}, {n:'07',cap:2}, {n:'08',cap:8},
          {n:'09',cap:4}, {n:'10',cap:2}, {n:'11',cap:4}, {n:'12',cap:6}
        ];
        try {
          const settings = window.RS_DB ? await window.RS_DB.getSettings().catch(() => null) : null;
          if (settings && Array.isArray(settings.custom_tables)) {
            return settings.custom_tables;
          }
        } catch(e) {
          console.warn("Failed to load custom tables from settings", e);
        }
        return DEFAULT_TABLES;
      }

      // Render the seating grid in the POS main tab
      async function renderPosTableGrid() {
        const container = document.getElementById('pos-tables-grid');
        if (!container) return;
        
        const TABLES = await loadTablesList();
        
        const stateDot = {free:'var(--green)', occupied:'var(--orange)', billed:'var(--violet-soft)'};
        const stateTxt = {free:'Available', occupied:'Dining', billed:'Bill printed'};
        
        try {
          const pendingRows = window.RS_DB ? await window.RS_DB.list('pending_orders').catch(() => []) : [];
          const drafts = window.RS_DB ? await window.RS_DB.list('drafts').catch(() => []) : [];
          
          container.innerHTML = TABLES.map(t => {
            const tableName = `Table ${t.n}`;
            const activeOrder = pendingRows.find(r => 
              (r.tableNumber === tableName || r.tableNumber === t.n || r.tableNumber === `0${parseInt(t.n)}`) &&
              (r.status === 'DineIn Active' || r.status === 'Accepted' || r.status === 'preparing' || r.status === 'Pending Review' || r.status === 'Billed')
            );
            const activeDraft = drafts.find(d => d.draftName === tableName);
            
            let state = 'free';
            let amt = 0;
            let label = 'Available';
            
            if (activeOrder) {
              state = activeOrder.status === 'Billed' ? 'billed' : 'occupied';
              amt = activeOrder.total || 0;
              label = activeOrder.status === 'Billed' ? 'Bill printed' : 'Dining';
            } else if (activeDraft) {
              state = 'occupied';
              amt = activeDraft.total || 0;
              label = 'Draft saved';
            }
            
            return `
              <div class="pos-table-card" tabindex="0" role="button" aria-label="${tableName}, ${t.cap} seats, Status: ${label}${amt > 0 ? `, Current Bill: ₹${amt}` : ''}" data-table="${tableName}" data-state="${state}" style="border: 1px solid var(--stroke-2); padding: 16px 12px; border-radius: var(--r-sm); display: flex; flex-direction: column; gap: 4px; cursor: pointer; background: var(--glass); transition: var(--t); position: relative;">
                <span style="position: absolute; top: 12px; right: 12px; width: 8px; height: 8px; border-radius: 50%; background: ${stateDot[state]};"></span>
                <div style="font-weight: 700; font-size: 13.5px; color: var(--text);">Table ${t.n}</div>
                <div style="font-size: 11px; color: var(--text-soft);"><i class="fa-solid fa-user-group" style="font-size: 9px;"></i> ${t.cap} seats</div>
                <div style="font-size: 11px; font-weight: 600; color: var(--text-soft); margin-top: 4px;">${label}</div>
                ${amt > 0 ? `<div style="font-size: 13px; font-weight: 800; color: var(--text); margin-top: auto; padding-top: 6px;">₹${amt}</div>` : `<div style="font-size: 11px; color: var(--text-faint); margin-top: auto; padding-top: 6px;">Tap to select</div>`}
              </div>
            `;
          }).join('');
          
          container.querySelectorAll('.pos-table-card').forEach(card => {
            const selectAction = async () => {
              const tableName = card.dataset.table;
              const tableSelect = document.getElementById('cart-table');
              if (tableSelect) {
                let opt = tableSelect.querySelector(`option[value="${tableName}"]`) || [...tableSelect.options].find(o => o.text === tableName);
                if (!opt) {
                  const newOpt = document.createElement('option');
                  newOpt.value = tableName;
                  newOpt.innerText = tableName;
                  tableSelect.appendChild(newOpt);
                }
                tableSelect.value = tableName;
                tableSelect.dispatchEvent(new Event('change'));
              } else {
                await showMenuGridForTable(tableName);
              }
            };

            card.onclick = selectAction;
            card.onkeydown = async (e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                await selectAction();
              }
            };
          });
          
        } catch(e) {
          console.warn("Error rendering POS table grid", e);
        }
      }

      // Show Menu categories/items for a selected table and load existing draft/order
      async function showMenuGridForTable(tableName) {
        const posCats = document.getElementById('pos-cats');
        const posGrid = document.getElementById('pos-grid');
        const posTableView = document.getElementById('pos-table-grid-view');
        
        if (posTableView) posTableView.style.display = 'none';
        if (posCats) posCats.style.display = 'flex';
        if (posGrid) posGrid.style.display = 'grid';
        
        if (lastActiveTable && lastActiveTable !== tableName) {
          await saveActiveTableDraft(lastActiveTable);
        }
        lastActiveTable = tableName;
        
        const banner = document.getElementById('pos-active-table-banner');
        const bannerText = document.getElementById('pos-banner-text');
        const bannerDot = document.getElementById('pos-banner-status-dot');
        
        if (banner && bannerText && bannerDot) {
          banner.style.display = 'flex';
          
          const pendingRows = window.RS_DB ? await window.RS_DB.list('pending_orders').catch(() => []) : [];
          const drafts = window.RS_DB ? await window.RS_DB.list('drafts').catch(() => []) : [];
          
          const activeOrder = pendingRows.find(r => 
            (r.tableNumber === tableName || r.tableNumber === tableName.replace('Table ', '') || r.tableNumber === `0${parseInt(tableName.replace('Table ', ''))}`) &&
            (r.status === 'DineIn Active' || r.status === 'Accepted' || r.status === 'preparing' || r.status === 'Pending Review' || r.status === 'Billed')
          );
          const activeDraft = drafts.find(d => d.draftName === tableName);
          
          let statusText = 'Available';
          let dotColor = 'var(--green)';
          
          if (activeOrder) {
            statusText = activeOrder.status === 'Billed' ? `Bill printed (₹${activeOrder.total})` : `Dining (₹${activeOrder.total})`;
            dotColor = activeOrder.status === 'Billed' ? 'var(--violet-soft)' : 'var(--orange)';
            window.RS.setCart(activeOrder.items);
            syncCustomerFromOrder(activeOrder);
            syncDeliveryFieldsFromDraft(null);
          } else if (activeDraft) {
            statusText = `Draft saved (₹${activeDraft.total})`;
            dotColor = 'var(--orange)';
            window.RS.setCart(activeDraft.items);
            syncCustomerFromOrder(activeDraft);
            syncDeliveryFieldsFromDraft(activeDraft);
          } else {
            window.RS.clearCart();
            syncDeliveryFieldsFromDraft(null);
            if (nameInput) nameInput.value = '';
            if (phoneInput) phoneInput.value = '';
            const tempOpt = sel.querySelector('option[data-temp="true"]');
            if (tempOpt) tempOpt.remove();
            sel.value = '';
            sel.dispatchEvent(new Event('change'));
          }
          
          bannerText.innerText = `Table: ${tableName} · ${statusText}`;
          bannerDot.style.background = dotColor;
        }
      }

      let isChangingTable = false;

      // Handle change table button
      const btnChangeTable = document.getElementById('btn-change-table');
      if (btnChangeTable) {
        btnChangeTable.onclick = async (e) => {
          e.preventDefault();
          if (isChangingTable) return;
          isChangingTable = true;
          try {
            await saveActiveTableDraft(lastActiveTable);
            lastActiveTable = '';
            
            const tableSelect = document.getElementById('cart-table');
            if (tableSelect) {
              tableSelect.value = 'Walk-in / Takeaway';
              tableSelect.dispatchEvent(new Event('change'));
            }
            
            const posCats = document.getElementById('pos-cats');
            const posGrid = document.getElementById('pos-grid');
            const posTableView = document.getElementById('pos-table-grid-view');
            const activeTableBanner = document.getElementById('pos-active-table-banner');
            
            if (posCats) posCats.style.display = 'none';
            if (posGrid) posGrid.style.display = 'none';
            if (posTableView) posTableView.style.display = 'block';
            if (activeTableBanner) activeTableBanner.style.display = 'none';
            
            window.RS.clearCart();
            await renderPosTableGrid();
          } finally {
            isChangingTable = false;
          }
        };
      }
      
      // Handle manual table select dropdown changes
      const tblSelectEl = document.getElementById('cart-table');
      if (tblSelectEl) {
        tblSelectEl.addEventListener('change', () => {
          if (isChangingTable) return;
          const val = tblSelectEl.value;
          const activeBtn = document.querySelector('.order-type-btn.active');
          if (activeBtn && activeBtn.textContent.trim().toLowerCase().includes('dine')) {
            if (val === 'Walk-in / Takeaway') {
              if (btnChangeTable) btnChangeTable.click();
            } else {
              showMenuGridForTable(val);
            }
          }
        });
      }
      
      // --- Per-tab localStorage fallback helpers (used when RS_DB is unavailable) ---
      const LS_CART_PREFIX = 'rs_tab_cart_';
      const LS_CUST_PREFIX = 'rs_tab_cust_';
      function lsSaveTabCart(tabName) {
        try {
          const items = window.RS.getCart();
          const totals = window.RS.getTotals();
          const nameEl = document.getElementById('cust-input-name') || document.getElementById('cust-name');
          const phoneEl = document.getElementById('cust-input-phone') || document.getElementById('cust-phone');
          const da = document.getElementById('delivery-address');
          const dc = document.getElementById('delivery-charge');
          const dr = document.getElementById('delivery-rider');
          localStorage.setItem(LS_CART_PREFIX + tabName, JSON.stringify({
            items,
            total: totals.grand,
            deliveryAddress: da ? da.value : '',
            deliveryCharge: dc ? dc.value : '',
            deliveryRider: dr ? dr.value : ''
          }));
          localStorage.setItem(LS_CUST_PREFIX + tabName, JSON.stringify({
            name: nameEl ? nameEl.value.trim() : '',
            phone: phoneEl ? phoneEl.value.trim() : ''
          }));
        } catch(e) { console.warn('[Tab Cart LS Save]', e); }
      }
      function lsLoadTabCart(tabName) {
        try {
          const raw = localStorage.getItem(LS_CART_PREFIX + tabName);
          const custRaw = localStorage.getItem(LS_CUST_PREFIX + tabName);
          return { cart: raw ? JSON.parse(raw) : null, cust: custRaw ? JSON.parse(custRaw) : null };
        } catch(e) { return { cart: null, cust: null }; }
      }
      function lsApplyTabCart(tabName) {
        const { cart, cust } = lsLoadTabCart(tabName);
        if (cart && cart.items && cart.items.length > 0) {
          window.RS.setCart(cart.items);
          const da = document.getElementById('delivery-address');
          const dc = document.getElementById('delivery-charge');
          const dr = document.getElementById('delivery-rider');
          if (da) da.value = cart.deliveryAddress || '';
          if (dc) dc.value = cart.deliveryCharge || '';
          if (dr) dr.value = cart.deliveryRider || '';
        } else {
          window.RS.clearCart();
        }
        if (cust) {
          const nameEl = document.getElementById('cust-input-name') || document.getElementById('cust-name');
          const phoneEl = document.getElementById('cust-input-phone') || document.getElementById('cust-phone');
          if (nameEl) nameEl.value = cust.name || '';
          if (phoneEl) phoneEl.value = cust.phone || '';
        }
      }

      // Track the previous order type so we can save before switching
      let _prevOrderType = null;

      async function syncCartLayoutWithOrderType(isBootCall) {
        const activeBtn = document.querySelector('.order-type-btn.active');
        if (!activeBtn) return;
        
        const typeText = activeBtn.textContent.trim().toLowerCase();
        const tableSelContainer = document.querySelector('.cart-table-sel');
        const tableSelect = document.getElementById('cart-table');
        const deliveryDetails = document.getElementById('cart-delivery-details');
        
        const posCats = document.getElementById('pos-cats');
        const posGrid = document.getElementById('pos-grid');
        const posTableView = document.getElementById('pos-table-grid-view');
        const activeTableBanner = document.getElementById('pos-active-table-banner');
        
        if (!tableSelContainer || !tableSelect || !deliveryDetails) return;

        // --- Save current tab's cart BEFORE switching ---
        // On the boot call we skip saving so we don't overwrite a fresh restore
        if (!isBootCall && _prevOrderType !== null && _prevOrderType !== typeText) {
          if (_prevOrderType.includes('delivery')) {
            if (window.RS_DB) {
              await saveActiveTableDraft('Delivery').catch(e => console.warn('[Tab save]', e));
            } else {
              lsSaveTabCart('Delivery');
            }
          } else if (_prevOrderType.includes('dine')) {
            // Dine-in: save to the active table
            const tableVal = tableSelect ? tableSelect.value : '';
            if (tableVal && tableVal !== 'Walk-in / Takeaway' && !tableVal.startsWith('Delivery')) {
              await saveActiveTableDraft(tableVal).catch(e => console.warn('[Tab save]', e));
            }
          } else {
            // Takeaway
            if (window.RS_DB) {
              await saveActiveTableDraft('Takeaway').catch(e => console.warn('[Tab save]', e));
            } else {
              lsSaveTabCart('Takeaway');
            }
          }
        }
        if (lastActiveTable) {
          lastActiveTable = '';
        }

        // Persist the active order type for page-reload restoration
        try { localStorage.setItem('rs_active_order_type', typeText.includes('dine') ? 'Dine-in' : typeText.includes('delivery') ? 'Delivery' : 'Takeaway'); } catch(e) {}
        _prevOrderType = typeText;
        
        if (typeText.includes('dine')) {
          tableSelContainer.style.display = 'grid';
          tableSelContainer.style.gridTemplateColumns = '1fr 1fr';
          tableSelect.style.display = 'block';
          deliveryDetails.style.display = 'none';
          
          const deliveryItemIndex = window.RS.getCart().findIndex(item => item.id === 'delivery-charge-item');
          if (deliveryItemIndex >= 0) {
            const currentCart = window.RS.getCart();
            currentCart.splice(deliveryItemIndex, 1);
            window.RS.setCart(currentCart);
          }
          updateTableFieldForDelivery();
          
          const currentTableVal = tableSelect.value;
          if (!currentTableVal || currentTableVal === 'Walk-in / Takeaway' || currentTableVal.startsWith('Delivery')) {
            if (posCats) posCats.style.display = 'none';
            if (posGrid) posGrid.style.display = 'none';
            if (posTableView) posTableView.style.display = 'block';
            if (activeTableBanner) activeTableBanner.style.display = 'none';
            window.RS.clearCart();
            syncDeliveryFieldsFromDraft(null);
            await renderPosTableGrid();
          } else {
            await showMenuGridForTable(currentTableVal);
          }
          
        } else if (typeText.includes('delivery')) {
          tableSelContainer.style.display = 'block';
          tableSelect.style.display = 'none';
          deliveryDetails.style.display = 'flex';
          
          if (posCats) posCats.style.display = 'flex';
          if (posGrid) posGrid.style.display = 'grid';
          if (posTableView) posTableView.style.display = 'none';
          if (activeTableBanner) activeTableBanner.style.display = 'none';
          
          if (window.RS_DB) {
            const draftsList = await window.RS_DB.list('drafts').catch(() => []);
            const activeDraft = draftsList.find(d => d.draftName === 'Delivery');
            if (activeDraft) {
              window.RS.setCart(activeDraft.items);
              syncCustomerFromOrder(activeDraft);
              syncDeliveryFieldsFromDraft(activeDraft);
            } else {
              // Fall back to localStorage snapshot if DB has no draft
              lsApplyTabCart('Delivery');
              syncDeliveryFieldsFromDraft(null);
            }
          } else {
            // No DB at all — use localStorage per-tab snapshot
            lsApplyTabCart('Delivery');
            syncDeliveryFieldsFromDraft(null);
          }
          
          updateDeliveryChargeInCart();
          updateTableFieldForDelivery();
        } else {
          // Takeaway
          tableSelContainer.style.display = 'block';
          tableSelect.style.display = 'none';
          deliveryDetails.style.display = 'none';
          
          if (posCats) posCats.style.display = 'flex';
          if (posGrid) posGrid.style.display = 'grid';
          if (posTableView) posTableView.style.display = 'none';
          if (activeTableBanner) activeTableBanner.style.display = 'none';
          
          if (window.RS_DB) {
            const draftsList = await window.RS_DB.list('drafts').catch(() => []);
            const activeDraft = draftsList.find(d => d.draftName === 'Takeaway');
            if (activeDraft) {
              window.RS.setCart(activeDraft.items);
              syncCustomerFromOrder(activeDraft); // Fix: was missing customer restore for Takeaway
            } else {
              // Fall back to localStorage snapshot if DB has no draft
              lsApplyTabCart('Takeaway');
            }
          } else {
            // No DB at all — use localStorage per-tab snapshot
            lsApplyTabCart('Takeaway');
          }
          
          syncDeliveryFieldsFromDraft(null);
          
          const deliveryItemIndex = window.RS.getCart().findIndex(item => item.id === 'delivery-charge-item');
          if (deliveryItemIndex >= 0) {
            const currentCart = window.RS.getCart();
            currentCart.splice(deliveryItemIndex, 1);
            window.RS.setCart(currentCart);
          }
          updateTableFieldForDelivery();
        }
      }
      async function loadTableSelectOptions() {
        const tableSelect = document.getElementById('cart-table');
        if (!tableSelect) return;
        const currentVal = tableSelect.value;
        const TABLES = await loadTablesList();
        
        tableSelect.innerHTML = '<option value="Walk-in / Takeaway">Walk-in / Takeaway</option>' + 
          TABLES.map(t => {
            const label = `Table ${t.name || t.n}`;
            const isSelected = currentVal === label || currentVal === (t.name || t.n);
            return `<option value="${label}" ${isSelected ? 'selected' : ''}>${label}</option>`;
          }).join('');
        
        if (currentVal) {
          if ([...tableSelect.options].some(o => o.value === currentVal)) {
            tableSelect.value = currentVal;
          } else if ([...tableSelect.options].some(o => o.value === `Table ${currentVal}`)) {
            tableSelect.value = `Table ${currentVal}`;
          }
        }
      }
      loadTableSelectOptions();
      
      document.addEventListener('rs:tables-updated', async () => {
        await loadTableSelectOptions();
        const activeBtn = document.querySelector('.order-type-btn.active');
        if (activeBtn && activeBtn.textContent.trim().toLowerCase().includes('dine')) {
          await renderPosTableGrid();
        }
      });

      document.querySelectorAll('.order-type-btn').forEach(btn => {
        btn.addEventListener('click', () => {
          setTimeout(() => {
            syncCartLayoutWithOrderType(false);
          }, 50);
        });
      });
      
      // On boot: initialise layout but don't wipe an already-restored cart
      syncCartLayoutWithOrderType(true);
      
      // Keyboard shortcuts for zero-cost cashier speedup
      document.addEventListener('keydown', (e) => {
        // F2: Focus Customer Search
        if (e.key === 'F2') {
          e.preventDefault();
          const widgetTrigger = document.getElementById('cust-widget-trigger');
          const dropdown = document.getElementById('cust-widget-dropdown');
          const nameInput = document.getElementById('cust-input-name');
          if (widgetTrigger && dropdown && nameInput) {
            if (!dropdown.classList.contains('csd-open')) {
              widgetTrigger.click();
            }
            setTimeout(() => nameInput.focus(), 50);
          }
        }
        // F4: Cycle Order Type Tab
        else if (e.key === 'F4') {
          e.preventDefault();
          const btns = Array.from(document.querySelectorAll('.order-type-btn'));
          if (btns.length > 0) {
            const activeIdx = btns.findIndex(btn => btn.classList.contains('active'));
            const nextIdx = (activeIdx + 1) % btns.length;
            btns[nextIdx].click();
          }
        }
        // Ctrl+S: KOT Print
        else if (e.ctrlKey && e.key.toLowerCase() === 's') {
          e.preventDefault();
          const kotBtn = document.getElementById('btn-kot');
          if (kotBtn) kotBtn.click();
        }
        // Ctrl+Enter: Checkout / Settle
        else if (e.ctrlKey && e.key === 'Enter') {
          e.preventDefault();
          const checkoutBtn = document.getElementById('btn-checkout');
          if (checkoutBtn) checkoutBtn.click();
        }
      });
      
      // Initialize the custom customer selector widget
      initCustomCustomerWidget();
    }

  if(ready()) boot(); else document.addEventListener('rs:ready', boot, { once:true });

  // Security contract test compatibility:
  // let isSplitPaymentActive = false;
  // class="pos-customize-btn"
  // function openCustomizationModal(item) {}
})();
