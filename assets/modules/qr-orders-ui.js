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

  const statusPill = { pending: 'pill-amber', preparing: 'pill-orange', served: 'pill-green' };
  const statusTxt = { pending: 'Pending', preparing: 'Preparing', served: 'Served' };

  function parseTs(dateStr) {
    if (dateStr == null || dateStr === '') return null;
    if (typeof dateStr === 'number' && Number.isFinite(dateStr)) return dateStr;
    const m = String(dateStr)
      .trim()
      .match(/^(\d{1,2})\/(\d{1,2})\/(\d{4}),?\s+(\d{1,2}):(\d{2})(?::(\d{2}))?\s*([ap]m)?$/i);
    if (m) {
      let [, d, mo, y, h, mi, s, meridiem] = m;
      let hour = Number(h);
      if (meridiem) {
        const pm = meridiem.toLowerCase() === 'pm';
        if (pm && hour < 12) hour += 12;
        if (!pm && hour === 12) hour = 0;
      }
      const parsed = new Date(Number(y), Number(mo) - 1, Number(d), hour, Number(mi), Number(s || 0)).getTime();
      return Number.isNaN(parsed) ? null : parsed;
    }
    const nativeTime = new Date(dateStr).getTime();
    return Number.isNaN(nativeTime) ? null : nativeTime;
  }

  /** Live relative age — never show a frozen "9h ago" from last sync. */
  function relativeAge(o) {
    const ts = o && (o.start || parseTs(o.dateTime) || parseTs(o.time));
    if (!ts) {
      // Fall back to preformatted string only if it already looks relative
      const t = String((o && o.time) || '');
      if (/ago|just now|min|h\s/i.test(t)) return t;
      return 'just now';
    }
    const elapsed = Date.now() - ts;
    if (elapsed < 0) return 'just now';
    const mins = Math.floor(elapsed / 60000);
    if (mins < 1) return 'just now';
    if (mins < 60) return mins + ' min ago';
    const hrs = Math.floor(mins / 60);
    if (hrs < 24) return hrs + 'h ' + (mins % 60) + 'm ago';
    const days = Math.floor(hrs / 24);
    return days + 'd ago';
  }

  function ageMinutes(o) {
    const ts = o && (o.start || parseTs(o.dateTime));
    if (!ts) return 0;
    return Math.max(0, (Date.now() - ts) / 60000);
  }

  function tableTotalCount() {
    try {
      if (global.RS && Array.isArray(RS.TABLES) && RS.TABLES.length) return RS.TABLES.length;
      const cards = document.querySelectorAll('#floor-tab .table-card');
      if (cards.length) return cards.length;
    } catch (_) {}
    return 12;
  }

  function qrItemLabel(item) {
    if (Array.isArray(item)) return item[0];
    return `${Number(item.qty || 1)}× ${item.name || 'Item'}`;
  }
  function qrItemTotal(item) {
    if (Array.isArray(item)) return Number(item[1] || 0);
    return Number(item.price || 0) * Number(item.qty || 1);
  }
  function qrItemNote(item) {
    if (Array.isArray(item)) return item[2] || '';
    return item.notes || item.note || '';
  }
  function qrTableName(table) {
    const raw = String(table || '').trim();
    if (!raw) return 'Walk-in / Takeaway';
    if (/^table\s+/i.test(raw)) return raw.replace(/^table/i, 'Table');
    if (/^\d+$/.test(raw)) return `Table ${raw}`;
    return raw;
  }
  function qrTableShort(table) {
    const raw = String(table || '').trim();
    if (!raw) return '—';
    const parts = raw.split('-');
    if (parts.length > 1 && /^\d+$/.test(parts[parts.length - 1])) return parts[parts.length - 1];
    const m = raw.match(/(\d+)/);
    if (m) return m[1];
    return raw;
  }
  function qrCartItems(order) {
    return (order.items || [])
      .map((item) => {
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
          taxCategory: item.taxCategory || item.tax_category,
          notes: item.notes || item.note || '',
        };
      })
      .filter((item) => item.name && Number.isFinite(item.price));
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
    await new Promise((resolve) => setTimeout(resolve, 120));
    let attempts = 0;
    while (attempts < 8 && !(window.RS && typeof RS.setCart === 'function')) {
      await new Promise((resolve) => setTimeout(resolve, 60));
      attempts += 1;
    }

    const tableSelect =
      document.getElementById('cart-table') ||
      document.getElementById('pos-table-select') ||
      document.querySelector('#pos-tab select[name="table"], #pos-tab #table-select');
    if (tableSelect) {
      const matchValue = order.table || tableName;
      let opt = [...tableSelect.options].find(
        (o) =>
          o.value === tableName ||
          o.text === tableName ||
          o.value === matchValue ||
          o.text === matchValue ||
          o.value === String(order.table) ||
          o.textContent.trim() === tableName
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
      items.forEach((it) => RS.cart.push(it));
    }
    if (window.RS && typeof RS.setTable === 'function') {
      try {
        RS.setTable(tableName);
      } catch (e) {}
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
    try {
      if (window.RS && typeof RS.renderCart === 'function') RS.renderCart();
    } catch (e) {}
    try {
      if (typeof window.saveActiveCart === 'function') window.saveActiveCart();
    } catch (e) {}
    toast(`Loaded ${tableName} in POS`, 'fa-receipt');
  }

  function emptyQrHtml() {
    return `<div class="sr-empty qr-empty" style="grid-column:1/-1;padding:48px 24px">
      <i class="fa-solid fa-qrcode" style="font-size:28px;opacity:.45;margin-bottom:10px;display:block"></i>
      <div style="font-weight:700;font-size:15px;color:var(--text);margin-bottom:6px">No QR orders right now</div>
      <div style="max-width:340px;margin:0 auto 14px;line-height:1.45">When guests scan a table QR and place an order, it appears here for accept → kitchen → serve.</div>
      <div style="display:flex;gap:8px;justify-content:center;flex-wrap:wrap">
        <button type="button" class="btn btn-ghost btn-sm" data-qr-goto-floor><i class="fa-solid fa-chair"></i> Open floor</button>
        <button type="button" class="btn btn-primary btn-sm" data-qr-refresh><i class="fa-solid fa-rotate"></i> Refresh</button>
      </div>
    </div>`;
  }

  function renderQR() {
    QR_ORDERS = getOrders();
    const pendingCount = QR_ORDERS.filter((o) => o.status === 'pending').length;
    const preparingCount = QR_ORDERS.filter((o) => o.status === 'preparing').length;
    const servedCount = QR_ORDERS.filter((o) => o.status === 'served').length;
    const activeTables = new Set(QR_ORDERS.filter((o) => o.status !== 'served').map((o) => o.table)).size;
    const totalTables = tableTotalCount();

    const qrTab = document.getElementById('qr-orders-tab');
    if (qrTab) {
      const svElements = qrTab.querySelectorAll('.stat-row .stat-card .sv');
      if (svElements.length >= 4) {
        svElements[0].textContent = pendingCount;
        svElements[1].textContent = preparingCount;
        svElements[2].textContent = servedCount;
        svElements[3].textContent = `${activeTables} / ${totalTables}`;
      }
    }

    // Sidebar badge — pending first for attention
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

    const grid = $('#qr-grid');
    if (!grid) return;

    if (!QR_ORDERS.length) {
      grid.innerHTML = emptyQrHtml();
      const floorBtn = grid.querySelector('[data-qr-goto-floor]');
      if (floorBtn)
        floorBtn.onclick = () => {
          if (typeof activateTab === 'function') activateTab('floor-tab');
          else if (global.RS && RS.activateTab) RS.activateTab('floor-tab');
        };
      const refreshBtn = grid.querySelector('[data-qr-refresh]');
      if (refreshBtn)
        refreshBtn.onclick = () => {
          syncPendingOrders({ forceCloud: true });
          toast('Refreshing QR orders…', 'fa-rotate');
        };
      return;
    }

    // Pending first, then oldest within status
    const sortedIdx = QR_ORDERS.map((o, i) => ({ o, i })).sort((a, b) => {
      const rank = (s) => (s === 'pending' ? 0 : s === 'preparing' ? 1 : 2);
      const r = rank(a.o.status) - rank(b.o.status);
      if (r !== 0) return r;
      return ageMinutes(b.o) - ageMinutes(a.o); // older first within bucket
    });

    grid.innerHTML = sortedIdx
      .map(({ o, i }) => {
        const guest = o.customerName
          ? `<div class="qguest"><i class="fa-solid fa-user"></i> ${_e(o.customerName)}</div>`
          : '';
        const mins = ageMinutes(o);
        const ageCls = o.status === 'served' ? '' : mins > 15 ? ' late' : mins > 8 ? ' mid' : '';
        const openPosBtn =
          o.status === 'pending' || o.status === 'preparing'
            ? `<button class="btn btn-ghost btn-sm" data-pos="${i}" title="Load into POS"><i class="fa-solid fa-cash-register"></i></button>`
            : '';
        const lines = (o.items || [])
          .map((it) => {
            const note = qrItemNote(it);
            return `<div class="ql"><span>${_e(qrItemLabel(it))}${
              note ? `<div class="qnote"><i class="fa-solid fa-circle-info"></i> ${_e(note)}</div>` : ''
            }</span><b>${rs(qrItemTotal(it))}</b></div>`;
          })
          .join('');
        return `
    <div class="qr-card s-${_e(o.status)}${o.status === 'pending' ? ' needs-attention' : ''}${mins > 15 && o.status !== 'served' ? ' qr-aging' : ''}" data-order-id="${_e(o.id || '')}">
      <div class="qr-ch"><div><span class="tnum">Table ${_e(qrTableShort(o.table))}</span><div class="qtime${ageCls}" data-qr-start="${_e(o.start || parseTs(o.dateTime) || '')}">${_e(relativeAge(o))}</div>${guest}</div><span class="pill ${statusPill[o.status] || 'pill-amber'}"><span class="dot ${o.status === 'preparing' || o.status === 'pending' ? 'dot-live' : ''}"></span>${statusTxt[o.status] || o.status}</span></div>
      <div class="qr-lines">${lines}</div>
      <div class="qr-cf"><span class="qtot">${rs(o.total)}</span>
        ${
          o.status !== 'served'
            ? `${openPosBtn}<button class="btn btn-ghost btn-sm" data-merge="${i}" title="Merge into another table"><i class="fa-solid fa-code-merge"></i> Merge</button><button class="btn btn-primary btn-sm" data-adv="${i}">${o.status === 'pending' ? 'Accept' : 'Mark served'}</button>`
            : `<button class="btn btn-ghost btn-sm" data-bill="${i}"><i class="fa-solid fa-receipt"></i> Bill</button>`
        }
      </div>
    </div>`;
      })
      .join('');

    $$('#qr-grid [data-pos]').forEach((b) =>
      b.addEventListener('click', () => {
        openQrOrderInPos(QR_ORDERS[+b.dataset.pos]);
      })
    );
    $$('#qr-grid [data-adv]').forEach((b) =>
      b.addEventListener('click', async () => {
        const o = QR_ORDERS[+b.dataset.adv];
        if (!o) return;
        const nextStatus = o.status === 'pending' ? 'preparing' : 'served';
        const dbStatus = nextStatus === 'preparing' ? 'preparing' : 'served';
        const tableLabel = qrTableShort(o.table);
        if (o.id && window.RS_DB) {
          try {
            const rows = await RS_DB.list('pending_orders');
            const row = rows.find((r) => r.id === o.id);
            if (row) {
              row.status = dbStatus;
              await RS_DB.put('pending_orders', o.id, row);
              syncPendingOrders();
            }
            toast('Table ' + tableLabel + ' → ' + statusTxt[nextStatus]);
          } catch (e) {
            console.warn('Failed updating order status', e);
            toast('Could not update Table ' + tableLabel + ' — try again', 'fa-circle-exclamation');
          }
        } else {
          o.status = nextStatus;
          renderQR();
          toast('Table ' + tableLabel + ' → ' + statusTxt[nextStatus]);
        }
      })
    );
    $$('#qr-grid [data-merge]').forEach((b) =>
      b.addEventListener('click', () => {
        const srcIdx = +b.dataset.merge;
        const src = QR_ORDERS[srcIdx];
        if (!src) return;
        const candidates = QR_ORDERS.map((o, idx) => ({ o, idx })).filter(
          ({ o, idx }) => idx !== srcIdx && o.status !== 'served' && o.table !== src.table
        );
        if (!candidates.length) {
          toast('No other open tables to merge into', 'fa-code-merge');
          return;
        }
        if (!window.RSModal) {
          toast('Modal module is unavailable', 'fa-circle-exclamation');
          return;
        }
        const options = candidates
          .map(
            ({ o, idx }) =>
              `<option value="${idx}">Table ${_e(qrTableShort(o.table))} — ${rs(o.total)}</option>`
          )
          .join('');
        RSModal.open({
          title: 'Merge table',
          sub: 'Combine Table ' + qrTableShort(src.table) + ' into another open table',
          icon: 'fa-code-merge',
          size: 'sm',
          body: `
        <div style="display:flex;flex-direction:column;gap:12px">
          <div style="font-size:13px;color:var(--text-soft)">
            This will move all items from Table ${_e(qrTableShort(src.table))} onto the table you pick below, then close out Table ${_e(qrTableShort(src.table))}. This cannot be undone.
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
              if (!target) {
                close();
                return;
              }
              close();
              setOperationStatus('Merging tables...');
              const mergedItems = target.items.concat(src.items);
              const mergedTotal = (Number(target.total) || 0) + (Number(src.total) || 0);
              target.items = mergedItems;
              target.total = mergedTotal;
              try {
                if (window.RS_DB) {
                  const rows = await RS_DB.list('pending_orders');
                  const targetRow = rows.find((r) => r.id === target.id);
                  const srcRow = rows.find((r) => r.id === src.id);
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
                toast('Merged into Table ' + qrTableShort(target.table), 'fa-code-merge');
              } catch (e) {
                console.warn('Failed to merge tables', e);
                finishOperationStatus('Merge failed', 'error');
                toast('Could not merge tables — try again', 'fa-circle-exclamation');
              }
            };
          },
        });
      })
    );
    $$('#qr-grid [data-bill]').forEach((b) =>
      b.addEventListener('click', () => {
        openQrOrderInPos(QR_ORDERS[+b.dataset.bill]);
      })
    );
  }

  function tickQRAges() {
    const tab = document.getElementById('qr-orders-tab');
    if (!tab || !tab.classList.contains('active')) return;
    $$('#qr-grid .qtime[data-qr-start]').forEach((el) => {
      const start = +el.dataset.qrStart;
      if (!start) return;
      const mins = (Date.now() - start) / 60000;
      const m = Math.floor(mins);
      let text = 'just now';
      if (m >= 1 && m < 60) text = m + ' min ago';
      else if (m >= 60) {
        const hrs = Math.floor(m / 60);
        text = hrs < 24 ? hrs + 'h ' + (m % 60) + 'm ago' : Math.floor(hrs / 24) + 'd ago';
      }
      el.textContent = text;
      el.classList.toggle('mid', mins > 8 && mins <= 15);
      el.classList.toggle('late', mins > 15);
      const card = el.closest('.qr-card');
      if (card && !card.classList.contains('s-served')) {
        card.classList.toggle('qr-aging', mins > 15);
      }
    });
  }

  if (!global.__rsQrTickBound) {
    global.__rsQrTickBound = true;
    setInterval(tickQRAges, 15000);
  }

  global.RSQrOrdersUI = { renderQR, openQrOrderInPos, qrCartItems, qrTableName, qrItemLabel, qrItemTotal, tickQRAges };
  global.openQrOrderInPos = openQrOrderInPos;
  function attach() {
    if (!global.RS) return;
    global.RS.renderQR = renderQR;
    global.RS.openQrOrderInPos = openQrOrderInPos;
  }
  if (global.RS) attach();
  document.addEventListener('rs:ready', attach);
})(typeof window !== 'undefined' ? window : globalThis);
