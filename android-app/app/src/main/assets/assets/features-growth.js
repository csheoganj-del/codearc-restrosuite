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
      if (window.__rsGatewayReady === true && window.RS_API && typeof window.RS_API.data === 'function') {
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
          orderId: id,
          tableNumber: tableLabel,
          table: tableLabel,
          status: 'DineIn Active',
          items: [],
          total: 0,
          subtotal: 0,
          gst: 0,
          customerName: guest,
          customerPhone: '',
          covers: Number(options.covers || t.cap) || 0,
          orderType: 'Dine-in',
          paymentMethod: 'Cash',
          dateTime: new Date().toISOString(),
          priority: 'normal',
          source: 'floor_seat',
        };
        const saved = await RS_DB.put('pending_orders', id, row);
        const out = saved && typeof saved === 'object' ? { ...row, ...saved, orderId: saved.orderId || id } : { ...row, id };
        try {
          document.dispatchEvent(new Event('rs:tables-updated'));
        } catch (_) {}
        return out;
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
        // Prefer non-closed session; fall back to any row (unique on tenant+table)
        let session =
          (sessions || []).find(
            (s) => normTableKey(s.tableNumber) === key && s.status !== 'closed'
          ) || (sessions || []).find((s) => normTableKey(s.tableNumber) === key);
        if (session && session.status === 'active') {
          if (options.toast) RS.toast('QR ordering already open for this table', 'fa-qrcode');
          return true;
        }
        if (session && session.status === 'paused') {
          await RS_DB.put('table_sessions', session.id, {
            ...session,
            status: 'active',
            closedAt: null,
          });
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
          createdAt: (session && session.createdAt) || new Date().toISOString(),
          closedAt: null,
        };
        // Re-open closed row by id, or insert new (uuid generated server-side)
        if (session && session.id) updatedSess.id = session.id;
        const saved = await RS_DB.put(
          'table_sessions',
          session && session.id ? session.id : null,
          updatedSess
        );
        if (!saved) {
          console.warn('ensureTableQrSession: put returned empty for', key);
          return false;
        }
        if (options.toast !== false) {
          RS.toast('QR ordering open · guests can scan Table ' + tableN, 'fa-qrcode');
        }
        document.dispatchEvent(new Event('rs:tables-updated'));
        return true;
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
      const confirmMsg = isOpen
        ? 'Open QR ordering on all ' +
          total +
          ' tables?\n\nGuests can scan and order at every table until you close QR or free the table.'
        : 'Close QR ordering on all ' +
          total +
          ' tables?\n\nGuests will not be able to place new QR orders until you open QR again.\n\nBills and seated tables stay as they are.';
      // Electron: window.confirm can feel "stuck"; still use it but also log.
      let proceeded = false;
      try {
        proceeded = !!window.confirm(confirmMsg);
      } catch (e) {
        console.warn('confirm failed', e);
        proceeded = true; // if confirm throws, still try to open
      }
      if (!proceeded) return;

      const labelHtml = btn ? btn.innerHTML : '';
      if (btn) {
        btn.disabled = true;
        btn.innerHTML =
          '<i class="fa-solid fa-spinner fa-spin"></i> ' + (isOpen ? 'Opening' : 'Closing') + ' 0/' + total;
      }

      let okN = 0;
      let failN = 0;
      const failedNames = [];
      // Snapshot names so renderFloor mid-loop cannot clear the list
      const tableSnapshot = TABLES.map((t, i) => t.n || t.name || String(i + 1));
      for (let i = 0; i < tableSnapshot.length; i++) {
        const name = tableSnapshot[i];
        if (btn && document.body.contains(btn)) {
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
        } catch (err) {
          console.warn('bulkTableQrSessions item failed', name, err);
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
      try {
        await renderFloor();
      } catch (e) {
        console.warn('renderFloor after bulk QR', e);
      }

      if (failN === 0) {
        RS.toast(
          isOpen
            ? 'QR open on all ' + okN + ' tables — guests can scan'
            : 'QR closed on all ' + okN + ' tables',
          isOpen ? 'fa-qrcode' : 'fa-power-off'
        );
        // Open all QR should also show the cards so staff can print / verify
        if (isOpen && okN > 0) {
          try {
            await showAllTableQRs();
          } catch (e) {
            console.warn('showAllTableQRs after open-all', e);
            RS.toast('Sessions open — use Print Table QRs to show codes', 'fa-print');
          }
        }
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
        // Instant floor shape while orders/drafts load (no hung "Loading tables...")
        try {
          if (window.RSSkel && RSSkel.floorTiles) {
            RSSkel.paint(
              sec,
              RSSkel.floorTiles({ count: Math.max(6, (TABLES && TABLES.length) || 8) })
            );
          } else {
            sec.innerHTML = '<div class="sr-empty">Loading tables...</div>';
          }
        } catch (_) {
          sec.innerHTML = '<div class="sr-empty">Loading tables...</div>';
        }
        Promise.all([
          RS_DB.list('pending_orders'),
          RS_DB.list('reservations').catch(() => []),
          RS_DB.list('drafts').catch(() => []),
          RS_DB.list('table_sessions').catch(() => []),
        ]).then(([rows, reservations, drafts, tableSessions]) => {
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

          // Active guest QR sessions (Open all QR) — show on floor even when free
          const qrOpenKeys = new Set();
          (tableSessions || []).forEach((s) => {
            if (s && s.status === 'active') {
              const k = normTableKey(s.tableNumber);
              if (k) qrOpenKeys.add(k);
            }
          });

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
            // Guest QR ordering session open (independent of seating state)
            t.qrOpen = qrOpenKeys.has(normTableKey(t.n || t.name));
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
      const qrOpenN = TABLES.filter((t) => t.qrOpen).length;
      sec.innerHTML = `
        <div class="stat-row">
          <div class="stat-card"><div class="stat-ic bg-g"><i class="fa-solid fa-chair"></i></div><div><div class="sv">${free}</div><div class="sl">Free tables</div></div></div>
          <div class="stat-card"><div class="stat-ic bg-o"><i class="fa-solid fa-utensils"></i></div><div><div class="sv">${dining}</div><div class="sl">Dining now</div></div></div>
          <div class="stat-card"><div class="stat-ic bg-v"><i class="fa-solid fa-file-invoice"></i></div><div><div class="sv">${billed}</div><div class="sl">Awaiting payment</div></div></div>
          <div class="stat-card"><div class="stat-ic bg-a"><i class="fa-solid fa-qrcode"></i></div><div><div class="sv">${qrOpenN}</div><div class="sl">QR open${pendingQr ? ' · ' + pendingQr + ' new order' : ''}</div></div></div>
        </div>
        <div class="toolbar-row"><div class="floor-legend">
          <span class="lg"><span class="sw" style="background:var(--green)"></span> Available</span>
          <span class="lg"><span class="sw" style="background:var(--orange)"></span> Dining</span>
          <span class="lg"><span class="sw" style="background:var(--amber)"></span> QR pending</span>
          <span class="lg"><span class="sw" style="background:#0ea5e9"></span> QR open</span>
          <span class="lg"><span class="sw" style="background:#f59e0b"></span> Held</span>
          <span class="lg"><span class="sw" style="background:var(--violet-soft)"></span> Bill printed</span>
        </div><div class="grow"></div><button class="btn btn-primary btn-sm" id="btn-staff-scan-table" style="margin-right:8px;" title="Staff only: scan table QR with the app camera (not guest phone camera)"><i class="fa-solid fa-camera"></i> Scan table</button><button class="btn btn-ghost btn-sm" id="btn-refresh-floor" style="margin-right:8px;" title="Refresh floor"><i class="fa-solid fa-rotate"></i></button><button class="btn btn-ghost btn-sm" id="btn-open-all-qr" style="margin-right:8px;" title="Open guest QR ordering on every table, then show QR cards"><i class="fa-solid fa-qrcode"></i> Open all QR</button><button class="btn btn-ghost btn-sm" id="btn-close-all-qr" style="margin-right:8px;" title="Close guest QR ordering on every table"><i class="fa-solid fa-power-off"></i> Close all QR</button><button class="btn btn-ghost btn-sm" id="btn-clear-all-tables" style="margin-right:8px;color:var(--red)" title="Free every dining, held, or billed table"><i class="fa-solid fa-broom"></i> Clear all open</button><button class="btn btn-ghost btn-sm" id="btn-manage-seating" style="margin-right:8px;"><i class="fa-solid fa-chair"></i> Edit Tables</button><button class="btn btn-ghost btn-sm" id="btn-print-floor-qrs" style="margin-right:8px;"><i class="fa-solid fa-print"></i> Print Table QRs</button><span class="pill" title="Live floor status"><i class="fa-solid fa-location-dot"></i> ${TABLES.length} tables</span></div>
        <div class="floor-grid">${TABLES.length ? TABLES.map(
          (t) => `
          <div class="table-card ${t.state}${t.state === 'pending' ? ' needs-attention' : ''}${t.qrOpen ? ' table-qr-open' : ''}${t.state === 'occupied' && t.since && /h\s/.test(String(t.since)) ? ' table-long' : ''}" data-n="${esc(t.n)}" role="button" tabindex="0" aria-label="Table ${esc(t.n)} · ${esc(stateTxt[t.state] || t.state)}${t.qrOpen ? ' · QR open' : ''}">
            <span class="tdot" style="background:${stateDot[t.state] || stateDot.free}"></span>
            ${t.state === 'held' ? '<span class="table-held-badge"><i class="fa-solid fa-pause"></i> Held</span>' : ''}
            ${t.state === 'pending' ? '<span class="table-held-badge table-qr-badge"><i class="fa-solid fa-qrcode"></i> New</span>' : ''}
            ${t.qrOpen && t.state !== 'pending' ? '<span class="table-held-badge table-qr-badge" style="background:rgba(14,165,233,0.15);color:#0369a1;border-color:rgba(14,165,233,0.35)"><i class="fa-solid fa-qrcode"></i> QR on</span>' : ''}
            <div class="tnum2">Table ${esc(t.name || t.n)}</div><div class="tcap"><i class="fa-solid fa-user-group" style="font-size:10px"></i> ${esc(t.cap)} seats</div>
            <div class="tstate">${
              t.state === 'held'
                ? 'Held'
                : t.emptySeat
                  ? 'Seated'
                  : (stateTxt[t.state] || t.state)
            }${t.qrOpen ? ' · <span style="color:#0369a1;font-weight:700">QR open</span>' : ''}${(t.state === 'free' && t.reservedInfo) ? ` · <span style="color:#b45309;font-weight:700">Reserved ${esc(t.reservedInfo.time || '')}${t.reservedInfo.guestName ? ' · ' + esc(t.reservedInfo.guestName) : ''}</span>` : ''}${t.guest && String(t.guest).toLowerCase() !== 'guest' ? ` · ${esc(t.guest)}` : ''}</div>
            ${
              t.state === 'free'
                ? '<div class="tcap" style="margin-top:auto">' + (t.qrOpen ? 'Guest scan OK · tap to seat' : 'Tap to seat') + '</div>'
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
      const btnStaffScan = $('#btn-staff-scan-table', sec);
      if (btnStaffScan) {
        btnStaffScan.onclick = () => {
          if (window.RSStaffTableScanner && typeof RSStaffTableScanner.open === 'function') {
            RSStaffTableScanner.open();
          } else if (typeof window.openStaffTableScanner === 'function') {
            window.openStaffTableScanner();
          } else {
            RS.toast('Scanner loading — refresh dashboard', 'fa-circle-exclamation');
          }
        };
      }
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
    // Premium brand palette (dark modules stay scannable; accent on card chrome only)
    const QR_BRAND = {
      ink: '#0c1f1a',
      inkSoft: '#1a3d34',
      gold: '#c4a35a',
      goldSoft: '#e8d5a3',
      cream: '#fffcf7',
      creamDeep: '#f7f0e6',
      white: '#ffffff',
      mute: '#5c6b66',
    };

    async function makeTableQrDataUrl(orderUrl, size) {
      const px = size || 320;
      if (window.QRCode) {
        try {
          // Brand-tinted modules (still high contrast for scanning)
          return await QRCode.toDataURL(orderUrl, {
            width: px,
            margin: 2,
            errorCorrectionLevel: 'H',
            color: { dark: QR_BRAND.ink, light: QR_BRAND.white },
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
        '&ecc=H&margin=8&color=0c1f1a&bgcolor=ffffff&data=' +
        encodeURIComponent(orderUrl)
      );
    }

    async function getOutletPrintMeta() {
      let s = window.RS_SETTINGS || {};
      try {
        if (window.RS_DB && typeof RS_DB.getSettings === 'function') {
          const cloud = await RS_DB.getSettings().catch(() => null);
          if (cloud) s = { ...s, ...cloud };
        }
      } catch (_) {}
      const name =
        s.set_restaurant_name ||
        s.set_outlet_name ||
        s.business_name ||
        sessionStorage.getItem('tenant_name') ||
        'Restaurant';
      const phone = s.set_phone || s.set_contact_phone || s.phone || '';
      const wifi = s.set_wifi_name || s.set_wifi_ssid || s.wifi_ssid || '';
      const wifiPass = s.set_wifi_password || s.wifi_password || '';
      const tagline =
        s.set_tagline ||
        s.set_guest_welcome ||
        'This table only · Order food or call waiter';
      return {
        name: formatOutletTitle(name),
        phone: String(phone || '').trim(),
        wifi: String(wifi || '').trim(),
        wifiPass: String(wifiPass || '').trim(),
        tagline: String(tagline || '').trim(),
      };
    }

    /**
     * Print sizes — same portrait proportions as live preview.
     * Cards never stretch to fill the page; width is capped (cardMaxW) and height = content.
     * perPage enforces page-breaks only (not “fill the sheet”).
     */
    const QR_PRINT_SIZES = {
      mini: {
        id: 'mini',
        label: 'Mini sticker',
        hint: '16 per A4 (4×4)',
        cols: 4,
        perPage: 16,
        qrCss: 72,
        titlePx: 13,
        scanPx: 8,
        outletPx: 9,
        metaPx: 7,
        logoPx: 12,
        brandPx: 8,
        poweredPx: 6,
        gap: '3mm',
        margin: '8mm',
        // Fixed tent width — not 1fr stretch
        cardMaxW: '44mm',
        showSteps: false,
        showMeta: false,
      },
      small: {
        id: 'small',
        label: 'Small',
        hint: '9 per A4 (3×3)',
        cols: 3,
        perPage: 9,
        qrCss: 100,
        titlePx: 17,
        scanPx: 10,
        outletPx: 11,
        metaPx: 9,
        logoPx: 16,
        brandPx: 10,
        poweredPx: 7,
        gap: '4mm',
        margin: '10mm',
        cardMaxW: '58mm',
        showSteps: true,
        showMeta: true,
      },
      medium: {
        id: 'medium',
        label: 'Medium',
        hint: '4 per A4 (2×2)',
        cols: 2,
        perPage: 4,
        qrCss: 132,
        titlePx: 22,
        scanPx: 12,
        outletPx: 12,
        metaPx: 10,
        logoPx: 18,
        brandPx: 11,
        poweredPx: 8,
        gap: '6mm',
        margin: '12mm',
        cardMaxW: '82mm',
        showSteps: true,
        showMeta: true,
      },
      large: {
        id: 'large',
        label: 'Large',
        hint: '2 per A4 only',
        cols: 2,
        perPage: 2,
        qrCss: 150,
        titlePx: 24,
        scanPx: 12,
        outletPx: 13,
        metaPx: 10,
        logoPx: 20,
        brandPx: 12,
        poweredPx: 8,
        gap: '8mm',
        margin: '12mm',
        cardMaxW: '88mm',
        showSteps: true,
        showMeta: true,
      },
      full: {
        id: 'full',
        label: 'Full page',
        hint: '1 card per A4 (preview size, not fill page)',
        cols: 1,
        perPage: 1,
        // Same proportions as modal preview — just printed larger, not stretched
        qrCss: 168,
        titlePx: 26,
        scanPx: 13,
        outletPx: 13,
        metaPx: 11,
        logoPx: 20,
        brandPx: 12,
        poweredPx: 8,
        gap: '0',
        margin: '14mm',
        cardMaxW: '95mm',
        pageCenter: true,
        showSteps: true,
        showMeta: true,
      },
    };

    /** Defaults for Custom size (aligned with Medium / industry standard) */
    const QR_CUSTOM_SIZE_DEFAULT = {
      widthMm: 82,
      qrMm: 35,
      cols: 2,
      perPage: 4,
    };

    function clampNum(n, min, max, fallback) {
      const v = Number(n);
      if (!Number.isFinite(v)) return fallback;
      return Math.min(max, Math.max(min, v));
    }

    function getSavedCustomQrSize() {
      try {
        const raw = localStorage.getItem('rs:qr_print_custom');
        if (!raw) return { ...QR_CUSTOM_SIZE_DEFAULT };
        const o = JSON.parse(raw) || {};
        return {
          widthMm: clampNum(o.widthMm, 35, 120, QR_CUSTOM_SIZE_DEFAULT.widthMm),
          qrMm: clampNum(o.qrMm, 18, 60, QR_CUSTOM_SIZE_DEFAULT.qrMm),
          cols: clampNum(o.cols, 1, 4, QR_CUSTOM_SIZE_DEFAULT.cols),
          perPage: clampNum(o.perPage, 1, 16, QR_CUSTOM_SIZE_DEFAULT.perPage),
        };
      } catch (_) {
        return { ...QR_CUSTOM_SIZE_DEFAULT };
      }
    }
    function saveCustomQrSize(c) {
      try {
        const next = {
          widthMm: clampNum(c && c.widthMm, 35, 120, QR_CUSTOM_SIZE_DEFAULT.widthMm),
          qrMm: clampNum(c && c.qrMm, 18, 60, QR_CUSTOM_SIZE_DEFAULT.qrMm),
          cols: clampNum(c && c.cols, 1, 4, QR_CUSTOM_SIZE_DEFAULT.cols),
          perPage: clampNum(c && c.perPage, 1, 16, QR_CUSTOM_SIZE_DEFAULT.perPage),
        };
        // QR must fit inside card with padding
        if (next.qrMm > next.widthMm - 12) next.qrMm = Math.max(18, next.widthMm - 12);
        localStorage.setItem('rs:qr_print_custom', JSON.stringify(next));
        return next;
      } catch (_) {
        return getSavedCustomQrSize();
      }
    }

    /** Build a full size spec from custom mm/cols settings. */
    function buildCustomSizeSpec(c) {
      const cfg = c || getSavedCustomQrSize();
      const widthMm = clampNum(cfg.widthMm, 35, 120, 82);
      let qrMm = clampNum(cfg.qrMm, 18, 60, 35);
      if (qrMm > widthMm - 12) qrMm = Math.max(18, widthMm - 12);
      const cols = clampNum(cfg.cols, 1, 4, 2);
      const perPage = clampNum(cfg.perPage, 1, 16, cols * cols);
      // Scale type from Medium (82mm) baseline
      const sc = widthMm / 82;
      const qrCss = Math.round(qrMm * 3.78); // ~96dpi mm→px for screen/print CSS
      return {
        id: 'custom',
        label: 'Custom',
        hint: widthMm + ' mm wide · ' + cols + ' col · QR ' + qrMm + ' mm',
        cols,
        perPage,
        qrCss: Math.min(280, Math.max(48, qrCss)),
        titlePx: Math.round(Math.min(36, Math.max(12, 22 * sc))),
        scanPx: Math.round(Math.min(16, Math.max(8, 12 * sc))),
        outletPx: Math.round(Math.min(16, Math.max(8, 12 * sc))),
        metaPx: Math.round(Math.min(14, Math.max(7, 10 * sc))),
        logoPx: Math.round(Math.min(28, Math.max(12, 18 * sc))),
        brandPx: Math.round(Math.min(16, Math.max(9, 12 * sc))),
        poweredPx: Math.round(Math.min(10, Math.max(6, 8 * sc))),
        gap: cols >= 3 ? '4mm' : cols === 2 ? '6mm' : '0',
        margin: '12mm',
        cardMaxW: widthMm + 'mm',
        pageCenter: cols === 1,
        showSteps: true,
        showMeta: true,
        widthMm,
        qrMm,
      };
    }

    /** Resolve size id including custom. */
    function resolveQrPrintSizeId(sizeId) {
      const id = String(sizeId || '').trim();
      if (id === 'custom') return 'custom';
      return QR_PRINT_SIZES[id] ? id : 'medium';
    }

    /** Size object for presets or Custom (from localStorage). */
    function getQrPrintSize(sizeId) {
      const id = resolveQrPrintSizeId(sizeId);
      if (id === 'custom') return buildCustomSizeSpec(getSavedCustomQrSize());
      return QR_PRINT_SIZES[id] || QR_PRINT_SIZES.medium;
    }

    /**
     * Simple text-only Powered by footer (no logo image).
     * Single line: Powered by CODEARC RestroSuite
     */
    function restroSuitePoweredByFooterHtml(sizeId) {
      const sz = getQrPrintSize(sizeId);
      const isMini = sizeId === 'mini';
      const B = QR_BRAND;
      const labelPx = isMini ? 7 : Math.max(8, sz.poweredPx || 8);
      const namePx = isMini ? 9 : Math.max(11, (sz.brandPx || 13) - 1);
      return (
        `<div class="qr-powered" style="display:flex;flex-direction:row;flex-wrap:wrap;align-items:center;justify-content:center;gap:${
          isMini ? '4px 6px' : '5px 8px'
        };padding:${
          isMini ? '6px 8px' : '8px 12px'
        };background:linear-gradient(90deg,${B.ink} 0%,${B.inkSoft} 100%);box-sizing:border-box;border-top:1px solid rgba(196,163,90,.35)" aria-label="Powered by CODEARC RestroSuite">` +
        `<span style="font-size:${labelPx}px;font-weight:700;letter-spacing:.12em;text-transform:uppercase;color:rgba(255,255,255,.7);line-height:1;white-space:nowrap">Powered by</span>` +
        `<span style="font-size:${namePx}px;font-weight:800;letter-spacing:-.02em;color:#fff;line-height:1;white-space:nowrap"><span style="color:rgba(255,255,255,.85);font-weight:700;letter-spacing:.04em">CODEARC</span> Restro<span style="color:${B.goldSoft};font-weight:700">Suite</span></span>` +
        `</div>`
      );
    }

    function getSavedQrPrintSizeId() {
      try {
        const v = localStorage.getItem('rs:qr_print_size');
        if (v === 'custom' || (v && QR_PRINT_SIZES[v])) return v;
      } catch (_) {}
      return 'medium';
    }
    function saveQrPrintSizeId(id) {
      try {
        localStorage.setItem('rs:qr_print_size', resolveQrPrintSizeId(id));
      } catch (_) {}
    }

    /** Custom size fields for print modal (shown when Custom selected). */
    function buildQrCustomSizePanelHtml(c) {
      const cfg = c || getSavedCustomQrSize();
      const field = (id, label, val, min, max, step, unit) =>
        `<div style="min-width:0">
          <label class="fl" style="font-size:11px;margin-bottom:3px" for="${id}">${label}</label>
          <div style="display:flex;align-items:center;gap:6px">
            <input type="number" id="${id}" class="form-input" value="${val}" min="${min}" max="${max}" step="${step || 1}"
              style="width:100%;padding:7px 8px;font-size:13px">
            <span style="font-size:11px;color:var(--text-soft);flex-shrink:0">${unit || ''}</span>
          </div>
        </div>`;
      return `
        <div id="qr-custom-panel" style="display:none;margin-top:8px;padding:10px;border:1px solid var(--stroke-2);border-radius:12px;background:var(--panel)">
          <div style="font-size:11px;font-weight:800;text-transform:uppercase;letter-spacing:.05em;color:var(--text-mute);margin:0 0 8px">Custom size</div>
          <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px">
            ${field('qr-custom-width', 'Card width', cfg.widthMm, 35, 120, 1, 'mm')}
            ${field('qr-custom-qr', 'QR size', cfg.qrMm, 18, 60, 1, 'mm')}
            ${field('qr-custom-cols', 'Columns', cfg.cols, 1, 4, 1, '')}
            ${field('qr-custom-perpage', 'Cards / page', cfg.perPage, 1, 16, 1, '')}
          </div>
          <p style="font-size:10.5px;color:var(--text-soft);margin:8px 0 0;line-height:1.35">
            Standard table tent ≈ <b>82 mm</b> wide · QR ≈ <b>35 mm</b> · 2 columns · 4 / A4.
            Height follows content (same as preview).
          </p>
        </div>`;
    }
    function readCustomQrSizeFromModal(modal) {
      if (!modal) return getSavedCustomQrSize();
      const num = (id, fb) => {
        const el = modal.querySelector('#' + id);
        return el ? el.value : fb;
      };
      const d = QR_CUSTOM_SIZE_DEFAULT;
      return saveCustomQrSize({
        widthMm: num('qr-custom-width', d.widthMm),
        qrMm: num('qr-custom-qr', d.qrMm),
        cols: num('qr-custom-cols', d.cols),
        perPage: num('qr-custom-perpage', d.perPage),
      });
    }
    function syncCustomPanelVisibility(modal, sizeId) {
      const panel = modal && modal.querySelector('#qr-custom-panel');
      if (!panel) return;
      panel.style.display = sizeId === 'custom' ? 'block' : 'none';
    }

    /** Per-print content toggles (remembered). Table number is always on the card. */
    const QR_PRINT_OPTS_DEFAULT = {
      showWifi: true,
      showWifiPass: true,
      showPhone: true,
      showSteps: true,
      showTagline: true,
      showUses: true, // Order food + Call waiter (always recommended)
      showPoweredBy: true, // RestroSuite ad strip
    };
    function getQrPrintOpts() {
      try {
        const raw = localStorage.getItem('rs:qr_print_opts');
        if (!raw) return { ...QR_PRINT_OPTS_DEFAULT };
        const o = JSON.parse(raw);
        return {
          showWifi: o.showWifi !== false,
          showWifiPass: o.showWifiPass !== false,
          showPhone: o.showPhone !== false,
          showSteps: o.showSteps !== false,
          showTagline: o.showTagline !== false,
          showUses: o.showUses !== false,
          showPoweredBy: o.showPoweredBy !== false,
        };
      } catch (_) {
        return { ...QR_PRINT_OPTS_DEFAULT };
      }
    }
    function saveQrPrintOpts(opts) {
      try {
        localStorage.setItem('rs:qr_print_opts', JSON.stringify({ ...getQrPrintOpts(), ...opts }));
      } catch (_) {}
    }
    function readQrPrintOptsFromModal(modal) {
      if (!modal) return getQrPrintOpts();
      const chk = (id, fallback) => {
        const el = modal.querySelector('#' + id);
        if (!el) return fallback;
        return !!el.checked;
      };
      const cur = getQrPrintOpts();
      return {
        showWifi: chk('qr-opt-wifi', cur.showWifi),
        showWifiPass: chk('qr-opt-wifi-pass', cur.showWifiPass),
        showPhone: chk('qr-opt-phone', cur.showPhone),
        showSteps: chk('qr-opt-steps', cur.showSteps),
        showTagline: chk('qr-opt-tagline', cur.showTagline),
        showUses: chk('qr-opt-uses', cur.showUses),
        showPoweredBy: chk('qr-opt-powered', cur.showPoweredBy),
      };
    }
    function buildQrPrintOptsHtml(meta, opts, compact) {
      const o = opts || getQrPrintOpts();
      const m = meta || {};
      const hasWifi = !!(m.wifi && String(m.wifi).trim());
      const hasPass = !!(m.wifiPass && String(m.wifiPass).trim());
      const hasPhone = !!(m.phone && String(m.phone).trim());
      const pad = compact ? '7px 9px' : '9px 11px';
      const row = (id, label, checked, hint, disabled) =>
        `<label style="display:flex;align-items:center;gap:8px;padding:${pad};border:1px solid var(--stroke-2);border-radius:9px;cursor:${
          disabled ? 'not-allowed' : 'pointer'
        };background:var(--panel);opacity:${disabled ? '0.55' : '1'};min-width:0">
          <input type="checkbox" id="${id}" ${checked && !disabled ? 'checked' : ''} ${
            disabled ? 'disabled' : ''
          } style="margin:0;flex-shrink:0;accent-color:#c4a35a">
          <span style="min-width:0;text-align:left">
            <b style="font-size:${compact ? 12 : 12.5}px;color:var(--text);font-weight:700">${label}</b>
            ${
              hint && !compact
                ? `<div style="font-size:11px;color:var(--text-soft);margin-top:2px;line-height:1.3">${hint}</div>`
                : hint && compact
                  ? `<div style="font-size:10px;color:var(--text-soft);margin-top:1px;line-height:1.25;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:100%">${hint}</div>`
                  : ''
            }
          </span>
        </label>`;
      return `
        <div style="font-size:11px;font-weight:800;text-transform:uppercase;letter-spacing:.05em;color:var(--text-mute);margin:0 0 6px">On each card</div>
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:6px;margin-bottom:2px">
          ${row('qr-opt-table', 'Table number', true, compact ? 'Always on' : 'Always shown', true)}
          ${row('qr-opt-uses', 'Order + Call waiter', o.showUses, compact ? 'Main uses' : 'Two guest actions', false)}
          ${row('qr-opt-tagline', 'Welcome line', o.showTagline, compact ? '' : m.tagline || 'Settings → Guest welcome', false)}
          ${row('qr-opt-wifi', 'Wi‑Fi name', o.showWifi && hasWifi, hasWifi ? esc(m.wifi) : 'Set in Settings', !hasWifi)}
          ${row('qr-opt-wifi-pass', 'Wi‑Fi password', o.showWifiPass && hasPass, hasPass ? '••••' : 'Optional', !hasPass)}
          ${row('qr-opt-phone', 'Outlet phone', o.showPhone && hasPhone, hasPhone ? esc(m.phone) : 'Set in Settings', !hasPhone)}
          ${row('qr-opt-steps', 'Scan steps', o.showSteps, compact ? '1·2·3' : 'Camera → Scan → Use', false)}
          ${row('qr-opt-powered', 'Powered by RS', o.showPoweredBy, compact ? 'Logo + name' : 'RestroSuite ad strip', false)}
        </div>
        ${
          compact
            ? `<p style="font-size:10.5px;color:var(--text-soft);margin:8px 0 0;line-height:1.35">Wi‑Fi / phone: <b>Settings → Outlet profile</b></p>`
            : `<p style="font-size:11px;color:var(--text-soft);margin:8px 0 0;line-height:1.4">Tip: edit Wi‑Fi / phone under <b>Settings → Outlet profile → Guest QR cards</b>.</p>`
        }`;
    }

    /**
     * Premium tent card — FULLY INLINE STYLES so modal preview === print sheet.
     * Guests see two jobs clearly: Order food + Call waiter + Powered by RestroSuite.
     * @param {object} p
     */
    function buildGuestQrCardHtml(p) {
      const B = QR_BRAND;
      const outletName = esc(formatOutletTitle((p && p.outletName) || 'Restaurant'));
      const tbl = esc((p && p.tableLabel) || '—');
      const qrCodeUrl = (p && p.qrCodeUrl) || '';
      const sizeId = (p && p.sizeId) || 'medium';
      const sz = getQrPrintSize(sizeId);
      const phoneRaw = String((p && p.phone) || '').trim();
      const wifiRaw = String((p && p.wifi) || '').trim();
      const wifiPassRaw = String((p && p.wifiPass) || '').trim();
      const phone = esc(phoneRaw);
      const wifi = esc(wifiRaw);
      const wifiPass = esc(wifiPassRaw);
      const taglineRaw = String((p && p.tagline) || 'This table only · Order food or call waiter').trim();
      const tagline = esc(taglineRaw);
      const opts = (p && p.printOpts) || getQrPrintOpts();

      const showSteps = sz.showSteps !== false && opts.showSteps !== false;
      const showTagline = opts.showTagline !== false;
      const showUses = opts.showUses !== false;
      const showPoweredBy = opts.showPoweredBy !== false;
      const wantWifi = opts.showWifi !== false && !!wifiRaw;
      const wantPass = opts.showWifiPass !== false && !!wifiPassRaw && wantWifi;
      const wantPhone = opts.showPhone !== false && !!phoneRaw;
      const showMeta = sz.showMeta !== false && (wantWifi || wantPhone);

      const titlePx = sz.titlePx;
      const scanPx = sz.scanPx;
      const metaPx = sz.metaPx;
      const outletPx = Math.max(9, sz.outletPx - 1);
      const badgePx = Math.max(8, metaPx);
      const usePx = Math.max(10, metaPx + 2);
      const qr = sz.qrCss;
      const logoPx = sz.logoPx || 22;
      const brandPx = sz.brandPx || 13;
      const poweredPx = sz.poweredPx || 8;
      const isMini = sizeId === 'mini';
      const padX = isMini ? 8 : 14;
      const padY = isMini ? 8 : 12;
      // Purpose line: guests/staff know what the QR is for (dual workflow)
      const purposeLine = isMini
        ? 'Table QR · order or call waiter'
        : 'What this is for: guest self-order OR call waiter · same bill as staff';

      // —— Dual purpose strip (hero message) ——
      let usesHtml = '';
      if (showUses) {
        const cell = (num, label, gold) =>
          `<div style="flex:1;min-width:0;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:3px;padding:${
            isMini ? '5px 4px' : '8px 6px'
          };background:${gold ? 'linear-gradient(180deg,#fff9ec 0%,#fff 100%)' : '#fff'};border:1.5px solid ${
            gold ? B.gold : B.ink
          };border-radius:10px">
            <span style="display:inline-flex;align-items:center;justify-content:center;width:${
              isMini ? 14 : 18
            }px;height:${isMini ? 14 : 18}px;border-radius:50%;font-size:${
              isMini ? 8 : 10
            }px;font-weight:900;background:${gold ? 'linear-gradient(135deg,' + B.gold + ',' + B.goldSoft + ')' : B.ink};color:${
              gold ? B.ink : B.goldSoft
            }">${num}</span>
            <span style="font-size:${usePx}px;font-weight:800;color:${B.ink};line-height:1.15;letter-spacing:-.01em">${label}</span>
          </div>`;
        usesHtml = `<div style="display:flex;align-items:stretch;gap:6px;margin:0 0 ${
          isMini ? 6 : 10
        }px;width:100%;box-sizing:border-box" aria-label="Order food or call waiter">
          ${cell('1', isMini ? 'Order' : 'Order food', false)}
          ${cell('2', isMini ? 'Waiter' : 'Call waiter', true)}
        </div>`;
      }

      // —— Steps ——
      let stepsHtml = '';
      if (showSteps) {
        const step = (n, t) =>
          `<span style="display:inline-flex;align-items:center;gap:4px;font-size:${Math.max(
            8,
            metaPx
          )}px;font-weight:700;color:${B.mute}">
            <i style="font-style:normal;display:inline-flex;align-items:center;justify-content:center;width:15px;height:15px;border-radius:50%;background:${B.ink};color:${B.goldSoft};font-size:9px;font-weight:800">${n}</i>${t}
          </span>`;
        stepsHtml = `<div style="display:flex;flex-wrap:wrap;justify-content:center;gap:6px 10px;margin:0 0 2px">
          ${step(1, 'Camera')}
          ${step(2, 'Scan')}
          ${step(3, 'Order / Waiter')}
        </div>`;
      }

      // —— Meta wifi/phone ——
      let metaHtml = '';
      if (showMeta) {
        const bits = [];
        if (wantWifi) {
          bits.push(
            `<span style="font-size:${metaPx}px;font-weight:600;color:${B.inkSoft}"><span style="font-size:${Math.max(
              7,
              metaPx - 1
            )}px;font-weight:800;letter-spacing:.05em;text-transform:uppercase;color:${B.gold};margin-right:3px">Wi‑Fi</span>${wifi}${
              wantPass ? ' · ' + wifiPass : ''
            }</span>`
          );
        }
        if (wantPhone) {
          bits.push(
            `<span style="font-size:${metaPx}px;font-weight:600;color:${B.inkSoft}"><span style="font-size:${Math.max(
              7,
              metaPx - 1
            )}px;font-weight:800;letter-spacing:.05em;text-transform:uppercase;color:${B.gold};margin-right:3px">Phone</span>${phone}</span>`
          );
        }
        if (bits.length) {
          metaHtml = `<div style="display:flex;flex-wrap:wrap;justify-content:center;gap:6px 12px;margin-bottom:6px">${bits.join(
            ''
          )}</div>`;
        }
      }

      // —— Powered by: single-line professional footer (official mark art) ——
      let poweredHtml = '';
      if (showPoweredBy) {
        poweredHtml = restroSuitePoweredByFooterHtml(sz.id);
      }

      // Fixed width + content height = same look as live preview (never fill A4)
      const maxW = sz.cardMaxW || '90mm';
      const cardStyle = [
        'box-sizing:border-box',
        'background:linear-gradient(165deg,' + B.cream + ' 0%,#fff 45%,' + B.creamDeep + ' 100%)',
        'border:2px solid ' + B.ink,
        'border-radius:14px',
        'overflow:hidden',
        'page-break-inside:avoid',
        'break-inside:avoid',
        'display:block',
        'width:' + maxW,
        'max-width:100%',
        'height:auto',
        'min-height:0',
        'margin:0 auto',
        'font-family:"Segoe UI",system-ui,-apple-system,Roboto,"Helvetica Neue",Arial,sans-serif',
        'color:' + B.ink,
        '-webkit-print-color-adjust:exact',
        'print-color-adjust:exact',
        'box-shadow:0 2px 0 rgba(12,31,26,.06)',
      ].join(';');

      return `
        <div class="qr-print-card" data-size="${esc(sz.id)}" style="${cardStyle}">
          <div style="display:flex;align-items:center;justify-content:space-between;gap:8px;padding:${
            isMini ? '7px 8px' : '10px 12px'
          };background:linear-gradient(90deg,${B.ink} 0%,${B.inkSoft} 100%);color:#fff">
            <div style="font-size:${outletPx}px;font-weight:700;letter-spacing:.04em;text-transform:uppercase;line-height:1.2;max-width:68%;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;opacity:.96">${outletName}</div>
            <div style="flex-shrink:0;font-size:${badgePx}px;font-weight:800;letter-spacing:.05em;text-transform:uppercase;color:${B.ink};background:linear-gradient(135deg,${B.goldSoft},${B.gold});padding:3px 9px;border-radius:999px;white-space:nowrap">Scan me</div>
          </div>
          <div style="padding:${padY}px ${padX}px ${padY}px;text-align:center;box-sizing:border-box">
            <div style="font-weight:900;font-size:${titlePx}px;letter-spacing:-.03em;color:${B.ink};line-height:1.05;margin:0 0 2px">Table ${tbl}</div>
            ${
              showTagline
                ? `<div style="font-size:${scanPx}px;font-weight:600;color:${B.mute};margin:0 0 ${
                    isMini ? 4 : 8
                  }px;line-height:1.3">${tagline}</div>`
                : ''
            }
            ${usesHtml}
            <div style="display:inline-block;padding:3px;border-radius:14px;background:linear-gradient(145deg,${B.gold},${B.inkSoft} 55%,${B.goldSoft});margin:0 0 ${
              isMini ? 6 : 8
            }px;box-shadow:0 4px 14px rgba(12,31,26,.12)">
              <div style="padding:${isMini ? 5 : 8}px;background:#fff;border-radius:11px">
                <img src="${qrCodeUrl}" alt="Table ${tbl} — order or call waiter" width="${qr}" height="${qr}" style="display:block;width:${qr}px;height:${qr}px;max-width:100%" />
              </div>
            </div>
            <div style="font-size:${scanPx}px;font-weight:700;color:${B.inkSoft};margin:0 0 4px">Point camera at the code</div>
            <div style="font-size:${Math.max(
              7,
              metaPx
            )}px;font-weight:700;color:${B.mute};margin:0 0 ${
              showSteps ? 6 : 2
            }px;line-height:1.3;letter-spacing:.01em">${esc(purposeLine)}</div>
            ${stepsHtml}
            ${metaHtml}
          </div>
          ${poweredHtml}
        </div>`;
    }

    function qrPrintDocumentStyles(sizeId) {
      const sz = getQrPrintSize(sizeId);
      const B = QR_BRAND;
      const perPage = Math.max(1, Number(sz.perPage) || 4);
      const maxW = sz.cardMaxW || '';
      const pageCenter = !!sz.pageCenter;
      return `
        <style>
          @page { margin: ${sz.margin}; size: A4; }
          * { box-sizing: border-box; margin: 0; padding: 0; }
          body {
            font-family: "Segoe UI", system-ui, -apple-system, Roboto, "Helvetica Neue", Arial, sans-serif;
            color: ${B.ink}; background: #fff;
            -webkit-print-color-adjust: exact;
            print-color-adjust: exact;
          }
          .qr-print-toolbar {
            display: flex; align-items: center; justify-content: space-between;
            gap: 12px; flex-wrap: wrap;
            padding: 14px 18px; margin-bottom: 16px;
            background: linear-gradient(135deg, ${B.ink} 0%, ${B.inkSoft} 100%);
            color: #fff;
            position: sticky; top: 0; z-index: 10;
          }
          .qr-print-toolbar h1 { font-size: 15px; font-weight: 700; letter-spacing: -0.01em; }
          .qr-print-toolbar p { font-size: 12px; opacity: 0.8; margin-top: 2px; }
          .qr-print-toolbar button {
            border: none; border-radius: 8px; padding: 10px 18px;
            font-size: 13px; font-weight: 700; cursor: pointer;
            background: ${B.gold}; color: ${B.ink};
          }
          .qr-print-toolbar button.secondary {
            background: transparent; color: #fff; border: 1px solid rgba(255,255,255,0.35);
          }
          .qr-print-note {
            max-width: 980px; margin: 0 auto 14px; padding: 10px 14px;
            background: ${B.creamDeep}; border: 1px solid ${B.goldSoft};
            border-radius: 10px; font-size: 12px; color: ${B.mute}; line-height: 1.45;
          }
          .qr-print-grid {
            display: grid;
            grid-template-columns: repeat(${sz.cols}, 1fr);
            gap: ${sz.gap};
            max-width: ${pageCenter ? maxW || '120mm' : '980px'};
            margin: 0 auto;
            padding: ${pageCenter ? '12mm 0' : '0 4mm 12mm'};
            align-items: start;
            justify-items: ${pageCenter ? 'center' : 'stretch'};
          }
          .qr-print-card {
            width: 100%;
            ${maxW ? 'max-width:' + maxW + ';' : ''}
            page-break-inside: avoid !important;
            break-inside: avoid !important;
          }
          .qr-print-card:nth-child(${perPage}n) {
            page-break-after: always;
            break-after: page;
          }
          .qr-print-card:last-child {
            page-break-after: auto !important;
            break-after: auto !important;
          }
          .qr-print-single {
            max-width: ${maxW || '120mm'};
            margin: 24px auto;
          }
          .qr-print-single .qr-print-grid {
            grid-template-columns: 1fr;
            max-width: ${maxW || '120mm'};
            padding: 0;
          }
          @media print {
            .qr-print-toolbar, .qr-print-note, .no-print { display: none !important; }
            body { background: #fff; }
            .qr-print-grid {
              max-width: ${pageCenter ? maxW || '108mm' : 'none'};
              padding: ${pageCenter ? '0' : '0'};
              width: ${pageCenter ? maxW || '108mm' : '100%'};
            }
          }
          @media screen {
            body { background: #e8ebe9; padding-bottom: 32px; }
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
      const sizeId = resolveQrPrintSizeId((meta && meta.sizeId) || getSavedQrPrintSizeId());
      const sz = getQrPrintSize(sizeId);
      const sizeLabel = sz.label;
      const autoPrint = !!(meta && meta.autoPrint);

      if (!cardsHtml || !String(cardsHtml).trim()) {
        if (window.RS && RS.toast) RS.toast('Nothing to print — try again', 'fa-circle-exclamation');
        return null;
      }

      // Rebuild cards if caller passed raw table list (ensures size is baked in)
      let sheetCards = cardsHtml;
      if (meta && Array.isArray(meta.tableQrs) && meta.tableQrs.length) {
        sheetCards = buildCardsHtml(meta.tableQrs, meta.printMeta || {}, sizeId, meta.printOpts);
      }

      const toolbar = autoPrint
        ? ''
        : `<div class="qr-print-toolbar no-print">
            <div>
              <h1>${esc(title)}</h1>
              <p>${esc(formatOutletTitle(outlet))}${count ? ' · ' + count + ' cards' : ''} · <b>${esc(sizeLabel)}</b> (${sz.cols} per row · QR ${sz.qrCss}px)</p>
            </div>
            <div style="display:flex;gap:8px">
              <button type="button" class="secondary" onclick="window.close()">Close</button>
              <button type="button" onclick="window.print()">Print</button>
            </div>
          </div>
          <div class="qr-print-note no-print">
            Selected size: <b>${esc(sizeLabel)}</b> — ${esc(sz.hint || '')}.
            In the print dialog use <b>A4</b> and scale <b>100%</b> (not “Fit to page”) so card sizes stay correct.
            Before service: <b>Open all QR</b> so guest scans work.
          </div>`;

      const doc =
        '<!DOCTYPE html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>' +
        esc(title) +
        ' · ' +
        esc(sizeLabel) +
        '</title>' +
        qrPrintDocumentStyles(sizeId) +
        '</head><body data-qr-print-size="' +
        esc(sizeId) +
        '">' +
        toolbar +
        sheetCards +
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

    function buildCardsHtml(tableQrs, meta, sizeId, printOpts) {
      const m = meta || {};
      const opts = printOpts || getQrPrintOpts();
      const sid = resolveQrPrintSizeId(sizeId);
      const sz = getQrPrintSize(sid);
      // Inline grid styles so print sheet always matches selected size
      // (even if stylesheet sizeId is wrong / cached)
      const maxW = sz.cardMaxW || '';
      const pageCenter = !!sz.pageCenter;
      const gridStyle = [
        'display:grid',
        'grid-template-columns:repeat(' + sz.cols + ',1fr)',
        'gap:' + sz.gap,
        'max-width:' + (pageCenter && maxW ? maxW : '980px'),
        'margin:0 auto',
        'padding:' + (pageCenter ? '12mm 0' : '0 4mm 12mm'),
        'align-items:start',
        'justify-items:' + (pageCenter ? 'center' : 'stretch'),
        'box-sizing:border-box',
        'width:100%',
      ].join(';');
      return (
        '<div class="qr-print-grid" data-print-size="' +
        esc(sid) +
        '" style="' +
        gridStyle +
        '">' +
        tableQrs
          .map((t) =>
            buildGuestQrCardHtml({
              outletName: m.name || 'Restaurant',
              tableLabel: t.tableLabel,
              qrCodeUrl: t.qrCodeUrl,
              sizeId: sid,
              phone: m.phone,
              wifi: m.wifi,
              wifiPass: m.wifiPass,
              tagline: m.tagline,
              printOpts: opts,
            })
          )
          .join('') +
        '</div>'
      );
    }

    async function showSingleTableQR(t) {
      if (!window.RSModal) return;
      const tenantSlug = sessionStorage.getItem('tenant_slug') || 'outlet';
      const tableLabel = padTableLabel(t.n);
      const orderUrl = guestOrderUrl(tenantSlug, t.n);
      const [qrCodeUrl, meta] = await Promise.all([
        makeTableQrDataUrl(orderUrl, 360),
        getOutletPrintMeta(),
      ]);
      const savedSize = getSavedQrPrintSizeId();
      const savedOpts = getQrPrintOpts();
      const savedCustom = getSavedCustomQrSize();

      const sizeOptions = Object.keys(QR_PRINT_SIZES)
        .concat(['custom'])
        .map((id) => {
          const s = id === 'custom' ? buildCustomSizeSpec(savedCustom) : QR_PRINT_SIZES[id];
          return `<label style="display:flex;align-items:flex-start;gap:8px;padding:8px 10px;border:1px solid var(--stroke-2);border-radius:10px;cursor:pointer;margin-bottom:6px;text-align:left">
            <input type="radio" name="qr-size-one" value="${esc(id)}" ${id === savedSize ? 'checked' : ''} style="margin-top:3px">
            <span><b style="font-size:13px">${esc(s.label)}</b><br><span style="font-size:11px;color:var(--text-soft)">${esc(s.hint)}</span></span>
          </label>`;
        })
        .join('');

      const cardProps = (sizeId, opts) => ({
        outletName: meta.name,
        tableLabel,
        qrCodeUrl,
        sizeId: sizeId || 'medium',
        phone: meta.phone,
        wifi: meta.wifi,
        wifiPass: meta.wifiPass,
        tagline: meta.tagline,
        printOpts: opts || savedOpts,
      });

      let selectedSizeId = resolveQrPrintSizeId(savedSize);
      let selectedOpts = { ...savedOpts };
      const scaleOne = (id) => {
        const w = parseFloat(String((getQrPrintSize(id).cardMaxW || '82').replace('mm', ''))) || 82;
        if (w >= 95) return 0.5;
        if (w >= 88) return 0.58;
        if (w >= 80) return 0.7;
        if (w >= 55) return 0.85;
        return 1;
      };

      const body = `
        <div style="text-align:center;padding:4px 0 2px">
          <div style="background:linear-gradient(180deg,#eef1ef 0%,#e4e8e6 100%);border-radius:12px;padding:10px;margin-bottom:10px;border:1px solid var(--stroke-2);overflow:hidden">
            <div id="qr-preview-caption" style="font-size:10px;font-weight:800;letter-spacing:.08em;text-transform:uppercase;color:var(--text-mute);margin-bottom:6px">Live preview = print size</div>
            <div id="qr-single-preview" style="max-width:220px;margin:0 auto;transform-origin:top center;transform:scale(${scaleOne(
              selectedSizeId
            )});filter:drop-shadow(0 6px 14px rgba(12,31,26,.12));text-align:left">
            ${buildGuestQrCardHtml(cardProps(selectedSizeId, selectedOpts))}
            </div>
          </div>
          <div style="font-size:12px;font-weight:700;text-align:left;margin:4px 0 6px;color:var(--text)">Print size</div>
          <div id="qr-size-one-list" style="text-align:left">${sizeOptions}</div>
          <div style="text-align:left">${buildQrCustomSizePanelHtml(savedCustom)}</div>
          <div style="text-align:left">${buildQrPrintOptsHtml(meta, savedOpts)}</div>
        </div>
      `;

      RSModal.open({
        title: 'Table QR',
        sub: 'Table ' + tableLabel + ' · size & details',
        icon: 'fa-qrcode',
        size: 'sm',
        body,
        foot: `<button class="btn btn-ghost" style="flex:1" data-x>Close</button>
               <button class="btn btn-primary" style="flex:1" id="btn-print-single-qr"><i class="fa-solid fa-print"></i> Print card</button>`,
        onMount(modal, close) {
          modal.querySelector('[data-x]').onclick = close;
          const mbody = modal.querySelector('.rs-mbody');
          if (mbody) {
            mbody.style.flex = '1 1 auto';
            mbody.style.minHeight = '0';
            mbody.style.overflowY = 'auto';
            mbody.style.maxHeight = 'min(62vh, 520px)';
          }
          const refreshPreview = () => {
            const checked = modal.querySelector('input[name="qr-size-one"]:checked');
            selectedSizeId = resolveQrPrintSizeId((checked && checked.value) || selectedSizeId);
            if (selectedSizeId === 'custom') readCustomQrSizeFromModal(modal);
            selectedOpts = readQrPrintOptsFromModal(modal);
            if (!selectedOpts.showWifi) selectedOpts.showWifiPass = false;
            const box = modal.querySelector('#qr-single-preview');
            if (box) {
              box.style.transform = 'scale(' + scaleOne(selectedSizeId) + ')';
              box.innerHTML = buildGuestQrCardHtml(cardProps(selectedSizeId, selectedOpts));
            }
            const cap = modal.querySelector('#qr-preview-caption');
            if (cap) {
              const lab = getQrPrintSize(selectedSizeId).label || selectedSizeId;
              cap.textContent = 'Live preview = ' + lab;
            }
            syncCustomPanelVisibility(modal, selectedSizeId);
          };
          modal.addEventListener('change', (e) => {
            const t = e.target;
            if (!t || !t.matches) return;
            if (t.matches('input[name="qr-size-one"]')) {
              refreshPreview();
              return;
            }
            if (t.matches('#qr-custom-width, #qr-custom-qr, #qr-custom-cols, #qr-custom-perpage')) {
              const cr = modal.querySelector('input[name="qr-size-one"][value="custom"]');
              if (cr) cr.checked = true;
              selectedSizeId = 'custom';
              readCustomQrSizeFromModal(modal);
              refreshPreview();
              return;
            }
            if (t.matches('input[id^="qr-opt-"]')) {
              if (t.id === 'qr-opt-wifi' && !t.checked) {
                const pass = modal.querySelector('#qr-opt-wifi-pass');
                if (pass && !pass.disabled) pass.checked = false;
              }
              refreshPreview();
            }
          });
          ['qr-custom-width', 'qr-custom-qr', 'qr-custom-cols', 'qr-custom-perpage'].forEach((id) => {
            const el = modal.querySelector('#' + id);
            if (el)
              el.addEventListener('input', () => {
                const cr = modal.querySelector('input[name="qr-size-one"][value="custom"]');
                if (cr) cr.checked = true;
                selectedSizeId = 'custom';
                readCustomQrSizeFromModal(modal);
                refreshPreview();
              });
          });
          syncCustomPanelVisibility(modal, selectedSizeId);
          modal.querySelector('#btn-print-single-qr').onclick = () => {
            const checked = modal.querySelector('input[name="qr-size-one"]:checked');
            selectedSizeId = resolveQrPrintSizeId((checked && checked.value) || selectedSizeId);
            if (selectedSizeId === 'custom') readCustomQrSizeFromModal(modal);
            selectedOpts = readQrPrintOptsFromModal(modal);
            if (!selectedOpts.showWifi) selectedOpts.showWifiPass = false;
            saveQrPrintSizeId(selectedSizeId);
            saveQrPrintOpts(selectedOpts);
            const card = buildGuestQrCardHtml(cardProps(selectedSizeId, selectedOpts));
            openQrPrintWindow(
              'Table ' + tableLabel + ' QR',
              '<div class="qr-print-single"><div class="qr-print-grid" data-print-size="' +
                esc(selectedSizeId) +
                '" style="display:grid;grid-template-columns:1fr;max-width:440px;margin:24px auto">' +
                card +
                '</div></div>',
              { outlet: meta.name, count: 1, sizeId: selectedSizeId, autoPrint: false }
            );
          };
        },
      });
    }

    async function showAllTableQRs() {
      const tenantSlug = sessionStorage.getItem('tenant_slug') || 'outlet';

      if (!TABLES.length) {
        if (window.RS && RS.toast) RS.toast('Add tables first (Edit Tables)', 'fa-chair');
        return;
      }

      RS.toast('Preparing premium QR cards…', 'fa-qrcode');

      let tableQrs;
      let meta;
      try {
        meta = await getOutletPrintMeta();
        tableQrs = await Promise.all(
          TABLES.map(async (t) => {
            const orderUrl = guestOrderUrl(tenantSlug, t.n);
            const qrCodeUrl = await makeTableQrDataUrl(orderUrl, 360);
            return { tableNum: t.n, tableLabel: padTableLabel(t.n), qrCodeUrl, orderUrl };
          })
        );
      } catch (e) {
        console.warn(e);
        if (window.RS && RS.toast) RS.toast('Could not build QR cards', 'fa-circle-exclamation');
        return;
      }

      const savedSize = getSavedQrPrintSizeId();
      const savedOpts = getQrPrintOpts();
      const savedCustom = getSavedCustomQrSize();
      // Size chips + Custom
      const sizeIds = Object.keys(QR_PRINT_SIZES).concat(['custom']);
      const sizeRadios = sizeIds
        .map((id) => {
          const s = id === 'custom' ? buildCustomSizeSpec(savedCustom) : QR_PRINT_SIZES[id];
          const checked = id === savedSize ? 'checked' : '';
          return `<label class="qr-size-opt" data-size="${esc(id)}" style="display:flex;align-items:center;gap:6px;padding:7px 8px;border:1px solid var(--stroke-2);border-radius:9px;cursor:pointer;background:var(--panel);min-width:0">
            <input type="radio" name="qr-print-size" value="${esc(id)}" ${checked} style="margin:0;flex-shrink:0;accent-color:#c4a35a">
            <span style="min-width:0">
              <b style="font-size:12px;color:var(--text);display:block;line-height:1.2">${esc(s.label)}</b>
              <span style="font-size:10px;color:var(--text-soft);line-height:1.2">${esc(s.hint || '')}</span>
            </span>
          </label>`;
        })
        .join('');

      const sample = tableQrs[0];
      // Preview uses REAL print size (scaled to fit left column) so WYSIWYG matches sheet
      const previewScaleFor = (id) => {
        const sid = resolveQrPrintSizeId(id);
        const w = parseFloat(String((getQrPrintSize(sid).cardMaxW || '82').replace('mm', ''))) || 82;
        if (w >= 95) return 0.55;
        if (w >= 88) return 0.62;
        if (w >= 80) return 0.72;
        if (w >= 55) return 0.85;
        return 1;
      };

      if (!window.RSModal) {
        const sid0 = resolveQrPrintSizeId(savedSize);
        openQrPrintWindow('Table QR cards', buildCardsHtml(tableQrs, meta, sid0, savedOpts), {
          outlet: meta.name,
          count: tableQrs.length,
          sizeId: sid0,
          tableQrs,
          printMeta: meta,
          printOpts: savedOpts,
          autoPrint: false,
        });
        return;
      }

      const previewCol = sample
        ? `<div style="background:linear-gradient(180deg,#eef1ef 0%,#e4e8e6 100%);border-radius:14px;padding:12px 10px 14px;border:1px solid var(--stroke-2);height:100%;box-sizing:border-box;display:flex;flex-direction:column;align-items:center;justify-content:flex-start;overflow:hidden">
            <div id="qr-preview-caption" style="font-size:10px;font-weight:800;letter-spacing:.08em;text-transform:uppercase;color:var(--text-mute);text-align:center;margin-bottom:8px">Live preview = print size</div>
            <div id="qr-live-preview-wrap" style="width:100%;display:flex;justify-content:center;align-items:flex-start;min-height:200px">
              <div id="qr-live-preview" style="transform-origin:top center;transform:scale(${previewScaleFor(
                savedSize
              )});filter:drop-shadow(0 8px 18px rgba(12,31,26,.14))">
            ${buildGuestQrCardHtml({
              outletName: meta.name,
              tableLabel: sample.tableLabel,
              qrCodeUrl: sample.qrCodeUrl,
              sizeId: resolveQrPrintSizeId(savedSize),
              phone: meta.phone,
              wifi: meta.wifi,
              wifiPass: meta.wifiPass,
              tagline: meta.tagline,
              printOpts: savedOpts,
            })}
              </div>
            </div>
            <div id="qr-preview-size-pill" style="margin-top:10px;font-size:11px;font-weight:700;color:var(--text-soft);background:rgba(255,255,255,.75);border:1px solid var(--stroke-2);border-radius:999px;padding:4px 10px">${esc(
              getQrPrintSize(savedSize).label || 'Medium'
            )} · same as print</div>
          </div>`
        : '<div></div>';

      RSModal.open({
        title: 'Print premium QR cards',
        sub: meta.name + ' · ' + tableQrs.length + ' tables · left = preview · right = options',
        icon: 'fa-print',
        size: 'lg',
        body: `
          <div class="qr-print-split" style="display:grid;grid-template-columns:minmax(220px,280px) 1fr;gap:16px;align-items:start">
            <div class="qr-print-split-left">${previewCol}</div>
            <div class="qr-print-split-right" style="min-width:0;display:flex;flex-direction:column;gap:10px">
              <div>
                <div style="font-size:11px;font-weight:800;text-transform:uppercase;letter-spacing:.05em;color:var(--text-mute);margin:0 0 6px">Card size</div>
                <div id="qr-size-list" style="display:grid;grid-template-columns:1fr 1fr;gap:6px">
                  ${sizeRadios}
                </div>
                ${buildQrCustomSizePanelHtml(savedCustom)}
              </div>
              <div>${buildQrPrintOptsHtml(meta, savedOpts, true)}</div>
            </div>
          </div>
          <style>
            @media (max-width: 720px) {
              .qr-print-split { grid-template-columns: 1fr !important; }
              .qr-print-split-left { order: -1; max-width: 260px; margin: 0 auto; width: 100%; }
            }
          </style>`,
        foot: `<button class="btn btn-ghost" style="flex:1" data-x>Cancel</button>
               <button class="btn btn-primary" style="flex:1" id="btn-print-all-qrs-go"><i class="fa-solid fa-print"></i> Print ${tableQrs.length} cards</button>`,
        onMount(modal, close) {
          modal.querySelector('[data-x]').onclick = close;
          const mbody = modal.querySelector('.rs-mbody');
          if (mbody) {
            mbody.style.flex = '1 1 auto';
            mbody.style.minHeight = '0';
            mbody.style.overflowY = 'auto';
            mbody.style.maxHeight = 'min(70vh, 640px)';
            mbody.style.paddingTop = '16px';
            mbody.style.paddingBottom = '16px';
          }

          // Authoritative selection (don’t re-guess from DOM only at print time)
          let selectedSizeId = resolveQrPrintSizeId(savedSize);
          let selectedOpts = { ...savedOpts };

          const readSizeFromUi = () => {
            const checked = modal.querySelector('input[name="qr-print-size"]:checked');
            // Prefer checked radio; fall back to highlighted label
            let id = checked && checked.value;
            if (!id) {
              const on = modal.querySelector('.qr-size-opt[data-active="1"]');
              id = on && on.getAttribute('data-size');
            }
            return resolveQrPrintSizeId(id || selectedSizeId);
          };

          const syncSel = () => {
            const v = selectedSizeId;
            modal.querySelectorAll('.qr-size-opt').forEach((lab) => {
              const on = lab.getAttribute('data-size') === v;
              lab.setAttribute('data-active', on ? '1' : '0');
              lab.style.borderColor = on ? '#c4a35a' : 'var(--stroke-2)';
              lab.style.boxShadow = on ? '0 0 0 1px #c4a35a' : 'none';
              lab.style.background = on ? 'rgba(196,163,90,0.12)' : 'var(--panel)';
              const inp = lab.querySelector('input[type="radio"]');
              if (inp) inp.checked = on;
            });
          };

          const refreshPreview = () => {
            if (!sample) return;
            selectedSizeId = readSizeFromUi();
            if (selectedSizeId === 'custom') readCustomQrSizeFromModal(modal);
            selectedOpts = readQrPrintOptsFromModal(modal);
            if (!selectedOpts.showWifi) selectedOpts.showWifiPass = false;
            const sz = getQrPrintSize(selectedSizeId);
            const box = modal.querySelector('#qr-live-preview');
            if (box) {
              box.style.transform = 'scale(' + previewScaleFor(selectedSizeId) + ')';
              box.style.transformOrigin = 'top center';
              box.innerHTML = buildGuestQrCardHtml({
                outletName: meta.name,
                tableLabel: sample.tableLabel,
                qrCodeUrl: sample.qrCodeUrl,
                sizeId: selectedSizeId,
                phone: meta.phone,
                wifi: meta.wifi,
                wifiPass: meta.wifiPass,
                tagline: meta.tagline,
                printOpts: selectedOpts,
              });
            }
            const pill = modal.querySelector('#qr-preview-size-pill');
            if (pill) {
              pill.textContent =
                (sz.label || selectedSizeId) +
                ' · ' +
                (sz.cols || 2) +
                ' col · ' +
                (sz.cardMaxW || '') +
                (sz.qrMm ? ' · QR ' + sz.qrMm + 'mm' : '');
            }
            syncCustomPanelVisibility(modal, selectedSizeId);
            syncSel();
          };

          const pickSize = (id) => {
            selectedSizeId = resolveQrPrintSizeId(id);
            syncCustomPanelVisibility(modal, selectedSizeId);
            syncSel();
            refreshPreview();
          };

          modal.addEventListener('change', (e) => {
            const t = e.target;
            if (!t || !t.matches) return;
            if (t.matches('input[name="qr-print-size"]')) {
              pickSize(t.value);
              return;
            }
            if (t.matches('#qr-custom-width, #qr-custom-qr, #qr-custom-cols, #qr-custom-perpage')) {
              selectedSizeId = 'custom';
              readCustomQrSizeFromModal(modal);
              // keep custom radio selected
              const cr = modal.querySelector('input[name="qr-print-size"][value="custom"]');
              if (cr) cr.checked = true;
              refreshPreview();
              return;
            }
            if (t.matches('input[id^="qr-opt-"]')) {
              if (t.id === 'qr-opt-wifi' && !t.checked) {
                const pass = modal.querySelector('#qr-opt-wifi-pass');
                if (pass && !pass.disabled) pass.checked = false;
              }
              selectedOpts = readQrPrintOptsFromModal(modal);
              if (!selectedOpts.showWifi) selectedOpts.showWifiPass = false;
              refreshPreview();
            }
          });
          modal.querySelectorAll('.qr-size-opt').forEach((lab) => {
            lab.addEventListener('click', (e) => {
              e.preventDefault();
              const id = lab.getAttribute('data-size');
              pickSize(id);
            });
          });
          // live type for custom mm fields
          ['qr-custom-width', 'qr-custom-qr', 'qr-custom-cols', 'qr-custom-perpage'].forEach((id) => {
            const el = modal.querySelector('#' + id);
            if (el) el.addEventListener('input', () => {
              selectedSizeId = 'custom';
              const cr = modal.querySelector('input[name="qr-print-size"][value="custom"]');
              if (cr) cr.checked = true;
              readCustomQrSizeFromModal(modal);
              refreshPreview();
            });
          });
          syncCustomPanelVisibility(modal, selectedSizeId);
          syncSel();

          const go = modal.querySelector('#btn-print-all-qrs-go');
          if (go)
            go.onclick = () => {
              // Prefer tracked selection; re-read UI as safety
              selectedSizeId = readSizeFromUi();
              if (selectedSizeId === 'custom') readCustomQrSizeFromModal(modal);
              selectedOpts = readQrPrintOptsFromModal(modal);
              if (!selectedOpts.showWifi) selectedOpts.showWifiPass = false;
              const sizeId = resolveQrPrintSizeId(selectedSizeId);
              saveQrPrintSizeId(sizeId);
              saveQrPrintOpts(selectedOpts);
              const html = buildCardsHtml(tableQrs, meta, sizeId, selectedOpts);
              openQrPrintWindow('Table QR cards', html, {
                outlet: meta.name,
                count: tableQrs.length,
                sizeId: sizeId,
                tableQrs: tableQrs,
                printMeta: meta,
                printOpts: selectedOpts,
                autoPrint: false,
              });
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
    const platIcon = { zomato: 'fa-bowl-food', swiggy: 'fa-motorcycle', ondc: 'fa-network-wired' };
    let aggAlertBooted = false;
    const seenOnlineIds = new Set();
    let aggFilterPlat = 'all';
    let aggFilterStatus = 'all';
    let aggLastRefreshAt = 0;
    let aggRefreshing = false;

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
      // Billing-only outlets never fire kitchen tickets
      if (window.RSOpsMode && RSOpsMode.isBillingOnly && RSOpsMode.isBillingOnly()) {
        RS.toast('Billing only — online order kept for POS settle (no kitchen ticket)', 'fa-receipt');
        return;
      }
      const items = (order.rawItems || order.row?.items || []).map((it) => ({
        qty: it.qty || 1,
        name: it.name || 'Item',
      }));
      if (window.RSOps && typeof RSOps.printKotThermal === 'function') {
        RSOps.printKotThermal(items, {
          token: order.oid,
          table: `${platName[order.plat]} · ${order.area}`,
          orderType: 'Online',
          kind: 'KOT',
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

    async function settleAggregatorBill(order, statusLabel) {
      if (!order || !window.RS || typeof RS.saveOne !== 'function') return;
      const cancelled = /cancel|reject/i.test(String(statusLabel || ''));
      const items = (order.rawItems || order.row?.items || []).map((it) => ({
        id: it.id,
        name: it.name || 'Item',
        qty: Number(it.qty) || 1,
        price: Number(it.price || it.salePrice || 0),
      }));
      const sub = items.reduce((a, i) => a + i.price * i.qty, 0) || Number(order.total) || 0;
      const fee = Number(order.row?.deliveryFee || order.deliveryFee) || 0;
      const gst = Math.round(sub * 0.05);
      const grand = cancelled ? 0 : sub + fee + gst;
      const plat = order.plat || order.row?.platform || order.row?.source || 'online';
      const bill = {
        id: 'BILL-OL-' + (order.id || Date.now()),
        no: order.oid || order.orderId || 'OL-' + Date.now(),
        orderId: order.oid || order.orderId,
        customerName: order.cust || order.row?.customerName || 'Online guest',
        customerPhone: order.phone || order.row?.customerPhone || '',
        dateTime: new Date().toISOString(),
        time: new Date().toLocaleString('en-IN'),
        table: 'Online · ' + (platName[plat] || plat),
        subtotal: sub,
        gst: cancelled ? 0 : gst,
        amount: grand,
        total: grand,
        paymentMethod: cancelled ? '—' : 'Online',
        pay: cancelled ? '—' : 'Online',
        channel: 'aggregator',
        platform: plat,
        orderType: 'Online Delivery',
        status: cancelled ? 'Cancelled' : 'Paid',
        _items: items,
        deliveryFee: fee,
      };
      try {
        await RS.saveOne('bills', bill);
        if (Array.isArray(RS.BILLS)) {
          const exists = RS.BILLS.some((b) => String(b.no) === String(bill.no) || String(b.id) === String(bill.id));
          if (!exists) RS.BILLS.unshift(bill);
        }
      } catch (e) {
        console.warn('[Online] bill settle failed', e);
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
        // Delivered / rider out / cancelled → save into Bills with platform tag
        if (/picked|deliver|ready|reject|cancel/i.test(String(persistedStatus))) {
          const shouldBill =
            /picked|deliver/i.test(String(persistedStatus)) ||
            /reject|cancel/i.test(String(persistedStatus));
          if (shouldBill) await settleAggregatorBill(order, persistedStatus);
        }
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

    function pickDemoPlatform() {
      return new Promise((resolve) => {
        if (!window.RSModal) {
          resolve(['swiggy', 'zomato', 'ondc'][Math.floor(Math.random() * 3)]);
          return;
        }
        RSModal.open({
          title: 'Seed demo order',
          sub: 'Practice Accept → KOT → POS without a real aggregator',
          icon: 'fa-seedling',
          size: 'sm',
          body: `<div class="agg-demo-picks">
            ${['swiggy', 'zomato', 'ondc']
              .map(
                (p) =>
                  `<button type="button" class="agg-demo-pick ${p}" data-plat="${p}">
                    <i class="fa-solid ${platIcon[p]}"></i>
                    <strong>${platName[p]}</strong>
                    <span>Demo guest + sample items</span>
                  </button>`
              )
              .join('')}
          </div>`,
          foot: '<button type="button" class="btn btn-ghost" style="flex:1" data-x>Cancel</button>',
          onMount(m, close) {
            m.querySelector('[data-x]').onclick = () => {
              close();
              resolve(null);
            };
            m.querySelectorAll('[data-plat]').forEach((btn) => {
              btn.onclick = () => {
                const p = btn.getAttribute('data-plat');
                close();
                resolve(p);
              };
            });
          },
        });
      });
    }

    function openAggWebhookModal() {
      const sess = (window.RS_API && RS_API.session && RS_API.session()) || {};
      const tid = sess.tenant_id || sessionStorage.getItem('tenant_id') || '';
      const base =
        (window.RS_API && RS_API.functionsBase) ||
        (window.__SUPABASE_URL__
          ? String(window.__SUPABASE_URL__).replace(/\/+$/, '') + '/functions/v1'
          : '');
      const url = `${base}/aggregator-webhook?tenant_id=${encodeURIComponent(tid || 'YOUR_TENANT_ID')}`;
      const sample = `{
  "platform": "swiggy",
  "order_id": "SWI-100234",
  "customer_name": "Asha",
  "customer_phone": "9876501234",
  "total_amount": 420,
  "items": [{ "name": "Paneer Butter Masala", "qty": 1, "price": 280 }]
}`;
      const body = `<div class="agg-wh-body">
        <ol class="agg-wh-steps">
          <li>Copy the webhook URL below into your aggregator / middleware.</li>
          <li>Send <b>POST</b> with header <code>Authorization: Bearer AGGREGATOR_WEBHOOK_SECRET</code>.</li>
          <li>New orders land here for <b>Accept + KOT</b>, then settle in POS.</li>
        </ol>
        <div class="agg-wh-label">Webhook URL ${tid ? '' : '<span class="agg-wh-warn">· set tenant first</span>'}</div>
        <div class="agg-wh-url" id="agg-wh-url">${esc(url)}</div>
        <div class="agg-wh-label" style="margin-top:12px">Sample JSON body</div>
        <pre class="agg-wh-sample">${esc(sample)}</pre>
        <p class="agg-wh-note">Fields: <code>platform</code>, <code>order_id</code>, <code>customer_name</code>, <code>customer_phone</code>, <code>items[]</code>, <code>total_amount</code>.</p>
      </div>`;
      const copyUrl = async () => {
        try {
          if (navigator.clipboard && navigator.clipboard.writeText) await navigator.clipboard.writeText(url);
          else {
            const ta = document.createElement('textarea');
            ta.value = url;
            ta.setAttribute('readonly', '');
            ta.style.cssText = 'position:fixed;opacity:0';
            document.body.appendChild(ta);
            ta.select();
            document.execCommand('copy');
            ta.remove();
          }
          RS.toast('Webhook URL copied', 'fa-copy');
        } catch (_) {
          window.prompt('Copy webhook URL', url);
        }
      };
      if (window.RSModal) {
        RSModal.open({
          title: 'Aggregator webhook',
          sub: 'Zomato · Swiggy · ONDC intake',
          icon: 'fa-link',
          size: 'md',
          body,
          foot: `<button type="button" class="btn btn-ghost" style="flex:1" id="agg-wh-copy"><i class="fa-solid fa-copy"></i> Copy URL</button>
                 <button type="button" class="btn btn-primary" style="flex:1" id="agg-wh-close">Done</button>`,
          onMount(m, close) {
            const c = m.querySelector('#agg-wh-close');
            const copy = m.querySelector('#agg-wh-copy');
            if (c) c.onclick = close;
            if (copy) copy.onclick = copyUrl;
          },
        });
      } else {
        window.prompt('Webhook URL', url);
      }
    }

    function aggRelativeRefresh(ts) {
      if (!ts) return 'Not refreshed yet';
      const sec = Math.max(0, Math.round((Date.now() - ts) / 1000));
      if (sec < 5) return 'Just now';
      if (sec < 60) return sec + 's ago';
      const m = Math.floor(sec / 60);
      if (m < 60) return m + 'm ago';
      return Math.floor(m / 60) + 'h ago';
    }

    async function renderAgg() {
      const sec = $('#aggregator-tab');
      if (!sec) return;
      if (!sec.dataset.aggShell) {
        sec.dataset.aggShell = '1';
        sec.innerHTML = `<div class="agg-shell">
          <div class="agg-loading"><i class="fa-solid fa-motorcycle"></i><span>Loading online orders…</span></div>
        </div>`;
      } else {
        const refreshIco = sec.querySelector('#agg-refresh i');
        if (refreshIco) refreshIco.classList.add('fa-spin');
      }
      aggRefreshing = true;
      await refreshOnlineOrders();
      aggLastRefreshAt = Date.now();
      aggRefreshing = false;

      const newN = ONLINE.filter((o) => o.status === 'new').length;
      const prepN = ONLINE.filter((o) => o.status === 'preparing').length;
      const readyN = ONLINE.filter((o) => o.status === 'ready').length;
      const openValue = ONLINE.reduce((a, o) => a + o.total, 0);
      const showDemo =
        !!(window.RS_API && RS_API.enableDemoTools) ||
        localStorage.getItem('rs_demo_tools') === '1' ||
        /owner|manager|admin|superadmin/i.test(sessionStorage.getItem('logged_in_role') || '');
      const feedLive = navigator.onLine !== false;
      const filtered = ONLINE.filter((o) => {
        if (aggFilterPlat !== 'all' && o.plat !== aggFilterPlat) return false;
        if (aggFilterStatus !== 'all' && o.status !== aggFilterStatus) return false;
        return true;
      });
      const statusLabel = { new: 'New', preparing: 'Preparing', ready: 'Ready' };

      const cardsHtml = filtered
        .map((o) => {
          const i = ONLINE.indexOf(o);
          const phoneHtml = o.phone
            ? ` · <a class="agg-phone" href="tel:${esc(String(o.phone).replace(/[^\d+]/g, ''))}">${esc(o.phone)}</a>`
            : '';
          const itemsHtml = (o.items || [])
            .map((line) => `<li>${esc(line)}</li>`)
            .join('');
          const actions =
            o.status === 'new'
              ? `<button type="button" class="btn btn-ghost btn-sm" data-rej="${i}">Reject</button>
                 <button type="button" class="btn btn-primary btn-sm" data-acc="${i}"><i class="fa-solid fa-check"></i> Accept + KOT</button>`
              : o.status === 'preparing'
                ? `<span class="agg-prep"><i class="fa-solid fa-clock"></i> ${esc(String(o.prep))}m prep</span>
                   <button type="button" class="btn btn-primary btn-sm" data-ready="${i}">Mark ready</button>`
                : `<button type="button" class="btn btn-ghost btn-sm" data-rider="${i}"><i class="fa-solid fa-motorcycle"></i> Rider out</button>`;
          return `<article class="agg-card${o.status === 'new' ? ' needs-attention' : ''}" data-i="${i}" data-status="${esc(o.status)}" data-plat="${esc(o.plat)}">
            <div class="agg-top ${o.plat}">
              <i class="fa-solid ${platIcon[o.plat] || 'fa-motorcycle'}"></i>
              <span class="plat">${platName[o.plat] || 'Online'}</span>
              <span class="oid">${esc(o.oid)}</span>
            </div>
            <div class="agg-body">
              <div class="agg-cust">
                <div>
                  <div class="cn">${esc(o.cust)}</div>
                  <div class="ct">${esc(o.area)}${phoneHtml}${o.since ? ' · <span class="agg-since">' + esc(o.since) + '</span>' : ''}</div>
                </div>
                <span class="pill ${o.status === 'new' ? 'pill-amber' : o.status === 'preparing' ? 'pill-orange' : 'pill-green'}" style="padding:3px 10px;text-transform:capitalize">${esc(statusLabel[o.status] || o.status)}</span>
              </div>
              <ul class="agg-items">${itemsHtml || '<li class="agg-items-empty">No items listed</li>'}</ul>
              <div class="agg-foot">
                <span class="at">${rs(o.total)}</span>
                <button type="button" class="btn btn-ghost btn-sm" data-pos="${i}" title="Open in POS"><i class="fa-solid fa-cash-register"></i> POS</button>
                ${actions}
              </div>
            </div>
          </article>`;
        })
        .join('');

      let gridBody = cardsHtml;
      if (!ONLINE.length) {
        gridBody = `<div class="agg-empty">
          <div class="agg-empty-visual">
            <span class="agg-empty-orb"></span>
            <i class="fa-solid fa-motorcycle"></i>
          </div>
          <div class="agg-plat-row" aria-hidden="true">
            <span class="agg-plat-chip swiggy">Swiggy</span>
            <span class="agg-plat-chip zomato">Zomato</span>
            <span class="agg-plat-chip ondc">ONDC</span>
          </div>
          <h3 class="agg-empty-title">Kitchen is clear for delivery</h3>
          <p class="agg-empty-copy">
            Enter Swiggy / Zomato / ONDC orders <b>manually</b> (no API needed), or connect a webhook later.
            Each order keeps its <b>platform</b> label on bills and reports.
          </p>
          <ol class="agg-empty-steps">
            <li><span>1</span> Manual entry or webhook</li>
            <li><span>2</span> Accept + print KOT</li>
            <li><span>3</span> Settle → Bills (platform tagged)</li>
          </ol>
          <div class="agg-empty-actions">
            <button type="button" class="btn btn-primary" id="agg-empty-manual" data-rs10-manual-online="1"><i class="fa-solid fa-plus"></i> Manual order</button>
            <button type="button" class="btn btn-ghost" id="agg-empty-webhook"><i class="fa-solid fa-link"></i> Webhook setup</button>
            ${showDemo ? '<button type="button" class="btn btn-ghost" id="agg-empty-demo"><i class="fa-solid fa-seedling"></i> Demo order</button>' : ''}
          </div>
        </div>`;
      } else if (!filtered.length) {
        gridBody = `<div class="agg-empty agg-empty-filter">
          <i class="fa-solid fa-filter-circle-xmark"></i>
          <h3 class="agg-empty-title">No orders match this filter</h3>
          <p class="agg-empty-copy">Try All platforms or clear the status filter.</p>
          <button type="button" class="btn btn-ghost btn-sm" id="agg-clear-filters">Clear filters</button>
        </div>`;
      }

      sec.innerHTML = `
        <div class="agg-shell">
          <div class="stat-row agg-stats">
            <button type="button" class="stat-card agg-stat${aggFilterStatus === 'new' ? ' is-active' : ''}" data-status-filter="new" title="Show new orders">
              <div class="stat-ic bg-o"><i class="fa-solid fa-motorcycle"></i></div>
              <div><div class="sv">${newN}</div><div class="sl">New orders</div></div>
            </button>
            <button type="button" class="stat-card agg-stat${aggFilterStatus === 'preparing' ? ' is-active' : ''}" data-status-filter="preparing" title="Show preparing">
              <div class="stat-ic bg-a"><i class="fa-solid fa-fire-burner"></i></div>
              <div><div class="sv">${prepN}</div><div class="sl">Preparing</div></div>
            </button>
            <button type="button" class="stat-card agg-stat${aggFilterStatus === 'ready' ? ' is-active' : ''}" data-status-filter="ready" title="Show ready for pickup">
              <div class="stat-ic bg-g"><i class="fa-solid fa-bell-concierge"></i></div>
              <div><div class="sv">${readyN}</div><div class="sl">Ready for pickup</div></div>
            </button>
            <div class="stat-card" title="Open online value">
              <div class="stat-ic bg-v"><i class="fa-solid fa-coins"></i></div>
              <div><div class="sv">${rs(openValue)}</div><div class="sl">Open online value</div></div>
            </div>
          </div>

          <div class="toolbar-row agg-toolbar">
            <div class="agg-filters" role="group" aria-label="Platform filter">
              <button type="button" class="agg-filter-chip${aggFilterPlat === 'all' ? ' is-active' : ''}" data-plat-filter="all">All</button>
              <button type="button" class="agg-filter-chip swiggy${aggFilterPlat === 'swiggy' ? ' is-active' : ''}" data-plat-filter="swiggy">Swiggy</button>
              <button type="button" class="agg-filter-chip zomato${aggFilterPlat === 'zomato' ? ' is-active' : ''}" data-plat-filter="zomato">Zomato</button>
              <button type="button" class="agg-filter-chip ondc${aggFilterPlat === 'ondc' ? ' is-active' : ''}" data-plat-filter="ondc">ONDC</button>
            </div>
            <div class="grow"></div>
            <span class="agg-refreshed" id="agg-refreshed" title="Last refreshed">${esc(aggRelativeRefresh(aggLastRefreshAt))}</span>
            ${showDemo ? '<button type="button" class="btn btn-ghost btn-sm" id="agg-seed" title="Seed a demo online order"><i class="fa-solid fa-seedling"></i> Demo order</button>' : ''}
            <button type="button" class="btn btn-ghost btn-sm" id="agg-refresh" title="Refresh now"><i class="fa-solid fa-rotate"></i> Refresh</button>
            <button type="button" class="btn btn-ghost btn-sm" id="agg-webhook-info" title="Webhook setup"><i class="fa-solid fa-link"></i> Webhook</button>
            ${window.RSViewMode ? RSViewMode.toggleHtml('online-orders', window.RSViewMode.get('online-orders', 'cards')) : ''}
            <span class="pill ${feedLive ? 'pill-green' : 'pill-amber'}" title="${feedLive ? 'Browser online — listening for sync' : 'Browser offline'}">
              <span class="dot ${feedLive ? 'dot-live' : ''}"></span>${feedLive ? 'Listening' : 'Offline'}
            </span>
          </div>

          ${(() => {
            const mode = window.RSViewMode ? RSViewMode.get('online-orders', 'cards') : 'cards';
            if (mode === 'list' && ONLINE.length && filtered.length) {
              return `<div class="agg-grid is-list"><div class="rs-line-list">
                <div class="rs-line-head agg-line-head">
                  <span>Platform</span><span>Order</span><span>Customer</span><span>Status</span><span class="rl-num">Total</span><span class="rl-acts">Actions</span>
                </div>
                ${filtered.map((o) => {
                  const i = ONLINE.indexOf(o);
                  const actions =
                    o.status === 'new'
                      ? `<button type="button" class="btn btn-primary btn-sm" data-acc="${i}">Accept</button>`
                      : o.status === 'preparing'
                        ? `<button type="button" class="btn btn-primary btn-sm" data-ready="${i}">Ready</button>`
                        : `<button type="button" class="btn btn-ghost btn-sm" data-rider="${i}">Rider</button>`;
                  return `<div class="rs-line-row agg-line-row" data-i="${i}">
                    <span class="rl-name">${esc(platName[o.plat] || o.plat || 'Online')}</span>
                    <span class="rl-mute">${esc(o.oid)}</span>
                    <span><span class="rl-name">${esc(o.cust)}</span><div class="rl-mute">${esc(o.area || '')}</div></span>
                    <span class="pill ${o.status === 'new' ? 'pill-amber' : o.status === 'preparing' ? 'pill-orange' : 'pill-green'}" style="padding:2px 8px;font-size:10px;text-transform:capitalize;justify-self:start">${esc(statusLabel[o.status] || o.status)}</span>
                    <span class="rl-num">${rs(o.total)}</span>
                    <span class="rl-acts">
                      <button type="button" class="btn btn-ghost btn-sm" data-pos="${i}" title="POS"><i class="fa-solid fa-cash-register"></i></button>
                      ${actions}
                    </span>
                  </div>`;
                }).join('')}
              </div></div>`;
            }
            return `<div class="agg-grid${ONLINE.length ? '' : ' is-empty'}">${gridBody}</div>`;
          })()}
        </div>`;

      if (window.RSViewMode) {
        RSViewMode.wire(sec, 'online-orders', () => {
          renderAgg();
        }, 'cards');
      }

      $$('[data-pos]', sec).forEach((b) => {
        b.onclick = () => openOnlineOrderInPos(ONLINE[+b.dataset.pos]);
      });
      $$('[data-acc]', sec).forEach((b) => {
        b.onclick = async () => {
          if (b.disabled) return;
          b.disabled = true;
          const i = +b.dataset.acc;
          if (ONLINE[i]) ONLINE[i].prep = 15;
          try {
            await persistOnlineStatus(i, 'preparing', 'Accepted · KOT printed', 'fa-check', {
              printKot: true,
              prepMinutes: 15,
            });
          } catch (_) {
            b.disabled = false;
          }
        };
      });
      $$('[data-ready]', sec).forEach(
        (b) =>
          (b.onclick = () =>
            persistOnlineStatus(+b.dataset.ready, 'Ready', 'Marked ready for pickup', 'fa-bell-concierge'))
      );
      $$('[data-rej]', sec).forEach(
        (b) =>
          (b.onclick = async () => {
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
          })
      );
      $$('[data-rider]', sec).forEach(
        (b) =>
          (b.onclick = () =>
            persistOnlineStatus(+b.dataset.rider, 'Picked Up', 'Rider pickup recorded', 'fa-motorcycle'))
      );

      const refreshBtn = sec.querySelector('#agg-refresh');
      if (refreshBtn)
        refreshBtn.onclick = () => {
          if (!aggRefreshing) renderAgg();
        };

      const seedDemo = async () => {
        const pick = await pickDemoPlatform();
        if (pick) seedDemoOnlineOrder(pick);
      };
      const seedBtn = sec.querySelector('#agg-seed');
      if (seedBtn) seedBtn.onclick = seedDemo;
      const emptyDemo = sec.querySelector('#agg-empty-demo');
      if (emptyDemo) emptyDemo.onclick = seedDemo;
      const emptyManual = sec.querySelector('#agg-empty-manual');
      if (emptyManual) {
        emptyManual.onclick = () => {
          if (window.RS10 && typeof RS10.openManualOnlineOrder === 'function') RS10.openManualOnlineOrder();
          else emptyManual.setAttribute('data-rs10-manual-online', '1');
        };
      }
      const emptyWh = sec.querySelector('#agg-empty-webhook');
      if (emptyWh) emptyWh.onclick = openAggWebhookModal;
      const whBtn = sec.querySelector('#agg-webhook-info');
      if (whBtn) whBtn.onclick = openAggWebhookModal;

      sec.querySelectorAll('[data-plat-filter]').forEach((btn) => {
        btn.onclick = () => {
          aggFilterPlat = btn.getAttribute('data-plat-filter') || 'all';
          renderAgg();
        };
      });
      sec.querySelectorAll('[data-status-filter]').forEach((btn) => {
        btn.onclick = () => {
          const s = btn.getAttribute('data-status-filter') || 'all';
          aggFilterStatus = aggFilterStatus === s ? 'all' : s;
          renderAgg();
        };
      });
      const clearFilters = sec.querySelector('#agg-clear-filters');
      if (clearFilters)
        clearFilters.onclick = () => {
          aggFilterPlat = 'all';
          aggFilterStatus = 'all';
          renderAgg();
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
    const tierCls = { vip: 'tier-vip', gold: 'tier-gold', silver: 'tier-silver' };
    let _crmFilter = 'all';
    let _crmSort = 'recent';
    let _crmView = (function () {
      if (window.RSViewMode && RSViewMode.get) return RSViewMode.get('customers', 'list');
      try { return localStorage.getItem('rs_crm_view') || 'list'; } catch (e) { return 'list'; }
    })();

    /** National mobile key for matching (+353 85… and 85… become the same). */
    function normPhone(p) {
      let d = String(p == null ? '' : p).replace(/\D/g, '');
      if (!d) return '';
      if (d.startsWith('00')) d = d.slice(2);
      // Country codes
      if (d.startsWith('353')) d = d.slice(3); // Ireland
      else if (d.startsWith('91') && d.length >= 12) d = d.slice(2); // India
      else if (d.startsWith('44') && d.length >= 12) d = d.slice(2); // UK
      else if (d.startsWith('1') && d.length === 11) d = d.slice(1); // NANP
      // National trunk prefix
      if (d.startsWith('0') && d.length >= 9) d = d.slice(1);
      return d;
    }
    function formatPhoneDisplay(p) {
      const raw = String(p == null ? '' : p).trim();
      if (!raw || /^walk-?in|dine-?in|n\/a|none$/i.test(raw)) return '—';
      const d = raw.replace(/\D/g, '');
      const nat = normPhone(raw);
      // Incomplete junk like "91" or "+91"
      if (nat.length > 0 && nat.length < 8) return '—';
      // Ireland: national 8xxxxxxxx (9 digits)
      if (d.startsWith('353') || (nat.length === 9 && nat.charAt(0) === '8')) {
        const n = nat.length === 9 ? nat : d.replace(/^3530?/, '');
        if (n.length === 9) return '+353 ' + n.slice(0, 2) + ' ' + n.slice(2, 5) + ' ' + n.slice(5);
      }
      // India 10-digit national
      if (nat.length === 10) {
        return '+91 ' + nat.slice(0, 5) + ' ' + nat.slice(5);
      }
      if (raw.startsWith('+') && d.length >= 10) {
        return '+' + d;
      }
      return nat.length >= 8 ? nat : '—';
    }
    function phonesMatch(a, b) {
      const na = normPhone(a);
      const nb = normPhone(b);
      if (na && nb && na === nb) return true;
      // Partial overlap (9 vs 10 digit national)
      if (na && nb && na.length >= 8 && nb.length >= 8) {
        if (na.endsWith(nb) || nb.endsWith(na)) return true;
      }
      return false;
    }
    function formatVisitLabel(raw) {
      if (raw == null || raw === '' || raw === 'never' || raw === 'Never' || raw === 'Today') {
        if (raw === 'Today') {
          try {
            return new Date().toLocaleDateString(undefined, { day: 'numeric', month: 'short' });
          } catch (_) { return 'Today'; }
        }
        return 'No orders';
      }
      const d = new Date(raw);
      if (!Number.isNaN(d.getTime())) {
        try {
          return d.toLocaleString(undefined, {
            day: 'numeric',
            month: 'short',
            hour: 'numeric',
            minute: '2-digit',
            hour12: true,
          });
        } catch (_) {
          return d.toLocaleDateString();
        }
      }
      // Already human string
      if (!/T\d{2}:\d{2}/.test(String(raw))) return String(raw);
      return '—';
    }
    function tierFromSpend(spend) {
      const s = Number(spend) || 0;
      if (s >= 10000) return 'vip';
      if (s >= 5000) return 'gold';
      return 'silver';
    }
    function avColor(name) {
      const colors = RS.avatarColors || ['#FF4F00', '#0F9F6E', '#6366F1', '#D97706', '#DB2777', '#0891B2'];
      let h = 0;
      const s = String(name || '');
      for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0;
      return colors[h % colors.length];
    }
    function waDigits(phone) {
      let d = String(phone || '').replace(/\D/g, '');
      if (!d) return '';
      const nat = normPhone(phone);
      // Ireland 9-digit mobile starting 8
      if (nat.length === 9 && nat.startsWith('8')) return '353' + nat;
      // India 10-digit
      if (nat.length === 10) return '91' + nat;
      if (d.startsWith('00')) d = d.slice(2);
      return d;
    }

    function renderCustomers() {
      const sec = $('#customers-tab');
      if (!sec) return;
      if (window.RS_DB) {
        try {
          if (window.RSSkel && RSSkel.cards) {
            RSSkel.paint(sec, RSSkel.cards({ count: 6 }));
          } else {
            sec.innerHTML = '<div class="sr-empty"><div class="spin" style="margin:0 auto 10px"></div>Loading customers…</div>';
          }
        } catch (_) {
          sec.innerHTML = '<div class="sr-empty"><div class="spin" style="margin:0 auto 10px"></div>Loading customers…</div>';
        }
        RS_DB.list('customers')
          .then((rows) => {
            CUSTOMERS.length = 0;
            (rows || []).forEach((r) => CUSTOMERS.push(r));
            mergeCustomerDuplicatesInPlace();
            drawCustomersUI(sec);
          })
          .catch((e) => {
            console.warn('Failed loading customers from DB', e);
            drawCustomersUI(sec);
          });
      } else {
        drawCustomersUI(sec);
      }
    }

    /** Collapse near-duplicate CRM rows (same last-10 phone) for a clean UI. */
    function mergeCustomerDuplicatesInPlace() {
      const byKey = new Map();
      const noPhone = [];
      CUSTOMERS.forEach((r) => {
        const key = normPhone(r.phone);
        if (!key) {
          noPhone.push(r);
          return;
        }
        const prev = byKey.get(key);
        if (!prev) {
          byKey.set(key, { ...r, _dupIds: r.id ? [r.id] : [] });
          return;
        }
        const dups = [...(prev._dupIds || [prev.id]), r.id].filter(Boolean);
        // Prefer the profile with more activity / higher dues as primary
        const score = (x) =>
          (Number(x.spend) || 0) * 10 + (Number(x.visits) || 0) * 5 + (Number(x.dues) || 0);
        const keep = score(r) > score(prev) ? r : prev;
        const other = keep === r ? prev : r;
        byKey.set(key, {
          ...keep,
          name: keep.name || other.name,
          email: keep.email || other.email,
          notes: keep.notes || other.notes,
          // max dues — same person double-booked shouldn't sum twice
          dues: Math.max(Number(keep.dues) || 0, Number(other.dues) || 0),
          visits: Math.max(Number(keep.visits) || 0, Number(other.visits) || 0),
          spend: Math.max(Number(keep.spend) || 0, Number(other.spend) || 0),
          phone: keep.phone || other.phone,
          _rawPhone: key,
          _dupIds: [...new Set(dups)],
          _mergedCount: new Set(dups).size,
        });
      });
      CUSTOMERS.length = 0;
      byKey.forEach((v) => CUSTOMERS.push(v));
      noPhone.forEach((v) => CUSTOMERS.push(v));
    }

    function formatCustBillTime(b) {
      const raw = b && (b.dateTime || b.time || b.created_at || '');
      return formatVisitLabel(raw);
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
      if (s === 'bronze') return 'silver';
      return 'silver';
    }
    function billsForCustomer(c) {
      const bills = RS.BILLS || [];
      const name = String(c.name || '').trim().toLowerCase();
      return bills
        .filter((b) => {
          if (phonesMatch(b.customerPhone, c.phone)) return true;
          const bn = String(b.customerName || '').trim().toLowerCase();
          if (name && bn && bn === name && bn !== 'walk-in guest' && bn !== 'walk-in') return true;
          return false;
        })
        .sort((a, b) => billTimeMs(b) - billTimeMs(a));
    }
    function enrichCustomerStats() {
      CUSTOMERS.forEach((c) => {
        const cBills = billsForCustomer(c);
        const billSpend = cBills.reduce((sum, b) => sum + (Number(b.amount != null ? b.amount : b.total) || 0), 0);
        const billVisits = cBills.length;
        // Prefer live bill rollups; fall back to stored CRM fields
        c.visits = billVisits > 0 ? billVisits : Number(c.visits) || 0;
        c.spend = billSpend > 0 ? billSpend : Number(c.spend) || 0;
        if (cBills.length > 0) c.last = formatCustBillTime(cBills[0]);
        else c.last = formatVisitLabel(c.last);
        c.tier = normalizeCustTier(c.tier || tierFromSpend(c.spend));
        c.phoneDisplay = formatPhoneDisplay(c.phone);
        c.dues = Number(c.dues) || 0;
      });
    }

    function drawCustomersUI(sec) {
      enrichCustomerStats();

      const total = CUSTOMERS.length || 1;
      const withVisits = CUSTOMERS.filter((c) => (c.visits || 0) > 0).length || 1;
      const repeat = Math.round((CUSTOMERS.filter((c) => (c.visits || 0) > 1).length / withVisits) * 100);
      const totalSpend = CUSTOMERS.reduce((a, c) => a + (c.spend || 0), 0);
      const totalDues = CUSTOMERS.reduce((a, c) => a + (c.dues || 0), 0);
      const duesCount = CUSTOMERS.filter((c) => (c.dues || 0) > 0).length;
      const vipCount = CUSTOMERS.filter((c) => normalizeCustTier(c.tier) === 'vip').length;

      sec.innerHTML = `
        <div class="stat-row">
          <div class="stat-card"><div class="stat-ic bg-o"><i class="fa-solid fa-users"></i></div><div><div class="sv">${CUSTOMERS.length}</div><div class="sl">Customers</div><div class="sd">${withVisits} with orders</div></div></div>
          <div class="stat-card"><div class="stat-ic bg-g"><i class="fa-solid fa-repeat"></i></div><div><div class="sv">${repeat}%</div><div class="sl">Repeat rate</div><div class="sd">Guests with 2+ visits</div></div></div>
          <div class="stat-card"><div class="stat-ic bg-v"><i class="fa-solid fa-chart-line"></i></div><div><div class="sv">${rs(Math.round(totalSpend / total))}</div><div class="sl">Avg spend</div><div class="sd">${rs(totalSpend)} lifetime</div></div></div>
          <div class="stat-card"><div class="stat-ic bg-a" style="background:rgba(255,79,0,.1);color:var(--orange)"><i class="fa-solid fa-hand-holding-dollar"></i></div><div><div class="sv" id="crm-total-dues">${rs(totalDues)}</div><div class="sl">Outstanding dues</div><div class="sd">${duesCount} guest${duesCount === 1 ? '' : 's'}</div></div></div>
        </div>
        <div class="crm-toolbar">
          <div class="pos-search grow" style="max-width:min(100%,340px);padding:9px 14px"><i class="fa-solid fa-magnifying-glass"></i><input id="crm-search" placeholder="Search name or phone" autocomplete="off"></div>
          <div class="grow"></div>
          <button type="button" class="btn btn-ghost btn-sm" id="btn-crm-broadcast"><i class="fa-brands fa-whatsapp"></i> Broadcast</button>
          <button type="button" class="btn btn-ghost btn-sm" id="btn-import-customers"><i class="fa-solid fa-file-import"></i> Import</button>
          <button type="button" class="btn btn-ghost btn-sm" id="btn-export-customers"><i class="fa-solid fa-download"></i> Export</button>
          <button type="button" class="btn btn-primary btn-sm" id="btn-add-customer"><i class="fa-solid fa-plus"></i> Add customer</button>
        </div>
        <div class="crm-filters" id="crm-filters">
          <button type="button" class="chip-btn ${_crmFilter === 'all' ? 'active' : ''}" data-crm-f="all">All</button>
          <button type="button" class="chip-btn ${_crmFilter === 'dues' ? 'active' : ''}" data-crm-f="dues">Dues${duesCount ? ' · ' + duesCount : ''}</button>
          <button type="button" class="chip-btn ${_crmFilter === 'vip' ? 'active' : ''}" data-crm-f="vip">VIP${vipCount ? ' · ' + vipCount : ''}</button>
          <button type="button" class="chip-btn ${_crmFilter === 'gold' ? 'active' : ''}" data-crm-f="gold">Gold</button>
          <button type="button" class="chip-btn ${_crmFilter === 'repeat' ? 'active' : ''}" data-crm-f="repeat">Repeat</button>
          ${window.RSViewMode
            ? RSViewMode.toggleHtml('customers', _crmView)
            : `<div class="crm-view-toggle" role="group" aria-label="View mode">
            <button type="button" class="crm-view-btn ${_crmView === 'list' ? 'active' : ''}" data-crm-view="list" title="Line view"><i class="fa-solid fa-list"></i> List</button>
            <button type="button" class="crm-view-btn ${_crmView === 'cards' ? 'active' : ''}" data-crm-view="cards" title="Card view"><i class="fa-solid fa-grip"></i> Cards</button>
          </div>`}
          <select class="crm-sort" id="crm-sort" aria-label="Sort customers">
            <option value="recent" ${_crmSort === 'recent' ? 'selected' : ''}>Recent first</option>
            <option value="spend" ${_crmSort === 'spend' ? 'selected' : ''}>Highest spend</option>
            <option value="dues" ${_crmSort === 'dues' ? 'selected' : ''}>Highest dues</option>
            <option value="name" ${_crmSort === 'name' ? 'selected' : ''}>Name A–Z</option>
            <option value="visits" ${_crmSort === 'visits' ? 'selected' : ''}>Most visits</option>
          </select>
        </div>
        <div class="crm-body ${_crmView === 'list' ? 'is-list' : 'is-cards'}" id="crm-grid"></div>`;

      const grid = $('#crm-grid');

      function applyFilterSort(list) {
        let out = list.slice();
        if (_crmFilter === 'dues') out = out.filter((c) => (c.dues || 0) > 0);
        else if (_crmFilter === 'vip') out = out.filter((c) => normalizeCustTier(c.tier) === 'vip');
        else if (_crmFilter === 'gold') out = out.filter((c) => normalizeCustTier(c.tier) === 'gold');
        else if (_crmFilter === 'repeat') out = out.filter((c) => (c.visits || 0) > 1);
        out.sort((a, b) => {
          if (_crmSort === 'spend') return (b.spend || 0) - (a.spend || 0);
          if (_crmSort === 'dues') return (b.dues || 0) - (a.dues || 0);
          if (_crmSort === 'visits') return (b.visits || 0) - (a.visits || 0);
          if (_crmSort === 'name') return String(a.name || '').localeCompare(String(b.name || ''));
          // recent: last order / last_visit
          const ta = a.last && a.last !== 'never' ? Date.parse(a.last) || 0 : 0;
          const tb = b.last && b.last !== 'never' ? Date.parse(b.last) || 0 : 0;
          if (tb !== ta) return tb - ta;
          return (b.spend || 0) - (a.spend || 0);
        });
        return out;
      }

      function draw(q = '') {
        const t = q.toLowerCase().trim();
        const digits = t.replace(/\D/g, '');
        let list = CUSTOMERS.filter((c) => {
          if (!t) return true;
          const hay = [c.name, c.phone, c.phoneDisplay, c.email, c.notes].join(' ').toLowerCase();
          if (hay.includes(t)) return true;
          if (digits && normPhone(c.phone).includes(digits)) return true;
          return false;
        });
        list = applyFilterSort(list);

        if (!CUSTOMERS.length) {
          grid.innerHTML = `<div class="sr-empty" style="grid-column:1/-1;padding:40px 20px">
            <i class="fa-solid fa-address-book" style="font-size:28px;opacity:.35;display:block;margin-bottom:10px"></i>
            <div style="font-weight:800;margin-bottom:6px;font-size:16px">No customers yet</div>
            <div style="font-size:13px;color:var(--text-soft);max-width:380px;margin:0 auto 14px;line-height:1.45">Guests from POS bills appear here automatically. You can also add loyalty profiles or import a CSV.</div>
            <button type="button" class="btn btn-primary btn-sm" id="crm-empty-add"><i class="fa-solid fa-user-plus"></i> Add customer</button>
          </div>`;
          const ea = grid.querySelector('#crm-empty-add');
          if (ea) ea.onclick = () => document.getElementById('btn-add-customer')?.click();
          return;
        }

        if (!list.length) {
          grid.innerHTML = '<div class="sr-empty" style="grid-column:1/-1">No customers match this filter or search</div>';
          return;
        }

        function rowMeta(c) {
          const i = CUSTOMERS.indexOf(c);
          const tier = normalizeCustTier(c.tier);
          const lastLabel = formatVisitLabel(c.last);
          const phoneLabel = c.phoneDisplay || formatPhoneDisplay(c.phone);
          const phoneOk = phoneLabel && phoneLabel !== '—' && phoneLabel !== '+91' && normPhone(c.phone).length >= 8;
          const initials = RS.initials
            ? RS.initials(c.name)
            : String(c.name || '?')
                .split(/\s+/)
                .map((w) => w[0] || '')
                .join('')
                .slice(0, 2)
                .toUpperCase() || '?';
          return { i, tier, lastLabel, phoneLabel: phoneOk ? phoneLabel : (c.phone ? String(c.phone) : 'No phone'), initials, merged: (c._mergedCount || 0) > 1 };
        }

        if (_crmView === 'list') {
          grid.className = 'crm-body is-list';
          grid.innerHTML = `
            <div class="crm-list" role="table" aria-label="Customers">
              <div class="crm-list-head" role="row">
                <span class="cl-guest">Guest</span>
                <span class="cl-phone">Phone</span>
                <span class="cl-tier">Tier</span>
                <span class="cl-num">Visits</span>
                <span class="cl-num">Spent</span>
                <span class="cl-num">Dues</span>
                <span class="cl-last">Last order</span>
                <span class="cl-acts">Actions</span>
              </div>
              ${list.map((c) => {
                const m = rowMeta(c);
                return `
                <div class="crm-list-row ${c.dues > 0 ? 'has-dues' : ''}" data-i="${m.i}" role="row" tabindex="0">
                  <span class="cl-guest">
                    <span class="crm-av sm" style="background:${avColor(c.name)}">${esc(m.initials)}</span>
                    <span class="cl-name-wrap">
                      <span class="cl-name">${esc(c.name || 'Guest')}</span>
                      ${m.merged ? `<span class="crm-dup-hint inline">merged</span>` : ''}
                    </span>
                  </span>
                  <span class="cl-phone">${esc(m.phoneLabel)}</span>
                  <span class="cl-tier"><span class="tier-badge ${esc(tierCls[m.tier] || 'tier-silver')}">${esc(m.tier)}</span></span>
                  <span class="cl-num">${c.visits || 0}</span>
                  <span class="cl-num">${rs(c.spend || 0)}</span>
                  <span class="cl-num ${c.dues > 0 ? 'due' : ''}">${c.dues > 0 ? rs(c.dues) : '—'}</span>
                  <span class="cl-last">${esc(m.lastLabel)}</span>
                  <span class="cl-acts">
                    <button type="button" class="btn btn-ghost btn-sm icon-only" data-crm-wa data-i="${m.i}" title="WhatsApp"><i class="fa-brands fa-whatsapp"></i></button>
                    ${c.dues > 0
                      ? `<button type="button" class="btn btn-primary btn-sm" data-crm-settle data-i="${m.i}" style="background:var(--orange);border-color:var(--orange)">Settle</button>`
                      : `<button type="button" class="btn btn-ghost btn-sm" data-crm-open data-i="${m.i}">Profile</button>`}
                  </span>
                </div>`;
              }).join('')}
            </div>`;
        } else {
          grid.className = 'crm-body is-cards crm-grid';
          grid.innerHTML = list
            .map((c) => {
              const m = rowMeta(c);
              return `
          <div class="crm-card ${c.dues > 0 ? 'has-dues' : ''}" data-i="${m.i}" role="button" tabindex="0">
            <div class="crm-top">
              <div class="crm-av" style="background:${avColor(c.name)}">${esc(m.initials)}</div>
              <div class="crm-name-block">
                <div class="crm-name">
                  <span>${esc(c.name || 'Guest')}</span>
                  <span class="tier-badge ${esc(tierCls[m.tier] || 'tier-silver')}">${esc(m.tier)}</span>
                  ${c.dues > 0 ? `<span class="crm-due-pill">Due ${rs(c.dues)}</span>` : ''}
                </div>
                <div class="crm-phone"><i class="fa-solid fa-phone"></i>${esc(m.phoneLabel)}</div>
                ${m.merged ? `<div class="crm-dup-hint">Merged ${c._mergedCount} saved profiles</div>` : ''}
              </div>
            </div>
            <div class="crm-stats">
              <div class="cs"><div class="csv">${c.visits || 0}</div><div class="csl">Visits</div></div>
              <div class="cs"><div class="csv">${rs(c.spend || 0)}</div><div class="csl">Spent</div></div>
              <div class="cs"><div class="csv" style="font-size:12px;font-weight:600">${esc(m.lastLabel)}</div><div class="csl">Last order</div></div>
            </div>
            <div class="crm-card-actions">
              <button type="button" class="btn btn-ghost btn-sm" data-crm-wa data-i="${m.i}"><i class="fa-brands fa-whatsapp"></i> WhatsApp</button>
              ${
                c.dues > 0
                  ? `<button type="button" class="btn btn-primary btn-sm" data-crm-settle data-i="${m.i}" style="background:var(--orange);border-color:var(--orange)"><i class="fa-solid fa-indian-rupee-sign"></i> Settle</button>`
                  : `<button type="button" class="btn btn-ghost btn-sm" data-crm-open data-i="${m.i}"><i class="fa-solid fa-user"></i> Profile</button>`
              }
            </div>
          </div>`;
            })
            .join('');
        }

        function wireRows() {
          $$('.crm-card, .crm-list-row', grid).forEach((el) => {
            const open = () => {
              const c = CUSTOMERS[+el.dataset.i];
              if (c) customerModal(c);
            };
            el.onclick = (e) => {
              if (e.target.closest('[data-crm-wa],[data-crm-settle],[data-crm-open]')) return;
              open();
            };
            el.onkeydown = (e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                open();
              }
            };
          });
          $$('[data-crm-wa]', grid).forEach((btn) => {
            btn.onclick = (e) => {
              e.stopPropagation();
              const c = CUSTOMERS[+btn.dataset.i];
              if (!c) return;
              const d = waDigits(c.phone);
              if (!d || d.length < 10) return RS.toast('No valid phone number', 'fa-circle-exclamation');
              window.open(
                `https://wa.me/${d}?text=${encodeURIComponent('Hi ' + (c.name || '') + ', thank you for dining with us!')}`,
                '_blank',
                'noopener,noreferrer'
              );
            };
          });
          $$('[data-crm-settle]', grid).forEach((btn) => {
            btn.onclick = (e) => {
              e.stopPropagation();
              const c = CUSTOMERS[+btn.dataset.i];
              if (c) showSettleDuesModal(c);
            };
          });
          $$('[data-crm-open]', grid).forEach((btn) => {
            btn.onclick = (e) => {
              e.stopPropagation();
              const c = CUSTOMERS[+btn.dataset.i];
              if (c) customerModal(c);
            };
          });
        }
        wireRows();
      }

      draw();
      const searchEl = $('#crm-search');
      if (searchEl) searchEl.addEventListener('input', (e) => draw(e.target.value));
      $$('[data-crm-f]', sec).forEach((btn) => {
        btn.onclick = () => {
          _crmFilter = btn.getAttribute('data-crm-f') || 'all';
          $$('[data-crm-f]', sec).forEach((b) => b.classList.toggle('active', b === btn));
          draw(searchEl ? searchEl.value : '');
        };
      });
      if (window.RSViewMode) {
        _crmView = RSViewMode.wire(sec, 'customers', (m) => {
          _crmView = m;
          draw(searchEl ? searchEl.value : '');
        }, 'list');
      } else {
        $$('[data-crm-view]', sec).forEach((btn) => {
          btn.onclick = () => {
            _crmView = btn.getAttribute('data-crm-view') === 'cards' ? 'cards' : 'list';
            try { localStorage.setItem('rs_crm_view', _crmView); } catch (e) {}
            $$('[data-crm-view]', sec).forEach((b) => b.classList.toggle('active', b === btn));
            draw(searchEl ? searchEl.value : '');
          };
        });
      }
      const sortEl = $('#crm-sort');
      if (sortEl) {
        sortEl.onchange = () => {
          _crmSort = sortEl.value || 'recent';
          draw(searchEl ? searchEl.value : '');
        };
      }

      const broadcastBtn = $('#btn-crm-broadcast');
      if(broadcastBtn) broadcastBtn.onclick = () => {
        // Settings → Promotional messages (default OFF)
        const promoOn =
          typeof window.RS_featureOn === 'function'
            ? window.RS_featureOn('set_promotional_messages', window.RS_SETTINGS, false)
            : window.RS_SETTINGS?.set_promotional_messages === true ||
              window.RS_SETTINGS?.set_promotional_messages === 'true';
        if (!promoOn) {
          RS.toast('Promotional messages are off — enable in Settings → WhatsApp', 'fa-ban');
          return;
        }
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
                summary: 'Customer rows will update loyalty profiles for this outlet and sync to the cloud when available.', 
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

      const addBtn = $('#btn-add-customer');
      if (addBtn) {
        addBtn.onclick = () => {
          RSModal.open({
            title: 'Add customer',
            sub: 'Loyalty profile · unique phone per guest',
            icon: 'fa-user-plus',
            size: 'sm',
            body: `<div style="display:flex;flex-direction:column;gap:12px">
              <div class="form-group"><label class="fl">Full name</label><input class="form-input" id="add-cust-name" placeholder="e.g. Priya Sharma" autocomplete="name"></div>
              <div class="form-group"><label class="fl">Phone (WhatsApp)</label><input class="form-input" id="add-cust-phone" placeholder="+91 98765 43210" inputmode="tel" autocomplete="tel"></div>
              <div class="form-group"><label class="fl">Email (optional)</label><input class="form-input" id="add-cust-email" placeholder="guest@email.com" autocomplete="email"></div>
              <p style="font-size:11.5px;color:var(--text-soft);margin:0;line-height:1.4">Phone is normalized (last 10 digits). Existing guests with the same number are updated, not duplicated.</p>
            </div>`,
            foot: `<button class="btn btn-ghost" data-x>Cancel</button><button class="btn btn-primary" id="btn-save-new-cust"><i class="fa-solid fa-check"></i> Save</button>`,
            onMount(modal, close) {
              modal.querySelector('[data-x]').onclick = close;
              const saveBtn = modal.querySelector('#btn-save-new-cust');
              saveBtn.onclick = async () => {
                const name = modal.querySelector('#add-cust-name').value.trim();
                const phoneRaw = modal.querySelector('#add-cust-phone').value.trim();
                const email = modal.querySelector('#add-cust-email').value.trim();
                const phoneKey = normPhone(phoneRaw);
                if (!name || phoneKey.length < 8) {
                  RS.toast('Name and a valid phone are required', 'fa-circle-exclamation');
                  return;
                }
                const phone = phoneKey.length === 10 ? phoneKey : phoneRaw.replace(/\s+/g, '');
                saveBtn.disabled = true;
                try {
                  // Upsert by phone if exists
                  let existing = CUSTOMERS.find((x) => phonesMatch(x.phone, phone));
                  if (!existing && window.RS_DB) {
                    try {
                      const all = await RS_DB.list('customers');
                      existing = (all || []).find((x) => phonesMatch(x.phone, phone));
                    } catch (e) {}
                  }
                  const newCust = {
                    id: existing && existing.id ? existing.id : undefined,
                    name,
                    phone,
                    email,
                    visits: existing ? existing.visits || 0 : 0,
                    spend: existing ? existing.spend || 0 : 0,
                    dues: existing ? existing.dues || 0 : 0,
                    last: existing ? existing.last : null,
                    tier: existing ? normalizeCustTier(existing.tier) : 'silver',
                    notes: existing ? existing.notes || '' : '',
                  };
                  if (window.RS_DB) {
                    const saved = await RS_DB.put('customers', newCust.id, newCust);
                    if (saved && saved.id) newCust.id = saved.id;
                  } else if (RS.saveOne) {
                    await RS.saveOne('customers', { ...newCust, id: newCust.id || 'cust-' + phone });
                  }
                  RS.toast(existing ? 'Customer updated · ' + name : 'Customer saved · ' + name, 'fa-circle-check');
                  close();
                  renderCustomers();
                } catch (e) {
                  console.warn('Failed saving customer', e);
                  RS.toast('Save failed: ' + (e.message || 'try again'), 'fa-circle-exclamation');
                } finally {
                  saveBtn.disabled = false;
                }
              };
            },
          });
        };
      }
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
      const custBills = billsForCustomer(c);
      const history = custBills.slice(0, 12).map((b) => [
        formatCustBillTime(b),
        (b._items || []).map((i) => `${i.name} x${i.qty}`).join(', ') || (b.items != null ? b.items + ' items' : '—'),
        Number(b.amount != null ? b.amount : b.total) || 0,
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
      const phoneShow = formatPhoneDisplay(c.phone);

      RSModal.open({ title:c.name, sub:phoneShow+' · '+tierLabel+' · '+points+' pts', icon:'fa-user', size:'md',
        body:`<div class="crm-stats" style="margin-bottom:16px"><div class="cs"><div class="csv">${c.visits||0}</div><div class="csl">Visits</div></div><div class="cs"><div class="csv">${rs(c.spend||0)}</div><div class="csl">Lifetime</div></div><div class="cs"><div class="csv">${rs(avgVisit)}</div><div class="csl">Avg / visit</div></div><div class="cs"><div class="csv" style="color:var(--orange)">${points}</div><div class="csl">Points</div></div></div>
          ${(c._mergedCount || 0) > 1 ? `<div style="font-size:12px;color:#b45309;margin-bottom:10px;font-weight:700"><i class="fa-solid fa-object-group"></i> ${c._mergedCount} CRM rows shared this phone — shown as one guest</div>` : ''}
          ${c.notes ? `<div style="font-size:12.5px;color:var(--text-soft);margin-bottom:12px;padding:8px 10px;background:var(--glass);border-radius:8px"><i class="fa-solid fa-sticky-note"></i> ${esc(c.notes)}</div>` : ''}
          ${c.email ? `<div style="font-size:12.5px;color:var(--text-soft);margin-bottom:12px"><i class="fa-solid fa-envelope" style="opacity:.5"></i> ${esc(c.email)}</div>` : ''}
          ${c.dues > 0 ? `
          <div style="background:var(--orange-tint); border:1px solid rgba(255,107,0,0.3); border-radius:12px; padding:10px 14px; margin-bottom:16px; display:flex; justify-content:space-between; align-items:center; gap:10px; flex-wrap:wrap">
            <div style="font-size:13px; color:var(--text); font-weight:700;"><i class="fa-solid fa-triangle-exclamation" style="color:var(--orange); margin-right:6px;"></i> Outstanding dues: <span style="color:var(--orange); font-size:15px; font-weight:800;">${rs(c.dues)}</span></div>
            <button type="button" class="btn btn-sm btn-primary" style="background:var(--orange); border-color:var(--orange); font-size:11px;" id="modal-settle-dues-btn">Settle now</button>
          </div>` : ''}
          <div class="panel-head" style="margin-bottom:10px"><h3 style="font-size:14px">Recent orders</h3><span class="ph-sub">${custBills.length} total</span></div>
          <table class="data-table"><tbody>${history.length > 0 ? history.map(h=>`<tr><td style="white-space:nowrap">${esc(h[0])}</td><td style="color:var(--text-soft)">${esc(h[1])}</td><td class="td-strong" style="text-align:right">${rs(h[2])}</td></tr>`).join('') : '<tr><td colspan="3" style="text-align:center;color:var(--text-mute)">No order history yet — visits appear after POS bills with this phone</td></tr>'}</tbody></table>`,
        foot:`<button type="button" class="btn btn-ghost btn-sm" data-edit title="Edit profile"><i class="fa-solid fa-pen"></i></button>
              <button type="button" class="btn btn-ghost btn-sm" data-del title="Delete customer" style="color:var(--red)"><i class="fa-solid fa-trash-can"></i></button>
              <button type="button" class="btn btn-ghost" style="flex:1" data-wa><i class="fa-brands fa-whatsapp"></i> Message</button>
              ${c.dues > 0 ? `<button type="button" class="btn btn-primary" style="flex:1; background:var(--orange); border-color:var(--orange);" id="modal-settle-dues-foot"><i class="fa-solid fa-hand-holding-dollar"></i> Settle</button>` : ''}
              <button type="button" class="btn btn-ghost" style="flex:1; border:1px solid var(--stroke-2)" data-offer><i class="fa-solid fa-tags"></i> Offer</button>`,
        onMount(modal,close){
          modal.querySelector('[data-wa]').onclick=()=>{
            const d = waDigits(c.phone);
            if (!d) return RS.toast('No phone number', 'fa-circle-exclamation');
            window.open(`https://wa.me/${d}?text=${encodeURIComponent('Hi '+c.name+', thank you for dining with us.')}`, '_blank', 'noopener,noreferrer');
            RS.toast('WhatsApp ready for '+c.name,'fa-whatsapp');
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
                  const offerRow = { code, title, pct, discount_pct: pct, fixed: 0, customerPhone: c.phone, customerName: c.name, createdAt: new Date().toISOString(), expiresAt: expiry, status: 'sent' };
                  try { if (window.RS_DB) await RS_DB.put('offers', null, offerRow); } catch(e) { console.warn('Failed to save offer record', e); }
                  window.open(`https://wa.me/${waDigits(c.phone)}?text=${encodeURIComponent(msg)}`, '_blank', 'noopener,noreferrer');
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
            const phoneKey = normPhone(phone);
            c.name = name;
            c.phone = phoneKey.length === 10 ? phoneKey : phone;
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
      {ic:'fa-gift',bg:'bg-g',t:'Loyalty Program',d:'Points, tiers & rewards',m:'Open module'},
      {ic:'fa-graduation-cap',bg:'bg-a',t:'Learning Center',d:'PDFs, videos & training for your team',m:'Open module'}
    ];
    function renderHub(){
      const grid = $('#hub-grid');
      grid.innerHTML = HUB.map((h,i)=>`<div class="hub-card" data-i="${i}"><div class="hub-ic ${h.bg}"><i class="fa-solid ${h.ic}"></i></div><h4>${h.t}</h4><p>${h.d}</p><span class="hub-meta"><span class="dot" style="color:var(--orange)"></span>${h.m}</span></div>`).join('');
      $$('.hub-card',grid).forEach(c=> c.onclick=()=> hubScreen(HUB[+c.dataset.i].t));
    }
    function renderGrowthHub(){ return renderHub(); }
    function table(head, rows){ return `<div class="table-scroll"><table class="data-table"><thead><tr>${head.map(h=>`<th>${h}</th>`).join('')}</tr></thead><tbody>${rows}</tbody></table></div>`; }
    function hubLocalKey(kind) {
      try {
        const tid = sessionStorage.getItem('tenant_id') || sessionStorage.getItem('tenant_slug') || 'local';
        return 'rs_hub_' + kind + '_' + tid;
      } catch (e) { return 'rs_hub_' + kind; }
    }
    function hubLocalList(kind) {
      try {
        const raw = JSON.parse(localStorage.getItem(hubLocalKey(kind)) || '[]');
        return Array.isArray(raw) ? raw : [];
      } catch (e) { return []; }
    }
    function hubLocalSave(kind, rows) {
      try { localStorage.setItem(hubLocalKey(kind), JSON.stringify(rows || [])); } catch (e) {}
    }

    /** Built-in learning pack (PDFs already in /downloads). Videos/links added by staff. */
    function learningCenterDefaults() {
      const base = (function () {
        try {
          const h = (location.hostname || '').toLowerCase();
          if (h === 'localhost' || h === '127.0.0.1') return 'https://restrosuite.codearc.co.in';
          return location.origin || 'https://restrosuite.codearc.co.in';
        } catch (_) {
          return 'https://restrosuite.codearc.co.in';
        }
      })();
      return [
        {
          id: 'learn-pdf-product',
          title: 'Product features guide',
          type: 'pdf',
          category: 'Product',
          description: 'Full brochure of client modules for owners evaluating RestroSuite.',
          url: base + '/downloads/RestroSuite-Product-Features-Guide.pdf',
          builtin: true,
          createdAt: '2026-07-16',
        },
        {
          id: 'learn-pdf-desktop',
          title: 'Desktop / web onboarding',
          type: 'pdf',
          category: 'Getting started',
          description: 'Step-by-step with screenshots — every tab and flow on desktop.',
          url: base + '/downloads/RestroSuite-Complete-Onboarding-Guide.pdf',
          builtin: true,
          createdAt: '2026-07-17',
        },
        {
          id: 'learn-pdf-mobile',
          title: 'Mobile / Android onboarding',
          type: 'pdf',
          category: 'Getting started',
          description: 'Phone layout, bottom nav, More menu, checkout bar.',
          url: base + '/downloads/RestroSuite-Mobile-Onboarding-Guide.pdf',
          builtin: true,
          createdAt: '2026-07-17',
        },
        {
          id: 'learn-onboarding-pdf',
          title: 'Complete onboarding guide (desktop)',
          type: 'pdf',
          category: 'Getting started',
          description: 'Step-by-step screenshots for every major tab on desktop and web.',
          url: base + '/downloads/RestroSuite-Complete-Onboarding-Guide.pdf',
          builtin: true,
          createdAt: '2026-07-18',
        },
      ];
    }
    function learningTypeIcon(type) {
      const t = String(type || 'link').toLowerCase();
      if (t === 'pdf') return 'fa-file-pdf';
      if (t === 'video') return 'fa-circle-play';
      if (t === 'doc') return 'fa-file-lines';
      return 'fa-link';
    }
    function learningCenterListHtml(rows) {
      if (!rows || !rows.length) {
        return '<div class="sr-empty"><div style="font-size:28px;opacity:.35;margin-bottom:8px"><i class="fa-solid fa-graduation-cap"></i></div><div style="font-weight:700;margin-bottom:4px">No materials yet</div><div style="font-size:13px;color:var(--text-soft)">Add a PDF, video link, or document for your team.</div></div>';
      }
      return `<div style="display:flex;flex-direction:column;gap:10px">` + rows.map((r) => {
        const type = String(r.type || 'link').toLowerCase();
        const ic = learningTypeIcon(type);
        const cat = r.category || 'General';
        const isPh = !!r.placeholder || !r.url;
        return `<div class="learn-card" data-learn-type="${esc(type)}" style="display:flex;gap:12px;align-items:flex-start;padding:12px 14px;border:1px solid var(--stroke);border-radius:14px;background:var(--panel)">
          <div style="width:42px;height:42px;border-radius:12px;background:var(--orange-tint,rgba(255,79,0,.12));display:grid;place-items:center;flex-shrink:0;color:var(--orange)">
            <i class="fa-solid ${ic}"></i>
          </div>
          <div style="flex:1;min-width:0">
            <div style="font-weight:800;font-size:14px;color:var(--text)">${esc(r.title || 'Untitled')}</div>
            <div style="font-size:11px;color:var(--text-mute);margin-top:2px;text-transform:uppercase;letter-spacing:.04em">${esc(type)} · ${esc(cat)}${r.builtin ? ' · Built-in' : ''}</div>
            <div style="font-size:12.5px;color:var(--text-soft);margin-top:6px;line-height:1.45">${esc(r.description || '')}</div>
          </div>
          <div style="display:flex;flex-direction:column;gap:6px;flex-shrink:0">
            ${isPh
              ? `<span class="btn btn-ghost btn-sm" style="opacity:.6;cursor:default;pointer-events:none">Soon</span>`
              : `<button type="button" class="btn btn-primary btn-sm" data-learn-open="${esc(r.id)}"><i class="fa-solid fa-arrow-up-right-from-square"></i> Open</button>
                 <button type="button" class="btn btn-ghost btn-sm" data-learn-copy="${esc(r.id)}"><i class="fa-solid fa-copy"></i></button>`}
            ${r.builtin ? '' : `<button type="button" class="btn btn-ghost btn-sm" data-learn-del="${esc(r.id)}" title="Remove" style="color:var(--red,#b91c1c)"><i class="fa-solid fa-trash"></i></button>`}
          </div>
        </div>`;
      }).join('') + `</div>`;
    }

    async function hubSave(coll, row) {
      const payload = { ...(row || {}) };
      // Let uuid tables allocate real UUIDs (never send RES-/TKT-/OFF- as PK)
      if (payload.id != null && !/^[0-9a-f]{8}-[0-9a-f]{4}-/i.test(String(payload.id))) {
        // keep logical codes in their own fields
        if (coll === 'support_tickets' && !payload.ticketNumber) payload.ticketNumber = payload.id;
        if (coll === 'offers' && !payload.code) payload.code = payload.id;
        delete payload.id;
      }
      if (window.RS_DB && RS_DB.put) {
        return RS_DB.put(coll, payload.id, payload);
      }
      if (RS.saveOne) return RS.saveOne(coll, payload);
      return payload;
    }
    async function hubRunAction(btn, fn) {
      if (!btn) return fn();
      const prev = btn.innerHTML;
      btn.disabled = true;
      try {
        await fn();
      } finally {
        btn.disabled = false;
        try { btn.innerHTML = prev; } catch (e) {}
      }
    }

    async function hubScreen(name){
      let body='', size='md', icon='fa-rocket', sub='';
      let records = [];
      let footExtra = '';

      if(name==='Reservations'){ 
        icon='fa-calendar-check'; sub="Bookings · floor plan · WhatsApp confirm"; size='lg';
        if (window.RS_DB) {
          try { records = await RS_DB.list('reservations'); } catch(e){}
        }
        const today = new Date().toISOString().slice(0,10);
        const sorted = (records || []).slice().sort((a,b) => String(a.date||'').localeCompare(String(b.date||'')) || String(a.time||'').localeCompare(String(b.time||'')));
        const upcoming = sorted.filter(r => !r.date || r.date >= today);
        const show = upcoming.length ? upcoming : sorted;
        body = show.length 
          ? `<div style="font-size:12px;color:var(--text-soft);margin-bottom:10px">${show.length} booking(s) · Seat / cancel updates floor plan status</div>`
            + table(['Date','Time','Guest','Pax','Table','Status','Actions'], show.map(r=>{
              const st = String(r.status || 'confirmed').toLowerCase();
              const open = st === 'confirmed' || st === 'booked' || st === 'pending';
              return `<tr data-res-id="${esc(r.id)}">
              <td>${esc(r.date || '—')}</td>
              <td class="td-strong">${esc(r.time || '—')}</td>
              <td>${esc(r.guestName || '—')}<div style="font-size:11px;color:var(--text-soft)">${esc(r.guestPhone || '')}</div></td>
              <td>${esc(r.pax || 2)}</td>
              <td>${esc(r.tableNumber || '—')}</td>
              <td><span class="pill ${open?'pill-green':st==='seated'?'pill-violet':st==='cancelled'||st==='no_show'?'pill-amber':'pill-violet'}" style="padding:3px 10px;text-transform:capitalize">${esc(st)}</span></td>
              <td style="white-space:nowrap">${open ? `
                <button type="button" class="btn btn-ghost btn-sm" data-hub-act="res-seat" data-id="${esc(r.id)}" title="Seated">Seat</button>
                <button type="button" class="btn btn-ghost btn-sm" data-hub-act="res-noshow" data-id="${esc(r.id)}" title="No-show">No-show</button>
                <button type="button" class="btn btn-ghost btn-sm" data-hub-act="res-cancel" data-id="${esc(r.id)}" title="Cancel">Cancel</button>
              ` : '—'}</td>
            </tr>`;
            }).join(''))
          : '<div class="sr-empty"><div style="font-size:28px;opacity:.35;margin-bottom:8px"><i class="fa-solid fa-calendar-check"></i></div><div style="font-weight:700;margin-bottom:4px">No reservations yet</div><div style="font-size:13px;color:var(--text-soft);max-width:320px;margin:0 auto">Book a table for walk-ins or WhatsApp enquiries. Confirmed bookings show on the floor plan for that day.</div></div>'; 
      }
      else if(name==='Support Tickets'){ 
        icon='fa-headset'; sub='Open → resolve workflow · cloud-synced'; size='lg';
        if (window.RS_DB) {
          try { records = await RS_DB.list('support_tickets'); } catch(e){}
        }
        const openN = (records || []).filter(r => String(r.status||'open').toLowerCase() === 'open' || String(r.status).toLowerCase() === 'waiting').length;
        body = records && records.length 
          ? `<div style="font-size:12px;color:var(--text-soft);margin-bottom:10px"><b>${openN}</b> open · ${records.length} total · resolve when fixed</div>`
            + table(['Ticket','Subject','Customer','Priority','Status','Actions'], records.map(r=>{
              const st = String(r.status || 'open').toLowerCase();
              const isOpen = st === 'open' || st === 'waiting';
              return `<tr>
              <td><b>${esc(r.ticketNumber || r.id)}</b></td>
              <td>${esc(r.subject)}<div style="font-size:11px;color:var(--text-soft);max-width:180px;overflow:hidden;text-overflow:ellipsis">${esc(r.notes || '')}</div></td>
              <td>${esc(r.customerName)}</td>
              <td><span class="pill ${r.priority==='high'?'pill-red':r.priority==='medium'?'pill-amber':''}" style="padding:3px 10px;text-transform:capitalize">${esc(r.priority||'medium')}</span></td>
              <td><span class="pill ${isOpen?'pill-orange':'pill-green'}" style="padding:3px 10px;text-transform:capitalize">${esc(st)}</span></td>
              <td style="white-space:nowrap">${isOpen
                ? `<button type="button" class="btn btn-ghost btn-sm" data-hub-act="tkt-resolve" data-id="${esc(r.id)}">Resolve</button>
                   <button type="button" class="btn btn-ghost btn-sm" data-hub-act="tkt-wait" data-id="${esc(r.id)}">Waiting</button>`
                : `<button type="button" class="btn btn-ghost btn-sm" data-hub-act="tkt-reopen" data-id="${esc(r.id)}">Reopen</button>`
              }</td>
            </tr>`;
            }).join('')) 
          : '<div class="sr-empty"><div style="font-size:28px;opacity:.35;margin-bottom:8px"><i class="fa-solid fa-headset"></i></div><div style="font-weight:700;margin-bottom:4px">No support tickets</div><div style="font-size:13px;color:var(--text-soft)">Log complaints, double-charge issues, or service feedback. Tickets sync to your outlet cloud DB.</div></div>'; 
      }
      else if(name==='Recipe Costing'){ 
        icon='fa-flask-vial'; sub='Plate cost from Menu Editor recipes × inventory costs'; size='lg';
        const menu = Array.isArray(RS.MENU) ? RS.MENU : [];
        const inv = Array.isArray(RS.INVENTORY) ? RS.INVENTORY : [];
        const findInv = (g) => {
          const nm = String((g && (g.name || g.ingredient || g.item)) || '').toLowerCase();
          const key = String((g && g.key) || '').toLowerCase();
          return inv.find(x =>
            (key && String(x.key || '').toLowerCase() === key) ||
            String(x.name || '').toLowerCase() === nm ||
            String(x.id || '') === String(g && g.id || '')
          );
        };
        const lines = menu.map(m => {
          const ing = Array.isArray(m.ingredients) ? m.ingredients : [];
          const servings = Math.max(1, Number(m.recipeServings != null ? m.recipeServings : m.servings) || 1);
          let batchCost = 0;
          let linked = 0;
          let missing = 0;
          if (ing.length) {
            ing.forEach((g) => {
              const row = findInv(g);
              const unitCost = row ? Number(row.cost != null ? row.cost : row.unit_cost) || 0 : 0;
              const qty = Number(g.qty != null ? g.qty : g.quantity) || 0;
              if (row && unitCost > 0) linked += 1;
              else if (qty > 0) missing += 1;
              batchCost += unitCost * qty;
            });
          }
          const recipeCost = batchCost / servings;
          const fromRecipe = linked > 0 && recipeCost > 0;
          const price = Number(m.price) || 0;
          const c = fromRecipe ? Math.round(recipeCost * 100) / 100 : (price > 0 ? Math.round(price * 0.32 * 100) / 100 : 0);
          const margin = price > 0 ? Math.round((1 - c / price) * 100) : 0;
          return {
            id: m.id, name: m.name, cat: m.cat || m.category || '—', price, cost: c, margin, fromRecipe,
            linked, missing, ingCount: ing.length, pending: !!m.recipePending,
          };
        }).sort((a,b) => a.margin - b.margin);
        const avgM = lines.length ? Math.round(lines.reduce((s,l)=>s+l.margin,0)/lines.length) : 0;
        const low = lines.filter(l => l.margin < 50).length;
        const withRecipe = lines.filter(l => l.fromRecipe).length;
        const kpis = `<div class="crm-stats" style="margin-bottom:12px">
          <div class="cs"><div class="csv">${lines.length}</div><div class="csl">Items</div></div>
          <div class="cs"><div class="csv">${withRecipe}</div><div class="csl">Recipe-costed</div></div>
          <div class="cs"><div class="csv">${avgM}%</div><div class="csl">Avg margin</div></div>
          <div class="cs"><div class="csv" style="color:${low?'var(--orange)':'var(--green)'}">${low}</div><div class="csl">Below 50%</div></div>
        </div>
        <p style="font-size:12px;color:var(--text-soft);margin:0 0 12px;line-height:1.4">
          Plate cost = <b>(recipe qty × inventory unit cost) ÷ servings</b> from Menu Editor. Items without recipes or unit costs show <b>(est.)</b> ~32% of sell price.
          <button type="button" class="btn btn-ghost btn-sm" data-open-menu style="margin-left:6px"><i class="fa-solid fa-utensils"></i> Menu Editor</button>
        </p>`;
        const rows = lines.map(l => `<tr>
          <td><b>${esc(l.name)}</b>${l.pending ? ' <span class="pill pill-amber" style="padding:2px 6px;font-size:10px">recipe?</span>' : ''}</td>
          <td style="font-size:12px">${esc(l.cat)}</td>
          <td class="td-strong">${rs(l.price)}</td>
          <td>${rs(l.cost)}${l.fromRecipe
            ? ` <span style="font-size:10px;color:var(--text-mute)">${l.linked}/${l.ingCount} ing</span>`
            : ' <span style="font-size:10px;color:var(--text-mute)">(est.)</span>'}</td>
          <td style="color:${l.margin<50?'var(--orange)':'var(--green)'};font-weight:700">${l.margin}%</td>
        </tr>`).join('');
        body = lines.length
          ? kpis + table(['Item','Category','Sells at','Plate cost','Margin'], rows)
          : '<div class="sr-empty">No menu items — add dishes in Menu Editor first.</div>';
        footExtra = `<button class="btn btn-ghost" data-open-menu><i class="fa-solid fa-utensils"></i> Edit recipes</button>`;
      }
      else if(name==='Offers & Coupons'){ 
        icon='fa-tags'; sub='POS promo codes · pause / resume'; size='lg';
        if (window.RS_DB) {
          try { records = await RS_DB.list('offers'); } catch(e){}
        }
        if ((!records || !records.length) && Array.isArray(RS.OFFERS) && RS.OFFERS.length) records = RS.OFFERS;
        body = records && records.length 
          ? `<p style="font-size:12px;color:var(--text-soft);margin:0 0 10px">Staff enter the <b>code</b> on POS cart promo. Only <b>active</b> codes discount the cart.</p>`
            + table(['Code','Offer','Discount','Usage','Status','Actions'], records.map(r=>{
              const disc = (Number(r.fixed||r.amount)>0) ? rs(r.fixed||r.amount)+' off' : ((r.pct||r.discount_pct||0)+'% off');
              const st = String(r.status || 'active').toLowerCase();
              return `<tr><td><b>${esc(r.code)}</b></td><td>${esc(r.description || r.title || 'Discount')}</td><td>${esc(disc)}</td><td>${esc(r.usageCount || 0)}</td>
              <td><span class="pill ${st==='active'?'pill-green':'pill-amber'}" style="padding:3px 10px;text-transform:capitalize">${esc(st)}</span></td>
              <td style="white-space:nowrap">${st==='active'
                ? `<button type="button" class="btn btn-ghost btn-sm" data-hub-act="off-pause" data-id="${esc(r.id)}">Pause</button>`
                : `<button type="button" class="btn btn-ghost btn-sm" data-hub-act="off-activate" data-id="${esc(r.id)}">Activate</button>`
              }</td></tr>`;
            }).join('')) 
          : '<div class="sr-empty"><div style="font-size:28px;opacity:.35;margin-bottom:8px"><i class="fa-solid fa-tags"></i></div><div style="font-weight:700;margin-bottom:4px">No offers yet</div><div style="font-size:13px;color:var(--text-soft)">Create FESTIVE20-style codes. They work on the POS cart when staff enter the code.</div></div>'; 
      }
      else if(name==='Loyalty Program'){ 
        icon='fa-gift'; sub='Points earn on POS · tiers from spend'; size='lg';
        const crm = window.RS_DB ? await RS_DB.list('customers').catch(() => []) : (Array.isArray(RS.CUSTOMERS) ? RS.CUSTOMERS : []);
        const totalMembers = crm.length;
        const totalPoints = crm.reduce((sum, c) => sum + (Number(c.points) || 0), 0);
        const vip = crm.filter(c => Number(c.spend) >= 10000 || String(c.tier||'').toLowerCase()==='vip').length;
        const gold = crm.filter(c => {
          const s = Number(c.spend)||0; const t = String(c.tier||'').toLowerCase();
          return t==='gold' || (s >= 5000 && s < 10000);
        }).length;
        const silver = Math.max(0, totalMembers - vip - gold);
        const top = crm.slice().sort((a,b)=>(Number(b.spend)||0)-(Number(a.spend)||0)).slice(0,8);
        body = `<div class="crm-stats" style="margin-bottom:14px">
            <div class="cs"><div class="csv">${totalMembers}</div><div class="csl">Members</div></div>
            <div class="cs"><div class="csv">${totalPoints}</div><div class="csl">Points balance</div></div>
            <div class="cs"><div class="csv">${vip}</div><div class="csl">VIP</div></div>
          </div>
          <p style="font-size:12px;color:var(--text-soft);margin:0 0 12px;line-height:1.45">
            Loyalty is <b>live on POS</b>: customers earn points on settle and can redeem from the cart banner (Settings → Loyalty). Tiers use lifetime spend.
          </p>`
          + table(['Tier','Members','Earn rate','Perk'], [
              ['VIP', vip, '3× points', 'Free dessert monthly'],
              ['Gold', gold, '2× points', 'Priority seating'],
              ['Silver', silver, '1× point', 'Birthday treat']
            ].map(r=>`<tr><td><span class="tier-badge ${r[0]==='VIP'?'tier-vip':r[0]==='Gold'?'tier-gold':'tier-silver'}">${r[0]}</span></td><td>${r[1]}</td><td>${r[2]}</td><td style="color:var(--text-soft)">${r[3]}</td></tr>`).join(''))
          + (top.length
            ? '<div style="margin-top:16px;font-size:12px;font-weight:800;margin-bottom:8px;color:var(--text-soft);letter-spacing:.04em;text-transform:uppercase">Top members</div>'
              + table(['Name','Phone','Spend','Points','Tier'], top.map(c=>`<tr>
                <td><b>${esc(c.name||'—')}</b></td>
                <td style="font-size:12px">${esc(c.phone||'—')}</td>
                <td class="td-strong">${rs(c.spend||0)}</td>
                <td>${esc(c.points||0)}</td>
                <td style="text-transform:capitalize">${esc(c.tier||'silver')}</td>
              </tr>`).join(''))
            : '<div class="sr-empty" style="padding:20px 0">No customers yet — they appear after POS bills or CRM add.</div>');
        footExtra = `<button class="btn btn-ghost" data-open-crm><i class="fa-solid fa-users"></i> Open CRM</button>`;
      }
      else if(name==='WhatsApp Campaigns'){ 
        icon='fa-bullhorn'; sub='Broadcast history · sends via WhatsApp'; size='lg';
        if (window.RS_DB) {
          try { records = await RS_DB.list('broadcasts'); } catch(e){}
        }
        if (!records || !records.length) records = hubLocalList('broadcasts');
        records = (records || []).slice().sort((a,b)=>String(b.createdAt||'').localeCompare(String(a.createdAt||'')));
        body = records.length
          ? `<p style="font-size:12px;color:var(--text-soft);margin:0 0 10px">Campaigns open pre-filled WhatsApp chats (browser blocks silent bulk send). Gateway can auto-send when connected.</p>`
            + table(['When','Audience','Recipients','Message'], records.map(r=>`<tr>
              <td style="font-size:12px;white-space:nowrap">${esc(String(r.createdAt||'').slice(0,16).replace('T',' '))}</td>
              <td style="text-transform:capitalize">${esc(r.audience||'all')}</td>
              <td class="td-strong">${esc(r.recipientCount||0)}</td>
              <td style="font-size:12px;max-width:220px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${esc(r.message||'')}</td>
            </tr>`).join(''))
          : '<div class="sr-empty"><div style="font-size:28px;opacity:.35;margin-bottom:8px"><i class="fa-solid fa-bullhorn"></i></div><div style="font-weight:700;margin-bottom:4px">No campaigns yet</div><div style="font-size:13px;color:var(--text-soft);max-width:340px;margin:0 auto">Compose a message for VIP / Gold / all customers with phones. Same engine as CRM → Broadcast.</div></div>'; 
      }
      else if(name==='Feedback & Reviews'){ 
        icon='fa-star'; sub='QR guest feedback + staff log'; size='lg';
        if (window.RS_DB) {
          try { records = await RS_DB.list('reviews'); } catch(e){}
        }
        const local = hubLocalList('reviews');
        if (!records || !records.length) records = local;
        else {
          // merge local-only ids not yet on cloud
          const ids = new Set(records.map(r => String(r.id)));
          local.forEach(r => { if (!ids.has(String(r.id))) records.push(r); });
        }
        records = (records || []).slice().sort((a,b)=>String(b.createdAt||'').localeCompare(String(a.createdAt||'')));
        const avg = records.length
          ? (records.reduce((s,r)=>s+(Number(r.rating)||0),0)/records.length).toFixed(1)
          : '—';
        let feedbackUrl = '';
        try {
          const slug = sessionStorage.getItem('tenant_slug') || '';
          // Guests must open the public site — never desktop localhost:8001
          if (slug) feedbackUrl = guestOrderBaseUrl() + '/feedback?tenant=' + encodeURIComponent(slug);
        } catch (e) {}
        const linkBar = feedbackUrl
          ? `<div style="display:flex;flex-wrap:wrap;gap:8px;align-items:center;margin-bottom:12px;padding:10px 12px;background:var(--panel-2,rgba(0,0,0,.03));border:1px solid var(--stroke);border-radius:12px">
              <div style="flex:1;min-width:160px;font-size:12px;color:var(--text-soft)"><b style="color:var(--text)">Guest QR link</b> <span style="font-size:11px;opacity:.85">(public URL for customers)</span><br><span style="word-break:break-all">${esc(feedbackUrl)}</span></div>
              <button type="button" class="btn btn-ghost btn-sm" data-copy-feedback><i class="fa-solid fa-copy"></i> Copy</button>
              <button type="button" class="btn btn-ghost btn-sm" data-open-feedback><i class="fa-solid fa-arrow-up-right-from-square"></i> Open</button>
            </div>`
          : '';
        const approvedN = records.filter(r => r.homepageApproved || r.status === 'approved').length;
        body = linkBar + (records.length
          ? `<div class="crm-stats" style="margin-bottom:12px">
              <div class="cs"><div class="csv">${records.length}</div><div class="csl">Reviews</div></div>
              <div class="cs"><div class="csv">${avg}</div><div class="csl">Avg stars</div></div>
              <div class="cs"><div class="csv">${approvedN}</div><div class="csl">On homepage</div></div>
              <div class="cs"><div class="csv">${records.filter(r=>String(r.source||'').indexOf('qr')>=0||r.source==='bill').length}</div><div class="csl">From QR/bill</div></div>
            </div>
            <p style="font-size:12px;color:var(--text-soft);margin:0 0 10px">Approve reviews to show stars &amp; quotes on the public RestroSuite homepage. Guests always submit as <b>pending</b>.</p>`
            + table(['Date','Guest','Stars','Comment','Status','Homepage'], records.map(r=>{
              const approved = !!(r.homepageApproved || r.status === 'approved');
              const st = approved ? 'approved' : (r.status || 'pending');
              return `<tr data-id="${esc(r.id)}">
              <td style="font-size:12px">${esc(String(r.createdAt||'').slice(0,10))}</td>
              <td><b>${esc(r.guestName||'Guest')}</b>${r.tableNumber ? `<div style="font-size:11px;color:var(--text-soft)">T ${esc(r.tableNumber)}</div>` : ''}</td>
              <td style="color:var(--orange);font-weight:800">${'★'.repeat(Math.min(5,Number(r.rating)||0))}${'☆'.repeat(Math.max(0,5-Math.min(5,Number(r.rating)||0)))}</td>
              <td style="font-size:12px;max-width:180px">${esc(r.comment||'—')}</td>
              <td style="font-size:11px;color:var(--text-soft)">${esc(st)} · ${esc(r.source||'staff')}</td>
              <td style="white-space:nowrap">
                ${approved
                  ? `<button type="button" class="btn btn-ghost btn-sm" data-rs10-review-act="hide" data-id="${esc(r.id)}" title="Hide from homepage"><i class="fa-solid fa-eye-slash"></i></button>`
                  : `<button type="button" class="btn btn-primary btn-sm" data-rs10-review-act="approve" data-id="${esc(r.id)}" title="Show on homepage"><i class="fa-solid fa-check"></i> Show</button>`}
              </td>
            </tr>`;
            }).join(''))
          : '<div class="sr-empty"><div style="font-size:28px;opacity:.35;margin-bottom:8px"><i class="fa-solid fa-star"></i></div><div style="font-weight:700;margin-bottom:4px">No reviews yet</div><div style="font-size:13px;color:var(--text-soft)">Share the guest QR link (also on digital bills) or log walk-out scores. Approve what goes on the homepage.</div></div>');
      }
      else if(name==='Learning Center'){
        icon = 'fa-graduation-cap';
        sub = 'PDFs · videos · links · team training';
        size = 'lg';
        const builtin = learningCenterDefaults();
        const custom = hubLocalList('learning');
        // Custom first (newest), then built-in guides not overridden by id
        const customIds = new Set(custom.map((r) => String(r.id)));
        records = custom.concat(builtin.filter((b) => !customIds.has(String(b.id))));
        const byType = (t) => records.filter((r) => String(r.type || '').toLowerCase() === t).length;
        body = `
          <div class="crm-stats" style="margin-bottom:12px">
            <div class="cs"><div class="csv">${records.length}</div><div class="csl">Materials</div></div>
            <div class="cs"><div class="csv">${byType('pdf')}</div><div class="csl">PDFs</div></div>
            <div class="cs"><div class="csv">${byType('video')}</div><div class="csl">Videos</div></div>
            <div class="cs"><div class="csv">${byType('link') + byType('doc')}</div><div class="csl">Links / docs</div></div>
          </div>
          <p style="font-size:12px;color:var(--text-soft);margin:0 0 12px;line-height:1.5">
            Train staff with guides and videos. Built-in PDFs ship with RestroSuite; add your own links or uploads
            (videos via YouTube/Drive URL for now — keep files small if uploading PDF).
          </p>
          <div style="display:flex;flex-wrap:wrap;gap:8px;margin-bottom:12px">
            ${['all','pdf','video','link','doc'].map((t) =>
              `<button type="button" class="btn btn-ghost btn-sm" data-learn-filter="${t}" style="border-radius:999px">${t === 'all' ? 'All' : t.toUpperCase()}</button>`
            ).join('')}
          </div>
          <div id="learn-list">${learningCenterListHtml(records)}</div>`;
      }
      else if(name==='Purchase Orders'){ 
        RS.activateTab('inventory-tab'); 
        setTimeout(()=>{
          const btns = $$('#inventory-tab .seg button');
          const po = btns.find(b => /purchase/i.test(b.textContent||'')) || btns[3];
          po && po.click();
        },80); 
        RS.toast('Opening purchase orders','fa-truck-ramp-box'); 
        return; 
      }
      else { body = `<p style="color:var(--text-soft)">${esc(name)} module.</p>`; }

      const hideNewBtn = ['Recipe Costing', 'Loyalty Program'].includes(name);
      const newLabel = name === 'WhatsApp Campaigns' ? 'New campaign'
        : name === 'Feedback & Reviews' ? 'Log review'
        : name === 'Learning Center' ? 'Add material'
        : 'New';

      RSModal.open({ title:name, sub, icon, size, body,
        foot: hideNewBtn
          ? `${footExtra}<div class="grow"></div><button class="btn btn-ghost" data-cancel>Close</button>`
          : `${footExtra}<div class="grow"></div><button class="btn btn-primary" data-x><i class="fa-solid fa-plus"></i> ${newLabel}</button><button class="btn btn-ghost" data-cancel>Close</button>`,
        onMount(modal,close){ 
          const cancelBtn = modal.querySelector('[data-cancel]');
          if (cancelBtn) cancelBtn.onclick = close;
          const crmBtn = modal.querySelector('[data-open-crm]');
          if (crmBtn) crmBtn.onclick = () => {
            close();
            try { RS.activateTab('customers-tab'); } catch (e) {}
          };
          modal.querySelectorAll('[data-open-menu]').forEach((b) => {
            b.onclick = () => {
              close();
              try { RS.activateTab('editor-tab'); } catch (e) {}
            };
          });
          const copyFb = modal.querySelector('[data-copy-feedback]');
          if (copyFb) {
            copyFb.onclick = async () => {
              try {
                const slug = sessionStorage.getItem('tenant_slug') || '';
                const url = guestOrderBaseUrl() + '/feedback?tenant=' + encodeURIComponent(slug);
                await navigator.clipboard.writeText(url);
                RS.toast('Guest feedback link copied', 'fa-copy');
              } catch (e) { RS.toast('Could not copy link', 'fa-circle-exclamation'); }
            };
          }
          const openFb = modal.querySelector('[data-open-feedback]');
          if (openFb) {
            openFb.onclick = () => {
              try {
                const slug = sessionStorage.getItem('tenant_slug') || '';
                window.open(guestOrderBaseUrl() + '/feedback?tenant=' + encodeURIComponent(slug), '_blank', 'noopener');
              } catch (e) {}
            };
          }

          // Learning Center: filter / open / copy / delete
          if (name === 'Learning Center') {
            const allRows = (function () {
              const builtin = learningCenterDefaults();
              const custom = hubLocalList('learning');
              const ids = new Set(custom.map((r) => String(r.id)));
              return custom.concat(builtin.filter((b) => !ids.has(String(b.id))));
            })();
            const listEl = modal.querySelector('#learn-list');
            const applyFilter = (ft) => {
              modal.querySelectorAll('[data-learn-filter]').forEach((b) => {
                const on = b.getAttribute('data-learn-filter') === ft;
                b.classList.toggle('btn-primary', on);
                b.classList.toggle('btn-ghost', !on);
              });
              const filtered = ft === 'all' ? allRows : allRows.filter((r) => String(r.type || '').toLowerCase() === ft);
              if (listEl) listEl.innerHTML = learningCenterListHtml(filtered);
              wireLearnRows();
            };
            const findRow = (id) => allRows.find((r) => String(r.id) === String(id));
            function wireLearnRows() {
              modal.querySelectorAll('[data-learn-open]').forEach((btn) => {
                btn.onclick = () => {
                  const row = findRow(btn.getAttribute('data-learn-open'));
                  if (!row || !row.url) {
                    RS.toast('No link yet — add a video or PDF URL', 'fa-circle-info');
                    return;
                  }
                  window.open(row.url, '_blank', 'noopener');
                };
              });
              modal.querySelectorAll('[data-learn-copy]').forEach((btn) => {
                btn.onclick = async () => {
                  const row = findRow(btn.getAttribute('data-learn-copy'));
                  if (!row || !row.url) return;
                  try {
                    await navigator.clipboard.writeText(row.url);
                    RS.toast('Link copied', 'fa-copy');
                  } catch (_) {
                    RS.toast('Could not copy', 'fa-circle-exclamation');
                  }
                };
              });
              modal.querySelectorAll('[data-learn-del]').forEach((btn) => {
                btn.onclick = () => {
                  const id = btn.getAttribute('data-learn-del');
                  if (!window.confirm('Remove this learning material?')) return;
                  const next = hubLocalList('learning').filter((r) => String(r.id) !== String(id));
                  hubLocalSave('learning', next);
                  RS.toast('Material removed', 'fa-trash');
                  close();
                  hubScreen('Learning Center');
                };
              });
            }
            modal.querySelectorAll('[data-learn-filter]').forEach((b) => {
              b.onclick = () => applyFilter(b.getAttribute('data-learn-filter') || 'all');
            });
            applyFilter('all');
          }

          // Row actions: tickets / reservations / offers
          modal.querySelectorAll('[data-hub-act]').forEach((btn) => {
            btn.onclick = () => hubRunAction(btn, async () => {
              const act = btn.getAttribute('data-hub-act');
              const id = btn.getAttribute('data-id');
              if (!act || !id) return;
              if (!window.RS_DB) {
                RS.toast('Database not ready — refresh and sign in again', 'fa-circle-exclamation');
                return;
              }
              if (act.startsWith('tkt-')) {
                let list = [];
                try { list = await RS_DB.list('support_tickets'); } catch (e) {}
                const row = (list || []).find((r) => String(r.id) === String(id) || String(r.ticketNumber) === String(id));
                if (!row || !row.id) { RS.toast('Ticket not found — reopen module', 'fa-circle-exclamation'); return; }
                if (act === 'tkt-resolve') row.status = 'resolved';
                if (act === 'tkt-wait') row.status = 'waiting';
                if (act === 'tkt-reopen') row.status = 'open';
                await hubSave('support_tickets', row);
                RS.toast('Ticket marked ' + row.status, 'fa-headset');
                close();
                hubScreen('Support Tickets');
              } else if (act.startsWith('res-')) {
                let list = [];
                try { list = await RS_DB.list('reservations'); } catch (e) {}
                const row = (list || []).find((r) => String(r.id) === String(id));
                if (!row || !row.id) { RS.toast('Reservation not found — reopen module', 'fa-circle-exclamation'); return; }
                if (act === 'res-seat') row.status = 'seated';
                if (act === 'res-noshow') row.status = 'no_show';
                if (act === 'res-cancel') row.status = 'cancelled';
                await hubSave('reservations', row);
                try { document.dispatchEvent(new Event('rs:tables-updated')); } catch (e) {}
                RS.toast('Reservation ' + String(row.status).replace('_', ' '), 'fa-calendar-check');
                close();
                hubScreen('Reservations');
              } else if (act.startsWith('off-')) {
                let list = [];
                try { list = await RS_DB.list('offers'); } catch (e) {}
                let row = (list || []).find((r) => String(r.id) === String(id));
                if (!row && Array.isArray(RS.OFFERS)) row = RS.OFFERS.find((r) => String(r.id) === String(id));
                if (!row || !row.id) { RS.toast('Offer not found — reopen module', 'fa-circle-exclamation'); return; }
                row.status = act === 'off-pause' ? 'paused' : 'active';
                const saved = await hubSave('offers', row);
                if (Array.isArray(RS.OFFERS)) {
                  const i = RS.OFFERS.findIndex((r) => String(r.id) === String(id) || String(r.code).toUpperCase() === String(row.code || '').toUpperCase());
                  if (i >= 0) RS.OFFERS[i] = { ...RS.OFFERS[i], ...row, id: (saved && saved.id) || row.id, status: row.status };
                }
                RS.toast(row.status === 'active' ? 'Offer live on POS' : 'Offer paused', 'fa-tags');
                close();
                hubScreen('Offers & Coupons');
              }
            }).catch((e) => {
              console.warn(e);
              RS.toast((e && e.message) ? String(e.message).slice(0, 80) : 'Update failed — try again', 'fa-circle-exclamation');
            });
          });

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
                    const confirmBtn = resModal.querySelector('[data-confirm]');
                    confirmBtn.onclick = () => hubRunAction(confirmBtn, async () => {
                      const guestName = (resModal.querySelector('#res-guest').value || '').trim();
                      if (!guestName) { RS.toast('Guest name is required', 'fa-circle-exclamation'); return; }
                      const guestPhone = (resModal.querySelector('#res-phone').value || '').trim();
                      const date = resModal.querySelector('#res-date').value || _todayISO;
                      let time = resModal.querySelector('#res-time').value || '19:30';
                      if (/^\d{2}:\d{2}$/.test(time)) time = time + ':00';
                      const pax = Math.max(1, Number(resModal.querySelector('#res-pax').value) || 2);
                      const tableNumber = (resModal.querySelector('#res-table').value || '').trim();
                      const resRow = {
                        guestName, guestPhone, pax, tableNumber,
                        date, time: time.slice(0, 5),
                        status: 'confirmed',
                        reserved_for: (() => {
                          try {
                            const d = new Date(date + 'T' + time);
                            return isNaN(d.getTime()) ? new Date().toISOString() : d.toISOString();
                          } catch (e) { return new Date().toISOString(); }
                        })(),
                      };
                      try {
                        await hubSave('reservations', resRow);
                        resClose();
                        RS.toast('Reservation booked · shows on floor for that day', 'fa-circle-check');
                        try { document.dispatchEvent(new Event('rs:tables-updated')); } catch (e) {}
                        try {
                          if (typeof sendReservationWhatsApp === 'function') {
                            await sendReservationWhatsApp({ guestName, guestPhone, tableNumber, date, time: time.slice(0, 5), pax });
                          }
                        } catch (e) { console.warn('Reservation WhatsApp failed', e); }
                        hubScreen('Reservations');
                      } catch (e) {
                        console.warn(e);
                        RS.toast('Could not save reservation — check connection', 'fa-circle-exclamation');
                      }
                    });
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
                    <div>
                      <label class="form-label" style="display:block;font-size:12px;margin-bottom:4px;color:var(--text-soft)">Details / notes</label>
                      <textarea id="tkt-notes" rows="3" class="form-control" placeholder="What happened? Order #, amount, staff involved…" style="width:100%;padding:8px;border:1px solid var(--stroke);border-radius:6px;background:var(--panel);color:var(--text);resize:vertical"></textarea>
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
                    const confirmBtn = tktModal.querySelector('[data-confirm]');
                    confirmBtn.onclick = () => hubRunAction(confirmBtn, async () => {
                      const customerName = (tktModal.querySelector('#tkt-cust').value || 'Guest').trim() || 'Guest';
                      const subject = (tktModal.querySelector('#tkt-subject').value || '').trim();
                      if (!subject) { RS.toast('Subject is required', 'fa-circle-exclamation'); return; }
                      const priority = tktModal.querySelector('#tkt-priority').value || 'medium';
                      const notes = (tktModal.querySelector('#tkt-notes').value || '').trim();
                      const tktNum = RS.nextLogicalNo ? RS.nextLogicalNo('TKT') : ('TKT-' + Date.now());
                      const tktRow = { ticketNumber: tktNum, subject, customerName, priority, status: 'open', notes };
                      try {
                        await hubSave('support_tickets', tktRow);
                        tktClose();
                        RS.toast('Support ticket opened', 'fa-circle-check');
                        hubScreen('Support Tickets');
                      } catch (e) {
                        console.warn(e);
                        RS.toast('Could not save ticket — check connection', 'fa-circle-exclamation');
                      }
                    });
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
                    const confirmBtn = offModal.querySelector('[data-confirm]');
                    confirmBtn.onclick = () => hubRunAction(confirmBtn, async () => {
                      const code = String(offModal.querySelector('#off-code').value || '')
                        .trim()
                        .toUpperCase()
                        .replace(/\s+/g, '');
                      if (!code) { RS.toast('Coupon code is required', 'fa-circle-exclamation'); return; }
                      const description = (offModal.querySelector('#off-desc').value || '').trim() || code + ' discount';
                      const pct = Math.max(0, Math.min(100, Number(offModal.querySelector('#off-pct').value) || 0));
                      const fixed = Math.max(0, Number(offModal.querySelector('#off-fixed').value) || 0);
                      if (!(pct > 0 || fixed > 0)) {
                        RS.toast('Enter percent off or a fixed amount', 'fa-circle-exclamation');
                        return;
                      }
                      const offRow = {
                        code,
                        description,
                        title: description,
                        pct: fixed > 0 ? 0 : pct,
                        discount_pct: fixed > 0 ? 0 : pct,
                        fixed,
                        amount: fixed,
                        usageCount: 0,
                        status: 'active',
                      };
                      try {
                        const saved = await hubSave('offers', offRow);
                        if (!Array.isArray(RS.OFFERS)) RS.OFFERS = [];
                        const merged = { ...offRow, id: saved && saved.id };
                        const ix = RS.OFFERS.findIndex((o) => String(o.code || '').toUpperCase() === code);
                        if (ix >= 0) RS.OFFERS[ix] = { ...RS.OFFERS[ix], ...merged };
                        else RS.OFFERS.unshift(merged);
                        offClose();
                        RS.toast(
                          'Offer ' + code + ' live on POS · ' + (fixed > 0 ? rs(fixed) + ' off' : pct + '% off'),
                          'fa-circle-check'
                        );
                        hubScreen('Offers & Coupons');
                      } catch (e) {
                        console.warn(e);
                        RS.toast('Could not save offer — check connection', 'fa-circle-exclamation');
                      }
                    });
                  },
                });
              } else if (name === 'WhatsApp Campaigns') {
                const promoOn =
                  typeof window.RS_featureOn === 'function'
                    ? window.RS_featureOn('set_promotional_messages', window.RS_SETTINGS, false)
                    : window.RS_SETTINGS?.set_promotional_messages === true ||
                      window.RS_SETTINGS?.set_promotional_messages === 'true';
                if (!promoOn) {
                  RS.toast('Promotional messages are off — enable in Settings → WhatsApp', 'fa-ban');
                  return;
                }
                const crm = (Array.isArray(RS.CUSTOMERS) && RS.CUSTOMERS.length)
                  ? RS.CUSTOMERS
                  : [];
                const formBody = `
                  <div style="display:flex;flex-direction:column;gap:12px">
                    <div>
                      <label class="form-label" style="display:block;font-size:12px;margin-bottom:4px;color:var(--text-soft)">Audience</label>
                      <select id="wa-audience" class="form-control" style="width:100%;padding:8px;border:1px solid var(--stroke);border-radius:6px;background:var(--panel);color:var(--text)">
                        <option value="all">All customers with phone</option>
                        <option value="vip">VIP tier</option>
                        <option value="gold">Gold tier</option>
                        <option value="silver">Silver tier</option>
                      </select>
                    </div>
                    <div>
                      <label class="form-label" style="display:block;font-size:12px;margin-bottom:4px;color:var(--text-soft)">Message</label>
                      <textarea id="wa-message" rows="4" class="form-control" placeholder="e.g. This weekend only: 15% off all mains. Show this message at the counter!" style="width:100%;padding:8px;border:1px solid var(--stroke);border-radius:6px;background:var(--panel);color:var(--text);resize:vertical"></textarea>
                    </div>
                    <p id="wa-count" style="font-size:12px;color:var(--text-soft);margin:0">Loading customers…</p>
                  </div>`;
                RSModal.open({
                  title: 'New WhatsApp campaign',
                  sub: 'Broadcast to your CRM list',
                  icon: 'fa-bullhorn',
                  size: 'sm',
                  body: formBody,
                  foot: `<button class="btn btn-ghost" data-cancel>Cancel</button><button class="btn btn-primary" data-confirm><i class="fa-brands fa-whatsapp"></i> Review &amp; send</button>`,
                  onMount(waModal, waClose) {
                    let list = crm.slice();
                    const load = async () => {
                      if (window.RS_DB) {
                        try {
                          const rows = await RS_DB.list('customers');
                          if (rows && rows.length) list = rows;
                        } catch (e) {}
                      }
                      refreshCount();
                    };
                    const matching = () => {
                      const aud = waModal.querySelector('#wa-audience').value;
                      return list.filter((c) => {
                        if (!c.phone) return false;
                        const t = String(c.tier || 'silver').toLowerCase();
                        if (aud === 'all') return true;
                        return t === aud;
                      });
                    };
                    const refreshCount = () => {
                      const el = waModal.querySelector('#wa-count');
                      if (el) el.textContent = matching().length + ' customer(s) match this audience.';
                    };
                    waModal.querySelector('#wa-audience').onchange = refreshCount;
                    waModal.querySelector('[data-cancel]').onclick = waClose;
                    waModal.querySelector('[data-confirm]').onclick = async () => {
                      const message = (waModal.querySelector('#wa-message').value || '').trim();
                      if (!message) return RS.toast('Enter a message', 'fa-circle-exclamation');
                      const recipients = matching();
                      if (!recipients.length) return RS.toast('No customers match — add phones in CRM first', 'fa-circle-exclamation');
                      const audience = waModal.querySelector('#wa-audience').value;
                      waClose();
                      const campaignRow = {
                        id: 'bcast_' + Date.now(),
                        message,
                        audience,
                        recipientCount: recipients.length,
                        createdAt: new Date().toISOString(),
                      };
                      try {
                        if (window.RS_DB) await RS_DB.put('broadcasts', campaignRow.id, campaignRow);
                      } catch (e) {}
                      const prev = hubLocalList('broadcasts');
                      prev.unshift(campaignRow);
                      hubLocalSave('broadcasts', prev.slice(0, 100));
                      RSModal.open({
                        title: 'Send to ' + recipients.length + ' customer(s)',
                        sub: 'Tap Send to open WhatsApp for each guest',
                        icon: 'fa-bullhorn',
                        size: 'sm',
                        body: `<div style="display:flex;flex-direction:column;gap:8px;max-height:340px;overflow:auto">${recipients.map((c, i) => `
                          <div style="display:flex;align-items:center;justify-content:space-between;padding:8px 10px;border:1px solid var(--stroke);border-radius:10px;gap:8px">
                            <div style="min-width:0"><b>${esc(c.name || 'Guest')}</b><div style="font-size:11px;color:var(--text-mute)">${esc(c.phone)}</div></div>
                            <button type="button" class="btn btn-ghost btn-sm" data-send-i="${i}"><i class="fa-brands fa-whatsapp"></i> Send</button>
                          </div>`).join('')}</div>`,
                        foot: `<button class="btn btn-primary" style="flex:1" data-done>Done</button>`,
                        onMount(sendModal, closeSend) {
                          sendModal.querySelector('[data-done]').onclick = () => {
                            closeSend();
                            hubScreen('WhatsApp Campaigns');
                          };
                          sendModal.querySelectorAll('[data-send-i]').forEach((btn) => {
                            btn.onclick = () => {
                              const cst = recipients[+btn.dataset.sendI];
                              const digits = String(cst.phone || '').replace(/\D/g, '');
                              const waPhone = digits.length === 10 ? '91' + digits : digits;
                              window.open(`https://wa.me/${waPhone}?text=${encodeURIComponent(message)}`, '_blank', 'noopener,noreferrer');
                              btn.innerHTML = '<i class="fa-solid fa-check"></i> Opened';
                              btn.disabled = true;
                            };
                          });
                        },
                      });
                      RS.toast('Campaign saved · send from the list', 'fa-bullhorn');
                    };
                    load();
                  },
                });
              } else if (name === 'Learning Center') {
                const formBody = `
                  <div style="display:flex;flex-direction:column;gap:12px">
                    <div>
                      <label class="form-label" style="display:block;font-size:12px;margin-bottom:4px;color:var(--text-soft)">Title</label>
                      <input type="text" id="ln-title" class="form-control" placeholder="e.g. POS training week 1" style="width:100%;padding:8px;border:1px solid var(--stroke);border-radius:6px;background:var(--panel);color:var(--text)">
                    </div>
                    <div class="form-grid-2" style="display:grid;grid-template-columns:1fr 1fr;gap:12px">
                      <div>
                        <label class="form-label" style="display:block;font-size:12px;margin-bottom:4px;color:var(--text-soft)">Type</label>
                        <select id="ln-type" class="form-control" style="width:100%;padding:8px;border:1px solid var(--stroke);border-radius:6px;background:var(--panel);color:var(--text)">
                          <option value="pdf">PDF guide</option>
                          <option value="video">Video (YouTube / Drive link)</option>
                          <option value="link">Web link</option>
                          <option value="doc">Document / other</option>
                        </select>
                      </div>
                      <div>
                        <label class="form-label" style="display:block;font-size:12px;margin-bottom:4px;color:var(--text-soft)">Category</label>
                        <select id="ln-cat" class="form-control" style="width:100%;padding:8px;border:1px solid var(--stroke);border-radius:6px;background:var(--panel);color:var(--text)">
                          <option value="Getting started">Getting started</option>
                          <option value="POS">POS</option>
                          <option value="Kitchen">Kitchen</option>
                          <option value="Product">Product</option>
                          <option value="Videos">Videos</option>
                          <option value="Internal">Internal / outlet</option>
                        </select>
                      </div>
                    </div>
                    <div>
                      <label class="form-label" style="display:block;font-size:12px;margin-bottom:4px;color:var(--text-soft)">URL (PDF, video, or page)</label>
                      <input type="url" id="ln-url" class="form-control" placeholder="https://… or /downloads/your-guide.pdf" style="width:100%;padding:8px;border:1px solid var(--stroke);border-radius:6px;background:var(--panel);color:var(--text)">
                    </div>
                    <div>
                      <label class="form-label" style="display:block;font-size:12px;margin-bottom:4px;color:var(--text-soft)">Or upload a small PDF (optional, max ~2 MB)</label>
                      <input type="file" id="ln-file" accept=".pdf,application/pdf" style="width:100%;font-size:12px">
                    </div>
                    <div>
                      <label class="form-label" style="display:block;font-size:12px;margin-bottom:4px;color:var(--text-soft)">Description</label>
                      <textarea id="ln-desc" rows="2" class="form-control" placeholder="What should staff learn from this?" style="width:100%;padding:8px;border:1px solid var(--stroke);border-radius:6px;background:var(--panel);color:var(--text);resize:vertical"></textarea>
                    </div>
                  </div>`;
                RSModal.open({
                  title: 'Add learning material',
                  sub: 'PDF, video link, or training doc',
                  icon: 'fa-graduation-cap',
                  size: 'sm',
                  body: formBody,
                  foot: `<button class="btn btn-ghost" data-cancel>Cancel</button><button class="btn btn-primary" data-confirm><i class="fa-solid fa-plus"></i> Save</button>`,
                  onMount(lnModal, lnClose) {
                    lnModal.querySelector('[data-cancel]').onclick = lnClose;
                    lnModal.querySelector('[data-confirm]').onclick = async () => {
                      const title = (lnModal.querySelector('#ln-title').value || '').trim();
                      if (!title) {
                        RS.toast('Enter a title', 'fa-circle-exclamation');
                        return;
                      }
                      let url = (lnModal.querySelector('#ln-url').value || '').trim();
                      const type = lnModal.querySelector('#ln-type').value || 'link';
                      const category = lnModal.querySelector('#ln-cat').value || 'General';
                      const description = (lnModal.querySelector('#ln-desc').value || '').trim();
                      const fileInput = lnModal.querySelector('#ln-file');
                      const file = fileInput && fileInput.files && fileInput.files[0];
                      if (file) {
                        if (file.size > 2.2 * 1024 * 1024) {
                          RS.toast('PDF too large (max ~2 MB). Host online and paste URL instead.', 'fa-circle-exclamation');
                          return;
                        }
                        try {
                          url = await new Promise((resolve, reject) => {
                            const reader = new FileReader();
                            reader.onload = () => resolve(String(reader.result || ''));
                            reader.onerror = reject;
                            reader.readAsDataURL(file);
                          });
                        } catch (e) {
                          RS.toast('Could not read file', 'fa-circle-exclamation');
                          return;
                        }
                      }
                      if (!url) {
                        RS.toast('Add a URL or upload a PDF', 'fa-circle-exclamation');
                        return;
                      }
                      const row = {
                        id: 'learn_' + Date.now(),
                        title,
                        type: file ? 'pdf' : type,
                        category,
                        description,
                        url,
                        builtin: false,
                        createdAt: new Date().toISOString(),
                      };
                      const prev = hubLocalList('learning');
                      prev.unshift(row);
                      hubLocalSave('learning', prev.slice(0, 100));
                      lnClose();
                      RS.toast('Learning material saved', 'fa-graduation-cap');
                      hubScreen('Learning Center');
                    };
                  },
                });
              } else if (name === 'Feedback & Reviews') {
                const formBody = `
                  <div style="display:flex;flex-direction:column;gap:12px">
                    <div class="form-grid-2" style="display:grid;grid-template-columns:1fr 1fr;gap:12px">
                      <div>
                        <label class="form-label" style="display:block;font-size:12px;margin-bottom:4px;color:var(--text-soft)">Guest name</label>
                        <input type="text" id="rv-name" class="form-control" placeholder="e.g. Priya" style="width:100%;padding:8px;border:1px solid var(--stroke);border-radius:6px;background:var(--panel);color:var(--text)">
                      </div>
                      <div>
                        <label class="form-label" style="display:block;font-size:12px;margin-bottom:4px;color:var(--text-soft)">Rating</label>
                        <select id="rv-rating" class="form-control" style="width:100%;padding:8px;border:1px solid var(--stroke);border-radius:6px;background:var(--panel);color:var(--text)">
                          <option value="5">5 ★ Excellent</option>
                          <option value="4" selected>4 ★ Good</option>
                          <option value="3">3 ★ OK</option>
                          <option value="2">2 ★ Poor</option>
                          <option value="1">1 ★ Bad</option>
                        </select>
                      </div>
                    </div>
                    <div>
                      <label class="form-label" style="display:block;font-size:12px;margin-bottom:4px;color:var(--text-soft)">Source</label>
                      <select id="rv-source" class="form-control" style="width:100%;padding:8px;border:1px solid var(--stroke);border-radius:6px;background:var(--panel);color:var(--text)">
                        <option value="in-house">In-house / verbal</option>
                        <option value="google">Google</option>
                        <option value="zomato">Zomato</option>
                        <option value="swiggy">Swiggy</option>
                        <option value="other">Other</option>
                      </select>
                    </div>
                    <div>
                      <label class="form-label" style="display:block;font-size:12px;margin-bottom:4px;color:var(--text-soft)">Comment</label>
                      <textarea id="rv-comment" rows="3" class="form-control" placeholder="What did they say?" style="width:100%;padding:8px;border:1px solid var(--stroke);border-radius:6px;background:var(--panel);color:var(--text);resize:vertical"></textarea>
                    </div>
                  </div>`;
                RSModal.open({
                  title: 'Log review',
                  sub: 'Record guest feedback',
                  icon: 'fa-star',
                  size: 'sm',
                  body: formBody,
                  foot: `<button class="btn btn-ghost" data-cancel>Cancel</button><button class="btn btn-primary" data-confirm><i class="fa-solid fa-plus"></i> Save review</button>`,
                  onMount(rvModal, rvClose) {
                    rvModal.querySelector('[data-cancel]').onclick = rvClose;
                    rvModal.querySelector('[data-confirm]').onclick = async () => {
                      const guestName = (rvModal.querySelector('#rv-name').value || '').trim() || 'Guest';
                      const rating = Number(rvModal.querySelector('#rv-rating').value) || 4;
                      const source = rvModal.querySelector('#rv-source').value || 'staff';
                      const comment = (rvModal.querySelector('#rv-comment').value || '').trim();
                      const row = {
                        id: crypto.randomUUID ? crypto.randomUUID() : 'rev_' + Date.now(),
                        guestName,
                        rating,
                        source,
                        comment,
                        createdAt: new Date().toISOString(),
                      };
                      rvClose();
                      try {
                        const saved = await hubSave('reviews', row);
                        if (saved && saved.id) row.id = saved.id;
                      } catch (e) {
                        console.warn('review cloud save', e);
                      }
                      const prev = hubLocalList('reviews');
                      prev.unshift(row);
                      hubLocalSave('reviews', prev.slice(0, 200));
                      RS.toast('Review saved · ' + rating + '★', 'fa-star');
                      hubScreen('Feedback & Reviews');
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
