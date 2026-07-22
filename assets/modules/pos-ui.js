/* ============================================================
   RestroSuite — POS cart / menu grid / init (Wave 11 code-split)
   Owns cart state; dashboard + features-pos use RS.* APIs.
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
  function getMenu() {
    return (global.RS && Array.isArray(RS.MENU) ? RS.MENU : []) || [];
  }

  /** Calm cart chrome: hide pay/KOT/hold until there is at least one line */
  function updatePosCartChrome(isEmpty) {
    const cartEl = document.querySelector('#pos-tab .pos-cart') || document.querySelector('.pos-cart');
    const zone = document.getElementById('cart-pay-zone');
    const hint = document.getElementById('cart-empty-hint');
    const more = document.getElementById('cart-more-opts');
    if (cartEl) cartEl.classList.toggle('pos-cart-empty', !!isEmpty);
    if (zone) {
      zone.hidden = !!isEmpty;
      zone.setAttribute('aria-hidden', isEmpty ? 'true' : 'false');
      zone.style.display = isEmpty ? 'none' : '';
    }
    if (hint) {
      hint.hidden = !isEmpty;
      hint.style.display = isEmpty ? 'block' : 'none';
    }
    if (more) {
      // Keep discount/tip collapsed chrome quiet when empty
      if (isEmpty) more.open = false;
    }
    document.getElementById('pos-tab')?.classList.toggle('pos-cart-is-empty', !!isEmpty);
  }

  function maskPhoneForChip(phone) {
    const d = String(phone || '').replace(/\D/g, '');
    if (d.length < 4) return phone || '';
    if (d.length <= 10) return '··' + d.slice(-4);
    return '··' + d.slice(-4);
  }

  function syncCartCustomerChrome() {
    const btn = document.getElementById('cart-cust-toggle');
    const panel = document.getElementById('cart-cust-direct-inputs');
    const label = document.getElementById('cart-cust-toggle-label');
    const clearBtn = document.getElementById('cart-cust-clear');
    if (!btn || !panel) return;
    const name = ((document.getElementById('cust-input-name') || {}).value || '').trim();
    const phone = ((document.getElementById('cust-input-phone') || {}).value || '').trim();
    const hasCust = !!(name || phone);
    const open = btn.getAttribute('aria-expanded') === 'true';
    btn.classList.toggle('has-customer', hasCust);
    btn.classList.toggle('is-walkin', !hasCust);
    btn.classList.toggle('is-open', open);
    const hint = btn.querySelector('.cart-cust-hint');
    if (hint) hint.style.display = hasCust ? 'none' : '';
    if (label) {
      if (hasCust) {
        const phoneBit = phone ? maskPhoneForChip(phone) : '';
        label.textContent = (name || 'Guest') + (phoneBit ? ' · ' + phoneBit : '');
      } else {
        label.textContent = open ? 'Add details' : 'Walk-in';
      }
    }
    if (clearBtn) {
      clearBtn.hidden = !hasCust;
      clearBtn.style.display = hasCust ? '' : 'none';
    }
  }

  function setCartCustomerPanelOpen(open) {
    const btn = document.getElementById('cart-cust-toggle');
    const panel = document.getElementById('cart-cust-direct-inputs');
    if (!btn || !panel) return;
    btn.setAttribute('aria-expanded', open ? 'true' : 'false');
    if (open) {
      panel.hidden = false;
      panel.removeAttribute('hidden');
      panel.classList.add('is-open');
      panel.style.display = '';
      panel.style.pointerEvents = 'auto';
      panel.style.visibility = 'visible';
    } else {
      panel.hidden = true;
      panel.setAttribute('hidden', '');
      panel.classList.remove('is-open');
      panel.style.display = '';
      panel.style.pointerEvents = 'none';
      panel.style.visibility = 'hidden';
      const pop = document.getElementById('cust-search-popover');
      if (pop) {
        pop.style.display = 'none';
        pop.innerHTML = '';
      }
      // Blur phone widgets so country picker cannot keep intercepting cart clicks
      try {
        document.getElementById('cust-input-name')?.blur();
        document.getElementById('cust-input-phone')?.blur();
      } catch (_) {}
    }
    btn.classList.toggle('is-open', open);
    syncCartCustomerChrome();
  }

  function clearCartCustomer() {
    const sel = document.getElementById('cart-customer-sel');
    const nameEl = document.getElementById('cust-input-name');
    const phoneEl = document.getElementById('cust-input-phone');
    if (nameEl) nameEl.value = '';
    if (phoneEl) phoneEl.value = '';
    if (sel) {
      const tempOpt = sel.querySelector('option[data-temp="true"]');
      if (tempOpt) tempOpt.remove();
      sel.value = '';
      try { sel.dispatchEvent(new Event('change', { bubbles: true })); } catch (_) {}
    }
    const banner = document.getElementById('cart-customer-dues-banner');
    if (banner) {
      banner.style.display = 'none';
      banner.innerHTML = '';
    }
    setCartCustomerPanelOpen(false);
    syncCartCustomerChrome();
  }

  function wireCartCustomerToggle() {
    const btn = document.getElementById('cart-cust-toggle');
    const panel = document.getElementById('cart-cust-direct-inputs');
    if (!btn || !panel || btn.dataset.bound === '1') return;
    btn.dataset.bound = '1';

    // Ensure clear control sits beside toggle (chip row)
    if (!document.getElementById('cart-cust-clear')) {
      const clear = document.createElement('button');
      clear.type = 'button';
      clear.id = 'cart-cust-clear';
      clear.className = 'cart-cust-clear';
      clear.title = 'Clear customer';
      clear.setAttribute('aria-label', 'Clear customer');
      clear.innerHTML = '<i class="fa-solid fa-xmark"></i>';
      clear.hidden = true;
      clear.style.display = 'none';
      const row = btn.closest('.cart-cust-row') || btn.parentElement;
      if (row) row.appendChild(clear);
      else btn.insertAdjacentElement('afterend', clear);
      clear.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        clearCartCustomer();
        toast('Walk-in customer', 'fa-user');
      });
    }

    btn.addEventListener('click', () => {
      const open = btn.getAttribute('aria-expanded') !== 'true';
      setCartCustomerPanelOpen(open);
      if (open) setTimeout(() => document.getElementById('cust-input-name')?.focus(), 40);
    });
    ['cust-input-name', 'cust-input-phone'].forEach((id) => {
      document.getElementById(id)?.addEventListener('input', syncCartCustomerChrome);
    });
    // Clicking cart lines / pay foot closes customer so phone picker never blocks qty
    if (!document.body.dataset.cartCustOutsideBound) {
      document.body.dataset.cartCustOutsideBound = '1';
      document.addEventListener(
        'pointerdown',
        (e) => {
          const t = e.target;
          if (!t || !t.closest) return;
          if (t.closest('#custom-customer-widget')) return;
          if (t.closest('#cart-items, .cart-foot, #pos-grid, .order-type-btn')) {
            const open = btn.getAttribute('aria-expanded') === 'true';
            if (open) setCartCustomerPanelOpen(false);
          }
        },
        true
      );
    }
    // Stay collapsed by default (walk-in path).
    setCartCustomerPanelOpen(false);
  }
  function catColor(c) {
    if (global.RS && typeof RS.catColor === 'function') return RS.catColor(c);
    return 'var(--orange)';
  }
  function stockLabelMap() {
    return (global.RS && RS.stockLabel) || { ok: 'In stock', low: 'Low', out: 'Out' };
  }
  function stockClsMap() {
    return (global.RS && RS.stockCls) || { ok: 'stock-ok', low: 'stock-low', out: 'stock-out' };
  }
  function activateTab(id) {
    if (global.RS && typeof RS.activateTab === 'function') return RS.activateTab(id);
  }

  /* ---- Happy hour (time-window menu pricing) ---- */
  function parseHHMM(str) {
    const m = String(str || '').trim().match(/^(\d{1,2}):(\d{2})$/);
    if (!m) return null;
    const h = Number(m[1]);
    const mi = Number(m[2]);
    if (h > 23 || mi > 59) return null;
    return h * 60 + mi;
  }
  function isHappyHourActive() {
    const s = global.RS_SETTINGS || {};
    if (!(s.set_happy_hour === true || s.set_happy_hour === 'true')) return false;
    const start = parseHHMM(s.set_happy_hour_start || '17:00');
    const end = parseHHMM(s.set_happy_hour_end || '20:00');
    if (start == null || end == null) return false;
    const now = new Date();
    const cur = now.getHours() * 60 + now.getMinutes();
    // Support overnight windows (e.g. 22:00–02:00)
    if (start <= end) return cur >= start && cur < end;
    return cur >= start || cur < end;
  }
  function happyHourPct() {
    const n = Number((global.RS_SETTINGS || {}).set_happy_hour_pct);
    return Number.isFinite(n) && n > 0 && n <= 90 ? n : 15;
  }
  function effectiveMenuPrice(m) {
    if (!m) return 0;
    const base = Number(m.price) || 0;
    if (!isHappyHourActive()) return base;
    if (m.happyHourPrice != null && m.happy_hour_price != null) {
      const hp = Number(m.happyHourPrice != null ? m.happyHourPrice : m.happy_hour_price);
      if (Number.isFinite(hp) && hp >= 0) return hp;
    }
    if (m.happyHourPrice != null) {
      const hp = Number(m.happyHourPrice);
      if (Number.isFinite(hp) && hp >= 0) return hp;
    }
    const pct = happyHourPct();
    return Math.round(base * (1 - pct / 100) * 100) / 100;
  }
  function paintHappyHourBanner() {
    const posTab = document.getElementById('pos-tab');
    if (!posTab) return;
    let ban = document.getElementById('rs-happy-hour-banner');
    const active = isHappyHourActive();
    if (!active) {
      if (ban) ban.style.display = 'none';
      return;
    }
    const s = global.RS_SETTINGS || {};
    const end = s.set_happy_hour_end || '20:00';
    const pct = happyHourPct();
    if (!ban) {
      ban = document.createElement('div');
      ban.id = 'rs-happy-hour-banner';
      ban.setAttribute('role', 'status');
      ban.style.cssText =
        'margin:0 0 10px;padding:8px 12px;border-radius:10px;border:1px solid rgba(255,79,0,.35);background:rgba(255,79,0,.1);font-size:12.5px;font-weight:700;color:var(--text);display:flex;align-items:center;gap:8px';
      const grid = document.getElementById('pos-grid');
      if (grid && grid.parentNode) grid.parentNode.insertBefore(ban, grid);
      else posTab.insertBefore(ban, posTab.firstChild);
    }
    ban.style.display = 'flex';
    ban.innerHTML = `<i class="fa-solid fa-bolt" style="color:var(--orange)"></i> Happy Hour · ${pct}% off menu until ${esc(end)}`;
  }

