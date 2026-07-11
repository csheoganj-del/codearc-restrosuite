/* ============================================================
   RestroSuite — Competitive Ops Layer (Wave 3)
   Multi-station · keyboard POS · shifts/Z-report · stock warns
   thermal print preference · bills paging · owner strip · dues
   ============================================================ */
(function (global) {
  'use strict';

  const STATION_KEY = 'rs_station_id';
  const SHIFT_KEY = 'rs_open_shift';
  const BILLS_PAGE_SIZE = 50;
  let billsPage = 0;
  let stockWarnCache = {};

  function toast(msg, icon) {
    if (global.RS && RS.toast) RS.toast(msg, icon || 'fa-circle-info');
  }
  function rs(n) {
    return (global.RS && RS.rs) ? RS.rs(n) : ('₹' + (Number(n) || 0));
  }
  function esc(v) {
    return String(v == null ? '' : v).replace(/[&<>"']/g, (ch) =>
      ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]));
  }
  function session() {
    try { return (global.RS_API && RS_API.session && RS_API.session()) || {}; } catch (_) { return {}; }
  }

  /* ---------------- Multi-station identity ---------------- */
  function getStationId() {
    try {
      let id = localStorage.getItem(STATION_KEY);
      if (!id) {
        id = 'ST-' + Math.random().toString(36).slice(2, 8).toUpperCase();
        localStorage.setItem(STATION_KEY, id);
      }
      return id;
    } catch (_) {
      return 'ST-LOCAL';
    }
  }
  function getStationLabel() {
    try {
      return localStorage.getItem('rs_station_label') || getStationId();
    } catch (_) {
      return getStationId();
    }
  }
  function setStationLabel(label) {
    try {
      localStorage.setItem('rs_station_label', String(label || '').slice(0, 32));
      paintStationChip();
    } catch (_) {}
  }

  function paintStationChip() {
    let chip = document.getElementById('rs-station-chip');
    const host = document.querySelector('.topbar-right, .topbar-actions, .topbar');
    if (!host) return;
    if (!chip) {
      chip = document.createElement('button');
      chip.id = 'rs-station-chip';
      chip.type = 'button';
      chip.title = 'This counter / station name (multi-terminal)';
      chip.style.cssText = 'display:inline-flex;align-items:center;gap:6px;border:1px solid var(--stroke);background:var(--glass);border-radius:999px;padding:5px 10px;font-size:11.5px;font-weight:700;cursor:pointer;color:var(--text)';
      host.insertBefore(chip, host.firstChild);
      chip.onclick = () => {
        const next = window.prompt('Station / counter name (e.g. Counter 1, Bar, Takeaway)', getStationLabel());
        if (next != null && next.trim()) setStationLabel(next.trim());
      };
    }
    chip.innerHTML = '<i class="fa-solid fa-desktop"></i> ' + esc(getStationLabel());
  }

  /* ---------------- Channel bill series ---------------- */
  function channelPrefix(channel) {
    const c = String(channel || 'dine_in').toLowerCase();
    if (c.includes('deliver') || c.includes('online') || c.includes('swig') || c.includes('zom')) return 'DL';
    if (c.includes('take') || c.includes('parcel')) return 'TK';
    if (c.includes('agg')) return 'AG';
    return 'DI'; // dine-in
  }

  /** Prefer server no; stamp channel series + station metadata onto bill rows. */
  function decorateBillMeta(billRow, bill) {
    if (!billRow) return billRow;
    billRow.stationId = getStationId();
    billRow.stationLabel = getStationLabel();
    billRow.channelCode = channelPrefix(bill && (bill.channel || bill.orderType));
    try {
      const s = session();
      billRow.cashier = s.display_name || s.username || '';
    } catch (_) {}
    const sh = getOpenShift();
    if (sh) billRow.shiftId = sh.shiftId;
    return billRow;
  }

  /* ---------------- Shift open / close + Z-report ---------------- */
  function getOpenShift() {
    try { return JSON.parse(localStorage.getItem(SHIFT_KEY) || 'null'); } catch (_) { return null; }
  }
  function saveOpenShift(sh) {
    try {
      if (sh) localStorage.setItem(SHIFT_KEY, JSON.stringify(sh));
      else localStorage.removeItem(SHIFT_KEY);
    } catch (_) {}
    paintShiftBar();
  }

  async function openShift(floatAmt) {
    const s = session();
    const shift = {
      shiftId: 'SH-' + Date.now(),
      cashierName: s.display_name || s.username || 'Cashier',
      stationId: getStationId(),
      stationLabel: getStationLabel(),
      openedAt: new Date().toISOString(),
      closedAt: null,
      openingFloat: Number(floatAmt) || 0,
      status: 'OPEN',
    };
    saveOpenShift(shift);
    try {
      if (global.RS_DB && RS_DB.put) await RS_DB.put('shifts', shift.shiftId, shift);
    } catch (e) {
      console.warn('[Shift] cloud open failed', e);
    }
    toast('Shift opened · float ' + rs(shift.openingFloat), 'fa-cash-register');
    return shift;
  }

  function billsForShift(shift) {
    const bills = (global.RS && RS.BILLS) || [];
    if (!shift) return [];
    const openTs = new Date(shift.openedAt).getTime();
    return bills.filter((b) => {
      if (shift.shiftId && b.shiftId === shift.shiftId) return true;
      const t = b.dateTime ? new Date(b.dateTime).getTime() : 0;
      return t >= openTs && (!shift.closedAt || t <= new Date(shift.closedAt).getTime());
    });
  }

  function summarizeShift(shift, actualCash) {
    const rows = billsForShift(shift);
    const paid = rows.filter((b) => String(b.status || 'paid').toLowerCase() !== 'refunded');
    const refunded = rows.filter((b) => String(b.status || '').toLowerCase() === 'refunded');
    const byPay = {};
    let gross = 0;
    paid.forEach((b) => {
      const amt = Number(b.amount != null ? b.amount : b.total) || 0;
      gross += amt;
      const method = (b.pay || b.paymentMethod || 'Cash');
      byPay[method] = (byPay[method] || 0) + amt;
    });
    const cashSales = byPay.Cash || byPay.cash || 0;
    const expectedCash = (Number(shift.openingFloat) || 0) + cashSales;
    const actual = Number(actualCash);
    const variance = Number.isFinite(actual) ? actual - expectedCash : null;
    return {
      bills: paid.length,
      refunds: refunded.length,
      gross,
      byPay,
      cashSales,
      expectedCash,
      actualCash: Number.isFinite(actual) ? actual : null,
      variance,
      openingFloat: Number(shift.openingFloat) || 0,
    };
  }

  function zReportHtml(shift, summary) {
    const payLines = Object.entries(summary.byPay || {})
      .map(([m, v]) => `<div class="rcp-line"><span>${esc(m)}</span><span>${rs(v)}</span></div>`)
      .join('');
    return `<div class="receipt-paper" style="max-width:320px;margin:0 auto;padding:16px;font-family:system-ui,sans-serif">
      <div style="text-align:center;font-weight:800;font-size:18px">Z-REPORT</div>
      <div style="text-align:center;font-size:12px;color:#666;margin:4px 0 12px">${esc(shift.shiftId)} · ${esc(shift.stationLabel || '')}</div>
      <div class="rcp-line" style="display:flex;justify-content:space-between;font-size:12px;padding:3px 0"><span>Cashier</span><span>${esc(shift.cashierName)}</span></div>
      <div class="rcp-line" style="display:flex;justify-content:space-between;font-size:12px;padding:3px 0"><span>Opened</span><span>${esc(new Date(shift.openedAt).toLocaleString())}</span></div>
      <div class="rcp-line" style="display:flex;justify-content:space-between;font-size:12px;padding:3px 0"><span>Closed</span><span>${esc(shift.closedAt ? new Date(shift.closedAt).toLocaleString() : '—')}</span></div>
      <hr style="border:0;border-top:1px dashed #ccc;margin:10px 0">
      <div class="rcp-line" style="display:flex;justify-content:space-between;font-size:12px;padding:3px 0"><span>Bills</span><span>${summary.bills}</span></div>
      <div class="rcp-line" style="display:flex;justify-content:space-between;font-size:12px;padding:3px 0"><span>Refunds</span><span>${summary.refunds}</span></div>
      <div class="rcp-line" style="display:flex;justify-content:space-between;font-weight:800;font-size:15px;padding:6px 0"><span>Gross</span><span>${rs(summary.gross)}</span></div>
      <hr style="border:0;border-top:1px dashed #ccc;margin:10px 0">
      <div style="font-size:11px;font-weight:700;margin-bottom:4px">Payment mix</div>
      ${payLines || '<div style="font-size:12px;color:#666">No sales</div>'}
      <hr style="border:0;border-top:1px dashed #ccc;margin:10px 0">
      <div class="rcp-line" style="display:flex;justify-content:space-between;font-size:12px;padding:3px 0"><span>Opening float</span><span>${rs(summary.openingFloat)}</span></div>
      <div class="rcp-line" style="display:flex;justify-content:space-between;font-size:12px;padding:3px 0"><span>Cash sales</span><span>${rs(summary.cashSales)}</span></div>
      <div class="rcp-line" style="display:flex;justify-content:space-between;font-size:12px;padding:3px 0"><span>Expected cash</span><span>${rs(summary.expectedCash)}</span></div>
      <div class="rcp-line" style="display:flex;justify-content:space-between;font-size:12px;padding:3px 0"><span>Actual cash</span><span>${summary.actualCash != null ? rs(summary.actualCash) : '—'}</span></div>
      <div class="rcp-line" style="display:flex;justify-content:space-between;font-weight:800;font-size:14px;padding:6px 0;color:${summary.variance != null && summary.variance !== 0 ? '#ef4444' : 'inherit'}"><span>Variance</span><span>${summary.variance != null ? rs(summary.variance) : '—'}</span></div>
      <div style="text-align:center;font-size:11px;color:#666;margin-top:14px">Powered by RestroSuite</div>
    </div>`;
  }

  async function closeShift() {
    const shift = getOpenShift();
    if (!shift) return toast('No open shift', 'fa-circle-exclamation');
    if (global.RSPinModal && RSPinModal.isConfigured()) {
      const ok = await RSPinModal.request('Close shift · Z-report');
      if (!ok) return;
    }
    const actualStr = window.prompt('Actual cash in drawer (count)', String(summarizeShift(shift).expectedCash));
    if (actualStr === null) return;
    const actual = Number(actualStr);
    shift.closedAt = new Date().toISOString();
    shift.status = 'CLOSED';
    shift.actualCash = Number.isFinite(actual) ? actual : 0;
    const summary = summarizeShift(shift, shift.actualCash);
    shift.expectedCash = summary.expectedCash;
    shift.variance = summary.variance;
    shift.totalSalesCash = summary.cashSales;
    try {
      if (global.RS_DB && RS_DB.put) await RS_DB.put('shifts', shift.shiftId, shift);
    } catch (e) {
      console.warn('[Shift] close save failed', e);
    }
    saveOpenShift(null);
    const html = zReportHtml(shift, summary);
    if (global.RSPrint) RSPrint(html, 'Z-Report ' + shift.shiftId);
    else if (global.RSModal) {
      RSModal.open({
        title: 'Z-Report',
        sub: shift.shiftId,
        icon: 'fa-file-invoice-dollar',
        body: html,
        foot: '<button class="btn btn-primary" id="zr-ok">Done</button>',
        onMount(m, close) { const b = m.querySelector('#zr-ok'); if (b) b.onclick = close; },
      });
    }
    toast('Shift closed · variance ' + (summary.variance != null ? rs(summary.variance) : 'n/a'), 'fa-lock');
  }

  function paintShiftBar() {
    const pos = document.getElementById('pos-tab') || document.querySelector('#pos-tab, .pos-layout');
    if (!pos) return;
    let bar = document.getElementById('rs-shift-bar');
    const shift = getOpenShift();
    if (!bar) {
      bar = document.createElement('div');
      bar.id = 'rs-shift-bar';
      bar.style.cssText = 'display:flex;align-items:center;gap:10px;flex-wrap:wrap;padding:8px 12px;margin:0 0 10px;border-radius:10px;border:1px solid var(--stroke);background:var(--panel);font-size:12.5px';
      const anchor = pos.querySelector('.pos-layout, .pos-main, .toolbar-row, .pos-grid') || pos.firstChild;
      if (anchor && anchor.parentNode) anchor.parentNode.insertBefore(bar, anchor);
      else pos.insertBefore(bar, pos.firstChild);
    }
    if (shift) {
      const sum = summarizeShift(shift);
      bar.innerHTML = `<span style="font-weight:800"><i class="fa-solid fa-circle" style="color:#22c55e;font-size:9px;margin-right:6px"></i>Shift open</span>
        <span style="color:var(--text-soft)">${esc(shift.cashierName)} · ${esc(getStationLabel())}</span>
        <span style="color:var(--text-soft)">${sum.bills} bills · ${rs(sum.gross)}</span>
        <div style="flex:1"></div>
        <button type="button" class="btn btn-ghost btn-sm" id="rs-shift-z"><i class="fa-solid fa-file-invoice"></i> Preview Z</button>
        <button type="button" class="btn btn-primary btn-sm" id="rs-shift-close"><i class="fa-solid fa-lock"></i> Close shift</button>`;
      const z = bar.querySelector('#rs-shift-z');
      if (z) z.onclick = () => {
        const html = zReportHtml(shift, summarizeShift(shift));
        if (global.RSModal) RSModal.open({ title: 'Z-Report (open shift)', body: html, foot: '<button class="btn btn-primary" id="zok">Close</button>', onMount(m, c) { const b = m.querySelector('#zok'); if (b) b.onclick = c; } });
      };
      const cl = bar.querySelector('#rs-shift-close');
      if (cl) cl.onclick = () => closeShift();
    } else {
      bar.innerHTML = `<span style="font-weight:800;color:var(--text-soft)"><i class="fa-solid fa-circle" style="color:#eab308;font-size:9px;margin-right:6px"></i>No open shift</span>
        <span style="color:var(--text-mute);font-size:12px">Open a shift for cash reconciliation &amp; Z-report</span>
        <div style="flex:1"></div>
        <button type="button" class="btn btn-primary btn-sm" id="rs-shift-open"><i class="fa-solid fa-unlock"></i> Open shift</button>`;
      const op = bar.querySelector('#rs-shift-open');
      if (op) op.onclick = async () => {
        const f = window.prompt('Opening cash float', '0');
        if (f === null) return;
        await openShift(Number(f) || 0);
      };
    }
  }

  /* ---------------- Keyboard-first POS ---------------- */
  function installKeyboard() {
    if (document.documentElement.dataset.rsKeys === '1') return;
    document.documentElement.dataset.rsKeys = '1';
    document.addEventListener('keydown', (e) => {
      const tag = (e.target && e.target.tagName) || '';
      const typing = tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || (e.target && e.target.isContentEditable);
      const posActive = document.getElementById('pos-tab')?.classList.contains('active');
      if (!posActive) return;

      // F2 = focus search, F4 = KOT, F8 = checkout, F9 = clear, / = search
      if (e.key === 'F2' || (e.key === '/' && !typing)) {
        e.preventDefault();
        const search = document.getElementById('pos-search') || document.querySelector('#pos-tab input[type="search"], #pos-tab .pos-search input');
        if (search) { search.focus(); search.select?.(); }
        return;
      }
      if (typing) return;
      if (e.key === 'F4') {
        e.preventDefault();
        document.getElementById('btn-kot')?.click();
      } else if (e.key === 'F8' || (e.key === 'Enter' && e.ctrlKey)) {
        e.preventDefault();
        document.getElementById('btn-checkout')?.click();
      } else if (e.key === 'F9' || (e.key === 'Escape' && e.shiftKey)) {
        e.preventDefault();
        document.getElementById('btn-clear-cart')?.click();
      } else if (e.key === 'F1') {
        e.preventDefault();
        showShortcutsHelp();
      }
    });
  }

  function showShortcutsHelp() {
    const body = `<div style="font-size:13px;line-height:1.7;color:var(--text-soft)">
      <div><b style="color:var(--text)">F1</b> — Shortcuts help</div>
      <div><b style="color:var(--text)">F2</b> or <b>/</b> — Focus menu search</div>
      <div><b style="color:var(--text)">F4</b> — Send KOT</div>
      <div><b style="color:var(--text)">F8</b> / <b>Ctrl+Enter</b> — Checkout</div>
      <div><b style="color:var(--text)">F9</b> — Clear cart</div>
      <div style="margin-top:10px;font-size:12px">Station: <b>${esc(getStationLabel())}</b> · Shift: <b>${getOpenShift() ? 'OPEN' : 'closed'}</b></div>
    </div>`;
    if (global.RSModal) {
      RSModal.open({ title: 'POS keyboard', icon: 'fa-keyboard', size: 'sm', body, foot: '<button class="btn btn-primary" id="kh-ok">Got it</button>',
        onMount(m, c) { m.querySelector('#kh-ok').onclick = c; } });
    } else toast('F2 search · F4 KOT · F8 pay · F9 clear', 'fa-keyboard');
  }

  /* ---------------- Recipe stock warnings at cart ---------------- */
  function estimateCartStockIssues() {
    if (!global.RS || !RS.getCart || !RS.INVENTORY) return [];
    const cart = RS.getCart() || [];
    const menu = RS.MENU || [];
    const inv = RS.INVENTORY || [];
    const issues = [];
    cart.forEach((line) => {
      const m = menu.find((x) => String(x.id) === String(line.id) || x.name === line.name);
      if (!m || !Array.isArray(m.ingredients) || !m.ingredients.length) {
        issues.push({ type: 'no_recipe', name: line.name });
        return;
      }
      m.ingredients.forEach((ing) => {
        const need = (Number(ing.qty) || 0) * (Number(line.qty) || 1);
        const item = inv.find((i) => i.name === ing.name || (i.key && ing.name && i.key === String(ing.name).toLowerCase().replace(/[^a-z0-9]+/g, '_')));
        if (!item) {
          issues.push({ type: 'missing_ing', name: line.name, ing: ing.name });
        } else if ((Number(item.stock) || 0) < need) {
          issues.push({ type: 'low', name: line.name, ing: item.name, have: item.stock, need });
        }
      });
    });
    return issues;
  }

  function paintStockBanner() {
    const cartPanel = document.querySelector('#pos-tab .cart-panel, #pos-tab .pos-cart, #cart-panel') || document.getElementById('pos-tab');
    if (!cartPanel) return;
    let ban = document.getElementById('rs-stock-warn');
    const issues = estimateCartStockIssues().filter((i) => i.type === 'low' || i.type === 'missing_ing');
    if (!issues.length) {
      if (ban) ban.remove();
      return;
    }
    if (!ban) {
      ban = document.createElement('div');
      ban.id = 'rs-stock-warn';
      ban.style.cssText = 'margin:8px 0;padding:8px 10px;border-radius:8px;border:1px solid rgba(234,179,8,.4);background:rgba(234,179,8,.1);font-size:12px;color:var(--text-soft);line-height:1.4';
      const foot = cartPanel.querySelector('.cart-footer, #btn-checkout')?.parentNode;
      if (foot) foot.insertBefore(ban, foot.firstChild);
      else cartPanel.appendChild(ban);
    }
    const low = issues.filter((i) => i.type === 'low').slice(0, 3);
    const miss = issues.filter((i) => i.type === 'missing_ing').slice(0, 2);
    ban.innerHTML = '<i class="fa-solid fa-triangle-exclamation" style="color:#ca8a04;margin-right:6px"></i><b style="color:var(--text)">Stock risk:</b> '
      + low.map((i) => `${esc(i.ing)} short for ${esc(i.name)}`).join('; ')
      + (miss.length ? (low.length ? '; ' : '') + 'missing: ' + miss.map((i) => esc(i.ing)).join(', ') : '');
  }

  /* ---------------- Thermal print preference for WhatsApp ---------------- */
  function preferThermalPdf() {
    const s = global.RS_SETTINGS || {};
    const mode = String(s.set_receipt_pdf_mode || s.set_whatsapp_bill_pdf_mode || s.set_whatsapp_bill_pdf || '').toLowerCase();
    if (s.set_wa_thermal_pdf === true || s.set_wa_thermal_pdf === 'true') return true;
    if (mode.indexOf('thermal') >= 0 || mode.indexOf('fast') >= 0) return true;
    if (s.set_paper_size === '58 mm') return true;
    return false;
  }

  async function compilePreferredPdf(bill) {
    if (preferThermalPdf() && global.RS && typeof RS.compileThermalPDF === 'function') {
      try { return await RS.compileThermalPDF(bill); } catch (e) {
        console.warn('[PDF] thermal failed, preview fallback', e);
      }
    }
    if (global.RS && typeof RS.compilePreviewPDF === 'function') return RS.compilePreviewPDF(bill);
    if (global.RSReceiptEngine && RSReceiptEngine.toPDF) return RSReceiptEngine.toPDF(bill);
    throw new Error('No PDF compiler');
  }

  /* ---------------- Bills pagination UI ---------------- */
  function enhanceBillsPaging() {
    const body = document.getElementById('bills-table-body');
    if (!body || body.dataset.paged === '1') return;
    // Wrap renderBills to page results
    if (!global.RS || !global.__rsOriginalRenderBills) {
      // Hook after render via MutationObserver-ish re-render patch
    }
    let pager = document.getElementById('rs-bills-pager');
    const tableWrap = body.closest('.table-scroll, .panel, #bills-tab');
    if (!tableWrap) return;
    if (!pager) {
      pager = document.createElement('div');
      pager.id = 'rs-bills-pager';
      pager.style.cssText = 'display:flex;align-items:center;gap:10px;padding:10px 0;font-size:12.5px';
      body.parentNode?.parentNode?.appendChild(pager);
    }
    const apply = () => {
      const rows = Array.from(body.querySelectorAll('tr'));
      const total = rows.length;
      const pages = Math.max(1, Math.ceil(total / BILLS_PAGE_SIZE));
      if (billsPage >= pages) billsPage = pages - 1;
      rows.forEach((tr, i) => {
        const show = i >= billsPage * BILLS_PAGE_SIZE && i < (billsPage + 1) * BILLS_PAGE_SIZE;
        tr.style.display = show ? '' : 'none';
      });
      pager.innerHTML = `<span style="color:var(--text-soft)">${total} bills · page ${billsPage + 1}/${pages}</span>
        <div style="flex:1"></div>
        <button type="button" class="btn btn-ghost btn-sm" id="bp-prev" ${billsPage <= 0 ? 'disabled' : ''}>Prev</button>
        <button type="button" class="btn btn-ghost btn-sm" id="bp-next" ${billsPage >= pages - 1 ? 'disabled' : ''}>Next</button>`;
      const prev = pager.querySelector('#bp-prev');
      const next = pager.querySelector('#bp-next');
      if (prev) prev.onclick = () => { billsPage = Math.max(0, billsPage - 1); apply(); };
      if (next) next.onclick = () => { billsPage = Math.min(pages - 1, billsPage + 1); apply(); };
    };
    // Observe re-renders
    const mo = new MutationObserver(() => apply());
    mo.observe(body, { childList: true });
    body.dataset.paged = '1';
    apply();
  }

  /* ---------------- Owner strip on POS ---------------- */
  function paintOwnerStrip() {
    const pos = document.getElementById('pos-tab');
    if (!pos) return;
    let strip = document.getElementById('rs-owner-strip');
    if (!strip) {
      strip = document.createElement('div');
      strip.id = 'rs-owner-strip';
      strip.style.cssText = 'display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:8px;margin:0 0 12px';
      const shiftBar = document.getElementById('rs-shift-bar');
      if (shiftBar && shiftBar.parentNode) shiftBar.parentNode.insertBefore(strip, shiftBar.nextSibling);
      else pos.insertBefore(strip, pos.firstChild);
    }
    const bills = (global.RS && RS.BILLS) || [];
    const start = new Date(); start.setHours(0, 0, 0, 0);
    const today = bills.filter((b) => {
      if (String(b.status || 'paid').toLowerCase() === 'refunded') return false;
      const t = b.dateTime ? new Date(b.dateTime).getTime() : 0;
      return t >= start.getTime();
    });
    const sales = today.reduce((a, b) => a + (Number(b.amount != null ? b.amount : b.total) || 0), 0);
    const aov = today.length ? Math.round(sales / today.length) : 0;
    const pending = (global.__rsSyncBillPending || 0);
    const gw = global.__rsGatewayReady ? 'WA linked' : 'WA ' + (global.__rsGatewayLastStatus || '—');
    strip.innerHTML = [
      ['Today sales', rs(sales), 'fa-indian-rupee-sign'],
      ['Orders', String(today.length), 'fa-receipt'],
      ['AOV', rs(aov), 'fa-chart-line'],
      ['Ops', pending ? pending + ' pending sync' : gw, pending ? 'fa-cloud-arrow-up' : 'fa-signal'],
    ].map(([l, v, ic]) => `<div style="padding:10px 12px;border-radius:10px;border:1px solid var(--stroke);background:var(--panel)">
      <div style="font-size:11px;color:var(--text-mute);font-weight:700"><i class="fa-solid ${ic}" style="margin-right:4px;opacity:.7"></i>${esc(l)}</div>
      <div style="font-size:16px;font-weight:800;margin-top:2px">${esc(v)}</div>
    </div>`).join('');
  }

  /* ---------------- Dues quick strip on customers (soft) ---------------- */
  function enhanceDuesHint() {
    // already strong in features-growth; ensure export helper
    global.RS_exportDuesCsv = function () {
      const customers = (global.RS && RS.CUSTOMERS) || [];
      // try CRM list from DOM data not available — use RS_DB
      if (global.RS_DB) {
        RS_DB.list('customers').then((rows) => {
          const due = (rows || []).filter((c) => Number(c.dues) > 0);
          const lines = ['name,phone,dues,tier'];
          due.forEach((c) => lines.push([c.name, c.phone, c.dues, c.tier].map((x) => `"${String(x || '').replace(/"/g, '""')}"`).join(',')));
          const blob = new Blob([lines.join('\n')], { type: 'text/csv' });
          const a = document.createElement('a');
          a.href = URL.createObjectURL(blob);
          a.download = 'outstanding-dues.csv';
          a.click();
          toast('Dues CSV exported', 'fa-file-csv');
        }).catch(() => toast('Could not export dues', 'fa-circle-exclamation'));
      }
    };
  }

  /* ---------------- Hook checkout bill decoration ---------------- */
  function installCheckoutHooks() {
    // Patch RS.saveOne for bills to stamp station/shift
    if (!global.RS || global.RS.__competitiveSavePatched) return;
    const orig = global.RS.saveOne && global.RS.saveOne.bind(global.RS);
    if (!orig) return;
    global.RS.saveOne = async function (coll, obj) {
      if (coll === 'bills' && obj) decorateBillMeta(obj, obj);
      return orig(coll, obj);
    };
    global.RS.__competitiveSavePatched = true;
  }

  function installPdfPreference() {
    if (!global.RS) return;
    const orig = global.RS.compilePreviewPDF;
    // Prefer thermal when settings say so for WhatsApp path via RS.compilePreferredPDF
    global.RS.compilePreferredPDF = compilePreferredPdf;
    if (global.RSReceipt && !global.RSReceipt.__prefPdf) {
      const share = global.RSReceipt.share;
      // leave share; engine already uses toPDF — override RS.compilePreviewPDF when thermal preferred
      if (orig && preferThermalPdf()) {
        global.RS.compilePreviewPDF = async function (bill) {
          return compilePreferredPdf(bill);
        };
      }
      global.RSReceipt.__prefPdf = true;
    }
  }

  /* ---------------- KOT thermal print helper ---------------- */
  function printKotThermal(items, meta) {
    const m = meta || {};
    const lines = (items || []).map((i) =>
      `<div class="kot-item"><span class="kq">${esc(i.qty)}×</span><span>${esc(i.name)}</span></div>`
    ).join('');
    const html = `<div style="max-width:280px;margin:0 auto">
      <div class="kot-h"><span class="kt">KOT</span><span>${esc(m.token || m.no || '')}</span></div>
      <div style="font-size:12px;margin-bottom:8px">${esc(m.table || '')} · ${esc(m.orderType || '')} · ${esc(getStationLabel())}</div>
      ${lines}
      <div style="margin-top:12px;font-size:11px;color:#666">${new Date().toLocaleString()}</div>
    </div>`;
    if (global.RSPrint) RSPrint(html, 'KOT');
  }

  /* ---------------- Boot ---------------- */
  function refreshOpsUi() {
    paintStationChip();
    paintShiftBar();
    paintOwnerStrip();
    paintStockBanner();
    enhanceBillsPaging();
  }

  function boot() {
    installKeyboard();
    installCheckoutHooks();
    installPdfPreference();
    enhanceDuesHint();
    refreshOpsUi();

    document.addEventListener('rs:hydrated', () => {
      installCheckoutHooks();
      installPdfPreference();
      refreshOpsUi();
    });
    document.addEventListener('rs:bill-paid', () => {
      setTimeout(refreshOpsUi, 200);
    });
    // Cart mutations — re-check stock
    const cartObs = new MutationObserver(() => paintStockBanner());
    const cartRoot = document.getElementById('pos-tab');
    if (cartRoot) cartObs.observe(cartRoot, { childList: true, subtree: true, characterData: true });

    // Re-paint on tab activate
    const _at = global.RS && RS.activateTab;
    if (_at && !RS.__competitiveActivate) {
      RS.activateTab = async function (id) {
        const r = await _at.apply(this, arguments);
        setTimeout(refreshOpsUi, 100);
        return r;
      };
      RS.__competitiveActivate = true;
    }

    global.RSOps = {
      getStationId,
      getStationLabel,
      setStationLabel,
      openShift,
      closeShift,
      getOpenShift,
      summarizeShift,
      zReportHtml,
      printKotThermal,
      compilePreferredPdf,
      decorateBillMeta,
      estimateCartStockIssues,
      refresh: refreshOpsUi,
    };
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', () => setTimeout(boot, 600));
  else setTimeout(boot, 600);
})(typeof window !== 'undefined' ? window : globalThis);
