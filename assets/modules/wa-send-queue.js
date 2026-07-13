/* ============================================================
   RestroSuite — WhatsApp failed-send queue
   Local queue; auto-retry when gateway status is ready.
   Does NOT store PDF base64 (quota) — recompiles from bill snapshot.
   ============================================================ */
(function (global) {
  'use strict';

  const STORAGE_KEY = 'rs:wa_send_queue';
  const MAX_ITEMS = 40;
  const MAX_ATTEMPTS = 8;
  const RETRY_COOLDOWN_MS = 8000;

  let processing = false;
  let lastProcessAt = 0;

  function toast(msg, icon) {
    if (global.RS && typeof RS.toast === 'function') RS.toast(msg, icon);
  }

  function tenantKey() {
    try {
      const s = (global.RS_API && RS_API.session && RS_API.session()) || {};
      return String(s.tenant_id || s.tenant_slug || sessionStorage.getItem('tenant_id') || sessionStorage.getItem('tenant_slug') || 'local');
    } catch (_) {
      return 'local';
    }
  }

  function readAll() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return [];
      const arr = JSON.parse(raw);
      return Array.isArray(arr) ? arr : [];
    } catch (_) {
      return [];
    }
  }

  function writeAll(list) {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify((list || []).slice(-MAX_ITEMS)));
    } catch (e) {
      console.warn('[WaQueue] write failed', e);
    }
    paintBadge();
    try {
      document.dispatchEvent(new CustomEvent('rs:wa-queue-changed', { detail: { count: count() } }));
    } catch (_) {}
  }

  function list() {
    const tk = tenantKey();
    return readAll().filter((x) => !x.tenantKey || x.tenantKey === tk);
  }

  function count() {
    return list().length;
  }

  function slimBill(bill) {
    if (!bill || typeof bill !== 'object') return null;
    // Keep fields needed to re-render PDF/text — skip huge blobs
    const items = Array.isArray(bill.items)
      ? bill.items
      : Array.isArray(bill._items)
        ? bill._items
        : [];
    return {
      no: bill.no || bill.orderId || bill.id,
      orderId: bill.orderId || bill.no,
      id: bill.id,
      time: bill.time || bill.dateTime,
      dateTime: bill.dateTime || bill.time,
      table: bill.table || bill.tableNumber || '--',
      tableNumber: bill.tableNumber || bill.table,
      customer: bill.customer || bill.customerName || '',
      customerName: bill.customerName || bill.customer || '',
      customerPhone: bill.customerPhone || '',
      items: items.map((i) => ({
        name: i.name || 'Item',
        qty: Number(i.qty) || 1,
        price: Number(i.price) || 0,
        note: i.note || i.notes || '',
      })),
      _items: items.map((i) => ({
        name: i.name || 'Item',
        qty: Number(i.qty) || 1,
        price: Number(i.price) || 0,
      })),
      sub: bill.sub != null ? bill.sub : bill.subtotal,
      subtotal: bill.subtotal != null ? bill.subtotal : bill.sub,
      gst: bill.gst,
      disc: bill.disc || bill.discount || 0,
      discount: bill.discount || bill.disc || 0,
      grand: bill.grand != null ? bill.grand : bill.amount != null ? bill.amount : bill.total,
      amount: bill.amount != null ? bill.amount : bill.grand != null ? bill.grand : bill.total,
      total: bill.total != null ? bill.total : bill.amount,
      tenders: Array.isArray(bill.tenders) ? bill.tenders : undefined,
      pay: bill.pay || bill.paymentMethod,
      paymentMethod: bill.paymentMethod || bill.pay,
    };
  }

  /**
   * Enqueue a failed WhatsApp bill send.
   * @returns {{ ok:boolean, id?:string, reason?:string, count?:number }}
   */
  function enqueue(entry) {
    if (!entry || !entry.phone) return { ok: false, reason: 'missing phone' };
    const phone = String(entry.phone).replace(/\D/g, '');
    if (phone.length < 10) return { ok: false, reason: 'bad phone' };

    const billSnap = slimBill(entry.bill);
    const orderId = String(
      (billSnap && (billSnap.no || billSnap.orderId)) || entry.orderId || ''
    );
    const all = readAll();
    // Dedupe same bill+phone pending
    const exists = all.findIndex(
      (x) =>
        x.phone === phone &&
        String(x.orderId || '') === orderId &&
        (!x.tenantKey || x.tenantKey === tenantKey())
    );
    const row = {
      id: exists >= 0 ? all[exists].id : 'waq-' + Date.now() + '-' + Math.random().toString(36).slice(2, 7),
      tenantKey: tenantKey(),
      phone,
      orderId,
      bill: billSnap,
      message: entry.message || entry.text || '',
      caption: entry.caption || '',
      attempts: exists >= 0 ? all[exists].attempts || 0 : 0,
      lastError: entry.lastError || entry.error || '',
      createdAt: exists >= 0 ? all[exists].createdAt : new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    if (exists >= 0) all[exists] = row;
    else all.push(row);
    writeAll(all);
    return { ok: true, id: row.id, count: count() };
  }

  function remove(id) {
    writeAll(readAll().filter((x) => x.id !== id));
  }

  function clear() {
    const tk = tenantKey();
    writeAll(readAll().filter((x) => x.tenantKey && x.tenantKey !== tk));
  }

  function gatewayReady() {
    return (
      global.__rsGatewayReady === true ||
      global.__rsGatewayLastStatus === 'ready' ||
      global.__rsGatewayLastStatus === 'authenticated'
    );
  }

  async function sendOne(item) {
    if (!global.RS_API || typeof RS_API.data !== 'function' || RS_API.zeroCostLaunchMode) {
      throw new Error('Gateway API unavailable');
    }
    if (!gatewayReady()) throw new Error('WhatsApp not ready');

    const bill = item.bill || {};
    const phone = item.phone;
    const orderId = String(item.orderId || bill.no || '');

    // Prefer engine send (PDF → text)
    if (global.RSReceiptEngine && typeof RSReceiptEngine.sendWhatsApp === 'function') {
      const result = await RSReceiptEngine.sendWhatsApp(bill, phone, {
        timeoutMs: 28000,
        skipStatusRefresh: true,
      });
      if (result && (result.mode === 'pdf' || result.mode === 'text')) {
        return result;
      }
      throw new Error((result && result.warning) || 'Send fell back to wa.me');
    }

    // Text-only fallback
    const text =
      item.message ||
      (global.RSReceiptEngine && RSReceiptEngine.toText
        ? RSReceiptEngine.toText(bill)
        : 'Bill ' + orderId);
    await RS_API.data({
      operation: 'gateway_send',
      phone,
      message: text,
      orderId,
    });
    return { mode: 'text', phone };
  }

  async function processQueue(opts) {
    const options = opts || {};
    if (processing) return { processed: 0, skipped: true };
    if (!gatewayReady() && !options.force) return { processed: 0, ready: false };
    if (Date.now() - lastProcessAt < RETRY_COOLDOWN_MS && !options.force) {
      return { processed: 0, cooldown: true };
    }

    const pending = list().filter((x) => (x.attempts || 0) < MAX_ATTEMPTS);
    if (!pending.length) {
      paintBadge();
      return { processed: 0, empty: true };
    }

    processing = true;
    lastProcessAt = Date.now();
    let okN = 0;
    let failN = 0;

    try {
      for (const item of pending) {
        if (!gatewayReady() && !options.force) break;
        try {
          await sendOne(item);
          remove(item.id);
          okN++;
        } catch (e) {
          failN++;
          const all = readAll();
          const idx = all.findIndex((x) => x.id === item.id);
          if (idx >= 0) {
            all[idx].attempts = (all[idx].attempts || 0) + 1;
            all[idx].lastError = (e && e.message) || 'send failed';
            all[idx].updatedAt = new Date().toISOString();
            if (all[idx].attempts >= MAX_ATTEMPTS) {
              all[idx].dead = true;
            }
            writeAll(all);
          }
        }
        // Small gap between retries (human / ban hygiene)
        await new Promise((r) => setTimeout(r, 1200));
      }
    } finally {
      processing = false;
      paintBadge();
    }

    if (okN > 0) {
      toast(
        okN === 1
          ? 'Queued WhatsApp bill sent'
          : okN + ' queued WhatsApp bills sent',
        'fa-whatsapp'
      );
    }
    return { processed: okN, failed: failN };
  }

  function paintBadge() {
    const n = count();
    let el = document.getElementById('rs-wa-queue-pill');
    if (n <= 0) {
      if (el) el.style.display = 'none';
      return;
    }
    if (!el) {
      el = document.createElement('button');
      el.type = 'button';
      el.id = 'rs-wa-queue-pill';
      el.className = 'rs-wa-queue-pill';
      el.setAttribute('role', 'status');
      el.style.cssText =
        'position:fixed;right:14px;bottom:14px;z-index:99996;' +
        'background:#128C7E;color:#fff;padding:8px 14px;border-radius:999px;border:none;' +
        'font-size:12.5px;font-weight:700;box-shadow:0 6px 18px rgba(0,0,0,.22);' +
        'display:flex;align-items:center;gap:8px;cursor:pointer;font-family:inherit;max-width:90vw';
      el.innerHTML =
        '<i class="fa-brands fa-whatsapp"></i><span id="rs-wa-queue-pill-text"></span>';
      el.onclick = () => openQueuePanel();
      document.body.appendChild(el);
    }
    const t = document.getElementById('rs-wa-queue-pill-text');
    if (t) {
      t.textContent =
        n + ' bill' + (n === 1 ? '' : 's') + ' waiting for WhatsApp';
    }
    el.style.display = 'flex';
    el.title = 'Click to view queue · auto-sends when WhatsApp is Ready';
  }

  function openQueuePanel() {
    const items = list();
    const body =
      items.length === 0
        ? '<p style="color:var(--text-soft);font-size:13px">No pending WhatsApp bills.</p>'
        : `<div style="display:flex;flex-direction:column;gap:8px;max-height:320px;overflow:auto">
        ${items
          .map(
            (x) => `
          <div style="padding:10px 12px;border:1px solid var(--stroke);border-radius:10px;font-size:12.5px">
            <div style="font-weight:700;color:var(--text)">${esc(x.orderId || 'Bill')} · +${esc(x.phone)}</div>
            <div style="color:var(--text-soft);margin-top:4px">Tries ${x.attempts || 0}/${MAX_ATTEMPTS}${
              x.lastError ? ' · ' + esc(String(x.lastError).slice(0, 60)) : ''
            }${x.dead ? ' · <b style="color:var(--red)">stopped</b>' : ''}</div>
            <button type="button" class="btn btn-ghost btn-sm" data-drop="${esc(x.id)}" style="margin-top:6px">Remove</button>
          </div>`
          )
          .join('')}
      </div>`;

    if (!global.RSModal) {
      toast(count() + ' pending WhatsApp send(s)', 'fa-whatsapp');
      processQueue({ force: false });
      return;
    }
    RSModal.open({
      title: 'WhatsApp send queue',
      sub: 'Auto-retries when status is Ready',
      icon: 'fa-brands fa-whatsapp',
      size: 'sm',
      body,
      foot: `<button type="button" class="btn btn-ghost" id="waq-clear">Clear all</button>
             <button type="button" class="btn btn-primary" id="waq-retry" style="flex:1"><i class="fa-solid fa-rotate"></i> Retry now</button>`,
      onMount(modal, close) {
        modal.querySelectorAll('[data-drop]').forEach((b) => {
          b.onclick = () => {
            remove(b.getAttribute('data-drop'));
            close();
            setTimeout(openQueuePanel, 100);
          };
        });
        const clearBtn = modal.querySelector('#waq-clear');
        if (clearBtn)
          clearBtn.onclick = () => {
            if (confirm('Clear all queued WhatsApp bills for this outlet?')) {
              clear();
              close();
            }
          };
        const retry = modal.querySelector('#waq-retry');
        if (retry)
          retry.onclick = async () => {
            retry.disabled = true;
            retry.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Sending…';
            await processQueue({ force: true });
            close();
            if (count() > 0) setTimeout(openQueuePanel, 120);
          };
      },
    });
  }

  function esc(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  // When status becomes ready, drain queue
  let prevReady = false;
  function onStatusMaybeReady() {
    const ready = gatewayReady();
    if (ready && count() > 0) {
      processQueue({ force: false });
    }
    if (ready && !prevReady && count() > 0) {
      toast('WhatsApp back online — sending queued bills…', 'fa-whatsapp');
    }
    prevReady = ready;
    paintBadge();
  }

  // Hook status updates
  const _origUpdate = () => {};
  function installStatusHook() {
    const wrap = () => {
      if (typeof global.updateTopbarWhatsAppStatus !== 'function') return;
      if (global.updateTopbarWhatsAppStatus.__waQueueHooked) return;
      const orig = global.updateTopbarWhatsAppStatus;
      global.updateTopbarWhatsAppStatus = async function () {
        const r = await orig.apply(this, arguments);
        try {
          onStatusMaybeReady();
        } catch (_) {}
        return r;
      };
      global.updateTopbarWhatsAppStatus.__waQueueHooked = true;
    };
    wrap();
    document.addEventListener('rs:ready', wrap);
    setInterval(wrap, 5000);
    setInterval(() => {
      if (gatewayReady() && count() > 0) processQueue({ force: false });
      else paintBadge();
    }, 20000);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
      paintBadge();
      installStatusHook();
    });
  } else {
    paintBadge();
    installStatusHook();
  }

  const api = {
    enqueue,
    list,
    count,
    remove,
    clear,
    processQueue,
    paintBadge,
    openQueuePanel,
    slimBill,
  };

  global.RSWaSendQueue = api;
})(typeof window !== 'undefined' ? window : globalThis);
