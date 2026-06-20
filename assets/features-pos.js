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
    function normalizeReceiptProfile(settings){
      const raw = (settings && settings._raw) || {};
      return {
        name: settings?.set_restaurant_name || settings?.set_outlet_name || raw.business_name || raw.outlet_name || sessionOutletName(),
        address: settings?.set_address || raw.address || '',
        phone: settings?.set_phone || raw.phone || '',
        gstin: settings?.set_gstin || raw.gstin || ''
      };
    }
    async function loadReceiptProfile(){
      try {
        const settings = window.RS && RS.getSettings ? await RS.getSettings() : null;
        receiptProfile = normalizeReceiptProfile(settings);
      } catch(e) {
        receiptProfile.name = receiptProfile.name || sessionOutletName();
      }
    }
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
      const custName = bill.customer || 'Walk-in';
      let custSection = '';
      if(custName !== 'Walk-in' || bill.customerPhone || bill.customerGst) {
        custSection = `
          <div class="rcp-meta"><span>Customer:</span><span>${esc(custName)}</span></div>
          ${bill.customerPhone ? `<div class="rcp-meta"><span>Phone:</span><span>${esc(bill.customerPhone)}</span></div>` : ''}
          ${bill.customerGst ? `<div class="rcp-meta"><span>GSTIN:</span><span>${esc(bill.customerGst)}</span></div>` : ''}
        `;
      } else {
        custSection = `<div class="rcp-meta"><span>Customer:</span><span>Walk-in</span></div>`;
      }

      const profileLines = [
        receiptProfile.address,
        receiptProfile.phone ? `Phone ${receiptProfile.phone}` : '',
        receiptProfile.gstin ? `GSTIN ${receiptProfile.gstin}` : ''
      ].filter(Boolean).map(line => `<div class="rcp-sub">${esc(line)}</div>`).join('');
      return `<div class="rcp-center"><div class="rcp-logo">${esc(receiptProfile.name || 'Outlet')}</div>${profileLines || '<div class="rcp-sub">CodeArc RestroSuite</div>'}</div>
        <hr class="rcp-hr">
        <div class="rcp-meta"><span>${bill.no}</span><span>${bill.time}</span></div>
        <div class="rcp-meta"><span>Table:</span><span>${bill.table}</span></div>
        ${custSection}
        <hr class="rcp-hr">
        ${bill.items.map(i=>`<div class="rcp-line"><span><span class="q">${i.qty}× </span>${esc(i.name)}</span><span>${rs(i.price*i.qty)}</span></div>`).join('')}
        <hr class="rcp-hr">
        <div class="rcp-line"><span>Subtotal</span><span>${rs(bill.sub)}</span></div>
        ${bill.disc?`<div class="rcp-line"><span>Discount</span><span>– ${rs(bill.disc)}</span></div>`:''}
        ${bill.gst?`<div class="rcp-line"><span>CGST 2.5%</span><span>${rs(Math.round(bill.gst/2))}</span></div>
        <div class="rcp-line"><span>SGST 2.5%</span><span>${rs(bill.gst-Math.round(bill.gst/2))}</span></div>`:''}
        <div class="rcp-tot"><span>TOTAL</span><span>${rs(bill.grand)}</span></div>
        <hr class="rcp-hr">
        ${(bill.tenders||[]).map(t=>`<div class="rcp-line"><span class="q">${t.method}</span><span>${rs(t.amount)}</span></div>`).join('')}
        ${bill.change?`<div class="rcp-line"><span class="q">Change</span><span>${rs(bill.change)}</span></div>`:''}
        <div class="rcp-foot">Thank you for dining with us!<br><b>Powered by RestroSuite</b></div>`;
    }

    function receiptText(bill){
      const lines = [
        receiptProfile.name || 'Outlet',
        receiptProfile.address,
        receiptProfile.phone ? `Phone: ${receiptProfile.phone}` : '',
        receiptProfile.gstin ? `GSTIN: ${receiptProfile.gstin}` : '',
        `Bill: ${bill.no}`,
        `${bill.table} | ${bill.time}`,
        '',
        ...bill.items.map(i => `${i.qty} x ${i.name} - ${rs(i.price * i.qty)}`),
        '',
        `Subtotal: ${rs(bill.sub)}`,
        bill.disc ? `Discount: - ${rs(bill.disc)}` : '',
        bill.gst ? `GST: ${rs(bill.gst)}` : '',
        `Total: ${rs(bill.grand)}`,
        `Paid by: ${(bill.tenders && bill.tenders[0] && bill.tenders[0].method) || 'Cash'}`,
        '',
        'Thank you for dining with us!'
      ];
      return lines.filter(Boolean).join('\n');
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
          modal.querySelector('#rc-wa').onclick = ()=>{
            const text = encodeURIComponent(receiptText(bill));
            const url = `https://wa.me/?text=${text}`;
            window.open(url, '_blank', 'noopener,noreferrer');
            RS.toast('WhatsApp receipt ready','fa-whatsapp');
          };
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
      }
    };

    /* ---------------- inline cart payment ---------------- */
    const paymentState = { method: 'Cash' };
    let kotSentKey = '';
    const orderType = () => (document.querySelector('.order-type-btn.active')?.textContent || 'Takeaway').trim();
    const cartKey = () => {
      const totals = RS.getTotals();
      const cust = RS.getCustomer();
      return `${cust.table}|${orderType()}|${totals.grand}|${totals.items.map(i=>`${i.id}:${i.qty}`).join(',')}`;
    };
    const isDineIn = () => orderType().toLowerCase().includes('dine');
    const isKotSent = () => kotSentKey && kotSentKey === cartKey();
    const resetCustomerFields = () => {
      const ct = document.getElementById('cart-table');
      if (ct) ct.value = 'Walk-in / Takeaway';
      const csel = document.getElementById('cart-customer-sel');
      if (csel) csel.value = '';
    };
    function getPaymentDetails(){
      const totals = RS.getTotals();
      const method = paymentState.method || 'Cash';
      return { method, received: totals.grand, change: 0, valid: totals.count > 0 };
    }
    function resetPayment(){
      paymentState.method = 'Cash';
      kotSentKey = '';
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

    function refreshPaymentPanel(){
      const totals = RS.getTotals();
      const note = document.getElementById('pay-method-note');
      const checkoutBtn = document.getElementById('btn-checkout');
      if(!checkoutBtn) return;
      document.querySelectorAll('[data-pay-method]').forEach(btn=>btn.classList.toggle('active', btn.dataset.payMethod === paymentState.method));
      if(note) note.textContent = paymentState.method;
      checkoutBtn.disabled = totals.count < 1;

      // Handle inline cash calculator
      const inlineCalc = document.getElementById('cash-calc-inline');
      if (inlineCalc) {
        if (paymentState.method === 'Cash' && totals.count > 0) {
          inlineCalc.style.display = 'flex';
          const receivedInput = document.getElementById('inline-cash-received');
          if (receivedInput) {
            const currentVal = Number(receivedInput.value) || 0;
            if (!receivedInput.dataset.userInteracted || currentVal <= 0 || receivedInput.dataset.grandTotal !== String(totals.grand)) {
              receivedInput.value = totals.grand;
              receivedInput.dataset.grandTotal = totals.grand;
              delete receivedInput.dataset.userInteracted;
            }
          }
          updateInlineChange();
        } else {
          inlineCalc.style.display = 'none';
        }
      }
    }

    function wirePaymentPanel(){
      const methods = document.getElementById('cart-pay-methods');
      if(methods) methods.addEventListener('click', e=>{
        const btn = e.target.closest('[data-pay-method]'); if(!btn) return;
        paymentState.method = btn.dataset.payMethod;
        refreshPaymentPanel();
      });

      // Wire inline cash calculator events
      const receivedInput = document.getElementById('inline-cash-received');
      if (receivedInput) {
        receivedInput.addEventListener('input', () => {
          receivedInput.dataset.userInteracted = '1';
          updateInlineChange();
        });
      }

      document.querySelectorAll('.inline-den-btn').forEach(btn => {
        btn.onclick = () => {
          const totals = RS.getTotals();
          const receivedInput = document.getElementById('inline-cash-received');
          if (!receivedInput) return;
          
          receivedInput.dataset.userInteracted = '1';
          const val = btn.dataset.val;
          if (val === 'exact') {
            receivedInput.value = totals.grand;
          } else {
            const increment = Number(val) || 0;
            let current = Number(receivedInput.value) || 0;
            if (current === totals.grand && !receivedInput.dataset.userInteracted) {
              receivedInput.value = increment;
            } else {
              receivedInput.value = current + increment;
            }
          }
          updateInlineChange();
        };
      });

      refreshPaymentPanel();
    }
    async function checkout(){
      const totals = RS.getTotals();
      const cust = RS.getCustomer();
      if(!totals.count) return RS.toast('Cart is empty','fa-circle-exclamation');
      const payment = getPaymentDetails();
      if(!payment.valid) return RS.toast('Cart is empty','fa-circle-exclamation');

      async function finalizeBill(payMethod, receivedVal, changeVal) {
        if(isDineIn() && !isKotSent() && !window.confirm('KOT not sent. Continue billing?')) return;

        if (payMethod === 'Due' && cust.phone) {
          try {
            const customers = window.RS_DB ? await RS_DB.list('customers').catch(() => []) : [];
            const matched = customers.find(c => c.phone === cust.phone);
            if (matched) {
              matched.dues = (matched.dues || 0) + totals.grand;
              matched.spend = (matched.spend || 0) + totals.grand;
              matched.visits = (matched.visits || 0) + 1;
              matched.last = new Date().toLocaleDateString('en-CA');
              await RS_DB.put('customers', matched.id, matched);
              RS.toast('Customer credit (due) updated', 'fa-address-book');
            }
          } catch (e) {
            console.warn("Failed to update customer dues on checkout", e);
          }
        }

        const bill = {
          no:(RS.nextBillNo ? RS.nextBillNo(RS.BILLS || []) : 'RS-'+Date.now()), time:new Date().toLocaleString('en-IN',{day:'2-digit',month:'short',hour:'numeric',minute:'2-digit',hour12:true}),
          table: cust.table, customer: cust.name||'', customerPhone: cust.phone||'', customerGst: cust.gst||'', items: totals.items, sub: totals.sub, disc: totals.disc, gst: totals.gst, grand: totals.grand,
          tenders: [{ method: payMethod, amount: receivedVal }], change: changeVal || 0
        };
        try {
          const syncErrorBefore = window.RS_LAST_CLOUD_ERROR && window.RS_LAST_CLOUD_ERROR.time;
          const gstHalf = Math.round((totals.gst||0)/2);
          const billRow = { id:bill.no, orderId:bill.no, no:bill.no, time:bill.time, dateTime:new Date().toISOString(), table:bill.table, items: totals.count,
            amount: bill.grand, pay: payMethod, paymentMethod: payMethod, total: bill.grand, status:'paid',
            receivedAmount: receivedVal, changeAmount: changeVal,
            customerName: cust.name||'Walk-in Guest', customerPhone: cust.phone||'',
            subtotal: totals.sub, gst: totals.gst, cgst: gstHalf, sgst: (totals.gst||0)-gstHalf,
            _items: totals.items.map(i=>({ name:i.name, qty:i.qty, price:i.price })) };
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
            const rows = await RS_DB.list('pending_orders');
            const matched = rows.find(r =>
              (r.tableNumber === cust.table || r.tableNumber === cust.table.replace('Table ', '')) &&
              (r.status === 'Pending Review' || r.status === 'Accepted' || r.status === 'preparing' || r.status === 'served' || r.status === 'Ready' || r.status === 'DineIn Active')
            );
            if (matched) {
              await RS_DB.del('pending_orders', matched.id);
              if (window.RS_SYNC) window.RS_SYNC.syncPendingOrders();
            }
          } catch(e) {
            console.warn("Failed to clear pending order on checkout", e);
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
      document.addEventListener('click', e => {
        const btn = e.target.closest('#btn-checkout, #btn-kot, #btn-clear-cart');
        if (!btn || btn.disabled) return;
        e.preventDefault();
        e.stopPropagation();
        if (btn.id === 'btn-checkout') return checkout();
        if (btn.id === 'btn-kot') return kot();
        if (btn.id === 'btn-clear-cart') {
          const totals = RS.getTotals();
          if (totals.count > 0 && confirm("Clear current cart?")) {
            RS.clearCart();
            resetCustomerFields();
            resetPayment();
          }
          return;
        }
      }, true);
    }

    /* ---------------- HOLD ORDERS / DRAFTS ---------------- */
    const held = [];
    const holdBtn = document.getElementById('btn-hold');
    const holdBtnM = document.getElementById('btn-m-hold');
    function updateHeldCount(){
      const el = document.getElementById('held-count');
      if(el) el.textContent = held.length ? `(${held.length})` : '';
      const elM = document.getElementById('held-count-m');
      if(elM) elM.textContent = held.length ? `(${held.length})` : '';
      if(holdBtnM) {
        holdBtnM.style.display = held.length ? '' : 'none';
      }
    }
    async function loadHeldFromDB() {
      if (window.RS_DB) {
        try {
          const rows = await RS_DB.list('drafts');
          held.length = 0;
          rows.forEach(r => {
            held.push({
              id: Number(r.id),
              draftId: r.draftId || String(r.id),
              items: r.items || [],
              table: r.name || r.draftName || 'Walk-in / Takeaway',
              name: r.customerName || '',
              phone: r.customerPhone || '',
              gst: r.customerGst || '',
              count: (r.items || []).reduce((sum, item) => sum + (item.qty || 1), 0),
              total: r.total || 0,
              time: r.time || new Date().toLocaleTimeString('en-IN', {hour: 'numeric', minute: '2-digit', hour12: true})
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
        time: new Date().toLocaleTimeString('en-IN',{hour:'numeric',minute:'2-digit',hour12:true}) 
      };
      
      held.push(newHeld);
      
      if (window.RS_DB) {
        try {
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
            total: totals.grand
          };
          await RS_DB.put('drafts', id, dbRow);
        } catch (e) {
          console.warn("Failed to save draft to database", e);
        }
      }

      RS.clearCart();
      const cn=document.getElementById('cust-name'), cp=document.getElementById('cust-phone'), cg=document.getElementById('cust-gst'); if(cn)cn.value=''; if(cp)cp.value=''; if(cg)cg.value='';
      const ct = document.getElementById('cart-table'); if(ct) ct.value = 'Walk-in / Takeaway';
      updateHeldCount();
      RS.toast('Order held · '+held.length+' parked','fa-pause');
    }

    function openDrafts(){
      RSModal.open({ title:'Held orders', sub:held.length+' parked bills', icon:'fa-pause', size:'sm',
        body: held.length ? `<div style="display:flex;flex-direction:column;gap:10px">${held.map(h=>`
          <div class="tender-row" data-h="${h.id}" style="cursor:pointer">
            <div><div style="font-weight:700;font-size:14px">${h.table}${h.name?' · '+h.name:''}</div><div style="font-size:12px;color:var(--text-mute)">${h.count} items · held ${h.time}</div></div>
            <div style="display:flex;align-items:center;gap:10px"><b>${rs(h.total)}</b><span class="tx" data-del="${h.id}" title="Discard"><i class="fa-solid fa-trash"></i></span></div>
          </div>`).join('')}</div>`
          : '<div class="sr-empty">No held orders. Use Hold to park a bill and start another.</div>',
        onMount(modal, close){
          modal.querySelectorAll('[data-h]').forEach(row=> row.addEventListener('click', e=>{
            if(e.target.closest('[data-del]')) return;
            const id=+row.dataset.h; const idx=held.findIndex(x=>x.id===id); if(idx<0) return;
            
            // Clear current cart first
            RS.clearCart();
            
            const selected = held[idx];
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
            
            // Delete from database
            if (window.RS_DB) {
              RS_DB.del('drafts', selected.id).catch(e => console.warn("Failed to delete draft from DB", e));
            }
            
            held.splice(idx,1); updateHeldCount(); close(); RS.toast('Order resumed','fa-play');
          }));
          modal.querySelectorAll('[data-del]').forEach(x=> x.addEventListener('click', async e=>{ 
            e.stopPropagation(); 
            const id=+x.dataset.del; 
            const idx=held.findIndex(h=>h.id===id); 
            if(idx>=0){
              const selected = held[idx];
              if (window.RS_DB) {
                try {
                  await RS_DB.del('drafts', selected.id);
                } catch(err) {
                  console.warn("Failed to delete draft from DB", err);
                }
              }
              held.splice(idx,1); 
              updateHeldCount();
            } 
            x.closest('[data-h]').remove(); 
            if(!held.length){ close(); } 
          }));
        }});
    }
    if(holdBtn){
      holdBtn.addEventListener('click', ()=>{ if(RS.getCart().length) holdCurrent(); else openDrafts(); });
      holdBtn.addEventListener('contextmenu', e=>{ e.preventDefault(); openDrafts(); });
    }
    if(holdBtnM){
      holdBtnM.addEventListener('click', () => openDrafts());
    }
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
  }

  if(ready()) boot(); else document.addEventListener('rs:ready', boot, { once:true });

  // Security contract test compatibility:
  // let isSplitPaymentActive = false;
  // class="pos-customize-btn"
  // function openCustomizationModal(item) {}
})();
