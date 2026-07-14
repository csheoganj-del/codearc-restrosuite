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

  /* ---------------- Loyalty (earn / redeem / tiers) ---------------- */
  function loyaltyEnabled() {
    const s = global.RS_SETTINGS || {};
    return s.set_loyalty_program !== false && s.set_loyalty_program !== 'false';
  }
  function loyaltyEarnRate() {
    const n = Number((global.RS_SETTINGS || {}).set_loyalty_earn_rate);
    return Number.isFinite(n) && n > 0 ? n : 100; // 1 pt per N currency of spend
  }
  function loyaltyPointValue() {
    const n = Number((global.RS_SETTINGS || {}).set_loyalty_point_value);
    return Number.isFinite(n) && n > 0 ? n : 1; // 1 pt = N currency when redeeming
  }
  function tierFromSpend(spend) {
    const s = Number(spend) || 0;
    if (s >= 10000) return 'vip';
    if (s >= 5000) return 'gold';
    return 'silver';
  }
  function tierEarnMult(tier) {
    const t = String(tier || 'silver').toLowerCase();
    if (t === 'vip' || t === 'platinum') return 3;
    if (t === 'gold') return 2;
    return 1;
  }
  function calcEarnPoints(spendAmount, tier) {
    if (!loyaltyEnabled()) return 0;
    const base = Math.floor(Math.max(0, Number(spendAmount) || 0) / loyaltyEarnRate());
    return base * tierEarnMult(tier);
  }
  function pointsToCurrency(pts) {
    return Math.round((Math.max(0, Number(pts) || 0) * loyaltyPointValue()) * 100) / 100;
  }
  function currencyToPoints(amount) {
    const v = loyaltyPointValue();
    if (v <= 0) return 0;
    return Math.ceil(Math.max(0, Number(amount) || 0) / v);
  }
  function customerPoints(c) {
    if (!c) return 0;
    if (c.points != null && Number.isFinite(Number(c.points))) return Math.max(0, Math.floor(Number(c.points)));
    // Backfill from lifetime spend for older CRM rows
    return Math.max(0, Math.floor((Number(c.spend) || 0) / loyaltyEarnRate()));
  }
  function applyLoyaltyEarnToCustomer(matched, bill, dueAmount) {
    const earnBase = Math.max(
      0,
      (Number(bill.grand) || 0) - (Number(bill.tipAmount) || 0) + (Number(bill.loyaltyRedeemAmount) || 0)
    );
    // spend still tracks full bill; points earn on food+tax after redeem already applied to grand
    matched.visits = (matched.visits || 0) + 1;
    matched.spend = (matched.spend || 0) + (Number(bill.grand) || 0);
    matched.last = new Date().toLocaleDateString('en-CA');
    if (dueAmount > 0) matched.dues = (matched.dues || 0) + dueAmount;
    const ptsUsed = Math.max(0, Number(bill.loyaltyPointsUsed) || 0);
    let pts = customerPoints(matched);
    if (ptsUsed > 0) pts = Math.max(0, pts - ptsUsed);
    matched.tier = tierFromSpend(matched.spend);
    const earned = calcEarnPoints(earnBase, matched.tier);
    matched.points = pts + earned;
    matched.pointsEarnedLast = earned;
    matched.pointsRedeemedLast = ptsUsed;
    return { earned, ptsUsed, balance: matched.points, tier: matched.tier };
  }
  function paintLoyaltyBanner(customer) {
    let ban = document.getElementById('cart-loyalty-banner');
    if (!loyaltyEnabled()) {
      if (ban) ban.style.display = 'none';
      return;
    }
    // Prefer after dues banner / under customer chip (not inside expanding form overlay)
    const dues = document.getElementById('cart-customer-dues-banner');
    const host =
      dues?.parentElement ||
      document.getElementById('custom-customer-widget') ||
      document.querySelector('.pos-cart');
    if (!host) return;
    if (!ban) {
      ban = document.createElement('div');
      ban.id = 'cart-loyalty-banner';
      ban.style.cssText =
        'display:none;font-size:11px;padding:5px 8px;border-radius:8px;border:1px solid rgba(139,92,246,.3);background:rgba(139,92,246,.08);color:var(--text-soft);line-height:1.3;margin-top:4px';
      if (dues && dues.parentElement === host) dues.insertAdjacentElement('afterend', ban);
      else host.appendChild(ban);
    }
    if (!customer) {
      ban.style.display = 'none';
      ban.innerHTML = '';
      return;
    }
    const pts = customerPoints(customer);
    const redeem = (global.RS && RS.getLoyaltyRedeem && RS.getLoyaltyRedeem()) || { amount: 0, points: 0 };
    const applied =
      redeem.amount > 0
        ? ` · applied −${rs(redeem.amount)} (${redeem.points} pts)`
        : '';
    ban.style.display = 'block';
    ban.innerHTML = `<div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap">
      <span><i class="fa-solid fa-star" style="color:#a78bfa"></i> <b style="color:var(--text)">${pts}</b> pts · ${esc(String(customer.tier || 'silver').toUpperCase())}${applied}</span>
      <button type="button" class="btn btn-ghost btn-sm" id="btn-loyalty-redeem" style="margin-left:auto;height:28px;font-size:11px;padding:0 10px" ${pts < 1 ? 'disabled' : ''}><i class="fa-solid fa-gift"></i> Redeem</button>
      ${redeem.amount > 0 ? '<button type="button" class="btn btn-ghost btn-sm" id="btn-loyalty-clear" style="height:28px;font-size:11px;padding:0 8px">Clear</button>' : ''}
    </div>`;
    const btn = ban.querySelector('#btn-loyalty-redeem');
    if (btn && !btn.disabled) {
      btn.onclick = () => openRedeemModal(customer);
    }
    const clr = ban.querySelector('#btn-loyalty-clear');
    if (clr) {
      clr.onclick = () => {
        if (global.RS && RS.setLoyaltyRedeem) RS.setLoyaltyRedeem(0, 0);
        paintLoyaltyBanner(customer);
        toast('Loyalty redeem cleared', 'fa-gift');
      };
    }
  }
  function openRedeemModal(customer) {
    if (!global.RSModal) {
      toast('Modal unavailable', 'fa-circle-exclamation');
      return;
    }
    const pts = customerPoints(customer);
    const maxCurrency = pointsToCurrency(pts);
    const totals = global.RS && RS.getTotals ? RS.getTotals() : { grand: 0 };
    // Cap redeem so cart still has a non-negative payable (leave tip alone)
    const cap = Math.max(0, (Number(totals.grand) || 0) + ((global.RS && RS.getLoyaltyRedeem && RS.getLoyaltyRedeem().amount) || 0));
    const maxApply = Math.min(maxCurrency, cap);
    RSModal.open({
      title: 'Redeem loyalty points',
      sub: `${customer.name || 'Guest'} · ${pts} pts available (≈ ${rs(maxCurrency)})`,
      icon: 'fa-gift',
      size: 'sm',
      body: `<p style="font-size:13px;color:var(--text-soft);margin:0 0 12px">1 pt = ${rs(loyaltyPointValue())}. Earn 1 pt per ${rs(loyaltyEarnRate())} spent (×2 Gold, ×3 VIP).</p>
        <label class="fl">Points to redeem</label>
        <input type="number" class="form-input" id="loyal-pts" min="0" max="${pts}" value="${Math.min(pts, currencyToPoints(maxApply))}" style="margin-bottom:8px">
        <div style="font-size:12.5px;color:var(--text-soft)">Value: <b id="loyal-val">${rs(Math.min(maxApply, pointsToCurrency(Math.min(pts, currencyToPoints(maxApply)))))}</b> · max ${rs(maxApply)}</div>
        <div style="display:flex;gap:6px;margin-top:10px;flex-wrap:wrap">
          <button type="button" class="btn btn-ghost btn-sm" data-loyal-max>Max</button>
          <button type="button" class="btn btn-ghost btn-sm" data-loyal-half>Half</button>
        </div>`,
      foot: `<button class="btn btn-ghost" style="flex:1" data-x>Cancel</button><button class="btn btn-primary" style="flex:1" data-ok><i class="fa-solid fa-check"></i> Apply</button>`,
      onMount(m, close) {
        const inp = m.querySelector('#loyal-pts');
        const valEl = m.querySelector('#loyal-val');
        const sync = () => {
          let p = Math.max(0, Math.min(pts, Math.floor(Number(inp.value) || 0)));
          let cur = pointsToCurrency(p);
          if (cur > maxApply) {
            cur = maxApply;
            p = currencyToPoints(cur);
            if (pointsToCurrency(p) > maxApply) p = Math.max(0, p - 1);
            inp.value = p;
            cur = pointsToCurrency(p);
          }
          if (valEl) valEl.textContent = rs(cur);
          return { p, cur };
        };
        inp.addEventListener('input', sync);
        m.querySelector('[data-loyal-max]').onclick = () => {
          inp.value = currencyToPoints(maxApply);
          if (pointsToCurrency(Number(inp.value)) > maxApply) inp.value = Math.max(0, Number(inp.value) - 1);
          // walk down until under cap
          while (pointsToCurrency(Number(inp.value) || 0) > maxApply && Number(inp.value) > 0) {
            inp.value = Number(inp.value) - 1;
          }
          sync();
        };
        m.querySelector('[data-loyal-half]').onclick = () => {
          inp.value = Math.floor(pts / 2);
          sync();
        };
        m.querySelector('[data-x]').onclick = close;
        m.querySelector('[data-ok]').onclick = async () => {
          const { p, cur } = sync();
          if (p < 1 || cur <= 0) {
            toast('Enter points to redeem', 'fa-circle-exclamation');
            return;
          }
          // PIN for large redemptions (default threshold 100 pts)
          const thr = Number((global.RS_SETTINGS || {}).set_pin_loyalty_threshold) || 100;
          if (p >= thr && global.RSPinModal && typeof RSPinModal.require === 'function') {
            const ok = await RSPinModal.require('Redeem ' + p + ' loyalty points', {
              settingKey: 'set_pin_gate_loyalty',
            });
            if (!ok) {
              toast('Redeem cancelled — PIN required', 'fa-lock');
              return;
            }
          }
          if (global.RS && RS.setLoyaltyRedeem) RS.setLoyaltyRedeem(cur, p);
          close();
          paintLoyaltyBanner(customer);
          toast(`Redeemed ${p} pts (−${rs(cur)})`, 'fa-gift');
        };
        sync();
      },
    });
  }
  global.RSLoyalty = {
    enabled: loyaltyEnabled,
    earnRate: loyaltyEarnRate,
    pointValue: loyaltyPointValue,
    tierFromSpend,
    calcEarnPoints,
    pointsToCurrency,
    currencyToPoints,
    customerPoints,
    applyLoyaltyEarnToCustomer,
    paintBanner: paintLoyaltyBanner,
  };

  /* ---------------- POS promo / coupon codes ---------------- */
  function promoEnabled() {
    const s = global.RS_SETTINGS || {};
    return s.set_pos_promo_codes !== false && s.set_pos_promo_codes !== 'false';
  }
  function parseOfferExpiry(o) {
    if (!o) return null;
    if (o.expiresAt) {
      const t = Date.parse(o.expiresAt);
      if (!Number.isNaN(t)) return t;
      // en-IN style or "14 days" stored as display string — treat missing parse as open
      return null;
    }
    if (o.expires_at) {
      const t = Date.parse(o.expires_at);
      return Number.isNaN(t) ? null : t;
    }
    return null;
  }
  function offerIsActive(o) {
    if (!o) return false;
    const st = String(o.status || 'sent').toLowerCase();
    if (st === 'redeemed' || st === 'expired' || st === 'cancelled' || st === 'canceled') return false;
    const exp = parseOfferExpiry(o);
    if (exp && exp < Date.now()) return false;
    return true;
  }
  async function findOfferByCode(code) {
    const c = String(code || '')
      .trim()
      .toUpperCase();
    if (!c) return null;
    let rows = [];
    try {
      if (global.RS_DB && RS_DB.list) rows = (await RS_DB.list('offers')) || [];
    } catch (_) {}
    return (
      rows.find((o) => String(o.code || '').trim().toUpperCase() === c && offerIsActive(o)) || null
    );
  }
  async function applyPromoCode(rawCode) {
    if (!promoEnabled()) {
      toast('Promo codes disabled in settings', 'fa-circle-info');
      return false;
    }
    const code = String(rawCode || '')
      .trim()
      .toUpperCase();
    if (!code) {
      toast('Enter a promo code', 'fa-circle-exclamation');
      return false;
    }
    const offer = await findOfferByCode(code);
    if (!offer) {
      // Allow local quick promos from settings: set_promo_demo_code / pct
      const s = global.RS_SETTINGS || {};
      const demo = String(s.set_demo_promo_code || 'WELCOME10').toUpperCase();
      const rawPct = s.set_demo_promo_pct;
      const demoPct = Number(
        rawPct != null && rawPct !== '' ? rawPct : 10
      );
      if (code === demo && Number.isFinite(demoPct) && demoPct > 0) {
        if (global.RS && RS.setPromo) {
          RS.setPromo({ code, pct: demoPct, fixed: 0, title: 'Outlet promo', offerId: null });
        }
        toast(`Promo ${code} applied · ${demoPct}% off`, 'fa-tags');
        return true;
      }
      toast('Invalid or expired promo code', 'fa-circle-exclamation');
      return false;
    }
    const pct = Math.max(0, Math.min(100, Number(offer.pct != null ? offer.pct : offer.discount_pct) || 0));
    const fixed = Math.max(0, Number(offer.fixed != null ? offer.fixed : offer.amount) || 0);
    if (!(pct > 0 || fixed > 0)) {
      toast('Offer has no discount value', 'fa-circle-exclamation');
      return false;
    }
    // Optional phone lock: offer.customerPhone
    if (offer.customerPhone && global.RS && RS.getCustomer) {
      const cust = RS.getCustomer() || {};
      const want = String(offer.customerPhone).replace(/\D/g, '');
      const got = String(cust.phone || '').replace(/\D/g, '');
      if (want && got && !got.endsWith(want.slice(-10)) && want !== got) {
        toast('This code is for another guest phone', 'fa-circle-exclamation');
        return false;
      }
    }
    if (global.RS && RS.setPromo) {
      RS.setPromo({
        code: String(offer.code || code).toUpperCase(),
        pct,
        fixed,
        title: offer.title || offer.name || 'Promo',
        offerId: offer.id || null,
      });
    }
    toast(
      `Promo ${code} · ${fixed > 0 ? rs(fixed) + ' off' : pct + '% off'}`,
      'fa-tags'
    );
    return true;
  }
  function clearPromoCode() {
    if (global.RS && RS.clearPromo) RS.clearPromo();
    try {
      if (global.RS && RS.renderCart) RS.renderCart();
    } catch (_) {}
    toast('Promo cleared', 'fa-tags');
  }
  function wirePromoUi() {
    if (global.__rsPromoWired) return;
    global.__rsPromoWired = true;
    const apply = async () => {
      const inp = document.getElementById('promo-input');
      await applyPromoCode(inp && inp.value);
    };
    document.addEventListener(
      'click',
      (e) => {
        if (e.target.closest('#promo-apply')) {
          e.preventDefault();
          apply();
        }
        if (e.target.closest('#promo-clear')) {
          e.preventDefault();
          clearPromoCode();
        }
      },
      true
    );
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && e.target && e.target.id === 'promo-input') {
        e.preventDefault();
        apply();
      }
    });
  }
  global.RSPromo = {
    apply: applyPromoCode,
    clear: clearPromoCode,
    find: findOfferByCode,
    enabled: promoEnabled,
    wire: wirePromoUi,
  };

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
      let label = localStorage.getItem('rs_station_label');
      // Force-migrate ugly auto station ids to a human counter name
      if (!label || /^ST-[A-Z0-9]+$/i.test(String(label).trim())) {
        const friendly = localStorage.getItem('rs_station_label_friendly') || 'Counter 1';
        localStorage.setItem('rs_station_label', friendly);
        localStorage.setItem('rs_station_label_friendly', friendly);
        return friendly;
      }
      return label;
    } catch (_) {
      return 'Counter 1';
    }
  }
  function setStationLabel(label) {
    try {
      const v = String(label || '').trim().slice(0, 32) || 'Counter 1';
      localStorage.setItem('rs_station_label', v);
      localStorage.setItem('rs_station_label_friendly', v);
      paintStationChip();
    } catch (_) {}
  }

  function paintStationChip() {
    // Super-admin platform shell never shows POS station chrome
    try {
      if (document.documentElement.classList.contains('rs-role-superadmin')) return;
    } catch (_) {}
    let chip = document.getElementById('rs-station-chip');
    // Prefer left brand cluster so Counter sits next to page title (not lost in the tray)
    const host =
      document.getElementById('tb-left') ||
      document.querySelector('.topbar-right, .topbar-actions, .topbar');
    if (!host) return;
    if (!chip) {
      chip = document.createElement('button');
      chip.id = 'rs-station-chip';
      chip.type = 'button';
      chip.className = 'rs-station-chip';
      chip.title = 'This counter name (multi-terminal)';
      const title = host.querySelector('.tb-title');
      if (title) host.insertBefore(chip, title);
      else host.insertBefore(chip, host.firstChild);
      chip.onclick = () => {
        const next = window.prompt('Counter name (e.g. Counter 1, Bar, Takeaway)', getStationLabel());
        if (next != null && next.trim()) setStationLabel(next.trim());
      };
    }
    const label = getStationLabel();
    const display = /^ST-/i.test(label) ? 'Counter' : label;
    chip.innerHTML = '<i class="fa-solid fa-desktop"></i> ' + esc(display);
    chip.title = 'Counter: ' + label + ' · click to rename';
    // Desktop: printer chip next to station
    if (global.RS_DESKTOP && global.RSPrintBridge) {
      let pchip = document.getElementById('rs-printer-chip');
      if (!pchip && host) {
        pchip = document.createElement('button');
        pchip.id = 'rs-printer-chip';
        pchip.type = 'button';
        pchip.title = 'Preferred thermal printer';
        pchip.style.cssText = chip.style.cssText;
        host.insertBefore(pchip, chip.nextSibling);
        pchip.onclick = () => {
          if (global.RSPrintBridge.choosePreferredPrinter) RSPrintBridge.choosePreferredPrinter();
        };
      }
      if (pchip) {
        pchip.innerHTML = '<i class="fa-solid fa-print"></i> Printer';
        if (global.RS_DESKTOP.getPreferredPrinter) {
          global.RS_DESKTOP.getPreferredPrinter().then((pref) => {
            if (pref && pref.name) pchip.innerHTML = '<i class="fa-solid fa-print"></i> ' + esc(String(pref.name).slice(0, 18));
          }).catch(() => {});
        }
      }
    }
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
      cashMovements: [],
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

  /* ---------------- Cash drawer movements (pay-in / pay-out / safe drop) ---------------- */
  function getShiftMovements(shift) {
    const m = shift && shift.cashMovements;
    return Array.isArray(m) ? m : [];
  }
  function sumCashMovements(shift) {
    let payIn = 0;
    let payOut = 0;
    let safeDrop = 0;
    getShiftMovements(shift).forEach((mv) => {
      const a = Math.max(0, Number(mv.amount) || 0);
      const t = String(mv.type || '').toLowerCase();
      if (t === 'pay_in' || t === 'payin' || t === 'in') payIn += a;
      else if (t === 'pay_out' || t === 'payout' || t === 'out') payOut += a;
      else if (t === 'safe_drop' || t === 'safedrop' || t === 'drop') safeDrop += a;
    });
    return { payIn, payOut, safeDrop };
  }
  function movementLabel(type) {
    const t = String(type || '').toLowerCase();
    if (t === 'pay_in' || t === 'payin' || t === 'in') return 'Pay-in';
    if (t === 'pay_out' || t === 'payout' || t === 'out') return 'Pay-out';
    if (t === 'safe_drop' || t === 'safedrop' || t === 'drop') return 'Safe drop';
    return type || 'Move';
  }
  async function persistOpenShift(shift) {
    saveOpenShift(shift);
    try {
      if (shift && global.RS_DB && RS_DB.put) await RS_DB.put('shifts', shift.shiftId, shift);
    } catch (e) {
      console.warn('[Shift] cash move save failed', e);
    }
  }
  async function addCashMovement(type, amount, reason) {
    const shift = getOpenShift();
    if (!shift) {
      toast('Open a shift first', 'fa-circle-exclamation');
      return false;
    }
    const t = String(type || '').toLowerCase();
    const norm =
      t === 'pay_in' || t === 'payin' || t === 'in'
        ? 'pay_in'
        : t === 'pay_out' || t === 'payout' || t === 'out'
          ? 'pay_out'
          : t === 'safe_drop' || t === 'safedrop' || t === 'drop'
            ? 'safe_drop'
            : '';
    if (!norm) {
      toast('Unknown cash movement type', 'fa-circle-exclamation');
      return false;
    }
    const amt = Math.abs(Number(amount) || 0);
    if (!(amt > 0)) {
      toast('Enter an amount greater than zero', 'fa-circle-exclamation');
      return false;
    }
    // PIN for money leaving the drawer (toggle: Settings → Security → Pin gate cash move)
    if (norm === 'pay_out' || norm === 'safe_drop') {
      if (global.RSPinModal && typeof RSPinModal.require === 'function') {
        const pinOk = await RSPinModal.require(movementLabel(norm) + ' ' + rs(amt), {
          settingKey: 'set_pin_gate_cash_move',
        });
        if (!pinOk) {
          toast('Cash movement cancelled — PIN required', 'fa-lock');
          return false;
        }
      }
    }
    const s = session();
    const mv = {
      id: 'CM-' + Date.now(),
      type: norm,
      amount: amt,
      reason: String(reason || '').trim().slice(0, 140),
      at: new Date().toISOString(),
      by: s.display_name || s.username || shift.cashierName || '',
      stationId: getStationId(),
      stationLabel: getStationLabel(),
    };
    if (!Array.isArray(shift.cashMovements)) shift.cashMovements = [];
    shift.cashMovements.push(mv);
    // Stamp totals used by close/Z (pay-ins are not on totalPayouts column)
    const summed = sumCashMovements(shift);
    shift.totalPayIns = summed.payIn;
    shift.totalPayouts = summed.payOut;
    shift.totalSafeDrops = summed.safeDrop;
    await persistOpenShift(shift);
    // Also mirror to existing doppio_shift_events (no new table)
    try {
      if (global.RS_DB && RS_DB.put) {
        await RS_DB.put('shift_events', mv.id, {
          eventId: mv.id,
          shiftId: shift.shiftId,
          eventType:
            norm === 'pay_in' ? 'PAY_IN' : norm === 'safe_drop' ? 'SAFE_DROP' : 'PAYOUT',
          amount: amt,
          reason: mv.reason || movementLabel(norm),
          createdAt: mv.at,
        });
      }
    } catch (e) {
      console.warn('[Shift] event mirror failed', e);
    }
    paintShiftBar();
    toast(movementLabel(norm) + ' ' + rs(amt), norm === 'pay_in' ? 'fa-arrow-down' : 'fa-arrow-up');
    return true;
  }
  function openCashMovementModal() {
    const shift = getOpenShift();
    if (!shift) {
      toast('Open a shift first', 'fa-circle-exclamation');
      return;
    }
    if (!global.RSModal) {
      const type = window.prompt('Type: pay_in | pay_out | safe_drop', 'pay_in');
      if (type == null) return;
      const amt = window.prompt('Amount', '0');
      if (amt == null) return;
      const reason = window.prompt('Reason / note', '') || '';
      addCashMovement(type, amt, reason);
      return;
    }
    const mov = sumCashMovements(shift);
    const recent = getShiftMovements(shift)
      .slice(-6)
      .reverse()
      .map(
        (m) =>
          `<div style="display:flex;justify-content:space-between;gap:8px;font-size:12px;padding:4px 0;border-bottom:1px solid var(--stroke-2)">
            <span><b>${esc(movementLabel(m.type))}</b> · ${esc(m.reason || '—')}</span>
            <span style="font-weight:700;white-space:nowrap">${rs(m.amount)}</span>
          </div>`
      )
      .join('');
    RSModal.open({
      title: 'Cash drawer',
      sub: 'Pay-in · pay-out · safe drop · ' + (shift.shiftId || ''),
      icon: 'fa-money-bill-wave',
      body: `<div style="display:flex;flex-direction:column;gap:12px">
        <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:8px;font-size:12px">
          <div style="padding:8px;border-radius:8px;border:1px solid var(--stroke-2);background:var(--glass-1)"><div style="color:var(--text-mute);font-size:10px;font-weight:700;text-transform:uppercase">Pay-ins</div><div style="font-weight:800;color:var(--green)">${rs(mov.payIn)}</div></div>
          <div style="padding:8px;border-radius:8px;border:1px solid var(--stroke-2);background:var(--glass-1)"><div style="color:var(--text-mute);font-size:10px;font-weight:700;text-transform:uppercase">Pay-outs</div><div style="font-weight:800;color:#ef4444">${rs(mov.payOut)}</div></div>
          <div style="padding:8px;border-radius:8px;border:1px solid var(--stroke-2);background:var(--glass-1)"><div style="color:var(--text-mute);font-size:10px;font-weight:700;text-transform:uppercase">Safe drops</div><div style="font-weight:800">${rs(mov.safeDrop)}</div></div>
        </div>
        <div style="display:flex;flex-wrap:wrap;gap:6px" id="cm-type-row">
          <button type="button" class="btn btn-ghost btn-sm active" data-cm-type="pay_in" style="font-weight:700"><i class="fa-solid fa-arrow-down"></i> Pay-in</button>
          <button type="button" class="btn btn-ghost btn-sm" data-cm-type="pay_out" style="font-weight:700"><i class="fa-solid fa-arrow-up"></i> Pay-out</button>
          <button type="button" class="btn btn-ghost btn-sm" data-cm-type="safe_drop" style="font-weight:700"><i class="fa-solid fa-vault"></i> Safe drop</button>
        </div>
        <div>
          <label class="fl" style="font-size:12px">Amount</label>
          <input type="number" id="cm-amount" class="form-input" min="0" step="1" placeholder="0" style="width:100%;height:36px" inputmode="decimal">
        </div>
        <div>
          <label class="fl" style="font-size:12px">Reason / note</label>
          <input type="text" id="cm-reason" class="form-input" placeholder="e.g. Bank deposit, change order, tips tip-out" style="width:100%;height:36px" maxlength="140">
        </div>
        <div>
          <div style="font-size:11px;font-weight:700;color:var(--text-mute);margin-bottom:4px;text-transform:uppercase;letter-spacing:.04em">Recent on this shift</div>
          ${recent || '<div style="font-size:12px;color:var(--text-mute)">No movements yet</div>'}
        </div>
        <p style="font-size:11.5px;color:var(--text-soft);margin:0">Expected cash on Z = float + cash sales + pay-ins − pay-outs − safe drops. Pay-out &amp; safe drop ask for manager PIN when configured.</p>
      </div>`,
      foot:
        '<button class="btn btn-ghost" style="flex:1" data-cm-x>Cancel</button>' +
        '<button class="btn btn-primary" style="flex:1" data-cm-ok><i class="fa-solid fa-check"></i> Record</button>',
      onMount(m, close) {
        let chosen = 'pay_in';
        const row = m.querySelector('#cm-type-row');
        if (row) {
          row.querySelectorAll('[data-cm-type]').forEach((btn) => {
            btn.onclick = () => {
              chosen = btn.getAttribute('data-cm-type') || 'pay_in';
              row.querySelectorAll('[data-cm-type]').forEach((b) => b.classList.toggle('active', b === btn));
            };
          });
        }
        const x = m.querySelector('[data-cm-x]');
        if (x) x.onclick = close;
        const ok = m.querySelector('[data-cm-ok]');
        if (ok)
          ok.onclick = async () => {
            const amtEl = m.querySelector('#cm-amount');
            const reasonEl = m.querySelector('#cm-reason');
            const done = await addCashMovement(
              chosen,
              amtEl && amtEl.value,
              reasonEl && reasonEl.value
            );
            if (done) close();
          };
        const amtEl = m.querySelector('#cm-amount');
        if (amtEl) setTimeout(() => amtEl.focus(), 50);
      },
    });
  }

  const SHIFT_HISTORY_KEY = 'rs_shift_history';
  const Z_SCOPE_KEY = 'rs_z_scope'; // station | all

  function getZScope() {
    try {
      return localStorage.getItem(Z_SCOPE_KEY) === 'all' ? 'all' : 'station';
    } catch (_) {
      return 'station';
    }
  }
  function setZScope(scope) {
    try {
      localStorage.setItem(Z_SCOPE_KEY, scope === 'all' ? 'all' : 'station');
    } catch (_) {}
  }

  function billsForShift(shift, opts) {
    const bills = (global.RS && RS.BILLS) || [];
    if (!shift) return [];
    const scope = (opts && opts.scope) || getZScope();
    const stationId = getStationId();
    const openTs = new Date(shift.openedAt).getTime();
    return bills.filter((b) => {
      if (scope === 'station') {
        // Prefer stamped station; fall back to "no stamp" as this station (legacy bills)
        const bid = b.stationId || b.station_id || '';
        if (bid && bid !== stationId) return false;
      }
      if (shift.shiftId && b.shiftId === shift.shiftId) return true;
      const t = b.dateTime ? new Date(b.dateTime).getTime() : 0;
      return t >= openTs && (!shift.closedAt || t <= new Date(shift.closedAt).getTime());
    });
  }

  function summarizeShift(shift, actualCash, opts) {
    const rows = billsForShift(shift, opts);
    const paid = rows.filter((b) => String(b.status || 'paid').toLowerCase() !== 'refunded');
    const refunded = rows.filter((b) => String(b.status || '').toLowerCase() === 'refunded');
    const byPay = {};
    const byStation = {};
    let gross = 0;
    let taxTotal = 0;
    let tipsTotal = 0;
    let serviceChargeTotal = 0;
    let deliveryTotal = 0;
    let coversTotal = 0;
    let refundTotal = 0;
    paid.forEach((b) => {
      const amt = Number(b.amount != null ? b.amount : b.total) || 0;
      gross += amt;
      taxTotal += Number(b.gst || b.tax || 0) || 0;
      tipsTotal += Number(b.tipAmount || b.tip || 0) || 0;
      serviceChargeTotal += Number(b.serviceChargeAmount || 0) || 0;
      deliveryTotal += Number(b.deliveryCharge || b.delivery_charge || 0) || 0;
      coversTotal += Math.max(0, Number(b.covers != null ? b.covers : b.pax) || 0);
      const method = b.pay || b.paymentMethod || 'Cash';
      byPay[method] = (byPay[method] || 0) + amt;
      const st = b.stationLabel || b.stationId || shift.stationLabel || 'This station';
      byStation[st] = (byStation[st] || 0) + amt;
    });
    refunded.forEach((b) => {
      refundTotal += Number(b.amount != null ? b.amount : b.total) || 0;
    });
    const cashSales = byPay.Cash || byPay.cash || 0;
    const mov = sumCashMovements(shift);
    const expectedCash =
      (Number(shift.openingFloat) || 0) + cashSales + mov.payIn - mov.payOut - mov.safeDrop;
    const actual = Number(actualCash);
    const variance = Number.isFinite(actual) ? actual - expectedCash : null;
    return {
      bills: paid.length,
      refunds: refunded.length,
      refundTotal,
      gross,
      taxTotal,
      tipsTotal,
      serviceChargeTotal,
      deliveryTotal,
      coversTotal,
      avgPerCover: coversTotal > 0 ? Math.round((gross / coversTotal) * 100) / 100 : null,
      byPay,
      byStation,
      cashSales,
      payInTotal: mov.payIn,
      payOutTotal: mov.payOut,
      safeDropTotal: mov.safeDrop,
      cashMovements: getShiftMovements(shift),
      expectedCash,
      actualCash: Number.isFinite(actual) ? actual : null,
      variance,
      openingFloat: Number(shift.openingFloat) || 0,
      scope: (opts && opts.scope) || getZScope(),
      stationId: getStationId(),
      stationLabel: getStationLabel(),
    };
  }

  function zReportHtml(shift, summary) {
    const payLines = Object.entries(summary.byPay || {})
      .sort((a, b) => b[1] - a[1])
      .map(([m, v]) => `<div class="rcp-line" style="display:flex;justify-content:space-between;font-size:12px;padding:3px 0"><span>${esc(m)}</span><span>${rs(v)}</span></div>`)
      .join('');
    const stationLines = Object.entries(summary.byStation || {})
      .sort((a, b) => b[1] - a[1])
      .map(([m, v]) => `<div class="rcp-line" style="display:flex;justify-content:space-between;font-size:12px;padding:3px 0"><span>${esc(m)}</span><span>${rs(v)}</span></div>`)
      .join('');
    const scopeLabel = summary.scope === 'all' ? 'All stations' : 'This station only';
    return `<div class="receipt-paper" style="max-width:320px;margin:0 auto;padding:16px;font-family:system-ui,sans-serif">
      <div style="text-align:center;font-weight:800;font-size:18px">Z-REPORT</div>
      <div style="text-align:center;font-size:12px;color:#666;margin:4px 0 4px">${esc(shift.shiftId)} · ${esc(shift.stationLabel || summary.stationLabel || '')}</div>
      <div style="text-align:center;font-size:11px;color:#888;margin:0 0 12px">${esc(scopeLabel)}</div>
      <div class="rcp-line" style="display:flex;justify-content:space-between;font-size:12px;padding:3px 0"><span>Cashier</span><span>${esc(shift.cashierName)}</span></div>
      <div class="rcp-line" style="display:flex;justify-content:space-between;font-size:12px;padding:3px 0"><span>Opened</span><span>${esc(new Date(shift.openedAt).toLocaleString())}</span></div>
      <div class="rcp-line" style="display:flex;justify-content:space-between;font-size:12px;padding:3px 0"><span>Closed</span><span>${esc(shift.closedAt ? new Date(shift.closedAt).toLocaleString() : '—')}</span></div>
      <hr style="border:0;border-top:1px dashed #ccc;margin:10px 0">
      <div class="rcp-line" style="display:flex;justify-content:space-between;font-size:12px;padding:3px 0"><span>Bills</span><span>${summary.bills}</span></div>
      <div class="rcp-line" style="display:flex;justify-content:space-between;font-size:12px;padding:3px 0"><span>Voids / refunds</span><span>${summary.refunds}${summary.refundTotal ? ' · ' + rs(summary.refundTotal) : ''}</span></div>
      <div class="rcp-line" style="display:flex;justify-content:space-between;font-size:12px;padding:3px 0"><span>Tax (GST/VAT)</span><span>${rs(summary.taxTotal || 0)}</span></div>
      <div class="rcp-line" style="display:flex;justify-content:space-between;font-size:12px;padding:3px 0"><span>Tips</span><span>${rs(summary.tipsTotal || 0)}</span></div>
      <div class="rcp-line" style="display:flex;justify-content:space-between;font-size:12px;padding:3px 0"><span>Service charge</span><span>${rs(summary.serviceChargeTotal || 0)}</span></div>
      <div class="rcp-line" style="display:flex;justify-content:space-between;font-size:12px;padding:3px 0"><span>Delivery fees</span><span>${rs(summary.deliveryTotal || 0)}</span></div>
      <div class="rcp-line" style="display:flex;justify-content:space-between;font-size:12px;padding:3px 0"><span>Covers (pax)</span><span>${summary.coversTotal || 0}</span></div>
      ${
        summary.avgPerCover != null
          ? `<div class="rcp-line" style="display:flex;justify-content:space-between;font-size:12px;padding:3px 0"><span>Avg / cover</span><span>${rs(summary.avgPerCover)}</span></div>`
          : ''
      }
      <div class="rcp-line" style="display:flex;justify-content:space-between;font-weight:800;font-size:15px;padding:6px 0"><span>Gross</span><span>${rs(summary.gross)}</span></div>
      <hr style="border:0;border-top:1px dashed #ccc;margin:10px 0">
      <div style="font-size:11px;font-weight:700;margin-bottom:4px">Payment mix</div>
      ${payLines || '<div style="font-size:12px;color:#666">No sales</div>'}
      ${stationLines && summary.scope === 'all' ? `<hr style="border:0;border-top:1px dashed #ccc;margin:10px 0"><div style="font-size:11px;font-weight:700;margin-bottom:4px">By station</div>${stationLines}` : ''}
      <hr style="border:0;border-top:1px dashed #ccc;margin:10px 0">
      <div class="rcp-line" style="display:flex;justify-content:space-between;font-size:12px;padding:3px 0"><span>Opening float</span><span>${rs(summary.openingFloat)}</span></div>
      <div class="rcp-line" style="display:flex;justify-content:space-between;font-size:12px;padding:3px 0"><span>Cash sales</span><span>${rs(summary.cashSales)}</span></div>
      <div class="rcp-line" style="display:flex;justify-content:space-between;font-size:12px;padding:3px 0"><span>Pay-ins</span><span>${rs(summary.payInTotal || 0)}</span></div>
      <div class="rcp-line" style="display:flex;justify-content:space-between;font-size:12px;padding:3px 0"><span>Pay-outs</span><span>− ${rs(summary.payOutTotal || 0)}</span></div>
      <div class="rcp-line" style="display:flex;justify-content:space-between;font-size:12px;padding:3px 0"><span>Safe drops</span><span>− ${rs(summary.safeDropTotal || 0)}</span></div>
      <div class="rcp-line" style="display:flex;justify-content:space-between;font-size:12px;padding:3px 0"><span>Expected cash</span><span>${rs(summary.expectedCash)}</span></div>
      <div class="rcp-line" style="display:flex;justify-content:space-between;font-size:12px;padding:3px 0"><span>Actual cash</span><span>${summary.actualCash != null ? rs(summary.actualCash) : '—'}</span></div>
      <div class="rcp-line" style="display:flex;justify-content:space-between;font-weight:800;font-size:14px;padding:6px 0;color:${summary.variance != null && summary.variance !== 0 ? '#ef4444' : 'inherit'}"><span>Variance</span><span>${summary.variance != null ? rs(summary.variance) : '—'}</span></div>
      ${
        Array.isArray(summary.cashMovements) && summary.cashMovements.length
          ? `<hr style="border:0;border-top:1px dashed #ccc;margin:10px 0"><div style="font-size:11px;font-weight:700;margin-bottom:4px">Cash movements</div>` +
            summary.cashMovements
              .map(
                (m) =>
                  `<div class="rcp-line" style="display:flex;justify-content:space-between;font-size:11px;padding:2px 0;color:#444"><span>${esc(movementLabel(m.type))}${m.reason ? ' · ' + esc(m.reason) : ''}</span><span>${rs(m.amount)}</span></div>`
              )
              .join('')
          : ''
      }
      <div style="text-align:center;font-size:11px;color:#666;margin-top:14px">Powered by RestroSuite</div>
    </div>`;
  }

  function zReportCsv(shift, summary) {
    const lines = [
      ['Field', 'Value'],
      ['Shift', shift.shiftId || ''],
      ['Station', shift.stationLabel || summary.stationLabel || ''],
      ['Scope', summary.scope === 'all' ? 'all stations' : 'this station'],
      ['Cashier', shift.cashierName || ''],
      ['Opened', shift.openedAt || ''],
      ['Closed', shift.closedAt || ''],
      ['Bills', summary.bills],
      ['Refunds', summary.refunds],
      ['Refund total', summary.refundTotal || 0],
      ['Gross', summary.gross],
      ['Tax', summary.taxTotal || 0],
      ['Tips', summary.tipsTotal || 0],
      ['Service charge', summary.serviceChargeTotal || 0],
      ['Delivery fees', summary.deliveryTotal || 0],
      ['Covers (pax)', summary.coversTotal || 0],
      ['Avg per cover', summary.avgPerCover != null ? summary.avgPerCover : ''],
      ['Opening float', summary.openingFloat],
      ['Cash sales', summary.cashSales],
      ['Pay-ins', summary.payInTotal || 0],
      ['Pay-outs', summary.payOutTotal || 0],
      ['Safe drops', summary.safeDropTotal || 0],
      ['Expected cash', summary.expectedCash],
      ['Actual cash', summary.actualCash != null ? summary.actualCash : ''],
      ['Variance', summary.variance != null ? summary.variance : ''],
    ];
    Object.entries(summary.byPay || {}).forEach(([m, v]) => lines.push(['Pay:' + m, v]));
    Object.entries(summary.byStation || {}).forEach(([m, v]) => lines.push(['Station:' + m, v]));
    (summary.cashMovements || []).forEach((m) => {
      lines.push([
        'Move:' + movementLabel(m.type),
        (Number(m.amount) || 0) + (m.reason ? ' | ' + m.reason : ''),
      ]);
    });
    return lines.map((r) => r.map((c) => '"' + String(c).replace(/"/g, '""') + '"').join(',')).join('\n');
  }

  function downloadZCsv(shift, summary) {
    const csv = zReportCsv(shift, summary);
    const name = 'z-report-' + (shift.shiftId || 'shift') + '.csv';
    if (global.RS && typeof RS.downloadFile === 'function') {
      RS.downloadFile(csv, 'text/csv;charset=utf-8;', name);
    } else {
      const a = document.createElement('a');
      a.href = 'data:text/csv;charset=utf-8,' + encodeURIComponent(csv);
      a.download = name;
      a.click();
    }
    toast('Z-report CSV downloaded', 'fa-file-csv');
  }

  function pushShiftHistory(shift, summary) {
    try {
      const raw = JSON.parse(localStorage.getItem(SHIFT_HISTORY_KEY) || '[]');
      const list = Array.isArray(raw) ? raw : [];
      list.unshift({
        shiftId: shift.shiftId,
        stationLabel: shift.stationLabel,
        cashierName: shift.cashierName,
        openedAt: shift.openedAt,
        closedAt: shift.closedAt,
        gross: summary.gross,
        variance: summary.variance,
        bills: summary.bills,
        scope: summary.scope,
      });
      while (list.length > 20) list.pop();
      localStorage.setItem(SHIFT_HISTORY_KEY, JSON.stringify(list));
    } catch (_) {}
  }

  function showZReportModal(shift, summary, title) {
    const html = zReportHtml(shift, summary);
    if (global.RSModal) {
      RSModal.open({
        title: title || 'Z-Report',
        sub: shift.shiftId + ' · ' + (summary.scope === 'all' ? 'All stations' : 'This station'),
        icon: 'fa-file-invoice-dollar',
        body: html,
        foot:
          '<button class="btn btn-ghost" id="zr-csv"><i class="fa-solid fa-file-csv"></i> CSV</button>' +
          '<button class="btn btn-ghost" id="zr-print"><i class="fa-solid fa-print"></i> Print</button>' +
          '<button class="btn btn-primary" id="zr-ok">Done</button>',
        onMount(m, close) {
          const ok = m.querySelector('#zr-ok');
          if (ok) ok.onclick = close;
          const pr = m.querySelector('#zr-print');
          if (pr)
            pr.onclick = () => {
              if (global.RSPrint) RSPrint(html, 'Z-Report ' + shift.shiftId);
              else window.print();
            };
          const csv = m.querySelector('#zr-csv');
          if (csv) csv.onclick = () => downloadZCsv(shift, summary);
        },
      });
    } else if (global.RSPrint) {
      RSPrint(html, 'Z-Report ' + shift.shiftId);
    }
  }

  async function closeShift() {
    const shift = getOpenShift();
    if (!shift) return toast('No open shift', 'fa-circle-exclamation');
    if (global.RSPinModal && RSPinModal.isConfigured()) {
      const ok = await RSPinModal.request('Close shift · Z-report');
      if (!ok) return;
    }
    const pre = summarizeShift(shift);
    const actualStr = window.prompt('Actual cash in drawer (count)', String(pre.expectedCash));
    if (actualStr === null) return;
    const actual = Number(actualStr);
    shift.closedAt = new Date().toISOString();
    shift.status = 'CLOSED';
    shift.actualCash = Number.isFinite(actual) ? actual : 0;
    const summary = summarizeShift(shift, shift.actualCash);
    shift.expectedCash = summary.expectedCash;
    shift.variance = summary.variance;
    shift.totalSalesCash = summary.cashSales;
    shift.totalPayIns = summary.payInTotal || 0;
    shift.totalPayouts = summary.payOutTotal || 0;
    shift.totalSafeDrops = summary.safeDropTotal || 0;
    shift.zScope = summary.scope;
    try {
      if (global.RS_DB && RS_DB.put) await RS_DB.put('shifts', shift.shiftId, shift);
    } catch (e) {
      console.warn('[Shift] close save failed', e);
    }
    pushShiftHistory(shift, summary);
    saveOpenShift(null);
    showZReportModal(shift, summary, 'Z-Report · shift closed');
    if (global.RSPrint) {
      try {
        RSPrint(zReportHtml(shift, summary), 'Z-Report ' + shift.shiftId);
      } catch (_) {}
    }
    toast('Shift closed · variance ' + (summary.variance != null ? rs(summary.variance) : 'n/a'), 'fa-lock');
  }

  function paintShiftBar() {
    // Petpooja-style: shift/register tools live in the TOP BAR (station-level),
    // never permanently inside the order cart (items-first).
    try {
      if (document.documentElement.classList.contains('rs-role-superadmin')) {
        const existing = document.getElementById('rs-shift-bar');
        if (existing) existing.style.display = 'none';
        const cartSlot = document.getElementById('pos-shift-slot');
        if (cartSlot) cartSlot.innerHTML = '';
        return;
      }
    } catch (_) {}

    let host = document.getElementById('rs-topbar-shift');
    if (!host) {
      const topbar = document.querySelector('.topbar');
      if (!topbar) return;
      host = document.createElement('div');
      host.id = 'rs-topbar-shift';
      host.className = 'rs-topbar-shift';
      host.setAttribute('aria-label', 'Shift / register');
      // Between brand and right tray — register ops are primary mid-header
      const right = topbar.querySelector('.tb-right');
      const spacer = topbar.querySelector('.tb-spacer');
      if (right) topbar.insertBefore(host, right);
      else if (spacer) spacer.insertAdjacentElement('afterend', host);
      else topbar.appendChild(host);
    }

    // Clear legacy cart-side mount (v91–93 put shift on cart)
    const cartSlot = document.getElementById('pos-shift-slot');
    if (cartSlot) {
      cartSlot.innerHTML = '';
      cartSlot.style.display = 'none';
    }

    let bar = document.getElementById('rs-shift-bar');
    const shift = getOpenShift();
    if (!bar) {
      bar = document.createElement('div');
      bar.id = 'rs-shift-bar';
      bar.className = 'rs-shift-bar rs-shift-bar-top';
    }
    bar.style.display = '';
    if (bar.parentNode !== host) host.appendChild(bar);

    // Tiny cart status only when shift is closed (don't steal item space when open)
    let cartHint = document.getElementById('rs-cart-shift-hint');
    const cartEl = document.querySelector('.pos-cart');
    if (cartEl && !cartHint) {
      cartHint = document.createElement('button');
      cartHint.type = 'button';
      cartHint.id = 'rs-cart-shift-hint';
      cartHint.className = 'rs-cart-shift-hint';
      cartHint.hidden = true;
      const head = cartEl.querySelector('.cart-head');
      if (head && head.parentNode) head.insertAdjacentElement('afterend', cartHint);
      else cartEl.insertBefore(cartHint, cartEl.firstChild);
    }

    if (shift) {
      const sum = summarizeShift(shift);
      const movHint =
        sum.payInTotal || sum.payOutTotal || sum.safeDropTotal
          ? ` · ${rs(sum.expectedCash)}`
          : '';
      bar.classList.remove('rs-shift-bar-closed');
      bar.classList.add('rs-shift-bar-open');
      bar.innerHTML = `<div class="rs-shift-compact rs-shift-icons rs-shift-topbar" title="Shift open · ${esc(sum.bills)} bills · ${esc(rs(sum.gross))}${esc(movHint)}">
        <span class="rs-shift-dot open" title="Shift open"></span>
        <span class="rs-shift-text"><b>${esc(sum.bills)}</b><span class="rs-shift-amt">${esc(rs(sum.gross))}</span></span>
        <button type="button" class="btn btn-ghost btn-sm" id="rs-cash-move" title="Cash drawer (pay-in / pay-out)"><i class="fa-solid fa-cash-register"></i></button>
        <button type="button" class="btn btn-ghost btn-sm" id="rs-shift-z" title="Z-report">Z</button>
        <button type="button" class="btn btn-primary btn-sm" id="rs-shift-close" title="Close shift"><i class="fa-solid fa-lock"></i></button>
      </div>`;
      const cm = bar.querySelector('#rs-cash-move');
      if (cm) cm.onclick = () => openCashMovementModal();
      const z = bar.querySelector('#rs-shift-z');
      if (z)
        z.onclick = () => {
          showZReportModal(shift, summarizeShift(shift), 'Z-Report (open shift)');
        };
      const cl = bar.querySelector('#rs-shift-close');
      if (cl) cl.onclick = () => closeShift();
      if (cartHint) {
        cartHint.hidden = true;
        cartHint.onclick = null;
      }
      document.getElementById('pos-tab')?.classList.remove('rs-shift-is-closed');
    } else {
      bar.classList.add('rs-shift-bar-closed');
      bar.classList.remove('rs-shift-bar-open');
      bar.innerHTML = `<div class="rs-shift-compact closed rs-shift-icons rs-shift-topbar" title="No shift open — tap to open">
        <span class="rs-shift-dot closed"></span>
        <button type="button" class="btn btn-primary btn-sm" id="rs-shift-open" title="Open shift"><i class="fa-solid fa-unlock"></i><span class="rs-shift-open-lbl">Shift</span></button>
      </div>`;
      const op = bar.querySelector('#rs-shift-open');
      if (op)
        op.onclick = async () => {
          const f = window.prompt('Opening cash float (drawer start amount)', '0');
          if (f === null) return;
          await openShift(Number(f) || 0);
        };
      // Cart only shows a one-line open prompt when closed (not the full control strip)
      if (cartHint) {
        cartHint.hidden = false;
        cartHint.innerHTML =
          '<i class="fa-solid fa-unlock"></i> <span>Open shift to bill</span>';
        cartHint.onclick = () => {
          const btn = document.getElementById('rs-shift-open');
          if (btn) btn.click();
          else op && op.click();
        };
      }
      document.getElementById('pos-tab')?.classList.add('rs-shift-is-closed');
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
      <div style="margin-top:8px;font-size:12px">Use <b>Day pack</b> for today's sales CSV · <b>Demo</b> for the 15-min checklist</div>
    </div>`;
    if (global.RSModal) {
      RSModal.open({
        title: 'POS keyboard',
        icon: 'fa-keyboard',
        size: 'sm',
        body,
        foot:
          '<button class="btn btn-ghost" id="kh-demo">Demo</button><button class="btn btn-primary" id="kh-ok">Got it</button>',
        onMount(m, c) {
          const ok = m.querySelector('#kh-ok');
          if (ok) ok.onclick = c;
          const d = m.querySelector('#kh-demo');
          if (d)
            d.onclick = () => {
              c();
              if (typeof global.openDemoScript === 'function') global.openDemoScript();
            };
        },
      });
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

  function todayBills(stationOnly) {
    const bills = (global.RS && RS.BILLS) || [];
    const start = new Date();
    start.setHours(0, 0, 0, 0);
    const sid = getStationId();
    return bills.filter((b) => {
      if (String(b.status || 'paid').toLowerCase() === 'refunded') return false;
      if (stationOnly) {
        const bid = b.stationId || b.station_id || '';
        if (bid && bid !== sid) return false;
      }
      const t = b.dateTime ? new Date(b.dateTime).getTime() : 0;
      return t >= start.getTime();
    });
  }

  function exportDayPackCsv() {
    const stationOnly = getZScope() !== 'all';
    const rows = todayBills(stationOnly);
    if (!rows.length) return toast('No sales today to export', 'fa-circle-exclamation');
    const headers = [
      'Bill No',
      'DateTime',
      'Total',
      'Payment',
      'Station',
      'Shift',
      'Cashier',
      'Customer',
      'Phone',
      'Status',
    ];
    const lines = [headers.join(',')];
    rows.forEach((b) => {
      lines.push(
        [
          b.no || b.orderId || '',
          b.dateTime || b.time || '',
          b.amount != null ? b.amount : b.total || 0,
          b.pay || b.paymentMethod || '',
          b.stationLabel || b.stationId || '',
          b.shiftId || '',
          b.cashier || '',
          b.customerName || '',
          b.customerPhone || '',
          b.status || 'paid',
        ]
          .map((v) => '"' + String(v).replace(/"/g, '""') + '"')
          .join(',')
      );
    });
    const shift = getOpenShift();
    if (shift) {
      const sum = summarizeShift(shift);
      lines.push('');
      lines.push('"Z summary (open shift)"');
      lines.push('"Gross","' + sum.gross + '"');
      lines.push('"Cash sales","' + sum.cashSales + '"');
      lines.push('"Expected cash","' + sum.expectedCash + '"');
      lines.push('"Bills","' + sum.bills + '"');
    }
    const name =
      'day-pack-' +
      new Date().toISOString().slice(0, 10) +
      (stationOnly ? '-station' : '-all') +
      '.csv';
    if (global.RS && typeof RS.downloadFile === 'function') {
      RS.downloadFile(lines.join('\n'), 'text/csv;charset=utf-8;', name);
    } else {
      const a = document.createElement('a');
      a.href = 'data:text/csv;charset=utf-8,' + encodeURIComponent(lines.join('\n'));
      a.download = name;
      a.click();
    }
    toast('Day pack CSV · ' + rows.length + ' bills', 'fa-file-csv');
  }

  /* ---------------- Owner strip — hidden; metrics only under More ---------------- */
  function paintOwnerStrip() {
    const strip = document.getElementById('rs-owner-strip');
    if (strip) {
      strip.style.display = 'none';
      strip.setAttribute('hidden', '');
    }
    try {
      const today = todayBills(false);
      const sales = today.reduce((a, b) => a + (Number(b.amount != null ? b.amount : b.total) || 0), 0);
      global.__rsTodaySales = sales;
      global.__rsTodayOrders = today.length;
      global.__rsShiftOpen = !!getOpenShift();
    } catch (_) {}
    try { ensurePosQuickTools(); } catch (_) {}
  }

  function canShowDemoTools() {
    try {
      if (global.RS_API && RS_API.enableDemoTools) return true;
      const sess = global.RS_API && RS_API.session && RS_API.session();
      if (sess && sess.role === 'superadmin') return true;
      if (new URLSearchParams(location.search).get('demo') === '1') return true;
      if (sess && String(sess.username || '').indexOf('superadmin:') === 0) return true;
    } catch (_) {}
    return false;
  }

  function ensurePosQuickTools() {
    const pos = document.getElementById('pos-tab');
    if (!pos) return;
    let tools = document.getElementById('rs-pos-quick-tools');
    if (!tools) {
      tools = document.createElement('div');
      tools.id = 'rs-pos-quick-tools';
      tools.className = 'rs-pos-more-tools';
    }
    // Mount into menu toolbar (not a separate row under the menu)
    const secondary = document.getElementById('pos-toolbar-secondary') || pos.querySelector('.pos-toolbar-secondary');
    if (secondary) {
      if (tools.parentNode !== secondary) secondary.appendChild(tools);
    } else if (!tools.parentNode) {
      pos.insertBefore(tools, pos.firstChild);
    }
    const lowN = Number(global.__rsLowStockCount) || 0;
    const showDemo = canShowDemoTools();
    const sales = Number(global.__rsTodaySales) || 0;
    const orders = Number(global.__rsTodayOrders) || 0;
    const shiftOpen = !!global.__rsShiftOpen;
    const summary = rs(sales) + ' today · ' + orders + ' orders · ' + (shiftOpen ? 'Shift open' : 'Shift closed');
    tools.innerHTML = `
      <div class="rs-pos-more" id="rs-pos-more">
        <button type="button" class="btn btn-ghost btn-sm rs-pos-more-btn" id="rs-pos-more-toggle" aria-expanded="false" aria-haspopup="true" title="Tools">
          <i class="fa-solid fa-ellipsis"></i>
        </button>
        <div class="rs-pos-more-menu" id="rs-pos-more-menu" hidden role="menu">
          <div class="rs-pos-more-hint rs-pos-more-stats">${esc(summary)}</div>
          <div class="rs-pos-more-sep"></div>
          <button type="button" role="menuitem" id="rs-day-pack"><i class="fa-solid fa-file-export"></i> Day pack CSV</button>
          <button type="button" role="menuitem" id="rs-keys-help"><i class="fa-solid fa-keyboard"></i> Shortcuts (F1)</button>
          ${lowN > 0 ? `<button type="button" role="menuitem" id="rs-low-stock-btn" class="warn"><i class="fa-solid fa-boxes-stacked"></i> Low stock (${lowN})</button>` : ''}
          ${showDemo ? `<button type="button" role="menuitem" id="rs-demo-btn"><i class="fa-solid fa-clapperboard"></i> Demo checklist</button>` : ''}
          <div class="rs-pos-more-sep"></div>
          <div class="rs-pos-more-hint">F2 search · F4 KOT · F8 pay</div>
        </div>
      </div>`;
    const toggle = tools.querySelector('#rs-pos-more-toggle');
    const menu = tools.querySelector('#rs-pos-more-menu');
    if (toggle && menu && !toggle.dataset.bound) {
      toggle.dataset.bound = '1';
      toggle.addEventListener('click', (e) => {
        e.stopPropagation();
        const open = menu.hasAttribute('hidden');
        if (open) {
          menu.removeAttribute('hidden');
          toggle.setAttribute('aria-expanded', 'true');
        } else {
          menu.setAttribute('hidden', '');
          toggle.setAttribute('aria-expanded', 'false');
        }
      });
      document.addEventListener('click', (e) => {
        if (!tools.contains(e.target)) {
          menu.setAttribute('hidden', '');
          toggle.setAttribute('aria-expanded', 'false');
        }
      });
    }
    const day = tools.querySelector('#rs-day-pack');
    if (day) day.onclick = () => { exportDayPackCsv(); menu && menu.setAttribute('hidden', ''); };
    const keys = tools.querySelector('#rs-keys-help');
    if (keys) keys.onclick = () => { showShortcutsHelp(); menu && menu.setAttribute('hidden', ''); };
    const lowBtn = tools.querySelector('#rs-low-stock-btn');
    if (lowBtn)
      lowBtn.onclick = () => {
        if (global.RS && typeof RS.activateTab === 'function') RS.activateTab('inventory-tab');
      };
    const demo = tools.querySelector('#rs-demo-btn');
    if (demo)
      demo.onclick = () => {
        if (typeof global.openDemoScript === 'function') global.openDemoScript();
        else toast('Demo checklist loading…', 'fa-clapperboard');
        menu && menu.setAttribute('hidden', '');
      };
  }

  /** Soft nudge: open shift before first checkout of the session */
  function installShiftNudge() {
    if (document.documentElement.dataset.rsShiftNudge === '1') return;
    document.documentElement.dataset.rsShiftNudge = '1';
    document.addEventListener(
      'click',
      (e) => {
        const btn = e.target && e.target.closest && e.target.closest('#btn-checkout');
        if (!btn) return;
        if (getOpenShift()) return;
        try {
          if (sessionStorage.getItem('rs_shift_nudge_done') === '1') return;
          sessionStorage.setItem('rs_shift_nudge_done', '1');
        } catch (_) {}
        toast('Tip: open a shift for cash Z-report · use Day pack anytime', 'fa-cash-register');
      },
      true
    );
  }

  function maybePromptOpenShift() {
    try {
      if (sessionStorage.getItem('rs_shift_prompted') === '1') return;
      if (getOpenShift()) return;
      const pos = document.getElementById('pos-tab');
      if (!pos || !pos.classList.contains('active')) return;
      sessionStorage.setItem('rs_shift_prompted', '1');
      // Non-blocking: only toast, not a hard modal
      setTimeout(() => {
        if (!getOpenShift()) {
          toast('Open a shift to track cash float & Z-report', 'fa-unlock');
        }
      }, 1200);
    } catch (_) {}
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
    const lines = (items || []).map((i) => {
      const n = i.note || i.notes || '';
      return `<div class="kot-item"><span class="kq">${esc(i.qty)}×</span><span>${esc(i.name)}${n ? `<div style="font-size:11px;font-weight:600;color:#b45309;margin-top:2px">※ ${esc(n)}</div>` : ''}</span></div>`;
    }).join('');
    const coversN = Math.max(0, Number(m.covers != null ? m.covers : m.pax) || 0);
    const html = `<div style="max-width:280px;margin:0 auto">
      <div class="kot-h"><span class="kt">KOT</span><span>${esc(m.token || m.no || '')}</span></div>
      <div style="font-size:12px;margin-bottom:8px">${esc(m.table || '')} · ${esc(m.orderType || '')}${coversN ? ' · ' + coversN + ' pax' : ''} · ${esc(getStationLabel())}</div>
      ${lines}
      <div style="margin-top:12px;font-size:11px;color:#666">${new Date().toLocaleString()}</div>
    </div>`;
    if (global.RSPrint) RSPrint(html, 'KOT');
  }

  /* ---------------- Bill thermal (ESC/POS or HTML width) ---------------- */
  function outletForPrint() {
    const s = global.RS_SETTINGS || {};
    return {
      name: s.set_business_name || s.set_outlet_name || (session().tenant_name) || 'Outlet',
      address: s.set_address || '',
      phone: s.set_phone || '',
      gstin: s.set_gstin || '',
    };
  }

  function billHasCashTender(bill) {
    if (!bill) return false;
    const tenders = Array.isArray(bill.tenders) ? bill.tenders : [];
    if (tenders.some((t) => /cash/i.test(String(t.method || '')) && Number(t.amount) > 0)) return true;
    const pay = String(bill.pay || bill.paymentMethod || '').toLowerCase();
    return pay === 'cash' || pay.includes('cash');
  }

  async function openCashDrawer() {
    try {
      if (global.RSPrintBridge && typeof RSPrintBridge.openCashDrawer === 'function') {
        const res = await RSPrintBridge.openCashDrawer({});
        if (res && res.ok) {
          toast('Cash drawer opened', 'fa-cash-register');
          return res;
        }
      }
    } catch (e) {
      console.warn('[Drawer] open failed', e);
    }
    // Soft fallback: still useful on web to confirm intent during demos
    return { ok: false };
  }

  /** Thermal must match Bill settled preview (same HTML). Raw ESC/POS is opt-in only. */
  function preferRawEscPosThermal() {
    try {
      const s = global.RS_SETTINGS || {};
      const mode = String(s.set_thermal_mode || s.set_receipt_thermal_mode || '').toLowerCase();
      return mode === 'raw' || mode === 'escpos' || s.set_thermal_raw === true || s.set_thermal_raw === 'true';
    } catch (_) {
      return false;
    }
  }

  function billReceiptPreviewHtml(bill, outlet, qrDataUri) {
    const engine = global.RSReceiptEngine;
    let body = '';
    if (engine && typeof engine.toHTML === 'function') {
      body = engine.toHTML(bill, qrDataUri || null, outlet || outletForPrint());
    } else if (global.RSReceipt && typeof RSReceipt.html === 'function') {
      body = RSReceipt.html(bill, qrDataUri || null);
    } else {
      body = `<div class="rcp-center"><div class="rcp-logo">${esc((outlet && outlet.name) || 'Outlet')}</div></div>
        <hr class="rcp-hr"><div class="rcp-tot"><span>TOTAL</span><span>${esc(String((bill && (bill.grand != null ? bill.grand : bill.amount)) || 0))}</span></div>`;
    }
    const paperSize = (global.RS_SETTINGS && global.RS_SETTINGS.set_paper_size) || '80 mm';
    const maxW = paperSize === '58 mm' ? '220px' : '300px';
    return `<div class="receipt-paper" style="max-width:${maxW};margin:0 auto;box-shadow:none">${body}</div>`;
  }

  async function qrForThermalBill(bill) {
    try {
      if (global.RSReceiptEngine && typeof RSReceiptEngine.qrDataUriFor === 'function') {
        return await RSReceiptEngine.qrDataUriFor(bill);
      }
    } catch (_) {}
    return new Promise((resolve) => {
      try {
        if (!global.QRCode || !bill || !bill.no) return resolve(null);
        const digitalUrl =
          (global.RSReceiptEngine && typeof RSReceiptEngine.digitalBillUrl === 'function')
            ? RSReceiptEngine.digitalBillUrl(bill.no)
            : (() => {
                const slug = sessionStorage.getItem('tenant_slug') || 'outlet';
                return `https://restrosuite.codearc.co.in/bill?slug=${encodeURIComponent(slug)}&no=${encodeURIComponent(bill.no)}`;
              })();
        global.QRCode.toDataURL(digitalUrl, { width: 200, margin: 1 }, (err, url) => {
          resolve(err ? null : url);
        });
      } catch (_) {
        resolve(null);
      }
    });
  }

  async function printBillThermal(bill) {
    if (!bill) {
      toast('No bill to print', 'fa-circle-exclamation');
      return { ok: false };
    }
    const outlet = outletForPrint();

    // Optional: pure raw ESC/POS (plain text) only when settings force it
    if (preferRawEscPosThermal()) {
      try {
        if (global.RSPrintBridge && typeof RSPrintBridge.printBillEscPos === 'function') {
          const res = await RSPrintBridge.printBillEscPos(bill, outlet, { raw: true });
          if (res && res.ok) {
            toast('Thermal receipt sent (raw)', 'fa-print');
            return res;
          }
        }
      } catch (e) {
        console.warn('[Thermal] raw escpos failed', e);
      }
    }

    // Default: same formatted preview as Bill settled (includes QR when available)
    try {
      const qr = await qrForThermalBill(bill);
      const html = billReceiptPreviewHtml(bill, outlet, qr);
      const title = 'Receipt ' + (bill.no || bill.orderId || '');
      if (global.RSPrintBridge && typeof RSPrintBridge.printHtml === 'function') {
        const res = await RSPrintBridge.printHtml(html, title, { silent: true });
        if (res && res.ok) {
          toast('Thermal print — same as preview', 'fa-receipt');
          return { ok: true, mode: res.mode || 'html-thermal', ...res };
        }
      }
      if (global.RSPrint) {
        RSPrint(html, title);
        toast('Print opened — same format as preview', 'fa-print');
        return { ok: true, mode: 'html' };
      }
      if (global.RSReceipt && typeof RSReceipt.print === 'function') {
        await RSReceipt.print(bill);
        toast('Print opened — same format as preview', 'fa-print');
        return { ok: true, mode: 'html' };
      }
    } catch (e) {
      console.warn('[Thermal] formatted html print failed', e);
    }

    // Last resort: raw ESC/POS text (unformatted) if HTML path unavailable
    try {
      if (global.RSPrintBridge && typeof RSPrintBridge.printBillEscPos === 'function') {
        const res = await RSPrintBridge.printBillEscPos(bill, outlet, {});
        if (res && res.ok) {
          toast('Thermal sent as plain text (fallback)', 'fa-print');
          return res;
        }
      }
    } catch (e) {
      console.warn('[Thermal] escpos fallback failed', e);
    }
    toast('Could not print receipt', 'fa-circle-exclamation');
    return { ok: false };
  }

  /* ---------------- New QR order alerts (sound + toast) ---------------- */
  const SEEN_PENDING_KEY = 'rs_seen_pending_order_ids';
  let floorAlertBooted = false;
  const seenPendingIds = new Set();
  let floorAudioCtx = null;

  function loadSeenPending() {
    try {
      const raw = sessionStorage.getItem(SEEN_PENDING_KEY);
      if (!raw) return;
      JSON.parse(raw).forEach((id) => seenPendingIds.add(String(id)));
    } catch (_) {}
  }

  function saveSeenPending() {
    try {
      sessionStorage.setItem(SEEN_PENDING_KEY, JSON.stringify([...seenPendingIds].slice(-200)));
    } catch (_) {}
  }

  function unlockFloorAudio() {
    try {
      const Ctx = global.AudioContext || global.webkitAudioContext;
      if (!Ctx) return;
      if (!floorAudioCtx) floorAudioCtx = new Ctx();
      if (floorAudioCtx.state === 'suspended') floorAudioCtx.resume().catch(() => {});
    } catch (_) {}
  }

  function playFloorChime() {
    try {
      const mute = localStorage.getItem('rs_service_alert_mute') === '1';
      if (mute) return;
      const Ctx = global.AudioContext || global.webkitAudioContext;
      if (!Ctx) return;
      if (!floorAudioCtx) floorAudioCtx = new Ctx();
      const ctx = floorAudioCtx;
      if (ctx.state === 'suspended') {
        ctx.resume().catch(() => {});
        return;
      }
      // Rising three-tone "new order" (distinct from waiter ding-dong)
      [[880, 0], [1174.7, 0.12], [1396.9, 0.24]].forEach(([freq, delay]) => {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = 'sine';
        osc.frequency.value = freq;
        const t0 = ctx.currentTime + delay;
        gain.gain.setValueAtTime(0.0001, t0);
        gain.gain.exponentialRampToValueAtTime(0.18, t0 + 0.02);
        gain.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.28);
        osc.connect(gain).connect(ctx.destination);
        osc.start(t0);
        osc.stop(t0 + 0.32);
      });
    } catch (_) {}
  }

  function tableLabelFromOrder(o) {
    const raw = String((o && o.table) || '').trim();
    if (!raw) return '—';
    const parts = raw.split('-');
    return parts.length > 1 ? parts[parts.length - 1] : raw.replace(/^table\s*/i, '') || raw;
  }

  function checkNewPendingOrders() {
    const orders = (global.RS && Array.isArray(RS.QR_ORDERS) ? RS.QR_ORDERS : []) || [];
    const pending = orders.filter((o) => String(o.status || '').toLowerCase() === 'pending');
    const ids = pending.map((o) => String(o.id || o.orderId || '')).filter(Boolean);

    if (!floorAlertBooted) {
      floorAlertBooted = true;
      ids.forEach((id) => seenPendingIds.add(id));
      saveSeenPending();
      return;
    }

    const fresh = pending.filter((o) => {
      const id = String(o.id || o.orderId || '');
      return id && !seenPendingIds.has(id);
    });
    if (!fresh.length) return;

    fresh.forEach((o) => seenPendingIds.add(String(o.id || o.orderId)));
    // Drop ids no longer pending so re-orders of same id can alert later
    const live = new Set(ids);
    [...seenPendingIds].forEach((id) => {
      if (!live.has(id) && !pending.some((p) => String(p.id || p.orderId) === id)) {
        // keep history for session; do not prune aggressively
      }
    });
    saveSeenPending();

    playFloorChime();
    try {
      if (navigator.vibrate) navigator.vibrate([180, 80, 180]);
    } catch (_) {}

    const first = fresh[0];
    const tbl = tableLabelFromOrder(first);
    const label =
      fresh.length === 1
        ? `New QR order · Table ${tbl}`
        : `${fresh.length} new QR orders`;

    const openQr = () => {
      if (global.RS && typeof RS.activateTab === 'function') RS.activateTab('qr-orders-tab');
    };
    if (typeof global.__toast === 'function') {
      global.__toast(label + ' — tap to open', 'fa-bell', openQr);
    } else {
      toast(label, 'fa-bell');
    }

    try {
      if (!document.title.startsWith('🔔')) {
        const prev = document.title;
        document.title = '🔔 ' + label + ' · ' + prev.replace(/^🔔\s*/, '');
        setTimeout(() => {
          try {
            document.title = prev;
          } catch (_) {}
        }, 8000);
      }
    } catch (_) {}
  }

  function installFloorOrderAlerts() {
    if (global.__rsFloorOrderAlerts) return;
    global.__rsFloorOrderAlerts = true;
    loadSeenPending();
    document.addEventListener('rs:pending_orders_synced', () => {
      try {
        checkNewPendingOrders();
      } catch (_) {}
    });
    document.addEventListener('pointerdown', unlockFloorAudio, { once: true, capture: true });
    document.addEventListener('keydown', unlockFloorAudio, { once: true, capture: true });
  }

  /* ---------------- Boot ---------------- */
  function refreshOpsUi() {
    try {
      paintStationChip();
    } catch (_) {}
    try {
      paintShiftBar();
    } catch (_) {}
    try {
      paintOwnerStrip();
    } catch (_) {}
    try {
      ensurePosQuickTools();
    } catch (_) {}
    try {
      paintStockBanner();
    } catch (_) {}
    try {
      enhanceBillsPaging();
    } catch (_) {}
    try {
      maybePromptOpenShift();
    } catch (_) {}
  }

  function publishRsOps() {
    global.RSOps = {
      getStationId,
      getStationLabel,
      setStationLabel,
      openShift,
      closeShift,
      getOpenShift,
      summarizeShift,
      addCashMovement,
      openCashMovementModal,
      sumCashMovements,
      zReportHtml,
      zReportCsv,
      downloadZCsv,
      exportDayPackCsv,
      getZScope,
      setZScope,
      showZReportModal,
      printKotThermal,
      printBillThermal,
      openCashDrawer,
      billHasCashTender,
      checkNewPendingOrders,
      compilePreferredPdf,
      decorateBillMeta,
      estimateCartStockIssues,
      refresh: refreshOpsUi,
    };
  }

  function boot() {
    // Always refresh API surface (so reloading after critical.bundle picks up thermal fixes)
    publishRsOps();
    if (global.__rsCompetitiveOpsBooted) {
      try { refreshOpsUi(); } catch (_) {}
      return;
    }
    global.__rsCompetitiveOpsBooted = true;

    installKeyboard();
    installCheckoutHooks();
    installPdfPreference();
    enhanceDuesHint();
    installShiftNudge();
    installFloorOrderAlerts();
    try {
      wirePromoUi();
    } catch (_) {}
    refreshOpsUi();

    document.addEventListener('rs:hydrated', () => {
      installCheckoutHooks();
      installPdfPreference();
      installFloorOrderAlerts();
      refreshOpsUi();
    });
    document.addEventListener('rs:bill-paid', (ev) => {
      setTimeout(refreshOpsUi, 200);
      const bill = ev && ev.detail && ev.detail.bill;
      try {
        const s = global.RS_SETTINGS || {};
        // Wire Settings → Auto-print receipt → thermal (formatted preview)
        const auto =
          s.set_auto_print_receipt === true ||
          s.set_auto_print_receipt === 'true' ||
          s.set_auto_print_receipt === 1;
        if (auto && bill) {
          setTimeout(() => {
            if (global.RSOps && typeof RSOps.printBillThermal === 'function') {
              RSOps.printBillThermal(bill).catch(() => {});
            }
          }, 450);
        }
        // Cash drawer pulse when cash was taken (or setting always on for any pay)
        const drawerOn =
          s.set_open_cash_drawer_on_cash !== false &&
          s.set_open_cash_drawer_on_cash !== 'false';
        if (drawerOn && bill && billHasCashTender(bill)) {
          setTimeout(() => openCashDrawer(), 200);
        }
      } catch (_) {}
    });
    window.addEventListener('rs:sync-queue-changed', () => {
      setTimeout(refreshOpsUi, 100);
    });
    window.addEventListener('online', () => setTimeout(refreshOpsUi, 300));
    window.addEventListener('offline', () => setTimeout(refreshOpsUi, 100));
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
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', () => setTimeout(boot, 600));
  else setTimeout(boot, 600);
})(typeof window !== 'undefined' ? window : globalThis);
