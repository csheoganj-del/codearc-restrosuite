/* ============================================================
   RestroSuite — QR orders UI (Wave 10 code-split)
   ============================================================ */
(function (global) {
  'use strict';

  function toast(msg, icon) {
    if (global.RS && typeof RS.toast === 'function') RS.toast(msg, icon);
  }
  function rs(n) {
    if (global.RS && typeof RS.rs === 'function') return RS.rs(n);
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
    if (global.RS && typeof RS.setOperationStatus === 'function') return RS.setOperationStatus(msg, state);
  }
  function finishOperationStatus(msg, state) {
    if (global.RS && typeof RS.finishOperationStatus === 'function') return RS.finishOperationStatus(msg, state);
  }
  function activateTab(id) {
    if (global.RS && typeof RS.activateTab === 'function') return RS.activateTab(id);
  }

  let QR_ORDERS = getOrders();

const statusPill = {pending:'pill-amber',preparing:'pill-orange',served:'pill-green'};
const statusTxt = {pending:'Pending',preparing:'Preparing',served:'Served'};
function qrItemLabel(item) {
  if (Array.isArray(item)) return item[0];
  return `${Number(item.qty || 1)}× ${item.name || 'Item'}`;
}
function qrItemTotal(item) {
  if (Array.isArray(item)) return Number(item[1] || 0);
  return Number(item.price || 0) * Number(item.qty || 1);
}
function qrTableName(table) {
  const raw = String(table || '').trim();
  if (!raw) return 'Walk-in / Takeaway';
  if (/^table\s+/i.test(raw)) return raw.replace(/^table/i, 'Table');
  if (/^\d+$/.test(raw)) return `Table ${raw}`;
  return raw;
}
function qrCartItems(order) {
  return (order.items || []).map(item => {
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
      taxCategory: item.taxCategory || item.tax_category
    };
  }).filter(item => item.name && Number.isFinite(item.price));
}
async function openQrOrderInPos(order) {
  if (!order) return;
  const items = qrCartItems(order);
  if (!items.length) {
    toast('This QR order has no billable items', 'fa-circle-exclamation');
    return;
  }
  const tableName = qrTableName(order.table);
  activateTab('pos-tab');
  // Wait for POS tab DOM + cart helpers (RS.setCart) to be ready after tab switch.
  await new Promise(resolve => setTimeout(resolve, 120));
  let attempts = 0;
  while (attempts < 8 && !(window.RS && typeof RS.setCart === 'function')) {
    await new Promise(resolve => setTimeout(resolve, 60));
    attempts += 1;
  }

  const tableSelect = document.getElementById('cart-table')
    || document.getElementById('pos-table-select')
    || document.querySelector('#pos-tab select[name="table"], #pos-tab #table-select');
  if (tableSelect) {
    const matchValue = order.table || tableName;
    let opt = [...tableSelect.options].find(o =>
      o.value === tableName || o.text === tableName ||
      o.value === matchValue || o.text === matchValue ||
      o.value === String(order.table) || o.textContent.trim() === tableName
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

  // Prefer the public cart API; fall back to direct cart mutation used by POS.
  if (window.RS && typeof RS.setCart === 'function') {
    RS.setCart(items);
  } else if (window.RS && Array.isArray(RS.cart)) {
    RS.cart.length = 0;
    items.forEach(it => RS.cart.push(it));
  }
  if (window.RS && typeof RS.setTable === 'function') {
    try { RS.setTable(tableName); } catch(e) {}
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
  try { if (window.RS && typeof RS.renderCart === 'function') RS.renderCart(); } catch(e) {}
  try { if (typeof window.saveActiveCart === 'function') window.saveActiveCart(); } catch(e) {}
  toast(`Loaded ${tableName} in POS`, 'fa-receipt');
}
function renderQR() {
  QR_ORDERS = getOrders();
  // Dynamically calculate QR Orders statistics
  const pendingCount = QR_ORDERS.filter(o => o.status === 'pending').length;
  const preparingCount = QR_ORDERS.filter(o => o.status === 'preparing').length;
  const servedCount = QR_ORDERS.filter(o => o.status === 'served').length;
  const activeTables = new Set(QR_ORDERS.map(o => o.table)).size;

  const qrTab = document.getElementById('qr-orders-tab');
  if (qrTab) {
    const svElements = qrTab.querySelectorAll('.stat-row .stat-card .sv');
    if (svElements.length >= 4) {
      svElements[0].textContent = pendingCount;
      svElements[1].textContent = preparingCount;
      svElements[2].textContent = servedCount;
      svElements[3].textContent = `${activeTables} / 12`;
    }
  }

  // Update the sidebar badge count for QR Orders (prefer pending for attention)
  const qrBadge = document.querySelector('.sidebar-link[data-tab="qr-orders-tab"] .badge-count');
  if (qrBadge) {
    const activeCount = pendingCount + preparingCount;
    qrBadge.textContent = pendingCount > 0 ? pendingCount : activeCount;
    qrBadge.style.display = activeCount > 0 ? '' : 'none';
    qrBadge.classList.toggle('badge-urgent', pendingCount > 0);
    if (pendingCount > 0) qrBadge.title = pendingCount + ' awaiting accept';
    else if (activeCount > 0) qrBadge.title = activeCount + ' active QR orders';
    else qrBadge.title = '';
  }

  // Pending first so staff see new QR orders without scrolling
  const sortedIdx = QR_ORDERS.map((o, i) => ({ o, i }))
    .sort((a, b) => {
      const rank = (s) => (s === 'pending' ? 0 : s === 'preparing' ? 1 : 2);
      return rank(a.o.status) - rank(b.o.status);
    });

  $('#qr-grid').innerHTML = sortedIdx.map(({ o, i }) => {
    const guest = o.customerName ? `<div class="qguest"><i class="fa-solid fa-user"></i> ${_e(o.customerName)}</div>` : '';
    const openPosBtn = o.status === 'pending' || o.status === 'preparing'
      ? `<button class="btn btn-ghost btn-sm" data-pos="${i}" title="Load into POS"><i class="fa-solid fa-cash-register"></i></button>`
      : '';
    return `
    <div class="qr-card s-${o.status}${o.status === 'pending' ? ' needs-attention' : ''}" data-order-id="${_e(o.id || '')}">
      <div class="qr-ch"><div><span class="tnum">Table ${_e(o.table.split('-')[1]||o.table)}</span><div class="qtime">${_e(o.time)}</div>${guest}</div><span class="pill ${statusPill[o.status]}"><span class="dot ${o.status==='preparing'||o.status==='pending'?'dot-live':''}"></span>${statusTxt[o.status]}</span></div>
      <div class="qr-lines">${o.items.map(it=>`<div class="ql"><span>${_e(qrItemLabel(it))}</span><b>${rs(qrItemTotal(it))}</b></div>`).join('')}</div>
      <div class="qr-cf"><span class="qtot">${rs(o.total)}</span>
        ${o.status!=='served'?`${openPosBtn}<button class="btn btn-ghost btn-sm" data-merge="${i}"><i class="fa-solid fa-code-merge"></i> Merge</button><button class="btn btn-primary btn-sm" data-adv="${i}">${o.status==='pending'?'Accept':'Mark served'}</button>`:`<button class="btn btn-ghost btn-sm" data-bill="${i}"><i class="fa-solid fa-receipt"></i> Bill</button>`}
      </div>
    </div>`;
  }).join('');
  $$('#qr-grid [data-pos]').forEach(b => b.addEventListener('click', () => {
    openQrOrderInPos(QR_ORDERS[+b.dataset.pos]);
  }));
  $$('#qr-grid [data-adv]').forEach(b=>b.addEventListener('click',async ()=>{
    const o=QR_ORDERS[+b.dataset.adv];
    const nextStatus = o.status==='pending'?'preparing':'served';
    const dbStatus = nextStatus==='preparing'?'preparing':'served';
    const tableLabel = o.table.split('-')[1]||o.table;
    if(o.id && window.RS_DB){
      try {
        const rows = await RS_DB.list('pending_orders');
        const row = rows.find(r => r.id === o.id);
        if (row) {
          row.status = dbStatus;
          await RS_DB.put('pending_orders', o.id, row);
          syncPendingOrders();
        }
        // Toast only after the write has actually completed successfully.
        toast('Table '+tableLabel+' -> '+statusTxt[nextStatus]);
      } catch(e) {
        console.warn("Failed updating order status", e);
        toast('Could not update Table '+tableLabel+' -- try again', 'fa-circle-exclamation');
      }
    } else {
      o.status=nextStatus; renderQR();
      toast('Table '+tableLabel+' -> '+statusTxt[nextStatus]);
    }
  }));
  $$('#qr-grid [data-merge]').forEach(b=>b.addEventListener('click',()=>{
    const srcIdx = +b.dataset.merge;
    const src = QR_ORDERS[srcIdx];
    if (!src) return;
    const candidates = QR_ORDERS
      .map((o,idx)=>({o,idx}))
      .filter(({o,idx})=> idx!==srcIdx && o.status!=='served' && o.table!==src.table);
    if (!candidates.length) {
      toast('No other open tables to merge into', 'fa-code-merge');
      return;
    }
    if (!window.RSModal) {
      toast('Modal module is unavailable', 'fa-circle-exclamation');
      return;
    }
    const options = candidates.map(({o,idx})=>`<option value="${idx}">Table ${_e(o.table.split('-')[1]||o.table)} -- ${rs(o.total)}</option>`).join('');
    RSModal.open({
      title: 'Merge table',
      sub: 'Combine Table ' + (src.table.split('-')[1]||src.table) + ' into another open table',
      icon: 'fa-code-merge',
      size: 'sm',
      body: `
        <div style="display:flex;flex-direction:column;gap:12px">
          <div style="font-size:13px;color:var(--text-soft)">
            This will move all items from Table ${_e(src.table.split('-')[1]||src.table)} onto the table you pick below, then close out Table ${_e(src.table.split('-')[1]||src.table)}. This cannot be undone.
          </div>
          <div>
            <label class="fl">Merge into</label>
            <select class="form-input" id="merge-target">${options}</select>
          </div>
        </div>`,
      foot: `<button class="btn btn-ghost" style="flex:1" data-cancel>Cancel</button><button class="btn btn-primary" style="flex:1" data-confirm><i class="fa-solid fa-code-merge"></i> Merge tables</button>`,
      onMount(modal, close) {
        modal.querySelector('[data-cancel]').onclick = close;
        modal.querySelector('[data-confirm]').onclick = async () => {
          const targetIdx = +modal.querySelector('#merge-target').value;
          const target = QR_ORDERS[targetIdx];
          if (!target) { close(); return; }
          close();
          setOperationStatus('Merging tables...');
          const mergedItems = target.items.concat(src.items);
          const mergedTotal = (Number(target.total)||0) + (Number(src.total)||0);
          target.items = mergedItems;
          target.total = mergedTotal;
          try {
            if (window.RS_DB) {
              const rows = await RS_DB.list('pending_orders');
              const targetRow = rows.find(r => r.id === target.id);
              const srcRow = rows.find(r => r.id === src.id);
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
            toast('Merged into Table ' + (target.table.split('-')[1]||target.table), 'fa-code-merge');
          } catch (e) {
            console.warn('Failed to merge tables', e);
            finishOperationStatus('Merge failed', 'error');
            toast('Could not merge tables -- try again', 'fa-circle-exclamation');
          }
        };
      }
    });
  }));
  $$('#qr-grid [data-bill]').forEach(b=>b.addEventListener('click',()=>{
    openQrOrderInPos(QR_ORDERS[+b.dataset.bill]);
  }));
};

  global.RSQrOrdersUI = { renderQR, openQrOrderInPos, qrCartItems, qrTableName, qrItemLabel, qrItemTotal };
  global.openQrOrderInPos = openQrOrderInPos;
  function attach() {
    if (!global.RS) return;
    global.RS.renderQR = renderQR;
    global.RS.openQrOrderInPos = openQrOrderInPos;
  }
  if (global.RS) attach();
  document.addEventListener('rs:ready', attach);
})(typeof window !== 'undefined' ? window : globalThis);
