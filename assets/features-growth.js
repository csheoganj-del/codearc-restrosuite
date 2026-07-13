/* ============================================================
   RestroSuite -- Growth Hub screens + parity tabs
   (Online aggregator orders, Customers/CRM, Floor & tables)
   ============================================================ */
(function(){
  'use strict';
  // HTML escaping -- prevents XSS when inserting DB-sourced strings into innerHTML
  const esc = v => String(v == null ? '' : v).replace(/[&<>"']/g, ch =>
    ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]));
  function boot(){
    const RS = window.RS, rs = RS.rs;
    const $ = (s,r=document)=>r.querySelector(s), $$=(s,r=document)=>[...r.querySelectorAll(s)];

    // Floor can load before POS — ensure RSModal exists (Edit Tables / table detail depend on it)
    if (!window.RSModal || typeof window.RSModal.open !== 'function') {
      window.RSModal = {
        open(opts) {
          const root =
            (RS && typeof RS.getModalRoot === 'function' && RS.getModalRoot()) ||
            document.body;
          const ov = document.createElement('div');
          ov.className = 'rs-overlay';
          const head =
            opts.title != null
              ? `<div class="rs-mhead">${opts.icon ? `<div class="mh-ic"><i class="fa-solid ${opts.icon}"></i></div>` : ''}<div><h3>${opts.title}</h3>${opts.sub ? `<div class="sub">${opts.sub}</div>` : ''}</div><button class="rs-mclose" aria-label="Close"><i class="fa-solid fa-xmark"></i></button></div>`
              : '';
          const body = opts.bare
            ? opts.body || ''
            : `<div class="rs-mbody ${opts.bodyClass || ''}">${opts.body || ''}</div>`;
          const foot = opts.foot ? `<div class="rs-mfoot">${opts.foot}</div>` : '';
          ov.innerHTML = `<div class="rs-modal ${opts.size || 'md'}">${head}${body}${foot}</div>`;
          root.appendChild(ov);
          const close = () => {
            ov.classList.remove('show');
            setTimeout(() => ov.remove(), 300);
            document.removeEventListener('keydown', esc);
          };
          const esc = (e) => {
            if (e.key === 'Escape') close();
          };
          ov.querySelector('.rs-mclose')?.addEventListener('click', close);
          ov.addEventListener('click', (e) => {
            if (e.target === ov && opts.dismissable !== false) close();
          });
          document.addEventListener('keydown', esc);
          setTimeout(() => ov.classList.add('show'), 20);
          if (opts.onMount) opts.onMount(ov.querySelector('.rs-modal'), close);
          return { el: ov, modal: ov.querySelector('.rs-modal'), close };
        },
      };
    }

    // Send a WhatsApp reservation confirmation to the guest. Uses the connected
    // gateway when it's ready (server-side, no staff action), otherwise falls
    // back to opening a pre-filled wa.me message the staff taps to send.
    async function sendReservationWhatsApp({ guestName, guestPhone, tableNumber, date, time, pax }) {
      const digits = String(guestPhone || '').replace(/\D/g, '');
      if (!digits || digits.length < 10) return; // no valid number -> skip silently
      let outlet = 'our restaurant';
      try {
        const s = (window.RS_DB ? await window.RS_DB.getSettings().catch(()=>null) : null) || window.RS_SETTINGS || {};
        outlet = s.set_restaurant_name || s.set_outlet_name || s.business_name || (s._raw && s._raw.business_name) || outlet;
      } catch(e) {}
      let niceDate = date;
      try { niceDate = new Date(date + 'T00:00:00').toLocaleDateString('en-IN', { weekday:'short', day:'2-digit', month:'short' }); } catch(e) {}
      const msg = `Hi ${guestName}, your table is reserved at ${outlet}. \n\n`
        + `Table: ${tableNumber}\n`
        + `Date: ${niceDate}\n`
        + `Time: ${time}\n`
        + `Guests: ${pax}\n\n`
        + `We look forward to serving you! Reply here if you need to change anything.`;
      if (window.__rsGatewayReady === true && window.RS_API && !window.RS_API.zeroCostLaunchMode && typeof window.RS_API.data === 'function') {
        try {
          await window.RS_API.data({ operation:'gateway_send', phone: digits, message: msg });
          RS.toast('WhatsApp confirmation sent to guest', 'fa-whatsapp');
          return;
        } catch(e) { /* fall through to link */ }
      }
      const waPhone = digits.length === 10 ? '91' + digits : digits;
      try { window.open(`https://wa.me/${waPhone}?text=${encodeURIComponent(msg)}`, '_blank', 'noopener,noreferrer'); } catch(e) {}
      RS.toast('WhatsApp message ready — tap send', 'fa-whatsapp');
    }

    /* ===================== FLOOR & TABLES ===================== */
    const DEFAULT_TABLES = [
      {n:'01',cap:2}, {n:'02',cap:4}, {n:'03',cap:4}, {n:'04',cap:2},
      {n:'05',cap:6}, {n:'06',cap:4}, {n:'07',cap:2}, {n:'08',cap:8},
      {n:'09',cap:4}, {n:'10',cap:2}, {n:'11',cap:4}, {n:'12',cap:6}
    ];
    let TABLES = [];

    async function loadTablesList() {
      try {
        const settings = window.RS_DB ? await window.RS_DB.getSettings().catch(() => null) : null;
        if (settings && Array.isArray(settings.custom_tables)) {
          // Empty array is intentional (user deleted all tables) — do not fall back to defaults
          return settings.custom_tables.map((t) => ({
            n: t.n != null ? t.n : t.name,
            name: t.name != null ? t.name : t.n,
            cap: Number(t.cap) > 0 ? Number(t.cap) : 4,
            state: t.state || 'free',
          }));
        }
      } catch(e) {
        console.warn("Failed to load custom tables from settings", e);
      }
      return DEFAULT_TABLES.map(t => ({ ...t, state: 'free' }));
    }

    const stateDot = {
      free: 'var(--green)',
      occupied: 'var(--orange)',
      pending: 'var(--amber)',
      held: '#f59e0b',
      billed: 'var(--violet-soft)',
    };
    const stateTxt = {
      free: 'Available',
      occupied: 'Dining',
      pending: 'QR pending',
      held: 'Held order',
      billed: 'Bill printed',
    };

    function tableNameLabel(n) {
      const raw = String(n == null ? '' : n).trim();
      if (!raw) return 'Table';
      if (/^table\s+/i.test(raw)) return raw.replace(/^table/i, 'Table');
      if (/^\d+$/.test(raw)) return `Table ${raw}`;
      return raw;
    }

    function matchTableOrder(row, t) {
      if (!row || !t) return false;
      const candidates = [
        `Table ${t.n}`,
        String(t.n),
        t.name,
        tableNameLabel(t.n),
        `0${parseInt(t.n, 10)}`,
      ].filter(Boolean).map(String);
      const tn = String(row.tableNumber || row.table || '').trim();
      if (!tn) return false;
      if (candidates.some((c) => c === tn || c.toLowerCase() === tn.toLowerCase())) return true;
      const dig = (v) => parseInt(String(v == null ? '' : v).replace(/\D/g, ''), 10);
      const a = dig(t.n);
      const b = dig(tn);
      return Number.isFinite(a) && Number.isFinite(b) && a === b;
    }

    function orderItemsForPos(row) {
      return (row && row.items ? row.items : []).map((it) => {
        if (Array.isArray(it)) {
          const label = String(it[0] || 'Item').replace(/^\s*\d+\s*[×x]\s*/i, '').trim() || 'Item';
          return { id: label, name: label, qty: 1, price: Number(it[1] || 0), cat: 'Floor', stock: 'ok' };
        }
        return {
          id: it.id || it.name,
          name: it.name || 'Item',
          qty: Math.max(1, Number(it.qty || 1)),
          price: Number(it.price || 0),
          cat: it.cat || it.category || 'Floor',
          stock: 'ok',
          taxCategory: it.taxCategory || it.tax_category,
          notes: it.notes || '',
        };
      }).filter((i) => i.name);
    }

    const ACTIVE_ORDER_STATUSES = [
      'DineIn Active',
      'Accepted',
      'preparing',
      'Pending Review',
      'Billed',
      'Ready',
      'served',
    ];

    function matchDraftToTable(draft, t) {
      if (!draft || !t) return false;
      const raw =
        draft.draftName ||
        draft.name ||
        draft.table ||
        draft.tableNumber ||
        draft.tableName ||
        '';
      return matchTableOrder({ tableNumber: raw, table: raw }, t);
    }

    function collectActiveOrders(rows, t) {
      return (rows || []).filter(
        (r) => matchTableOrder(r, t) && ACTIVE_ORDER_STATUSES.includes(r.status)
      );
    }

    function orderItemCount(row) {
      if (!row || !Array.isArray(row.items)) return 0;
      return row.items.reduce((n, it) => {
        if (Array.isArray(it)) return n + 1;
        return n + Math.max(1, Number(it.qty || 1));
      }, 0);
    }

    function aggregateTableOrders(orders) {
      if (!orders || !orders.length) return null;
      let total = 0;
      let itemCount = 0;
      let guest = '';
      let earliest = null;
      let primary = orders[0];
      const ids = [];
      let hasBilled = false;
      let hasPending = false;
      orders.forEach((o) => {
        ids.push(o.id);
        total += Number(o.total) || 0;
        itemCount += orderItemCount(o);
        if (!guest && o.customerName) guest = o.customerName;
        const ts = parseLocalTimestamp(o.dateTime || o.createdAt || o.time);
        if (ts && (earliest == null || ts < earliest)) {
          earliest = ts;
          primary = o;
        }
        if (o.status === 'Billed') {
          hasBilled = true;
          primary = o;
        }
        if (o.status === 'Pending Review') hasPending = true;
      });
      let state = 'occupied';
      if (hasBilled) state = 'billed';
      else if (hasPending) state = 'pending';
      return {
        state,
        total,
        itemCount,
        guest,
        since: earliest ? getElapsedDesc(new Date(earliest).toISOString()) : 'just now',
        primaryId: primary && primary.id,
        orderId: primary && (primary.orderId || primary.id),
        orderStatus:
          orders.length > 1
            ? orders.length + ' open tickets'
            : (primary && primary.status) || '',
        ids,
        orders,
      };
    }

    function draftTotals(draft) {
      if (!draft) return { total: 0, itemCount: 0 };
      const items = draft.items || [];
      const itemCount = items.reduce((n, it) => n + Math.max(1, Number(it.qty || 1)), 0);
      let total = Number(draft.total);
      if (!Number.isFinite(total) || total <= 0) {
        total = items.reduce(
          (s, it) => s + Math.max(1, Number(it.qty || 1)) * (Number(it.price) || 0),
          0
        );
      }
      return { total, itemCount };
    }

    /** Create (or reuse) a DineIn Active row so the floor shows Dining right after seat. */
    async function ensureSeatedPendingOrder(t, opts) {
      const options = opts || {};
      if (!window.RS_DB || !t) return null;
      try {
        const rows = await RS_DB.list('pending_orders');
        const existing = collectActiveOrders(rows, t);
        if (existing.length) return existing[0];
        const tableLabel = tableNameLabel(t.n || t.name);
        const id =
          'seat_' + Date.now() + '_' + Math.random().toString(36).slice(2, 7);
        const guest =
          options.guest ||
          (t.reservedInfo && (t.reservedInfo.guestName || t.reservedInfo.name)) ||
          '';
        const row = {
          id,
          orderId: id,
          tableNumber: tableLabel,
          table: tableLabel,
          status: 'DineIn Active',
          items: [],
          total: 0,
          customerName: guest,
          customerPhone: '',
          covers: Number(options.covers || t.cap) || 0,
          dateTime: new Date().toISOString(),
          source: 'floor_seat',
        };
        await RS_DB.put('pending_orders', id, row);
        try {
          document.dispatchEvent(new Event('rs:tables-updated'));
        } catch (_) {}
        return row;
      } catch (e) {
        console.warn('ensureSeatedPendingOrder failed', e);
        return null;
      }
    }

    /** Free a table: remove open tickets + matching holds + close QR. */
    async function clearTable(t, opts) {
      const options = opts || {};
      if (!t || !window.RS_DB) {
        if (!options.silent) RS.toast('Cannot clear table right now', 'fa-circle-exclamation');
        return false;
      }
      const label = tableNameLabel(t.n || t.name);
      if (
        !options.force &&
        !confirm(
          'Free Table ' +
            (t.n || t.name) +
            '?\n\nOpen orders and held carts for this table will be removed. This cannot be undone.'
        )
      ) {
        return false;
      }
      try {
        const rows = await RS_DB.list('pending_orders').catch(() => []);
        const active = collectActiveOrders(rows, t);
        for (const o of active) {
          await RS_DB.del('pending_orders', o.id).catch(() => {});
        }
        const drafts = await RS_DB.list('drafts').catch(() => []);
        for (const d of drafts || []) {
          if (matchDraftToTable(d, t)) {
            await RS_DB.del('drafts', d.id).catch(() => {});
          }
        }
        await closeTableQrSessionOnSettle(t.n || t.name);
        if (!options.skipSync && window.RS_SYNC && RS_SYNC.syncPendingOrders) {
          try {
            await RS_SYNC.syncPendingOrders({ forceCloud: true });
          } catch (_) {}
        }
        if (!options.silent) {
          RS.toast(label + ' is free', 'fa-chair');
          try {
            document.dispatchEvent(new Event('rs:tables-updated'));
          } catch (_) {}
          renderFloor();
        }
        return true;
      } catch (e) {
        console.warn('clearTable failed', e);
        if (!options.silent) RS.toast('Could not free table', 'fa-circle-exclamation');
        return false;
      }
    }

    /** Free every non-available table (dining / seated / held / billed / QR pending). */
    async function clearAllOpenTables() {
      if (!window.RS_DB) {
        RS.toast('Cannot clear tables right now', 'fa-circle-exclamation');
        return false;
      }
      const open = (TABLES || []).filter((t) => t && t.state && t.state !== 'free');
      if (!open.length) {
        RS.toast('All tables are already free', 'fa-chair');
        return true;
      }
      const names = open
        .map((t) => t.n || t.name)
        .slice(0, 8)
        .join(', ');
      const more = open.length > 8 ? '…' : '';
      const msg1 =
        'Clear ALL open tables?\n\n' +
        open.length +
        ' table(s): ' +
        names +
        more +
        '\n\nThis removes open orders, held carts, and closes QR sessions on those tables.\n\nThis cannot be undone.';
      if (!confirm(msg1)) return false;
      const msg2 =
        'Final confirm: free ' +
        open.length +
        ' open table(s)?\n\nType-level check: only click OK if service is ending or you meant to wipe the floor.';
      if (!confirm(msg2)) return false;

      let okN = 0;
      let failN = 0;
      for (const t of open) {
        const ok = await clearTable(t, { force: true, silent: true, skipSync: true });
        if (ok) okN++;
        else failN++;
      }
      if (window.RS_SYNC && RS_SYNC.syncPendingOrders) {
        try {
          await RS_SYNC.syncPendingOrders({ forceCloud: true });
        } catch (_) {}
      }
      try {
        document.dispatchEvent(new Event('rs:tables-updated'));
      } catch (_) {}
      renderFloor();
      if (failN) {
        RS.toast(okN + ' freed, ' + failN + ' failed', 'fa-circle-exclamation');
      } else {
        RS.toast(okN + ' table' + (okN === 1 ? '' : 's') + ' freed', 'fa-broom');
      }
      return failN === 0;
    }

    async function printTableBill(t) {
      if (!t) return;
      try {
        let items = [];
        let grand = Number(t.amt) || 0;
        let guest = t.guest || '';
        if (window.RS_DB && t.dbIds && t.dbIds.length) {
          const rows = await RS_DB.list('pending_orders');
          const mine = (rows || []).filter((r) => t.dbIds.includes(r.id));
          mine.forEach((r) => {
            items = items.concat(orderItemsForPos(r));
            if (!guest && r.customerName) guest = r.customerName;
          });
          if (!grand) grand = mine.reduce((s, r) => s + (Number(r.total) || 0), 0);
        } else if (t.draft && t.draft.items) {
          items = orderItemsForPos(t.draft);
          grand = draftTotals(t.draft).total;
          guest = t.draft.customerName || guest;
        }
        if (!items.length && !grand) {
          RS.toast('Nothing to print yet — add items first', 'fa-file-invoice');
          return;
        }
        const bill = {
          no: t.orderId || 'T-' + (t.n || ''),
          orderId: t.orderId,
          table: tableNameLabel(t.n),
          tableNumber: tableNameLabel(t.n),
          customer: guest,
          customerName: guest,
          items,
          _items: items,
          grand,
          total: grand,
          amount: grand,
          time: new Date().toLocaleString('en-IN'),
        };
        if (window.RSReceiptEngine && typeof RSReceiptEngine.toPDF === 'function') {
          const dataUri = await RSReceiptEngine.toPDF(bill);
          const w = window.open('', '_blank');
          if (w) {
            w.document.write(
              '<html><head><title>Bill ' +
                esc(bill.no) +
                '</title></head><body style="margin:0;display:flex;justify-content:center;background:#333">' +
                '<iframe src="' +
                dataUri +
                '" style="width:100%;height:100vh;border:0"></iframe></body></html>'
            );
            w.document.close();
          }
          RS.toast('Bill ready to print', 'fa-print');
          return;
        }
        // Fallback: open POS checkout
        await openTableInPos(t, {
          loadOrder: true,
          toast: 'Table ' + t.n + ' loaded — use Print on checkout',
          icon: 'fa-print',
        });
      } catch (e) {
        console.warn('printTableBill', e);
        RS.toast('Could not print bill', 'fa-circle-exclamation');
      }
    }

    function setPosDineIn() {
      const btns = document.querySelectorAll('.order-type-btn');
      let dine = null;
      btns.forEach((b) => {
        const t = (b.textContent || '').trim().toLowerCase();
        if (t.includes('dine')) dine = b;
      });
      if (dine) {
        btns.forEach((b) => b.classList.remove('active'));
        dine.classList.add('active');
        dine.click();
      }
    }

    /** Normalize table key the same way tenant-public edge function does. */
    function normTableKey(raw) {
      let key = String(raw == null ? '' : raw)
        .trim()
        .toLowerCase();
      if (!key) return '';
      key = key.replace(/\btable\b|\btbl\b/g, '').replace(/[^a-z0-9]/g, '');
      if (/^t\d+$/.test(key)) key = key.slice(1);
      if (/^\d+$/.test(key)) key = String(parseInt(key, 10));
      return key;
    }

    /**
     * Ensure guests can order the moment staff seats a table.
     * Without this, printed QR scans hit “session closed” — the #1 guest CX fail.
     */
    async function ensureTableQrSession(tableN, opts) {
      const options = opts || {};
      if (!window.RS_DB) return false;
      const key = normTableKey(tableN);
      if (!key) return false;
      try {
        const sessions = await RS_DB.list('table_sessions').catch(() => []);
        let session = (sessions || []).find((s) => normTableKey(s.tableNumber) === key);
        if (session && session.status === 'active') {
          if (options.toast) RS.toast('QR ordering already open for this table', 'fa-qrcode');
          return true;
        }
        if (session && session.status === 'paused') {
          await RS_DB.put('table_sessions', session.id, { ...session, status: 'active' });
          if (options.toast !== false) RS.toast('QR ordering resumed for Table ' + tableN, 'fa-qrcode');
          document.dispatchEvent(new Event('rs:tables-updated'));
          return true;
        }
        const randomToken =
          Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 15);
        const updatedSess = {
          tableNumber: key,
          token: randomToken,
          status: 'active',
          createdAt: new Date().toISOString(),
        };
        if (session && session.id) updatedSess.id = session.id;
        const saved = await RS_DB.put('table_sessions', session && session.id, updatedSess);
        if (options.toast !== false) {
          RS.toast('QR ordering open · guests can scan Table ' + tableN, 'fa-qrcode');
        }
        document.dispatchEvent(new Event('rs:tables-updated'));
        return !!(saved || true);
      } catch (e) {
        console.warn('ensureTableQrSession failed', e);
        return false;
      }
    }

    /** Close guest QR ordering for one table (does not free bills / POS tickets). */
    async function closeTableQrSession(tableN, opts) {
      const options = opts || {};
      if (!window.RS_DB) return false;
      const key = normTableKey(tableN);
      if (!key) return false;
      try {
        const sessions = await RS_DB.list('table_sessions').catch(() => []);
        const openOnes = (sessions || []).filter(
          (s) =>
            normTableKey(s.tableNumber) === key &&
            s.status !== 'closed'
        );
        if (!openOnes.length) {
          if (options.toast) RS.toast('QR already closed for Table ' + tableN, 'fa-qrcode');
          return true; // already closed counts as success
        }
        for (const sess of openOnes) {
          await RS_DB.put('table_sessions', sess.id, {
            ...sess,
            status: 'closed',
            closedAt: new Date().toISOString(),
          });
        }
        if (options.toast !== false && !options.silent) {
          RS.toast('QR closed for Table ' + tableN, 'fa-power-off');
        }
        if (!options.silent) {
          try {
            document.dispatchEvent(new Event('rs:tables-updated'));
          } catch (_) {}
        }
        return true;
      } catch (e) {
        console.warn('closeTableQrSession failed', e);
        return false;
      }
    }

    /**
     * Bulk open/close QR for every floor table with progress + fail detail.
     * @param {'open'|'close'} mode
     */
    async function bulkTableQrSessions(mode, btn) {
      if (!TABLES.length) {
        RS.toast('Add tables first', 'fa-chair');
        return;
      }
      if (!window.RS_DB) {
        RS.toast('Database not ready — try again', 'fa-circle-exclamation');
        return;
      }
      const isOpen = mode === 'open';
      const total = TABLES.length;
      const verb = isOpen ? 'Open' : 'Close';
      const confirmMsg = isOpen
        ? 'Open QR ordering on all ' +
          total +
          ' tables?\n\nGuests can scan and order at every table until you close QR or free the table.'
        : 'Close QR ordering on all ' +
          total +
          ' tables?\n\nGuests will not be able to place new QR orders until you open QR again.\n\nBills and seated tables stay as they are.';
      if (!window.confirm(confirmMsg)) return;

      const labelHtml = btn ? btn.innerHTML : '';
      if (btn) {
        btn.disabled = true;
        btn.innerHTML =
          '<i class="fa-solid fa-spinner fa-spin"></i> ' + (isOpen ? 'Opening' : 'Closing') + ' 0/' + total;
      }

      let okN = 0;
      let failN = 0;
      const failedNames = [];
      for (let i = 0; i < TABLES.length; i++) {
        const t = TABLES[i];
        const name = t.n || t.name || String(i + 1);
        if (btn) {
          btn.innerHTML =
            '<i class="fa-solid fa-spinner fa-spin"></i> ' +
            (isOpen ? 'Opening' : 'Closing') +
            ' ' +
            (i + 1) +
            '/' +
            total;
        }
        let ok = false;
        try {
          ok = isOpen
            ? await ensureTableQrSession(name, { toast: false })
            : await closeTableQrSession(name, { toast: false, silent: true });
        } catch (_) {
          ok = false;
        }
        if (ok) okN++;
        else {
          failN++;
          if (failedNames.length < 6) failedNames.push(String(name));
        }
      }

      try {
        document.dispatchEvent(new Event('rs:tables-updated'));
      } catch (_) {}
      renderFloor();

      if (failN === 0) {
        RS.toast(
          isOpen
            ? 'QR open on all ' + okN + ' tables — guests can scan'
            : 'QR closed on all ' + okN + ' tables',
          isOpen ? 'fa-qrcode' : 'fa-power-off'
        );
      } else {
        RS.toast(
          (isOpen ? 'Opened ' : 'Closed ') +
            okN +
            '/' +
            total +
            (failedNames.length ? ' · failed: ' + failedNames.join(', ') : '') +
            (failN > failedNames.length ? '…' : ''),
          'fa-circle-exclamation'
        );
      }
      // Button HTML restored by renderFloor rebuild
      if (btn && document.body.contains(btn)) {
        btn.disabled = false;
        btn.innerHTML = labelHtml;
      }
    }

    async function openTableInPos(t, opts) {
      const options = opts || {};
      const tableLabel = tableNameLabel(t.n || t.name);

      // Honest occupancy: seat creates a live DineIn Active ticket immediately
      if (options.seat && window.RS_DB) {
        try {
          const seated = await ensureSeatedPendingOrder(t, {
            guest: options.guest,
            covers: options.covers || t.cap,
          });
          if (seated) {
            t.dbId = seated.id;
            t.dbIds = [seated.id];
            t.state = 'occupied';
            t.orderStatus = seated.status;
          }
        } catch (e) {
          console.warn('seat ensure failed', e);
        }
      }

      if (options.openQrSession !== false) {
        try {
          await ensureTableQrSession(t.n || t.name, { toast: !!options.seat });
        } catch (e) {}
      }
      if (RS.activateTab) await RS.activateTab('pos-tab');
      await new Promise((r) => setTimeout(r, 120));
      let attempts = 0;
      while (attempts < 8 && !(typeof RS.setCart === 'function')) {
        await new Promise((r) => setTimeout(r, 60));
        attempts += 1;
      }
      setPosDineIn();
      const tableSelect =
        document.getElementById('cart-table') ||
        document.getElementById('pos-table-select') ||
        document.querySelector('#pos-tab select[name="table"]');
      if (tableSelect) {
        let opt = [...tableSelect.options].find(
          (o) =>
            o.value === tableLabel ||
            o.text === tableLabel ||
            o.value === String(t.n) ||
            o.textContent.trim() === tableLabel ||
            o.value === `Table ${t.n}`
        );
        if (!opt) {
          opt = document.createElement('option');
          opt.value = tableLabel;
          opt.textContent = tableLabel;
          tableSelect.appendChild(opt);
        }
        tableSelect.value = opt.value;
        tableSelect.dispatchEvent(new Event('change', { bubbles: true }));
        tableSelect.dispatchEvent(new Event('input', { bubbles: true }));
      }
      if (typeof RS.setTable === 'function') {
        try {
          RS.setTable(tableLabel);
        } catch (e) {}
      }

      let items = options.items || null;
      let loadedGuest = { name: '', phone: '' };

      // Held cart resume from drafts
      if (!items && options.loadOrder && (t.state === 'held' || t.draftId || t.draft) && window.RS_DB) {
        try {
          const drafts = await RS_DB.list('drafts').catch(() => []);
          const draft =
            (t.draftId && (drafts || []).find((d) => String(d.id) === String(t.draftId))) ||
            (drafts || []).find((d) => matchDraftToTable(d, t)) ||
            t.draft;
          if (draft) {
            items = orderItemsForPos(draft);
            loadedGuest.name = draft.customerName || '';
            loadedGuest.phone = draft.customerPhone || '';
            t.draftId = draft.id;
          }
        } catch (e) {
          console.warn('openTableInPos load draft failed', e);
        }
      }

      // Multi-ticket: merge all open pending orders for this table
      if (!items && options.loadOrder && window.RS_DB) {
        try {
          const rows = await RS_DB.list('pending_orders');
          let mine = [];
          if (t.dbIds && t.dbIds.length) {
            mine = (rows || []).filter((r) => t.dbIds.includes(r.id));
          }
          if (!mine.length) {
            mine = collectActiveOrders(rows, t);
          }
          if (mine.length) {
            items = [];
            mine.forEach((row) => {
              items = items.concat(orderItemsForPos(row));
              if (!loadedGuest.name && row.customerName) loadedGuest.name = row.customerName;
              if (!loadedGuest.phone && row.customerPhone) loadedGuest.phone = row.customerPhone;
            });
            const rowCovers = Math.max(
              0,
              ...mine.map((r) => Number(r.covers != null ? r.covers : r.pax) || 0)
            );
            if (rowCovers && typeof RS.setCovers === 'function') RS.setCovers(rowCovers);
          }
        } catch (e) {
          console.warn('openTableInPos load order failed', e);
        }
      }

      if (loadedGuest.name || loadedGuest.phone) {
        const nameEl = document.getElementById('cust-name') || document.getElementById('cust-input-name');
        const phoneEl = document.getElementById('cust-phone') || document.getElementById('cust-input-phone');
        if (nameEl && loadedGuest.name) {
          nameEl.value = loadedGuest.name;
          nameEl.dispatchEvent(new Event('input', { bubbles: true }));
        }
        if (phoneEl && loadedGuest.phone) {
          phoneEl.value = loadedGuest.phone;
          phoneEl.dispatchEvent(new Event('input', { bubbles: true }));
        }
      }

      if (items && items.length && typeof RS.setCart === 'function') {
        RS.setCart(items);
      }
      try {
        const resPax =
          (t.reservedInfo && (t.reservedInfo.pax || t.reservedInfo.covers)) ||
          options.covers ||
          options.pax ||
          0;
        const cap = Number(t.cap) || 0;
        const pref = Math.max(0, Number(resPax) || 0) || 0;
        if (typeof RS.setCovers === 'function') {
          const current = typeof RS.getCovers === 'function' ? RS.getCovers() : 0;
          if (!current && (pref || (options.seat && cap))) {
            RS.setCovers(pref || cap || 0);
          }
        }
      } catch (e) {}
      try {
        if (typeof RS.renderCart === 'function') RS.renderCart();
      } catch (e) {}
      try {
        if (typeof window.saveActiveCart === 'function') window.saveActiveCart();
      } catch (e) {}
      try {
        document.dispatchEvent(new Event('rs:tables-updated'));
      } catch (_) {}
      const msg =
        options.toast ||
        (items && items.length
          ? `Table ${t.n} loaded · ${items.length} item(s)`
          : options.seat
            ? `Table ${t.n} seated · QR ordering on`
            : `Table ${t.n} selected on POS`);
      RS.toast(msg, options.icon || 'fa-cash-register');
    }

    async function transferTable(fromTable, toTableN) {
      if (!fromTable || !toTableN || !window.RS_DB) {
        RS.toast('Nothing to transfer', 'fa-circle-exclamation');
        return false;
      }
      try {
        const rows = await RS_DB.list('pending_orders');
        let mine = collectActiveOrders(rows, fromTable);
        if (!mine.length && fromTable.dbId) {
          const one = rows.find((r) => r.id === fromTable.dbId);
          if (one) mine = [one];
        }
        if (!mine.length) {
          RS.toast('Open order not found', 'fa-circle-exclamation');
          return false;
        }
        const destLabel = tableNameLabel(toTableN);
        for (const row of mine) {
          row.tableNumber = destLabel;
          row.table = destLabel;
          await RS_DB.put('pending_orders', row.id, row);
        }
        // Move matching holds
        try {
          const drafts = await RS_DB.list('drafts').catch(() => []);
          for (const d of drafts || []) {
            if (matchDraftToTable(d, fromTable)) {
              await RS_DB.put('drafts', d.id, {
                ...d,
                draftName: destLabel,
                name: destLabel,
                table: destLabel,
                tableNumber: destLabel,
              });
            }
          }
        } catch (_) {}
        try {
          const sessions = await RS_DB.list('table_sessions').catch(() => []);
          const fromKey = normTableKey(fromTable.n);
          const sessList = (sessions || []).filter(
            (s) => normTableKey(s.tableNumber) === fromKey && s.status !== 'closed'
          );
          for (const sess of sessList) {
            await RS_DB.put('table_sessions', sess.id, {
              ...sess,
              tableNumber: normTableKey(toTableN),
            });
          }
        } catch (e) {}
        if (window.RS_SYNC && RS_SYNC.syncPendingOrders) {
          await RS_SYNC.syncPendingOrders({ forceCloud: true });
        }
        RS.toast(`Moved Table ${fromTable.n} → ${toTableN}`, 'fa-right-left');
        try {
          document.dispatchEvent(new Event('rs:tables-updated'));
        } catch (_) {}
        renderFloor();
        return true;
      } catch (e) {
        console.warn('transferTable failed', e);
        RS.toast('Transfer failed', 'fa-circle-exclamation');
        return false;
      }
    }

    function parseLocalTimestamp(dateStr) {
      if (!dateStr) return null;
      const nativeTime = new Date(dateStr).getTime();
      if (!Number.isNaN(nativeTime)) return nativeTime;
      const m = String(dateStr).trim().match(/^(\d{1,2})\/(\d{1,2})\/(\d{4}),?\s+(\d{1,2}):(\d{2})(?::(\d{2}))?\s*([ap]m)?$/i);
      if (!m) return null;
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
    function getElapsedDesc(dateStr) {
      const ts = parseLocalTimestamp(dateStr);
      if (!ts) return 'just now';
      const elapsed = Date.now() - ts;
      const mins = Math.floor(elapsed / 60000);
      if (mins < 1) return 'just now';
      if (mins < 60) return `${mins}m`;
      const hrs = Math.floor(mins / 60);
      return `${hrs}h ${mins % 60}m`;
    }

    async function renderFloor(){
      const sec = $('#floor-tab');
      if(!sec) return;
      
      TABLES = await loadTablesList();
      
      if (window.RS_DB) {
        sec.innerHTML = '<div class="sr-empty">Loading tables...</div>';
        Promise.all([
          RS_DB.list('pending_orders'),
          RS_DB.list('reservations').catch(() => []),
          RS_DB.list('drafts').catch(() => []),
        ]).then(([rows, reservations, drafts]) => {
          const _resToday = new Date().toISOString().slice(0, 10);
          const _resDigits = (v) => parseInt(String(v == null ? '' : v).replace(/\D/g, ''), 10);
          const heldTableSet = new Set();
          (drafts || []).forEach((d) => {
            const tbl = d && (d.table || d.tableNumber || d.draftName);
            if (tbl) heldTableSet.add(String(tbl).toLowerCase());
          });
          try {
            // POS in-memory dine-in holds (if module already booted)
            if (window.__rsHeldOrderTables && Array.isArray(window.__rsHeldOrderTables)) {
              window.__rsHeldOrderTables.forEach((x) => heldTableSet.add(String(x).toLowerCase()));
            }
          } catch (e) {}

          TABLES.forEach((t) => {
            const activeOrders = collectActiveOrders(rows, t);
            // Tickets with real items/value vs empty seat placeholders
            const meatyOrders = activeOrders.filter(
              (o) => orderItemCount(o) > 0 || Number(o.total) > 0
            );
            const emptySeatOrders = activeOrders.filter(
              (o) => orderItemCount(o) <= 0 && !(Number(o.total) > 0)
            );
            const matchedDraft = (drafts || []).find((d) => matchDraftToTable(d, t));
            const labelCandidates = [`table ${t.n}`, String(t.n), tableNameLabel(t.n), t.name]
              .filter(Boolean)
              .map((s) => String(s).toLowerCase());
            const isHeldFlag = labelCandidates.some(
              (c) => heldTableSet.has(c) || [...heldTableSet].some((h) => h.includes(c) || c.includes(h))
            );

            t.dbIds = [];
            t.draft = null;
            t.draftId = null;
            t.ticketCount = 0;
            t.emptySeat = false;

            // Prefer held draft when only empty seat ticket(s) remain (Hold after Seat)
            if (matchedDraft || isHeldFlag) {
              if (!meatyOrders.length) {
                const d = matchedDraft || null;
                const tot = draftTotals(d);
                t.state = 'held';
                t.amt = tot.total;
                t.since = d && d.time ? String(d.time) : 'Held';
                t.orderId = d && (d.draftId || d.id);
                t.dbId = null;
                t.draft = d;
                t.draftId = d && d.id;
                t.guest = (d && d.customerName) || '';
                t.itemCount = tot.itemCount;
                t.orderStatus = 'Held';
              } else {
                // Has real kitchen tickets AND a hold — show dining with meaty orders
                const agg = aggregateTableOrders(meatyOrders);
                t.state = agg.state;
                t.amt = agg.total;
                t.since = agg.since;
                t.orderId = agg.orderId;
                t.dbId = agg.primaryId;
                t.dbIds = agg.ids;
                t.guest = agg.guest;
                t.itemCount = agg.itemCount;
                t.orderStatus = agg.orderStatus;
                t.ticketCount = meatyOrders.length;
              }
            } else if (meatyOrders.length) {
              const agg = aggregateTableOrders(meatyOrders);
              t.state = agg.state;
              t.amt = agg.total;
              t.since = agg.since;
              t.orderId = agg.orderId;
              t.dbId = agg.primaryId;
              t.dbIds = agg.ids;
              t.guest = agg.guest;
              t.itemCount = agg.itemCount;
              t.orderStatus = agg.orderStatus;
              t.ticketCount = meatyOrders.length;
            } else if (emptySeatOrders.length) {
              // Seated, no items yet (honest occupancy)
              const primary = emptySeatOrders[0];
              t.state = 'occupied';
              t.emptySeat = true;
              t.amt = 0;
              t.since = primary.dateTime ? getElapsedDesc(primary.dateTime) : 'just now';
              t.orderId = primary.orderId || primary.id;
              t.dbId = primary.id;
              t.dbIds = emptySeatOrders.map((o) => o.id);
              t.guest = primary.customerName || '';
              t.itemCount = 0;
              t.orderStatus = 'Seated';
              t.ticketCount = emptySeatOrders.length;
            } else {
              t.state = 'free';
              t.amt = 0;
              t.since = '';
              t.orderId = null;
              t.dbId = null;
              t.guest = '';
              t.itemCount = 0;
              t.orderStatus = null;
            }
            t.reservedInfo =
              t.state === 'free'
                ? reservations.find(
                    (rv) =>
                      rv &&
                      (rv.status === 'confirmed' || rv.status === 'booked' || rv.status === 'pending') &&
                      (!rv.date || rv.date === _resToday) &&
                      _resDigits(rv.tableNumber) === _resDigits(t.n)
                  ) || null
                : null;
          });
          drawFloorUI(sec);
        }).catch((e) => {
          console.warn('Failed loading floor tables from DB', e);
          drawFloorUI(sec);
        });
      } else {
        drawFloorUI(sec);
      }
    }

    function drawFloorUI(sec) {
      const free = TABLES.filter((t) => t.state === 'free').length;
      const dining = TABLES.filter((t) => t.state === 'occupied' || t.state === 'pending').length;
      const billed = TABLES.filter((t) => t.state === 'billed').length;
      const pendingQr = TABLES.filter((t) => t.state === 'pending').length;
      sec.innerHTML = `
        <div class="stat-row">
          <div class="stat-card"><div class="stat-ic bg-g"><i class="fa-solid fa-chair"></i></div><div><div class="sv">${free}</div><div class="sl">Free tables</div></div></div>
          <div class="stat-card"><div class="stat-ic bg-o"><i class="fa-solid fa-utensils"></i></div><div><div class="sv">${dining}</div><div class="sl">Dining now</div></div></div>
          <div class="stat-card"><div class="stat-ic bg-v"><i class="fa-solid fa-file-invoice"></i></div><div><div class="sv">${billed}</div><div class="sl">Awaiting payment</div></div></div>
          <div class="stat-card"><div class="stat-ic bg-a"><i class="fa-solid fa-coins"></i></div><div><div class="sv">${rs(TABLES.reduce((a, t) => a + (t.amt || 0), 0))}</div><div class="sl">Open table value${pendingQr ? ' · ' + pendingQr + ' QR' : ''}</div></div></div>
        </div>
        <div class="toolbar-row"><div class="floor-legend">
          <span class="lg"><span class="sw" style="background:var(--green)"></span> Available</span>
          <span class="lg"><span class="sw" style="background:var(--orange)"></span> Dining</span>
          <span class="lg"><span class="sw" style="background:var(--amber)"></span> QR pending</span>
          <span class="lg"><span class="sw" style="background:#f59e0b"></span> Held</span>
          <span class="lg"><span class="sw" style="background:var(--violet-soft)"></span> Bill printed</span>
        </div><div class="grow"></div><button class="btn btn-ghost btn-sm" id="btn-refresh-floor" style="margin-right:8px;" title="Refresh floor"><i class="fa-solid fa-rotate"></i></button><button class="btn btn-ghost btn-sm" id="btn-open-all-qr" style="margin-right:8px;" title="Open guest QR ordering on every table"><i class="fa-solid fa-qrcode"></i> Open all QR</button><button class="btn btn-ghost btn-sm" id="btn-close-all-qr" style="margin-right:8px;" title="Close guest QR ordering on every table"><i class="fa-solid fa-power-off"></i> Close all QR</button><button class="btn btn-ghost btn-sm" id="btn-clear-all-tables" style="margin-right:8px;color:var(--red)" title="Free every dining, held, or billed table"><i class="fa-solid fa-broom"></i> Clear all open</button><button class="btn btn-ghost btn-sm" id="btn-manage-seating" style="margin-right:8px;"><i class="fa-solid fa-chair"></i> Edit Tables</button><button class="btn btn-ghost btn-sm" id="btn-print-floor-qrs" style="margin-right:8px;"><i class="fa-solid fa-print"></i> Print Table QRs</button><span class="pill" title="Live floor status"><i class="fa-solid fa-location-dot"></i> ${TABLES.length} tables</span></div>
        <div class="floor-grid">${TABLES.length ? TABLES.map(
          (t) => `
          <div class="table-card ${t.state}${t.state === 'pending' ? ' needs-attention' : ''}${t.state === 'occupied' && t.since && /h\s/.test(String(t.since)) ? ' table-long' : ''}" data-n="${esc(t.n)}" role="button" tabindex="0" aria-label="Table ${esc(t.n)} · ${esc(stateTxt[t.state] || t.state)}">
            <span class="tdot" style="background:${stateDot[t.state] || stateDot.free}"></span>
            ${t.state === 'held' ? '<span class="table-held-badge"><i class="fa-solid fa-pause"></i> Held</span>' : ''}
            ${t.state === 'pending' ? '<span class="table-held-badge table-qr-badge"><i class="fa-solid fa-qrcode"></i> New</span>' : ''}
            <div class="tnum2">Table ${esc(t.name || t.n)}</div><div class="tcap"><i class="fa-solid fa-user-group" style="font-size:10px"></i> ${esc(t.cap)} seats</div>
            <div class="tstate">${
              t.state === 'held'
                ? 'Held'
                : t.emptySeat
                  ? 'Seated'
                  : (stateTxt[t.state] || t.state)
            }${(t.state === 'free' && t.reservedInfo) ? ` · <span style="color:#b45309;font-weight:700">Reserved ${esc(t.reservedInfo.time || '')}${t.reservedInfo.guestName ? ' · ' + esc(t.reservedInfo.guestName) : ''}</span>` : ''}${t.guest && String(t.guest).toLowerCase() !== 'guest' ? ` · ${esc(t.guest)}` : ''}</div>
            ${
              t.state === 'free'
                ? '<div class="tcap" style="margin-top:auto">Tap to seat</div>'
                : t.state === 'held'
                  ? `<div class="tamt">${rs(t.amt || 0)}</div><div class="tcap">${t.itemCount ? t.itemCount + ' items · ' : ''}Resume hold</div>`
                  : t.emptySeat
                    ? `<div class="tcap" style="margin-top:auto">${esc(t.since || 'just now')} · add items</div>`
                    : `<div class="tamt">${rs(t.amt || 0)}</div><div class="tcap">${esc(t.since || '')}${t.itemCount ? ' · ' + t.itemCount + ' items' : ''}${t.ticketCount > 1 ? ' · ' + t.ticketCount + ' tickets' : ''}</div>`
            }
          </div>`
        ).join('') : `<div class="sr-empty" style="grid-column:1/-1;padding:40px 20px"><i class="fa-solid fa-chair" style="font-size:24px;opacity:.4;display:block;margin-bottom:8px"></i><div style="font-weight:700;margin-bottom:4px">No tables configured</div><div style="color:var(--text-soft);font-size:13px;margin-bottom:12px">Add tables with Edit Tables to start seating guests.</div><button type="button" class="btn btn-primary btn-sm" id="btn-manage-seating-empty"><i class="fa-solid fa-plus"></i> Add tables</button></div>`}</div>`;
      $$('.table-card', sec).forEach((c) => {
        const open = () => tableModal(TABLES.find((t) => String(t.n) === String(c.dataset.n)));
        c.onclick = open;
        c.onkeydown = (e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            open();
          }
        };
      });
      const btnPrint = $('#btn-print-floor-qrs', sec);
      if (btnPrint) btnPrint.onclick = () => showAllTableQRs();
      const btnManage = $('#btn-manage-seating', sec) || $('#btn-manage-seating-empty', sec);
      if (btnManage) btnManage.onclick = () => openManageSeatingModal();
      const btnRefresh = $('#btn-refresh-floor', sec);
      if (btnRefresh)
        btnRefresh.onclick = () => {
          if (window.RS_SYNC && RS_SYNC.syncPendingOrders) RS_SYNC.syncPendingOrders({ forceCloud: true });
          renderFloor();
          try {
            if (window.RS && typeof RS.toast === 'function') RS.toast('Floor refreshed', 'fa-rotate');
          } catch (e) {}
        };
      const btnOpenAll = $('#btn-open-all-qr', sec);
      if (btnOpenAll) btnOpenAll.onclick = () => bulkTableQrSessions('open', btnOpenAll);
      const btnCloseAll = $('#btn-close-all-qr', sec);
      if (btnCloseAll) btnCloseAll.onclick = () => bulkTableQrSessions('close', btnCloseAll);
      const btnClearAll = $('#btn-clear-all-tables', sec);
      if (btnClearAll) {
        const openN = TABLES.filter((t) => t && t.state && t.state !== 'free').length;
        if (!openN) {
          btnClearAll.disabled = true;
          btnClearAll.title = 'No open tables to clear';
          btnClearAll.style.opacity = '0.55';
        }
        btnClearAll.onclick = async () => {
          btnClearAll.disabled = true;
          try {
            await clearAllOpenTables();
          } finally {
            // re-enabled after renderFloor rebuilds toolbar
          }
        };
      }
      // Expose live table count for QR stats (active / total)
      try {
        if (window.RS) window.RS.TABLES = TABLES.slice();
      } catch (e) {}
    }

    /** Close QR session when a table bill is settled (keeps guest portal honest). */
    async function closeTableQrSessionOnSettle(tableLabel) {
      if (!window.RS_DB || !tableLabel) return;
      try {
        const key = normTableKey(tableLabel);
        if (!key) return;
        const sessions = await RS_DB.list('table_sessions').catch(() => []);
        const sess = (sessions || []).find(
          (s) => normTableKey(s.tableNumber) === key && s.status !== 'closed'
        );
        if (!sess) return;
        await RS_DB.put('table_sessions', sess.id, {
          ...sess,
          status: 'closed',
          closedAt: new Date().toISOString(),
        });
        document.dispatchEvent(new Event('rs:tables-updated'));
      } catch (e) {
        console.warn('closeTableQrSessionOnSettle', e);
      }
    }

    function openManageSeatingModal() {
      const modalBody = `
        <div style="display:flex; flex-direction:column; gap:10px; max-height:380px; overflow-y:auto; padding:4px;" id="seating-manage-list">
          ${TABLES.map((t, idx) => `
            <div class="seating-manage-row" style="display:flex; align-items:center; gap:8px; background:var(--glass); border:1px solid var(--stroke-2); padding:8px; border-radius:var(--r-sm);">
              <div style="flex:2; display:flex; flex-direction:column; gap:2px;">
                <label style="font-size:10px; font-weight:700; color:var(--text-soft)">Table Name/No</label>
                <input type="text" class="form-input table-manage-name" value="${t.name || t.n}" style="height:32px; font-size:12px; padding:4px 8px;">
              </div>
              <div style="flex:1; display:flex; flex-direction:column; gap:2px;">
                <label style="font-size:10px; font-weight:700; color:var(--text-soft)">Seats</label>
                <input type="number" class="form-input table-manage-cap" value="${t.cap}" style="height:32px; font-size:12px; padding:4px 8px;" min="1">
              </div>
              <button class="btn btn-ghost btn-sm btn-delete-table" style="color:var(--red); padding:4px 8px; margin-top:16px; border:1px solid rgba(239, 68, 68, 0.25);" title="Delete Table">
                <i class="fa-solid fa-trash-can"></i>
              </button>
            </div>
          `).join('')}
        </div>
      `;
      
      const modalFoot = `
        <button class="btn btn-ghost" id="btn-add-manage-table"><i class="fa-solid fa-plus"></i> Add Table</button>
        <button class="btn btn-primary" id="btn-save-seating" style="margin-left:auto;"><i class="fa-solid fa-check"></i> Save Layout</button>
      `;
      
      RSModal.open({
        title: 'Manage Seating Layout',
        sub: 'Add, edit or remove dine-in tables',
        icon: 'fa-chair',
        size: 'sm',
        body: modalBody,
        foot: modalFoot,
        onMount(modal, close) {
          const list = modal.querySelector('#seating-manage-list');
          
          list.addEventListener('click', e => {
            const btn = e.target.closest('.btn-delete-table');
            if (btn) {
              const row = btn.closest('.seating-manage-row');
              const nameInput = row && row.querySelector('.table-manage-name');
              const name = nameInput ? nameInput.value.trim() : '';
              const live = TABLES.find(
                (x) =>
                  String(x.n) === name ||
                  String(x.name) === name ||
                  tableNameLabel(x.n) === tableNameLabel(name)
              );
              if (live && live.state && live.state !== 'free') {
                RS.toast(
                  'Table ' +
                    name +
                    ' is ' +
                    (stateTxt[live.state] || live.state) +
                    ' — free it first (or Clear all open), then delete and Save Layout',
                  'fa-circle-exclamation'
                );
                return;
              }
              if (row) {
                row.remove();
                RS.toast('Removed from list — click Save Layout to keep the change', 'fa-trash');
              }
            }
          });
          
          modal.querySelector('#btn-add-manage-table').onclick = () => {
            const count = list.children.length + 1;
            const nextNum = String(count).padStart(2, '0');
            const newRowHtml = `
              <div class="seating-manage-row" style="display:flex; align-items:center; gap:8px; background:var(--glass); border:1px solid var(--stroke-2); padding:8px; border-radius:var(--r-sm);">
                <div style="flex:2; display:flex; flex-direction:column; gap:2px;">
                  <label style="font-size:10px; font-weight:700; color:var(--text-soft)">Table Name/No</label>
                  <input type="text" class="form-input table-manage-name" value="${nextNum}" style="height:32px; font-size:12px; padding:4px 8px;">
                </div>
                <div style="flex:1; display:flex; flex-direction:column; gap:2px;">
                  <label style="font-size:10px; font-weight:700; color:var(--text-soft)">Seats</label>
                  <input type="number" class="form-input table-manage-cap" value="4" style="height:32px; font-size:12px; padding:4px 8px;" min="1">
                </div>
                <button class="btn btn-ghost btn-sm btn-delete-table" style="color:var(--red); padding:4px 8px; margin-top:16px; border:1px solid rgba(239, 68, 68, 0.25);" title="Delete Table">
                  <i class="fa-solid fa-trash-can"></i>
                </button>
              </div>
            `;
            list.insertAdjacentHTML('beforeend', newRowHtml);
            list.scrollTop = list.scrollHeight;
          };
          
          modal.querySelector('#btn-save-seating').onclick = async () => {
            const rows = list.querySelectorAll('.seating-manage-row');
            const newTables = [];
            const seen = new Set();
            rows.forEach((row) => {
              const nameInput = row.querySelector('.table-manage-name');
              const capInput = row.querySelector('.table-manage-cap');
              if (nameInput && capInput) {
                const name = nameInput.value.trim();
                const cap = Math.max(1, Number(capInput.value) || 4);
                if (name) {
                  const key = name.toLowerCase();
                  if (seen.has(key)) return;
                  seen.add(key);
                  newTables.push({
                    n: name,
                    name: name,
                    cap: cap,
                    state: 'free',
                  });
                }
              }
            });

            if (!newTables.length) {
              RS.toast('Add at least one table before saving', 'fa-circle-exclamation');
              return;
            }

            if (!window.RS_DB) {
              RS.toast('Database not ready — try again in a moment', 'fa-circle-exclamation');
              return;
            }

            const saveBtn = modal.querySelector('#btn-save-seating');
            if (saveBtn) {
              saveBtn.disabled = true;
              saveBtn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Saving…';
            }

            try {
              const settings = (await window.RS_DB.getSettings().catch(() => null)) || {};
              // Never re-save nested cloud row into ui_settings
              const clean = { ...settings };
              delete clean._raw;
              clean.custom_tables = newTables;
              await window.RS_DB.setSettings(clean);

              // Verify read-back (cache + local)
              const verify = await window.RS_DB.getSettings().catch(() => null);
              const saved = verify && Array.isArray(verify.custom_tables) ? verify.custom_tables : null;
              if (!saved || saved.length !== newTables.length) {
                console.warn('[Floor] seating verify mismatch', saved, newTables);
                // Still apply optimistically — local write may have succeeded
              }

              TABLES = newTables.map((t) => ({ ...t, state: 'free' }));
              RS.toast(
                'Saved ' + newTables.length + ' table' + (newTables.length === 1 ? '' : 's'),
                'fa-circle-check'
              );
              close();
              document.dispatchEvent(new Event('rs:tables-updated'));
              await renderFloor();
            } catch (e) {
              console.warn('Failed saving seating settings', e);
              RS.toast('Save failed: ' + ((e && e.message) || 'try again'), 'fa-circle-exclamation');
              if (saveBtn) {
                saveBtn.disabled = false;
                saveBtn.innerHTML = '<i class="fa-solid fa-check"></i> Save Layout';
              }
            }
          };
        }
      });
    }

    function tableModal(t){
      const isFree = t.state === 'free';
      const isHeld = t.state === 'held';
      let bodyHtml = isFree
        ? `<p style="color:var(--text-soft);font-size:14.5px">Table ${esc(t.n)} is available (${esc(t.cap)} seats). Seat guests to open the table and start ordering on POS.</p>`
        : `<div class="crm-stats" style="margin-bottom:6px"><div class="cs"><div class="csv">${rs(t.amt || 0)}</div><div class="csl">${isHeld ? 'Held total' : 'Running bill'}</div></div><div class="cs"><div class="csv">${esc(t.since || '—')}</div><div class="csl">${isHeld ? 'Status' : 'Seated for'}</div></div><div class="cs"><div class="csv">${esc(t.cap)}</div><div class="csl">Seats</div></div></div>
           ${t.guest ? `<div style="font-size:13px;color:var(--text-soft);margin-bottom:8px"><i class="fa-solid fa-user"></i> ${esc(t.guest)}</div>` : ''}
           ${t.itemCount || t.ticketCount ? `<div style="font-size:12.5px;color:var(--text-mute);margin-bottom:4px">${t.itemCount || 0} item(s)${t.ticketCount > 1 ? ' · ' + t.ticketCount + ' tickets' : ''}${t.orderStatus ? ' · ' + esc(t.orderStatus) : ''}</div>` : ''}`;
      
      bodyHtml += `
        <div class="qr-session-controls" style="margin-top: 16px; padding-top: 16px; border-top: 1px solid var(--stroke-2); font-family: var(--font-body), sans-serif;">
          <div style="font-size: 11px; font-weight: 700; color: var(--text-soft); text-transform: uppercase; margin-bottom: 8px;">QR Ordering Session</div>
          <div style="display: flex; align-items: center; justify-content: space-between; margin-bottom: 12px;">
            <span style="font-size: 13.5px; color: var(--text);">Status: <b id="qr-session-status-text">Closed</b></span>
            <span id="qr-session-token-text" style="font-size: 10px; font-family: monospace; color: var(--text-soft); display: none;"></span>
          </div>
          <div style="display: flex; gap: 8px;" id="qr-session-buttons-container">
            <div style="color: var(--text-soft); font-size: 12px;"><i class="fa-solid fa-spinner fa-spin"></i> Checking QR status...</div>
          </div>
        </div>
      `;

      const freeTargets = TABLES.filter((x) => x.state === 'free' && String(x.n) !== String(t.n));
      const canXfer = !isFree && freeTargets.length && (t.dbId || (t.dbIds && t.dbIds.length) || isHeld);
      let foot;
      if (isFree) {
        foot = `<button class="btn btn-ghost" id="tbl-view-qr" style="padding:0 12px;margin-right:8px" title="View Table QR"><i class="fa-solid fa-qrcode"></i></button><button class="btn btn-ghost" style="flex:1" data-x>Close</button><button class="btn btn-primary" style="flex:1" data-pos><i class="fa-solid fa-cash-register"></i> Seat & order</button>`;
      } else if (isHeld) {
        foot = `<button class="btn btn-ghost" id="tbl-clear" style="padding:0 10px;color:var(--red)" title="Discard hold"><i class="fa-solid fa-trash"></i></button>
             <button class="btn btn-ghost" id="tbl-view-qr" style="padding:0 12px" title="View Table QR"><i class="fa-solid fa-qrcode"></i></button>
             <button class="btn btn-primary" style="flex:1" data-pos><i class="fa-solid fa-play"></i> Resume hold</button>`;
      } else {
        foot = `<button class="btn btn-ghost" id="tbl-clear" style="padding:0 10px;color:var(--red)" title="Free table"><i class="fa-solid fa-broom"></i></button>
             <button class="btn btn-ghost" id="tbl-print" style="padding:0 10px" title="Print bill"><i class="fa-solid fa-print"></i></button>
             <button class="btn btn-ghost" id="tbl-view-qr" style="padding:0 12px" title="View Table QR"><i class="fa-solid fa-qrcode"></i></button>
             <button class="btn btn-ghost" id="tbl-transfer" style="padding:0 10px" title="Transfer table" ${canXfer ? '' : 'disabled'}><i class="fa-solid fa-right-left"></i></button>
             <button class="btn btn-ghost" style="flex:1" data-pos><i class="fa-solid fa-plus"></i> Add items</button>
             <button class="btn btn-primary" style="flex:1" data-bill><i class="fa-solid fa-cash-register"></i> ${t.state === 'billed' ? 'Settle' : 'Checkout'}</button>`;
      }
      
      RSModal.open({ title:'Table '+t.n, sub:stateTxt[t.state] || t.state, icon:'fa-chair', size:'sm', body: bodyHtml, foot,
        onMount(modal,close){
          modal.querySelector('[data-x]')&&(modal.querySelector('[data-x]').onclick=close);
          const posBtn = modal.querySelector('[data-pos]');
          if (posBtn) {
            posBtn.onclick = async () => {
              close();
              await openTableInPos(t, {
                loadOrder: t.state !== 'free',
                seat: t.state === 'free',
                openQrSession: true,
                toast:
                  t.state === 'free'
                    ? `Table ${t.n} seated · open on floor`
                    : t.state === 'held'
                      ? `Table ${t.n} hold resumed`
                      : `Table ${t.n} open for add-ons`,
              });
            };
          }
          const clearBtn = modal.querySelector('#tbl-clear');
          if (clearBtn) {
            clearBtn.onclick = async () => {
              const ok = await clearTable(t);
              if (ok) close();
            };
          }
          const printBtn = modal.querySelector('#tbl-print');
          if (printBtn) {
            printBtn.onclick = async () => {
              await printTableBill(t);
            };
          }
          const xferBtn = modal.querySelector('#tbl-transfer');
          if (xferBtn && !xferBtn.disabled) {
            xferBtn.onclick = () => {
              const opts = freeTargets
                .map((x) => `<option value="${esc(x.n)}">Table ${esc(x.n)} (${esc(x.cap)} seats)</option>`)
                .join('');
              RSModal.open({
                title: 'Transfer Table ' + t.n,
                sub: 'Move open order(s) to another free table',
                icon: 'fa-right-left',
                size: 'sm',
                body: `<label class="fl">Destination</label><select class="form-input" id="xfer-dest">${opts}</select>
                  <p style="font-size:12px;color:var(--text-soft);margin-top:10px">All open tickets, holds, and QR session move with the table.</p>`,
                foot: `<button class="btn btn-ghost" style="flex:1" data-x>Cancel</button><button class="btn btn-primary" style="flex:1" data-ok><i class="fa-solid fa-right-left"></i> Transfer</button>`,
                onMount(m2, c2) {
                  m2.querySelector('[data-x]').onclick = c2;
                  m2.querySelector('[data-ok]').onclick = async () => {
                    const dest = m2.querySelector('#xfer-dest').value;
                    c2();
                    close();
                    await transferTable(t, dest);
                  };
                },
              });
            };
          }
          const qrBtn = modal.querySelector('#tbl-view-qr');
          if (qrBtn) {
            qrBtn.onclick = () => {
              close();
              showSingleTableQR(t);
            };
          }

          let session = null;
          const checkStatus = async () => {
            if (!window.RS_DB) return;
            try {
              const sessions = await RS_DB.list('table_sessions').catch(() => []);
              const wantKey = normTableKey(t.n);
              const list = (sessions || []).filter((s) => normTableKey(s.tableNumber) === wantKey);
              session =
                list.find((s) => s.status === 'active') ||
                list.find((s) => s.status === 'paused') ||
                list[0] ||
                null;
              updateQRControls(session);
            } catch (err) {
              console.warn("Failed checking session status", err);
            }
          };

          const updateQRControls = (sess) => {
            const statusTextEl = modal.querySelector('#qr-session-status-text');
            const tokenTextEl = modal.querySelector('#qr-session-token-text');
            const btnContainer = modal.querySelector('#qr-session-buttons-container');
            if (!statusTextEl || !btnContainer) return;

            let statusHtml = 'Closed';
            let buttonsHtml = '';
            
            if (sess && sess.status === 'active') {
              statusHtml = '<span style="color:var(--green)">Active</span>';
              if (sess.token) {
                tokenTextEl.style.display = 'inline';
                tokenTextEl.textContent = `Token: ${sess.token.substring(0, 8)}...`;
              } else {
                tokenTextEl.style.display = 'none';
              }
              buttonsHtml = `
                <button class="btn btn-ghost btn-sm btn-qr-action" data-action="pause" style="flex:1; border: 1px solid var(--stroke-2); font-size:11px; padding:6px 4px;"><i class="fa-solid fa-pause"></i> Pause</button>
                <button class="btn btn-ghost btn-sm btn-qr-action" data-action="regenerate" style="flex:1; border: 1px solid var(--stroke-2); font-size:11px; padding:6px 4px;" title="Regenerate Token"><i class="fa-solid fa-rotate"></i> Regen</button>
                <button class="btn btn-ghost btn-sm btn-qr-action" data-action="close" style="flex:1; border: 1px solid rgba(239,68,68,0.25); color:var(--red); font-size:11px; padding:6px 4px;"><i class="fa-solid fa-power-off"></i> Close</button>
              `;
            } else if (sess && sess.status === 'paused') {
              statusHtml = '<span style="color:#d97706">Paused</span>';
              tokenTextEl.style.display = 'none';
              buttonsHtml = `
                <button class="btn btn-ghost btn-sm btn-qr-action" data-action="resume" style="flex:1; border: 1px solid var(--stroke-2); font-size:11px; padding:6px 4px;"><i class="fa-solid fa-play"></i> Resume</button>
                <button class="btn btn-ghost btn-sm btn-qr-action" data-action="close" style="flex:1; border: 1px solid rgba(239,68,68,0.25); color:var(--red); font-size:11px; padding:6px 4px;"><i class="fa-solid fa-power-off"></i> Close</button>
              `;
            } else {
              statusHtml = 'Closed';
              tokenTextEl.style.display = 'none';
              buttonsHtml = `
                <button class="btn btn-primary btn-sm btn-qr-action" data-action="open" style="flex:1; font-size:11px; padding:6px 4px;"><i class="fa-solid fa-play"></i> Open Session</button>
              `;
            }

            statusTextEl.innerHTML = statusHtml;
            btnContainer.innerHTML = buttonsHtml;
          };

          modal.addEventListener('click', async (e) => {
            const btn = e.target.closest('.btn-qr-action');
            if (!btn) return;
            const action = btn.dataset.action;
            
            btn.disabled = true;
            btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i>';

            try {
              let updatedSess = null;
              const tableNumKey = normTableKey(t.n);

              if (action === 'open') {
                const randomToken = Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 15);
                updatedSess = {
                  tableNumber: tableNumKey,
                  token: randomToken,
                  status: 'active',
                  createdAt: new Date().toISOString()
                };
                if (session && session.id) updatedSess.id = session.id;
                const savedOpen = await RS_DB.put('table_sessions', session?.id, updatedSess);
                if (savedOpen && savedOpen.id != null) updatedSess.id = savedOpen.id;
                RS.toast('QR Session opened', 'fa-circle-check');
              } else if (action === 'pause') {
                updatedSess = { ...session, status: 'paused' };
                await RS_DB.put('table_sessions', session.id, updatedSess);
                RS.toast('QR Session paused', 'fa-circle-check');
              } else if (action === 'resume') {
                updatedSess = { ...session, status: 'active' };
                await RS_DB.put('table_sessions', session.id, updatedSess);
                RS.toast('QR Session resumed', 'fa-circle-check');
              } else if (action === 'regenerate') {
                const randomToken = Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 15);
                updatedSess = { ...session, token: randomToken, status: 'active' };
                await RS_DB.put('table_sessions', session.id, updatedSess);
                RS.toast('QR Session regenerated', 'fa-circle-check');
              } else if (action === 'close') {
                updatedSess = { ...session, status: 'closed', closedAt: new Date().toISOString() };
                await RS_DB.put('table_sessions', session.id, updatedSess);
                RS.toast('QR Session closed', 'fa-circle-check');
              }

              session = updatedSess;
              updateQRControls(session);
              document.dispatchEvent(new Event('rs:tables-updated'));
            } catch(err) {
              console.error("Failed to update QR session:", err);
              RS.toast('Failed to update session', 'fa-circle-exclamation');
              updateQRControls(session);
            }
          });

          checkStatus();

          const bb = modal.querySelector('[data-bill]');
          if (bb)
            bb.onclick = async () => {
              close();
              await openTableInPos(t, {
                loadOrder: true,
                toast: `Table ${t.n} ready to checkout`,
                icon: 'fa-file-invoice-dollar',
              });
            };
        }});
    }

    
    /* ── Guest-first table QR cards ──────────────────────────────────────
       Printed stickers/tents are the first thing customers see.
       Hierarchy: TABLE # (wayfinding) → large scannable QR → outlet brand
       → simple 3-step how-to. Staff tip sheet is print-only (not on stickers).
    */
    function guestOrderBaseUrl() {
      try {
        const settings = window.RS_SETTINGS || {};
        if (settings.set_public_order_base) return String(settings.set_public_order_base).replace(/\/$/, '');
      } catch (_) {}
      // Printed codes must stay on production even when staff open dashboard on localhost
      const h = (location.hostname || '').toLowerCase();
      if (h === 'localhost' || h === '127.0.0.1') return 'https://restrosuite.codearc.co.in';
      return location.origin;
    }
    function guestOrderUrl(tenantSlug, tableNum) {
      return (
        guestOrderBaseUrl() +
        '/order.html?tenant=' +
        encodeURIComponent(tenantSlug) +
        '&table=' +
        encodeURIComponent(tableNum)
      );
    }
    function formatOutletTitle(name) {
      const raw = String(name || 'Restaurant').trim();
      // Title case-ish without aggressive ALL CAPS (long names wrap badly)
      if (raw === raw.toUpperCase() && raw.length > 18) {
        return raw
          .toLowerCase()
          .replace(/\b\w/g, (c) => c.toUpperCase());
      }
      return raw;
    }
    function padTableLabel(n) {
      const s = String(n == null ? '' : n).trim();
      if (/^\d+$/.test(s)) return s.padStart(2, '0');
      return s || '—';
    }
    async function makeTableQrDataUrl(orderUrl, size) {
      const px = size || 280;
      if (window.QRCode) {
        try {
          // Higher error correction so logos / glare / folds still scan
          return await QRCode.toDataURL(orderUrl, {
            width: px,
            margin: 2,
            errorCorrectionLevel: 'H',
            color: { dark: '#111111', light: '#ffffff' },
          });
        } catch (e) {
          console.error('[QR generation failed]', e);
        }
      }
      return (
        'https://api.qrserver.com/v1/create-qr-code/?size=' +
        px +
        'x' +
        px +
        '&ecc=H&margin=8&data=' +
        encodeURIComponent(orderUrl)
      );
    }
    /**
     * Print size presets — different tables need different physical card sizes.
     * cols = per row on A4; qrCss = display size on paper.
     */
    const QR_PRINT_SIZES = {
      mini: {
        id: 'mini',
        label: 'Mini sticker',
        hint: '4×4 per A4 · tiny spaces / coasters',
        cols: 4,
        qrCss: 72,
        titlePx: 13,
        scanPx: 9,
        outletPx: 9,
        pad: '8px 6px',
        gap: '6px',
        margin: '8mm',
      },
      small: {
        id: 'small',
        label: 'Small',
        hint: '3×3 per A4 · compact table tents',
        cols: 3,
        qrCss: 100,
        titlePx: 16,
        scanPx: 10,
        outletPx: 11,
        pad: '12px 8px',
        gap: '8px',
        margin: '10mm',
      },
      medium: {
        id: 'medium',
        label: 'Medium',
        hint: '2×2 per A4 · standard (recommended)',
        cols: 2,
        qrCss: 140,
        titlePx: 22,
        scanPx: 12,
        outletPx: 13,
        pad: '16px 12px',
        gap: '12px',
        margin: '12mm',
      },
      large: {
        id: 'large',
        label: 'Large',
        hint: '2 per A4 · easy to scan from far',
        cols: 2,
        qrCss: 180,
        titlePx: 26,
        scanPx: 13,
        outletPx: 14,
        pad: '20px 14px',
        gap: '14px',
        margin: '12mm',
      },
      full: {
        id: 'full',
        label: 'Full page',
        hint: '1 per A4 · counter / entrance sign',
        cols: 1,
        qrCss: 260,
        titlePx: 36,
        scanPx: 16,
        outletPx: 18,
        pad: '32px 24px',
        gap: '0',
        margin: '15mm',
      },
    };

    function getSavedQrPrintSizeId() {
      try {
        const v = localStorage.getItem('rs:qr_print_size');
        if (v && QR_PRINT_SIZES[v]) return v;
      } catch (_) {}
      return 'medium';
    }
    function saveQrPrintSizeId(id) {
      try {
        localStorage.setItem('rs:qr_print_size', id);
      } catch (_) {}
    }

    function buildGuestQrCardHtml({ outletName, tableLabel, qrCodeUrl, sizeId }) {
      const name = esc(formatOutletTitle(outletName));
      const tbl = esc(tableLabel);
      const sz = QR_PRINT_SIZES[sizeId] || QR_PRINT_SIZES.medium;
      // High-res source image; CSS sizes for print
      return `
        <div class="qr-print-card" data-size="${esc(sz.id)}">
          <div class="qr-card-table">Table ${tbl}</div>
          <div class="qr-card-frame">
            <img src="${qrCodeUrl}" alt="Table ${tbl} QR" />
          </div>
          <div class="qr-card-scan">Scan to order</div>
          <div class="qr-card-outlet">${name}</div>
        </div>`;
    }

    function qrPrintDocumentStyles(sizeId) {
      const sz = QR_PRINT_SIZES[sizeId] || QR_PRINT_SIZES.medium;
      return `
        <style>
          @page { margin: ${sz.margin}; size: A4; }
          * { box-sizing: border-box; margin: 0; padding: 0; }
          body {
            font-family: system-ui, -apple-system, "Segoe UI", Roboto, Arial, sans-serif;
            color: #111; background: #fff;
            -webkit-print-color-adjust: exact;
            print-color-adjust: exact;
          }
          .qr-print-toolbar {
            display: flex; align-items: center; justify-content: space-between;
            gap: 12px; flex-wrap: wrap;
            padding: 14px 18px; margin-bottom: 16px;
            background: #1a1a1a; color: #fff;
            position: sticky; top: 0; z-index: 10;
          }
          .qr-print-toolbar h1 { font-size: 15px; font-weight: 700; }
          .qr-print-toolbar p { font-size: 12px; opacity: 0.75; margin-top: 2px; }
          .qr-print-toolbar button {
            border: none; border-radius: 8px; padding: 10px 18px;
            font-size: 13px; font-weight: 700; cursor: pointer;
            background: #25d366; color: #fff;
          }
          .qr-print-toolbar button.secondary {
            background: transparent; color: #fff; border: 1px solid rgba(255,255,255,0.35);
          }
          .qr-print-note {
            max-width: 960px; margin: 0 auto 14px; padding: 10px 14px;
            background: #f6f7f9; border: 1px solid #e5e7eb; border-radius: 10px;
            font-size: 12px; color: #444; line-height: 1.45;
          }
          .qr-print-grid {
            display: grid;
            grid-template-columns: repeat(${sz.cols}, 1fr);
            gap: ${sz.gap};
            max-width: 960px;
            margin: 0 auto;
            padding: 0 8px 24px;
          }
          .qr-print-card {
            border: 1.5px solid #222;
            border-radius: 12px;
            padding: ${sz.pad};
            text-align: center;
            background: #fff;
            page-break-inside: avoid;
            break-inside: avoid;
          }
          .qr-card-table {
            font-weight: 800;
            font-size: ${sz.titlePx}px;
            letter-spacing: -0.02em;
            color: #111;
            margin-bottom: 8px;
          }
          .qr-card-frame {
            display: inline-block;
            padding: 6px;
            border: 1px solid #e8e8e8;
            border-radius: 10px;
            margin-bottom: 8px;
            background: #fff;
          }
          .qr-card-frame img {
            display: block;
            width: ${sz.qrCss}px;
            height: ${sz.qrCss}px;
          }
          .qr-card-scan {
            font-size: ${sz.scanPx}px;
            font-weight: 600;
            color: #333;
            margin-bottom: 2px;
          }
          .qr-card-outlet {
            font-size: ${sz.outletPx}px;
            font-weight: 600;
            color: #666;
          }
          .qr-print-single {
            max-width: 420px;
            margin: 24px auto;
          }
          .qr-print-single .qr-print-grid { grid-template-columns: 1fr; }
          @media print {
            .qr-print-toolbar, .qr-print-note, .no-print { display: none !important; }
            body { background: #fff; }
            .qr-print-grid { max-width: none; padding: 0; }
            .qr-print-card { border-color: #000; }
          }
          @media screen {
            body { background: #eceff3; padding-bottom: 32px; }
          }
        </style>`;
    }

    /**
     * Open QR print sheet reliably.
     * NOTE: window.open('', '_blank', 'noopener') often yields an EMPTY tab —
     * document.write cannot populate a noopener window in modern Chrome.
     * Use a Blob URL instead (always has content).
     */
    function openQrPrintWindow(title, cardsHtml, meta) {
      const outlet = (meta && meta.outlet) || 'Restaurant';
      const count = (meta && meta.count) || 0;
      const sizeId = (meta && meta.sizeId) || getSavedQrPrintSizeId();
      const sizeLabel = (QR_PRINT_SIZES[sizeId] || QR_PRINT_SIZES.medium).label;
      const autoPrint = !!(meta && meta.autoPrint);

      if (!cardsHtml || !String(cardsHtml).trim()) {
        if (window.RS && RS.toast) RS.toast('Nothing to print — try again', 'fa-circle-exclamation');
        return null;
      }

      const toolbar = autoPrint
        ? ''
        : `<div class="qr-print-toolbar no-print">
            <div>
              <h1>${esc(title)}</h1>
              <p>${esc(formatOutletTitle(outlet))}${count ? ' · ' + count + ' cards' : ''} · ${esc(sizeLabel)}</p>
            </div>
            <div style="display:flex;gap:8px">
              <button type="button" class="secondary" onclick="window.close()">Close</button>
              <button type="button" onclick="window.print()">Print</button>
            </div>
          </div>
          <div class="qr-print-note no-print">
            Size: <b>${esc(sizeLabel)}</b>. Print on A4 (or choose paper in the print dialog), cut cards, place face-up.
            Before service: <b>Open all QR</b> so guest scans work.
          </div>`;

      const doc =
        '<!DOCTYPE html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>' +
        esc(title) +
        '</title>' +
        qrPrintDocumentStyles(sizeId) +
        '</head><body>' +
        toolbar +
        cardsHtml +
        (autoPrint
          ? '<script>(function(){function go(){setTimeout(function(){try{window.print()}catch(e){}},500);}var imgs=[].slice.call(document.images||[]);if(!imgs.length){go();return;}var n=0;function d(){n++;if(n>=imgs.length)go();}imgs.forEach(function(i){if(i.complete)d();else{i.onload=d;i.onerror=d;}});setTimeout(go,8000);})();<\/script>'
          : '') +
        '</body></html>';

      try {
        const blob = new Blob([doc], { type: 'text/html;charset=utf-8' });
        const url = URL.createObjectURL(blob);
        // Do NOT use noopener here — we need a usable window; Blob URL is same-origin-ish
        const win = window.open(url, '_blank');
        if (!win) {
          URL.revokeObjectURL(url);
          // Fallback: hidden iframe print
          return printQrViaIframe(doc, title);
        }
        // Revoke after load so tab keeps content in memory
        setTimeout(() => {
          try {
            URL.revokeObjectURL(url);
          } catch (_) {}
        }, 60000);
        try {
          win.focus();
        } catch (_) {}
        if (window.RS && RS.toast) {
          RS.toast('Print sheet ready — click Print in the new tab', 'fa-print');
        }
        return win;
      } catch (e) {
        console.warn('[QR print] blob open failed', e);
        return printQrViaIframe(doc, title);
      }
    }

    function printQrViaIframe(docHtml, title) {
      try {
        const prev = document.getElementById('rs-qr-print-frame');
        if (prev) prev.remove();
        const f = document.createElement('iframe');
        f.id = 'rs-qr-print-frame';
        f.setAttribute('title', title || 'QR print');
        f.style.cssText =
          'position:fixed;right:0;bottom:0;width:0;height:0;border:0;opacity:0;pointer-events:none';
        document.body.appendChild(f);
        const idoc = f.contentWindow.document;
        idoc.open();
        idoc.write(docHtml);
        idoc.close();
        const go = () => {
          try {
            f.contentWindow.focus();
            f.contentWindow.print();
          } catch (err) {
            console.warn(err);
            if (window.RS && RS.toast) RS.toast('Could not open print — allow pop-ups', 'fa-print');
          }
          setTimeout(() => {
            try {
              f.remove();
            } catch (_) {}
          }, 2000);
        };
        setTimeout(go, 600);
        return f;
      } catch (e) {
        console.warn('[QR print] iframe failed', e);
        if (window.RS && RS.toast) RS.toast('Print failed — allow pop-ups and try again', 'fa-circle-exclamation');
        return null;
      }
    }

    function buildCardsHtml(tableQrs, tenantName, sizeId) {
      return (
        '<div class="qr-print-grid">' +
        tableQrs
          .map((t) =>
            buildGuestQrCardHtml({
              outletName: tenantName,
              tableLabel: t.tableLabel,
              qrCodeUrl: t.qrCodeUrl,
              sizeId: sizeId,
            })
          )
          .join('') +
        '</div>'
      );
    }

    async function showSingleTableQR(t) {
      if (!window.RSModal) return;
      const tenantName = sessionStorage.getItem('tenant_name') || 'Restaurant';
      const tenantSlug = sessionStorage.getItem('tenant_slug') || 'outlet';
      const tableLabel = padTableLabel(t.n);
      const orderUrl = guestOrderUrl(tenantSlug, t.n);
      const qrCodeUrl = await makeTableQrDataUrl(orderUrl, 320);
      const savedSize = getSavedQrPrintSizeId();

      const sizeOptions = Object.keys(QR_PRINT_SIZES)
        .map((id) => {
          const s = QR_PRINT_SIZES[id];
          return `<label style="display:flex;align-items:flex-start;gap:8px;padding:8px 10px;border:1px solid var(--stroke-2);border-radius:10px;cursor:pointer;margin-bottom:6px;text-align:left">
            <input type="radio" name="qr-size-one" value="${esc(id)}" ${id === savedSize ? 'checked' : ''} style="margin-top:3px">
            <span><b style="font-size:13px">${esc(s.label)}</b><br><span style="font-size:11px;color:var(--text-soft)">${esc(s.hint)}</span></span>
          </label>`;
        })
        .join('');

      const body = `
        <div style="text-align:center;padding:4px 0 2px">
          <div style="font-size:26px;font-weight:800;letter-spacing:-0.02em;margin-bottom:6px">Table ${esc(tableLabel)}</div>
          <div style="font-size:13px;color:var(--text-soft);margin-bottom:12px">${esc(formatOutletTitle(tenantName))}</div>
          <div style="display:inline-block;padding:12px;border:1px solid var(--stroke-2);border-radius:14px;background:#fff;margin-bottom:12px;box-shadow:0 4px 16px rgba(0,0,0,.06)">
            <img src="${qrCodeUrl}" style="width:180px;height:180px;display:block" alt="Table ${esc(tableLabel)} QR">
          </div>
          <div style="font-size:12px;font-weight:700;text-align:left;margin:8px 0 6px;color:var(--text)">Print size</div>
          <div id="qr-size-one-list" style="text-align:left">${sizeOptions}</div>
        </div>
      `;

      RSModal.open({
        title: 'Table QR',
        sub: 'Choose size for your table space',
        icon: 'fa-qrcode',
        size: 'sm',
        body,
        foot: `<button class="btn btn-ghost" style="flex:1" data-x>Close</button>
               <button class="btn btn-primary" style="flex:1" id="btn-print-single-qr"><i class="fa-solid fa-print"></i> Print card</button>`,
        onMount(modal, close) {
          modal.querySelector('[data-x]').onclick = close;
          modal.querySelector('#btn-print-single-qr').onclick = () => {
            const picked =
              (modal.querySelector('input[name="qr-size-one"]:checked') || {}).value || 'medium';
            saveQrPrintSizeId(picked);
            const card = buildGuestQrCardHtml({
              outletName: tenantName,
              tableLabel,
              qrCodeUrl,
              sizeId: picked,
            });
            openQrPrintWindow(
              'Table ' + tableLabel + ' QR',
              '<div class="qr-print-single"><div class="qr-print-grid">' + card + '</div></div>',
              { outlet: tenantName, count: 1, sizeId: picked, autoPrint: false }
            );
          };
        },
      });
    }

    async function showAllTableQRs() {
      const tenantName = sessionStorage.getItem('tenant_name') || 'Restaurant';
      const tenantSlug = sessionStorage.getItem('tenant_slug') || 'outlet';

      if (!TABLES.length) {
        if (window.RS && RS.toast) RS.toast('Add tables first (Edit Tables)', 'fa-chair');
        return;
      }

      RS.toast('Preparing ' + TABLES.length + ' QR cards…', 'fa-qrcode');

      let tableQrs;
      try {
        // High-res QR once; CSS scales for each size
        tableQrs = await Promise.all(
          TABLES.map(async (t) => {
            const orderUrl = guestOrderUrl(tenantSlug, t.n);
            const qrCodeUrl = await makeTableQrDataUrl(orderUrl, 320);
            return { tableNum: t.n, tableLabel: padTableLabel(t.n), qrCodeUrl, orderUrl };
          })
        );
      } catch (e) {
        console.warn(e);
        if (window.RS && RS.toast) RS.toast('Could not build QR cards', 'fa-circle-exclamation');
        return;
      }

      const savedSize = getSavedQrPrintSizeId();
      const sizeRadios = Object.keys(QR_PRINT_SIZES)
        .map((id) => {
          const s = QR_PRINT_SIZES[id];
          const checked = id === savedSize ? 'checked' : '';
          return `<label class="qr-size-opt" data-size="${esc(id)}" style="display:flex;align-items:flex-start;gap:8px;padding:10px 12px;border:1px solid var(--stroke-2);border-radius:12px;cursor:pointer;background:var(--panel)">
            <input type="radio" name="qr-print-size" value="${esc(id)}" ${checked} style="margin-top:3px;accent-color:var(--orange,#ff4f00)">
            <span style="min-width:0">
              <b style="font-size:13px;color:var(--text)">${esc(s.label)}</b>
              <div style="font-size:11.5px;color:var(--text-soft);margin-top:2px;line-height:1.35">${esc(s.hint)}</div>
            </span>
          </label>`;
        })
        .join('');

      const previewGrid = tableQrs
        .slice(0, 4)
        .map(
          (t) => `
          <div style="border:1px solid var(--stroke-2);border-radius:12px;padding:10px;text-align:center;background:var(--panel)">
            <div style="font-weight:800;font-size:13px;margin-bottom:6px">Table ${esc(t.tableLabel)}</div>
            <img src="${t.qrCodeUrl}" alt="" style="width:72px;height:72px;display:block;margin:0 auto 4px;border-radius:6px">
          </div>`
        )
        .join('');

      if (!window.RSModal) {
        openQrPrintWindow('Table QR cards', buildCardsHtml(tableQrs, tenantName, savedSize), {
          outlet: tenantName,
          count: tableQrs.length,
          sizeId: savedSize,
          autoPrint: false,
        });
        return;
      }

      RSModal.open({
        title: 'Print table QR cards',
        sub: formatOutletTitle(tenantName) + ' · ' + tableQrs.length + ' tables',
        icon: 'fa-print',
        size: 'md',
        body: `
          <p style="margin:0 0 10px;font-size:13px;color:var(--text-soft);line-height:1.5">
            Pick a size for your table space. Print on A4, cut, and place face-up.
            Before service: <b>Open all QR</b>.
          </p>
          <div style="font-size:11px;font-weight:800;text-transform:uppercase;letter-spacing:.05em;color:var(--text-mute);margin-bottom:8px">Card size</div>
          <div id="qr-size-list" style="display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-bottom:14px">
            ${sizeRadios}
          </div>
          <div style="font-size:11px;font-weight:800;text-transform:uppercase;letter-spacing:.05em;color:var(--text-mute);margin-bottom:8px">Preview</div>
          <div style="display:grid;grid-template-columns:repeat(4,1fr);gap:8px">
            ${previewGrid}
          </div>
          ${
            tableQrs.length > 4
              ? `<div style="text-align:center;font-size:12px;color:var(--text-soft);margin-top:8px">+ ${tableQrs.length - 4} more on the print sheet</div>`
              : ''
          }`,
        foot: `<button class="btn btn-ghost" style="flex:1" data-x>Cancel</button>
               <button class="btn btn-primary" style="flex:1" id="btn-print-all-qrs-go"><i class="fa-solid fa-print"></i> Print ${tableQrs.length} cards</button>`,
        onMount(modal, close) {
          modal.querySelector('[data-x]').onclick = close;
          // Highlight selected size card
          const syncSel = () => {
            const v = (modal.querySelector('input[name="qr-print-size"]:checked') || {}).value || 'medium';
            modal.querySelectorAll('.qr-size-opt').forEach((lab) => {
              const on = lab.getAttribute('data-size') === v;
              lab.style.borderColor = on ? 'var(--orange, #ff4f00)' : 'var(--stroke-2)';
              lab.style.boxShadow = on ? '0 0 0 1px var(--orange, #ff4f00)' : 'none';
            });
          };
          modal.querySelectorAll('input[name="qr-print-size"]').forEach((r) => {
            r.addEventListener('change', syncSel);
          });
          syncSel();
          const go = modal.querySelector('#btn-print-all-qrs-go');
          if (go)
            go.onclick = () => {
              const sizeId =
                (modal.querySelector('input[name="qr-print-size"]:checked') || {}).value || 'medium';
              saveQrPrintSizeId(sizeId);
              openQrPrintWindow(
                'Table QR cards',
                buildCardsHtml(tableQrs, tenantName, sizeId),
                {
                  outlet: tenantName,
                  count: tableQrs.length,
                  sizeId,
                  autoPrint: false,
                }
              );
              close();
            };
        },
      });
    }

    RS.titles['floor-tab'] = ['Floor & Tables', 'Live table status & seating'];
    RS.addRenderer('floor-tab', renderFloor);
    RS.openTableInPos = openTableInPos;
    RS.transferTable = transferTable;
    RS.clearTable = clearTable;
    RS.clearAllOpenTables = clearAllOpenTables;
    RS.ensureSeatedPendingOrder = ensureSeatedPendingOrder;
    RS.ensureTableQrSession = ensureTableQrSession;
    RS.closeTableQrSession = closeTableQrSession;
    RS.bulkTableQrSessions = bulkTableQrSessions;
    RS.normTableKey = normTableKey;
    // Live refresh when QR/KDS sync lands new tickets
    if (!window.__rsFloorSyncBound) {
      window.__rsFloorSyncBound = true;
      document.addEventListener('rs:pending_orders_synced', () => {
        const tab = document.getElementById('floor-tab');
        if (tab && tab.classList.contains('active')) {
          try {
            renderFloor();
          } catch (e) {}
        }
      });
      document.addEventListener('rs:tables-updated', () => {
        const tab = document.getElementById('floor-tab');
        if (tab && tab.classList.contains('active')) {
          try {
            renderFloor();
          } catch (e) {}
        }
      });
      document.addEventListener('rs:bill-paid', (ev) => {
        setTimeout(() => {
          try {
            renderFloor();
          } catch (e) {}
        }, 400);
        try {
          const bill = ev && ev.detail;
          const tbl = bill && (bill.table || bill.tableNumber);
          if (tbl) closeTableQrSessionOnSettle(tbl);
        } catch (e) {}
      });
      // Keep seated durations fresh while floor is visible
      setInterval(() => {
        const tab = document.getElementById('floor-tab');
        if (tab && tab.classList.contains('active')) {
          try {
            renderFloor();
          } catch (e) {}
        }
      }, 60000);
    }

    /* ===================== ONLINE / AGGREGATOR ORDERS ===================== */
    const ONLINE = [];
    const platName = { zomato: 'Zomato', swiggy: 'Swiggy', ondc: 'ONDC' };
    let aggAlertBooted = false;
    const seenOnlineIds = new Set();

    function detectPlatform(order) {
      const raw = `${order.platform || ''} ${order.orderId || ''} ${order.tableNumber || ''} ${order.orderType || ''} ${order.channel || ''}`.toLowerCase();
      if (raw.includes('swiggy') || raw.includes('swi-') || raw.includes('swig')) return 'swiggy';
      if (raw.includes('ondc') || raw.includes('ond-')) return 'ondc';
      if (raw.includes('zomato') || raw.includes('zom-') || raw.includes('zom')) return 'zomato';
      return 'zomato';
    }
    function isOnlineOrder(order) {
      const raw = `${order.platform || ''} ${order.orderId || ''} ${order.tableNumber || ''} ${order.orderType || ''} ${order.channel || ''} ${order.source || ''}`.toLowerCase();
      return (
        raw.includes('online') ||
        raw.includes('delivery') ||
        raw.includes('aggregator') ||
        raw.includes('swiggy') ||
        raw.includes('zomato') ||
        raw.includes('ondc') ||
        /(^|[^a-z])(zom|swi|ond)-/.test(raw)
      );
    }
    function aggStatus(status) {
      const s = String(status || '').toLowerCase();
      if (s.includes('reject') || s.includes('cancel')) return 'rejected';
      if (s.includes('ready') || s.includes('pickup') || s.includes('picked')) return 'ready';
      if (s.includes('accept') || s.includes('prepar')) return 'preparing';
      return 'new';
    }

    function paintOnlineBadge() {
      const newCount = ONLINE.filter((o) => o.status === 'new').length;
      const newAndPrep = ONLINE.filter((o) => o.status === 'new' || o.status === 'preparing').length;
      window.__rsOnlineNewCount = newCount;
      window.__rsOnlineActiveCount = newAndPrep;
      document.querySelectorAll('.sidebar-link[data-tab="aggregator-tab"] .badge-count, .mnav-link[data-tab="aggregator-tab"] .badge-count').forEach((onlineBadge) => {
        onlineBadge.textContent = newCount > 0 ? newCount : newAndPrep;
        onlineBadge.style.display = newAndPrep > 0 ? '' : 'none';
        onlineBadge.classList.toggle('badge-urgent', newCount > 0);
        onlineBadge.title = newCount ? newCount + ' new online orders' : newAndPrep ? newAndPrep + ' active online' : '';
      });
      try {
        if (typeof window.RS !== 'undefined' && RS.updateTabAttentionBlinking) RS.updateTabAttentionBlinking();
        else if (typeof updateTabAttentionBlinking === 'function') updateTabAttentionBlinking();
      } catch (e) {}
    }

    function notifyNewOnlineOrders() {
      const freshNew = ONLINE.filter((o) => o.status === 'new' && o.id && !seenOnlineIds.has(String(o.id)));
      if (!aggAlertBooted) {
        aggAlertBooted = true;
        ONLINE.forEach((o) => {
          if (o.id) seenOnlineIds.add(String(o.id));
        });
        return;
      }
      if (!freshNew.length) return;
      freshNew.forEach((o) => seenOnlineIds.add(String(o.id)));
      // Reuse floor chime path when available
      try {
        if (window.RSOps && typeof RSOps.checkNewPendingOrders === 'function') {
          /* floor chime is QR-only; play a short tone here */
        }
        const mute = localStorage.getItem('rs_service_alert_mute') === '1';
        if (!mute) {
          const Ctx = window.AudioContext || window.webkitAudioContext;
          if (Ctx) {
            const ctx = window.__rsAggAudio || (window.__rsAggAudio = new Ctx());
            if (ctx.state === 'suspended') ctx.resume().catch(() => {});
            else {
              [[523.25, 0], [659.25, 0.14], [783.99, 0.28]].forEach(([freq, d]) => {
                const osc = ctx.createOscillator();
                const gain = ctx.createGain();
                osc.type = 'triangle';
                osc.frequency.value = freq;
                const t0 = ctx.currentTime + d;
                gain.gain.setValueAtTime(0.0001, t0);
                gain.gain.exponentialRampToValueAtTime(0.16, t0 + 0.02);
                gain.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.3);
                osc.connect(gain).connect(ctx.destination);
                osc.start(t0);
                osc.stop(t0 + 0.35);
              });
            }
          }
          if (navigator.vibrate) navigator.vibrate([160, 70, 160, 70, 160]);
        }
      } catch (e) {}
      const first = freshNew[0];
      const label =
        freshNew.length === 1
          ? `New ${platName[first.plat] || 'online'} order · ${first.oid}`
          : `${freshNew.length} new online orders`;
      const openAgg = () => {
        if (RS.activateTab) RS.activateTab('aggregator-tab');
      };
      if (typeof window.__toast === 'function') window.__toast(label + ' — tap to open', 'fa-motorcycle', openAgg);
      else RS.toast(label, 'fa-motorcycle');
    }

    async function refreshOnlineOrders() {
      if (!window.RS_DB) return;
      const rows = await RS_DB.list('pending_orders').catch((e) => {
        console.warn('Failed loading online orders from DB', e);
        return [];
      });
      ONLINE.length = 0;
      (rows || [])
        .filter((row) => isOnlineOrder(row) && !/reject|cancel|picked|delivered|completed/.test(String(row.status || '').toLowerCase()))
        .forEach((row) => {
          ONLINE.push({
            id: row.id,
            row,
            plat: detectPlatform(row),
            oid: RS.formatDisplayOrderId ? RS.formatDisplayOrderId(row) : row.orderId || row.id,
            cust: row.customerName || 'Online customer',
            phone: row.customerPhone || row.phone || '',
            area: row.tableNumber || row.orderType || 'Delivery',
            items: (row.items || []).map((it) => `${it.qty || 1}× ${it.name || 'Item'}`),
            rawItems: row.items || [],
            total: Number(row.total || 0),
            status: aggStatus(row.status),
            prep: row.prepMinutes || row.prep || 15,
            since: row.dateTime ? getElapsedDesc(row.dateTime) : '',
            dateTime: row.dateTime,
          });
        });
      // New first
      ONLINE.sort((a, b) => {
        const rank = (s) => (s === 'new' ? 0 : s === 'preparing' ? 1 : 2);
        return rank(a.status) - rank(b.status);
      });
      paintOnlineBadge();
      notifyNewOnlineOrders();
    }

    async function openOnlineOrderInPos(order) {
      if (!order || !order.row) return;
      const items = orderItemsForPos(order.row);
      if (!items.length) {
        RS.toast('No billable items on this order', 'fa-circle-exclamation');
        return;
      }
      if (RS.activateTab) await RS.activateTab('pos-tab');
      await new Promise((r) => setTimeout(r, 120));
      let attempts = 0;
      while (attempts < 8 && typeof RS.setCart !== 'function') {
        await new Promise((r) => setTimeout(r, 60));
        attempts += 1;
      }
      // Delivery / takeaway style for aggregators
      const btns = document.querySelectorAll('.order-type-btn');
      let deliveryBtn = null;
      btns.forEach((b) => {
        const t = (b.textContent || '').trim().toLowerCase();
        if (t.includes('deliver') || t.includes('online')) deliveryBtn = b;
        else if (!deliveryBtn && t.includes('take')) deliveryBtn = b;
      });
      if (deliveryBtn) deliveryBtn.click();

      const tableSelect = document.getElementById('cart-table');
      const tableLabel = `${platName[order.plat] || 'Online'} · ${order.oid}`;
      if (tableSelect) {
        let opt = [...tableSelect.options].find((o) => o.value === tableLabel || o.text === tableLabel);
        if (!opt) {
          opt = document.createElement('option');
          opt.value = tableLabel;
          opt.textContent = tableLabel;
          tableSelect.appendChild(opt);
        }
        tableSelect.value = opt.value;
        tableSelect.dispatchEvent(new Event('change', { bubbles: true }));
      }
      if (typeof RS.setCart === 'function') RS.setCart(items);
      const nameEl = document.getElementById('cust-name') || document.getElementById('cust-input-name');
      const phoneEl = document.getElementById('cust-phone') || document.getElementById('cust-input-phone');
      if (nameEl && order.cust) {
        nameEl.value = order.cust;
        nameEl.dispatchEvent(new Event('input', { bubbles: true }));
      }
      if (phoneEl && order.phone) {
        phoneEl.value = order.phone;
        phoneEl.dispatchEvent(new Event('input', { bubbles: true }));
      }
      try {
        if (typeof RS.renderCart === 'function') RS.renderCart();
      } catch (e) {}
      RS.toast(`${platName[order.plat]} ${order.oid} loaded in POS`, 'fa-receipt');
    }

    function printOnlineKot(order) {
      if (!order) return;
      const items = (order.rawItems || order.row?.items || []).map((it) => ({
        qty: it.qty || 1,
        name: it.name || 'Item',
      }));
      if (window.RSOps && typeof RSOps.printKotThermal === 'function') {
        RSOps.printKotThermal(items, {
          token: order.oid,
          table: `${platName[order.plat]} · ${order.area}`,
          orderType: 'Online',
        });
      } else if (typeof window.RSPrint === 'function') {
        const lines = items
          .map((i) => `<div class="kot-item"><span class="kq">${esc(i.qty)}×</span><span>${esc(i.name)}</span></div>`)
          .join('');
        RSPrint(
          `<div style="max-width:280px;margin:0 auto"><div class="kot-h"><span class="kt">KOT</span><span>${esc(order.oid)}</span></div>${lines}</div>`,
          'KOT ' + order.oid
        );
      }
    }

    async function persistOnlineStatus(idx, persistedStatus, message, icon, opts) {
      const order = ONLINE[idx];
      if (!order) return;
      order.row.status = persistedStatus;
      if (opts && opts.prepMinutes) {
        order.row.prepMinutes = opts.prepMinutes;
        order.row.prepStartedAt = new Date().toISOString();
        order.prep = opts.prepMinutes;
      }
      try {
        if (window.RS_DB) await RS_DB.put('pending_orders', order.id, order.row);
        if (window.RS_SYNC && RS_SYNC.syncPendingOrders) RS_SYNC.syncPendingOrders({ forceCloud: true });
        RS.toast(message, icon);
        if (opts && opts.printKot) printOnlineKot(order);
        try {
          document.dispatchEvent(new CustomEvent('rs:kot-new', { detail: order.row }));
        } catch (_) {}
        await renderAgg();
      } catch (e) {
        console.warn('Failed updating online order status', e);
        RS.toast('Online order update failed', 'fa-circle-exclamation');
      }
    }

    async function seedDemoOnlineOrder(platform) {
      if (!window.RS_DB) {
        RS.toast('Database unavailable', 'fa-circle-exclamation');
        return;
      }
      const plat = platform || 'swiggy';
      const menu = (RS.MENU && RS.MENU.length ? RS.MENU : []).slice(0, 2);
      const items = menu.length
        ? menu.map((m) => ({
            id: m.id,
            name: m.name,
            qty: 1,
            price: Number(m.price || m.salePrice || 120),
          }))
        : [
            { id: 'demo_paneer', name: 'Paneer Butter Masala', qty: 1, price: 280 },
            { id: 'demo_naan', name: 'Butter Naan', qty: 2, price: 50 },
          ];
      const total = items.reduce((a, i) => a + Number(i.price) * Number(i.qty), 0);
      const stamp = Date.now();
      const id = stamp * 1000 + Math.floor(Math.random() * 1000);
      const row = {
        id,
        orderId: `${plat.slice(0, 3).toUpperCase()}-${String(stamp).slice(-6)}`,
        tableNumber: 'Delivery',
        orderType: 'Online Delivery',
        platform: plat,
        channel: 'aggregator',
        source: plat,
        customerName: plat === 'zomato' ? 'Demo Zomato Guest' : plat === 'ondc' ? 'Demo ONDC Guest' : 'Demo Swiggy Guest',
        customerPhone: '9876501234',
        items,
        total,
        status: 'Pending Review',
        dateTime: new Date().toISOString(),
        priority: 'normal',
      };
      try {
        const saved = await RS_DB.put('pending_orders', id, row);
        if (saved && saved.id) row.id = saved.id;
        if (window.RS_SYNC && RS_SYNC.syncPendingOrders) await RS_SYNC.syncPendingOrders({ forceCloud: true });
        RS.toast(`Demo ${platName[plat] || plat} order seeded`, 'fa-seedling');
        await renderAgg();
      } catch (e) {
        console.warn('seedDemoOnlineOrder failed', e);
        RS.toast('Could not seed demo order', 'fa-circle-exclamation');
      }
    }

    async function renderAgg() {
      const sec = $('#aggregator-tab');
      if (!sec) return;
      sec.innerHTML = '<div class="sr-empty">Loading online orders...</div>';
      await refreshOnlineOrders();
      const newN = ONLINE.filter((o) => o.status === 'new').length;
      const prepN = ONLINE.filter((o) => o.status === 'preparing').length;
      const readyN = ONLINE.filter((o) => o.status === 'ready').length;
      const showDemo =
        !!(window.RS_API && RS_API.enableDemoTools) ||
        localStorage.getItem('rs_demo_tools') === '1' ||
        /owner|manager|admin/i.test(sessionStorage.getItem('logged_in_role') || '');
      const feedLive = ONLINE.length > 0 || navigator.onLine !== false;
      sec.innerHTML = `
        <div class="stat-row">
          <div class="stat-card"><div class="stat-ic bg-o"><i class="fa-solid fa-motorcycle"></i></div><div><div class="sv">${newN}</div><div class="sl">New orders</div></div></div>
          <div class="stat-card"><div class="stat-ic bg-a"><i class="fa-solid fa-fire-burner"></i></div><div><div class="sv">${prepN}</div><div class="sl">Preparing</div></div></div>
          <div class="stat-card"><div class="stat-ic bg-g"><i class="fa-solid fa-bell-concierge"></i></div><div><div class="sv">${readyN}</div><div class="sl">Ready for pickup</div></div></div>
          <div class="stat-card"><div class="stat-ic bg-v"><i class="fa-solid fa-coins"></i></div><div><div class="sv">${rs(ONLINE.reduce((a, o) => a + o.total, 0))}</div><div class="sl">Open online value</div></div></div>
        </div>
        <div class="toolbar-row" style="flex-wrap:wrap;gap:8px">
          <span class="eyebrow">Zomato · Swiggy · ONDC</span>
          <div class="grow"></div>
          ${showDemo ? '<button type="button" class="btn btn-ghost btn-sm" id="agg-seed" title="Seed a demo online order"><i class="fa-solid fa-seedling"></i> Demo order</button>' : ''}
          <button type="button" class="btn btn-ghost btn-sm" id="agg-refresh"><i class="fa-solid fa-rotate"></i> Refresh</button>
          <button type="button" class="btn btn-ghost btn-sm" id="agg-webhook-info" title="Webhook setup"><i class="fa-solid fa-link"></i> Webhook</button>
          <span class="pill ${feedLive ? 'pill-green' : 'pill-amber'}"><span class="dot ${feedLive ? 'dot-live' : ''}"></span>${feedLive ? 'Online' : 'Offline'}</span>
        </div>
        <div class="agg-grid">${ONLINE.map(
          (o, i) => `
          <div class="agg-card${o.status === 'new' ? ' needs-attention' : ''}" data-i="${i}">
            <div class="agg-top ${o.plat}"><i class="fa-solid ${o.plat === 'ondc' ? 'fa-network-wired' : o.plat === 'swiggy' ? 'fa-motorcycle' : 'fa-bowl-food'}"></i><span class="plat">${platName[o.plat]}</span><span class="oid">${esc(o.oid)}</span></div>
            <div class="agg-body">
              <div class="agg-cust"><div><div class="cn">${esc(o.cust)}</div><div class="ct">${esc(o.area)}${o.phone ? ' · ' + esc(o.phone) : ''}${o.since ? ' · ' + esc(o.since) : ''}</div></div><span class="pill ${o.status === 'new' ? 'pill-amber' : o.status === 'preparing' ? 'pill-orange' : 'pill-green'}" style="padding:3px 10px;text-transform:capitalize">${esc(o.status)}</span></div>
              <div class="agg-items">${o.items.map(esc).join('<br>')}</div>
              <div class="agg-foot"><span class="at">${rs(o.total)}</span>
                <button type="button" class="btn btn-ghost btn-sm" data-pos="${i}" title="Open in POS"><i class="fa-solid fa-cash-register"></i></button>
                ${
                  o.status === 'new'
                    ? `<button type="button" class="btn btn-ghost btn-sm" data-rej="${i}">Reject</button><button type="button" class="btn btn-primary btn-sm" data-acc="${i}"><i class="fa-solid fa-check"></i> Accept + KOT</button>`
                    : o.status === 'preparing'
                      ? `<span class="agg-prep"><i class="fa-solid fa-clock"></i> ${esc(o.prep)}m</span><button type="button" class="btn btn-primary btn-sm" data-ready="${i}">Mark ready</button>`
                      : `<button type="button" class="btn btn-ghost btn-sm" data-rider="${i}"><i class="fa-solid fa-motorcycle"></i> Rider out</button>`
                }
              </div>
            </div>
          </div>`
        ).join('')}</div>`;
      if (!ONLINE.length) {
        const grid = $('.agg-grid', sec);
        if (grid)
          grid.innerHTML = `<div class="sr-empty" style="padding:40px 20px;grid-column:1/-1">
          <i class="fa-solid fa-motorcycle" style="font-size:28px;opacity:.4;display:block;margin-bottom:10px"></i>
          <div style="font-weight:700;margin-bottom:6px;font-size:15px">Kitchen is clear for delivery</div>
          <div style="font-size:13px;color:var(--text-soft);max-width:400px;margin:0 auto 14px;line-height:1.5">
            New Zomato / Swiggy / ONDC orders appear here for <b>Accept + KOT</b>, then settle in POS.
            ${showDemo ? ' Use <b>Demo order</b> to practice the full flow.' : ' Connect webhooks under Webhook when your aggregator is ready.'}
          </div>
          <div style="display:flex;gap:8px;justify-content:center;flex-wrap:wrap">
            <button type="button" class="btn btn-ghost btn-sm" id="agg-empty-webhook"><i class="fa-solid fa-link"></i> Webhook setup</button>
            ${showDemo ? '<button type="button" class="btn btn-primary btn-sm" id="agg-empty-demo"><i class="fa-solid fa-seedling"></i> Demo order</button>' : ''}
          </div>
        </div>`;
      }
      $$('[data-pos]', sec).forEach((b) => {
        b.onclick = () => openOnlineOrderInPos(ONLINE[+b.dataset.pos]);
      });
      $$('[data-acc]', sec).forEach((b) => {
        b.onclick = async () => {
          const i = +b.dataset.acc;
          if (ONLINE[i]) ONLINE[i].prep = 15;
          await persistOnlineStatus(i, 'preparing', 'Accepted · KOT printed', 'fa-check', {
            printKot: true,
            prepMinutes: 15,
          });
        };
      });
      $$('[data-ready]', sec).forEach((b) =>
        b.onclick = () => persistOnlineStatus(+b.dataset.ready, 'Ready', 'Marked ready for pickup', 'fa-bell-concierge')
      );
      $$('[data-rej]', sec).forEach((b) =>
        b.onclick = async () => {
          const i = +b.dataset.rej;
          const order = ONLINE[i];
          if (!order) return;
          let reason = 'Rejected by outlet';
          if (window.RSModal) {
            await new Promise((resolve) => {
              RSModal.open({
                title: 'Reject online order',
                sub: (platName[order.plat] || 'Online') + ' · ' + order.oid,
                icon: 'fa-xmark',
                size: 'sm',
                body: `<label class="fl">Reason (shared internally)</label>
                  <select class="form-input" id="agg-rej-reason">
                    <option>Item unavailable</option>
                    <option>Outlet closed / too busy</option>
                    <option>Delivery area issue</option>
                    <option>Duplicate order</option>
                    <option value="other">Other…</option>
                  </select>
                  <input class="form-input" id="agg-rej-other" placeholder="Details (optional)" style="margin-top:8px;display:none">`,
                foot: `<button type="button" class="btn btn-ghost" style="flex:1" data-x>Cancel</button>
                       <button type="button" class="btn btn-primary" style="flex:1" data-ok>Reject order</button>`,
                onMount(m, close) {
                  const sel = m.querySelector('#agg-rej-reason');
                  const other = m.querySelector('#agg-rej-other');
                  sel.onchange = () => {
                    other.style.display = sel.value === 'other' ? '' : 'none';
                  };
                  m.querySelector('[data-x]').onclick = () => {
                    close();
                    resolve(false);
                  };
                  m.querySelector('[data-ok]').onclick = () => {
                    reason =
                      sel.value === 'other'
                        ? (other.value || '').trim() || 'Rejected by outlet'
                        : sel.value;
                    close();
                    resolve(true);
                  };
                },
              });
            }).then(async (ok) => {
              if (!ok) return;
              order.row.rejectReason = reason;
              await persistOnlineStatus(i, 'Rejected', 'Rejected · ' + reason.slice(0, 40), 'fa-xmark');
            });
          } else {
            const r = window.prompt('Reject reason?', reason);
            if (r == null) return;
            order.row.rejectReason = r || reason;
            await persistOnlineStatus(i, 'Rejected', 'Order rejected', 'fa-xmark');
          }
        }
      );
      $$('[data-rider]', sec).forEach((b) =>
        b.onclick = () => persistOnlineStatus(+b.dataset.rider, 'Picked Up', 'Rider pickup recorded', 'fa-motorcycle')
      );

      const refreshBtn = sec.querySelector('#agg-refresh');
      if (refreshBtn) refreshBtn.onclick = () => renderAgg();
      const seedDemo = () => {
        const plats = ['swiggy', 'zomato', 'ondc'];
        const pick = plats[Math.floor(Math.random() * plats.length)];
        seedDemoOnlineOrder(pick);
      };
      const seedBtn = sec.querySelector('#agg-seed');
      if (seedBtn) seedBtn.onclick = seedDemo;
      const emptyDemo = sec.querySelector('#agg-empty-demo');
      if (emptyDemo) emptyDemo.onclick = seedDemo;
      const openWebhook = () => {
        const wh = sec.querySelector('#agg-webhook-info');
        if (wh) wh.click();
      };
      const emptyWh = sec.querySelector('#agg-empty-webhook');
      if (emptyWh) emptyWh.onclick = openWebhook;
      const whBtn = sec.querySelector('#agg-webhook-info');
      if (whBtn)
        whBtn.onclick = () => {
          const sess = (window.RS_API && RS_API.session && RS_API.session()) || {};
          const tid = sess.tenant_id || '';
          const base =
            (window.RS_API && RS_API.functionsBase) ||
            (window.__SUPABASE_URL__
              ? String(window.__SUPABASE_URL__).replace(/\/+$/, '') + '/functions/v1'
              : 'https://YOUR_PROJECT.supabase.co/functions/v1');
          const url = `${base}/aggregator-webhook?tenant_id=${encodeURIComponent(tid)}`;
          const body = `<div style="font-size:13px;line-height:1.55;color:var(--text-soft)">
          <p style="margin:0 0 10px;color:var(--text)"><b>Webhook URL</b> (POST JSON, Authorization: Bearer AGGREGATOR_WEBHOOK_SECRET)</p>
          <code style="display:block;padding:10px;border-radius:8px;background:var(--glass);border:1px solid var(--stroke);word-break:break-all;font-size:11.5px">${esc(url)}</code>
          <p style="margin:12px 0 0">Body fields: <code>platform</code>, <code>order_id</code>, <code>customer_name</code>, <code>customer_phone</code>, <code>items[]</code>, <code>total_amount</code>.</p>
        </div>`;
          if (window.RSModal) {
            RSModal.open({
              title: 'Aggregator webhook',
              icon: 'fa-link',
              size: 'sm',
              body,
              foot: '<button class="btn btn-primary" id="agg-wh-close">Close</button>',
              onMount(m, close) {
                const c = m.querySelector('#agg-wh-close');
                if (c) c.onclick = close;
              },
            });
          } else {
            window.prompt('Webhook URL', url);
          }
        };

      // Auto-refresh while tab is active
      if (window.__rsAggPoll) clearInterval(window.__rsAggPoll);
      window.__rsAggPoll = setInterval(() => {
        const active = document.getElementById('aggregator-tab');
        if (active && active.classList.contains('active')) renderAgg();
        else {
          clearInterval(window.__rsAggPoll);
          window.__rsAggPoll = null;
        }
      }, 12000);
    }

    RS.titles['aggregator-tab'] = ['Online Orders', 'Zomato, Swiggy & ONDC orders'];
    RS.addRenderer('aggregator-tab', renderAgg);
    RS.openOnlineOrderInPos = openOnlineOrderInPos;
    RS.seedDemoOnlineOrder = seedDemoOnlineOrder;
    if (!window.__rsAggSyncBound) {
      window.__rsAggSyncBound = true;
      document.addEventListener('rs:pending_orders_synced', () => {
        refreshOnlineOrders().then(() => {
          const active = document.getElementById('aggregator-tab');
          if (active && active.classList.contains('active')) {
            try {
              renderAgg();
            } catch (e) {}
          }
        });
      });
    }

    /* ===================== CUSTOMERS / CRM ===================== */
    const CUSTOMERS = [];
    const tierCls = {vip:'tier-vip',gold:'tier-gold',silver:'tier-silver'};
    function renderCustomers(){
      const sec = $('#customers-tab');
      if(!sec) return;
      if(window.RS_DB){
        sec.innerHTML = '<div class="sr-empty">Loading customers...</div>';
        RS_DB.list('customers').then(rows => {
          if (rows && rows.length) {
            CUSTOMERS.length = 0;
            rows.forEach(r => CUSTOMERS.push(r));
          }
          drawCustomersUI(sec);
        }).catch(e => {
          console.warn("Failed loading customers from DB", e);
          drawCustomersUI(sec);
        });
      } else {
        drawCustomersUI(sec);
      }
    }

    function formatCustBillTime(b) {
      const raw = b && (b.dateTime || b.time || b.created_at || '');
      if (!raw) return '—';
      const d = new Date(raw);
      if (!Number.isNaN(d.getTime())) {
        try {
          return d.toLocaleString(undefined, {
            day: '2-digit',
            month: 'short',
            hour: 'numeric',
            minute: '2-digit',
            hour12: true,
          });
        } catch (_) {
          return d.toLocaleString();
        }
      }
      return String(raw);
    }
    function billTimeMs(b) {
      const raw = b && (b.dateTime || b.time || b.created_at);
      if (!raw) return 0;
      const t = new Date(raw).getTime();
      return Number.isNaN(t) ? 0 : t;
    }
    function normalizeCustTier(t) {
      const s = String(t || 'silver').toLowerCase();
      if (s === 'platinum' || s === 'vip') return 'vip';
      if (s === 'gold') return 'gold';
      if (s === 'bronze') return 'silver'; // map bronze → silver badge
      return 'silver';
    }

    function drawCustomersUI(sec){
      // Calculate visits and spend dynamically for each customer from RS.BILLS
      const bills = RS.BILLS || [];
      CUSTOMERS.forEach(c => {
        const cBills = bills
          .filter(
            (b) =>
              b.customerPhone === c.phone ||
              (b.customerName && b.customerName !== 'Walk-in Guest' && b.customerName === c.name)
          )
          .sort((a, b) => billTimeMs(b) - billTimeMs(a));
        c.visits = cBills.length;
        c.spend = cBills.reduce((sum, b) => sum + (b.amount || 0), 0);
        c.last = cBills.length > 0 ? formatCustBillTime(cBills[0]) : 'never';
        c.tier = normalizeCustTier(c.tier);
      });

      const total = CUSTOMERS.length || 1;
      const repeat = Math.round(CUSTOMERS.filter(c=>c.visits>1).length/total*100);
      const totalSpend = CUSTOMERS.reduce((a,c)=>a+(c.spend||0),0);
      const totalDues = CUSTOMERS.reduce((a,c)=>a+(c.dues||0),0);
      sec.innerHTML = `
        <div class="stat-row">
          <div class="stat-card"><div class="stat-ic bg-o"><i class="fa-solid fa-users"></i></div><div><div class="sv">${CUSTOMERS.length}</div><div class="sl">Total customers</div><div class="sd" style="display:none"></div></div></div>
          <div class="stat-card"><div class="stat-ic bg-g"><i class="fa-solid fa-repeat"></i></div><div><div class="sv">${repeat}%</div><div class="sl">Repeat rate</div></div></div>
          <div class="stat-card"><div class="stat-ic bg-v"><i class="fa-solid fa-chart-line"></i></div><div><div class="sv">${rs(Math.round(totalSpend/total))}</div><div class="sl">Avg lifetime spend</div></div></div>
          <div class="stat-card"><div class="stat-ic bg-a" style="background: rgba(255, 79, 0, 0.1); color: var(--orange);"><i class="fa-solid fa-hand-holding-dollar"></i></div><div><div class="sv" id="crm-total-dues">${rs(totalDues)}</div><div class="sl">Total Outstanding Dues</div></div></div>
        </div>
        <div class="toolbar-row"><div class="pos-search grow" style="max-width:320px;padding:9px 14px"><i class="fa-solid fa-magnifying-glass"></i><input id="crm-search" placeholder="Search name or phone..." autocomplete="off"></div><div class="grow"></div><button type="button" class="btn btn-ghost btn-sm" id="btn-crm-broadcast"><i class="fa-brands fa-whatsapp"></i> Broadcast</button><button type="button" class="btn btn-primary btn-sm" id="btn-add-customer"><i class="fa-solid fa-user-plus"></i> Add customer</button></div>
        <div class="crm-grid" id="crm-grid"></div>`;
      const grid = $('#crm-grid');
      function draw(q=''){ const t=q.toLowerCase();
        const list = CUSTOMERS.filter(c=>String(c.name||'').toLowerCase().includes(t)||String(c.phone||'').includes(t));
        if (!CUSTOMERS.length) {
          grid.innerHTML = `<div class="sr-empty" style="grid-column:1/-1;padding:40px 20px">
            <i class="fa-solid fa-address-book" style="font-size:26px;opacity:.4;display:block;margin-bottom:10px"></i>
            <div style="font-weight:700;margin-bottom:6px">No customers yet</div>
            <div style="font-size:13px;color:var(--text-soft);max-width:360px;margin:0 auto 14px;line-height:1.45">Guests from POS bills appear here, or add/import a loyalty profile.</div>
            <button type="button" class="btn btn-primary btn-sm" id="crm-empty-add"><i class="fa-solid fa-user-plus"></i> Add customer</button>
          </div>`;
          const ea = grid.querySelector('#crm-empty-add');
          if (ea) ea.onclick = () => document.getElementById('btn-add-customer')?.click();
          return;
        }
        grid.innerHTML = list.length ? list.map((c)=>`
          <div class="crm-card" data-i="${CUSTOMERS.indexOf(c)}" role="button" tabindex="0">
            <div class="crm-top"><div class="crm-av" style="background:${(RS.avatarColors||['#FF4F00'])[String(c.name||'').length%(RS.avatarColors||['#FF4F00']).length]}">${RS.initials ? RS.initials(c.name) : (c.name||'?')[0]}</div><div style="flex:1"><div class="crm-name">${esc(c.name)} <span class="tier-badge ${esc(tierCls[c.tier||'silver']||'tier-silver')}">${esc(c.tier||'silver')}</span>${c.dues > 0 ? `<span class="pill pill-orange" style="margin-left:6px; font-size:10px; padding: 2px 6px;"><i class="fa-solid fa-triangle-exclamation"></i> Due: ${rs(c.dues)}</span>` : ''}</div><div class="crm-phone">${esc(c.phone)}</div></div></div>
            <div class="crm-stats"><div class="cs"><div class="csv">${c.visits||0}</div><div class="csl">Visits</div></div><div class="cs"><div class="csv">${rs(c.spend||0)}</div><div class="csl">Spent</div></div><div class="cs"><div class="csv" style="font-size:12px">${esc(c.last||'never')}</div><div class="csl">Last order</div></div></div>
          </div>`).join('') : '<div class="sr-empty" style="grid-column:1/-1">No customers match your search</div>';
        $$('.crm-card',grid).forEach(el=> {
          const open = () => customerModal(CUSTOMERS[+el.dataset.i]);
          el.onclick = open;
          el.onkeydown = (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); open(); } };
        });
      }
      draw(); $('#crm-search').addEventListener('input', e=>draw(e.target.value));
      const addCustomerBtn = $('#btn-add-customer');
      if(addCustomerBtn && !$('#btn-import-customers')) {
        addCustomerBtn.insertAdjacentHTML('beforebegin', '<button type="button" class="btn btn-ghost btn-sm" id="btn-import-customers"><i class="fa-solid fa-file-import"></i> Import CSV</button><button type="button" class="btn btn-ghost btn-sm" id="btn-export-customers"><i class="fa-solid fa-file-csv"></i> Export CSV</button>');
      }
      const broadcastBtn = $('#btn-crm-broadcast') || $$('.toolbar-row .btn-ghost', sec).find(b => /Broadcast/i.test(b.textContent || ''));
      if(broadcastBtn) broadcastBtn.onclick = () => {
        if (!window.RSModal) { RS.toast('Modal module is unavailable', 'fa-circle-exclamation'); return; }
        RSModal.open({ title:'Broadcast to customers', sub:'Compose a WhatsApp message for your customer list', icon:'fa-bullhorn', size:'md',
          body:`<div style="display:flex;flex-direction:column;gap:12px">
            <div><label class="fl">Audience</label>
              <select class="form-input" id="bc-audience">
                <option value="all">All customers with a phone number</option>
                <option value="vip">VIP tier</option>
                <option value="gold">Gold tier</option>
                <option value="silver">Silver tier</option>
              </select>
            </div>
            <div><label class="fl">Message</label><textarea class="form-input" id="bc-message" rows="3" placeholder="e.g. This weekend only: 15% off all mains!"></textarea></div>
            <div id="bc-count" style="font-size:12px;color:var(--text-soft)"></div>
          </div>`,
          foot:`<button class="btn btn-ghost" style="flex:1" data-cancel>Cancel</button><button class="btn btn-primary" style="flex:1" data-review><i class="fa-solid fa-list-check"></i> Review recipients</button>`,
          onMount(modal, close){
            const audienceSel = modal.querySelector('#bc-audience');
            const countEl = modal.querySelector('#bc-count');
            const matching = () => {
              const aud = audienceSel.value;
              return CUSTOMERS.filter(c => c.phone && (aud==='all' || normalizeCustTier(c.tier)===aud));
            };
            const refreshCount = () => { countEl.textContent = matching().length + ' customer(s) match this audience.'; };
            refreshCount();
            audienceSel.addEventListener('change', refreshCount);
            modal.querySelector('[data-cancel]').onclick = close;
            modal.querySelector('[data-review]').onclick = async () => {
              const message = modal.querySelector('#bc-message').value.trim();
              if (!message) { RS.toast('Enter a message first', 'fa-circle-exclamation'); return; }
              const recipients = matching();
              if (!recipients.length) { RS.toast('No customers match this audience', 'fa-circle-exclamation'); return; }
              close();
              const campaignRow = { id: 'bcast_'+Date.now(), message, audience: audienceSel.value, recipientCount: recipients.length, createdAt: new Date().toISOString() };
              try { if (window.RS_DB) await RS_DB.put('broadcasts', campaignRow.id, campaignRow); } catch(e) { console.warn('Failed to save broadcast record', e); }
              // Browsers block bulk window.open() popups, so recipients are sent one at a time by the user
              // clicking each row below -- this genuinely opens a pre-filled WhatsApp chat per customer
              // rather than silently pretending a mass-send happened.
              RSModal.open({ title:'Send to '+recipients.length+' customer(s)', sub:'Click each customer to open their WhatsApp chat', icon:'fa-bullhorn', size:'sm',
                body:`<div style="display:flex;flex-direction:column;gap:8px;max-height:340px;overflow:auto">${recipients.map((c,i)=>`
                  <div class="row-actions" style="display:flex;align-items:center;justify-content:space-between;padding:8px 10px;border:1px solid var(--stroke);border-radius:10px">
                    <div><b>${esc(c.name)}</b><div style="font-size:11px;color:var(--text-mute)">${esc(c.phone)}</div></div>
                    <button class="btn btn-ghost btn-sm" data-send-i="${i}"><i class="fa-brands fa-whatsapp"></i> Send</button>
                  </div>`).join('')}</div>`,
                foot:`<button class="btn btn-primary" style="flex:1" data-done>Done</button>`,
                onMount(sendModal, closeSend){
                  sendModal.querySelector('[data-done]').onclick = closeSend;
                  sendModal.querySelectorAll('[data-send-i]').forEach(btn=>{
                    btn.onclick = () => {
                      const cst = recipients[+btn.dataset.sendI];
                      window.open(`https://wa.me/${String(cst.phone||'').replace(/\D/g,'')}?text=${encodeURIComponent(message)}`, '_blank', 'noopener,noreferrer');
                      btn.innerHTML = '<i class="fa-solid fa-check"></i> Sent';
                      btn.disabled = true;
                    };
                  });
                }
              });
              RS.toast('Broadcast ready for '+recipients.length+' customer(s)', 'fa-bullhorn');
            };
          }
        });
      };

      const exportCustomers = $('#btn-export-customers');
      if(exportCustomers) exportCustomers.onclick = () => {
        if(!CUSTOMERS.length) return RS.toast('No customers to export', 'fa-circle-exclamation');
        const csv = [
          'Name,Phone,Email,Visits,TotalSpend,Tier,LastVisit',
          ...CUSTOMERS.map(c => [c.name,c.phone,c.email||'',c.visits||0,c.spend||0,c.tier||'silver',c.last||''].map(v=>`"${String(v).replace(/"/g,'""')}"`).join(','))
        ].join('\n');
        RS.downloadFile(csv, 'text/csv;charset=utf-8;', `customers-export-${Date.now()}.csv`);
        RS.toast('Customers exported as CSV', 'fa-circle-check');
      };

      const importCustomers = $('#btn-import-customers');
      if(importCustomers) importCustomers.onclick = () => {
        const input = document.createElement('input');
        input.type = 'file';
        input.accept = '.csv';
        input.onchange = e => {
          const file = e.target.files[0];
          if(!file) return;
          const reader = new FileReader();
          reader.onload = async evt => {
            try {
              const rows = window.RestroSuite?.imports?.parseCsv ? window.RestroSuite.imports.parseCsv(evt.target.result) : [];
              if(!rows.length) throw new Error('No rows found in CSV');
              const cleanKey = v => String(v || '').toLowerCase().replace(/[^a-z0-9]/g,'');
              const getValue = (row, keys) => {
                const wanted = keys.map(cleanKey);
                for(const [key, value] of Object.entries(row || {})) {
                  if(wanted.includes(cleanKey(key)) && value !== '') return value;
                }
                return '';
              };
              const records = [];
              const skipped = [];
              let duplicatesCount = 0;
              rows.forEach((row, index) => {
                const name = String(getValue(row, ['name','customername'])).trim();
                const phone = String(getValue(row, ['phone','mobile','contact','customerphone'])).replace(/\D/g,'').slice(-10);
                if(!name || phone.length !== 10) { skipped.push(`Row ${index + 2}: name and valid 10-digit phone required`); return; }
                const existing = CUSTOMERS.find(x => String(x.phone) === String(phone));
                if (existing) duplicatesCount++;
                records.push({
                  _existing: existing,
                  name,
                  phone,
                  email:String(getValue(row, ['email'])).trim(),
                  visits:Number(getValue(row, ['visits'])) || 0,
                  spend:Number(getValue(row, ['totalspend','spend'])) || 0,
                  last:new Date().toISOString(),
                  tier:'silver'
                });
              });
              if(!records.length) throw new Error('No valid customer rows found');
              const res = await (RS.importPreview ? RS.importPreview({ 
                title: 'Import customers CSV', 
                summary: 'Customer rows will update loyalty profiles for this outlet and sync to Supabase when cloud is available.', 
                rows: records.length, 
                skipped, 
                duplicatesCount 
              }) : Promise.resolve({ proceed: window.confirm(`${records.length} customers ready. Continue import?`), behavior: 'overwrite' }));
              
              if(!res || !res.proceed) return;

              const finalRecords = [];
              records.forEach(item => {
                if (item._existing) {
                  if (res.behavior === 'skip') {
                    return;
                  } else if (res.behavior === 'keep') {
                    item.id = 'cust-' + item.phone + '-' + Date.now() + '-' + Math.floor(Math.random() * 1000);
                    // Suffix phone dynamically to allow unique database insertion
                    item.phone = item.phone.slice(0, 7) + Math.floor(100 + Math.random() * 900);
                  } else {
                    item.id = item._existing.id;
                  }
                } else {
                  item.id = 'cust-' + item.phone;
                }
                delete item._existing;
                finalRecords.push(item);
              });

              if(!finalRecords.length) {
                RS.toast('No new customers imported (duplicates skipped)', 'fa-circle-check');
                return;
              }

              const before = window.RS_LAST_CLOUD_ERROR && window.RS_LAST_CLOUD_ERROR.time;
              let saved = 0;
              if (window.RS && RS.setOperationStatus) {
                RS.setOperationStatus(`Importing 1/${finalRecords.length} customers...`, 'running', (1 / finalRecords.length) * 100);
              }
              for(let i = 0; i < finalRecords.length; i++) {
                const c = finalRecords[i];
                await RS.saveOne('customers', c);
                saved++;
                if (window.RS && RS.setOperationStatus) {
                  RS.setOperationStatus(`Importing ${saved}/${finalRecords.length} customers...`, 'running', (saved / finalRecords.length) * 100);
                }
              }
              if (window.RS && RS.finishOperationStatus) {
                RS.finishOperationStatus(`${saved} customers imported`);
              }
              const fallback = window.RS_LAST_CLOUD_ERROR && window.RS_LAST_CLOUD_ERROR.time !== before && window.RS_LAST_CLOUD_ERROR.collection === 'customers';
              RS.toast(fallback ? `${saved} customers saved locally. Cloud sync pending.` : `${saved} customers imported and synced`, fallback ? 'fa-cloud-arrow-up' : 'fa-circle-check');
              renderCustomers();
            } catch(err) {
              console.warn('Customer import failed', err);
              RS.toast('Import failed: '+err.message, 'fa-circle-exclamation');
            }
          };
          reader.readAsText(file);
        };
        input.click();
      };

      $('#btn-add-customer').onclick = () => {
        RSModal.open({
          title: 'Add customer', sub: 'Create new loyalty profile', icon: 'fa-user-plus', size: 'sm',
          body: `<div style="display:flex;flex-direction:column;gap:12px">
            <div class="form-group"><label>Full Name</label><input class="form-input" id="add-cust-name" placeholder="John Doe"></div>
            <div class="form-group"><label>Phone Number</label><input class="form-input" id="add-cust-phone" placeholder="+91 99999 99999"></div>
            <div class="form-group"><label>Email Address</label><input class="form-input" id="add-cust-email" placeholder="john@example.com"></div>
          </div>`,
          foot: `<button class="btn btn-ghost" data-x>Cancel</button><button class="btn btn-primary" id="btn-save-new-cust"><i class="fa-solid fa-check"></i> Save Customer</button>`,
          onMount(modal, close) {
            modal.querySelector('[data-x]').onclick = close;
            modal.querySelector('#btn-save-new-cust').onclick = async () => {
              const name = modal.querySelector('#add-cust-name').value.trim();
              const phone = modal.querySelector('#add-cust-phone').value.trim();
              const email = modal.querySelector('#add-cust-email').value.trim();
              if (!name || !phone) {
                RS.toast('Name and phone are required', 'fa-circle-exclamation');
                return;
              }
              if (window.RS_DB) {
                try {
                  const newCust = {
                    id: 'cust-' + Date.now(),
                    name, phone, email,
                    visits: 1, spend: 0, last: 'Today', tier: 'silver'
                  };
                  await RS_DB.put('customers', newCust.id, newCust);
                  RS.toast('Customer saved successfully', 'fa-circle-check');
                  close();
                  renderCustomers();
                } catch(e) {
                  console.warn("Failed saving customer", e);
                  RS.toast('Customer save failed: '+e.message, 'fa-circle-exclamation');
                }
              } else {
                close();
              }
            };
          }
        });
      };
    }
    function showSettleDuesModal(c, closeParentModal) {
      if (!c) return;
      // closeParentModal optional (POS cart may not open CRM modal)
      const afterClose = typeof closeParentModal === 'function' ? closeParentModal : () => {};
      RSModal.open({
        title: 'Settle Dues',
        sub: `${c.name} · Outstanding: ${rs(c.dues || 0)}`,
        icon: 'fa-hand-holding-dollar',
        size: 'sm',
        body: `
          <div style="display:flex; flex-direction:column; gap:16px;">
            <div class="form-group">
              <label style="font-weight:700; font-size:13px; color:var(--text-soft); display:block; margin-bottom:6px;">Settlement Amount</label>
              <input type="number" class="form-input" id="settle-amount" value="${c.dues || 0}" min="1" max="${c.dues || 0}" step="any" style="width:100%;">
            </div>
            <div class="form-group">
              <label style="font-weight:700; font-size:13px; color:var(--text-soft); display:block; margin-bottom:6px;">Payment Method</label>
              <select class="form-input" id="settle-method" style="width:100%;">
                <option>Cash</option>
                <option>UPI</option>
                <option>Card</option>
              </select>
            </div>
          </div>
        `,
        foot: `
          <button class="btn btn-ghost" style="flex:1" data-close-settle>Cancel</button>
          <button class="btn btn-primary" style="flex:1; background:var(--orange); border-color:var(--orange);" id="btn-confirm-settle">Confirm Payment</button>
        `,
        onMount(modal, closeSettle) {
          modal.querySelector('[data-close-settle]').onclick = closeSettle;
          modal.querySelector('#btn-confirm-settle').onclick = async () => {
            const amountInput = modal.querySelector('#settle-amount');
            const methodSelect = modal.querySelector('#settle-method');
            const settleAmt = parseFloat(amountInput.value);
            const method = methodSelect.value;
            
            if (isNaN(settleAmt) || settleAmt <= 0) {
              return RS.toast('Please enter a valid amount', 'fa-circle-exclamation');
            }
            if (settleAmt > (c.dues || 0)) {
              return RS.toast('Settlement amount cannot exceed outstanding dues', 'fa-circle-exclamation');
            }
            
            try {
              // Update customer dues
              c.dues = Math.max(0, (c.dues || 0) - settleAmt);
              if (window.RS_DB) {
                await RS_DB.put('customers', c.id, c);
              }
              // Notify POS cart banner to refresh
              try {
                document.dispatchEvent(
                  new CustomEvent('rs:customer-dues-updated', { detail: { customer: c } })
                );
              } catch (_) {}
              
              // Log settlement transaction in bills
              const now = new Date();
              const yyyymmdd = now.getFullYear() + String(now.getMonth() + 1).padStart(2, '0') + String(now.getDate()).padStart(2, '0');
              const hhmmss = String(now.getHours()).padStart(2, '0') + String(now.getMinutes()).padStart(2, '0') + String(now.getSeconds()).padStart(2, '0');
              const billNo = `RS-SETTLE-${yyyymmdd}-${hhmmss}`;
              const billTime = now.toLocaleString('en-IN', {
                day: '2-digit', month: 'short', hour: 'numeric', minute: '2-digit', hour12: true
              });
              const billRow = {
                id: billNo,
                orderId: billNo,
                no: billNo,
                time: billTime,
                dateTime: new Date().toISOString(),
                table: 'Dues Settlement',
                items: 1,
                amount: settleAmt,
                pay: method,
                paymentMethod: method,
                total: settleAmt,
                status: 'paid',
                customerName: c.name,
                customerPhone: c.phone,
                subtotal: settleAmt,
                gst: 0,
                cgst: 0,
                sgst: 0,
                _items: [{ name: 'Dues Settlement Payment', qty: 1, price: settleAmt }]
              };
              
              if (window.RS && Array.isArray(RS.BILLS)) {
                RS.BILLS.unshift(billRow);
              }
              if (window.RS_DB && RS_DB.put) {
                await RS_DB.put('bills', billNo, billRow);
              }
              
              RS.toast(`Settled ${rs(settleAmt)} dues successfully`, 'fa-circle-check');
              
              // Auto-trigger Receipt preview/print/WhatsApp modal
              if (window.RSReceipt && typeof window.RSReceipt.show === 'function') {
                const receiptBill = {
                  no: billRow.no,
                  time: billRow.time,
                  table: billRow.table,
                  customer: billRow.customerName,
                  customerPhone: billRow.customerPhone,
                  items: billRow._items.map(i => ({ name: i.name, qty: i.qty, price: i.price })),
                  sub: billRow.subtotal,
                  disc: 0,
                  gst: 0,
                  grand: billRow.total,
                  tenders: [{ method: billRow.paymentMethod, amount: billRow.total }],
                  change: 0
                };
                window.RSReceipt.show(receiptBill);
              }
              
              // Refresh views
              closeSettle();
              try {
                afterClose();
              } catch (_) {}
              try {
                renderCustomers();
              } catch (_) {}
            } catch (err) {
              console.error("Failed to settle dues", err);
              RS.toast('Error settling dues', 'fa-circle-exclamation');
            }
          };
        }
      });
    }

    // POS cart can settle dues without opening CRM
    window.RS_showSettleDues = (customer) => showSettleDuesModal(customer);

    function customerModal(c){
      if (!c) return;
      const custBills = (RS.BILLS || [])
        .filter(
          (b) =>
            b.customerPhone === c.phone ||
            (b.customerName && b.customerName !== 'Walk-in Guest' && b.customerName === c.name)
        )
        .sort((a, b) => billTimeMs(b) - billTimeMs(a));
      const history = custBills.slice(0, 12).map((b) => [
        formatCustBillTime(b),
        (b._items || []).map((i) => `${i.name} x${i.qty}`).join(', ') || (b.items != null ? b.items + ' items' : '—'),
        b.amount,
      ]);

      const avgVisit = c.visits > 0 ? Math.round(c.spend/c.visits) : 0;
      const points =
        window.RSLoyalty && typeof RSLoyalty.customerPoints === 'function'
          ? RSLoyalty.customerPoints(c)
          : c.points != null
            ? Math.floor(Number(c.points) || 0)
            : c.spend > 0
              ? Math.round(c.spend / 100)
              : 0;
      const tierLabel = String(normalizeCustTier(c.tier) || 'silver').toUpperCase();

      RSModal.open({ title:c.name, sub:c.phone+' · '+tierLabel+' member · '+points+' pts', icon:'fa-user', size:'md',
        body:`<div class="crm-stats" style="margin-bottom:16px"><div class="cs"><div class="csv">${c.visits||0}</div><div class="csl">Visits</div></div><div class="cs"><div class="csv">${rs(c.spend||0)}</div><div class="csl">Lifetime</div></div><div class="cs"><div class="csv">${rs(avgVisit)}</div><div class="csl">Avg / visit</div></div><div class="cs"><div class="csv" style="color:var(--orange)">${points}</div><div class="csl">Points</div></div></div>
          ${c.notes ? `<div style="font-size:12.5px;color:var(--text-soft);margin-bottom:12px;padding:8px 10px;background:var(--glass);border-radius:8px"><i class="fa-solid fa-sticky-note"></i> ${esc(c.notes)}</div>` : ''}
          ${c.dues > 0 ? `
          <div style="background:var(--orange-tint); border:1px solid rgba(255,107,0,0.3); border-radius:12px; padding:10px 14px; margin-bottom:16px; display:flex; justify-content:space-between; align-items:center;">
            <div style="font-size:13px; color:var(--text); font-weight:700;"><i class="fa-solid fa-triangle-exclamation" style="color:var(--orange); margin-right:6px;"></i> Outstanding dues: <span style="color:var(--orange); font-size:15px; font-weight:800;">${rs(c.dues)}</span></div>
            <button type="button" class="btn btn-sm btn-primary" style="background:var(--orange); border-color:var(--orange); font-size:11px;" id="modal-settle-dues-btn">Settle now</button>
          </div>` : ''}
          <div class="panel-head" style="margin-bottom:10px"><h3 style="font-size:14px">Recent orders</h3></div>
          <table class="data-table"><tbody>${history.length > 0 ? history.map(h=>`<tr><td style="white-space:nowrap">${esc(h[0])}</td><td style="color:var(--text-soft)">${esc(h[1])}</td><td class="td-strong" style="text-align:right">${rs(h[2])}</td></tr>`).join('') : '<tr><td colspan="3" style="text-align:center;color:var(--text-mute)">No order history</td></tr>'}</tbody></table>`,
        foot:`<button type="button" class="btn btn-ghost btn-sm" data-edit title="Edit profile"><i class="fa-solid fa-pen"></i></button>
              <button type="button" class="btn btn-ghost btn-sm" data-del title="Delete customer" style="color:var(--red)"><i class="fa-solid fa-trash-can"></i></button>
              <button type="button" class="btn btn-ghost" style="flex:1" data-wa><i class="fa-brands fa-whatsapp"></i> Message</button>
              ${c.dues > 0 ? `<button type="button" class="btn btn-primary" style="flex:1; background:var(--orange); border-color:var(--orange);" id="modal-settle-dues-foot"><i class="fa-solid fa-hand-holding-dollar"></i> Settle</button>` : ''}
              <button type="button" class="btn btn-ghost" style="flex:1; border:1px solid var(--stroke-2)" data-offer><i class="fa-solid fa-tags"></i> Offer</button>`,
        onMount(modal,close){
          modal.querySelector('[data-wa]').onclick=()=>{
            window.open(`https://wa.me/${String(c.phone||'').replace(/\D/g,'')}?text=${encodeURIComponent('Hi '+c.name+', thank you for dining with us.')}`, '_blank', 'noopener,noreferrer');
            close();
            RS.toast('WhatsApp message ready for '+c.name,'fa-whatsapp');
          };
          const editBtn = modal.querySelector('[data-edit]');
          if (editBtn)
            editBtn.onclick = () => {
              close();
              openEditCustomerModal(c);
            };
          const delBtn = modal.querySelector('[data-del]');
          if (delBtn)
            delBtn.onclick = async () => {
              if (!window.confirm('Delete ' + c.name + ' from customers? This cannot be undone.')) return;
              try {
                if (window.RS_DB && RS_DB.del) await RS_DB.del('customers', c.id);
                else if (RS.removeOne) await RS.removeOne('customers', c.id);
                const idx = CUSTOMERS.findIndex((x) => x === c || x.id === c.id);
                if (idx >= 0) CUSTOMERS.splice(idx, 1);
                close();
                RS.toast(c.name + ' deleted', 'fa-trash');
                renderCustomers();
              } catch (e) {
                console.warn(e);
                RS.toast('Delete failed', 'fa-circle-exclamation');
              }
            };
          modal.querySelector('[data-offer]').onclick=()=>{
            if (!window.RSModal) { RS.toast('Modal module is unavailable', 'fa-circle-exclamation'); return; }
            RSModal.open({ title:'Send offer to '+c.name, sub:c.phone, icon:'fa-tags', size:'sm',
              body:`<div style="display:flex;flex-direction:column;gap:12px">
                <div><label class="fl">Offer</label><input class="form-input" id="offer-title" placeholder="e.g. 20% off your next visit"></div>
                <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px">
                  <div><label class="fl">Discount %</label><input class="form-input" id="offer-pct" type="number" min="0" max="100" value="10"></div>
                  <div><label class="fl">Valid for (days)</label><input class="form-input" id="offer-days" type="number" min="1" value="14"></div>
                </div>
              </div>`,
              foot:`<button class="btn btn-ghost" style="flex:1" data-cancel>Cancel</button><button class="btn btn-primary" style="flex:1" data-send><i class="fa-brands fa-whatsapp"></i> Send via WhatsApp</button>`,
              onMount(offerModal, closeOffer){
                offerModal.querySelector('[data-cancel]').onclick = closeOffer;
                offerModal.querySelector('[data-send]').onclick = async () => {
                  const title = offerModal.querySelector('#offer-title').value.trim() || 'A special offer for you';
                  const pct = Math.max(0, Math.min(100, +offerModal.querySelector('#offer-pct').value || 0));
                  const days = Math.max(1, +offerModal.querySelector('#offer-days').value || 14);
                  const code = 'OFR' + Math.random().toString(36).slice(2,7).toUpperCase();
                  const expiry = new Date(Date.now() + days*24*60*60*1000).toLocaleDateString();
                  const msg = `Hi ${c.name}! ${title} -- use code ${code} for ${pct}% off, valid until ${expiry}.`;
                  const offerRow = { id: 'offer_'+Date.now(), code, title, pct, discount_pct: pct, customerPhone: c.phone, customerName: c.name, createdAt: new Date().toISOString(), expiresAt: expiry, status: 'sent' };
                  try { if (window.RS_DB) await RS_DB.put('offers', offerRow.id, offerRow); } catch(e) { console.warn('Failed to save offer record', e); }
                  window.open(`https://wa.me/${String(c.phone||'').replace(/\D/g,'')}?text=${encodeURIComponent(msg)}`, '_blank', 'noopener,noreferrer');
                  closeOffer();
                  close();
                  RS.toast('Offer '+code+' sent to '+c.name, 'fa-tags');
                };
              }
            });
          };
          const settleBtn = modal.querySelector('#modal-settle-dues-btn');
          if (settleBtn) {
            settleBtn.onclick = () => {
              showSettleDuesModal(c, close);
            };
          }
          const settleFoot = modal.querySelector('#modal-settle-dues-foot');
          if (settleFoot) {
            settleFoot.onclick = () => {
              showSettleDuesModal(c, close);
            };
          }
        }});
    }

    function openEditCustomerModal(c) {
      if (!c || !window.RSModal) return;
      RSModal.open({
        title: 'Edit customer',
        sub: c.name,
        icon: 'fa-pen',
        size: 'sm',
        body: `<div style="display:flex;flex-direction:column;gap:12px">
          <div><label class="fl">Full name</label><input class="form-input" id="edit-cust-name" value="${esc(c.name || '')}"></div>
          <div><label class="fl">Phone</label><input class="form-input" id="edit-cust-phone" value="${esc(c.phone || '')}"></div>
          <div><label class="fl">Email</label><input class="form-input" id="edit-cust-email" value="${esc(c.email || '')}"></div>
          <div><label class="fl">Tier</label>
            <select class="form-input" id="edit-cust-tier">
              <option value="silver" ${normalizeCustTier(c.tier)==='silver'?'selected':''}>Silver</option>
              <option value="gold" ${normalizeCustTier(c.tier)==='gold'?'selected':''}>Gold</option>
              <option value="vip" ${normalizeCustTier(c.tier)==='vip'?'selected':''}>VIP</option>
            </select>
          </div>
          <div><label class="fl">Notes</label><textarea class="form-input" id="edit-cust-notes" rows="2" placeholder="Allergies, preferences…">${esc(c.notes || '')}</textarea></div>
        </div>`,
        foot: `<button type="button" class="btn btn-ghost" style="flex:1" data-x>Cancel</button>
               <button type="button" class="btn btn-primary" style="flex:1" data-ok><i class="fa-solid fa-check"></i> Save</button>`,
        onMount(modal, close) {
          modal.querySelector('[data-x]').onclick = close;
          modal.querySelector('[data-ok]').onclick = async () => {
            const name = modal.querySelector('#edit-cust-name').value.trim();
            const phone = modal.querySelector('#edit-cust-phone').value.trim();
            if (!name || !phone) {
              RS.toast('Name and phone required', 'fa-circle-exclamation');
              return;
            }
            c.name = name;
            c.phone = phone;
            c.email = modal.querySelector('#edit-cust-email').value.trim();
            c.tier = normalizeCustTier(modal.querySelector('#edit-cust-tier').value);
            c.notes = modal.querySelector('#edit-cust-notes').value.trim();
            try {
              if (window.RS_DB) await RS_DB.put('customers', c.id, c);
              else if (RS.saveOne) await RS.saveOne('customers', c);
              RS.toast('Customer updated', 'fa-circle-check');
              close();
              renderCustomers();
            } catch (e) {
              console.warn(e);
              RS.toast('Save failed', 'fa-circle-exclamation');
            }
          };
        },
      });
    }
    RS.titles['customers-tab']=['Customers','CRM, loyalty & order history']; RS.addRenderer('customers-tab', renderCustomers);
    RS.showCustomerProfile = customerModal;

    /* ===================== GROWTH HUB SCREENS ===================== */
    const HUB = [
      {ic:'fa-calendar-check',bg:'bg-o',t:'Reservations',d:'Manage table bookings & waitlist',m:'Open module'},
      {ic:'fa-headset',bg:'bg-v',t:'Support Tickets',d:'Customer queries & complaints',m:'Open module'},
      {ic:'fa-truck-ramp-box',bg:'bg-t',t:'Purchase Orders',d:'Raise & track supplier POs',m:'Open module'},
      {ic:'fa-flask-vial',bg:'bg-g',t:'Recipe Costing',d:'Plate cost & margin calculator',m:'Open module'},
      {ic:'fa-tags',bg:'bg-a',t:'Offers & Coupons',d:'Build promos & festival deals',m:'Open module'},
      {ic:'fa-bullhorn',bg:'bg-o',t:'WhatsApp Campaigns',d:'Broadcast to your customer list',m:'Open module'},
      {ic:'fa-star',bg:'bg-v',t:'Feedback & Reviews',d:'Collect & respond to ratings',m:'Open module'},
      {ic:'fa-gift',bg:'bg-g',t:'Loyalty Program',d:'Points, tiers & rewards',m:'Open module'}
    ];
    function renderHub(){
      const grid = $('#hub-grid');
      grid.innerHTML = HUB.map((h,i)=>`<div class="hub-card" data-i="${i}"><div class="hub-ic ${h.bg}"><i class="fa-solid ${h.ic}"></i></div><h4>${h.t}</h4><p>${h.d}</p><span class="hub-meta"><span class="dot" style="color:var(--orange)"></span>${h.m}</span></div>`).join('');
      $$('.hub-card',grid).forEach(c=> c.onclick=()=> hubScreen(HUB[+c.dataset.i].t));
    }
    function renderGrowthHub(){ return renderHub(); }
    function table(head, rows){ return `<div class="table-scroll"><table class="data-table"><thead><tr>${head.map(h=>`<th>${h}</th>`).join('')}</tr></thead><tbody>${rows}</tbody></table></div>`; }
    async function hubScreen(name){
      let body='', size='md', icon='fa-rocket', sub='';
      let records = [];

      if(name==='Reservations'){ 
        icon='fa-calendar-check'; sub="Today's bookings"; size='lg';
        if (window.RS_DB) {
          try { records = await RS_DB.list('reservations'); } catch(e){}
        }
        body = records && records.length 
          ? table(['Time','Guest','Pax','Table','Status'], records.map(r=>`<tr><td class="td-strong">${r.time || '--'}</td><td>${r.guestName || '--'}</td><td>${r.pax || 2}</td><td>${r.tableNumber || '--'}</td><td><span class="pill ${r.status==='confirmed'?'pill-green':r.status==='pending'?'pill-amber':'pill-violet'}" style="padding:3px 10px;text-transform:capitalize">${r.status || 'confirmed'}</span></td></tr>`).join('')) 
          : '<div class="sr-empty">No reservations for today</div>'; 
      }
      else if(name==='Support Tickets'){ 
        icon='fa-headset'; sub='Open customer issues';
        if (window.RS_DB) {
          try { records = await RS_DB.list('support_tickets'); } catch(e){}
        }
        body = records && records.length 
          ? table(['Ticket','Subject','Customer','Priority','Status'], records.map(r=>`<tr><td><b>${r.ticketNumber}</b></td><td>${r.subject}</td><td>${r.customerName}</td><td><span class="pill ${r.priority==='high'?'pill-red':r.priority==='medium'?'pill-amber':''}" style="padding:3px 10px;text-transform:capitalize">${r.priority}</span></td><td><span class="pill ${r.status==='open'?'pill-orange':'pill-green'}" style="padding:3px 10px;text-transform:capitalize">${r.status}</span></td></tr>`).join('')) 
          : '<div class="sr-empty">No open support tickets</div>'; 
      }
      else if(name==='Recipe Costing'){ 
        icon='fa-flask-vial'; sub='Plate cost & margin across the menu'; size='lg';
        const rows = RS.MENU.slice(0,10).map(m=>{ 
          const ing=m.ingredients||[]; 
          const cost=ing.reduce((a,g)=>{const inv=(RS.INVENTORY||[]).find(x=>x.name===g.name);return a+(inv?g.qty*inv.cost:0);},0); 
          const c=cost||Math.round(m.price*0.32); 
          const margin=Math.round((1-c/m.price)*100); 
          return `<tr><td><b>${m.name}</b></td><td>${m.cat}</td><td class="td-strong">${rs(m.price)}</td><td>${rs(c)}</td><td style="color:var(--green)">${margin}%</td></tr>`; 
        }).join('');
        body = rows.length ? table(['Item','Category','Sells at','Plate cost','Margin'], rows) : '<div class="sr-empty">No menu items to calculate costing</div>'; 
      }
      else if(name==='Offers & Coupons'){ 
        icon='fa-tags'; sub='Active promotions';
        if (window.RS_DB) {
          try { records = await RS_DB.list('offers'); } catch(e){}
        }
        body = records && records.length 
          ? table(['Code','Offer','Usage','Status'], records.map(r=>`<tr><td><b>${r.code}</b></td><td>${r.description || 'Discount'}</td><td>${r.usageCount || 0}</td><td><span class="pill ${r.status==='active'?'pill-green':'pill-amber'}" style="padding:3px 10px;text-transform:capitalize">${r.status}</span></td></tr>`).join('')) 
          : '<div class="sr-empty">No active coupons or offers</div>'; 
      }
      else if(name==='Loyalty Program'){ 
        icon='fa-gift'; sub='Members & rewards';
        const crm = window.RS_DB ? await RS_DB.list('customers').catch(() => []) : [];
        const totalMembers = crm.length;
        const totalPoints = crm.reduce((sum, c) => sum + (c.points || 0), 0);
        body = `<div class="crm-stats" style="margin-bottom:16px"><div class="cs"><div class="csv">${totalMembers}</div><div class="csl">Members</div></div><div class="cs"><div class="csv">${totalPoints}</div><div class="csl">Points issued</div></div><div class="cs"><div class="csv">${Math.round(totalPoints * 0.1)}</div><div class="csl">Rewards claimed</div></div></div>`
          + table(['Tier','Members','Earn rate','Perk'], [
              ['VIP', crm.filter(c => c.spend >= 10000).length, '3× points', 'Free dessert monthly'],
              ['Gold', crm.filter(c => c.spend >= 5000 && c.spend < 10000).length, '2× points', 'Priority seating'],
              ['Silver', crm.filter(c => c.spend < 5000).length, '1× point', 'Birthday treat']
            ].map(r=>`<tr><td><span class="tier-badge ${r[0]==='VIP'?'tier-vip':r[0]==='Gold'?'tier-gold':'tier-silver'}">${r[0]}</span></td><td>${r[1]}</td><td>${r[2]}</td><td style="color:var(--text-soft)">${r[3]}</td></tr>`).join('')); 
      }
      else if(name==='WhatsApp Campaigns'){ 
        icon='fa-bullhorn'; sub='Broadcast performance';
        body = '<div class="sr-empty">No campaigns run yet</div>'; 
      }
      else if(name==='Feedback & Reviews'){ 
        icon='fa-star'; sub='Recent ratings';
        body = '<div class="sr-empty">No reviews collected yet</div>'; 
      }
      else if(name==='Purchase Orders'){ 
        RS.activateTab('inventory-tab'); 
        setTimeout(()=>{ const b=$$('#inventory-tab .seg button')[2]; b&&b.click(); },80); 
        RS.toast('Opening purchase orders','fa-truck-ramp-box'); 
        return; 
      }
      else { body = `<p style="color:var(--text-soft)">${name} module.</p>`; }

      const hideNewBtn = ['Recipe Costing', 'Loyalty Program', 'WhatsApp Campaigns', 'Feedback & Reviews'].includes(name);

      RSModal.open({ title:name, sub, icon, size, body,
        foot: hideNewBtn ? `<div class="grow"></div><button class="btn btn-ghost" data-cancel>Close</button>` : `<div class="grow"></div><button class="btn btn-primary" data-x><i class="fa-solid fa-plus"></i> New</button>`,
        onMount(modal,close){ 
          const cancelBtn = modal.querySelector('[data-cancel]');
          if (cancelBtn) cancelBtn.onclick = close;

          const newBtn = modal.querySelector('[data-x]');
          if (newBtn) {
            newBtn.onclick = () => {
              close();
              if (name === 'Reservations') {
                const _todayISO = new Date().toISOString().slice(0,10);
                const formBody = `
                  <div style="display:flex;flex-direction:column;gap:12px">
                    <div class="form-grid-2" style="display: grid; grid-template-columns: 1fr 1fr; gap: 12px;">
                      <div>
                        <label class="form-label" style="display:block;font-size:12px;margin-bottom:4px;color:var(--text-soft)">Guest Name</label>
                        <input type="text" id="res-guest" class="form-control" placeholder="e.g. John Doe" style="width:100%;padding:8px;border:1px solid var(--stroke);border-radius:6px;background:var(--panel);color:var(--text)">
                      </div>
                      <div>
                        <label class="form-label" style="display:block;font-size:12px;margin-bottom:4px;color:var(--text-soft)">Phone (WhatsApp)</label>
                        <input type="tel" id="res-phone" class="form-control" placeholder="e.g. 9876543210" style="width:100%;padding:8px;border:1px solid var(--stroke);border-radius:6px;background:var(--panel);color:var(--text)">
                      </div>
                    </div>
                    <div class="form-grid-2" style="display: grid; grid-template-columns: 1fr 1fr; gap: 12px;">
                      <div>
                        <label class="form-label" style="display:block;font-size:12px;margin-bottom:4px;color:var(--text-soft)">Date</label>
                        <input type="date" id="res-date" class="form-control" value="${_todayISO}" style="width:100%;padding:8px;border:1px solid var(--stroke);border-radius:6px;background:var(--panel);color:var(--text)">
                      </div>
                      <div>
                        <label class="form-label" style="display:block;font-size:12px;margin-bottom:4px;color:var(--text-soft)">Time</label>
                        <input type="time" id="res-time" class="form-control" value="19:30" style="width:100%;padding:8px;border:1px solid var(--stroke);border-radius:6px;background:var(--panel);color:var(--text)">
                      </div>
                    </div>
                    <div class="form-grid-2" style="display: grid; grid-template-columns: 1fr 1fr; gap: 12px;">
                      <div>
                        <label class="form-label" style="display:block;font-size:12px;margin-bottom:4px;color:var(--text-soft)">Pax (Guests)</label>
                        <input type="number" id="res-pax" class="form-control" value="4" style="width:100%;padding:8px;border:1px solid var(--stroke);border-radius:6px;background:var(--panel);color:var(--text)">
                      </div>
                      <div>
                        <label class="form-label" style="display:block;font-size:12px;margin-bottom:4px;color:var(--text-soft)">Table Number</label>
                        <input type="text" id="res-table" class="form-control" value="Table 05" style="width:100%;padding:8px;border:1px solid var(--stroke);border-radius:6px;background:var(--panel);color:var(--text)">
                      </div>
                    </div>
                  </div>
                `;
                RSModal.open({
                  title: 'New Reservation',
                  sub: 'Create a table booking',
                  icon: 'fa-calendar-check',
                  size: 'sm',
                  body: formBody,
                  foot: `<button class="btn btn-ghost" data-cancel>Cancel</button><button class="btn btn-primary" data-confirm><i class="fa-solid fa-plus"></i> Book Table</button>`,
                  onMount(resModal, resClose) {
                    resModal.querySelector('[data-cancel]').onclick = resClose;
                    resModal.querySelector('[data-confirm]').onclick = async () => {
                      const guestName = resModal.querySelector('#res-guest').value || '';
                      if (!guestName) return RS.toast('Guest name is required', 'fa-circle-exclamation');
                      const guestPhone = (resModal.querySelector('#res-phone').value || '').trim();
                      const date = resModal.querySelector('#res-date').value || _todayISO;
                      const time = resModal.querySelector('#res-time').value || '19:30';
                      const pax = Number(resModal.querySelector('#res-pax').value) || 2;
                      const tableNumber = resModal.querySelector('#res-table').value || '';

                      const id = RS.nextLogicalNo('RES');
                      const resRow = { id, time, date, guestName, guestPhone, pax, tableNumber, status: 'confirmed' };
                      resClose();
                      if (RS.saveOne) {
                        await RS.saveOne('reservations', resRow);
                        RS.toast('Reservation booked — table marked reserved', 'fa-circle-check');
                        try { document.dispatchEvent(new Event('rs:tables-updated')); } catch(e){}
                        try { if (typeof sendReservationWhatsApp === 'function') await sendReservationWhatsApp({ guestName, guestPhone, tableNumber, date, time, pax }); } catch(e){ console.warn('Reservation WhatsApp failed', e); }
                        hubScreen('Reservations');
                      }
                    };
                  }
                });
              } else if (name === 'Support Tickets') {
                const formBody = `
                  <div style="display:flex;flex-direction:column;gap:12px">
                    <div>
                      <label class="form-label" style="display:block;font-size:12px;margin-bottom:4px;color:var(--text-soft)">Customer Name</label>
                      <input type="text" id="tkt-cust" class="form-control" placeholder="e.g. Jane Smith" style="width:100%;padding:8px;border:1px solid var(--stroke);border-radius:6px;background:var(--panel);color:var(--text)">
                    </div>
                    <div class="form-grid-2" style="display: grid; grid-template-columns: 1fr 1fr; gap: 12px;">
                      <div>
                        <label class="form-label" style="display:block;font-size:12px;margin-bottom:4px;color:var(--text-soft)">Subject</label>
                        <input type="text" id="tkt-subject" class="form-control" placeholder="e.g. Double charged" style="width:100%;padding:8px;border:1px solid var(--stroke);border-radius:6px;background:var(--panel);color:var(--text)">
                      </div>
                      <div>
                        <label class="form-label" style="display:block;font-size:12px;margin-bottom:4px;color:var(--text-soft)">Priority</label>
                        <select id="tkt-priority" class="form-control" style="width:100%;padding:8px;border:1px solid var(--stroke);border-radius:6px;background:var(--panel);color:var(--text)">
                          <option value="high">High</option>
                          <option value="medium" selected>Medium</option>
                          <option value="low">Low</option>
                        </select>
                      </div>
                    </div>
                  </div>
                `;
                RSModal.open({
                  title: 'New Support Ticket',
                  sub: 'Log a customer issue',
                  icon: 'fa-headset',
                  size: 'sm',
                  body: formBody,
                  foot: `<button class="btn btn-ghost" data-cancel>Cancel</button><button class="btn btn-primary" data-confirm><i class="fa-solid fa-plus"></i> Open Ticket</button>`,
                  onMount(tktModal, tktClose) {
                    tktModal.querySelector('[data-cancel]').onclick = tktClose;
                    tktModal.querySelector('[data-confirm]').onclick = async () => {
                      const customerName = tktModal.querySelector('#tkt-cust').value || 'Guest';
                      const subject = tktModal.querySelector('#tkt-subject').value || '';
                      if (!subject) return RS.toast('Subject is required', 'fa-circle-exclamation');
                      const priority = tktModal.querySelector('#tkt-priority').value || 'medium';

                      const tktNum = RS.nextLogicalNo('TKT');
                      const tktRow = { id: tktNum, ticketNumber: tktNum, subject, customerName, priority, status: 'open' };
                      tktClose();
                      if (RS.saveOne) {
                        await RS.saveOne('support_tickets', tktRow);
                        RS.toast('Support ticket opened successfully', 'fa-circle-check');
                        hubScreen('Support Tickets');
                      }
                    };
                  }
                });
              } else if (name === 'Offers & Coupons') {
                const formBody = `
                  <div style="display:flex;flex-direction:column;gap:12px">
                    <div>
                      <label class="form-label" style="display:block;font-size:12px;margin-bottom:4px;color:var(--text-soft)">Coupon code</label>
                      <input type="text" id="off-code" class="form-control" placeholder="e.g. FESTIVE20" style="width:100%;padding:8px;border:1px solid var(--stroke);border-radius:6px;background:var(--panel);color:var(--text);text-transform:uppercase">
                    </div>
                    <div>
                      <label class="form-label" style="display:block;font-size:12px;margin-bottom:4px;color:var(--text-soft)">Title / description</label>
                      <input type="text" id="off-desc" class="form-control" placeholder="e.g. Festival 20% off" style="width:100%;padding:8px;border:1px solid var(--stroke);border-radius:6px;background:var(--panel);color:var(--text)">
                    </div>
                    <div class="form-grid-2" style="display:grid;grid-template-columns:1fr 1fr;gap:12px">
                      <div>
                        <label class="form-label" style="display:block;font-size:12px;margin-bottom:4px;color:var(--text-soft)">Percent off (%)</label>
                        <input type="number" id="off-pct" class="form-control" min="0" max="100" step="1" placeholder="e.g. 20" style="width:100%;padding:8px;border:1px solid var(--stroke);border-radius:6px;background:var(--panel);color:var(--text)">
                      </div>
                      <div>
                        <label class="form-label" style="display:block;font-size:12px;margin-bottom:4px;color:var(--text-soft)">Or fixed amount off</label>
                        <input type="number" id="off-fixed" class="form-control" min="0" step="1" placeholder="e.g. 100" style="width:100%;padding:8px;border:1px solid var(--stroke);border-radius:6px;background:var(--panel);color:var(--text)">
                      </div>
                    </div>
                    <p style="font-size:11.5px;color:var(--text-soft);margin:0;line-height:1.4">POS promo needs <b>% or fixed</b> — description alone will not discount the cart.</p>
                  </div>
                `;
                RSModal.open({
                  title: 'New Offer Coupon',
                  sub: 'Works with POS promo codes',
                  icon: 'fa-tags',
                  size: 'sm',
                  body: formBody,
                  foot: `<button class="btn btn-ghost" data-cancel>Cancel</button><button class="btn btn-primary" data-confirm><i class="fa-solid fa-plus"></i> Create Offer</button>`,
                  onMount(offModal, offClose) {
                    offModal.querySelector('[data-cancel]').onclick = offClose;
                    offModal.querySelector('[data-confirm]').onclick = async () => {
                      const code = String(offModal.querySelector('#off-code').value || '')
                        .trim()
                        .toUpperCase();
                      if (!code) return RS.toast('Coupon code is required', 'fa-circle-exclamation');
                      const description = offModal.querySelector('#off-desc').value || 'Discount Coupon';
                      const pct = Math.max(0, Math.min(100, Number(offModal.querySelector('#off-pct').value) || 0));
                      const fixed = Math.max(0, Number(offModal.querySelector('#off-fixed').value) || 0);
                      if (!(pct > 0 || fixed > 0)) {
                        return RS.toast('Enter percent off or a fixed amount', 'fa-circle-exclamation');
                      }
                      const id = RS.nextLogicalNo ? RS.nextLogicalNo('OFF') : 'OFF-' + Date.now();
                      const offRow = {
                        id,
                        code,
                        description,
                        title: description,
                        pct,
                        discount_pct: pct,
                        fixed,
                        amount: fixed,
                        usageCount: 0,
                        status: 'active',
                      };
                      offClose();
                      try {
                        if (RS.saveOne) await RS.saveOne('offers', offRow);
                        else if (window.RS_DB) await RS_DB.put('offers', id, offRow);
                        if (Array.isArray(RS.OFFERS)) RS.OFFERS.push(offRow);
                        RS.toast(
                          'Offer ' + code + ' · ' + (fixed > 0 ? rs(fixed) + ' off' : pct + '% off'),
                          'fa-circle-check'
                        );
                        hubScreen('Offers & Coupons');
                      } catch (e) {
                        console.warn(e);
                        RS.toast('Could not save offer', 'fa-circle-exclamation');
                      }
                    };
                  },
                });
              }
            };
          }
        }
      });
    }
    RS.openGrowthHubScreen = hubScreen;
    RS.addRenderer('growth-hub-tab', renderHub);
  }
  if(window.RS) boot(); else document.addEventListener('rs:ready', boot, { once:true });
})();