let activeCat='All', cart=[], discountPct=0, tipAmount=0, loyaltyRedeem=0, loyaltyPointsUsed=0;
/** @type {{ code: string, pct: number, fixed: number, title: string, offerId: string|null }} */
let activePromo = { code: '', pct: 0, fixed: 0, title: '', offerId: null };
const renderPOS = () => {
  paintHappyHourBanner();
  const grid = $('#pos-grid');
  if (!grid) return;
  const q = ($('#pos-search-input')?.value||'').toLowerCase();
  const sortMode = ($('#pos-sort-select') && $('#pos-sort-select').value) || 'popular';
  let items = getMenu().filter(m=>{
    const mc = ((m.cat || '').trim() || 'Uncategorized').toLowerCase();
    if (activeCat === '__specials__') {
      return !!(m.isSpecial || m.special) && (m.name||'').toLowerCase().includes(q);
    }
    if (activeCat === '__staples__') {
      const staple = !!(m.isStaple || m.staple) || /roti|chapati|naan|rice|paratha/i.test(String(m.name||''));
      return staple && (m.name||'').toLowerCase().includes(q);
    }
    return (activeCat==='All'||mc===String(activeCat).toLowerCase()) && (m.name||'').toLowerCase().includes(q);
  });
  if (global.RSMenuIntel && typeof RSMenuIntel.sortMenu === 'function') {
    items = RSMenuIntel.sortMenu(items, sortMode);
  } else if (sortMode === 'popular' || sortMode === 'default') {
    items = items.slice().sort((a, b) => (Number(b.orderCount)||0) - (Number(a.orderCount)||0) || String(a.name||'').localeCompare(String(b.name||'')));
  } else if (sortMode === 'name-asc') {
    items = items.slice().sort((a, b) => String(a.name||'').localeCompare(String(b.name||'')));
  } else if (sortMode === 'name-desc') {
    items = items.slice().sort((a, b) => String(b.name||'').localeCompare(String(a.name||'')));
  } else if (sortMode === 'price-asc') {
    items = items.slice().sort((a, b) => (Number(a.price)||0) - (Number(b.price)||0));
  } else if (sortMode === 'price-desc') {
    items = items.slice().sort((a, b) => (Number(b.price)||0) - (Number(a.price)||0));
  } else if (sortMode === 'veg-first') {
    items = items.slice().sort((a, b) => (b.veg?1:0) - (a.veg?1:0));
  } else if (sortMode === 'nonveg-first') {
    items = items.slice().sort((a, b) => (a.veg?1:0) - (b.veg?1:0));
  }
  // Search miss → always offer custom item
  const showCustomCta = !!q && !items.length;
  const hh = isHappyHourActive();
  // 10/10 card: veg + name + price. Category only on All/search. Stock only low/out.
  const showCat = activeCat === 'All' || activeCat === '__specials__' || activeCat === '__staples__' || !!q;
  grid.innerHTML = (showCustomCta
    ? `<div class="pos-item" id="pos-custom-miss" style="border:1.5px dashed var(--orange);grid-column:1/-1;min-height:72px;display:flex;align-items:center;justify-content:center;gap:10px;cursor:pointer">
        <i class="fa-solid fa-pen-to-square" style="color:var(--orange)"></i>
        <span style="font-weight:700">No match for “${_e(q)}” — add custom item with price</span>
      </div>`
    : '') + items.map(m=>{
    const inCart = cart.find(c=>String(c.id)===String(m.id));
    const base = Number(m.price) || 0;
    const eff = effectiveMenuPrice(m);
    const stock = m.stock || 'ok';
    const deal = hh && eff < base;
    const showStock = stock === 'low' || stock === 'out';
    const priceHtml = deal
      ? `<span class="pprice pprice-deal">${rs(eff)} <small class="pprice-was">${rs(base)}</small></span>`
      : `<span class="pprice">${rs(base)}</span>`;
    const badges = [
      m.isSpecial || m.special ? '<span class="pos-hh-chip" style="background:#7c3aed">Special</span>' : '',
      m.bestseller ? '<span class="pos-hh-chip">Best</span>' : '',
      m.isStaple || m.staple ? '<span class="pos-hh-chip" style="background:#0891b2">Staple</span>' : '',
    ].join('');
    return `
    <div class="pos-item ${stock==='out'?'out':''} ${inCart?'in-cart':''}${deal ? ' hh-deal' : ''}" data-id="${_e(m.id)}" style="--cc:${catColor(m.cat)}">
      ${inCart ? `<div class="pos-item-qty-badge bounce-scale" aria-label="${inCart.qty} in cart">${inCart.qty}</div>` : ''}
      <div class="pi-top">
        <span class="veg ${m.veg ? '' : 'nonveg'}" title="${m.veg ? 'Veg' : 'Non-veg'}" aria-hidden="true"></span>
        ${showCat ? `<span class="picat">${_e(m.cat || 'Uncategorized')}</span>` : ''}
      </div>
      <div class="pname">${_e(m.name)}</div>
      <div class="prow">
        ${priceHtml}
        ${showStock ? `<span class="stock-dot ${stockClsMap()[stock]}">${stockLabelMap()[stock]}</span>` : ''}
        ${deal ? `<span class="pos-hh-chip">HH</span>` : ''}
        ${badges}
      </div>
    </div>`;
  }).join('');
  $$('.pos-item', grid).forEach(el=> {
    if (el.id === 'pos-custom-miss') {
      el.addEventListener('click', () => {
        if (global.RSMenuIntel && RSMenuIntel.openCustomCartItem) {
          RSMenuIntel.openCustomCartItem({ name: q });
        }
      });
      return;
    }
    el.addEventListener('click', ()=> addToCartSmart(el.dataset.id));
  });
};
async function addToCartSmart(id) {
  const m = getMenu().find(x => String(x.id) === String(id));
  if (!m) return;
  // Add-ons
  let addons = [];
  try {
    if (global.RSMenuIntel && RSMenuIntel.itemAddons && RSMenuIntel.itemAddons(m).length) {
      addons = await RSMenuIntel.promptAddons(m);
    }
  } catch (_) {}
  addToCart(id);
  // Attach add-on lines
  if (addons && addons.length) {
    addons.forEach((a) => {
      cart.push({
        id: 'addon-' + id + '-' + a.name,
        name: a.name + ' (add-on)',
        price: Number(a.price) || 0,
        qty: 1,
        veg: true,
        cat: 'Add-on',
        isAddon: true,
        parentId: id,
        stock: 'ok',
      });
    });
    renderCart();
  }
  // Water pairing for roti/chapati etc.
  try {
    if (sessionStorage.getItem('rs_skip_water_prompt') === '1') return;
    if (global.RSMenuIntel && RSMenuIntel.promptWaterPairing) {
      const w = await RSMenuIntel.promptWaterPairing(m);
      if (w) {
        if (w.free || !(Number(w.price) > 0)) {
          // complimentary — note on line only
          const line = cart.find(c => String(c.id) === String(id));
          if (line) {
            line.note = (line.note ? line.note + ' · ' : '') + 'Normal water';
            renderCart();
          }
        } else {
          cart.push({
            id: 'water-bottle-' + Date.now(),
            name: w.name,
            price: Number(w.price) || 0,
            qty: 1,
            veg: true,
            cat: 'Beverages',
            isWater: true,
            stock: 'ok',
          });
          renderCart();
          toast(w.name + ' added', 'fa-glass-water');
        }
      }
    }
  } catch (_) {}
}
function refreshPosCats(){
  const catsEl = $('#pos-cats');
  if (!catsEl) return;
  const menu = getMenu();
  const hasSpecials = menu.some(m => m.isSpecial || m.special);
  const hasStaples = menu.some(m => m.isStaple || m.staple || /roti|chapati|naan|rice|paratha/i.test(String(m.name||'')));
  const liveCats = ['All']
    .concat(hasSpecials ? ['__specials__'] : [])
    .concat(hasStaples ? ['__staples__'] : [])
    .concat(Array.from(new Set(
      menu.map(m => (m.cat || '').trim() || 'Uncategorized')
    )).sort((a, b) => a.localeCompare(b)));
  const catLabel = (c) => c === '__specials__' ? '★ Specials' : c === '__staples__' ? '🍚 Staples' : c;
  if (!liveCats.some(c => String(c).toLowerCase() === String(activeCat).toLowerCase())) activeCat = 'All';
  catsEl.innerHTML = liveCats.map(c=>`<button class="pos-cat-btn ${String(c).toLowerCase()===String(activeCat).toLowerCase()?'active':''}" data-cat="${_e(c)}">${_e(catLabel(c))}</button>`).join('');
  $$('#pos-cats .pos-cat-btn').forEach(b=> b.addEventListener('click',()=>{
    activeCat=b.dataset.cat;
    $$('#pos-cats .pos-cat-btn').forEach(x=>x.classList.toggle('active',x===b));
    renderPOS();
    const container = document.getElementById('pos-cats');
    if (container) {
      container.scrollTo({
        left: (b.offsetLeft + b.clientWidth / 2) - container.clientWidth / 2,
        behavior: 'smooth'
      });
    }
  }));
}
window.refreshPosCats = refreshPosCats;
let lastMobileCartOpenAt = 0;
function updateMobileCartBar(countArg, totalsArg){
  const barCount = $('#pos-m-cart-bar-count');
  const barTotal = $('#pos-m-cart-bar-total');
  const cartBar = $('#pos-m-cart-bar');
  if (!barCount || !barTotal || !cartBar) return;
  const count = countArg != null ? countArg : cart.reduce((a,c)=>a+c.qty,0);
  const totals = totalsArg || getTotals();
  barCount.textContent = count + (count === 1 ? ' item' : ' items');
  barTotal.textContent = rs(totals.grand);
  const posActive = !!document.querySelector('#pos-tab.active');
  const cartViewOpen = !!document.querySelector('.pos-cart.active');
  const shouldShow = count > 0 && window.innerWidth <= 1024 && posActive && !cartViewOpen;
  cartBar.classList.toggle('hidden', !shouldShow);
}
function openMobilePOSCart(e){
  if (e) {
    e.preventDefault();
    e.stopPropagation();
  }
  const now = Date.now();
  if (now - lastMobileCartOpenAt < 250) return;
  lastMobileCartOpenAt = now;
  if (window.innerWidth > 1024 || !cart.length) return;
  const posLeft = $('.pos-left');
  const posCart = $('.pos-cart');
  const cartBar = $('#pos-m-cart-bar');
  if (!posLeft || !posCart || !cartBar) return;
  posLeft.classList.add('hidden');
  posCart.classList.add('active', 'rs10-cart-sheet');
  cartBar.classList.add('hidden');
  // Lock page scroll so only the cart sheet scrolls (not menu behind)
  document.body.classList.add('rs10-cart-open', 'pos-mobile-cart-open');
  try {
    const items = posCart.querySelector('#cart-items, .cart-items');
    if (items) items.scrollTop = 0;
  } catch (_) {}
}
function closeMobilePOSCart(showBar = true){
  const posLeft = $('.pos-left');
  const posCart = $('.pos-cart');
  const cartBar = $('#pos-m-cart-bar');
  if (!posLeft || !posCart || !cartBar) return;
  posLeft.classList.remove('hidden');
  posCart.classList.remove('active', 'rs10-cart-sheet');
  document.body.classList.remove('rs10-cart-open', 'pos-mobile-cart-open');
  if (showBar) updateMobileCartBar();
  else cartBar.classList.add('hidden');
}
function bindMobileCartBar(){
  const cartBar = $('#pos-m-cart-bar');
  if (!cartBar || cartBar.dataset.rsBound) return;
  cartBar.dataset.rsBound = '1';
  cartBar.addEventListener('click', openMobilePOSCart);
  cartBar.addEventListener('pointerup', openMobilePOSCart);
  cartBar.addEventListener('keydown', e => {
    if (e.key === 'Enter' || e.key === ' ') openMobilePOSCart(e);
  });
}
function addToCart(id, opts){
  opts = opts || {};
  const m=getMenu().find(x=>String(x.id)===String(id));
  if (!m) return;
  const portion = opts.portion != null ? Number(opts.portion) : 1; // 0.5 half · 1 full · 2 double
  const pFactor = portion > 0 ? portion : 1;
  // Harder recipe/cost/stock checks
  try {
    const health =
      global.RSRecipeUnits && RSRecipeUnits.recipeHealth
        ? RSRecipeUnits.recipeHealth(m, INVENTORY)
        : null;
    if (health && !health.ok) {
      if (health.code === 'no_recipe') {
        if (global.RSKitchenLinkCoach && typeof RSKitchenLinkCoach.posUnlinkedHint === 'function') {
          RSKitchenLinkCoach.posUnlinkedHint(m.name);
        } else {
          toast('“' + m.name + '” has no recipe — stock will not reduce', 'fa-link');
        }
      } else if (health.code === 'no_cost') {
        toast('Recipe cost incomplete — set unit costs on stock', 'fa-indian-rupee-sign');
      } else if (health.code === 'missing_stock') {
        toast('Recipe stock missing: ' + (health.missing || []).slice(0, 2).join(', '), 'fa-triangle-exclamation');
      }
    }
    if (Array.isArray(m.ingredients) && m.ingredients.length && INVENTORY.length) {
      const short = m.ingredients.filter(ing => {
        let need = Number(ing.qty) || 0;
        if (global.RSRecipeUnits && RSRecipeUnits.deductQtyForIngredient) {
          need = RSRecipeUnits.deductQtyForIngredient(ing, m, 1, pFactor, INVENTORY);
        } else {
          const base = Math.max(1, Number(m.recipeServings) || 1);
          need = (need / base) * pFactor;
        }
        const inv = INVENTORY.find(i => i.name === ing.name);
        return inv && (Number(inv.stock) || 0) < need;
      });
      if (short.length) {
        toast(`Low stock for ${short.map(s => s.name).slice(0,2).join(', ')}`, 'fa-triangle-exclamation');
      }
    }
  } catch (_) {}
  const listPrice = Number(m.price) || 0;
  const effFull = effectiveMenuPrice(m);
  const basePrice = listPrice;
  const price = Math.round(effFull * pFactor * 100) / 100;
  const hh = isHappyHourActive() && effFull < listPrice;
  // Match same dish + same portion + same unit price
  const line = cart.find(
    (c) =>
      String(c.id) === String(id) &&
      Number(c.portion || 1) === pFactor &&
      Number(c.price) === price
  );
  if (line) line.qty++;
  else {
    cart.push({
      ...m,
      qty: 1,
      price,
      basePrice,
      fullPrice: effFull,
      portion: pFactor,
      servings: pFactor, // inventory deduction multiplier
      happyHour: hh,
    });
  }
  renderCart();
  const pLab = pFactor === 0.5 ? '½' : pFactor === 2 ? '×2' : '';
  toast(
    hh
      ? `${m.name} · Happy Hour ${rs(price)}`
      : `${m.name}${pLab ? ' ' + pLab : ''} added`,
    hh ? 'fa-bolt' : 'fa-plus'
  );
}
function changeQty(id,d){
  // Prefer line matching data-line-key if present via event — fallback first match by id
  const line = cart.find((c) => String(c.id) === String(id));
  if (!line) return;
  line.qty += d;
  if (line.qty <= 0) cart = cart.filter((c) => c !== line);
  renderCart();
}
function setLinePortion(lineKey, portion) {
  const p = Number(portion);
  if (!(p > 0)) return;
  const line =
    cart.find((c) => cartLineKey(c) === String(lineKey)) ||
    cart.find((c) => String(c.id) === String(lineKey));
  if (!line) return;
  const full = Number(line.fullPrice != null ? line.fullPrice : line.basePrice != null ? line.basePrice : line.price) || 0;
  line.portion = p;
  line.servings = p;
  line.price = Math.round(full * p * 100) / 100;
  renderCart();
  toast(
    (line.name || 'Item') + (p === 0.5 ? ' · half' : p === 2 ? ' · double' : ' · full'),
    'fa-utensils'
  );
}
function cartLineKey(c) {
  return String(c.id) + '|' + String(c.portion || 1) + '|' + String(c.price);
}
function setLineNote(id, note) {
  const line = cart.find((c) => String(c.id) === String(id));
  if (!line) return false;
  const text = String(note == null ? '' : note).trim().slice(0, 140);
  line.note = text;
  if (!text) delete line.note;
  try {
    renderCart();
  } catch (_) {}
  return true;
}
function getLineNote(id) {
  const line = cart.find((c) => String(c.id) === String(id));
  return line && line.note ? String(line.note) : '';
}
function openLineNoteEditor(id) {
  const line = cart.find((c) => String(c.id) === String(id));
  if (!line) return;
  const chips = ['No onion', 'Extra spicy', 'Less oil', 'Well done', 'No ice', 'Pack separate'];
  if (!global.RSModal) {
    const n = window.prompt('Kitchen note for ' + (line.name || 'item'), line.note || '');
    if (n != null) setLineNote(id, n);
    return;
  }
  global.RSModal.open({
    title: 'Kitchen note',
    sub: line.name || 'Item',
    icon: 'fa-comment',
    size: 'sm',
    body: `<div style="display:flex;flex-direction:column;gap:10px">
      <input type="text" id="line-note-input" class="form-input" maxlength="140" placeholder="e.g. No onion, less spicy…" value="${_e(line.note || '')}" style="width:100%;height:36px;font-size:13px">
      <div style="display:flex;flex-wrap:wrap;gap:6px" id="line-note-chips">
        ${chips
          .map(
            (c) =>
              `<button type="button" class="btn btn-ghost btn-sm" data-chip="${_e(c)}" style="font-size:11px;height:28px;padding:0 10px">${_e(c)}</button>`
          )
          .join('')}
      </div>
      <p style="font-size:11.5px;color:var(--text-soft);margin:0">Prints on KOT / kitchen display and appears under the item on the bill.</p>
    </div>`,
    foot:
      '<button class="btn btn-ghost" style="flex:1" data-ln-clear>Clear</button>' +
      '<button class="btn btn-ghost" style="flex:1" data-ln-x>Cancel</button>' +
      '<button class="btn btn-primary" style="flex:1" data-ln-ok><i class="fa-solid fa-check"></i> Save</button>',
    onMount(m, close) {
      const inp = m.querySelector('#line-note-input');
      m.querySelectorAll('[data-chip]').forEach((btn) => {
        btn.onclick = () => {
          const chip = btn.getAttribute('data-chip') || '';
          if (!inp) return;
          const cur = (inp.value || '').trim();
          if (!cur) inp.value = chip;
          else if (cur.toLowerCase().includes(chip.toLowerCase())) return;
          else inp.value = cur + ', ' + chip;
          inp.focus();
        };
      });
      const x = m.querySelector('[data-ln-x]');
      if (x) x.onclick = close;
      const cl = m.querySelector('[data-ln-clear]');
      if (cl)
        cl.onclick = () => {
          setLineNote(id, '');
          close();
          toast('Note cleared', 'fa-comment');
        };
      const ok = m.querySelector('[data-ln-ok]');
      if (ok)
        ok.onclick = () => {
          setLineNote(id, inp ? inp.value : '');
          close();
          toast(inp && inp.value.trim() ? 'Kitchen note saved' : 'Note cleared', 'fa-comment');
        };
      if (inp) setTimeout(() => { inp.focus(); inp.select?.(); }, 40);
    },
  });
}
function renderCart(){
  const wrap=$('#cart-items'); const count=cart.reduce((a,c)=>a+c.qty,0);
  const countEl = $('#cart-count');
  // Symbol chrome: show count number only (title has "items")
  if (countEl) {
    countEl.textContent = String(count);
    countEl.parentElement && countEl.parentElement.setAttribute('title', count + (count === 1 ? ' item' : ' items'));
  }
  try { syncTablePaxForOrderType(); } catch (_) {}

  const totals = getTotals();
  const isIncl = totals.taxProfile.inclusive_pricing;
  const taxLabel = totals.taxProfile.tax_system || 'GST';
  const settings = window.RS_SETTINGS || {};
  
  // Plain labels — Sub / Tax / Total always scannable (10/10 readability)
  let metaHTML = `<span title="Subtotal">Sub <b id="t-sub">${rs(totals.sub)}</b></span>`;
  if (totals.disc > 0) {
    metaHTML += `<span style="color:var(--orange)" title="Discount">Disc <b id="t-disc">- ${rs(totals.disc)}</b></span>`;
  }
  if (totals.promo > 0) {
    metaHTML += `<span style="color:var(--orange)" title="Promo${totals.promoCode ? ' ' + _e(totals.promoCode) : ''}">Promo <b id="t-promo">- ${rs(totals.promo)}</b></span>`;
  }
  if (totals.serviceCharge > 0) {
    metaHTML += `<span title="Service charge">SC <b id="t-sc">${rs(totals.serviceCharge)}</b></span>`;
  }
  if (totals.tip > 0) {
    metaHTML += `<span style="color:var(--green)" title="Tip">Tip <b id="t-tip">${rs(totals.tip)}</b></span>`;
  }
  if (totals.deliveryCharge > 0) {
    metaHTML += `<span title="Delivery">Del <b id="t-del">${rs(totals.deliveryCharge)}</b></span>`;
  }
  if (totals.loyaltyRedeem > 0) {
    metaHTML += `<span style="color:var(--violet-soft)" title="Loyalty">Pts <b id="t-loyal">- ${rs(totals.loyaltyRedeem)}</b></span>`;
  }
  
  if (totals.taxProfile.gst_scheme === 'composition' && totals.taxProfile.country === 'IN') {
    metaHTML += `<span style="font-size:10px;color:var(--text-mute)" title="Composition scheme">Comp</span>`;
  } else {
    const taxShort = String(taxLabel || 'Tax').length > 4 ? 'Tax' : taxLabel;
    metaHTML += `<span title="${_e(taxLabel)}${isIncl ? ' inclusive' : ''}">${_e(taxShort)}${isIncl ? '*' : ''} <b id="t-gst">${rs(totals.gst)}</b></span>`;
  }
  
  if (totals.liquorTax > 0) {
    metaHTML += `<span title="Liquor tax">Liquor <b id="t-liquor-tax">${rs(totals.liquorTax)}</b></span>`;
  }
  
  const metaDiv = document.querySelector('.totals-meta');
  if (metaDiv) {
    metaDiv.innerHTML = metaHTML;
  }
  
  $('#t-grand').textContent=rs(totals.grand);

  updateMobileCartBar(count, totals);

  if(!cart.length){ wrap.innerHTML=`<div class="cart-empty"><i class="fa-solid fa-cart-shopping"></i><div>Cart is empty<br><span style="font-size:12px">Tap menu items to add them</span></div></div>`; }
  else { wrap.innerHTML = cart.map(c=>{
    const p = Number(c.portion || 1);
    const lk = cartLineKey(c);
    const noRec = !Array.isArray(c.ingredients) || !c.ingredients.length;
    return `
    <div class="cart-line${c.note ? ' has-note' : ''}${noRec ? ' cart-line-norecipe' : ''}" data-line-id="${_e(c.id)}" data-line-key="${_e(lk)}" title="Long-press for kitchen note">
      <div class="cdot" style="--cc:${catColor(c.cat)}"></div>
      <div class="cinfo">
        <div class="cn-row">
          <span class="cn">${_e(c.name)}${c.happyHour ? ' <span class="cart-hh">HH</span>' : ''}${noRec ? ' <span class="cart-nr" title="No recipe — stock won\'t move">⚠</span>' : ''}</span>
          <span class="cp" title="Unit price">${rs(c.price)}${c.happyHour && c.basePrice != null && c.basePrice > c.price ? ' <s class="cp-was">' + rs(c.basePrice) + '</s>' : ''}</span>
        </div>
        <div class="cart-portion" role="group" aria-label="Portion size">
          <button type="button" class="cart-p-btn${p===0.5?' active':''}" data-portion="0.5" data-lk="${_e(lk)}" title="Half portion · half stock">½</button>
          <button type="button" class="cart-p-btn${p===1?' active':''}" data-portion="1" data-lk="${_e(lk)}" title="Full">Full</button>
          <button type="button" class="cart-p-btn${p===2?' active':''}" data-portion="2" data-lk="${_e(lk)}" title="Double · 2× stock">×2</button>
        </div>
        ${c.note ? `<button type="button" class="cnote cart-line-note" data-note-id="${_e(c.id)}" title="Edit kitchen note"><i class="fa-solid fa-comment" aria-hidden="true"></i> ${_e(c.note)}</button>` : ''}
      </div>
      <div class="qty"><button type="button" data-d="-1" data-id="${_e(c.id)}" data-lk="${_e(lk)}" aria-label="Decrease"><i class="fa-solid fa-minus"></i></button><span class="qn">${c.qty}</span><button type="button" data-d="1" data-id="${_e(c.id)}" data-lk="${_e(lk)}" aria-label="Increase"><i class="fa-solid fa-plus"></i></button></div>
      <div class="cline-total">${rs(c.price*c.qty)}</div>
    </div>`;
  }).join('');
    $$('#cart-items .qty button').forEach(b=> b.addEventListener('click',(e)=>{
      e.stopPropagation();
      const lk = b.getAttribute('data-lk');
      const line = lk ? cart.find((c) => cartLineKey(c) === lk) : cart.find((c) => String(c.id) === String(b.dataset.id));
      if (!line) return;
      line.qty += +b.dataset.d;
      if (line.qty <= 0) cart = cart.filter((c) => c !== line);
      renderCart();
    }));
    $$('#cart-items .cart-p-btn').forEach((b) =>
      b.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        setLinePortion(b.getAttribute('data-lk'), b.getAttribute('data-portion'));
      })
    );
    $$('#cart-items .cart-line-note').forEach((b) =>
      b.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        openLineNoteEditor(b.getAttribute('data-note-id'));
      })
    );
    // Long-press / double-click line body → kitchen note (keeps default row clean)
    $$('#cart-items .cart-line').forEach((row) => {
      let pressTimer = null;
      const id = row.getAttribute('data-line-id');
      const startPress = (e) => {
        if (e.target.closest('.qty, .cart-line-note')) return;
        pressTimer = setTimeout(() => {
          pressTimer = null;
          openLineNoteEditor(id);
        }, 480);
      };
      const clearPress = () => {
        if (pressTimer) {
          clearTimeout(pressTimer);
          pressTimer = null;
        }
      };
      row.addEventListener('pointerdown', startPress);
      row.addEventListener('pointerup', clearPress);
      row.addEventListener('pointerleave', clearPress);
      row.addEventListener('pointercancel', clearPress);
      row.addEventListener('dblclick', (e) => {
        if (e.target.closest('.qty, .cart-line-note')) return;
        e.preventDefault();
        openLineNoteEditor(id);
      });
    });
  }

  try { if(window.RSPOS && window.RSPOS.refreshPaymentPanel) window.RSPOS.refreshPaymentPanel(); } catch (e) {}
  wireCartActions();
  try { updatePosCartChrome(cart.length === 0); } catch (e) {}

  // Refresh POS Grid to update card badges
  try { renderPOS(); } catch (e) {}

  // Auto-save active cart to localStorage (per order type)
  try {
    const activeOrderTypeBtn = document.querySelector('.order-type-btn.active');
    const activeOrderType = activeOrderTypeBtn ? activeOrderTypeBtn.textContent.trim() : 'Takeaway';
    // Helper function to get tab key (same as in initPOS)
    const getTabKeyForOrderType = (orderTypeText) => {
      const lowerText = orderTypeText.toLowerCase();
      if (lowerText.includes('delivery')) return 'Delivery';
      if (lowerText.includes('dine')) return 'Dine-in';
      return 'Takeaway';
    };
    const tabKey = getTabKeyForOrderType(activeOrderType);
    const da = document.getElementById('delivery-address');
    const dc = document.getElementById('delivery-charge');
    const dr = document.getElementById('delivery-rider');
    // Save per-order-type cart
    localStorage.setItem('rs_tab_cart_' + tabKey, JSON.stringify({
      items: cart.map(c=>({...c})),
      total: cart.reduce((a,c)=>a+c.price*c.qty,0),
      deliveryAddress: da ? da.value : '',
      deliveryCharge: dc ? dc.value : '',
      deliveryRider: dr ? dr.value : ''
    }));
    // Also save to old key for backwards compatibility
    localStorage.setItem('rs_active_cart', JSON.stringify(cart));
    localStorage.setItem('rs_active_cart_discount', String(discountPct));
    localStorage.setItem('rs_active_cart_tip', String(tipAmount || 0));
    localStorage.setItem('rs_active_cart_customer', JSON.stringify(getCustomer()));
    localStorage.setItem('rs_active_order_type', activeOrderType.toLowerCase());
  } catch (e) {
    console.warn('[Cart Persistence Warning] Failed to persist active cart:', e);
  }

  // Keep Floor table status in sync while cart has dine-in items
  try {
    scheduleFloorOccupancyFromCart();
  } catch (_) {}
}

