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
        requestAnimationFrame(()=> ov.classList.add('show'));
        if(opts.onMount) opts.onMount(ov.querySelector('.rs-modal'), close);
        return { el: ov, modal: ov.querySelector('.rs-modal'), close };
      }
    };

    /* ---------------- print helper ---------------- */
    window.RSPrint = function(innerHTML, title){
      const f = document.createElement('iframe');
      f.style.cssText = 'position:fixed;right:0;bottom:0;width:0;height:0;border:0;';
      document.body.appendChild(f);
      const d = f.contentWindow.document;
      d.open();
      d.write(`<!doctype html><html><head><title>${title||'Print'}</title>
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
        </style></head><body>${innerHTML}</body></html>`);
      d.close();
      setTimeout(()=>{ f.contentWindow.focus(); f.contentWindow.print(); setTimeout(()=>f.remove(), 800); }, 350);
    };

    /* ---------------- receipt builder ---------------- */
    let billSeq = 2042;
    function receiptHTML(bill){
      return `<div class="rcp-center"><div class="rcp-logo">Royal Dhaba</div><div class="rcp-sub">CodeArc RestroSuite · GSTIN 27AABCR1234M1Z5</div></div>
        <hr class="rcp-hr">
        <div class="rcp-meta"><span>${bill.no}</span><span>${bill.time}</span></div>
        <div class="rcp-meta"><span>${bill.table}</span><span>${bill.customer||'Walk-in'}</span></div>
        <hr class="rcp-hr">
        ${bill.items.map(i=>`<div class="rcp-line"><span><span class="q">${i.qty}× </span>${i.name}</span><span>${rs(i.price*i.qty)}</span></div>`).join('')}
        <hr class="rcp-hr">
        <div class="rcp-line"><span>Subtotal</span><span>${rs(bill.sub)}</span></div>
        ${bill.disc?`<div class="rcp-line"><span>Discount</span><span>– ${rs(bill.disc)}</span></div>`:''}
        <div class="rcp-line"><span>CGST 2.5%</span><span>${rs(Math.round(bill.gst/2))}</span></div>
        <div class="rcp-line"><span>SGST 2.5%</span><span>${rs(bill.gst-Math.round(bill.gst/2))}</span></div>
        <div class="rcp-tot"><span>TOTAL</span><span>${rs(bill.grand)}</span></div>
        <hr class="rcp-hr">
        ${(bill.tenders||[]).map(t=>`<div class="rcp-line"><span class="q">${t.method}</span><span>${rs(t.amount)}</span></div>`).join('')}
        ${bill.change?`<div class="rcp-line"><span class="q">Change</span><span>${rs(bill.change)}</span></div>`:''}
        <div class="rcp-foot">Thank you for dining with us!<br><b>Powered by RestroSuite</b></div>`;
    }

    function showReceipt(bill){
      RSModal.open({
        title:'Bill settled', sub: bill.no+' · '+rs(bill.grand), icon:'fa-circle-check', size:'sm',
        body:`<div class="receipt-paper">${receiptHTML(bill)}</div>`,
        foot:`<button class="btn btn-ghost" id="rcp-wa" style="flex:1"><i class="fa-brands fa-whatsapp"></i> WhatsApp</button>
              <button class="btn btn-ghost" id="rcp-print" style="flex:1"><i class="fa-solid fa-print"></i> Print</button>
              <button class="btn btn-primary" id="rcp-done" style="flex:1"><i class="fa-solid fa-check"></i> New order</button>`,
        onMount(modal, close){
          modal.querySelector('#rcp-print').onclick = ()=> RSPrint(`<div style="max-width:300px;margin:0 auto">${receiptHTML(bill)}</div>`,'Receipt '+bill.no);
          modal.querySelector('#rcp-wa').onclick = ()=> RS.toast('Invoice sent on WhatsApp','fa-whatsapp');
          modal.querySelector('#rcp-done').onclick = close;
        }
      });
    }

    /* ---------------- payment modal ---------------- */
    function checkout(){
      const totals = RS.getTotals();
      const cust = RS.getCustomer();
      if(!totals.count) return RS.toast('Cart is empty','fa-circle-exclamation');
      let tenders = [];
      let method = 'Cash';
      let buffer = '';
      const methods = [['Cash','fa-money-bill-wave'],['UPI','fa-mobile-screen'],['Card','fa-credit-card']];

      RSModal.open({
        title:'Take payment', sub: totals.count+' items · '+cust.table, icon:'fa-indian-rupee-sign', size:'lg', bare:true,
        body:`<div class="pay-grid">
          <div class="pay-left">
            <div class="pay-due"><div class="lbl">Amount due</div><div class="amt" id="pay-remaining">${rs(totals.grand)}</div></div>
            <div class="pay-methods" id="pay-methods">${methods.map(m=>`<div class="pay-m ${m[0]==='Cash'?'active':''}" data-m="${m[0]}"><i class="fa-solid ${m[1]}"></i><div class="mn">${m[0]}</div></div>`).join('')}</div>
            <div id="tender-list"></div>
            <div id="change-wrap"></div>
          </div>
          <div class="pay-right">
            <input class="amt-input" id="pay-amt" value="${totals.grand}" readonly>
            <div class="quick-tenders" id="quick-tenders"></div>
            <div class="numpad" id="numpad">
              ${['1','2','3','4','5','6','7','8','9'].map(n=>`<button data-k="${n}">${n}</button>`).join('')}
              <button data-k="00">00</button><button data-k="0">0</button><button class="fn" data-k="del"><i class="fa-solid fa-delete-left"></i></button>
              <button class="wide fn" data-k="add"><i class="fa-solid fa-plus"></i> Add ${method} payment</button>
              <button class="fn" data-k="clr">Clear</button>
            </div>
          </div>
        </div>`,
        foot:`<div style="flex:1;font-size:13px;color:var(--text-mute)">Tip: split across methods by adding multiple payments</div>
              <button class="btn btn-primary btn-lg" id="pay-complete" disabled><i class="fa-solid fa-check-double"></i> Complete & print</button>`,
        onMount(modal, close){
          const remEl = modal.querySelector('#pay-remaining');
          const amtEl = modal.querySelector('#pay-amt');
          const tList = modal.querySelector('#tender-list');
          const chWrap = modal.querySelector('#change-wrap');
          const addBtn = modal.querySelector('[data-k="add"]');
          const completeBtn = modal.querySelector('#pay-complete');
          const paid = ()=> tenders.reduce((a,t)=>a+t.amount,0);
          const remaining = ()=> Math.max(0, totals.grand - paid());

          function quicks(){
            const r = remaining();
            const rounds = [r, Math.ceil(r/100)*100, Math.ceil(r/500)*500, 500, 1000, 2000].filter((v,i,a)=>v>0 && a.indexOf(v)===i).slice(0,4);
            modal.querySelector('#quick-tenders').innerHTML = rounds.map((v,i)=>`<button data-q="${v}">${i===0?'Exact ':''}${rs(v)}</button>`).join('');
            modal.querySelectorAll('#quick-tenders button').forEach(b=> b.onclick=()=>{ buffer=String(b.dataset.q); render(); });
          }
          function render(){
            amtEl.value = buffer===''? remaining() : buffer;
            remEl.textContent = rs(remaining());
            remEl.classList.toggle('done', remaining()===0);
            addBtn.innerHTML = `<i class="fa-solid fa-plus"></i> Add ${method} payment`;
            tList.innerHTML = tenders.map((t,i)=>`<div class="tender-row"><span class="tm"><i class="fa-solid ${t.method==='Cash'?'fa-money-bill-wave':t.method==='UPI'?'fa-mobile-screen':'fa-credit-card'}"></i> ${t.method}</span><span style="font-weight:700">${rs(t.amount)}</span> <span class="tx" data-rm="${i}"><i class="fa-solid fa-xmark"></i></span></div>`).join('');
            tList.querySelectorAll('[data-rm]').forEach(x=> x.onclick=()=>{ tenders.splice(+x.dataset.rm,1); buffer=''; quicks(); render(); });
            const chg = paid() - totals.grand;
            chWrap.innerHTML = (chg>0) ? `<div class="change-box"><span class="cl"><i class="fa-solid fa-hand-holding-dollar"></i> Change to return</span><span class="cv">${rs(chg)}</span></div>` : '';
            completeBtn.disabled = paid() < totals.grand;
            modal.querySelectorAll('.pay-m').forEach(m=> m.classList.toggle('active', m.dataset.m===method));
          }
          modal.querySelector('#pay-methods').onclick = e=>{ const m=e.target.closest('.pay-m'); if(!m)return; method=m.dataset.m; render(); };
          modal.querySelector('#numpad').onclick = e=>{
            const b=e.target.closest('button'); if(!b)return; const k=b.dataset.k;
            if(k==='del') buffer = buffer.slice(0,-1);
            else if(k==='clr'){ buffer=''; }
            else if(k==='add'){
              const amt = buffer===''? remaining() : +buffer;
              if(amt>0){ tenders.push({method, amount:amt}); buffer=''; quicks(); }
            }
            else buffer = (buffer + k).replace(/^0+(?=\d)/,'').slice(0,7);
            render();
          };
          completeBtn.onclick = async ()=>{
            const bill = {
              no:'INV-'+(billSeq++), time:new Date().toLocaleString('en-IN',{day:'2-digit',month:'short',hour:'numeric',minute:'2-digit',hour12:true}),
              table: cust.table, customer: cust.name||'', items: totals.items, sub: totals.sub, disc: totals.disc, gst: totals.gst, grand: totals.grand,
              tenders: tenders.slice(), change: Math.max(0, paid()-totals.grand)
            };
            // push to Bills data (+ persist to doppio_bills in cloud mode)
            try {
              const gstHalf = Math.round((totals.gst||0)/2);
              const billRow = { id:bill.no, no:bill.no, time:'Just now', table:bill.table, items: totals.count,
                amount: bill.grand, pay: tenders.length>1?'Split':tenders[0].method, status:'paid',
                customerName: cust.name||'Walk-in Guest', customerPhone: cust.phone||'',
                subtotal: totals.sub, gst: totals.gst, cgst: gstHalf, sgst: (totals.gst||0)-gstHalf,
                _items: totals.items.map(i=>({ name:i.name, qty:i.qty, price:i.price })) };
              RS.BILLS.unshift(billRow); RS.saveOne&&RS.saveOne('bills',billRow); RS.render('bills-tab');
            } catch(e){}

            // delete corresponding pending order from DB
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

            close();
            RS.clearCart();
            const cn=document.getElementById('cust-name'), cp=document.getElementById('cust-phone'); if(cn)cn.value=''; if(cp)cp.value='';
            RS.toast('Payment received · '+rs(bill.grand),'fa-circle-check');
            showReceipt(bill);
          };
          quicks(); render();
        }
      });
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
              }
            }
            RS.toast('KOT '+tok+' fired to kitchen','fa-fire');
          };
        }
      });
    }

    window.RSPOS = { checkout, kot };

    /* ---------------- HOLD ORDERS / DRAFTS ---------------- */
    const held = [];
    const holdBtn = document.getElementById('btn-hold');
    function updateHeldCount(){ const el=document.getElementById('held-count'); if(el) el.textContent = held.length?`(${held.length})`:''; }
    function holdCurrent(){
      const totals = RS.getTotals();
      if(!totals.count) return RS.toast('Nothing to hold','fa-circle-exclamation');
      const cust = RS.getCustomer();
      held.push({ id:Date.now(), items:RS.getCart(), table:cust.table, name:cust.name, count:totals.count, total:totals.grand, time:new Date().toLocaleTimeString('en-IN',{hour:'numeric',minute:'2-digit',hour12:true}) });
      RS.clearCart();
      const cn=document.getElementById('cust-name'), cp=document.getElementById('cust-phone'); if(cn)cn.value=''; if(cp)cp.value='';
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
            if(RS.getCart().length){ RS.toast('Finish or hold the current bill first','fa-circle-exclamation'); return; }
            RS.setCart(held[idx].items); held.splice(idx,1); updateHeldCount(); close(); RS.toast('Order resumed','fa-play');
          }));
          modal.querySelectorAll('[data-del]').forEach(x=> x.addEventListener('click', e=>{ e.stopPropagation(); const id=+x.dataset.del; const idx=held.findIndex(h=>h.id===id); if(idx>=0){held.splice(idx,1); updateHeldCount();} x.closest('[data-h]').remove(); if(!held.length){ close(); } }));
        }});
    }
    if(holdBtn){
      holdBtn.addEventListener('click', ()=>{ if(RS.getCart().length) holdCurrent(); else openDrafts(); });
      holdBtn.addEventListener('contextmenu', e=>{ e.preventDefault(); openDrafts(); });
    }
    updateHeldCount();
  }

  if(ready()) boot(); else document.addEventListener('rs:ready', boot, { once:true });
})();
