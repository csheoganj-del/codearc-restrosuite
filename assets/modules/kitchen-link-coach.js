/* ============================================================
   Kitchen Link Coach — plain-language Menu ↔ Recipe ↔ Stock
   Designed so any staff member (no tech background) can finish setup.
   ============================================================ */
(function (global) {
  'use strict';

  var LS_FIRST = 'rs_klc_first_visit_v1';
  var LS_HINT = 'rs_klc_pos_hint_v1';

  function toast(msg, icon) {
    if (global.RS && typeof RS.toast === 'function') RS.toast(msg, icon);
    else if (typeof global.__toast === 'function') global.__toast(msg, icon);
  }
  function esc(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }
  function pretty(n) {
    const s = String(n || '');
    if (!/[_-]/.test(s)) return s;
    return s.replace(/[_-]+/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
  }
  function menu() {
    return (global.RS && RS.MENU) || [];
  }
  function inventory() {
    return (global.RS && RS.INVENTORY) || [];
  }
  function unlinkedDishes() {
    return menu().filter((m) => !Array.isArray(m.ingredients) || !m.ingredients.length);
  }
  function linkedCount() {
    return menu().filter((m) => Array.isArray(m.ingredients) && m.ingredients.length).length;
  }
  function coverage() {
    const t = menu().length;
    if (!t) return { linked: 0, total: 0, pct: 0, missing: 0 };
    const linked = linkedCount();
    return { linked, total: t, pct: Math.round((linked / t) * 100), missing: t - linked };
  }
  function setupStatus() {
    const invN = inventory().length;
    const c = coverage();
    return {
      hasStock: invN > 0,
      hasMenu: c.total > 0,
      hasLinks: c.linked > 0,
      allLinked: c.total > 0 && c.missing === 0 && invN > 0,
      invN,
      ...c,
    };
  }

  /** Common Indian restaurant dish keywords → stock name fragments + default plate qty */
  var SUGGEST_RULES = [
    { keys: ['biryani', 'pulao', 'fried rice', 'rice bowl', 'jeera rice', 'steam rice', 'curd rice'], stock: ['rice', 'basmati', 'jeera'], qty: 0.15, unit: 'kg' },
    { keys: ['naan', 'roti', 'paratha', 'kulcha', 'chapati', 'tandoori roti'], stock: ['flour', 'atta', 'wheat', 'maida'], qty: 0.08, unit: 'kg' },
    { keys: ['paneer', 'kadai paneer', 'shahi paneer', 'palak paneer', 'butter paneer'], stock: ['paneer'], qty: 0.12, unit: 'kg' },
    { keys: ['butter chicken', 'chicken curry', 'chicken tikka', 'tandoori chicken', 'chicken'], stock: ['chicken'], qty: 0.18, unit: 'kg' },
    { keys: ['mutton', 'lamb', 'keema', 'rogan josh'], stock: ['mutton', 'lamb', 'goat'], qty: 0.18, unit: 'kg' },
    { keys: ['fish', 'prawn', 'shrimp', 'seafood'], stock: ['fish', 'prawn', 'shrimp'], qty: 0.15, unit: 'kg' },
    { keys: ['dal', 'daal', 'sambar', 'rasam'], stock: ['dal', 'daal', 'toor', 'moong', 'masoor', 'lentil'], qty: 0.08, unit: 'kg' },
    { keys: ['dosa', 'idli', 'uttapam', 'vada'], stock: ['batter', 'rice', 'urad', 'dosa'], qty: 0.15, unit: 'kg' },
    { keys: ['pizza', 'pasta', 'lasagna'], stock: ['cheese', 'pizza', 'pasta', 'dough', 'sauce'], qty: 0.1, unit: 'kg' },
    { keys: ['burger', 'sandwich', 'wrap', 'roll'], stock: ['bun', 'bread', 'roll', 'wrap', 'patty'], qty: 1, unit: 'pcs' },
    { keys: ['tea', 'chai', 'coffee', 'cappuccino'], stock: ['tea', 'coffee', 'milk', 'sugar'], qty: 0.02, unit: 'kg' },
    { keys: ['lassi', 'shake', 'smoothie', 'juice', 'mocktail'], stock: ['milk', 'curd', 'yogurt', 'sugar', 'fruit'], qty: 0.2, unit: 'L' },
    { keys: ['salad', 'raita'], stock: ['onion', 'cucumber', 'tomato', 'curd', 'lettuce'], qty: 0.05, unit: 'kg' },
    { keys: ['soup'], stock: ['stock', 'soup', 'veg', 'cream'], qty: 0.25, unit: 'L' },
    { keys: ['tikka', 'kebab', 'kabab', 'seekh'], stock: ['chicken', 'paneer', 'mutton', 'oil'], qty: 0.12, unit: 'kg' },
    { keys: ['curry', 'gravy', 'masala'], stock: ['onion', 'tomato', 'oil', 'masala', 'cream', 'butter'], qty: 0.05, unit: 'kg' },
    { keys: ['egg', 'omelette', 'omlette'], stock: ['egg'], qty: 2, unit: 'pcs' },
    { keys: ['fries', 'french fry', 'chips'], stock: ['potato', 'oil'], qty: 0.15, unit: 'kg' },
    // Packaging & service items sold/used with food
    { keys: ['parcel', 'takeaway', 'take away', 'delivery', 'online', 'swiggy', 'zomato'], stock: ['box', 'container', 'bag', 'carry bag', 'foil', 'napkin'], qty: 1, unit: 'pcs' },
    { keys: ['thali', 'combo', 'meal box', 'family pack', 'party pack'], stock: ['box', 'container', 'bag', 'napkin', 'spoon'], qty: 1, unit: 'pcs' },
    { keys: ['burger', 'wrap', 'roll', 'sandwich'], stock: ['paper', 'foil', 'butter paper', 'bag', 'wrapper'], qty: 1, unit: 'pcs' },
    { keys: ['pizza'], stock: ['box', 'pizza box'], qty: 1, unit: 'pcs' },
    { keys: ['juice', 'shake', 'lassi', 'mocktail', 'cold drink', 'beverage'], stock: ['cup', 'straw', 'lid', 'glass'], qty: 1, unit: 'pcs' },
    { keys: ['ice cream', 'dessert cup'], stock: ['cup', 'spoon', 'lid'], qty: 1, unit: 'pcs' },
  ];

  function isPackagingLike(item) {
    const hay = norm((item && item.cat) + ' ' + (item && item.name));
    return /packag|dispos|box|bag|foil|napkin|tissue|container|straw|spoon|fork|lid|cup|wrapper|paper|carry|plastic|aluminium|aluminum/.test(
      hay
    );
  }

  function packagingSuggestions(dishName) {
    const name = norm(dishName);
    const pack = inventory().filter(isPackagingLike);
    if (!pack.length) return [];
    // Prefer rule-based matches first
    const fromRules = suggestIngredients(dishName).filter((s) => {
      const inv = inventory().find((i) => i.name === s.name);
      return inv && isPackagingLike(inv);
    });
    if (fromRules.length) return fromRules;
    // For any dish, lightly suggest common packaging if stock has them (qty 1)
    const common = ['box', 'bag', 'napkin', 'container', 'foil', 'spoon'];
    const out = [];
    const seen = {};
    common.forEach((frag) => {
      const hit = pack.find((p) => norm(p.name).includes(frag) || norm(p.cat).includes(frag));
      if (hit && !seen[hit.name]) {
        seen[hit.name] = true;
        out.push({ name: hit.name, qty: 1, unit: hit.unit || 'pcs', why: 'packaging' });
      }
    });
    // If dish name hints takeaway, surface more packaging
    if (/parcel|take|deliver|combo|thali|box/.test(name)) {
      pack.slice(0, 6).forEach((p) => {
        if (!seen[p.name]) {
          seen[p.name] = true;
          out.push({ name: p.name, qty: 1, unit: p.unit || 'pcs', why: 'packaging' });
        }
      });
    }
    return out.slice(0, 6);
  }

  function norm(s) {
    return String(s || '')
      .toLowerCase()
      .replace(/[_-]+/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
  }

  function findStockMatch(fragments) {
    const inv = inventory();
    const frags = (fragments || []).map(norm).filter(Boolean);
    for (let i = 0; i < frags.length; i++) {
      const f = frags[i];
      const hit =
        inv.find((x) => norm(x.name) === f) ||
        inv.find((x) => norm(x.name).includes(f) || f.includes(norm(x.name)));
      if (hit) return hit;
    }
    return null;
  }

  /**
   * Suggest stock lines for a dish name from rules + name overlap with inventory.
   * Only returns items that exist in stock (never invents names).
   */
  function suggestIngredients(dishName) {
    const name = norm(dishName);
    if (!name || !inventory().length) return [];
    const out = [];
    const seen = {};

    function push(invItem, qty, unit, why) {
      if (!invItem || seen[invItem.name]) return;
      seen[invItem.name] = true;
      out.push({
        name: invItem.name,
        qty: qty != null ? qty : 1,
        unit: unit || invItem.unit || 'unit',
        why: why || 'suggested',
      });
    }

    SUGGEST_RULES.forEach((rule) => {
      const hitKey = rule.keys.some((k) => name.includes(k));
      if (!hitKey) return;
      rule.stock.forEach((frag) => {
        const invItem = findStockMatch([frag]);
        if (invItem) push(invItem, rule.qty, invItem.unit || rule.unit, 'matches “' + frag + '”');
      });
    });

    // Also: any stock item whose name appears inside the dish name
    inventory().forEach((invItem) => {
      const n = norm(invItem.name);
      if (n.length >= 3 && name.includes(n)) push(invItem, 0.1, invItem.unit || 'unit', 'name match');
    });

    return out.slice(0, 8);
  }

  function tokenSet(str) {
    return new Set(
      norm(str)
        .split(/[^a-z0-9]+/)
        .filter((t) => t.length > 2)
    );
  }

  function similarityScore(a, b) {
    const A = tokenSet(a);
    const B = tokenSet(b);
    if (!A.size || !B.size) return 0;
    let inter = 0;
    A.forEach((t) => {
      if (B.has(t)) inter++;
    });
    return inter / Math.max(A.size, B.size);
  }

  /**
   * Linked dishes ranked by name/category similarity (for copy recipe).
   */
  function similarLinkedDishes(forDish, limit) {
    const target = forDish || {};
    const linked = menu().filter(
      (m) =>
        String(m.id) !== String(target.id) &&
        Array.isArray(m.ingredients) &&
        m.ingredients.length
    );
    return linked
      .map((m) => {
        let score = similarityScore(target.name, m.name) * 3;
        if (target.cat && m.cat && norm(target.cat) === norm(m.cat)) score += 1.2;
        // bonus if same veg/nonveg
        if (target.veg != null && m.veg != null && !!target.veg === !!m.veg) score += 0.3;
        return { dish: m, score };
      })
      .filter((x) => x.score > 0.15 || linked.length <= 12)
      .sort((a, b) => b.score - a.score)
      .slice(0, limit || 12)
      .map((x) => x.dish);
  }

  function goInventoryTab(sub) {
    if (global.RS && typeof RS.activateTab === 'function') {
      RS.activateTab('inventory-tab');
    }
    setTimeout(() => {
      const sec = document.getElementById('inventory-tab');
      if (!sec) return;
      const map = {
        stock: 0,
        recipes: 1,
        suppliers: 2,
        pos: 3,
        waste: 4,
      };
      const idx = map[sub] != null ? map[sub] : 1;
      const btns = sec.querySelectorAll('.seg button');
      if (btns[idx]) btns[idx].click();
    }, 120);
  }

  function goMenuEditor() {
    if (global.RS && typeof RS.activateTab === 'function') RS.activateTab('editor-tab');
  }

  function progressBarHtml(pct) {
    const p = Math.max(0, Math.min(100, Number(pct) || 0));
    return `<div class="klc-progress" role="progressbar" aria-valuenow="${p}" aria-valuemin="0" aria-valuemax="100">
      <div class="klc-progress-fill" style="width:${p}%"></div>
    </div>
    <div class="klc-progress-lab">${p}% of dishes linked to stock</div>`;
  }

  /**
   * Big simple explanation modal (no data entry).
   */
  function openHowItWorks() {
    if (!global.RSModal) {
      toast('Open Inventory → Recipes to link dishes to stock', 'fa-circle-info');
      return;
    }
    const c = coverage();
    const invN = inventory().length;
    global.RSModal.open({
      title: 'How your kitchen is connected',
      sub: 'Three simple boxes — anyone can understand this',
      icon: 'fa-link',
      size: 'md',
      body: `
        <div class="klc-how">
          <div class="klc-flow">
            <div class="klc-box">
              <div class="klc-num">1</div>
              <div class="klc-ico"><i class="fa-solid fa-utensils"></i></div>
              <div class="klc-title">MENU</div>
              <div class="klc-desc">What the customer orders<br><b>${c.total}</b> dishes</div>
            </div>
            <div class="klc-arrow"><i class="fa-solid fa-arrow-right"></i></div>
            <div class="klc-box klc-box-mid">
              <div class="klc-num">2</div>
              <div class="klc-ico"><i class="fa-solid fa-clipboard-list"></i></div>
              <div class="klc-title">RECIPE</div>
              <div class="klc-desc">“This dish uses how much stock?”<br><b>${c.linked}</b> linked · <b>${c.missing}</b> still open</div>
            </div>
            <div class="klc-arrow"><i class="fa-solid fa-arrow-right"></i></div>
            <div class="klc-box">
              <div class="klc-num">3</div>
              <div class="klc-ico"><i class="fa-solid fa-boxes-stacked"></i></div>
              <div class="klc-title">STOCK</div>
              <div class="klc-desc">What you keep in the kitchen<br><b>${invN}</b> ingredients</div>
            </div>
          </div>
          <div class="klc-example">
            <div class="klc-ex-title">Example</div>
            <p>Customer buys <b>1× Biryani parcel</b> → Recipe says “150 g rice + 1 takeaway box + 1 napkin” → those stock lines go down automatically.</p>
            <p class="klc-warn"><i class="fa-solid fa-triangle-exclamation"></i> If a dish has <b>no recipe</b>, selling it does <b>not</b> change stock — food or packaging.</p>
          </div>
          <ol class="klc-steps">
            <li><b>Stock</b> — food (rice, chicken) <b>and</b> packing (boxes, bags, spoons…)</li>
            <li><b>Recipe</b> — for each dish, say which stock items it uses (including packaging)</li>
            <li><b>Sell</b> — POS bill payment then reduces stock for you</li>
          </ol>
        </div>`,
      foot: `
        <button type="button" class="btn btn-ghost" style="flex:1" data-x>Close</button>
        <button type="button" class="btn btn-primary" style="flex:1.4" data-go><i class="fa-solid fa-wand-magic-sparkles"></i> Help me link a dish</button>`,
      onMount(m, close) {
        m.querySelector('[data-x]').onclick = close;
        m.querySelector('[data-go]').onclick = () => {
          close();
          openLinkWizard();
        };
      },
    });
  }

  /**
   * One-screen setup checklist — the main entry for naive users.
   */
  function openSetupChecklist() {
    if (!global.RSModal) {
      toast('Open Inventory → Recipes', 'fa-circle-info');
      return;
    }
    const s = setupStatus();
    function stepRow(n, title, ok, detail, actionLabel, actionKey) {
      return `<div class="klc-check-row ${ok ? 'is-done' : ''}">
        <div class="klc-check-num">${ok ? '<i class="fa-solid fa-check"></i>' : n}</div>
        <div class="klc-check-body">
          <div class="klc-check-title">${title}</div>
          <div class="klc-check-detail">${detail}</div>
        </div>
        ${
          ok
            ? '<span class="klc-check-badge">Done</span>'
            : `<button type="button" class="btn btn-primary btn-sm" data-act="${actionKey}">${actionLabel}</button>`
        }
      </div>`;
    }
    global.RSModal.open({
      title: 'Kitchen setup in 3 easy steps',
      sub: 'Do these once — then sales update stock by themselves',
      icon: 'fa-list-check',
      size: 'md',
      body: `
        <div class="klc-check">
          ${stepRow(
            1,
            'Add your store room (Stock)',
            s.hasStock,
            s.hasStock
              ? `<b>${s.invN}</b> items — food, packaging, disposables…`
              : 'List what you keep: food (rice, oil) <b>and</b> packing (boxes, bags, napkins). Without this, recipes have nothing to use.',
            'Add stock',
            'stock'
          )}
          ${stepRow(
            2,
            'Add dishes to sell (Menu)',
            s.hasMenu,
            s.hasMenu
              ? `<b>${s.total}</b> dishes on the menu`
              : 'Add the dishes customers order (Paneer Tikka, Biryani…).',
            'Open Menu',
            'menu'
          )}
          ${stepRow(
            3,
            'Link each dish to stock (Recipe)',
            s.allLinked,
            s.hasMenu
              ? s.missing
                ? `<b>${s.linked}</b> of <b>${s.total}</b> linked · <b>${s.missing}</b> still open`
                : 'All dishes are linked — stock will move when you sell.'
              : 'After you have dishes, say what each one uses from the store room.',
            s.missing ? 'Help me link' : 'Open helper',
            'link'
          )}
          <div class="klc-check-foot">
            ${progressBarHtml(s.pct)}
            <p class="klc-p" style="margin:10px 0 0">You can leave and come back anytime. Progress is saved.</p>
          </div>
        </div>`,
      foot: `
        <button type="button" class="btn btn-ghost" style="flex:1" data-x>Close</button>
        <button type="button" class="btn btn-ghost" style="flex:1" data-how>Show simply</button>
        <button type="button" class="btn btn-primary" style="flex:1.3" data-start><i class="fa-solid fa-wand-magic-sparkles"></i> ${
          !s.hasStock ? 'Start with stock' : !s.hasMenu ? 'Add a dish' : s.missing ? 'Link next dish' : 'All set'
        }</button>`,
      onMount(m, close) {
        m.querySelector('[data-x]').onclick = close;
        m.querySelector('[data-how]').onclick = () => {
          close();
          openHowItWorks();
        };
        const start = () => {
          close();
          if (!s.hasStock) {
            goInventoryTab('stock');
            setTimeout(() => {
              if (global.RSInventoryUI && RSInventoryUI.openAddStockModal) {
                RSInventoryUI.openAddStockModal({ typeId: 'food' });
              } else {
                const b = document.getElementById('btn-add-ingredient');
                if (b) b.click();
              }
            }, 220);
          } else if (!s.hasMenu) {
            goMenuEditor();
          } else if (s.missing) {
            openLinkWizard();
          } else {
            goInventoryTab('recipes');
          }
        };
        m.querySelector('[data-start]').onclick = start;
        m.querySelectorAll('[data-act]').forEach((btn) => {
          btn.onclick = () => {
            const k = btn.getAttribute('data-act');
            close();
            if (k === 'stock') {
              goInventoryTab('stock');
              setTimeout(() => {
                const b = document.getElementById('btn-add-ingredient');
                if (b) b.click();
              }, 220);
            } else if (k === 'menu') {
              goMenuEditor();
            } else {
              openLinkWizard();
            }
          };
        });
      },
    });
  }

  /**
   * Step-by-step wizard: pick dish → pick stock items + qty → save.
   */
  function openLinkWizard(startDishId) {
    if (!global.RSModal) {
      toast('Please open Inventory → Recipes', 'fa-circle-info');
      return;
    }
    if (!inventory().length) {
      global.RSModal.open({
        title: 'Add stock first',
        sub: 'You need kitchen ingredients before linking recipes',
        icon: 'fa-boxes-stacked',
        size: 'sm',
        body: `<p style="font-size:14px;line-height:1.55;color:var(--text-soft);margin:0">
          Think of <b>Stock</b> as your store room list (rice, oil, chicken…).<br><br>
          Add at least one ingredient, then come back — we will attach it to a dish.
        </p>`,
        foot: `<button type="button" class="btn btn-ghost" style="flex:1" data-x>Later</button>
          <button type="button" class="btn btn-primary" style="flex:1.2" data-stock><i class="fa-solid fa-plus"></i> Go to Stock</button>`,
        onMount(m, close) {
          m.querySelector('[data-x]').onclick = close;
          m.querySelector('[data-stock]').onclick = () => {
            close();
            goInventoryTab('stock');
            setTimeout(() => {
              const btn = document.getElementById('btn-add-ingredient');
              if (btn) btn.click();
            }, 200);
          };
        },
      });
      return;
    }
    if (!menu().length) {
      global.RSModal.open({
        title: 'Add menu dishes first',
        sub: 'You need something to sell before a recipe',
        icon: 'fa-utensils',
        size: 'sm',
        body: `<p style="font-size:14px;line-height:1.55;color:var(--text-soft);margin:0">
          <b>Menu</b> is the list of dishes customers order.<br><br>
          Add items in <b>Menu Editor</b>, then return here to say what each dish uses from stock.
        </p>`,
        foot: `<button type="button" class="btn btn-ghost" style="flex:1" data-x>Later</button>
          <button type="button" class="btn btn-primary" style="flex:1.2" data-menu>Open Menu Editor</button>`,
        onMount(m, close) {
          m.querySelector('[data-x]').onclick = close;
          m.querySelector('[data-menu]').onclick = () => {
            close();
            goMenuEditor();
          };
        },
      });
      return;
    }

    const missing = unlinkedDishes();
    let step = 1;
    let chosen = null;
    let draft = [];

    if (startDishId) {
      chosen = menu().find((m) => String(m.id) === String(startDishId)) || null;
      if (chosen) {
        step = 2;
        draft = (chosen.ingredients || []).map((g) => ({ ...g }));
      }
    }

    function dishListHtml(filter) {
      const q = String(filter || '').toLowerCase();
      const list = (missing.length ? missing : menu()).filter((m) =>
        String(m.name || '')
          .toLowerCase()
          .includes(q)
      );
      if (!list.length) return '<div class="sr-empty" style="padding:20px">No dishes match</div>';
      return list
        .slice(0, 40)
        .map((m) => {
          const has = Array.isArray(m.ingredients) && m.ingredients.length;
          return `<button type="button" class="klc-pick" data-dish="${esc(m.id)}">
            <span class="veg ${m.veg ? '' : 'nonveg'}"></span>
            <span class="klc-pick-t">${esc(m.name)}</span>
            <span class="klc-pick-s">${has ? 'Has recipe' : 'Needs recipe'}</span>
          </button>`;
        })
        .join('');
    }

    function draftHtml() {
      if (!draft.length) {
        return `<div class="sr-empty" style="padding:16px;font-size:13.5px">No stock items yet.<br>Tap a <b>suggestion</b>, <b>copy</b> from another dish, or <b>Add from store room</b>.</div>`;
      }
      return draft
        .map((g, i) => {
          return `<div class="klc-draft-row">
            <span class="klc-draft-name">${esc(pretty(g.name))}</span>
            <label class="klc-qty-lab">How much for <b>1 plate</b>?</label>
            <input type="number" class="form-input" data-qi="${i}" min="0" step="any" value="${esc(g.qty)}" style="width:88px">
            <span class="klc-unit">${esc(g.unit || '')}</span>
            <button type="button" class="icon-act danger" data-di="${i}" title="Remove"><i class="fa-solid fa-trash"></i></button>
          </div>`;
        })
        .join('');
    }

    function suggestionsHtml() {
      if (!chosen) return '';
      const foodSug = suggestIngredients(chosen.name).filter((s) => {
        if (draft.find((d) => d.name === s.name)) return false;
        const inv = inventory().find((i) => i.name === s.name);
        return !inv || !isPackagingLike(inv);
      });
      const packSug = packagingSuggestions(chosen.name).filter((s) => !draft.find((d) => d.name === s.name));
      if (!foodSug.length && !packSug.length) {
        return `<div class="klc-suggest klc-suggest-muted">
          <div class="klc-suggest-title"><i class="fa-solid fa-box"></i> Tip</div>
          <p class="klc-p" style="margin:0">You can also add <b>packaging</b> (boxes, bags, foil) and <b>disposables</b> (napkins, spoons) from the store room — same as food.</p>
        </div>`;
      }
      function chips(list) {
        return list
          .map(
            (s) =>
              `<button type="button" class="klc-chip" data-sug-n="${esc(s.name)}" data-sug-q="${esc(s.qty)}" data-sug-u="${esc(s.unit || '')}" title="${esc(s.why || '')}">
                <i class="fa-solid fa-plus"></i> ${esc(pretty(s.name))}
                <span class="klc-chip-meta">${esc(s.qty)} ${esc(s.unit || '')}</span>
              </button>`
          )
          .join('');
      }
      return `<div class="klc-suggest" id="klc-suggest">
        ${
          foodSug.length
            ? `<div class="klc-suggest-title"><i class="fa-solid fa-carrot"></i> Food suggested for “${esc(chosen.name)}”</div>
        <div class="klc-suggest-chips">${chips(foodSug)}
          <button type="button" class="btn btn-ghost btn-sm" id="klc-add-all-sug">Add all food</button>
        </div>`
            : ''
        }
        ${
          packSug.length
            ? `<div class="klc-suggest-title" style="margin-top:${foodSug.length ? '10' : '0'}px"><i class="fa-solid fa-box"></i> Packaging &amp; disposables</div>
        <div class="klc-suggest-chips">${chips(packSug)}
          <button type="button" class="btn btn-ghost btn-sm" id="klc-add-all-pack">Add all pack</button>
        </div>`
            : ''
        }
      </div>`;
    }

    function copyBarHtml() {
      if (!chosen) return '';
      const sims = similarLinkedDishes(chosen, 5);
      const linkedN = menu().filter((m) => Array.isArray(m.ingredients) && m.ingredients.length && String(m.id) !== String(chosen.id)).length;
      if (!linkedN) return '';
      return `<div class="klc-copy-bar">
        <button type="button" class="btn btn-ghost btn-sm" id="klc-copy-recipe">
          <i class="fa-solid fa-copy"></i> Copy recipe from similar dish
        </button>
        ${
          sims.length
            ? `<span class="klc-copy-hint">e.g. ${esc(sims[0].name)}${sims[1] ? ', ' + esc(sims[1].name) : ''}</span>`
            : ''
        }
      </div>`;
    }

    function bodyForStep() {
      if (step === 1) {
        return `
          <div class="klc-wiz">
            <div class="klc-wiz-step">Step 1 of 3 · Pick a dish</div>
            <p class="klc-p">Which dish should reduce kitchen stock when sold?</p>
            <input class="form-input" id="klc-dish-q" placeholder="Search dish name…" style="margin-bottom:10px">
            <div id="klc-dish-list" class="klc-pick-list">${dishListHtml('')}</div>
          </div>`;
      }
      if (step === 2) {
        return `
          <div class="klc-wiz">
            <div class="klc-wiz-step">Step 2 of 3 · What goes into <b>${esc(chosen.name)}</b></div>
            <p class="klc-p">Add from store room: <b>food</b> and also <b>boxes, bags, napkins</b> if this dish uses them. Adjust qty for <b>1 plate / 1 order</b>.</p>
            ${suggestionsHtml()}
            ${copyBarHtml()}
            <div id="klc-draft">${draftHtml()}</div>
            <button type="button" class="btn btn-ghost btn-block" id="klc-add-ing" style="border-style:dashed;margin-top:10px">
              <i class="fa-solid fa-plus"></i> Add from store room
            </button>
          </div>`;
      }
      const lines = draft
        .filter((g) => Number(g.qty) > 0)
        .map((g) => `• ${pretty(g.name)} — ${g.qty} ${g.unit || ''}`)
        .join('<br>');
      return `
        <div class="klc-wiz">
          <div class="klc-wiz-step">Step 3 of 3 · Confirm</div>
          <p class="klc-p">When someone buys <b>1× ${esc(chosen.name)}</b>, stock will go down by:</p>
          <div class="klc-confirm">${lines || '<i>No quantities set</i>'}</div>
          <p class="klc-p" style="margin-top:12px">You can change this anytime under <b>Inventory → Recipes</b>.</p>
        </div>`;
    }

    function footForStep() {
      if (step === 1) {
        return `<button type="button" class="btn btn-ghost" style="flex:1" data-x>Cancel</button>
          <button type="button" class="btn btn-ghost" style="flex:1" data-how>Explain again</button>`;
      }
      if (step === 2) {
        return `<button type="button" class="btn btn-ghost" style="flex:1" data-back>Back</button>
          <button type="button" class="btn btn-primary" style="flex:1.2" data-next>Next <i class="fa-solid fa-arrow-right"></i></button>`;
      }
      return `<button type="button" class="btn btn-ghost" style="flex:1" data-back>Back</button>
        <button type="button" class="btn btn-primary" style="flex:1.2" data-save><i class="fa-solid fa-circle-check"></i> Save &amp; finish</button>`;
    }

    function openPicker(onPick) {
      const list = inventory();
      let filterMode = 'all'; // all | food | pack
      global.RSModal.open({
        title: 'Pick from store room',
        sub: 'Food · packaging · disposables · anything in stock',
        icon: 'fa-boxes-stacked',
        size: 'sm',
        body: `
          <div class="klc-pick-filters" style="display:flex;gap:6px;flex-wrap:wrap;margin-bottom:10px">
            <button type="button" class="btn btn-ghost btn-sm active" data-pf="all">All</button>
            <button type="button" class="btn btn-ghost btn-sm" data-pf="food">Food</button>
            <button type="button" class="btn btn-ghost btn-sm" data-pf="pack">Packaging</button>
          </div>
          <input class="form-input" id="klc-ing-q" placeholder="Search stock…" style="margin-bottom:10px">
          <div id="klc-ing-box" class="klc-pick-list"></div>`,
        foot: `<button type="button" class="btn btn-ghost" style="flex:1" data-x>Close</button>`,
        onMount(sm, sc) {
          sm.querySelector('[data-x]').onclick = sc;
          const q = sm.querySelector('#klc-ing-q');
          const box = sm.querySelector('#klc-ing-box');
          sm.querySelectorAll('[data-pf]').forEach((btn) => {
            btn.onclick = () => {
              filterMode = btn.getAttribute('data-pf') || 'all';
              sm.querySelectorAll('[data-pf]').forEach((b) => {
                b.classList.toggle('active', b === btn);
                if (b === btn) {
                  b.style.borderColor = 'var(--orange)';
                  b.style.color = 'var(--orange)';
                } else {
                  b.style.borderColor = '';
                  b.style.color = '';
                }
              });
              draw();
            };
          });
          function draw() {
            const t = (q.value || '').toLowerCase();
            let f = list.filter(
              (i) =>
                pretty(i.name).toLowerCase().includes(t) ||
                String(i.name || '')
                  .toLowerCase()
                  .includes(t) ||
                String(i.cat || '')
                  .toLowerCase()
                  .includes(t)
            );
            if (filterMode === 'pack') f = f.filter(isPackagingLike);
            else if (filterMode === 'food') f = f.filter((i) => !isPackagingLike(i));
            box.innerHTML =
              f
                .map(
                  (i) =>
                    `<button type="button" class="klc-pick" data-n="${esc(i.name)}" data-u="${esc(i.unit || 'unit')}">
                  <span class="klc-pick-t">${esc(pretty(i.name))}</span>
                  <span class="klc-pick-s">${esc(i.cat || 'Stock')} · ${Number(i.stock) || 0} ${esc(i.unit || '')}</span>
                </button>`
                )
                .join('') ||
              '<div class="sr-empty" style="padding:16px">No stock items — add food or packaging under Stock levels</div>';
            box.querySelectorAll('[data-n]').forEach((el) => {
              el.onclick = () => {
                onPick({ name: el.getAttribute('data-n'), unit: el.getAttribute('data-u') || 'unit', qty: 1 });
                sc();
              };
            });
          }
          q.addEventListener('input', draw);
          draw();
          q.focus();
        },
      });
    }

    function remount() {
      global.RSModal.open({
        title: step === 1 ? 'Link a dish to stock' : step === 2 ? 'What does this dish use?' : 'Save recipe',
        sub: 'Simple setup · no technical words',
        icon: 'fa-wand-magic-sparkles',
        size: 'md',
        body: bodyForStep(),
        foot: footForStep(),
        onMount(modal, close) {
          const bind = (sel, fn) => {
            const el = modal.querySelector(sel);
            if (el) el.onclick = fn;
          };
          bind('[data-x]', close);
          bind('[data-how]', () => {
            close();
            openHowItWorks();
          });
          bind('[data-back]', () => {
            step = Math.max(1, step - 1);
            if (step === 1) chosen = null;
            close();
            remount();
          });
          bind('[data-next]', () => {
            if (!draft.filter((g) => Number(g.qty) > 0).length) {
              toast('Add at least one stock item with a quantity', 'fa-circle-exclamation');
              return;
            }
            step = 3;
            close();
            remount();
          });
          bind('[data-save]', async () => {
            const clean = draft.filter((g) => g.name && Number(g.qty) > 0);
            if (!clean.length || !chosen) {
              toast('Nothing to save', 'fa-circle-exclamation');
              return;
            }
            chosen.ingredients = clean.map((g) => ({
              name: g.name,
              qty: Number(g.qty) || 0,
              unit: g.unit || 'unit',
            }));
            try {
              if (global.RS && RS.saveOne) await RS.saveOne('menu', chosen);
              else if (global.RS && RS.save) await RS.save('menu');
              toast('Saved! “' + chosen.name + '” will now reduce stock when sold', 'fa-circle-check');
              close();
              document.dispatchEvent(new CustomEvent('rs:render-inventory'));
              if (global.RS && RS.render) RS.render('inventory-tab');
              goInventoryTab('recipes');
              setTimeout(() => {
                const still = unlinkedDishes();
                if (still.length && global.RSModal) {
                  global.RSModal.open({
                    title: 'Great job!',
                    sub: still.length + ' dish' + (still.length === 1 ? '' : 'es') + ' still need a recipe',
                    icon: 'fa-circle-check',
                    size: 'sm',
                    body: `<p style="margin:0;font-size:14px;line-height:1.5;color:var(--text-soft)">Link another dish now, or stop and continue later from <b>Recipes → Needs recipe</b>.</p>`,
                    foot: `<button type="button" class="btn btn-ghost" style="flex:1" data-x>Done for now</button>
                      <button type="button" class="btn btn-primary" style="flex:1.2" data-more>Link another</button>`,
                    onMount(mm, cc) {
                      mm.querySelector('[data-x]').onclick = cc;
                      mm.querySelector('[data-more]').onclick = () => {
                        cc();
                        openLinkWizard();
                      };
                    },
                  });
                }
              }, 400);
            } catch (e) {
              console.warn(e);
              toast('Could not save — try again', 'fa-circle-exclamation');
            }
          });

          if (step === 1) {
            const list = modal.querySelector('#klc-dish-list');
            const q = modal.querySelector('#klc-dish-q');
            const wirePicks = () => {
              list.querySelectorAll('[data-dish]').forEach((btn) => {
                btn.onclick = () => {
                  chosen = menu().find((m) => String(m.id) === String(btn.getAttribute('data-dish')));
                  if (!chosen) return;
                  draft = (chosen.ingredients || []).map((g) => ({ ...g }));
                  step = 2;
                  close();
                  remount();
                };
              });
            };
            if (q) {
              q.oninput = () => {
                list.innerHTML = dishListHtml(q.value);
                wirePicks();
              };
            }
            wirePicks();
          }
          if (step === 2) {
            const draftEl = modal.querySelector('#klc-draft');
            const refreshDraft = () => {
              draftEl.innerHTML = draftHtml();
              draftEl.querySelectorAll('[data-qi]').forEach((inp) => {
                inp.oninput = () => {
                  const i = +inp.getAttribute('data-qi');
                  draft[i].qty = Number(inp.value) || 0;
                };
              });
              draftEl.querySelectorAll('[data-di]').forEach((btn) => {
                btn.onclick = () => {
                  draft.splice(+btn.getAttribute('data-di'), 1);
                  refreshDraft();
                };
              });
            };
            refreshDraft();

            // Smart suggestion chips
            modal.querySelectorAll('[data-sug-n]').forEach((chip) => {
              chip.onclick = () => {
                const name = chip.getAttribute('data-sug-n');
                if (draft.find((g) => g.name === name)) return;
                draft.push({
                  name,
                  qty: Number(chip.getAttribute('data-sug-q')) || 1,
                  unit: chip.getAttribute('data-sug-u') || 'unit',
                });
                close();
                remount();
              };
            });
            const addAll = modal.querySelector('#klc-add-all-sug');
            if (addAll)
              addAll.onclick = () => {
                const sug = suggestIngredients(chosen.name).filter((s) => {
                  const inv = inventory().find((i) => i.name === s.name);
                  return !inv || !isPackagingLike(inv);
                });
                sug.forEach((s) => {
                  if (!draft.find((g) => g.name === s.name)) {
                    draft.push({ name: s.name, qty: s.qty, unit: s.unit });
                  }
                });
                if (!sug.length) toast('No food suggestions match your stock yet', 'fa-circle-info');
                else {
                  toast('Added ' + sug.length + ' food item(s) — check quantities', 'fa-lightbulb');
                  close();
                  remount();
                }
              };
            const addAllPack = modal.querySelector('#klc-add-all-pack');
            if (addAllPack)
              addAllPack.onclick = () => {
                const sug = packagingSuggestions(chosen.name);
                sug.forEach((s) => {
                  if (!draft.find((g) => g.name === s.name)) {
                    draft.push({ name: s.name, qty: s.qty, unit: s.unit });
                  }
                });
                if (!sug.length) toast('Add packaging items under Stock first', 'fa-box');
                else {
                  toast('Added packaging — each sale will use these', 'fa-box');
                  close();
                  remount();
                }
              };

            // Copy recipe from similar
            const copyBtn = modal.querySelector('#klc-copy-recipe');
            if (copyBtn)
              copyBtn.onclick = () => {
                openCopyRecipePicker(chosen, (src) => {
                  if (!src || !Array.isArray(src.ingredients)) return;
                  draft = src.ingredients.map((g) => ({
                    name: g.name,
                    qty: Number(g.qty) || 0,
                    unit: g.unit || 'unit',
                  }));
                  toast('Copied from “' + src.name + '” — adjust if needed', 'fa-copy');
                  close();
                  remount();
                });
              };

            const addBtn = modal.querySelector('#klc-add-ing');
            if (addBtn)
              addBtn.onclick = () => {
                openPicker((item) => {
                  if (!draft.find((g) => g.name === item.name)) draft.push(item);
                  close();
                  remount();
                });
              };
          }
        },
      });
    }

    remount();
  }

  /**
   * Pick a linked dish to copy its recipe from.
   */
  function openCopyRecipePicker(forDish, onPick) {
    if (!global.RSModal) return;
    const list = similarLinkedDishes(forDish, 30);
    const allLinked = menu().filter(
      (m) =>
        String(m.id) !== String(forDish && forDish.id) &&
        Array.isArray(m.ingredients) &&
        m.ingredients.length
    );
    const rows = list.length ? list : allLinked;
    if (!rows.length) {
      toast('No other dish has a recipe yet to copy', 'fa-circle-info');
      return;
    }
    global.RSModal.open({
      title: 'Copy recipe from…',
      sub: forDish ? 'Reuse a similar dish for “' + forDish.name + '”' : 'Pick a dish with a recipe',
      icon: 'fa-copy',
      size: 'sm',
      body: `<input class="form-input" id="klc-copy-q" placeholder="Search dish…" style="margin-bottom:10px">
        <div id="klc-copy-list" class="klc-pick-list"></div>`,
      foot: `<button type="button" class="btn btn-ghost" style="flex:1" data-x>Cancel</button>`,
      onMount(m, close) {
        m.querySelector('[data-x]').onclick = close;
        const q = m.querySelector('#klc-copy-q');
        const box = m.querySelector('#klc-copy-list');
        function draw() {
          const t = (q.value || '').toLowerCase();
          const f = rows.filter((d) => String(d.name || '').toLowerCase().includes(t));
          box.innerHTML =
            f
              .map((d) => {
                const n = (d.ingredients || []).length;
                const preview = (d.ingredients || [])
                  .slice(0, 3)
                  .map((g) => pretty(g.name))
                  .join(', ');
                return `<button type="button" class="klc-pick" data-copy="${esc(d.id)}">
                  <span class="veg ${d.veg ? '' : 'nonveg'}"></span>
                  <span class="klc-pick-t">${esc(d.name)}</span>
                  <span class="klc-pick-s">${n} item${n === 1 ? '' : 's'}${preview ? ' · ' + esc(preview) : ''}</span>
                </button>`;
              })
              .join('') || '<div class="sr-empty" style="padding:16px">No match</div>';
          box.querySelectorAll('[data-copy]').forEach((btn) => {
            btn.onclick = () => {
              const src = menu().find((x) => String(x.id) === String(btn.getAttribute('data-copy')));
              close();
              if (src && onPick) onPick(src);
            };
          });
        }
        q.addEventListener('input', draw);
        draw();
        q.focus();
      },
    });
  }

  /**
   * Sticky coach card HTML for Recipes header area.
   */
  function coachCardHtml() {
    const s = setupStatus();
    if (s.allLinked) {
      return `<div class="klc-card klc-card-ok" id="klc-coach-card">
        <div class="klc-card-top">
          <i class="fa-solid fa-circle-check"></i>
          <div style="flex:1;min-width:0">
            <div class="klc-card-title">Kitchen link is ready</div>
            <div class="klc-card-sub">All ${s.total} dishes have recipes · stock will move when you sell</div>
          </div>
          <button type="button" class="btn btn-ghost btn-sm" id="klc-how">How it works</button>
        </div>
      </div>`;
    }
    return `<div class="klc-card" id="klc-coach-card">
      <div class="klc-card-top">
        <i class="fa-solid fa-link"></i>
        <div style="flex:1;min-width:0">
          <div class="klc-card-title">Make stock update itself when you sell</div>
          <div class="klc-card-sub">
            <b>${s.linked}</b> of <b>${s.total}</b> dishes linked
            ${s.invN ? '' : ' · <span style="color:var(--amber)">add stock first</span>'}
            ${s.missing ? ' · <b>' + s.missing + '</b> still need a recipe' : ''}
          </div>
        </div>
      </div>
      ${progressBarHtml(s.pct)}
      <div class="klc-mini-flow">
        <span><i class="fa-solid fa-utensils"></i> Menu = sell</span>
        <i class="fa-solid fa-arrow-right"></i>
        <span><i class="fa-solid fa-clipboard-list"></i> Recipe = link</span>
        <i class="fa-solid fa-arrow-right"></i>
        <span><i class="fa-solid fa-boxes-stacked"></i> Stock = store room</span>
      </div>
      <div class="klc-card-actions">
        <button type="button" class="btn btn-primary btn-sm" id="klc-start"><i class="fa-solid fa-wand-magic-sparkles"></i> Help me link a dish</button>
        <button type="button" class="btn btn-ghost btn-sm" id="klc-check"><i class="fa-solid fa-list-check"></i> 3-step setup</button>
        <button type="button" class="btn btn-ghost btn-sm" id="klc-how">Show me simply</button>
        ${!s.invN ? '<button type="button" class="btn btn-ghost btn-sm" id="klc-stock"><i class="fa-solid fa-plus"></i> Add stock first</button>' : ''}
      </div>
    </div>`;
  }

  /**
   * Compact banner for Menu Editor / POS / anywhere.
   */
  function miniBannerHtml(opts) {
    opts = opts || {};
    const s = setupStatus();
    if (s.allLinked && !opts.force) return '';
    const place = opts.place || 'here';
    let msg;
    if (!s.hasStock) msg = 'First add store-room items (Stock), then link recipes so sales reduce stock.';
    else if (!s.hasMenu) msg = 'Add dishes on the menu, then link each one to stock.';
    else if (s.missing)
      msg = `<b>${s.missing}</b> dish${s.missing === 1 ? '' : 'es'} not linked yet — selling them will not reduce stock.`;
    else msg = 'Kitchen link is ready.';
    return `<div class="klc-mini-banner" id="${esc(opts.id || 'klc-mini-banner')}">
      <i class="fa-solid fa-link"></i>
      <div class="klc-mini-banner-body">
        <div class="klc-mini-banner-title">Menu · Recipe · Stock</div>
        <div class="klc-mini-banner-msg">${msg}</div>
      </div>
      <div class="klc-mini-banner-actions">
        ${s.missing || !s.hasStock ? `<button type="button" class="btn btn-primary btn-sm" data-klc="start">Help me</button>` : ''}
        <button type="button" class="btn btn-ghost btn-sm" data-klc="check">3 steps</button>
        <button type="button" class="btn btn-ghost btn-sm" data-klc="how" title="Explain">?</button>
      </div>
    </div>`;
  }

  function wireCoachCard(root) {
    const host = root || document;
    const start = host.querySelector('#klc-start');
    const how = host.querySelector('#klc-how');
    const stock = host.querySelector('#klc-stock');
    const check = host.querySelector('#klc-check');
    if (start) start.onclick = () => openLinkWizard();
    if (how) how.onclick = () => openHowItWorks();
    if (check) check.onclick = () => openSetupChecklist();
    if (stock)
      stock.onclick = () => {
        goInventoryTab('stock');
        setTimeout(() => {
          const b = document.getElementById('btn-add-ingredient');
          if (b) b.click();
        }, 200);
      };
    try {
      refreshSetupNav();
    } catch (_) {}
  }

  function wireMiniBanner(root) {
    const host = root || document;
    host.querySelectorAll('[data-klc]').forEach((btn) => {
      if (btn._klcWired) return;
      btn._klcWired = true;
      btn.onclick = (e) => {
        e.preventDefault();
        const k = btn.getAttribute('data-klc');
        if (k === 'start') openLinkWizard();
        else if (k === 'check') openSetupChecklist();
        else if (k === 'how') openHowItWorks();
        else if (k === 'stock') {
          goInventoryTab('stock');
          setTimeout(() => {
            const b = document.getElementById('btn-add-ingredient');
            if (b) b.click();
          }, 200);
        }
      };
    });
  }

  /**
   * Soft first-visit offer — once per browser when setup incomplete.
   */
  function maybeOfferFirstVisit() {
    try {
      if (global.localStorage && localStorage.getItem(LS_FIRST) === '1') return;
      const s = setupStatus();
      if (s.allLinked) return;
      if (!s.hasMenu && !s.hasStock) {
        // brand new — still offer checklist once
      } else if (!s.missing && s.hasStock) {
        return;
      }
      if (!global.RSModal) return;
      if (global.localStorage) localStorage.setItem(LS_FIRST, '1');
      setTimeout(() => {
        if (!global.RSModal) return;
        global.RSModal.open({
          title: 'Quick tip: connect kitchen stock',
          sub: 'Takes a few minutes · works for any staff',
          icon: 'fa-lightbulb',
          size: 'sm',
          body: `<p style="margin:0;font-size:14px;line-height:1.55;color:var(--text-soft)">
            When a customer buys a dish, stock can go down <b>automatically</b> — but only if each dish has a simple <b>recipe</b> (what it uses from the store room).
            <br><br>
            We will walk you through it in plain language. You can skip and come back anytime.
          </p>`,
          foot: `<button type="button" class="btn btn-ghost" style="flex:1" data-x>Not now</button>
            <button type="button" class="btn btn-primary" style="flex:1.3" data-go><i class="fa-solid fa-list-check"></i> Show me the 3 steps</button>`,
          onMount(m, close) {
            m.querySelector('[data-x]').onclick = close;
            m.querySelector('[data-go]').onclick = () => {
              close();
              openSetupChecklist();
            };
          },
        });
      }, 900);
    } catch (_) {}
  }

  /**
   * POS: soft one-time toast when adding an unlinked dish.
   */
  function posUnlinkedHint(dishName) {
    try {
      const key = LS_HINT;
      let n = 0;
      if (global.sessionStorage) {
        n = Number(sessionStorage.getItem(key) || 0) || 0;
        if (n >= 2) return; // max 2 soft hints per session
        sessionStorage.setItem(key, String(n + 1));
      }
      toast(
        (dishName ? '“' + dishName + '”' : 'This dish') + ' has no recipe — sale will not reduce stock',
        'fa-link'
      );
    } catch (_) {}
  }

  /**
   * Sidebar / mobile badge: how many dishes still need a recipe.
   */
  function refreshSetupNav() {
    try {
      const s = setupStatus();
      const badge = document.getElementById('klc-setup-badge');
      const link = document.getElementById('klc-sidebar-setup');
      const mobile = document.getElementById('klc-mobile-setup');
      const show = !s.allLinked;
      if (badge) {
        if (s.missing > 0) {
          badge.style.display = '';
          badge.textContent = String(s.missing);
          badge.title = s.missing + ' dish(es) need a recipe';
        } else if (!s.hasStock || !s.hasMenu) {
          badge.style.display = '';
          badge.textContent = '!';
          badge.title = 'Kitchen setup incomplete';
        } else {
          badge.style.display = 'none';
        }
      }
      if (link) {
        link.classList.toggle('klc-setup-done', !!s.allLinked);
        link.title = s.allLinked
          ? 'Kitchen link ready · Menu · Recipe · Stock'
          : 'Kitchen Setup · connect Menu, Recipe & Stock';
      }
      if (mobile) mobile.style.opacity = s.allLinked ? '0.75' : '1';
      // Hide emphasis when fully done but keep link for "how it works"
    } catch (_) {}
  }

  function wireSetupNav() {
    function openFromNav(e) {
      if (e) {
        e.preventDefault();
        e.stopPropagation();
      }
      openSetupChecklist();
    }
    const link = document.getElementById('klc-sidebar-setup');
    if (link && !link._klcNav) {
      link._klcNav = true;
      link.addEventListener('click', openFromNav, true);
    }
    const mobile = document.getElementById('klc-mobile-setup');
    if (mobile && !mobile._klcNav) {
      mobile._klcNav = true;
      mobile.addEventListener('click', (e) => {
        openFromNav(e);
        const sheet = document.getElementById('mobile-more-sheet');
        if (sheet) sheet.style.display = 'none';
      });
    }
    refreshSetupNav();
  }

  global.RSKitchenLinkCoach = {
    openHowItWorks,
    openLinkWizard,
    openSetupChecklist,
    openCopyRecipePicker,
    coachCardHtml,
    miniBannerHtml,
    wireCoachCard,
    wireMiniBanner,
    wireSetupNav,
    refreshSetupNav,
    suggestIngredients,
    similarLinkedDishes,
    coverage,
    setupStatus,
    goInventoryTab,
    maybeOfferFirstVisit,
    posUnlinkedHint,
  };

  // Soft first visit + nav wiring after app shell is ready
  if (typeof document !== 'undefined') {
    document.addEventListener('DOMContentLoaded', () => {
      setTimeout(() => {
        try {
          wireSetupNav();
          maybeOfferFirstVisit();
        } catch (_) {}
      }, 1800);
      // Re-badge when inventory/menu re-renders
      document.addEventListener('rs:render-inventory', () => {
        try {
          refreshSetupNav();
        } catch (_) {}
      });
    });
    // If script loads after DOMContentLoaded
    if (document.readyState !== 'loading') {
      setTimeout(() => {
        try {
          wireSetupNav();
        } catch (_) {}
      }, 400);
    }
  }
})(typeof window !== 'undefined' ? window : globalThis);