/** Debounced: cart + table selected → pending_orders so Floor shows Dining everywhere */
let __floorOccTimer = null;
let __floorOccId = null;
function scheduleFloorOccupancyFromCart() {
  if (__floorOccTimer) clearTimeout(__floorOccTimer);
  __floorOccTimer = setTimeout(() => {
    syncFloorOccupancyFromCart().catch((e) =>
      console.warn('[floor occupancy]', e)
    );
  }, 500);
}

async function syncFloorOccupancyFromCart() {
  if (!window.RS_DB || typeof RS_DB.put !== 'function') return;
  let cust = {};
  try {
    cust = typeof getCustomer === 'function' ? getCustomer() : {};
  } catch (_) {
    cust = {};
  }
  const tableRaw = String(cust.table || '').trim();
  if (!tableRaw || /walk-?in|take\s*away|takeaway/i.test(tableRaw)) {
    // Cleared / walk-in: if we own a cart-driven ticket, mark it free by deleting empty or leave
    return;
  }
  // Dine-in only (or table label implies dine-in)
  let isDine = /table/i.test(tableRaw);
  try {
    const btn = document.querySelector('.order-type-btn.active');
    const t = (btn && (btn.textContent || btn.getAttribute('aria-label') || '')) || '';
    if (/dine/i.test(t)) isDine = true;
    if (/take|deliver/i.test(t) && !/dine/i.test(t)) isDine = false;
  } catch (_) {}
  if (!isDine) return;

  const items = (cart || []).map((c) => ({
    id: c.id || c.name,
    name: c.name,
    qty: Number(c.qty) || 1,
    price: Number(c.price) || 0,
    notes: c.note || c.notes || '',
    note: c.note || c.notes || '',
  }));
  if (!items.length) return;

  let totals = { grand: 0, sub: 0, gst: 0, disc: 0 };
  try {
    totals = getTotals() || totals;
  } catch (_) {}

  const dig = (v) => parseInt(String(v == null ? '' : v).replace(/\D/g, ''), 10);
  const tableDig = dig(tableRaw);
  const rows = await RS_DB.list('pending_orders').catch(() => []);
  const active = (rows || []).filter((r) => {
    const tn = String(r.tableNumber || r.table || '');
    const same =
      tn === tableRaw ||
      tn.toLowerCase() === tableRaw.toLowerCase() ||
      (Number.isFinite(tableDig) && dig(tn) === tableDig);
    if (!same) return false;
    const st = String(r.status || '');
    return (
      st === 'DineIn Active' ||
      st === 'Accepted' ||
      st === 'preparing' ||
      st === 'Pending Review' ||
      st === 'Billed' ||
      st === 'Ready' ||
      st === 'served' ||
      r.source === 'floor_seat' ||
      r.source === 'pos_cart'
    );
  });

  // Prefer our cart-driven row, else any seat placeholder, else create
  let row =
    active.find((r) => r.source === 'pos_cart' || (r.id && String(r.id).indexOf('cart_') === 0)) ||
    active.find((r) => r.source === 'floor_seat') ||
    active[0] ||
    null;

  const covers = Math.max(0, Number(cust.covers != null ? cust.covers : 0) || 0);
  if (row && row.id) {
    const next = {
      ...row,
      tableNumber: tableRaw,
      table: tableRaw,
      items,
      subtotal: totals.sub,
      gst: totals.gst,
      total: totals.grand,
      customerName: cust.name || row.customerName || '',
      customerPhone: cust.phone || row.customerPhone || '',
      covers: covers || row.covers || 0,
      pax: covers || row.pax || 0,
      orderType: 'Dine-in',
      // Keep kitchen status if already sent; otherwise show as active on floor
      status:
        row.status === 'Pending Review' ||
        row.status === 'Accepted' ||
        row.status === 'preparing' ||
        row.status === 'Ready' ||
        row.status === 'served' ||
        row.status === 'Billed'
          ? row.status
          : 'DineIn Active',
      source: row.source === 'waiter_pos' || row.source === 'qr' ? row.source : row.source || 'pos_cart',
      dateTime: row.dateTime || new Date().toISOString(),
    };
    await RS_DB.put('pending_orders', row.id, next);
    __floorOccId = row.id;
  } else {
    const id = 'cart_' + Date.now() + '_' + Math.random().toString(36).slice(2, 6);
    const next = {
      id,
      orderId: id,
      tableNumber: tableRaw,
      table: tableRaw,
      status: 'DineIn Active',
      items,
      subtotal: totals.sub,
      gst: totals.gst,
      total: totals.grand,
      customerName: cust.name || '',
      customerPhone: cust.phone || '',
      covers,
      pax: covers,
      orderType: 'Dine-in',
      paymentMethod: 'Cash',
      dateTime: new Date().toISOString(),
      priority: 'normal',
      source: 'pos_cart',
    };
    await RS_DB.put('pending_orders', id, next);
    __floorOccId = id;
  }

  try {
    document.dispatchEvent(new Event('rs:tables-updated'));
  } catch (_) {}
  try {
    if (window.RS_SYNC && typeof RS_SYNC.syncPendingOrders === 'function') {
      RS_SYNC.syncPendingOrders({ forceCloud: true });
    }
  } catch (_) {}
}

