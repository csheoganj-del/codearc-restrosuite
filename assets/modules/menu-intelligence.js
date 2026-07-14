/* ============================================================
   RestroSuite — Menu intelligence
   Specials · Staples · Add-ons · Popularity sort · Water pairings
   · Custom / off-menu cart lines · Pending recipes
   ============================================================ */
(function (global) {
  'use strict';

  var PENDING_KEY = 'rs_pending_recipes_v1';
  var POP_KEY = 'rs_item_popularity_v1';

  function toast(msg, icon) {
    if (global.RS && typeof RS.toast === 'function') RS.toast(msg, icon);
  }
  function esc(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }
  function getMenu() {
    return (global.RS && Array.isArray(RS.MENU) ? RS.MENU : []) || [];
  }
  function getBills() {
    return (global.RS && Array.isArray(RS.BILLS) ? RS.BILLS : []) || [];
  }
  function rs(n) {
    if (global.RS && typeof RS.rs === 'function') return RS.rs(n);
    return '₹' + (Number(n) || 0).toLocaleString('en-IN');
  }

  /* ---------- Popularity from bills ---------- */
  function rebuildPopularity() {
    var counts = {};
    getBills().forEach(function (b) {
      var items = b.items || b._items || b.lines || [];
      if (!Array.isArray(items)) return;
      items.forEach(function (line) {
        var name = String(line.name || line.item || '').trim();
        if (!name) return;
        var q = Number(line.qty) || 1;
        counts[name] = (counts[name] || 0) + q;
      });
    });
    try {
      localStorage.setItem(POP_KEY, JSON.stringify(counts));
    } catch (_) {}
    // Stamp orderCount onto live menu
    getMenu().forEach(function (m) {
      m.orderCount = counts[m.name] || Number(m.orderCount) || 0;
      if (m.orderCount >= 10) m.bestseller = m.bestseller || true;
    });
    return counts;
  }

  function popularityMap() {
    try {
      var raw = localStorage.getItem(POP_KEY);
      if (raw) return JSON.parse(raw) || {};
    } catch (_) {}
    return rebuildPopularity();
  }

  function sortMenu(items, mode) {
    mode = mode || 'popular';
    var pop = popularityMap();
    var list = (items || []).slice();
    var score = function (m) {
      return Number(m.orderCount) || pop[m.name] || 0;
    };
    list.sort(function (a, b) {
      // Virtual categories always float specials / staples when using popular
      if (mode === 'popular' || mode === 'default') {
        var as = (a.isSpecial ? 1e9 : 0) + (a.bestseller ? 1e6 : 0) + (a.isStaple ? 1e5 : 0) + score(a);
        var bs = (b.isSpecial ? 1e9 : 0) + (b.bestseller ? 1e6 : 0) + (b.isStaple ? 1e5 : 0) + score(b);
        if (bs !== as) return bs - as;
      }
      if (mode === 'name-asc') return String(a.name || '').localeCompare(String(b.name || ''));
      if (mode === 'name-desc') return String(b.name || '').localeCompare(String(a.name || ''));
      if (mode === 'price-asc') return (Number(a.price) || 0) - (Number(b.price) || 0);
      if (mode === 'price-desc') return (Number(b.price) || 0) - (Number(a.price) || 0);
      if (mode === 'veg-first') return (b.veg ? 1 : 0) - (a.veg ? 1 : 0) || score(b) - score(a);
      if (mode === 'nonveg-first') return (a.veg ? 1 : 0) - (b.veg ? 1 : 0) || score(b) - score(a);
      return score(b) - score(a) || String(a.name || '').localeCompare(String(b.name || ''));
    });
    return list;
  }

  function specials() {
    return getMenu().filter(function (m) {
      return m.isSpecial || m.special || String(m.cat || '').toLowerCase() === 'specials';
    });
  }
  function staples() {
    return getMenu().filter(function (m) {
      return m.isStaple || m.staple || /roti|chapati|naan|rice|paratha|kulcha/i.test(String(m.name || ''));
    });
  }

  /* ---------- Water pairing for bread staples ---------- */
  function isBreadStaple(item) {
    if (!item) return false;
    if (item.pairWater === false) return false;
    if (item.pairWater === true) return true;
    var n = String(item.name || '').toLowerCase();
    return /roti|chapati|naan|paratha|kulcha|bhakri|phulka/.test(n);
  }

  function waterOptions() {
    var settings = (global.RS_SETTINGS || {});
    var bottle = Number(settings.set_bottle_water_price);
    if (!Number.isFinite(bottle) || bottle < 0) bottle = 20;
    return [
      { id: 'tap', name: 'Normal water (complimentary)', price: 0, free: true },
      { id: 'bottle', name: 'Bottled water', price: bottle, free: false },
    ];
  }

  async function promptWaterPairing(menuItem) {
    if (!isBreadStaple(menuItem)) return null;
    if (!global.RSModal) return { id: 'tap', name: 'Normal water (complimentary)', price: 0, free: true };
    return new Promise(function (resolve) {
      var opts = waterOptions();
      var body =
        '<p style="font-size:13px;color:var(--text-soft);margin:0 0 12px;line-height:1.45">' +
        'Most guests with <b>' +
        esc(menuItem.name) +
        '</b> take water. Pick one:</p>' +
        '<div style="display:flex;flex-direction:column;gap:8px">' +
        opts
          .map(function (o, i) {
            return (
              '<label style="display:flex;align-items:center;gap:12px;padding:12px 14px;border:1px solid var(--stroke-2);border-radius:12px;cursor:pointer;background:var(--glass)">' +
              '<input type="radio" name="rs-water" value="' +
              o.id +
              '" ' +
              (i === 0 ? 'checked' : '') +
              '>' +
              '<div style="flex:1"><div style="font-weight:700;font-size:14px">' +
              esc(o.name) +
              '</div>' +
              (o.free
                ? '<div style="font-size:12px;color:var(--green)">No charge</div>'
                : '<div style="font-size:12px;color:var(--text-mute)">' + rs(o.price) + '</div>') +
              '</div></label>'
            );
          })
          .join('') +
        '</div>' +
        '<label style="display:flex;align-items:center;gap:8px;margin-top:12px;font-size:12.5px;color:var(--text-soft);cursor:pointer">' +
        '<input type="checkbox" id="rs-water-skip"> Don\'t ask again this session</label>';
      RSModal.open({
        title: 'Water with ' + menuItem.name + '?',
        icon: 'fa-glass-water',
        size: 'sm',
        body: body,
        foot:
          '<button class="btn btn-ghost" style="flex:1" data-x>Skip</button>' +
          '<button class="btn btn-primary" style="flex:1" data-ok><i class="fa-solid fa-check"></i> Add</button>',
        onMount: function (modal, close) {
          modal.querySelector('[data-x]').onclick = function () {
            close();
            resolve(null);
          };
          modal.querySelector('[data-ok]').onclick = function () {
            var id = (modal.querySelector('input[name="rs-water"]:checked') || {}).value || 'tap';
            if (modal.querySelector('#rs-water-skip') && modal.querySelector('#rs-water-skip').checked) {
              try {
                sessionStorage.setItem('rs_skip_water_prompt', '1');
              } catch (_) {}
            }
            close();
            resolve(opts.find(function (o) {
              return o.id === id;
            }) || opts[0]);
          };
        },
      });
    });
  }

  /* ---------- Add-ons picker ---------- */
  function itemAddons(menuItem) {
    if (!menuItem) return [];
    var raw = menuItem.addons || menuItem.customizations || [];
    if (!Array.isArray(raw)) return [];
    return raw
      .map(function (a) {
        return {
          name: String(a.name || a.label || '').trim(),
          price: Number(a.price) || 0,
        };
      })
      .filter(function (a) {
        return a.name;
      });
  }

  async function promptAddons(menuItem) {
    var addons = itemAddons(menuItem);
    if (!addons.length || !global.RSModal) return [];
    return new Promise(function (resolve) {
      var body =
        '<p style="font-size:13px;color:var(--text-soft);margin:0 0 12px">Optional extras for <b>' +
        esc(menuItem.name) +
        '</b></p><div style="display:flex;flex-direction:column;gap:8px">' +
        addons
          .map(function (a, i) {
            return (
              '<label style="display:flex;align-items:center;gap:10px;padding:10px 12px;border:1px solid var(--stroke-2);border-radius:10px;cursor:pointer">' +
              '<input type="checkbox" data-ai="' +
              i +
              '"> <span style="flex:1;font-weight:600">' +
              esc(a.name) +
              '</span> <span style="color:var(--orange);font-weight:700">+' +
              rs(a.price) +
              '</span></label>'
            );
          })
          .join('') +
        '</div>';
      RSModal.open({
        title: 'Add-ons',
        icon: 'fa-plus-circle',
        size: 'sm',
        body: body,
        foot:
          '<button class="btn btn-ghost" style="flex:1" data-x>None</button>' +
          '<button class="btn btn-primary" style="flex:1" data-ok>Add selected</button>',
        onMount: function (modal, close) {
          modal.querySelector('[data-x]').onclick = function () {
            close();
            resolve([]);
          };
          modal.querySelector('[data-ok]').onclick = function () {
            var picked = [];
            modal.querySelectorAll('input[data-ai]:checked').forEach(function (cb) {
              var a = addons[+cb.getAttribute('data-ai')];
              if (a) picked.push(a);
            });
            close();
            resolve(picked);
          };
        },
      });
    });
  }

  /* ---------- Custom / off-menu cart item ---------- */
  function openCustomCartItem(opts) {
    opts = opts || {};
    var presetName = opts.name || '';
    if (!global.RSModal) {
      var n = window.prompt('Item name', presetName);
      if (!n) return;
      var p = parseFloat(window.prompt('Price', '0'));
      if (!(p >= 0)) return;
      pushCustomLine({ name: n.trim(), price: p, recipeNow: false });
      return;
    }
    RSModal.open({
      title: 'Custom item (not on menu)',
      sub: 'Adds to cart instantly · recipe can wait',
      icon: 'fa-pen-to-square',
      size: 'sm',
      body:
        '<div style="display:flex;flex-direction:column;gap:12px">' +
        '<div><label class="fl">Item name</label><input class="form-input" id="ci-name" value="' +
        esc(presetName) +
        '" placeholder="e.g. Special thali guest request"></div>' +
        '<div class="form-grid-2" style="display:grid;grid-template-columns:1fr 1fr;gap:10px">' +
        '<div><label class="fl">Price</label><input class="form-input" id="ci-price" type="number" min="0" step="1" placeholder="150"></div>' +
        '<div><label class="fl">Qty</label><input class="form-input" id="ci-qty" type="number" min="1" value="1"></div>' +
        '</div>' +
        '<div><label class="fl">Recipe</label>' +
        '<select class="form-input" id="ci-recipe">' +
        '<option value="later">Add recipe later (track as pending)</option>' +
        '<option value="now">Define recipe now</option>' +
        '<option value="none">No recipe (service only)</option>' +
        '</select></div>' +
        '<p style="font-size:12px;color:var(--text-soft);margin:0;line-height:1.4">Custom lines print on KOT &amp; bill. Pending recipes appear under Inventory → Recipes.</p>' +
        '</div>',
      foot:
        '<button class="btn btn-ghost" style="flex:1" data-x>Cancel</button>' +
        '<button class="btn btn-primary" style="flex:1" data-ok><i class="fa-solid fa-cart-plus"></i> Add to cart</button>',
      onMount: function (modal, close) {
        modal.querySelector('[data-x]').onclick = close;
        var nameEl = modal.querySelector('#ci-name');
        if (nameEl) nameEl.focus();
        modal.querySelector('[data-ok]').onclick = async function () {
          var name = (modal.querySelector('#ci-name').value || '').trim();
          var price = parseFloat(modal.querySelector('#ci-price').value);
          var qty = Math.max(1, parseInt(modal.querySelector('#ci-qty').value, 10) || 1);
          var recipeMode = modal.querySelector('#ci-recipe').value || 'later';
          if (!name) {
            toast('Enter item name', 'fa-circle-exclamation');
            return;
          }
          if (!(price >= 0) || isNaN(price)) {
            toast('Enter a valid price', 'fa-circle-exclamation');
            return;
          }
          close();
          await pushCustomLine({ name: name, price: price, qty: qty, recipeMode: recipeMode });
        };
      },
    });
  }

  async function pushCustomLine(data) {
    var id = 'custom-' + Date.now();
    var line = {
      id: id,
      name: data.name,
      price: Number(data.price) || 0,
      qty: Number(data.qty) || 1,
      veg: true,
      cat: 'Custom',
      custom: true,
      isCustom: true,
      stock: 'ok',
      ingredients: [],
      note: data.note || 'Off-menu',
    };
    // Inject into cart via POS API
    try {
      if (global.RSPOS && typeof RSPOS.addCustomLine === 'function') {
        RSPOS.addCustomLine(line);
      } else if (global.RSPOS && typeof RSPOS.getCart === 'function' && typeof RSPOS.setCart === 'function') {
        var cart = RSPOS.getCart() || [];
        cart.push(line);
        RSPOS.setCart(cart);
      } else if (global.RS && typeof RS.getCart === 'function') {
        var cart2 = RS.getCart() || [];
        cart2.push(line);
        if (typeof RS.setCart === 'function') RS.setCart(cart2);
      }
    } catch (e) {
      console.warn('[MenuIntel] cart inject failed', e);
    }

    // Optionally save as menu item for future
    if (data.saveToMenu !== false) {
      try {
        var menu = getMenu();
        var rec = {
          id: id,
          name: data.name,
          price: Number(data.price) || 0,
          cat: 'Custom',
          veg: true,
          stock: 'ok',
          ingredients: [],
          bestseller: false,
          isSpecial: false,
          isStaple: false,
          addons: [],
          custom: true,
          recipePending: data.recipeMode === 'later',
        };
        menu.push(rec);
        if (global.RS) RS.MENU = menu;
        if (global.RS && RS.saveOne) await RS.saveOne('menu', rec);
        else if (global.RS_DB) await RS_DB.put('menu', rec.id, rec);
      } catch (e) {
        console.warn('[MenuIntel] save custom menu failed', e);
      }
    }

    if (data.recipeMode === 'later') {
      addPendingRecipe({ menuId: id, name: data.name, reason: 'custom_item' });
      toast(data.name + ' added · recipe pending', 'fa-clock');
    } else if (data.recipeMode === 'now' && global.RS && RS.activateTab) {
      toast(data.name + ' added · open recipe editor', 'fa-flask');
      try {
        RS.activateTab('editor-tab');
        setTimeout(function () {
          if (global.buildFormLoad) global.buildFormLoad(getMenu().find(function (m) { return String(m.id) === String(id); }));
        }, 250);
      } catch (_) {}
    } else {
      toast(data.name + ' added to cart', 'fa-cart-plus');
    }
  }

  /* ---------- Pending recipes queue ---------- */
  function loadPending() {
    try {
      return JSON.parse(localStorage.getItem(PENDING_KEY) || '[]') || [];
    } catch (_) {
      return [];
    }
  }
  function savePending(list) {
    try {
      localStorage.setItem(PENDING_KEY, JSON.stringify(list || []));
    } catch (_) {}
    try {
      document.dispatchEvent(new CustomEvent('rs:pending-recipes', { detail: { count: (list || []).length } }));
    } catch (_) {}
  }
  function addPendingRecipe(row) {
    var list = loadPending();
    list.unshift({
      id: 'pr-' + Date.now(),
      menuId: row.menuId || null,
      name: row.name || 'Unknown',
      reason: row.reason || 'missing_recipe',
      createdAt: new Date().toISOString(),
      status: 'pending',
    });
    savePending(list.slice(0, 200));
  }
  function resolvePending(id) {
    savePending(
      loadPending().map(function (p) {
        if (p.id === id) p.status = 'done';
        return p;
      })
    );
  }
  function listPendingOpen() {
    return loadPending().filter(function (p) {
      return p.status !== 'done';
    });
  }

  function scanMenuForMissingRecipes() {
    getMenu().forEach(function (m) {
      if (m.recipePending) return;
      if (Array.isArray(m.ingredients) && m.ingredients.length) return;
      if (m.custom || m.isCustom) {
        var already = listPendingOpen().some(function (p) {
          return p.menuId === m.id || p.name === m.name;
        });
        if (!already) addPendingRecipe({ menuId: m.id, name: m.name, reason: 'no_recipe' });
      }
    });
  }

  global.RSMenuIntel = {
    rebuildPopularity: rebuildPopularity,
    popularityMap: popularityMap,
    sortMenu: sortMenu,
    specials: specials,
    staples: staples,
    isBreadStaple: isBreadStaple,
    waterOptions: waterOptions,
    promptWaterPairing: promptWaterPairing,
    itemAddons: itemAddons,
    promptAddons: promptAddons,
    openCustomCartItem: openCustomCartItem,
    addPendingRecipe: addPendingRecipe,
    resolvePending: resolvePending,
    listPendingOpen: listPendingOpen,
    scanMenuForMissingRecipes: scanMenuForMissingRecipes,
  };

  function renderPendingRecipesPanel() {
    var host = document.getElementById('inventory-tab') || document.getElementById('editor-tab');
    if (!host) return;
    var open = listPendingOpen();
    var wrap = document.getElementById('rs-pending-recipes');
    if (!open.length) {
      if (wrap) wrap.remove();
      return;
    }
    if (!wrap) {
      wrap = document.createElement('div');
      wrap.id = 'rs-pending-recipes';
      wrap.className = 'panel panel-pad';
      wrap.style.margin = '12px 0';
      host.insertBefore(wrap, host.firstChild);
    }
    wrap.innerHTML =
      '<div class="panel-head" style="display:flex;align-items:center;gap:10px;flex-wrap:wrap">' +
      '<div><h3 style="margin:0">Pending recipes</h3>' +
      '<div style="font-size:12px;color:var(--text-soft)">' +
      open.length +
      ' item(s) need ingredient links (stock will not deduct)</div></div>' +
      '<div class="grow"></div>' +
      '<button type="button" class="btn btn-ghost btn-sm" id="pr-scan">Rescan</button></div>' +
      '<div style="display:flex;flex-direction:column;gap:8px;margin-top:10px">' +
      open
        .slice(0, 12)
        .map(function (p) {
          return (
            '<div style="display:flex;align-items:center;gap:10px;padding:10px 12px;border:1px solid var(--stroke-2);border-radius:10px">' +
            '<div style="flex:1"><b>' +
            esc(p.name) +
            '</b><div style="font-size:11px;color:var(--text-mute)">' +
            esc(p.reason || 'missing_recipe') +
            '</div></div>' +
            '<button type="button" class="btn btn-primary btn-sm pr-go" data-id="' +
            esc(p.id) +
            '" data-name="' +
            esc(p.name) +
            '">Define recipe</button>' +
            '<button type="button" class="btn btn-ghost btn-sm pr-done" data-id="' +
            esc(p.id) +
            '">Done</button></div>'
          );
        })
        .join('') +
      '</div>';
    var scan = wrap.querySelector('#pr-scan');
    if (scan)
      scan.onclick = function () {
        scanMenuForMissingRecipes();
        renderPendingRecipesPanel();
      };
    wrap.querySelectorAll('.pr-done').forEach(function (b) {
      b.onclick = function () {
        resolvePending(b.dataset.id);
        renderPendingRecipesPanel();
      };
    });
    wrap.querySelectorAll('.pr-go').forEach(function (b) {
      b.onclick = function () {
        resolvePending(b.dataset.id);
        if (global.RS && RS.activateTab) RS.activateTab('editor-tab');
        setTimeout(function () {
          var m = getMenu().find(function (x) {
            return x.name === b.dataset.name;
          });
          if (m && global.buildFormLoad) global.buildFormLoad(m);
          else if (m && global.RS && RS.buildFormLoad) RS.buildFormLoad(m);
        }, 300);
        renderPendingRecipesPanel();
      };
    });
  }

  // Rebuild popularity when bills hydrate
  document.addEventListener('rs:ready', function () {
    try {
      rebuildPopularity();
      scanMenuForMissingRecipes();
      renderPendingRecipesPanel();
    } catch (_) {}
  });
  document.addEventListener('rs:pending-recipes', function () {
    try {
      renderPendingRecipesPanel();
    } catch (_) {}
  });

  global.RSMenuIntel.renderPendingRecipesPanel = renderPendingRecipesPanel;
})(typeof window !== 'undefined' ? window : globalThis);
