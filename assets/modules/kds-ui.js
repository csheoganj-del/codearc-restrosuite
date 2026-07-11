/* ============================================================
   RestroSuite — KDS board UI (Wave 9 code-split)
   ============================================================ */
(function (global) {
  'use strict';

  function toast(msg, icon) {
    if (global.RS && typeof RS.toast === 'function') RS.toast(msg, icon);
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

  function renderKDS() {
    const KDS = getKDS();
  const avgPrepEl = document.getElementById('kds-avg-prep');
  if (avgPrepEl) {
    if (KDS.length > 0) {
      let totalMins = 0;
      KDS.forEach(o => {
        const mins = (Date.now() - o.start) / 60000;
        totalMins += mins;
      });
      const avg = totalMins / KDS.length;
      const m = Math.floor(avg), s = Math.floor((avg - m) * 60);
      avgPrepEl.textContent = `Avg prep ${m}:${String(s).padStart(2, '0')}`;
    } else {
      avgPrepEl.textContent = 'Avg prep --:--';
    }
  }

  const _ksEl = document.getElementById('kds-search');
  if (_ksEl && !_ksEl.dataset.bound) { _ksEl.dataset.bound='1'; _ksEl.addEventListener('input', ()=>{ try{ renderKDS(); }catch(e){} }); }
  const _kq = ((_ksEl && _ksEl.value) || '').trim().toLowerCase();
  const _kmatch = (o) => !_kq || String(o.tok||'').toLowerCase().includes(_kq) || String(o.type||'').toLowerCase().includes(_kq) || (o.items||[]).some(it => String(it[1]||'').toLowerCase().includes(_kq));
  $('#kds-grid').innerHTML = (KDS.length && !KDS.some(_kmatch))
    ? `<div class="sr-empty" style="grid-column:1/-1;text-align:center;padding:30px;color:var(--text-soft)">No orders match your search.</div>`
    : KDS.map((o,i)=> _kmatch(o) ? `
    <div class="kds-card" data-k="${i}">
      <div class="kds-h"><div><div class="ktok">${_e(o.tok)}</div><div class="ktype">${_e(o.type)}</div></div><span class="kds-timer" data-start="${_e(o.start)}">0:00</span></div>
      <div class="kds-items">${o.items.map((it,j)=>`<div class="kds-item" data-i="${j}"><span class="kq">${_e(it[0])}×</span><div><span class="kn">${_e(it[1])}</span>${it[2]?`<div class="knote"><i class="fa-solid fa-circle-info"></i> ${_e(it[2])}</div>`:''}</div></div>`).join('')}</div>
      <div class="kds-eta" style="display:flex;align-items:center;gap:6px;flex-wrap:wrap;padding:6px 0 2px;border-top:1px dashed var(--stroke);margin-top:6px">
        <span style="font-size:11px;color:var(--text-soft);font-weight:600;margin-right:2px">${o.prepMinutes?('ETA '+o.prepMinutes+'m'):'Prep:'}</span>
        ${[10,15,20,30].map(mn=>`<button class="kds-eta-btn" data-eta="${i}" data-mins="${mn}" style="font-size:11px;padding:3px 8px;border:1px solid var(--stroke);border-radius:5px;background:${o.prepMinutes===mn?'var(--orange)':'var(--panel)'};color:${o.prepMinutes===mn?'#fff':'var(--text)'};cursor:pointer">${mn}m</button>`).join('')}
        <button class="kds-eta-btn" data-eta="${i}" data-mins="custom" style="font-size:11px;padding:3px 8px;border:1px solid var(--stroke);border-radius:5px;background:var(--panel);color:var(--text);cursor:pointer">…</button>
      </div>
      <div class="kds-foot"><button class="btn btn-primary btn-block" data-done="${i}"><i class="fa-solid fa-check"></i> Mark ready</button></div>
    </div>` : '').join('');
  $$('#kds-grid .kds-item').forEach(it=> it.addEventListener('click',()=>it.classList.toggle('done')));
  $$('#kds-grid [data-done]').forEach(b=> b.addEventListener('click',async ()=>{
    const item = KDS[+b.dataset.done];
    let failed = false;
    if(item && item.id && window.RS_DB){
      try {
        const rows = await RS_DB.list('pending_orders');
        const row = rows.find(r => r.id === item.id);
        if (row) {
          row.status = 'Ready';
          await RS_DB.put('pending_orders', item.id, row);
          syncPendingOrders();
        }
      } catch(e) {
        console.warn("Failed updating KDS status", e);
        failed = true;
      }
    }
    if (failed) {
      toast('Could not mark order ready -- try again', 'fa-circle-exclamation');
      return;
    }
    const c=b.closest('.kds-card');
    c.style.transition='all .4s var(--ease)'; c.style.opacity='0'; c.style.transform='scale(.9)';
    toast('Order '+(item ? item.tok : '')+' ready','fa-bell');
    setTimeout(()=>c.remove(),400);
  }));
  $$('#kds-grid [data-eta]').forEach(b=> b.addEventListener('click', async ()=>{
    const item = KDS[+b.dataset.eta];
    if(!item || !item.id || !window.RS_DB) return;
    let mins = b.dataset.mins;
    if(mins==='custom'){ const v = prompt('Prep time in minutes?', item.prepMinutes||'15'); if(v==null) return; mins = parseInt(v,10); } else { mins = parseInt(mins,10); }
    if(!Number.isFinite(mins) || mins<=0) return;
    try {
      const rows = await RS_DB.list('pending_orders');
      const row = rows.find(r => r.id === item.id);
      if(row){
        row.prepMinutes = mins;
        row.prepStartedAt = new Date().toISOString();
        if(row.status==='Pending Review' || row.status==='Accepted') row.status='preparing';
        await RS_DB.put('pending_orders', item.id, row);
        item.prepMinutes = mins; item.prepStartedAt = row.prepStartedAt;
        if(typeof syncPendingOrders==='function') syncPendingOrders();
        toast('ETA set: '+mins+' min','fa-clock');
        renderKDS();
      }
    } catch(e){ console.warn('set ETA failed', e); toast('Could not set prep time','fa-circle-exclamation'); }
  }));
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
      if (card) card.classList.toggle('urgent', mins > 10);
    });
  }

  if (!global.__rsKdsTickBound) {
    global.__rsKdsTickBound = true;
    setInterval(() => {
      const tab = document.getElementById('kds-tab');
      if (tab && tab.classList.contains('active')) tickKDS();
    }, 1000);
  }

  global.RSKdsUI = { renderKDS, tickKDS };
  function attach() {
    if (!global.RS) return;
    global.RS.renderKDS = renderKDS;
  }
  if (global.RS) attach();
  document.addEventListener('rs:ready', attach);
})(typeof window !== 'undefined' ? window : globalThis);