function getTotals(){
  const settings = window.RS_SETTINGS || {};
  const taxProfile = window.RS_getTenantTaxProfile ? window.RS_getTenantTaxProfile() : { country: 'IN', tax_system: 'GST', gst_scheme: 'regular', specified_premises: false };
  const country = taxProfile.country;
  
  let channel = 'dine_in';
  const activeTypeBtn = document.querySelector('.order-type-btn.active');
  if (activeTypeBtn) {
    const t = activeTypeBtn.textContent.trim().toLowerCase();
    if (t.includes('dine')) channel = 'dine_in';
    else if (t.includes('take') || t.includes('carry')) channel = 'takeaway';
    else if (t.includes('deliv')) channel = 'delivery';
  }
  
  const calculateTaxesEnabled = settings.set_calculate_taxes !== false;
  const serviceChargeEnabled = settings.set_service_charge === true && channel === 'dine_in';
  const scPctRaw = Number(settings.set_service_charge_pct);
  const serviceChargePct = Number.isFinite(scPctRaw) && scPctRaw >= 0 ? scPctRaw : 5;
  const roundOffEnabled = settings.set_round_off_totals !== false;
  const inclusivePricing = settings.set_inclusive_pricing === true;
  
  const rawSubtotal = cart.reduce((a,c)=>a+c.price*c.qty,0);
  const discAmount = Math.round(rawSubtotal * discountPct / 100);
  const netAfterDiscount = rawSubtotal - discAmount;

  // Delivery fee from cart field (shown for Delivery order type)
  let deliveryCharge = 0;
  try {
    const dcEl = document.getElementById('delivery-charge');
    if (dcEl && (channel === 'delivery' || (Number(dcEl.value) || 0) > 0)) {
      deliveryCharge = Math.max(0, Number(dcEl.value) || 0);
    }
  } catch (_) {}
  
  let serviceChargeAmount = 0;
  if (serviceChargeEnabled && serviceChargePct > 0) {
    serviceChargeAmount = Math.round(netAfterDiscount * (serviceChargePct / 100));
  }
  const tip = Math.max(0, Number(tipAmount) || 0);
  const loyaltyOff = Math.max(0, Number(loyaltyRedeem) || 0);
  let promoOff = 0;
  if (activePromo.fixed > 0) {
    promoOff = Math.min(activePromo.fixed, Math.max(0, netAfterDiscount));
  } else if (activePromo.pct > 0) {
    promoOff = Math.round(Math.max(0, netAfterDiscount) * (activePromo.pct / 100));
  }
  
  const items = cart.map(c => {
    const lineGross = c.price * c.qty;
    const lineDisc = Math.round(lineGross * discountPct / 100);
    const lineTaxableBase = lineGross - lineDisc;
    
    let lineServiceCharge = 0;
    if (serviceChargeEnabled && rawSubtotal > 0) {
      lineServiceCharge = Math.round(serviceChargeAmount * (lineTaxableBase / netAfterDiscount));
    }
    
    let lineTaxableValue = lineTaxableBase;
    if (serviceChargeEnabled && taxProfile.apply_gst_on_service_charge) {
      lineTaxableValue += lineServiceCharge;
    }
    
    let rateCode = c.taxCategory || c.tax_category;
    if (!rateCode) {
      if (country === 'IE') {
        rateCode = 'IE_FOOD_9';
      } else {
        if (taxProfile.gst_scheme === 'composition') {
          rateCode = 'IN_COMP_5';
        } else if (taxProfile.specified_premises) {
          rateCode = 'IN_REST_18';
        } else {
          rateCode = 'IN_REST_5';
        }
      }
    }
    
    const resolved = window.RS_resolveRate(country, rateCode);
    let taxPercent = resolved.percent;
    let isAlcohol = (rateCode === 'IN_ALCOHOL_EXEMPT');
    let liquorTax = 0;
    let tax = 0;
    
    if (isAlcohol) {
      const liquorRate = taxProfile.liquor_vat_rate || 20;
      if (inclusivePricing) {
        liquorTax = Number((lineTaxableValue - (lineTaxableValue / (1 + liquorRate/100))).toFixed(2));
        lineTaxableValue = Number((lineTaxableValue - liquorTax).toFixed(2));
      } else {
        liquorTax = Number((lineTaxableValue * (liquorRate / 100)).toFixed(2));
      }
    } else {
      if (calculateTaxesEnabled) {
        if (inclusivePricing) {
          tax = Number((lineTaxableValue - (lineTaxableValue / (1 + taxPercent/100))).toFixed(2));
          lineTaxableValue = Number((lineTaxableValue - tax).toFixed(2));
        } else {
          tax = Number((lineTaxableValue * (taxPercent / 100)).toFixed(2));
        }
      }
    }
    
    return {
      ...c,
      lineGross,
      lineDisc,
      lineTaxableValue,
      taxPercent,
      tax,
      liquorTax,
      rateCode,
      serviceCharge: lineServiceCharge,
      itcAllowed: resolved.itc_allowed,
      label: resolved.label
    };
  });
  
  const bandMap = {};
  let totalGst = 0;
  let totalLiquorTax = 0;
  let totalTaxableValue = 0;
  
  items.forEach(item => {
    totalGst += item.tax;
    totalLiquorTax += item.liquorTax;
    totalTaxableValue += item.lineTaxableValue;
    
    if (item.tax > 0 || item.liquorTax > 0 || item.taxPercent >= 0) {
      const key = item.rateCode;
      if (!bandMap[key]) {
        bandMap[key] = {
          rateCode: key,
          label: item.label,
          percent: item.taxPercent,
          net: 0,
          tax: 0,
          gross: 0,
          itcAllowed: item.itcAllowed
        };
      }
      bandMap[key].net += item.lineTaxableValue;
      bandMap[key].tax += item.tax + item.liquorTax;
      bandMap[key].gross += item.lineTaxableValue + item.tax + item.liquorTax;
    }
  });
  
  const taxSummary = Object.values(bandMap).map(b => ({
    rateCode: b.rateCode,
    label: b.label,
    percent: Number(b.percent.toFixed(2)),
    net: Number(b.net.toFixed(2)),
    tax: Number(b.tax.toFixed(2)),
    gross: Number(b.gross.toFixed(2)),
    itcAllowed: b.itcAllowed
  }));
  
  let cgst = 0;
  let sgst = 0;
  let igst = 0;
  if (country === 'IN' && taxProfile.gst_scheme !== 'composition') {
    cgst = Number((totalGst / 2).toFixed(2));
    sgst = Number((totalGst - cgst).toFixed(2));
  }
  
  let grand = netAfterDiscount - promoOff + serviceChargeAmount + tip + deliveryCharge - loyaltyOff;
  if (!inclusivePricing) {
    grand += totalGst + totalLiquorTax;
  }
  if (grand < 0) grand = 0;
  
  if (roundOffEnabled) {
    grand = Math.round(grand);
  } else {
    grand = Number(grand.toFixed(2));
  }
  
  return {
    sub: rawSubtotal,
    disc: discAmount,
    promo: promoOff,
    promoCode: activePromo.code || '',
    promoTitle: activePromo.title || '',
    promoPct: activePromo.pct || 0,
    promoOfferId: activePromo.offerId || null,
    gst: totalGst,
    cgst,
    sgst,
    igst,
    liquorTax: totalLiquorTax,
    serviceCharge: serviceChargeAmount,
    serviceChargePct,
    tip,
    deliveryCharge,
    loyaltyRedeem: loyaltyOff,
    loyaltyPointsUsed: loyaltyPointsUsed || 0,
    covers: getCovers(),
    pax: getCovers(),
    grand,
    count: cart.reduce((a,c)=>a+c.qty,0),
    discountPct,
    taxSummary,
    taxProfile,
    channel,
    items
  };
}
function clearPromo() {
  activePromo = { code: '', pct: 0, fixed: 0, title: '', offerId: null };
  const pe = document.getElementById('promo-input');
  if (pe) pe.value = '';
  const badge = document.getElementById('promo-applied-badge');
  if (badge) {
    badge.style.display = 'none';
    badge.textContent = '';
  }
}
function setPromo(p) {
  activePromo = {
    code: (p && p.code) || '',
    pct: Math.max(0, Number(p && p.pct) || 0),
    fixed: Math.max(0, Number(p && p.fixed) || 0),
    title: (p && p.title) || '',
    offerId: (p && p.offerId) || null,
  };
  const pe = document.getElementById('promo-input');
  if (pe && activePromo.code) pe.value = activePromo.code;
  const badge = document.getElementById('promo-applied-badge');
  if (badge) {
    if (activePromo.code) {
      badge.style.display = '';
      const off =
        activePromo.fixed > 0
          ? rs(activePromo.fixed)
          : activePromo.pct + '%';
      badge.textContent = activePromo.code + ' · ' + off;
    } else {
      badge.style.display = 'none';
      badge.textContent = '';
    }
  }
  try {
    renderCart();
  } catch (_) {}
}
function getPromo() {
  return { ...activePromo };
}
function clearCart(){
  cart=[]; discountPct=0; tipAmount=0; loyaltyRedeem=0; loyaltyPointsUsed=0;
  clearPromo();
  setCovers(0);
  const d=$('#disc-input'); if(d) d.value='';
  const tipEl=$('#tip-input'); if(tipEl) tipEl.value='';
  renderCart();
  if (window.innerWidth <= 1024) closeMobilePOSCart(false);
}
function getCovers() {
  const el = document.getElementById('cart-covers');
  if (!el) return 0;
  const n = Math.floor(Number(el.value));
  if (!Number.isFinite(n) || n < 0) return 0;
  return Math.min(99, n);
}
function setCovers(n) {
  const el = document.getElementById('cart-covers');
  const v = Math.max(0, Math.min(99, Math.floor(Number(n) || 0)));
  if (el) el.value = v > 0 ? String(v) : '';
  return v;
}
function getCustomer(){
  const nameEl = $('#cust-input-name') || $('#cust-name');
  const phoneEl = $('#cust-input-phone') || $('#cust-phone');
  const gstEl = $('#cust-gst');
  const covers = getCovers();
  
  let phoneVal = '';
  if (phoneEl) {
    phoneVal = window.RS_getFullPhoneNumber ? window.RS_getFullPhoneNumber(phoneEl) : phoneEl.value;
  }
  
  const sel = $('#cart-customer-sel');
  if (sel && sel.value) {
    const opt = sel.options[sel.selectedIndex];
    const selPhone = sel.value;
    const finalPhone = (selPhone.startsWith('temp-') || !selPhone.startsWith('+')) ? phoneVal.trim() : selPhone.trim();
    return {
      name: opt.getAttribute('data-name') || '',
      phone: finalPhone,
      gst: opt.getAttribute('data-gst') || '',
      table: ($('#cart-table')?.value || 'Walk-in / Takeaway'),
      covers,
      pax: covers,
    };
  }
  return {
    name: (nameEl?.value || '').trim(),
    phone: phoneVal.trim(),
    gst: (gstEl?.value || '').trim(),
    table: ($('#cart-table')?.value || 'Walk-in / Takeaway'),
    covers,
    pax: covers,
  };
}
function runKotAction(){
  if(!cart.length) return toast('Cart is empty','fa-circle-exclamation');
  try {
    if(window.RSPOS && window.RSPOS.kot) return window.RSPOS.kot();
  } catch (err) {
    console.error('[KOT Error]', err);
    return toast('KOT Error: ' + err.message, 'fa-circle-exclamation');
  }
  toast('KOT sent to kitchen','fa-fire');
}
function runCheckoutAction(){
  if(!cart.length) return toast('Cart is empty','fa-circle-exclamation');
  try {
    if(window.RSPOS && window.RSPOS.checkout) return window.RSPOS.checkout();
  } catch (err) {
    console.error('[Checkout Error]', err);
    return toast('Checkout Error: ' + err.message, 'fa-circle-exclamation');
  }
  // RSPOS module not loaded -- do not silently show false success
  return toast('Checkout module not ready -- please refresh', 'fa-circle-exclamation');
}
let cartActionsDelegated = false;
function ensureCartActionDelegation(){
  if (cartActionsDelegated) return;
  cartActionsDelegated = true;
  document.addEventListener('click', e => {
    const btn = e.target.closest('#btn-kot, #btn-checkout');
    if (!btn) return;
    e.preventDefault();
    if (btn.id === 'btn-kot') return runKotAction();
    runCheckoutAction();
  });
}
function wireCartActions(){
  ensureCartActionDelegation();
  const kotBtn = $('#btn-kot');
  if (kotBtn) kotBtn.onclick = null;
  const checkoutBtn = $('#btn-checkout');
  if (checkoutBtn) checkoutBtn.onclick = null;
}
// POS init (static parts present in HTML, wire them)
function syncTablePaxForOrderType() {
  const active = document.querySelector('.order-type-btn.active');
  const t = (active && active.textContent || '').toLowerCase();
  const dineIn = t.includes('dine');
  const delivery = t.includes('deliv');
  const cartEl = document.querySelector('.pos-cart');
  if (cartEl) {
    cartEl.classList.toggle('is-dinein', dineIn);
    cartEl.classList.toggle('is-delivery', delivery);
  }
  const row = document.getElementById('cart-table-pax-row');
  if (row) {
    // Takeaway/delivery: hide table+pax clutter (walk-in default)
    row.style.display = dineIn ? 'grid' : 'none';
    row.classList.toggle('is-visible', dineIn);
  }
}

