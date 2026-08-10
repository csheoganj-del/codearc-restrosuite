/* ============================================================
   RestroSuite — Bill identity helpers (Wave 5 code-split)
   Loaded before dashboard.js; dashboard reuses if present.
   ============================================================ */
(function (global) {
  'use strict';

  function pad2(value) {
    return String(value).padStart(2, '0');
  }

  function shortDateKey(date) {
    const d = date || new Date();
    return String(d.getFullYear()).slice(-2) + pad2(d.getMonth() + 1) + pad2(d.getDate());
  }

  function nextBillNo(existingBills) {
    const key = shortDateKey();
    const prefix = 'RS-' + key + '-';
    const maxFromList = (existingBills || []).reduce((highest, bill) => {
      const no = String((bill && (bill.no || bill.orderId || bill.id)) || '');
      if (!no.includes(key)) {return highest;}
      const parts = no.split('-');
      const seq = Number.parseInt(parts[parts.length - 1], 10);
      return Number.isFinite(seq) ? Math.max(highest, seq) : highest;
    }, 0);
    let tenant = 'local';
    try {
      const s = (global.RS_API && RS_API.session && RS_API.session()) || {};
      tenant = s.tenant_id || s.tenant_slug || sessionStorage.getItem('tenant_slug') || 'local';
    } catch (_) {}
    const seqKey = 'rs_bill_seq:' + tenant + ':' + key;
    let stored = 0;
    try { stored = Number(localStorage.getItem(seqKey) || 0) || 0; } catch (_) {}
    const next = Math.max(maxFromList, stored) + 1;
    try { localStorage.setItem(seqKey, String(next)); } catch (_) {}
    return prefix + String(next).padStart(3, '0');
  }

  function channelCode(channel) {
    const c = String(channel || '').toLowerCase();
    if (c.includes('deliver') || c.includes('online') || c.includes('swig') || c.includes('zom')) {return 'DL';}
    if (c.includes('take') || c.includes('parcel')) {return 'TK';}
    if (c.includes('agg')) {return 'AG';}
    return 'DI';
  }

  async function allocateBillNo(existingBills, channel) {
    const day = shortDateKey();
    const chCode = channelCode(channel);
    try {
      if (global.RS_API && typeof RS_API.data === 'function' && !RS_API.zeroCostLaunchMode && navigator.onLine !== false) {
        const res = await Promise.race([
          RS_API.data({ operation: 'next_bill_no', day }),
          // Keep short so Print & Pay never sits on "Settling…" waiting for server sequence
          new Promise((_, rej) => { setTimeout(() => rej(new Error('next_bill_no timeout')), 1500); }),
        ]);
        const no = (res && (res.no || res.order_id || res.data)) || null;
        if (no && typeof no === 'string' && /^RS-\d{6}-\d+$/i.test(no)) {
          try {
            const s = (RS_API.session && RS_API.session()) || {};
            const tenant = s.tenant_id || s.tenant_slug || sessionStorage.getItem('tenant_slug') || 'local';
            const seq = Number.parseInt(String(no).split('-').pop(), 10);
            if (Number.isFinite(seq)) {
              const seqKey = 'rs_bill_seq:' + tenant + ':' + day;
              const stored = Number(localStorage.getItem(seqKey) || 0) || 0;
              if (seq > stored) {localStorage.setItem(seqKey, String(seq));}
            }
          } catch (_) {}
          return no.replace(/^RS-/, 'RS-' + chCode + '-');
        }
      }
    } catch (e) {
      console.warn('[BillIdentity] server allocate failed', e && e.message);
    }
    return String(nextBillNo(existingBills)).replace(/^RS-/, 'RS-' + chCode + '-');
  }

  function newBillIdentity(billNo) {
    const idempotencyKey = (typeof crypto !== 'undefined' && crypto.randomUUID)
      ? crypto.randomUUID()
      : ('idem-' + Date.now() + '-' + Math.random().toString(36).slice(2, 10));
    const id = Date.now() + Math.floor(Math.random() * 1000);
    return { id, idempotencyKey, no: billNo };
  }

  global.RSBillIdentity = {
    pad2,
    shortDateKey,
    nextBillNo,
    allocateBillNo,
    newBillIdentity,
    channelCode,
  };
})(typeof window !== 'undefined' ? window : globalThis);
