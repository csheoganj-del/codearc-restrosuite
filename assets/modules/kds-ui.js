/* ============================================================
   RestroSuite — KDS board UI (Wave 9 code-split)
   ============================================================ */
(function (global) {
  'use strict';

  function toast(msg, icon) {
    if (global.RS && typeof RS.toast === 'function') {RS.toast(msg, icon);}
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
  function activateTab(id) {
    if (global.RS && typeof RS.activateTab === 'function') {return RS.activateTab(id);}
  }

  let activeStation = 'all';

  const STATION_KEYWORDS = {
    tandoor: ['tandoor', 'naan', 'roti', 'kulcha', 'tandoori', 'tikka', 'kebab', 'seekh', 'bread'],
    curry: ['curry', 'gravy', 'dal', 'paneer', 'masala', 'korma', 'butter', 'biryani', 'rice', 'pulao'],
    beverages: ['beverage', 'drink', 'lassi', 'juice', 'soda', 'water', 'tea', 'coffee', 'shake', 'mocktail', 'chai', 'cold'],
  };

  function itemMatchesStation(it, station) {
    if (!station || station === 'all') {return true;}
    const keys = STATION_KEYWORDS[station] || [];
    const name = String((Array.isArray(it) ? it[1] : it && it.name) || '').toLowerCase();
    const note = String((Array.isArray(it) ? it[2] : it && (it.notes || it.note)) || '').toLowerCase();
    const cat = String((!Array.isArray(it) && it && (it.cat || it.category || it.station)) || '').toLowerCase();
    const hay = name + ' ' + note + ' ' + cat;
    if (cat && cat.includes(station)) {return true;}
    return keys.some((k) => hay.includes(k));
  }

  function orderMatchesStation(o, station) {
    if (!station || station === 'all') {return true;}
    const items = o.items || [];
    if (!items.length) {return true;}
    return items.some((it) => itemMatchesStation(it, station));
  }

  function wireStationSeg() {
    const tab = document.getElementById('kds-tab');
    if (!tab) {return;}
    const seg = tab.querySelector('.toolbar-row .seg');
    if (!seg || seg.dataset.kdsStationBound === '1') {return;}
    seg.dataset.kdsStationBound = '1';
    const buttons = Array.from(seg.querySelectorAll('button'));
    const map = ['all', 'tandoor', 'curry', 'beverages'];
    buttons.forEach((btn, i) => {
      btn.dataset.station = map[i] || 'all';
      btn.addEventListener('click', () => {
        buttons.forEach((b) => b.classList.toggle('active', b === btn));
        activeStation = btn.dataset.station || 'all';
        try { if (window.RSActionFeedback) {window.RSActionFeedback.click();} } catch(_) {}
        try {
          renderKDS();
        } catch (e) {}
      });
    });
  }

  function emptyKdsHtml(reason) {
    if (reason === 'search') {
      return `<div class="sr-empty kds-empty" style="grid-column:1/-1;padding:40px 24px">
        <i class="fa-solid fa-magnifying-glass" style="font-size:24px;opacity:.4;display:block;margin-bottom:8px"></i>
        <div style="font-weight:700;color:var(--text);margin-bottom:4px">No tickets match</div>
        <div style="color:var(--text-soft);font-size:13px">Try another search or switch to All stations.</div>
      </div>`;
    }
    if (reason === 'station') {
      return `<div class="sr-empty kds-empty" style="grid-column:1/-1;padding:40px 24px">
        <i class="fa-solid fa-filter" style="font-size:24px;opacity:.4;display:block;margin-bottom:8px"></i>
        <div style="font-weight:700;color:var(--text);margin-bottom:4px">Nothing for this station</div>
        <div style="color:var(--text-soft);font-size:13px">Other stations may still have tickets — switch to All stations.</div>
      </div>`;
    }
    return `<div class="sr-empty kds-empty" style="grid-column:1/-1;padding:48px 24px">
      <i class="fa-solid fa-fire-burner" style="font-size:28px;opacity:.4;display:block;margin-bottom:10px"></i>
      <div style="font-weight:700;font-size:15px;color:var(--text);margin-bottom:6px">Kitchen is clear</div>
      <div style="max-width:360px;margin:0 auto 14px;line-height:1.45;color:var(--text-soft)">
        Tickets appear when staff send a <b>KOT</b> from POS, or when a QR order is accepted.
      </div>
      <div style="display:flex;gap:8px;justify-content:center;flex-wrap:wrap">
        <button type="button" class="btn btn-primary btn-sm" data-kds-goto-pos><i class="fa-solid fa-cash-register"></i> Open POS</button>
        <button type="button" class="btn btn-ghost btn-sm" data-kds-refresh><i class="fa-solid fa-rotate"></i> Refresh</button>
      </div>
    </div>`;
  }

  function bindEmptyActions(grid) {
    const pos = grid.querySelector('[data-kds-goto-pos]');
    if (pos)
      {pos.onclick = () => {
        activateTab('pos-tab');
      };}
    const ref = grid.querySelector('[data-kds-refresh]');
    if (ref)
      {ref.onclick = () => {
        syncPendingOrders({ forceCloud: true });
        toast('Refreshing kitchen…', 'fa-rotate');
      };}
  }

  function renderKDS() {
    const KDS = getKDS();
    wireStationSeg();

    const avgPrepEl = document.getElementById('kds-avg-prep');
    if (avgPrepEl) {
      if (KDS.length > 0) {
        let totalMins = 0;
        KDS.forEach((o) => {
          const mins = (Date.now() - (o.start || Date.now())) / 60000;
          totalMins += mins;
        });
        const avg = totalMins / KDS.length;
        const m = Math.floor(avg),
          s = Math.floor((avg - m) * 60);
        avgPrepEl.textContent = `Avg prep ${m}:${String(s).padStart(2, '0')}`;
      } else {
        avgPrepEl.textContent = 'Avg prep —:—';
      }
    }

    // Sidebar / mnav badge for active kitchen tickets
    document.querySelectorAll('.sidebar-link[data-tab="kds-tab"], .mnav-link[data-tab="kds-tab"]').forEach((link) => {
      let badge = link.querySelector('.badge-count');
      if (!badge && KDS.length > 0) {
        badge = document.createElement('span');
        badge.className = 'badge-count';
        link.appendChild(badge);
      }
      if (badge) {
        badge.textContent = String(KDS.length);
        badge.style.display = KDS.length > 0 ? '' : 'none';
        badge.title = KDS.length ? KDS.length + ' kitchen tickets' : '';
        const late = KDS.some((o) => (Date.now() - (o.start || 0)) / 60000 > 10);
        badge.classList.toggle('badge-urgent', late);
      }
    });

    const grid = $('#kds-grid');
    if (!grid) {return;}

    const _ksEl = document.getElementById('kds-search');
    if (_ksEl && !_ksEl.dataset.bound) {
      _ksEl.dataset.bound = '1';
      _ksEl.addEventListener('input', () => {
        try {
          renderKDS();
        } catch (e) {}
      });
    }
    const _kq = ((_ksEl && _ksEl.value) || '').trim().toLowerCase();
    const _kmatch = (o) =>
      !_kq ||
      String(o.tok || '')
        .toLowerCase()
        .includes(_kq) ||
      String(o.type || '')
        .toLowerCase()
        .includes(_kq) ||
      (o.items || []).some((it) =>
        String(it[1] || '')
          .toLowerCase()
          .includes(_kq)
      );

    if (!KDS.length) {
      // Pre-hydrate: skeleton tickets (not a false "kitchen empty")
      try {
        if (
          window.RSSkel &&
          typeof RSSkel.shouldShow === 'function' &&
          RSSkel.shouldShow(false) &&
          RSSkel.kdsCards
        ) {
          RSSkel.paint(grid, RSSkel.kdsCards({ count: 3 }));
          return;
        }
      } catch (_) {}
      try {
        if (window.RSSkel && RSSkel.clear) {RSSkel.clear(grid);}
      } catch (_) {}
      grid.innerHTML = emptyKdsHtml('empty');
      bindEmptyActions(grid);
      return;
    }
    try {
      if (window.RSSkel && RSSkel.clear) {RSSkel.clear(grid);}
    } catch (_) {}

    // Oldest first (kitchen priority)
    const ordered = KDS.map((o, i) => ({ o, i }))
      .filter(({ o }) => _kmatch(o) && orderMatchesStation(o, activeStation))
      .sort((a, b) => (a.o.start || 0) - (b.o.start || 0));

    if (!ordered.length) {
      grid.innerHTML = emptyKdsHtml(_kq ? 'search' : activeStation !== 'all' ? 'station' : 'empty');
      bindEmptyActions(grid);
      return;
    }

    grid.innerHTML = ordered
      .map(({ o, i }) => {
        const ageMin = (Date.now() - (o.start || Date.now())) / 60000;
        const urgentCls = o.recoveredOffline
          ? ' recovered'
          : ageMin > 10
            ? ' urgent'
            : ageMin > 5
              ? ' aging'
              : '';
        const showItems =
          activeStation === 'all'
            ? o.items || []
            : (o.items || []).filter((it) => itemMatchesStation(it, activeStation));
        const items = showItems.length ? showItems : o.items || [];
        const recoverBanner = o.recoveredOffline
          ? `<div class="kds-recover-banner" style="background:#fef3c7;color:#92400e;font-size:11px;font-weight:700;padding:6px 8px;border-radius:8px;margin-bottom:6px">
              ⚠ Recovered after offline — if kitchen already cooked this, tap <b>Mark ready</b> (do not re-cook)
            </div>`
          : '';
        return `
    <div class="kds-card${urgentCls}" data-k="${i}" data-kds-id="${_e(o.id || '')}" data-recovered="${o.recoveredOffline ? '1' : '0'}">
      <div class="kds-h"><div><div class="ktok">${_e(o.tok)}</div><div class="ktype">${_e(o.type)}</div></div><span class="kds-timer" data-start="${_e(o.start)}">0:00</span></div>
      ${recoverBanner}
      <div class="kds-items">${items
        .map((it, j) => {
          // j may not match original index when station-filtered; store name for toggle only
          return `<div class="kds-item" data-i="${j}"><span class="kq">${_e(it[0])}×</span><div><span class="kn">${_e(it[1])}</span>${
            it[2] ? `<div class="knote"><i class="fa-solid fa-circle-info"></i> ${_e(it[2])}</div>` : ''
          }</div></div>`;
        })
        .join('')}</div>
      <div class="kds-eta" style="display:flex;align-items:center;gap:6px;flex-wrap:wrap;padding:6px 0 2px;border-top:1px dashed var(--stroke);margin-top:6px">
        <span style="font-size:11px;color:var(--text-soft);font-weight:600;margin-right:2px">${o.prepMinutes ? 'ETA ' + o.prepMinutes + 'm' : 'Prep:'}</span>
        ${[10, 15, 20, 30]
          .map(
            (mn) =>
              `<button type="button" class="kds-eta-btn" data-eta="${i}" data-mins="${mn}" style="font-size:11px;padding:3px 8px;border:1px solid var(--stroke);border-radius:5px;background:${
                o.prepMinutes === mn ? 'var(--orange)' : 'var(--panel)'
              };color:${o.prepMinutes === mn ? '#fff' : 'var(--text)'};cursor:pointer">${mn}m</button>`
          )
          .join('')}
        <button type="button" class="kds-eta-btn" data-eta="${i}" data-mins="custom" style="font-size:11px;padding:3px 8px;border:1px solid var(--stroke);border-radius:5px;background:var(--panel);color:var(--text);cursor:pointer">…</button>
      </div>
      <div class="kds-foot"><button type="button" class="btn btn-primary btn-block" data-done="${i}"><i class="fa-solid fa-check"></i> Mark ready</button></div>
    </div>`;
      })
      .join('');

    $$('#kds-grid .kds-item').forEach((it) => it.addEventListener('click', () => it.classList.toggle('done')));
    $$('#kds-grid [data-done]').forEach((b) =>
      b.addEventListener('click', async () => {
        const item = KDS[+b.dataset.done];
        let failed = false;
        if (item && item.id && window.RS_DB) {
          try {
            const rows = await RS_DB.list('pending_orders');
            const row = rows.find((r) => r.id === item.id);
            if (row) {
              row.status = 'Ready';
              // Prevent reconnect chaos: cloud/LAN must not re-open this as a new KOT
              row.kitchenHandled = true;
              row.kitchenHandledAt = new Date().toISOString();
              row.manualFulfilled = true;
              row.skipKdsAlarm = true;
              await RS_DB.put('pending_orders', item.id, row);
              try {
                if (window.RSLanSync && typeof RSLanSync.pushRow === 'function') {RSLanSync.pushRow(row);}
              } catch (_) {}
              syncPendingOrders();
            }
          } catch (e) {
            console.warn('Failed updating KDS status', e);
            failed = true;
          }
        } else if (item && global.RS && Array.isArray(RS.KDS)) {
          // Local-only: drop ticket from board
          const idx = RS.KDS.indexOf(item);
          if (idx >= 0) {RS.KDS.splice(idx, 1);}
        }
        if (failed) {
          try { if (window.RSActionFeedback) {window.RSActionFeedback.error();} } catch(_) {}
          toast('Could not mark order ready — try again', 'fa-circle-exclamation');
          return;
        }
        const c = b.closest('.kds-card');
        if (c) {
          c.style.transition = 'all .4s var(--ease)';
          c.style.opacity = '0';
          c.style.transform = 'scale(.9)';
          setTimeout(() => {
            c.remove();
            // If board emptied, show proper empty state
            if (!$('#kds-grid .kds-card')) {
              try {
                renderKDS();
              } catch (e) {}
            }
          }, 400);
        }
        try { if (window.RSActionFeedback) {window.RSActionFeedback.success();} } catch(_) {}
        toast('Order ' + (item ? item.tok : '') + ' ready', 'fa-bell');
        // Settings → Order ready alerts (default OFF)
        try {
          const alertsOn =
            typeof global.RS_featureOn === 'function'
              ? global.RS_featureOn('set_order_ready_alerts', global.RS_SETTINGS, false)
              : global.RS_SETTINGS?.set_order_ready_alerts === true ||
                global.RS_SETTINGS?.set_order_ready_alerts === 'true';
          if (alertsOn && item) {
            const phone = String(item.phone || item.customerPhone || '').replace(/\D/g, '');
            if (phone.length >= 10 && global.RS_API && typeof RS_API.data === 'function') {
              const outlet =
                (global.RS_SETTINGS &&
                  (RS_SETTINGS.set_restaurant_name || RS_SETTINGS.set_outlet_name)) ||
                'our restaurant';
              const msg =
                'Hi! Your order ' +
                (item.tok || item.orderId || '') +
                ' is ready at ' +
                outlet +
                '. Please collect. Thank you!';
              RS_API.data({
                operation: 'gateway_send',
                phone: phone.length === 10 ? '91' + phone : phone,
                message: msg,
              }).catch((e) => console.warn('[kds] order ready WA', e && e.message));
            }
          }
        } catch (waReadyErr) {
          console.warn('[kds] order ready alert', waReadyErr);
        }
      })
    );
    $$('#kds-grid [data-eta]').forEach((b) =>
      b.addEventListener('click', async () => {
        const item = KDS[+b.dataset.eta];
        if (!item) {return;}
        let mins = b.dataset.mins;
        if (mins === 'custom') {
          const v = prompt('Prep time in minutes?', item.prepMinutes || '15');
          if (v == null) {return;}
          mins = parseInt(v, 10);
        } else {
          mins = parseInt(mins, 10);
        }
        if (!Number.isFinite(mins) || mins <= 0) {return;}
        item.prepMinutes = mins;
        item.prepStartedAt = new Date().toISOString();
        if (item.id && window.RS_DB) {
          try {
            const rows = await RS_DB.list('pending_orders');
            const row = rows.find((r) => r.id === item.id);
            if (row) {
              row.prepMinutes = mins;
              row.prepStartedAt = item.prepStartedAt;
              if (row.status === 'Pending Review' || row.status === 'Accepted') {row.status = 'preparing';}
              await RS_DB.put('pending_orders', item.id, row);
              if (typeof syncPendingOrders === 'function') {syncPendingOrders();}
            }
          } catch (e) {
            console.warn('set ETA failed', e);
            try { if (window.RSActionFeedback) {window.RSActionFeedback.error();} } catch(_) {}
            toast('Could not set prep time', 'fa-circle-exclamation');
            return;
          }
        }
        toast('ETA set: ' + mins + ' min', 'fa-clock');
        renderKDS();
      })
    );
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
      if (card) {
        card.classList.toggle('urgent', mins > 10);
        card.classList.toggle('aging', mins > 5 && mins <= 10);
      }
    });
  }

  if (!global.__rsKdsTickBound) {
    global.__rsKdsTickBound = true;
    setInterval(() => {
      const tab = document.getElementById('kds-tab');
      if (tab && tab.classList.contains('active')) {tickKDS();}
    }, 1000);
  }

  global.RSKdsUI = { renderKDS, tickKDS };
  function attach() {
    if (!global.RS) {return;}
    global.RS.renderKDS = renderKDS;
  }
  if (global.RS) {attach();}
  document.addEventListener('rs:ready', attach);
  document.addEventListener('rs:hydrated', () => {
    try {
      if (global.RSSkel && RSSkel.markHydrated) {RSSkel.markHydrated();}
      renderKDS();
    } catch (_) {}
  });
})(typeof window !== 'undefined' ? window : globalThis);