function initPOS(){
  try { wireCartCustomerToggle(); } catch (_) {}
  try { updatePosCartChrome(!cart || cart.length === 0); } catch (_) {}
  try { syncTablePaxForOrderType(); } catch (_) {}
  // Refresh happy-hour banner periodically (window can start/end mid-shift)
  if (!global.__rsHappyHourTick) {
    global.__rsHappyHourTick = true;
    setInterval(() => {
      try {
        const tab = document.getElementById('pos-tab');
        if (tab && tab.classList.contains('active')) {
          paintHappyHourBanner();
          // Re-render prices if HH state flipped
          if (document.getElementById('pos-grid')) renderPOS();
        }
      } catch (_) {}
    }, 60000);
  }
  // Helper function to get tab key for an order type (fixed, not dependent on table number)
  function getTabKeyForOrderType(orderTypeText) {
    const lowerText = orderTypeText.toLowerCase();
    if (lowerText.includes('delivery')) return 'Delivery';
    if (lowerText.includes('dine')) return 'Dine-in';
    return 'Takeaway';
  }

  // Load saved active order type and corresponding cart
  try {
    // Load saved active order type
    let savedOrderType = localStorage.getItem('rs_active_order_type');
    let activeOrderTypeBtn = document.querySelector('.order-type-btn.active');
    
    // If we have a saved order type, activate that button first
    if (savedOrderType) {
      const btns = document.querySelectorAll('.order-type-btn');
      let matched = false;
      btns.forEach(b => {
        const match = b.textContent.trim().toLowerCase() === savedOrderType.toLowerCase();
        b.classList.toggle('active', match);
        if (match) {
          activeOrderTypeBtn = b;
          matched = true;
        }
      });
      // Fallback: activate first button if no match
      if (!matched && btns.length) {
        btns[0].classList.add('active');
        activeOrderTypeBtn = btns[0];
      }
    } else if (!activeOrderTypeBtn) {
      // No active button and no saved type, activate first button
      const btns = document.querySelectorAll('.order-type-btn');
      if (btns.length) {
        btns[0].classList.add('active');
        activeOrderTypeBtn = btns[0];
      }
    }

    // Now load the cart for the active order type
    const activeOrderType = activeOrderTypeBtn ? activeOrderTypeBtn.textContent.trim() : 'Takeaway';
    const initialTabKey = getTabKeyForOrderType(activeOrderType);
    const savedTabCart = localStorage.getItem('rs_tab_cart_' + initialTabKey);
    if (savedTabCart) {
      const tabData = JSON.parse(savedTabCart);
      cart = tabData.items || [];
      // Also load delivery-specific fields if applicable
      const da = document.getElementById('delivery-address');
      const dc = document.getElementById('delivery-charge');
      const dr = document.getElementById('delivery-rider');
      if (da) da.value = tabData.deliveryAddress || '';
      if (dc) dc.value = tabData.deliveryCharge || '';
      if (dr) dr.value = tabData.deliveryRider || '';
    } else {
      // Fall back to the old active cart key if no tab-specific cart exists
      const savedCart = localStorage.getItem('rs_active_cart');
      if (savedCart) {
        cart = JSON.parse(savedCart);
      }
    }
    const savedDiscount = localStorage.getItem('rs_active_cart_discount');
    if (savedDiscount) {
      discountPct = Number(savedDiscount) || 0;
      const discInput = $('#disc-input');
      if (discInput) discInput.value = discountPct;
    }
    const savedTip = localStorage.getItem('rs_active_cart_tip');
    if (savedTip) {
      tipAmount = Math.max(0, Number(savedTip) || 0);
      const tipInput = $('#tip-input');
      if (tipInput) tipInput.value = tipAmount > 0 ? tipAmount : '';
    }
    const savedCustomer = localStorage.getItem('rs_active_cart_customer');
    if (savedCustomer) {
      const customer = JSON.parse(savedCustomer);
      const cartTable = $('#cart-table');
      if (cartTable && customer.table) cartTable.value = customer.table;
      const custName = $('#cust-input-name') || $('#cust-name');
      if (custName && customer.name) custName.value = customer.name;
      const custPhone = $('#cust-input-phone') || $('#cust-phone');
      if (custPhone && customer.phone) custPhone.value = customer.phone;
      const custGst = $('#cust-gst');
      if (custGst && customer.gst) custGst.value = customer.gst;
    }
  } catch (e) {
    console.warn('[Cart Persistence Warning] Failed to load saved cart:', e);
  }

  // -- Mount country-code prefix picker on cart customer phone --
  (function mountCartPhonePicker() {
    const phoneEl = document.getElementById('cust-input-phone');
    if (!phoneEl || phoneEl.dataset.phonePrefixBuilt) return;
    const settings = window.RS_SETTINGS || {};
    let countryCode = 'IN';
    if (settings.set_country && window.RS_getCountryByName) {
      const entry = window.RS_getCountryByName(settings.set_country);
      if (entry) countryCode = entry.code;
    }
    if (window.RS_buildPhonePrefix) {
      window.RS_buildPhonePrefix(phoneEl, countryCode);
    }
  })();

  // Category chips are derived from the live menu, including custom categories.
  refreshPosCats();
  $('#pos-search-input').addEventListener('input', renderPOS);
  if ($('#pos-sort-select')) $('#pos-sort-select').addEventListener('change', renderPOS);
  // Manual / off-menu cart item
  (function wireCustomItemBtn() {
    const head = document.querySelector('.cart-head-actions') || document.querySelector('.pos-toolbar-secondary');
    if (!head || document.getElementById('btn-custom-cart-item')) return;
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.id = 'btn-custom-cart-item';
    btn.className = 'btn btn-ghost btn-sm';
    btn.title = 'Add custom item not on menu';
    btn.innerHTML = '<i class="fa-solid fa-pen-to-square"></i>';
    btn.addEventListener('click', (e) => {
      e.preventDefault();
      if (global.RSMenuIntel && RSMenuIntel.openCustomCartItem) RSMenuIntel.openCustomCartItem();
      else toast('Custom item module loading…', 'fa-circle-info');
    });
    head.insertBefore(btn, head.firstChild);
  })();
  // Expose cart helpers for menu-intelligence custom lines
  function setCart(next) {
    cart = Array.isArray(next) ? next : cart;
    renderCart();
  }
  function addCustomLine(line) {
    if (!line) return;
    cart.push(line);
    renderCart();
  }
  global.RSPOS = Object.assign(global.RSPOS || {}, {
    setCart,
    addCustomLine,
    getCart: () => cart.slice(),
    renderCart,
  });
  if (global.RS) {
    global.RS.getCart = () => cart.slice();
    global.RS.setCart = setCart;
    global.RS.renderCart = renderCart;
  }
  document.addEventListener('rs:ready', () => {
    if (global.RS) {
      global.RS.getCart = () => cart.slice();
      global.RS.setCart = setCart;
      global.RS.renderCart = renderCart;
    }
  });
  $$('.order-type-btn').forEach(b=> b.addEventListener('click',()=>{
    // Snapshot the outgoing tab's cart to localStorage before the active class changes,
    // so the per-tab fallback always has the latest data even without RS_DB.
    try {
      const curActiveBtn = document.querySelector('.order-type-btn.active');
      if (curActiveBtn && curActiveBtn !== b) {
        const outType = curActiveBtn.textContent.trim().toLowerCase();
        const tabKey = getTabKeyForOrderType(curActiveBtn.textContent.trim());
        const da = document.getElementById('delivery-address');
        const dc = document.getElementById('delivery-charge');
        const dr = document.getElementById('delivery-rider');
        localStorage.setItem('rs_tab_cart_' + tabKey, JSON.stringify({
          items: cart.map(c=>({...c})),
          total: cart.reduce((a,c)=>a+c.price*c.qty,0),
          deliveryAddress: da ? da.value : '',
          deliveryCharge: dc ? dc.value : '',
          deliveryRider: dr ? dr.value : ''
        }));
        const nameEl = document.getElementById('cust-input-name') || document.getElementById('cust-name');
        const phoneEl = document.getElementById('cust-input-phone') || document.getElementById('cust-phone');
        localStorage.setItem('rs_tab_cust_' + tabKey, JSON.stringify({
          name: nameEl ? nameEl.value.trim() : '',
          phone: phoneEl ? phoneEl.value.trim() : ''
        }));

        // Now load the new tab's cart!
        const newTabKey = getTabKeyForOrderType(b.textContent.trim());
        // Save new active order type
        localStorage.setItem('rs_active_order_type', b.textContent.trim().toLowerCase());
        const savedNewTabCart = localStorage.getItem('rs_tab_cart_' + newTabKey);
        if (savedNewTabCart) {
          const newTabData = JSON.parse(savedNewTabCart);
          cart = newTabData.items || [];
          // Load delivery fields if applicable
          if (da) da.value = newTabData.deliveryAddress || '';
          if (dc) dc.value = newTabData.deliveryCharge || '';
          if (dr) dr.value = newTabData.deliveryRider || '';
        } else {
          cart = []; // If no saved cart for new tab, start fresh!
          // Clear delivery fields too
          if (da) da.value = '';
          if (dc) dc.value = '';
          if (dr) dr.value = '';
        }

        // Load the new tab's customer data
        const savedNewTabCust = localStorage.getItem('rs_tab_cust_' + newTabKey);
        if (savedNewTabCust) {
          const newCustData = JSON.parse(savedNewTabCust);
          const nameEl = document.getElementById('cust-input-name') || document.getElementById('cust-name');
          const phoneEl = document.getElementById('cust-input-phone') || document.getElementById('cust-phone');
          if (nameEl) nameEl.value = newCustData.name || '';
          if (phoneEl) phoneEl.value = newCustData.phone || '';
        }

        // Re-render the cart!
        renderCart();
      }
    } catch(e) {
      console.error('[Order Type Switch Error]', e);
    }
    $$('.order-type-btn').forEach(x=>x.classList.remove('active')); b.classList.add('active');
    try { syncTablePaxForOrderType(); } catch (_) {}
  }));
  let lastAuthorizedDiscount = 0;
  function wireTipControls() {
    const tipInput = $('#tip-input');
    if (tipInput && !tipInput.dataset.bound) {
      tipInput.dataset.bound = '1';
      tipInput.addEventListener('input', () => {
        tipAmount = Math.max(0, Number(tipInput.value) || 0);
        renderCart();
      });
    }
    document.querySelectorAll('[data-tip-pct]').forEach((btn) => {
      if (btn.dataset.bound) return;
      btn.dataset.bound = '1';
      btn.addEventListener('click', () => {
        const pct = Number(btn.dataset.tipPct) || 0;
        const totals = getTotals();
        // base for % tip = sub - disc (before tip)
        const base = Math.max(0, (totals.sub || 0) - (totals.disc || 0));
        tipAmount = pct <= 0 ? 0 : Math.round(base * (pct / 100));
        if (tipInput) tipInput.value = tipAmount > 0 ? tipAmount : '';
        renderCart();
      });
    });
  }
  wireTipControls();

  // Delivery charge recalculates cart total live
  const delChargeEl = document.getElementById('delivery-charge');
  if (delChargeEl && !delChargeEl.dataset.boundTotals) {
    delChargeEl.dataset.boundTotals = '1';
    delChargeEl.addEventListener('input', () => {
      try {
        renderCart();
      } catch (_) {}
    });
  }

  $('#disc-input')?.addEventListener('input', e=>{
    const val = Math.min(100,Math.max(0,+e.target.value||0));
    if (val <= 10) {
      discountPct = val;
      renderCart();
    }
  });
  $('#disc-input')?.addEventListener('change', async e=>{
    const val = Math.min(100,Math.max(0,+e.target.value||0));
    const thr = Number((window.RS_SETTINGS || {}).set_pin_discount_threshold);
    const discThr = Number.isFinite(thr) && thr > 0 ? thr : 10;
    if (val > discThr) {
      if (val === lastAuthorizedDiscount) {
        discountPct = val;
        renderCart();
        return;
      }
      if (window.RSPinModal) {
        e.target.disabled = true;
        const ok = typeof RSPinModal.require === 'function'
          ? await RSPinModal.require('Discount override · ' + val + '%', {
              settingKey: 'set_pin_gate_discount',
              always: true,
            })
          : await RSPinModal.request('Discount Override');
        e.target.disabled = false;
        if (ok) {
          discountPct = val;
          lastAuthorizedDiscount = val;
          renderCart();
          toast('Discount override approved', 'fa-percent');
        } else {
          e.target.value = discountPct > 0 ? discountPct : '';
          toast('Discount override rejected', 'fa-circle-xmark');
          renderCart();
        }
      } else {
        discountPct = val;
        renderCart();
      }
    } else {
      discountPct = val;
      lastAuthorizedDiscount = val;
      renderCart();
    }
  });
  $('#btn-kot').onclick = () => {
    if(!cart.length) return toast('Cart is empty','fa-circle-exclamation');
    try {
      if(window.RSPOS && window.RSPOS.kot) return window.RSPOS.kot();
    } catch (err) {
      console.error('[KOT Error]', err);
      return toast('KOT Error: ' + err.message, 'fa-circle-exclamation');
    }
    toast('KOT sent to kitchen','fa-fire');
  };
  $('#btn-checkout').onclick = () => {
    if(!cart.length) return toast('Cart is empty','fa-circle-exclamation');
    try {
      if(window.RSPOS && window.RSPOS.checkout) return window.RSPOS.checkout();
    } catch (err) {
      console.error('[Checkout Error]', err);
      return toast('Checkout Error: ' + err.message, 'fa-circle-exclamation');
    }
    return toast('Checkout module not ready -- please refresh', 'fa-circle-exclamation');
  };

  // Grid size slider controls
  const slider = $('#pos-grid-slider');
  const grid = $('#pos-grid');
  const decBtn = $('#btn-grid-dec');
  const incBtn = $('#btn-grid-inc');
  if (slider && grid && decBtn && incBtn) {
    const updateGridSize = (val) => {
      val = Math.min(250, Math.max(110, val));
      slider.value = val;
      grid.style.setProperty('--pos-grid-size', val + 'px');
      try { localStorage.setItem('rs-pos-grid-size', val); } catch(e){}
    };
    slider.oninput = () => updateGridSize(parseInt(slider.value) || 158);
    decBtn.onclick = () => updateGridSize((parseInt(slider.value) || 158) - 15);
    incBtn.onclick = () => updateGridSize((parseInt(slider.value) || 158) + 15);
    try {
      const savedSize = localStorage.getItem('rs-pos-grid-size') || 158;
      updateGridSize(parseInt(savedSize));
    } catch(e) {
      updateGridSize(158);
    }
  }

  // Mobile view toggles
  const cartBar = $('#pos-m-cart-bar');
  const backBtn = $('#btn-pos-back-menu');
  bindMobileCartBar();
  if (backBtn && cartBar) backBtn.onclick = () => { if (window.innerWidth <= 1024) closeMobilePOSCart(true); };

  renderPOS(); renderCart();

  // Mobile "More" is owned by features-shell.js (RSModal "All sections").
  // Do NOT toggle #mobile-more-sheet here — that older bottom sheet was still
  // opening underneath the modal, flashing "MORE SECTIONS" when a tile closed.
  const legacyMore = document.getElementById('mobile-more-sheet');
  if (legacyMore) {
    legacyMore.style.display = 'none';
    legacyMore.setAttribute('hidden', '');
    legacyMore.setAttribute('aria-hidden', 'true');
  }
}

  function getCart() {
    return cart.map((c) => ({ ...c }));
  }
  function setCart(items) {
    cart = (items || []).map((c) => ({ ...c }));
    renderCart();
  }
  function setDiscountPct(n) {
    discountPct = Number(n) || 0;
  }
  function getDiscountPct() {
    return discountPct;
  }
  function setTip(n) {
    tipAmount = Math.max(0, Number(n) || 0);
    const tipInput = document.getElementById('tip-input');
    if (tipInput) tipInput.value = tipAmount > 0 ? tipAmount : '';
  }
  function getTip() {
    return tipAmount;
  }
  function setLoyaltyRedeem(currencyAmount, pointsUsed) {
    loyaltyRedeem = Math.max(0, Number(currencyAmount) || 0);
    loyaltyPointsUsed = Math.max(0, Number(pointsUsed) || 0);
    try {
      renderCart();
    } catch (_) {}
  }
  function getLoyaltyRedeem() {
    return { amount: loyaltyRedeem, points: loyaltyPointsUsed };
  }

  global.RSPosUI = {
    renderPOS,
    renderCart,
    addToCart,
    changeQty,
    getTotals,
    clearCart,
    getCustomer,
    initPOS,
    refreshPosCats,
    getCart,
    updatePosCartChrome,
    syncCartCustomerChrome,
    setCartCustomerPanelOpen,
    clearCartCustomer,
    setCart,
    setDiscountPct,
    getDiscountPct,
    setPromo,
    getPromo,
    clearPromo,
    setLineNote,
    getLineNote,
    openLineNoteEditor,
    getCovers,
    setCovers,
    setTip,
    getTip,
    setLoyaltyRedeem,
    getLoyaltyRedeem,
    isHappyHourActive,
    effectiveMenuPrice,
    happyHourPct,
    paintHappyHourBanner,
    updateMobileCartBar,
    openMobilePOSCart,
    closeMobilePOSCart,
    bindMobileCartBar,
    runKotAction,
    runCheckoutAction,
    ensureCartActionDelegation,
    wireCartActions,
  };

  global.refreshPosCats = refreshPosCats;

  function attachToRS() {
    if (!global.RS) return;
    const api = global.RSPosUI;
    global.RS.renderPOS = api.renderPOS;
    global.RS.renderCart = api.renderCart;
    global.RS.addToCart = api.addToCart;
    global.RS.getTotals = api.getTotals;
    global.RS.clearCart = api.clearCart;
    global.RS.getCustomer = api.getCustomer;
    global.RS.getCart = api.getCart;
    global.RS.setCart = api.setCart;
    global.RS.initPOS = api.initPOS;
    global.RS.setTip = api.setTip;
    global.RS.getTip = api.getTip;
    global.RS.setLoyaltyRedeem = api.setLoyaltyRedeem;
    global.RS.getLoyaltyRedeem = api.getLoyaltyRedeem;
    global.RS.setPromo = api.setPromo;
    global.RS.getPromo = api.getPromo;
    global.RS.clearPromo = api.clearPromo;
    global.RS.setLineNote = api.setLineNote;
    global.RS.getLineNote = api.getLineNote;
    global.RS.openLineNoteEditor = api.openLineNoteEditor;
    global.RS.getCovers = api.getCovers;
    global.RS.setCovers = api.setCovers;
    global.RS.isHappyHourActive = api.isHappyHourActive;
    global.RS.effectiveMenuPrice = api.effectiveMenuPrice;
  }
  if (global.RS) attachToRS();
  document.addEventListener('rs:ready', attachToRS);
})(typeof window !== 'undefined' ? window : globalThis);
